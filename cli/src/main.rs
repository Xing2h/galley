//! Galley CLI — agent-first interface to Galley Core.
//!
//! B1 M4 ships six **read-only** commands that all open the local
//! SQLite database directly (no daemon yet; B4 introduces the
//! socket-backed transport per refactor invariant B1-I5).
//!
//! Output discipline:
//!   - Success → JSON on stdout. List-returning commands emit
//!     NDJSON (one object per line) so agents can stream-parse.
//!   - Error   → JSON on stdout matching `GalleyError`'s
//!     `{"error": "<category>", "message": "..."}` shape (B4 M6 freeze:
//!     `message` is flat at the top level, matching the socket
//!     transport envelope so SOPs parse one shape across both
//!     transports). **Errors go to stdout, not stderr** — agents read
//!     one stream. stderr is reserved for unrecoverable runtime panics.
//!   - Exit code maps `GalleyError` variants to fixed categories
//!     (see [`run`]) so SOPs can branch without parsing.

use std::collections::BTreeMap;
use std::process::ExitCode;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use clap::{Parser, Subcommand, ValueEnum};
use galley_core_lib::api::{
    ClaimGoalTaskInput, CreateGoalEventInput, CreateGoalProposalInput, CreateGoalTaskInput,
    GalleyApi, GoalBrief, GoalEventBrief, GoalEventType, GoalId, GoalProposalId, GoalStatus,
    GoalStatusSnapshot, GoalTaskBrief, GoalTaskId, GoalTaskStatus, GoalWriteMode, MessageBrief,
    MessageRole, Origin, ProjectBrief, RuntimeKind, SearchScope, SessionBrief, SessionFilter,
    SessionId, SessionStatus, UpdateGoalTaskInput, DEFAULT_GOAL_BUDGET_SECONDS,
    DEFAULT_GOAL_WORKER_LIMIT, GOAL_CONFIRMATION_PHRASE,
};
use galley_core_lib::db::SqliteGalley;
use galley_core_lib::error::GalleyError;
use galley_core_lib::socket_listener::socket_path;
use serde::Serialize;
use serde_json::Value;

const SCHEMA_VERSION: u32 = 1;
const PROJECT_FOLLOW_IDLE_QUIET_WINDOW: Duration = Duration::from_millis(1500);
const GOAL_CONTROLLER_MAX_WAVES: u32 = 50;
const GOAL_WORKER_SIGNAL_GRACE_SECONDS: u64 = 60;
const GOAL_CONTROLLER_MIN_DRAIN_SECONDS: u64 = 300;
const GOAL_CONTROLLER_MAX_DRAIN_SECONDS: u64 = 900;
const GOAL_WORKER_SESSION_ID_PLACEHOLDER: &str = "{{GALLEY_SESSION_ID}}";
const GOAL_SEED_TASK_MARKER: &str = "[galley-seed-tasks:v1]";
const GOAL_MASTER_PLANNING_MARKER: &str = "[galley-master-planning:v1]";
/// Marker that opens a master-authored check report event. The body
/// after it is a free-text P0/P1 issue list the next design round reads
/// as its changelog. Reuses the event stream (no schema/CLI change).
const GOAL_CHECK_REPORT_MARKER: &str = "[galley-check-report]";
const GOAL_CONTROLLER_TASK_SCOPE_PREFIX: &str = "goal-worker-";
const GOAL_MASTER_PLANNING_TIMEOUT_SECONDS: u64 = 180;

#[derive(Parser, Debug)]
#[command(
    name = "galley",
    version,
    about = "Agent-first interface to Galley (the local agent team orchestrator)."
)]
struct Cli {
    /// Pin the schema version the supervisor expects. v0.2 only knows
    /// `1`; mismatch exits 2 with `error: "schema_mismatch"`. Future
    /// binaries that speak multiple schema versions will accept all of
    /// them. Omit to let the binary use its default (currently `1`).
    #[arg(long = "schema", value_name = "N", global = true)]
    schema: Option<u32>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Operations on multiple sessions (list / search).
    #[command(subcommand)]
    Sessions(SessionsCmd),

    /// Operations on a single session (brief / show / follow / write).
    #[command(subcommand)]
    Session(SessionCmd),

    /// Aggregate counts: total / running / waiting_input / errored.
    Status,

    /// Run the partial B1 health probe (SQLite-checkable rows only;
    /// Python-dependent rows surface as `deferred_b4`).
    Health,

    /// Print the CLI + schema version.
    Version,

    /// Project operations (create / list / brief / show / follow / delete). v0.2 has no
    /// reversible "archive" surface — `delete` is destructive (FK SET
    /// NULL detaches child sessions to ungrouped). A future v0.6+ ships
    /// `archive` separately with reversible semantics (sub-plan O2).
    #[command(subcommand)]
    Project(ProjectCmd),

    /// Headless autonomous Goal/Hive operations.
    #[command(subcommand)]
    Goal(GoalCmd),

    /// LLM configuration commands. `llm list` reads the cached
    /// `llm_list` pref that the GUI seeds after a bridge warmup —
    /// requires Galley GUI to have been opened at least once. `llm set`
    /// persists a per-session pick + best-effort tells any live runner.
    #[command(subcommand)]
    Llm(LlmCmd),
}

#[derive(Subcommand, Debug)]
enum ProjectCmd {
    /// Create a project.
    Create {
        /// Project name (will be trimmed; empty → exit 2).
        name: String,
        /// Optional filesystem root path. Historical — currently stored
        /// on the row but no longer injected at runner spawn (see
        /// 2026-05-14 devlog on the rootPath rollback).
        #[arg(long)]
        root_path: Option<String>,
        /// Optional legacy icon metadata. Current GUI renders Phosphor folder icons.
        #[arg(long)]
        icon: Option<String>,
        /// Optional accent color (hex e.g. `#7c84ff`).
        #[arg(long)]
        color: Option<String>,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// List all projects ordered pinned-first then by recency.
    /// Read-only — opens SQLite directly without requiring Galley Core
    /// to be running.
    List,
    /// One-project rollup for supervisor batch orchestration.
    /// Read-only — opens SQLite directly and includes session status
    /// counts plus currently-running sessions.
    Brief {
        /// Project id.
        project_id: String,
        /// Include archived sessions in counts and rollup.
        #[arg(long)]
        all: bool,
    },
    /// Project rollup plus each session's recent transcript tail.
    /// Read-only — useful when a supervisor is preparing a final
    /// batch summary.
    Show {
        /// Project id.
        project_id: String,
        /// Return only the last N messages per session.
        #[arg(long, default_value_t = 20)]
        tail: usize,
        /// Include archived sessions.
        #[arg(long)]
        all: bool,
    },
    /// Follow live sessions inside a project. Emits an initial project
    /// snapshot, then merged live runner events tagged with sessionId,
    /// then a final snapshot when all live subscriptions end.
    Follow {
        /// Project id.
        project_id: String,
        /// Return only the last N messages per session in snapshots.
        #[arg(long, default_value_t = 10)]
        tail: usize,
        /// Include archived sessions in snapshots and subscription attempts.
        #[arg(long)]
        all: bool,
        /// Exit after the project has had no active sessions for a short
        /// quiet window. Useful for supervisor batch jobs where runner
        /// processes may stay alive after a turn completes.
        #[arg(long)]
        until_idle: bool,
        /// Emit one final project snapshot before the stream end frame.
        /// This is especially useful with --until-idle so supervisors can
        /// synthesize without running a separate project show.
        #[arg(long)]
        final_show: bool,
    },
    /// Permanently delete a project. Child sessions auto-detach to
    /// ungrouped (FK SET NULL); the sessions themselves survive.
    /// Response includes `detachedSessions` count + the list of
    /// affected session ids so a supervisor agent can log the side
    /// effect.
    ///
    /// v0.2: this is destructive. v0.6+ will ship a separate
    /// `archive` command with reversible semantics (sub-plan O2).
    Delete {
        /// Project id.
        project_id: String,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum GoalCmd {
    /// Create a pending conversational-confirmation proposal. Does not start work.
    Propose {
        objective: String,
        #[arg(long)]
        project: Option<String>,
        #[arg(long, default_value_t = DEFAULT_GOAL_BUDGET_SECONDS / 60)]
        budget_minutes: u32,
        #[arg(long, default_value_t = DEFAULT_GOAL_WORKER_LIMIT)]
        workers: u32,
        #[arg(long, value_enum, default_value = "current")]
        runtime: RuntimeArg,
        #[arg(long, value_enum, default_value = "autonomous")]
        write_mode: GoalWriteModeArg,
        #[arg(long, default_value_t = 10)]
        expires_minutes: u32,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Start or resume the blocking Goal controller.
    Run {
        /// Existing goal id when used with --resume.
        goal_id: Option<String>,
        #[arg(long)]
        proposal: Option<String>,
        #[arg(long)]
        confirm_token: Option<String>,
        #[arg(long)]
        resume: bool,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Return Goal status, task board, recent events, and project sessions.
    Status { goal_id: String },
    /// Request a graceful stop.
    Stop {
        goal_id: String,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Goal task board commands.
    #[command(subcommand)]
    Task(GoalTaskCmd),
    /// Append-only Goal event stream commands.
    #[command(subcommand)]
    Event(GoalEventCmd),
    /// Deliverable anchor commands (current best result, refined over rounds).
    #[command(subcommand)]
    Deliverable(GoalDeliverableCmd),
}

#[derive(Subcommand, Debug)]
enum GoalDeliverableCmd {
    /// Print the current deliverable anchor (highest version). Empty when none.
    Get { goal_id: String },
    /// Append a new deliverable anchor version (the current best result).
    Set {
        goal_id: String,
        content: String,
        #[arg(long)]
        note: Option<String>,
        #[arg(long)]
        author_session: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum GoalTaskCmd {
    Create {
        goal_id: String,
        title: String,
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        scope: Option<String>,
        #[arg(long)]
        owner_session: Option<String>,
    },
    Claim {
        task_id: String,
        #[arg(long)]
        owner_session: String,
        #[arg(long)]
        scope: Option<String>,
    },
    Update {
        task_id: String,
        #[arg(long, value_enum)]
        status: Option<GoalTaskStatusArg>,
        #[arg(long)]
        owner_session: Option<String>,
        #[arg(long)]
        clear_owner: bool,
        #[arg(long)]
        scope: Option<String>,
        #[arg(long)]
        clear_scope: bool,
        #[arg(long)]
        result_summary: Option<String>,
        #[arg(long)]
        clear_result: bool,
    },
    Complete {
        task_id: String,
        #[arg(long)]
        result_summary: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum GoalEventCmd {
    Post {
        goal_id: String,
        #[arg(long, value_enum)]
        event_type: GoalEventTypeArg,
        body: String,
        #[arg(long)]
        task: Option<String>,
        #[arg(long)]
        author_session: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum LlmCmd {
    /// List LLMs configured in the user's `mykey.py`. Read-only — opens
    /// SQLite directly. Returns the same cached shape the GUI stores after
    /// a bridge warmup. Empty NDJSON when the cache is unwarmed (open the
    /// GUI once to populate).
    List,
    /// Pick the LLM for a session by display name (case-insensitive).
    /// Persists stable `selectedLlmKey` plus the legacy index/display
    /// companion on the session row + best-effort tells the live runner via
    /// `IpcCommand::SetLlm`. The DB write is the source of truth; the
    /// runner dispatch is opportunistic. `dispatch=dispatched` /
    /// `persisted_only` indicates which path ran.
    Set {
        /// Session id.
        session_id: String,
        /// Display name of the LLM as it appears in `galley llm list`
        /// (case-insensitive).
        llm_name: String,
    },
}

#[derive(Subcommand, Debug)]
enum SessionsCmd {
    /// List sessions, ordered pinned first then by recency.
    List {
        /// Runtime scope. Default follows the GUI's current runtime so
        /// agents see the same session set as the human operator.
        #[arg(long, value_enum, default_value = "current")]
        runtime: RuntimeArg,
        /// Filter to one project id.
        #[arg(long)]
        project: Option<String>,
        /// Filter to one session status (idle / running / archived / …).
        #[arg(long)]
        status: Option<String>,
        /// Include only archived sessions.
        #[arg(long)]
        archived: bool,
        /// Include archived + active sessions (overrides --archived).
        #[arg(long)]
        all: bool,
    },
    /// FTS5 trigram search across persisted message bodies.
    Search {
        /// Runtime scope. Default follows the GUI's current runtime so
        /// agents see the same session set as the human operator.
        #[arg(long, value_enum, default_value = "current")]
        runtime: RuntimeArg,
        /// Query string. Returns no hits for <2 chars; LIKE fallback
        /// for 2-char queries; FTS5 phrase match for >=3 chars.
        query: String,
        /// Search archived sessions too (default: active only).
        #[arg(long)]
        all: bool,
    },
}

#[derive(Subcommand, Debug)]
enum SessionCmd {
    /// One-row summary for a session id.
    Brief {
        /// Session id (e.g. `sess_abc…`).
        id: String,
    },
    /// Conversation messages for a session.
    Show {
        /// Session id.
        id: String,
        /// Return only the last N messages instead of the full
        /// transcript. Useful for agents catching up.
        #[arg(long)]
        tail: Option<usize>,
    },
    /// Send a user message into a session (B2 M4). Persists to the
    /// `messages` table with the supplied origin triple + dispatches
    /// to the live runner subprocess (if one is alive). Requires Galley
    /// Core to be running (exit 4 if the socket isn't reachable).
    Send {
        /// Session id.
        id: String,
        /// Message body.
        content: String,
        /// Supervisor label — the agent identity / SOP name (e.g.
        /// "ga-claude-1"). Required for via=supervisor; optional for
        /// via=cli.
        #[arg(long)]
        supervisor: Option<String>,
        /// Free-text reason for the action. Shows up in audit/log views.
        #[arg(long)]
        reason: Option<String>,
    },
    /// Stream live IPC events from a session's runner (B2 M4). NDJSON
    /// on stdout — one event per line. Exits cleanly when the
    /// subprocess terminates (`{"stream":"end",...}`) or the user
    /// sends SIGINT.
    Watch {
        /// Session id.
        id: String,
    },
    /// Read the recent transcript, then follow live runner events if a
    /// runner is available. Unlike `watch`, this command gracefully
    /// ends when there is no live runner.
    Follow {
        /// Session id.
        id: String,
        /// Return only the last N messages in the initial/final snapshots.
        #[arg(long, default_value_t = 20)]
        tail: usize,
    },
    /// Create a new session with a first user message (B4 M1). Atomic:
    /// session row + first message commit together or roll back together.
    /// Returns `{session, message, dispatch}` with `dispatch=dispatched`
    /// after Galley Core starts a runner and sends the first task. Runner
    /// start/send failures exit 5 so callers know delegation did not begin.
    New {
        /// First user message. Doubles as the seed for title derivation
        /// after the bridge finishes the first turn.
        task: String,
        /// Optional project id. Session is detached (ungrouped) if omitted.
        #[arg(long)]
        project: Option<String>,
        /// Optional LLM display name (case-insensitive). Resolved against
        /// the `llm_list` pref cached by the GUI after warmup; if the
        /// cache is empty or the name is unknown, exits 2 (invalid args).
        #[arg(long)]
        llm: Option<String>,
        /// Runtime for the new session. Default follows the GUI's
        /// current runtime; managed/external must be explicit when an
        /// agent intentionally creates work outside the visible mode.
        #[arg(long, value_enum, default_value = "current")]
        runtime: RuntimeArg,
        /// Supervisor label — agent identity / SOP name. Sets origin via
        /// to `supervisor`; omit for via=`cli`.
        #[arg(long)]
        supervisor: Option<String>,
        /// Free-text reason for the action. Surfaces in audit views.
        #[arg(long)]
        reason: Option<String>,
    },
    /// Send a transient "by the way" side question into a running session
    /// (B4 M1). The runner detects the `/btw` prefix and bypasses its
    /// task queue — useful for asking the agent a quick question mid-run
    /// without disturbing the main thread. Not persisted to the messages
    /// table (v0.1 transient policy); requires an alive bridge (exit 5
    /// otherwise).
    Btw {
        /// Session id.
        id: String,
        /// Side question body.
        question: String,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Stop the current turn in a session (B4 M1). Sends `Abort` to the
    /// runner — the agent's loop exits and emits `run_complete` with the
    /// `ABORTED` marker, but the bridge process stays alive so a
    /// subsequent `session send` resumes without paying the respawn cost.
    /// Idempotent: stopping an already-idle session returns
    /// `{dispatch: "already_stopped"}` and exit 0.
    Stop {
        /// Session id.
        id: String,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Archive a session — flips status to `archived` and hides it from
    /// the GUI sidebar's active list. Reversible via `session restore`.
    Archive {
        /// Session id.
        id: String,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Restore (unarchive) a previously archived session. Flips status
    /// from `archived` back to `idle`; no-op if the session wasn't
    /// archived.
    Restore {
        /// Session id.
        id: String,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
    /// Move a session into / out of a project (B4 M1). `--to=<project-id>`
    /// attaches; omit `--to` to detach (move to ungrouped). The session is
    /// the subject of the move — projects don't shuffle, sessions migrate
    /// between them (sub-plan O3 noun-as-subject grammar).
    Move {
        /// Session id.
        id: String,
        /// Target project id. Omit to detach from any project.
        #[arg(long)]
        to: Option<String>,
        #[arg(long)]
        supervisor: Option<String>,
        #[arg(long)]
        reason: Option<String>,
    },
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum RuntimeArg {
    Current,
    Managed,
    External,
    All,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum GoalWriteModeArg {
    Autonomous,
    ReadOnly,
}

impl From<GoalWriteModeArg> for GoalWriteMode {
    fn from(value: GoalWriteModeArg) -> Self {
        match value {
            GoalWriteModeArg::Autonomous => GoalWriteMode::Autonomous,
            GoalWriteModeArg::ReadOnly => GoalWriteMode::ReadOnly,
        }
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum GoalTaskStatusArg {
    Open,
    Claimed,
    Running,
    Completed,
    Blocked,
    Cancelled,
}

impl From<GoalTaskStatusArg> for GoalTaskStatus {
    fn from(value: GoalTaskStatusArg) -> Self {
        match value {
            GoalTaskStatusArg::Open => GoalTaskStatus::Open,
            GoalTaskStatusArg::Claimed => GoalTaskStatus::Claimed,
            GoalTaskStatusArg::Running => GoalTaskStatus::Running,
            GoalTaskStatusArg::Completed => GoalTaskStatus::Completed,
            GoalTaskStatusArg::Blocked => GoalTaskStatus::Blocked,
            GoalTaskStatusArg::Cancelled => GoalTaskStatus::Cancelled,
        }
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum GoalEventTypeArg {
    Plan,
    Claim,
    Progress,
    Result,
    Conflict,
    Synthesis,
    System,
}

impl From<GoalEventTypeArg> for GoalEventType {
    fn from(value: GoalEventTypeArg) -> Self {
        match value {
            GoalEventTypeArg::Plan => GoalEventType::Plan,
            GoalEventTypeArg::Claim => GoalEventType::Claim,
            GoalEventTypeArg::Progress => GoalEventType::Progress,
            GoalEventTypeArg::Result => GoalEventType::Result,
            GoalEventTypeArg::Conflict => GoalEventType::Conflict,
            GoalEventTypeArg::Synthesis => GoalEventType::Synthesis,
            GoalEventTypeArg::System => GoalEventType::System,
        }
    }
}

#[tokio::main]
async fn main() -> ExitCode {
    let cli = Cli::parse();
    // §1.2 schema pin: if the caller pinned --schema=N, verify the binary
    // speaks that schema. v0.2 only knows SCHEMA_VERSION (1); future
    // multi-schema binaries widen this check to a set.
    if let Some(pinned) = cli.schema {
        if pinned != SCHEMA_VERSION {
            let err = GalleyError::InvalidArgs {
                message: format!(
                    "schema_mismatch: client requested schema {pinned}, server speaks {SCHEMA_VERSION}"
                ),
            };
            println!(
                "{}",
                serde_json::to_string(&err).expect("serialize GalleyError")
            );
            return ExitCode::from(exit_code_for(&err));
        }
    }
    match run(cli).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            // Error → JSON on stdout (agents read one stream).
            let json = serde_json::to_string(&e).unwrap_or_else(|_| {
                let escaped = e.to_string().replace('\\', "\\\\").replace('"', "\\\"");
                format!("{{\"error\":\"internal\",\"message\":\"{escaped}\"}}")
            });
            println!("{json}");
            ExitCode::from(exit_code_for(&e))
        }
    }
}

/// Map `GalleyError` variants to stable exit code categories. SOPs can
/// branch on these without parsing the error JSON.
fn exit_code_for(e: &GalleyError) -> u8 {
    match e {
        GalleyError::NotFound { .. } => 3,
        GalleyError::InvalidArgs { .. } => 2,
        GalleyError::DbUnavailable { .. } => 4,
        GalleyError::RunnerError { .. } => 5,
        GalleyError::Internal { .. } => 1,
    }
}

async fn run(cli: Cli) -> Result<(), GalleyError> {
    match cli.command {
        Command::Sessions(SessionsCmd::List {
            runtime,
            project,
            status,
            archived,
            all,
        }) => {
            let galley = SqliteGalley::open().await?;
            let archived_flag = if all {
                None
            } else if archived {
                Some(true)
            } else {
                Some(false)
            };
            let filter = SessionFilter {
                project_id: project,
                status: status.as_deref().map(parse_status_arg).transpose()?,
                archived: archived_flag,
                runtime_kind: runtime_filter(&galley, runtime).await?,
            };
            let rows = galley.list_sessions(filter).await?;
            // NDJSON — one object per line, so agents can stream-parse.
            for row in rows {
                emit_json(&row)?;
            }
            Ok(())
        }
        Command::Sessions(SessionsCmd::Search {
            runtime,
            query,
            all,
        }) => {
            let galley = SqliteGalley::open().await?;
            let scope = if all {
                SearchScope::All
            } else {
                SearchScope::Active
            };
            let runtime_kind = runtime_filter(&galley, runtime).await?;
            let hits = galley.search_messages(query, scope, runtime_kind).await?;
            for hit in hits {
                emit_json(&hit)?;
            }
            Ok(())
        }
        Command::Session(SessionCmd::Brief { id }) => {
            let galley = SqliteGalley::open().await?;
            let brief = galley.session_brief(SessionId(id)).await?;
            emit_json(&brief)?;
            Ok(())
        }
        Command::Session(SessionCmd::Show { id, tail }) => {
            let galley = SqliteGalley::open().await?;
            let msgs = galley.session_messages(SessionId(id), tail).await?;
            for m in msgs {
                emit_json(&m)?;
            }
            Ok(())
        }
        Command::Session(SessionCmd::Send {
            id,
            content,
            supervisor,
            reason,
        }) => session_send(id, content, supervisor, reason).await,
        Command::Session(SessionCmd::Watch { id }) => session_watch(id).await,
        Command::Session(SessionCmd::Follow { id, tail }) => session_follow(id, tail).await,
        Command::Session(SessionCmd::New {
            task,
            project,
            llm,
            runtime,
            supervisor,
            reason,
        }) => session_new(task, project, llm, runtime, supervisor, reason).await,
        Command::Session(SessionCmd::Btw {
            id,
            question,
            supervisor,
            reason,
        }) => session_btw(id, question, supervisor, reason).await,
        Command::Session(SessionCmd::Stop {
            id,
            supervisor,
            reason,
        }) => session_stop(id, supervisor, reason).await,
        Command::Session(SessionCmd::Archive {
            id,
            supervisor,
            reason,
        }) => session_archive(id, supervisor, reason).await,
        Command::Session(SessionCmd::Restore {
            id,
            supervisor,
            reason,
        }) => session_restore(id, supervisor, reason).await,
        Command::Session(SessionCmd::Move {
            id,
            to,
            supervisor,
            reason,
        }) => session_move(id, to, supervisor, reason).await,
        Command::Status => {
            let galley = SqliteGalley::open().await?;
            let s = galley.status().await?;
            emit_json(&s)?;
            Ok(())
        }
        Command::Health => {
            let galley = SqliteGalley::open().await?;
            let report = galley.health().await?;
            emit_json(&report)?;
            Ok(())
        }
        Command::Version => {
            #[derive(serde::Serialize)]
            #[serde(rename_all = "camelCase")]
            struct VersionPayload<'a> {
                galley_version: &'a str,
                schema_version: u32,
            }
            emit_json(&VersionPayload {
                galley_version: env!("CARGO_PKG_VERSION"),
                schema_version: SCHEMA_VERSION,
            })?;
            Ok(())
        }
        Command::Project(ProjectCmd::Create {
            name,
            root_path,
            icon,
            color,
            supervisor,
            reason,
        }) => project_create(name, root_path, icon, color, supervisor, reason).await,
        Command::Project(ProjectCmd::List) => project_list().await,
        Command::Project(ProjectCmd::Brief { project_id, all }) => {
            project_brief(project_id, all).await
        }
        Command::Project(ProjectCmd::Show {
            project_id,
            tail,
            all,
        }) => project_show(project_id, tail, all).await,
        Command::Project(ProjectCmd::Follow {
            project_id,
            tail,
            all,
            until_idle,
            final_show,
        }) => project_follow(project_id, tail, all, until_idle, final_show).await,
        Command::Project(ProjectCmd::Delete {
            project_id,
            supervisor,
            reason,
        }) => project_delete(project_id, supervisor, reason).await,
        Command::Goal(GoalCmd::Propose {
            objective,
            project,
            budget_minutes,
            workers,
            runtime,
            write_mode,
            expires_minutes,
            supervisor,
            reason,
        }) => {
            goal_propose(
                objective,
                project,
                budget_minutes,
                workers,
                runtime,
                write_mode,
                expires_minutes,
                supervisor,
                reason,
            )
            .await
        }
        Command::Goal(GoalCmd::Run {
            goal_id,
            proposal,
            confirm_token,
            resume,
            supervisor,
            reason,
        }) => goal_run(goal_id, proposal, confirm_token, resume, supervisor, reason).await,
        Command::Goal(GoalCmd::Status { goal_id }) => goal_status(goal_id).await,
        Command::Goal(GoalCmd::Stop {
            goal_id,
            supervisor,
            reason,
        }) => goal_stop(goal_id, supervisor, reason).await,
        Command::Goal(GoalCmd::Task(cmd)) => goal_task(cmd).await,
        Command::Goal(GoalCmd::Event(cmd)) => goal_event(cmd).await,
        Command::Goal(GoalCmd::Deliverable(cmd)) => goal_deliverable(cmd).await,
        Command::Llm(LlmCmd::List) => llm_list().await,
        Command::Llm(LlmCmd::Set {
            session_id,
            llm_name,
        }) => llm_set(session_id, llm_name).await,
    }
}

fn parse_status_arg(s: &str) -> Result<SessionStatus, GalleyError> {
    Ok(match s {
        "idle" => SessionStatus::Idle,
        "connecting" => SessionStatus::Connecting,
        "running" => SessionStatus::Running,
        "waiting_approval" => SessionStatus::WaitingApproval,
        "error" => SessionStatus::Error,
        "completed" => SessionStatus::Completed,
        "cancelled" => SessionStatus::Cancelled,
        "archived" => SessionStatus::Archived,
        other => {
            return Err(GalleyError::InvalidArgs {
                message: format!(
                    "unknown --status `{other}`. Allowed: idle, connecting, running, \
                     waiting_approval, error, completed, cancelled, archived"
                ),
            })
        }
    })
}

async fn runtime_filter(
    galley: &SqliteGalley,
    runtime: RuntimeArg,
) -> Result<Option<RuntimeKind>, GalleyError> {
    Ok(match runtime {
        RuntimeArg::Current => Some(galley.active_runtime_kind().await?),
        RuntimeArg::Managed => Some(RuntimeKind::Managed),
        RuntimeArg::External => Some(RuntimeKind::External),
        RuntimeArg::All => None,
    })
}

fn runtime_arg_for_session_new(runtime: RuntimeArg) -> Result<Option<RuntimeKind>, GalleyError> {
    match runtime {
        RuntimeArg::Current => Ok(None),
        RuntimeArg::Managed => Ok(Some(RuntimeKind::Managed)),
        RuntimeArg::External => Ok(Some(RuntimeKind::External)),
        RuntimeArg::All => Err(GalleyError::InvalidArgs {
            message: "session new: --runtime all is only valid for list commands".into(),
        }),
    }
}

async fn runtime_kind_for_goal(
    galley: &SqliteGalley,
    runtime: RuntimeArg,
) -> Result<RuntimeKind, GalleyError> {
    match runtime {
        RuntimeArg::Current => galley.active_runtime_kind().await,
        RuntimeArg::Managed => Ok(RuntimeKind::Managed),
        RuntimeArg::External => Ok(RuntimeKind::External),
        RuntimeArg::All => Err(GalleyError::InvalidArgs {
            message: "goal: --runtime all is not valid".into(),
        }),
    }
}

fn cli_origin(supervisor: Option<String>, reason: Option<String>) -> Origin {
    Origin::cli(supervisor, reason)
}

fn emit_json<T: serde::Serialize>(value: &T) -> Result<(), GalleyError> {
    let s = serde_json::to_string(value).map_err(|e| GalleyError::Internal {
        message: format!("serialize output: {e}"),
    })?;
    println!("{s}");
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionSnapshotPayload {
    schema_version: u32,
    stream: &'static str,
    phase: &'static str,
    session: SessionBrief,
    messages: Vec<MessageBrief>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionEventPayload {
    schema_version: u32,
    stream: &'static str,
    session_id: String,
    data: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamEndPayload<'a> {
    schema_version: u32,
    stream: &'static str,
    reason: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRollupPayload {
    schema_version: u32,
    project: ProjectBrief,
    session_count: usize,
    status_counts: BTreeMap<String, usize>,
    running_sessions: Vec<SessionBrief>,
    last_activity_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSessionDetail {
    session: SessionBrief,
    messages: Vec<MessageBrief>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectShowPayload {
    schema_version: u32,
    project: ProjectBrief,
    session_count: usize,
    status_counts: BTreeMap<String, usize>,
    sessions: Vec<ProjectSessionDetail>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFollowState {
    mode: &'static str,
    state: &'static str,
    watched_sessions: usize,
    active_status_sessions: usize,
    idle_status_sessions: usize,
    note: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSnapshotPayload {
    schema_version: u32,
    stream: &'static str,
    phase: &'static str,
    project: ProjectBrief,
    session_count: usize,
    status_counts: BTreeMap<String, usize>,
    sessions: Vec<ProjectSessionDetail>,
    #[serde(skip_serializing_if = "Option::is_none")]
    follow_state: Option<ProjectFollowState>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectEventPayload {
    schema_version: u32,
    stream: &'static str,
    session_id: String,
    data: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectSessionEndPayload {
    schema_version: u32,
    stream: &'static str,
    session_id: String,
    reason: String,
}

async fn session_snapshot_payload(
    galley: &SqliteGalley,
    id: &str,
    phase: &'static str,
    tail: usize,
) -> Result<SessionSnapshotPayload, GalleyError> {
    let session_id = SessionId(id.to_string());
    let session = galley.session_brief(session_id.clone()).await?;
    let messages = galley.session_messages(session_id, Some(tail)).await?;
    Ok(SessionSnapshotPayload {
        schema_version: SCHEMA_VERSION,
        stream: "snapshot",
        phase,
        session,
        messages,
    })
}

async fn find_project(
    galley: &SqliteGalley,
    project_id: &str,
) -> Result<ProjectBrief, GalleyError> {
    galley
        .list_projects()
        .await?
        .into_iter()
        .find(|p| p.id.as_str() == project_id)
        .ok_or_else(|| GalleyError::NotFound {
            message: format!("project {project_id} not found"),
        })
}

async fn project_sessions(
    galley: &SqliteGalley,
    project_id: &str,
    all: bool,
) -> Result<Vec<SessionBrief>, GalleyError> {
    galley
        .list_sessions(SessionFilter {
            project_id: Some(project_id.to_string()),
            status: None,
            archived: if all { None } else { Some(false) },
            runtime_kind: None,
        })
        .await
}

fn status_key(status: SessionStatus) -> &'static str {
    match status {
        SessionStatus::Idle => "idle",
        SessionStatus::Connecting => "connecting",
        SessionStatus::Running => "running",
        SessionStatus::WaitingApproval => "waiting_approval",
        SessionStatus::Error => "error",
        SessionStatus::Completed => "completed",
        SessionStatus::Cancelled => "cancelled",
        SessionStatus::Archived => "archived",
    }
}

fn status_counts(sessions: &[SessionBrief]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for s in sessions {
        *counts.entry(status_key(s.status).to_string()).or_insert(0) += 1;
    }
    counts
}

fn is_live_candidate(status: SessionStatus) -> bool {
    matches!(
        status,
        SessionStatus::Connecting | SessionStatus::Running | SessionStatus::WaitingApproval
    )
}

fn project_follow_state(
    mode: &'static str,
    sessions: &[ProjectSessionDetail],
) -> ProjectFollowState {
    let active_status_sessions = sessions
        .iter()
        .filter(|detail| is_live_candidate(detail.session.status))
        .count();
    let idle_status_sessions = sessions
        .iter()
        .filter(|detail| detail.session.status == SessionStatus::Idle)
        .count();
    let (state, note) = if sessions.is_empty() {
        ("empty_project", "project has no sessions to follow")
    } else if active_status_sessions == 0 {
        (
            "checking_live_events",
            "no session is marked active yet; following all project sessions before declaring the batch idle",
        )
    } else {
        (
            "active_status_sessions",
            "one or more sessions are marked active; following project live events",
        )
    };
    ProjectFollowState {
        mode,
        state,
        watched_sessions: sessions.len(),
        active_status_sessions,
        idle_status_sessions,
        note,
    }
}

async fn project_has_active_sessions(project_id: &str, all: bool) -> Result<bool, GalleyError> {
    let galley = SqliteGalley::open().await?;
    let sessions = project_sessions(&galley, project_id, all).await?;
    Ok(sessions
        .iter()
        .any(|session| is_live_candidate(session.status)))
}

async fn project_rollup_payload(
    galley: &SqliteGalley,
    project_id: &str,
    all: bool,
) -> Result<ProjectRollupPayload, GalleyError> {
    let project = find_project(galley, project_id).await?;
    let sessions = project_sessions(galley, project_id, all).await?;
    let running_sessions = sessions
        .iter()
        .filter(|s| s.status == SessionStatus::Running)
        .cloned()
        .collect::<Vec<_>>();
    Ok(ProjectRollupPayload {
        schema_version: SCHEMA_VERSION,
        last_activity_at: project.last_activity_at.clone(),
        project,
        session_count: sessions.len(),
        status_counts: status_counts(&sessions),
        running_sessions,
    })
}

async fn project_session_details(
    galley: &SqliteGalley,
    sessions: &[SessionBrief],
    tail: usize,
) -> Result<Vec<ProjectSessionDetail>, GalleyError> {
    let mut details = Vec::with_capacity(sessions.len());
    for session in sessions {
        let messages = galley
            .session_messages(session.id.clone(), Some(tail))
            .await?;
        details.push(ProjectSessionDetail {
            session: session.clone(),
            messages,
        });
    }
    Ok(details)
}

async fn project_show_payload(
    galley: &SqliteGalley,
    project_id: &str,
    tail: usize,
    all: bool,
) -> Result<ProjectShowPayload, GalleyError> {
    let project = find_project(galley, project_id).await?;
    let sessions = project_sessions(galley, project_id, all).await?;
    let status_counts = status_counts(&sessions);
    let session_count = sessions.len();
    let details = project_session_details(galley, &sessions, tail).await?;
    Ok(ProjectShowPayload {
        schema_version: SCHEMA_VERSION,
        project,
        session_count,
        status_counts,
        sessions: details,
    })
}

async fn project_snapshot_payload(
    galley: &SqliteGalley,
    project_id: &str,
    phase: &'static str,
    tail: usize,
    all: bool,
) -> Result<ProjectSnapshotPayload, GalleyError> {
    let show = project_show_payload(galley, project_id, tail, all).await?;
    Ok(ProjectSnapshotPayload {
        schema_version: SCHEMA_VERSION,
        stream: "snapshot",
        phase,
        project: show.project,
        session_count: show.session_count,
        status_counts: show.status_counts,
        sessions: show.sessions,
        follow_state: None,
    })
}

// ---- socket transport helpers (B2 M4) ----

/// One round-trip request → response over the Unix socket / Windows
/// named pipe. Maps connect errors to `DbUnavailable` (exit 4) per the
/// CLI exit-code contract.
#[cfg(unix)]
async fn socket_send_recv(req: serde_json::Value) -> Result<String, GalleyError> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::UnixStream;
    let path = socket_path();
    let stream = UnixStream::connect(&path)
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("Galley Core not running (socket {}: {})", path.display(), e),
        })?;
    let (read_half, mut write_half) = stream.into_split();
    let line = serde_json::to_string(&req).unwrap();
    write_half
        .write_all(line.as_bytes())
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("socket write: {e}"),
        })?;
    write_half
        .write_all(b"\n")
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("socket write: {e}"),
        })?;
    write_half
        .flush()
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("socket flush: {e}"),
        })?;
    let mut lines = BufReader::new(read_half).lines();
    let resp = lines
        .next_line()
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("socket read: {e}"),
        })?
        .ok_or_else(|| GalleyError::DbUnavailable {
            message: "socket EOF before response".into(),
        })?;
    Ok(resp)
}

#[cfg(windows)]
async fn socket_send_recv(req: serde_json::Value) -> Result<String, GalleyError> {
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::windows::named_pipe::ClientOptions;
    let path = socket_path();
    let path_str = path.to_str().ok_or_else(|| GalleyError::Internal {
        message: "named pipe path not UTF-8".into(),
    })?;
    let stream = ClientOptions::new()
        .open(path_str)
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("Galley Core not running (pipe {}: {})", path_str, e),
        })?;
    let (read_half, mut write_half) = tokio::io::split(stream);
    let line = serde_json::to_string(&req).unwrap();
    write_half
        .write_all(line.as_bytes())
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("pipe write: {e}"),
        })?;
    write_half
        .write_all(b"\n")
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("pipe write: {e}"),
        })?;
    write_half
        .flush()
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("pipe flush: {e}"),
        })?;
    let mut lines = BufReader::new(read_half).lines();
    let resp = lines
        .next_line()
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("pipe read: {e}"),
        })?
        .ok_or_else(|| GalleyError::DbUnavailable {
            message: "pipe EOF before response".into(),
        })?;
    Ok(resp)
}

type WatchLines =
    tokio::io::Lines<tokio::io::BufReader<Box<dyn tokio::io::AsyncRead + Unpin + Send>>>;

#[derive(Debug)]
enum WatchFrame {
    Event(Value),
    End(String),
}

async fn open_watch_lines(id: &str) -> Result<WatchLines, GalleyError> {
    use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
    let req = serde_json::json!({
        "command": "session.watch",
        "args": { "sessionId": id },
        "schemaVersion": SCHEMA_VERSION,
    });

    #[cfg(unix)]
    let (read_half, mut write_half): (
        Box<dyn AsyncRead + Unpin + Send>,
        Box<dyn AsyncWrite + Unpin + Send>,
    ) = {
        use tokio::net::UnixStream;
        let path = socket_path();
        let stream = UnixStream::connect(&path)
            .await
            .map_err(|e| GalleyError::DbUnavailable {
                message: format!("Galley Core not running (socket {}: {})", path.display(), e),
            })?;
        let (read_half, write_half) = stream.into_split();
        (Box::new(read_half), Box::new(write_half))
    };
    #[cfg(windows)]
    let (read_half, mut write_half): (
        Box<dyn AsyncRead + Unpin + Send>,
        Box<dyn AsyncWrite + Unpin + Send>,
    ) = {
        use tokio::net::windows::named_pipe::ClientOptions;
        let path = socket_path();
        let path_str = path.to_str().ok_or_else(|| GalleyError::Internal {
            message: "named pipe path not UTF-8".into(),
        })?;
        let stream =
            ClientOptions::new()
                .open(path_str)
                .map_err(|e| GalleyError::DbUnavailable {
                    message: format!("Galley Core not running (pipe {}: {})", path_str, e),
                })?;
        let (read_half, write_half) = tokio::io::split(stream);
        (Box::new(read_half), Box::new(write_half))
    };

    let line = serde_json::to_string(&req).unwrap();
    write_half
        .write_all(line.as_bytes())
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("watch write: {e}"),
        })?;
    write_half
        .write_all(b"\n")
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("watch write: {e}"),
        })?;
    write_half
        .flush()
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("watch flush: {e}"),
        })?;

    Ok(BufReader::new(read_half).lines())
}

async fn read_watch_frame(lines: &mut WatchLines) -> Result<Option<WatchFrame>, GalleyError> {
    let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("watch read: {e}"),
        })?
    else {
        return Ok(None);
    };

    let parsed: Value = serde_json::from_str(&line).map_err(|e| GalleyError::Internal {
        message: format!("malformed watch frame: {e}"),
    })?;
    if parsed["ok"] == Value::Bool(false) {
        let tag = parsed["error"].as_str().unwrap_or("internal");
        let msg = parsed["message"].as_str().unwrap_or("").to_string();
        return Err(map_error_tag(tag, msg));
    }
    if parsed["stream"] == "end" {
        let reason = parsed["reason"]
            .as_str()
            .unwrap_or("subprocess_exited")
            .to_string();
        return Ok(Some(WatchFrame::End(reason)));
    }
    if parsed["stream"] == "event" {
        return Ok(Some(WatchFrame::Event(
            parsed.get("data").cloned().unwrap_or(Value::Null),
        )));
    }
    Ok(Some(WatchFrame::Event(parsed)))
}

async fn session_send(
    id: String,
    content: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let result = session_send_value(id, content, supervisor, reason).await?;
    println!("{result}");
    Ok(())
}

async fn session_send_value(
    id: String,
    content: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, GalleyError> {
    let req = serde_json::json!({
        "command": "session.send",
        "args": {
            "sessionId": id,
            "content": content,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    let resp_line = socket_send_recv(req).await?;
    let parsed: serde_json::Value =
        serde_json::from_str(&resp_line).map_err(|e| GalleyError::Internal {
            message: format!("malformed socket response: {e}"),
        })?;
    if parsed["ok"] == serde_json::Value::Bool(true) {
        Ok(parsed["result"].clone())
    } else {
        let tag = parsed["error"].as_str().unwrap_or("internal");
        let msg = parsed["message"].as_str().unwrap_or("").to_string();
        Err(map_error_tag(tag, msg))
    }
}

async fn session_watch(id: String) -> Result<(), GalleyError> {
    let mut lines = open_watch_lines(&id).await?;
    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|e| GalleyError::DbUnavailable {
            message: format!("watch read: {e}"),
        })?
    {
        let parsed: serde_json::Value =
            serde_json::from_str(&line).unwrap_or(serde_json::Value::Null);
        if parsed["ok"] == serde_json::Value::Bool(false) {
            let tag = parsed["error"].as_str().unwrap_or("internal");
            let msg = parsed["message"].as_str().unwrap_or("").to_string();
            return Err(map_error_tag(tag, msg));
        }
        // Print stream frames as-is; agents stream-parse the NDJSON. Initial
        // error envelopes are mapped above so CLI errors keep one shape.
        println!("{line}");
        if parsed["stream"] == "end" {
            break;
        }
    }
    Ok(())
}

async fn session_follow(id: String, tail: usize) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    emit_json(&session_snapshot_payload(&galley, &id, "initial", tail).await?)?;

    let mut lines = match open_watch_lines(&id).await {
        Ok(lines) => lines,
        Err(GalleyError::DbUnavailable { .. }) => {
            emit_json(&StreamEndPayload {
                schema_version: SCHEMA_VERSION,
                stream: "end",
                reason: "core_unavailable",
            })?;
            return Ok(());
        }
        Err(e) => return Err(e),
    };

    loop {
        match read_watch_frame(&mut lines).await {
            Ok(Some(WatchFrame::Event(data))) => emit_json(&SessionEventPayload {
                schema_version: SCHEMA_VERSION,
                stream: "event",
                session_id: id.clone(),
                data,
            })?,
            Ok(Some(WatchFrame::End(reason))) => {
                let galley = SqliteGalley::open().await?;
                emit_json(&session_snapshot_payload(&galley, &id, "final", tail).await?)?;
                emit_json(&StreamEndPayload {
                    schema_version: SCHEMA_VERSION,
                    stream: "end",
                    reason: &reason,
                })?;
                return Ok(());
            }
            Ok(None) => {
                let galley = SqliteGalley::open().await?;
                emit_json(&session_snapshot_payload(&galley, &id, "final", tail).await?)?;
                emit_json(&StreamEndPayload {
                    schema_version: SCHEMA_VERSION,
                    stream: "end",
                    reason: "socket_closed",
                })?;
                return Ok(());
            }
            Err(GalleyError::NotFound { .. }) => {
                emit_json(&StreamEndPayload {
                    schema_version: SCHEMA_VERSION,
                    stream: "end",
                    reason: "not_live",
                })?;
                return Ok(());
            }
            Err(e) => return Err(e),
        }
    }
}

/// Shared socket round-trip for the unary write commands (`session.new`,
/// `session.btw`, `session.stop`, `session.archive`, `session.restore`,
/// `session.move`). All return JSON-shaped success payloads, so we just
/// pass the `result` field through to stdout.
async fn unary_command(req: serde_json::Value) -> Result<(), GalleyError> {
    let result = unary_command_value(req).await?;
    println!("{result}");
    Ok(())
}

async fn unary_command_value(req: serde_json::Value) -> Result<serde_json::Value, GalleyError> {
    let resp_line = socket_send_recv(req).await?;
    let parsed: serde_json::Value =
        serde_json::from_str(&resp_line).map_err(|e| GalleyError::Internal {
            message: format!("malformed socket response: {e}"),
        })?;
    if parsed["ok"] == serde_json::Value::Bool(true) {
        Ok(parsed["result"].clone())
    } else {
        let tag = parsed["error"].as_str().unwrap_or("internal");
        let msg = parsed["message"].as_str().unwrap_or("").to_string();
        Err(map_error_tag(tag, msg))
    }
}

async fn session_new(
    task: String,
    project: Option<String>,
    llm: Option<String>,
    runtime: RuntimeArg,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let runtime_kind = runtime_arg_for_session_new(runtime)?;
    let req = serde_json::json!({
        "command": "session.new",
        "args": {
            "task": task,
            "projectId": project,
            "llmName": llm,
            "runtimeKind": runtime_kind,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

async fn session_new_goal_worker_value(
    task_template: String,
    project: Option<String>,
    llm: Option<String>,
    runtime: RuntimeArg,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, GalleyError> {
    let runtime_kind = runtime_arg_for_session_new(runtime)?;
    let req = serde_json::json!({
        "command": "session.new_goal_worker",
        "args": {
            "taskTemplate": task_template,
            "projectId": project,
            "llmName": llm,
            "runtimeKind": runtime_kind,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command_value(req).await
}

async fn session_goal_synthesize_value(
    id: String,
    visible_content: String,
    dispatch_content: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, GalleyError> {
    let req = serde_json::json!({
        "command": "session.goal_synthesize",
        "args": {
            "sessionId": id,
            "visibleContent": visible_content,
            "dispatchContent": dispatch_content,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command_value(req).await
}

async fn session_goal_master_plan_value(
    id: String,
    dispatch_content: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, GalleyError> {
    let req = serde_json::json!({
        "command": "session.goal_master_plan",
        "args": {
            "sessionId": id,
            "dispatchContent": dispatch_content,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command_value(req).await
}

async fn session_checkpoint_value(
    id: String,
    content: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, GalleyError> {
    let req = serde_json::json!({
        "command": "session.checkpoint",
        "args": {
            "sessionId": id,
            "content": content,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command_value(req).await
}

async fn session_btw(
    id: String,
    question: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "session.btw",
        "args": {
            "sessionId": id,
            "question": question,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

async fn session_stop(
    id: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "session.stop",
        "args": {
            "sessionId": id,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

async fn session_shutdown_runner_value(
    id: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, GalleyError> {
    let req = serde_json::json!({
        "command": "session.shutdown_runner",
        "args": {
            "sessionId": id,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command_value(req).await
}

async fn session_archive(
    id: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "session.archive",
        "args": {
            "sessionId": id,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

async fn session_restore(
    id: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "session.restore",
        "args": {
            "sessionId": id,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

async fn session_move(
    id: String,
    to: Option<String>,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "session.move",
        "args": {
            "sessionId": id,
            "to": to,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

// ---- B4 M1.3 helpers · project + llm ----

async fn project_create(
    name: String,
    root_path: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "project.create",
        "args": {
            "name": name,
            "rootPath": root_path,
            "icon": icon,
            "color": color,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

/// `project list` bypasses the socket and opens SQLite directly —
/// inventory-style read, mirror of `sessions list`. Works even when
/// Galley Core isn't running.
async fn project_list() -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let projects = galley.list_projects().await?;
    for p in projects {
        emit_json(&p)?;
    }
    Ok(())
}

async fn project_brief(project_id: String, all: bool) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    emit_json(&project_rollup_payload(&galley, &project_id, all).await?)?;
    Ok(())
}

async fn project_show(project_id: String, tail: usize, all: bool) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    emit_json(&project_show_payload(&galley, &project_id, tail, all).await?)?;
    Ok(())
}

enum ProjectWatchItem {
    Event { session_id: String, data: Value },
    End { session_id: String, reason: String },
    Error(GalleyError),
}

async fn forward_project_watch(
    session_id: String,
    report_initial_failure: bool,
    tx: tokio::sync::mpsc::UnboundedSender<ProjectWatchItem>,
) {
    let mut lines = match open_watch_lines(&session_id).await {
        Ok(lines) => lines,
        Err(GalleyError::DbUnavailable { .. }) => {
            if report_initial_failure {
                let _ = tx.send(ProjectWatchItem::End {
                    session_id,
                    reason: "core_unavailable".into(),
                });
            }
            return;
        }
        Err(e) => {
            let _ = tx.send(ProjectWatchItem::Error(e));
            return;
        }
    };

    loop {
        match read_watch_frame(&mut lines).await {
            Ok(Some(WatchFrame::Event(data))) => {
                if tx
                    .send(ProjectWatchItem::Event {
                        session_id: session_id.clone(),
                        data,
                    })
                    .is_err()
                {
                    return;
                }
            }
            Ok(Some(WatchFrame::End(reason))) => {
                let _ = tx.send(ProjectWatchItem::End { session_id, reason });
                return;
            }
            Ok(None) => {
                let _ = tx.send(ProjectWatchItem::End {
                    session_id,
                    reason: "socket_closed".into(),
                });
                return;
            }
            Err(GalleyError::NotFound { .. }) => {
                if report_initial_failure {
                    let _ = tx.send(ProjectWatchItem::End {
                        session_id,
                        reason: "not_live".into(),
                    });
                }
                return;
            }
            Err(e) => {
                let _ = tx.send(ProjectWatchItem::Error(e));
                return;
            }
        }
    }
}

fn emit_project_watch_item(item: ProjectWatchItem) -> Result<(), GalleyError> {
    match item {
        ProjectWatchItem::Event { session_id, data } => emit_json(&ProjectEventPayload {
            schema_version: SCHEMA_VERSION,
            stream: "event",
            session_id,
            data,
        }),
        ProjectWatchItem::End { session_id, reason } => emit_json(&ProjectSessionEndPayload {
            schema_version: SCHEMA_VERSION,
            stream: "sessionEnd",
            session_id,
            reason,
        }),
        ProjectWatchItem::Error(e) => Err(e),
    }
}

async fn emit_project_final_snapshot(
    project_id: &str,
    tail: usize,
    all: bool,
    mode: &'static str,
) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let mut final_snapshot =
        project_snapshot_payload(&galley, project_id, "final", tail, all).await?;
    final_snapshot.follow_state = Some(project_follow_state(mode, &final_snapshot.sessions));
    emit_json(&final_snapshot)
}

async fn project_follow_until_idle(
    project_id: String,
    tail: usize,
    all: bool,
    final_show: bool,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<ProjectWatchItem>,
) -> Result<(), GalleyError> {
    let mut saw_stream_item = false;
    let mut quiet_window = Box::pin(tokio::time::sleep(PROJECT_FOLLOW_IDLE_QUIET_WINDOW));

    loop {
        tokio::select! {
            item = rx.recv() => {
                match item {
                    Some(item) => {
                        saw_stream_item = true;
                        emit_project_watch_item(item)?;
                        quiet_window.as_mut().reset(
                            tokio::time::Instant::now() + PROJECT_FOLLOW_IDLE_QUIET_WINDOW,
                        );
                    }
                    None => {
                        if !saw_stream_item {
                            tokio::time::sleep(PROJECT_FOLLOW_IDLE_QUIET_WINDOW).await;
                        }
                        if final_show || saw_stream_item {
                            emit_project_final_snapshot(&project_id, tail, all, "until_idle").await?;
                        }
                        emit_json(&StreamEndPayload {
                            schema_version: SCHEMA_VERSION,
                            stream: "end",
                            reason: if saw_stream_item {
                                "all_live_sessions_ended"
                            } else {
                                "no_live_sessions"
                            },
                        })?;
                        return Ok(());
                    }
                }
            }
            _ = &mut quiet_window => {
                if !project_has_active_sessions(&project_id, all).await? {
                    if final_show {
                        emit_project_final_snapshot(&project_id, tail, all, "until_idle").await?;
                    }
                    emit_json(&StreamEndPayload {
                        schema_version: SCHEMA_VERSION,
                        stream: "end",
                        reason: "project_idle",
                    })?;
                    return Ok(());
                }
                quiet_window.as_mut().reset(
                    tokio::time::Instant::now() + PROJECT_FOLLOW_IDLE_QUIET_WINDOW,
                );
            }
        }
    }
}

async fn project_follow(
    project_id: String,
    tail: usize,
    all: bool,
    until_idle: bool,
    final_show: bool,
) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let mut initial = project_snapshot_payload(&galley, &project_id, "initial", tail, all).await?;
    let mode = if until_idle { "until_idle" } else { "live" };
    let watch_targets = initial
        .sessions
        .iter()
        .map(|detail| {
            (
                detail.session.id.0.clone(),
                is_live_candidate(detail.session.status),
            )
        })
        .collect::<Vec<_>>();
    initial.follow_state = Some(project_follow_state(mode, &initial.sessions));
    emit_json(&initial)?;

    if watch_targets.is_empty() {
        if final_show {
            emit_project_final_snapshot(&project_id, tail, all, mode).await?;
        }
        emit_json(&StreamEndPayload {
            schema_version: SCHEMA_VERSION,
            stream: "end",
            reason: "no_live_sessions",
        })?;
        return Ok(());
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    for (session_id, report_initial_failure) in watch_targets {
        let tx = tx.clone();
        tokio::spawn(forward_project_watch(
            session_id,
            report_initial_failure,
            tx,
        ));
    }
    drop(tx);

    if until_idle {
        return project_follow_until_idle(project_id, tail, all, final_show, rx).await;
    }

    let mut saw_stream_item = false;
    while let Some(item) = rx.recv().await {
        saw_stream_item = true;
        emit_project_watch_item(item)?;
    }

    if !saw_stream_item {
        if final_show {
            emit_project_final_snapshot(&project_id, tail, all, mode).await?;
        }
        emit_json(&StreamEndPayload {
            schema_version: SCHEMA_VERSION,
            stream: "end",
            reason: "no_live_sessions",
        })?;
        return Ok(());
    }

    emit_project_final_snapshot(&project_id, tail, all, mode).await?;
    emit_json(&StreamEndPayload {
        schema_version: SCHEMA_VERSION,
        stream: "end",
        reason: "all_live_sessions_ended",
    })?;
    Ok(())
}

async fn project_delete(
    project_id: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "project.delete",
        "args": {
            "projectId": project_id,
            "supervisor": supervisor,
            "reason": reason,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GoalRunFrame<'a> {
    schema_version: u32,
    stream: &'static str,
    phase: &'a str,
    goal: &'a GoalBrief,
    #[serde(skip_serializing_if = "Option::is_none")]
    session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
}

async fn goal_propose(
    objective: String,
    project: Option<String>,
    budget_minutes: u32,
    workers: u32,
    runtime: RuntimeArg,
    write_mode: GoalWriteModeArg,
    expires_minutes: u32,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let runtime_kind = runtime_kind_for_goal(&galley, runtime).await?;
    let proposal = galley
        .create_goal_proposal(
            CreateGoalProposalInput {
                objective,
                project_id: project.map(galley_core_lib::api::ProjectId),
                master_session_id: None,
                budget_seconds: Some(budget_minutes.saturating_mul(60)),
                worker_limit: Some(workers),
                runtime_kind: Some(runtime_kind),
                write_mode: Some(write_mode.into()),
                expires_in_seconds: Some(expires_minutes.saturating_mul(60)),
            },
            cli_origin(supervisor, reason),
        )
        .await?;
    emit_json(&proposal)?;
    Ok(())
}

async fn goal_run(
    goal_id: Option<String>,
    proposal: Option<String>,
    confirm_token: Option<String>,
    resume: bool,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let goal = if let Some(proposal_id) = proposal {
        let token = confirm_token.ok_or_else(|| GalleyError::InvalidArgs {
            message: "goal run: --confirm-token is required with --proposal".into(),
        })?;
        galley
            .start_goal_from_proposal(
                GoalProposalId(proposal_id),
                token,
                cli_origin(supervisor.clone(), reason.clone()),
            )
            .await?
    } else if resume {
        let id = goal_id.ok_or_else(|| GalleyError::InvalidArgs {
            message: "goal run --resume requires <goal-id>".into(),
        })?;
        galley.goal_status(GoalId(id)).await?.goal
    } else {
        return Err(GalleyError::InvalidArgs {
            message: "goal run requires --proposal <id> or <goal-id> --resume".into(),
        });
    };
    if let Err(err) = run_goal_controller(&galley, goal.clone(), supervisor, reason).await {
        if matches!(goal.status, GoalStatus::Running | GoalStatus::Wrapping) {
            let _ = galley
                .update_goal_state(
                    goal.id.clone(),
                    GoalStatus::Failed,
                    Some(format!("Goal controller failed: {err}")),
                )
                .await;
        }
        return Err(err);
    }
    Ok(())
}

async fn run_goal_controller(
    galley: &SqliteGalley,
    mut goal: GoalBrief,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    if !matches!(goal.status, GoalStatus::Running | GoalStatus::Wrapping) {
        return Err(GalleyError::InvalidArgs {
            message: format!("goal {} is not active (status={:?})", goal.id, goal.status),
        });
    }
    emit_json(&GoalRunFrame {
        schema_version: SCHEMA_VERSION,
        stream: "goal",
        phase: "started",
        goal: &goal,
        session_id: None,
        note: Some(format!(
            "Goal controller started. User confirmation phrase is `{GOAL_CONFIRMATION_PHRASE}`."
        )),
    })?;

    if goal.stop_requested {
        goal = galley
            .update_goal_state(
                goal.id.clone(),
                GoalStatus::Stopped,
                Some("Goal stopped before spawning workers.".into()),
            )
            .await?;
        emit_json(&GoalRunFrame {
            schema_version: SCHEMA_VERSION,
            stream: "goal",
            phase: "stopped",
            goal: &goal,
            session_id: None,
            note: None,
        })?;
        return Ok(());
    }

    let runtime = runtime_arg_from_kind(goal.runtime_kind);
    // Attach masters read Galley's own SOP copy from disk (they can't read
    // the seeded memory file, and Galley must not write the user's GA
    // checkout). Materialize it once before planning; managed reads its
    // memory copy and ignores this.
    if goal.runtime_kind == RuntimeKind::External {
        let _ = galley_core_lib::ensure_goal_master_duty_sop();
    }
    let controller_started = Instant::now();
    let mut worker_session_ids: Vec<SessionId> = Vec::new();
    let mut worker_slots: Vec<GoalWorkerSlot> = Vec::new();
    loop {
        if goal.status == GoalStatus::Wrapping && !goal.stop_requested {
            let snapshot = galley.goal_status(goal.id.clone()).await?;
            finish_goal_with_master(
                galley,
                snapshot,
                &worker_session_ids,
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
            return Ok(());
        }

        let wave_start_snapshot = galley.goal_status(goal.id.clone()).await?;
        goal = wave_start_snapshot.goal.clone();
        if goal.stop_requested {
            let summary = "Goal stopped before starting the next worker wave.".to_string();
            shutdown_goal_worker_runners(
                galley,
                &wave_start_snapshot,
                &worker_session_ids,
                supervisor.clone(),
                reason
                    .clone()
                    .or_else(|| Some(format!("goal {} stopped", goal.id))),
            )
            .await?;
            galley
                .create_goal_event(CreateGoalEventInput {
                    goal_id: goal.id.clone(),
                    task_id: None,
                    author_session_id: None,
                    event_type: GoalEventType::Synthesis,
                    body: summary.clone(),
                })
                .await?;
            let final_goal = galley
                .update_goal_state(goal.id.clone(), GoalStatus::Stopped, Some(summary))
                .await?;
            emit_json(&GoalRunFrame {
                schema_version: SCHEMA_VERSION,
                stream: "goal",
                phase: "finished",
                goal: &final_goal,
                session_id: None,
                note: None,
            })?;
            return Ok(());
        }
        if !goal_budget_left(&goal, controller_started) {
            let incomplete_tasks = goal_has_incomplete_tasks(&wave_start_snapshot);
            let protocol_result_signal = goal_has_result_signal(&wave_start_snapshot);
            let accumulated_worker_output_signal = if protocol_result_signal {
                false
            } else {
                goal_worker_sessions_have_output(galley, &worker_session_ids).await?
            };
            let has_synthesis_material = protocol_result_signal
                || accumulated_worker_output_signal
                || goal_has_worker_material_signal(&wave_start_snapshot);
            if has_synthesis_material {
                post_goal_master_checkpoint(
                    galley,
                    &wave_start_snapshot,
                    GoalMasterCheckpointKind::FirstMaterial,
                    "已有初步进展，正在继续核对和整理。".to_string(),
                    supervisor.clone(),
                    reason.clone(),
                )
                .await?;
            }
            post_goal_master_checkpoint(
                galley,
                &wave_start_snapshot,
                GoalMasterCheckpointKind::DeadlineReached,
                "运行时间已到，正在等待当前任务收尾并整理结果。".to_string(),
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
            match goal_controller_decision(
                false,
                has_synthesis_material,
                goal_worker_slots_all_capped(&worker_slots),
            ) {
                GoalControllerDecision::Wrap(wrap_reason) => {
                    let summary = goal_wrapping_summary(wrap_reason, incomplete_tasks);
                    galley
                        .create_goal_event(CreateGoalEventInput {
                            goal_id: goal.id.clone(),
                            task_id: None,
                            author_session_id: None,
                            event_type: GoalEventType::Synthesis,
                            body: summary.clone(),
                        })
                        .await?;
                    let wrapping_goal = galley
                        .update_goal_state(goal.id.clone(), GoalStatus::Wrapping, Some(summary))
                        .await?;
                    emit_json(&GoalRunFrame {
                        schema_version: SCHEMA_VERSION,
                        stream: "goal",
                        phase: "wrapping",
                        goal: &wrapping_goal,
                        session_id: None,
                        note: wrapping_goal.latest_summary.clone(),
                    })?;
                    finish_goal_with_master(
                        galley,
                        galley.goal_status(wrapping_goal.id.clone()).await?,
                        &worker_session_ids,
                        supervisor.clone(),
                        reason.clone().or_else(|| {
                            Some(format!("goal master synthesis after {wrap_reason:?}"))
                        }),
                    )
                    .await?;
                    return Ok(());
                }
                GoalControllerDecision::Fail(reason) => {
                    let summary = goal_failure_summary(reason);
                    shutdown_goal_worker_runners(
                        galley,
                        &wave_start_snapshot,
                        &worker_session_ids,
                        supervisor.clone(),
                        Some(format!("goal {} failed before next wave", goal.id)),
                    )
                    .await?;
                    galley
                        .create_goal_event(CreateGoalEventInput {
                            goal_id: goal.id.clone(),
                            task_id: None,
                            author_session_id: None,
                            event_type: GoalEventType::Synthesis,
                            body: summary.clone(),
                        })
                        .await?;
                    let final_goal = galley
                        .update_goal_state(goal.id.clone(), GoalStatus::Failed, Some(summary))
                        .await?;
                    emit_json(&GoalRunFrame {
                        schema_version: SCHEMA_VERSION,
                        stream: "goal",
                        phase: "failed",
                        goal: &final_goal,
                        session_id: None,
                        note: final_goal.latest_summary.clone(),
                    })?;
                    return Ok(());
                }
                GoalControllerDecision::Continue => {}
                GoalControllerDecision::WaitForSignal => {}
            }
        }
        let wave_start_activity = goal_activity_counts(&wave_start_snapshot);

        if worker_slots.is_empty() {
            let worker_start_snapshot = ensure_goal_master_planned_or_fallback(
                galley,
                &wave_start_snapshot,
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
            let new_slots = start_goal_worker_slots(
                galley,
                &worker_start_snapshot,
                &goal,
                &worker_slots,
                runtime,
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
            worker_slots.extend(new_slots);
            worker_session_ids = goal_worker_slot_session_ids(&worker_slots);
            if !worker_slots.is_empty() {
                let checkpoint_snapshot = galley.goal_status(goal.id.clone()).await?;
                post_goal_master_checkpoint(
                    galley,
                    &checkpoint_snapshot,
                    GoalMasterCheckpointKind::WorkersStarted,
                    format!("已启动 {} 个 Agent，正在执行已分配任务。", worker_slots.len()),
                    supervisor.clone(),
                    reason.clone(),
                )
                .await?;
            }
        }

        project_follow(goal.project_id.0.clone(), 80, false, true, true).await?;
        let wait_outcome = wait_goal_worker_sessions(
            galley,
            &mut worker_slots,
            &goal,
            controller_started,
            supervisor.clone(),
            reason.clone(),
        )
        .await?;

        let mut snapshot = galley.goal_status(goal.id.clone()).await?;
        let refreshed = snapshot.goal.clone();
        if refreshed.stop_requested {
            let summary = "Worker wave finished after stop request; Goal stopped.".to_string();
            shutdown_goal_worker_runners(
                galley,
                &snapshot,
                &worker_session_ids,
                supervisor.clone(),
                reason
                    .clone()
                    .or_else(|| Some(format!("goal {} stopped", refreshed.id))),
            )
            .await?;
            galley
                .create_goal_event(CreateGoalEventInput {
                    goal_id: refreshed.id.clone(),
                    task_id: None,
                    author_session_id: None,
                    event_type: GoalEventType::Synthesis,
                    body: summary.clone(),
                })
                .await?;
            let final_goal = galley
                .update_goal_state(refreshed.id.clone(), GoalStatus::Stopped, Some(summary))
                .await?;
            emit_json(&GoalRunFrame {
                schema_version: SCHEMA_VERSION,
                stream: "goal",
                phase: "finished",
                goal: &final_goal,
                session_id: None,
                note: None,
            })?;
            return Ok(());
        }

        let incomplete_tasks = goal_has_incomplete_tasks(&snapshot);
        let budget_left = goal_budget_left(&refreshed, controller_started);
        let protocol_result_signal = goal_has_result_signal(&snapshot);
        let accumulated_worker_output_signal = if protocol_result_signal {
            false
        } else {
            goal_worker_sessions_have_output(galley, &worker_session_ids).await?
        };
        let has_result_signal = protocol_result_signal || accumulated_worker_output_signal;
        let has_synthesis_material =
            has_result_signal || goal_has_worker_material_signal(&snapshot);
        if has_synthesis_material {
            post_goal_master_checkpoint(
                galley,
                &snapshot,
                GoalMasterCheckpointKind::FirstMaterial,
                "已有初步进展，正在继续核对和整理。".to_string(),
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
        }
        if !budget_left {
            post_goal_master_checkpoint(
                galley,
                &snapshot,
                GoalMasterCheckpointKind::DeadlineReached,
                "运行时间已到，正在等待当前任务收尾并整理结果。".to_string(),
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
        }
        let wave_protocol_activity =
            goal_activity_increased(wave_start_activity, goal_activity_counts(&snapshot));
        let mut decision_wait_outcome = wait_outcome.clone();

        if let GoalWorkerWaitOutcome::ReadySlots(ready_slot_indices) = wait_outcome.clone() {
            if budget_left {
                snapshot = ensure_goal_master_planned_or_fallback(
                    galley,
                    &snapshot,
                    supervisor.clone(),
                    reason.clone(),
                )
                .await?;
                let new_slots = start_goal_worker_slots(
                    galley,
                    &snapshot,
                    &refreshed,
                    &worker_slots,
                    runtime,
                    supervisor.clone(),
                    reason.clone(),
                )
                .await?;
                worker_slots.extend(new_slots);
                let mut continued_workers = Vec::new();
                for slot_index in ready_slot_indices {
                    if let Some(slot) = worker_slots.get_mut(slot_index) {
                        let worker_index = slot.worker_index;
                        if continue_goal_worker_slot(
                            galley,
                            &snapshot,
                            &refreshed,
                            slot,
                            supervisor.clone(),
                            reason.clone(),
                        )
                        .await?
                        {
                            continued_workers.push(worker_index);
                        }
                    }
                }
                worker_session_ids = goal_worker_slot_session_ids(&worker_slots);
                if !continued_workers.is_empty() {
                    let summary = goal_slot_wake_summary(
                        &continued_workers,
                        has_result_signal,
                        incomplete_tasks,
                    );
                    galley
                        .create_goal_event(CreateGoalEventInput {
                            goal_id: refreshed.id.clone(),
                            task_id: None,
                            author_session_id: None,
                            event_type: GoalEventType::Synthesis,
                            body: summary.clone(),
                        })
                        .await?;
                    let continuing_goal = galley
                        .update_goal_state(refreshed.id.clone(), GoalStatus::Running, Some(summary))
                        .await?;
                    emit_json(&GoalRunFrame {
                        schema_version: SCHEMA_VERSION,
                        stream: "goal",
                        phase: "continuing",
                        goal: &continuing_goal,
                        session_id: None,
                        note: continuing_goal.latest_summary.clone(),
                    })?;
                    goal = continuing_goal;
                    continue;
                }
                decision_wait_outcome = GoalWorkerWaitOutcome::IdleWithoutSignal;
            }
        }

        match goal_controller_decision_after_wait(
            decision_wait_outcome.clone(),
            budget_left,
            has_synthesis_material,
            goal_worker_slots_all_capped(&worker_slots),
        ) {
            GoalControllerDecision::WaitForSignal => {
                let summary = goal_waiting_for_worker_signal_summary(
                    goal_worker_max_wave(&worker_slots),
                    wave_protocol_activity,
                );
                galley
                    .create_goal_event(CreateGoalEventInput {
                        goal_id: refreshed.id.clone(),
                        task_id: None,
                        author_session_id: None,
                        event_type: GoalEventType::Synthesis,
                        body: summary.clone(),
                    })
                    .await?;
                let waiting_goal = galley
                    .update_goal_state(refreshed.id.clone(), GoalStatus::Running, Some(summary))
                    .await?;
                emit_json(&GoalRunFrame {
                    schema_version: SCHEMA_VERSION,
                    stream: "goal",
                    phase: "waiting",
                    goal: &waiting_goal,
                    session_id: None,
                    note: waiting_goal.latest_summary.clone(),
                })?;
                goal = waiting_goal;
                tokio::time::sleep(Duration::from_millis(1500)).await;
                continue;
            }
            GoalControllerDecision::Continue => {
                let summary = goal_waiting_for_worker_signal_summary(
                    goal_worker_max_wave(&worker_slots),
                    wave_protocol_activity,
                );
                galley
                    .create_goal_event(CreateGoalEventInput {
                        goal_id: refreshed.id.clone(),
                        task_id: None,
                        author_session_id: None,
                        event_type: GoalEventType::Synthesis,
                        body: summary.clone(),
                    })
                    .await?;
                let continuing_goal = galley
                    .update_goal_state(refreshed.id.clone(), GoalStatus::Running, Some(summary))
                    .await?;
                emit_json(&GoalRunFrame {
                    schema_version: SCHEMA_VERSION,
                    stream: "goal",
                    phase: "continuing",
                    goal: &continuing_goal,
                    session_id: None,
                    note: continuing_goal.latest_summary.clone(),
                })?;
                goal = continuing_goal;
                tokio::time::sleep(Duration::from_millis(1500)).await;
                continue;
            }
            GoalControllerDecision::Fail(reason) => {
                let summary = goal_failure_summary(reason);
                shutdown_goal_worker_runners(
                    galley,
                    &snapshot,
                    &worker_session_ids,
                    supervisor.clone(),
                    Some(format!("goal {} failed after worker wave", refreshed.id)),
                )
                .await?;
                galley
                    .create_goal_event(CreateGoalEventInput {
                        goal_id: refreshed.id.clone(),
                        task_id: None,
                        author_session_id: None,
                        event_type: GoalEventType::Synthesis,
                        body: summary.clone(),
                    })
                    .await?;
                let final_goal = galley
                    .update_goal_state(refreshed.id.clone(), GoalStatus::Failed, Some(summary))
                    .await?;
                emit_json(&GoalRunFrame {
                    schema_version: SCHEMA_VERSION,
                    stream: "goal",
                    phase: "failed",
                    goal: &final_goal,
                    session_id: None,
                    note: final_goal.latest_summary.clone(),
                })?;
                return Ok(());
            }
            GoalControllerDecision::Wrap(wrap_reason) => {
                let wrap_reason = match (wrap_reason, decision_wait_outcome) {
                    (GoalWrapReason::Deadline, GoalWorkerWaitOutcome::DrainCapReached) => {
                        GoalWrapReason::DrainCap
                    }
                    _ => wrap_reason,
                };
                let summary = goal_wrapping_summary(wrap_reason, incomplete_tasks);
                galley
                    .create_goal_event(CreateGoalEventInput {
                        goal_id: refreshed.id.clone(),
                        task_id: None,
                        author_session_id: None,
                        event_type: GoalEventType::Synthesis,
                        body: summary.clone(),
                    })
                    .await?;
                let wrapping_goal = galley
                    .update_goal_state(refreshed.id.clone(), GoalStatus::Wrapping, Some(summary))
                    .await?;
                emit_json(&GoalRunFrame {
                    schema_version: SCHEMA_VERSION,
                    stream: "goal",
                    phase: "wrapping",
                    goal: &wrapping_goal,
                    session_id: None,
                    note: wrapping_goal.latest_summary.clone(),
                })?;
                finish_goal_with_master(
                    galley,
                    galley.goal_status(wrapping_goal.id.clone()).await?,
                    &worker_session_ids,
                    supervisor.clone(),
                    reason
                        .clone()
                        .or_else(|| Some(format!("goal master synthesis after {wrap_reason:?}"))),
                )
                .await?;
                return Ok(());
            }
        }
    }
}

#[derive(Debug, Clone)]
struct GoalWorkerWaveBaseline {
    session_id: SessionId,
    terminal_counts: GoalWorkerTerminalCounts,
    progress_counts: GoalWorkerProgressCounts,
    reminder_sent: bool,
}

#[derive(Debug, Clone)]
struct GoalWorkerSlot {
    worker_index: u32,
    wave: u32,
    baseline: GoalWorkerWaveBaseline,
    capped: bool,
}

impl GoalWorkerSlot {
    fn session_id(&self) -> &SessionId {
        &self.baseline.session_id
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct GoalTaskSpec {
    title: String,
    description: String,
    scope: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GoalMasterCheckpointKind {
    PlanningStarted,
    WorkersStarted,
    FirstMaterial,
    DeadlineReached,
}

impl GoalMasterCheckpointKind {
    fn marker(self) -> &'static str {
        match self {
            GoalMasterCheckpointKind::PlanningStarted => {
                "[galley-master-checkpoint:planning_started]"
            }
            GoalMasterCheckpointKind::WorkersStarted => {
                "[galley-master-checkpoint:workers_started]"
            }
            GoalMasterCheckpointKind::FirstMaterial => "[galley-master-checkpoint:first_material]",
            GoalMasterCheckpointKind::DeadlineReached => {
                "[galley-master-checkpoint:deadline_reached]"
            }
        }
    }

    fn reason_label(self) -> &'static str {
        match self {
            GoalMasterCheckpointKind::PlanningStarted => "planning started",
            GoalMasterCheckpointKind::WorkersStarted => "workers started",
            GoalMasterCheckpointKind::FirstMaterial => "first material",
            GoalMasterCheckpointKind::DeadlineReached => "deadline reached",
        }
    }
}

async fn post_goal_master_checkpoint(
    galley: &SqliteGalley,
    snapshot: &GoalStatusSnapshot,
    kind: GoalMasterCheckpointKind,
    content: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<bool, GalleyError> {
    let Some(master_session_id) = snapshot.goal.master_session_id.clone() else {
        return Ok(false);
    };
    if goal_master_checkpoint_seen(snapshot, kind) {
        return Ok(false);
    }
    session_checkpoint_value(
        master_session_id.0.clone(),
        content.clone(),
        supervisor.clone(),
        reason.clone().or_else(|| {
            Some(format!(
                "goal {} master checkpoint: {}",
                snapshot.goal.id,
                kind.reason_label()
            ))
        }),
    )
    .await?;
    galley
        .create_goal_event(CreateGoalEventInput {
            goal_id: snapshot.goal.id.clone(),
            task_id: None,
            author_session_id: Some(master_session_id),
            event_type: GoalEventType::System,
            body: goal_master_checkpoint_event_body(kind, &content),
        })
        .await?;
    Ok(true)
}

fn goal_master_checkpoint_seen(
    snapshot: &GoalStatusSnapshot,
    kind: GoalMasterCheckpointKind,
) -> bool {
    let marker = kind.marker();
    snapshot.events.iter().any(|event| {
        event.event_type == GoalEventType::System
            && event.author_session_id.as_ref() == snapshot.goal.master_session_id.as_ref()
            && event.body.starts_with(marker)
    })
}

fn goal_master_checkpoint_event_body(kind: GoalMasterCheckpointKind, content: &str) -> String {
    format!("{} {}", kind.marker(), content)
}

async fn ensure_goal_master_planned_or_fallback(
    galley: &SqliteGalley,
    snapshot: &GoalStatusSnapshot,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<GoalStatusSnapshot, GalleyError> {
    if goal_has_open_assigned_task(snapshot) {
        return Ok(snapshot.clone());
    }

    let planned = match run_goal_master_planning_turn(
        galley,
        snapshot,
        supervisor.clone(),
        reason.clone(),
    )
    .await
    {
        Ok(s) => s,
        Err(e) => {
            let _ = galley
                .create_goal_event(CreateGoalEventInput {
                    goal_id: snapshot.goal.id.clone(),
                    task_id: None,
                    author_session_id: snapshot.goal.master_session_id.clone(),
                    event_type: GoalEventType::System,
                    body: format!("{GOAL_MASTER_PLANNING_MARKER} failed: {e}"),
                })
                .await;
            snapshot.clone()
        }
    };

    if goal_has_open_assigned_task(&planned) {
        return Ok(planned);
    }
    if planned.tasks.is_empty() {
        ensure_goal_seed_tasks(galley, &planned).await
    } else {
        ensure_goal_fallback_followup_tasks(galley, &planned).await
    }
}

async fn run_goal_master_planning_turn(
    galley: &SqliteGalley,
    snapshot: &GoalStatusSnapshot,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<GoalStatusSnapshot, GalleyError> {
    let Some(master_session_id) = snapshot.goal.master_session_id.clone() else {
        return Ok(snapshot.clone());
    };
    post_goal_master_checkpoint(
        galley,
        snapshot,
        GoalMasterCheckpointKind::PlanningStarted,
        "Galley 正在拆分任务。".to_string(),
        supervisor.clone(),
        reason.clone(),
    )
    .await?;

    let round = goal_master_planning_next_round(snapshot);
    galley
        .create_goal_event(CreateGoalEventInput {
            goal_id: snapshot.goal.id.clone(),
            task_id: None,
            author_session_id: Some(master_session_id.clone()),
            event_type: GoalEventType::System,
            body: format!("{GOAL_MASTER_PLANNING_MARKER} round {round} dispatched."),
        })
        .await?;

    let dispatch_content = goal_master_planning_prompt(snapshot, round);
    session_goal_master_plan_value(
        master_session_id.0.clone(),
        dispatch_content,
        supervisor,
        reason.or_else(|| Some(format!("goal {} master planning round {round}", snapshot.goal.id))),
    )
    .await?;

    wait_goal_master_planning_result(galley, &snapshot.goal.id, snapshot.tasks.len()).await
}

async fn wait_goal_master_planning_result(
    galley: &SqliteGalley,
    goal_id: &GoalId,
    before_task_count: usize,
) -> Result<GoalStatusSnapshot, GalleyError> {
    let started = Instant::now();
    loop {
        let snapshot = galley.goal_status(goal_id.clone()).await?;
        if goal_has_open_assigned_task(&snapshot) || snapshot.tasks.len() > before_task_count {
            return Ok(snapshot);
        }
        if !matches!(snapshot.goal.status, GoalStatus::Running) || snapshot.goal.stop_requested {
            return Ok(snapshot);
        }
        if started.elapsed() >= Duration::from_secs(GOAL_MASTER_PLANNING_TIMEOUT_SECONDS) {
            return Ok(snapshot);
        }
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

fn goal_master_planning_next_round(snapshot: &GoalStatusSnapshot) -> u32 {
    snapshot
        .events
        .iter()
        .filter(|event| {
            event.event_type == GoalEventType::System
                && event.body.starts_with(GOAL_MASTER_PLANNING_MARKER)
                && event.body.contains(" dispatched.")
        })
        .count()
        .saturating_add(1) as u32
}

/// Most recent master check report (P0/P1 issue list), body with the
/// marker stripped. None until the master posts its first check report.
/// Threaded into the next planning prompt so design rounds fix by the
/// list instead of re-deciding from scratch.
fn goal_latest_check_report(snapshot: &GoalStatusSnapshot) -> Option<String> {
    snapshot
        .events
        .iter()
        .rev()
        .find(|event| event.body.contains(GOAL_CHECK_REPORT_MARKER))
        .map(|event| {
            event
                .body
                .replacen(GOAL_CHECK_REPORT_MARKER, "", 1)
                .trim()
                .to_string()
        })
}

fn goal_master_planning_prompt(snapshot: &GoalStatusSnapshot, round: u32) -> String {
    let goal = &snapshot.goal;
    let memory_policy = goal_memory_policy_prompt(goal.runtime_kind);
    let master_duty = goal_master_duty_prompt(goal.runtime_kind);
    let workspace_block = goal_workspace_prompt_block(goal);
    let master_session_id = goal
        .master_session_id
        .as_ref()
        .map(SessionId::as_str)
        .unwrap_or("-");
    let anchor_summary = match snapshot.deliverable.as_ref() {
        Some(d) => format!(
            "- Current anchor: version {} ({} chars){}.",
            d.version,
            d.content.chars().count(),
            d.note
                .as_deref()
                .map(|n| format!(", last note: {n}"))
                .unwrap_or_default()
        ),
        None => "- No deliverable anchor yet — this round should produce the first one.".to_string(),
    };
    let task_lines = if snapshot.tasks.is_empty() {
        "No tasks exist yet.".to_string()
    } else {
        snapshot
            .tasks
            .iter()
            .map(|task| {
                format!(
                    "- id={} status={:?} scope={} owner={} title={}",
                    task.id,
                    task.status,
                    task.scope.as_deref().unwrap_or("-"),
                    task.owner_session_id
                        .as_ref()
                        .map(SessionId::as_str)
                        .unwrap_or("-"),
                    task.title
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    let event_lines = snapshot
        .events
        .iter()
        .rev()
        .take(12)
        .map(|event| {
            format!(
                "- {:?} author={} task={} body={}",
                event.event_type,
                event
                    .author_session_id
                    .as_ref()
                    .map(SessionId::as_str)
                    .unwrap_or("-"),
                event.task_id.as_ref().map(GoalTaskId::as_str).unwrap_or("-"),
                event.body.replace('\n', " ")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let check_report_block = match goal_latest_check_report(snapshot) {
        Some(report) => format!(
            "Open issues to fix this round (from the latest check report — address P0 before P1):\n{report}"
        ),
        None => {
            "No check report yet. Early rounds: probe + produce the first anchor draft.".to_string()
        }
    };
    format!(
        r#"[Galley Goal Master Planner]

You are the hidden Master planner for a Galley Native Goal. You decompose, judge, and curate; you do not produce deliverable content yourself.

Goal id: {goal_id}
Master session: {master_session_id}
Objective: {objective}
Round: {round}
Max concurrent workers: {worker_limit}
Deadline: {deadline_at}

{master_duty}

{workspace_block}

Deliverable anchor (the single source of truth for the result):
{anchor_summary}
- Read the current anchor with: galley goal deliverable get {goal_id}
- Maintain ONE current-best deliverable. Each round, fold worker output that passes your review into a new version:
  galley goal deliverable set {goal_id} "<full updated deliverable>" --note "<what changed>" --author-session {master_session_id}
- Only replace the anchor when the result genuinely improves; if a change makes it worse, keep the current version (never lose ground). Workers produce candidates; you decide what merges.

Refinement loop (probe -> design -> execute -> check, repeat until budget):
- Probe/check rounds diverge: dispatch independent angles to different workers — user-view trial, attacker/edge cases, third-party review, and questioning the objective itself. Each check task must return reproducible evidence, not a "looks done" claim.
- After a check round, post ONE check report event listing issues ordered by harm (P0 then P1):
  galley goal event post {goal_id} --event-type system "{check_marker} P0: <blocking issues>; P1: <important-but-not-blocking>" --author-session {master_session_id}
- Design/execute rounds converge: read the latest check report and fix P0 first, then P1, folding accepted fixes into the next anchor version. Do not re-decide from scratch — fix by the list.

{check_report_block}

Rules:
1. First read state: galley goal status {goal_id} and galley goal deliverable get {goal_id}.
2. Create at most {worker_limit} open tasks for this round. Creating fewer is allowed.
3. Use only Galley CLI/Core writes: galley goal task|event|deliverable.
4. Do not call GA native /hive. Do not start agent_bbs.py. Do not write Goal state outside Galley Core.
{memory_policy}
5. Task scopes must be idempotent and slot-bound: goal-worker-N:master-round-{round}:short-kind, where N is 1..{worker_limit}.
6. Before creating a task, inspect existing task scopes and do not duplicate an existing scope.
7. Each task needs a concrete title, clear acceptance criteria in --description, one slot scope, and must drive a better anchor.
8. If a usable anchor already exists and budget remains, create validation, gap-fill, structure, or risk-check tasks that raise the next anchor version instead of declaring done early.
9. If Goal status is wrapping/completed/failed/stopped, stop without creating tasks.
10. End with a short hidden final answer: MASTER_PLAN_DONE round={round} tasks=<number_created>.

Current tasks:
{task_lines}

Recent events:
{event_lines}

Suggested CLI examples:
galley goal task create {goal_id} "Produce the deliverable's first complete draft" --description "Acceptance: ..." --scope "goal-worker-1:master-round-{round}:first-pass"
galley goal task create {goal_id} "Independent verification and gap check against the anchor" --description "Acceptance: ..." --scope "goal-worker-2:master-round-{round}:verify-gaps"
"#,
        goal_id = goal.id,
        master_session_id = master_session_id,
        objective = goal.objective,
        worker_limit = goal.worker_limit,
        deadline_at = goal.deadline_at,
        master_duty = master_duty,
        workspace_block = workspace_block,
        anchor_summary = anchor_summary,
        check_marker = GOAL_CHECK_REPORT_MARKER,
        check_report_block = check_report_block,
        memory_policy = memory_policy,
    )
}

async fn ensure_goal_seed_tasks(
    galley: &SqliteGalley,
    snapshot: &GoalStatusSnapshot,
) -> Result<GoalStatusSnapshot, GalleyError> {
    if !snapshot.tasks.is_empty() || goal_seed_task_marker_seen(snapshot) {
        return Ok(snapshot.clone());
    }

    for (worker_index, spec) in goal_seed_task_specs(&snapshot.goal) {
        galley
            .create_goal_task(CreateGoalTaskInput {
                goal_id: snapshot.goal.id.clone(),
                title: spec.title,
                description: Some(spec.description),
                scope: Some(spec.scope),
                owner_session_id: None,
            })
            .await?;
        galley
            .create_goal_event(CreateGoalEventInput {
                goal_id: snapshot.goal.id.clone(),
                task_id: None,
                author_session_id: None,
                event_type: GoalEventType::System,
                body: format!(
                    "{GOAL_SEED_TASK_MARKER} created seed task for worker {worker_index}."
                ),
            })
            .await?;
    }

    galley
        .create_goal_event(CreateGoalEventInput {
            goal_id: snapshot.goal.id.clone(),
            task_id: None,
            author_session_id: None,
            event_type: GoalEventType::System,
            body: format!(
                "{GOAL_SEED_TASK_MARKER} seeded {} worker tasks.",
                snapshot.goal.worker_limit
            ),
        })
        .await?;
    galley.goal_status(snapshot.goal.id.clone()).await
}

async fn ensure_goal_fallback_followup_tasks(
    galley: &SqliteGalley,
    snapshot: &GoalStatusSnapshot,
) -> Result<GoalStatusSnapshot, GalleyError> {
    let round = goal_master_planning_next_round(snapshot);
    let existing_scopes = snapshot
        .tasks
        .iter()
        .filter_map(|task| task.scope.as_deref())
        .collect::<Vec<_>>();
    for worker_index in 1..=snapshot.goal.worker_limit {
        let scope =
            format!("{GOAL_CONTROLLER_TASK_SCOPE_PREFIX}{worker_index}:master-fallback-round-{round}:validate");
        if existing_scopes.iter().any(|existing| *existing == scope) {
            continue;
        }
        galley
            .create_goal_task(CreateGoalTaskInput {
                goal_id: snapshot.goal.id.clone(),
                title: "验证、补缺和改进当前结果".to_string(),
                description: Some(format!(
                    "基于目标「{}」和已有结果，找出最需要补齐、核对或改进的地方；完成时写清新增结论、证据、风险和仍未解决的问题。",
                    snapshot.goal.objective
                )),
                scope: Some(scope),
                owner_session_id: None,
            })
            .await?;
    }
    galley
        .create_goal_event(CreateGoalEventInput {
            goal_id: snapshot.goal.id.clone(),
            task_id: None,
            author_session_id: snapshot.goal.master_session_id.clone(),
            event_type: GoalEventType::System,
            body: format!("{GOAL_MASTER_PLANNING_MARKER} fallback follow-up tasks created."),
        })
        .await?;
    galley.goal_status(snapshot.goal.id.clone()).await
}

fn goal_seed_task_marker_seen(snapshot: &GoalStatusSnapshot) -> bool {
    snapshot.events.iter().any(|event| {
        event.event_type == GoalEventType::System && event.body.starts_with(GOAL_SEED_TASK_MARKER)
    })
}

fn goal_seed_task_specs(goal: &GoalBrief) -> Vec<(u32, GoalTaskSpec)> {
    let worker_limit = goal.worker_limit.max(1);
    let mut specs = Vec::new();
    specs.push((
        1,
        goal_task_spec(
            1,
            "first-pass",
            "第一版完整结果",
            format!(
                "围绕目标「{}」产出第一版可交付结果，写清主要结论、依据、假设和仍需补齐的缺口。",
                goal.objective
            ),
        ),
    ));
    if worker_limit >= 2 {
        specs.push((
            2,
            goal_task_spec(
                2,
                "independent-review",
                "独立核对与补缺",
                format!(
                    "独立检查目标「{}」的事实、约束、风险和遗漏，优先找出第一版结果最需要改进的地方。",
                    goal.objective
                ),
            ),
        ));
    }
    if worker_limit >= 3 {
        specs.push((
            3,
            goal_task_spec(
                3,
                "synthesis-polish",
                "结构整理与下一步建议",
                format!(
                    "把围绕目标「{}」的已有发现整理成用户容易理解的结构，并补充可执行的下一步建议。",
                    goal.objective
                ),
            ),
        ));
    }
    if worker_limit >= 4 {
        specs.push((
            4,
            goal_task_spec(
                4,
                "alternatives-edge-cases",
                "替代方案、边界和反例检查",
                format!(
                    "从替代路径、边界情况和反例角度检查目标「{}」，指出可能被忽略的选择或风险。",
                    goal.objective
                ),
            ),
        ));
    }
    if worker_limit >= 5 {
        specs.push((
            5,
            goal_task_spec(
                5,
                "final-quality-review",
                "最终质量、风险和交付检查",
                format!(
                    "对目标「{}」的最终交付做质量检查，确认结论、风险、缺口和下一步都可直接交给用户。",
                    goal.objective
                ),
            ),
        ));
    }
    specs
}

fn goal_task_spec(
    worker_index: u32,
    kind: &str,
    title: impl Into<String>,
    description: impl Into<String>,
) -> GoalTaskSpec {
    GoalTaskSpec {
        title: title.into(),
        description: description.into(),
        scope: format!("{GOAL_CONTROLLER_TASK_SCOPE_PREFIX}{worker_index}:{kind}"),
    }
}

fn goal_open_assigned_task_for_worker<'a>(
    snapshot: &'a GoalStatusSnapshot,
    worker_index: u32,
) -> Option<&'a GoalTaskBrief> {
    let prefix = format!("{GOAL_CONTROLLER_TASK_SCOPE_PREFIX}{worker_index}:");
    snapshot.tasks.iter().find(|task| {
        task.status == GoalTaskStatus::Open
            && task
                .scope
                .as_deref()
                .is_some_and(|scope| scope.starts_with(&prefix))
    })
}

fn goal_has_open_assigned_task(snapshot: &GoalStatusSnapshot) -> bool {
    snapshot.tasks.iter().any(|task| {
        task.status == GoalTaskStatus::Open
            && task
                .scope
                .as_deref()
                .is_some_and(|scope| scope.starts_with(GOAL_CONTROLLER_TASK_SCOPE_PREFIX))
    })
}

fn goal_worker_slot_exists(slots: &[GoalWorkerSlot], worker_index: u32) -> bool {
    slots.iter().any(|slot| slot.worker_index == worker_index)
}

fn goal_task_is_controller_assigned(task: &GoalTaskBrief) -> bool {
    task.scope
        .as_deref()
        .is_some_and(|scope| scope.starts_with(GOAL_CONTROLLER_TASK_SCOPE_PREFIX))
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct GoalWorkerTerminalCounts {
    terminal_task_count: usize,
    result_event_count: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct GoalWorkerProgressCounts {
    task_count: usize,
    worker_event_count: usize,
}

async fn start_goal_worker_slots(
    galley: &SqliteGalley,
    wave_start_snapshot: &GoalStatusSnapshot,
    goal: &GoalBrief,
    existing_slots: &[GoalWorkerSlot],
    runtime: RuntimeArg,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<Vec<GoalWorkerSlot>, GalleyError> {
    let wave = 1_u32;
    // Workers inherit the master session's model (set at launch from the
    // operator's Composer pick) so the whole goal runs on one model
    // rather than the GA default. None → default, same as before.
    let worker_llm = match goal.master_session_id.as_ref() {
        Some(master_id) => galley
            .session_brief(master_id.clone())
            .await
            .ok()
            .and_then(|s| s.selected_llm_display_name),
        None => None,
    };
    let mut slots = Vec::new();
    for worker_index in 1..=goal.worker_limit {
        if goal_worker_slot_exists(existing_slots, worker_index) {
            continue;
        }
        let Some(assigned_task) = goal_open_assigned_task_for_worker(wave_start_snapshot, worker_index) else {
            continue;
        };
        let prompt = goal_worker_prompt_template(goal, wave, worker_index, Some(assigned_task));
        let result =
            session_new_goal_worker_value(
                prompt,
                Some(goal.project_id.0.clone()),
                worker_llm.clone(),
                runtime,
                supervisor.clone(),
                Some(reason.clone().unwrap_or_else(|| {
                    format!("goal {} wave {wave} worker {worker_index}", goal.id)
                })),
            )
            .await?;
        let session_id = result
            .get("session")
            .and_then(|s| s.get("id"))
            .and_then(Value::as_str)
            .map(|sid| SessionId(sid.to_string()))
            .ok_or_else(|| GalleyError::Internal {
                message: "session.new_goal_worker response missing session.id".to_string(),
            })?;
        let baseline = goal_worker_wave_baseline(wave_start_snapshot, session_id.clone());
        let _ = galley
            .create_goal_event(CreateGoalEventInput {
                goal_id: goal.id.clone(),
                task_id: None,
                author_session_id: Some(session_id.clone()),
                event_type: GoalEventType::System,
                body: format!("Wave {wave} worker {worker_index} session started."),
            })
            .await;
        emit_json(&GoalRunFrame {
            schema_version: SCHEMA_VERSION,
            stream: "goal",
            phase: "worker_started",
            goal,
            session_id: Some(session_id.0.clone()),
            note: Some(format!(
                "wave {wave}; worker {worker_index}/{}",
                goal.worker_limit
            )),
        })?;
        slots.push(GoalWorkerSlot {
            worker_index,
            wave,
            baseline,
            capped: false,
        });
    }
    Ok(slots)
}

async fn continue_goal_worker_slot(
    galley: &SqliteGalley,
    snapshot_before_continue: &GoalStatusSnapshot,
    goal: &GoalBrief,
    slot: &mut GoalWorkerSlot,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<bool, GalleyError> {
    if slot.capped {
        return Ok(false);
    }
    if slot.wave >= GOAL_CONTROLLER_MAX_WAVES {
        slot.capped = true;
        let _ = galley
            .create_goal_event(CreateGoalEventInput {
                goal_id: goal.id.clone(),
                task_id: None,
                author_session_id: Some(slot.session_id().clone()),
                event_type: GoalEventType::System,
                body: format!(
                    "Worker {} reached the per-slot wave cap at wave {}; no more task wakes will be dispatched for this slot.",
                    slot.worker_index, slot.wave
                ),
            })
            .await;
        return Ok(false);
    }

    let next_wave = slot.wave.saturating_add(1);
    let session_id = slot.session_id().clone();
    let Some(task) = goal_open_assigned_task_for_worker(snapshot_before_continue, slot.worker_index)
    else {
        return Ok(false);
    };
    let task = task.clone();
    let prompt = goal_worker_wake_prompt(goal, next_wave, slot.worker_index, &session_id, &task);
    session_send_value(
        session_id.0.clone(),
        prompt,
        supervisor.clone(),
        Some(reason.clone().unwrap_or_else(|| {
            format!(
                "goal {} wave {next_wave} worker {}",
                goal.id, slot.worker_index
            )
        })),
    )
    .await?;
    slot.wave = next_wave;
    slot.baseline = goal_worker_wave_baseline(snapshot_before_continue, session_id.clone());
    let _ = galley
        .create_goal_event(CreateGoalEventInput {
            goal_id: goal.id.clone(),
            task_id: Some(task.id.clone()),
            author_session_id: Some(session_id.clone()),
            event_type: GoalEventType::System,
            body: format!(
                "Wave {next_wave} worker {} wake task {} dispatched in existing session.",
                slot.worker_index, task.id
            ),
        })
        .await;
    emit_json(&GoalRunFrame {
        schema_version: SCHEMA_VERSION,
        stream: "goal",
        phase: "worker_started",
        goal,
        session_id: Some(session_id.0),
        note: Some(format!(
            "wave {next_wave}; worker {}/{}",
            slot.worker_index, goal.worker_limit
        )),
    })?;
    Ok(true)
}

fn goal_worker_wave_baseline(
    snapshot: &GoalStatusSnapshot,
    session_id: SessionId,
) -> GoalWorkerWaveBaseline {
    GoalWorkerWaveBaseline {
        terminal_counts: goal_worker_terminal_counts(snapshot, &session_id),
        progress_counts: goal_worker_progress_counts(snapshot, &session_id),
        session_id,
        reminder_sent: false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GoalControllerDecision {
    Continue,
    WaitForSignal,
    Wrap(GoalWrapReason),
    Fail(GoalFailReason),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GoalWrapReason {
    Deadline,
    DrainCap,
    WaveCap,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GoalFailReason {
    NoResultByDeadline,
    NoResultByWaveCap,
}

fn goal_controller_decision(
    budget_left: bool,
    has_synthesis_material: bool,
    all_worker_slots_capped: bool,
) -> GoalControllerDecision {
    if budget_left && all_worker_slots_capped {
        return if has_synthesis_material {
            GoalControllerDecision::Wrap(GoalWrapReason::WaveCap)
        } else {
            GoalControllerDecision::Fail(GoalFailReason::NoResultByWaveCap)
        };
    }
    if budget_left {
        return GoalControllerDecision::Continue;
    }
    if has_synthesis_material {
        GoalControllerDecision::Wrap(GoalWrapReason::Deadline)
    } else {
        GoalControllerDecision::Fail(GoalFailReason::NoResultByDeadline)
    }
}

fn goal_controller_decision_after_wait(
    wait_outcome: GoalWorkerWaitOutcome,
    budget_left: bool,
    has_synthesis_material: bool,
    all_worker_slots_capped: bool,
) -> GoalControllerDecision {
    if wait_outcome == GoalWorkerWaitOutcome::DrainCapReached {
        return GoalControllerDecision::Wrap(GoalWrapReason::DrainCap);
    }
    if wait_outcome == GoalWorkerWaitOutcome::IdleWithoutSignal && budget_left {
        return GoalControllerDecision::WaitForSignal;
    }
    goal_controller_decision(budget_left, has_synthesis_material, all_worker_slots_capped)
}

fn goal_waiting_for_worker_signal_summary(wave: u32, had_protocol_activity: bool) -> String {
    if had_protocol_activity {
        return format!(
            "Wave {wave} has worker activity but no terminal task/result yet; waiting until the Goal deadline without assigning another task."
        );
    }
    format!(
        "Wave {wave} has no terminal task/result yet; waiting until the Goal deadline without assigning another task."
    )
}

fn goal_slot_wake_summary(
    worker_indices: &[u32],
    has_result_signal: bool,
    incomplete_tasks: bool,
) -> String {
    let workers = worker_indices
        .iter()
        .map(|index| format!("worker {index}"))
        .collect::<Vec<_>>()
        .join(", ");
    if has_result_signal && incomplete_tasks {
        return format!(
            "{workers} produced terminal results while tasks remain; budget remains, assigning concrete follow-up tasks."
        );
    }
    if has_result_signal {
        return format!(
            "{workers} produced a terminal result signal; budget remains, assigning concrete review, validation, and refinement tasks."
        );
    }
    format!(
        "{workers} produced a terminal task signal without a result; budget remains, assigning concrete follow-up tasks."
    )
}

fn goal_wrapping_summary(reason: GoalWrapReason, incomplete_tasks: bool) -> String {
    match (reason, incomplete_tasks) {
        (GoalWrapReason::Deadline, true) => {
            "Goal budget reached with unfinished tasks; starting master synthesis with the best available results.".to_string()
        }
        (GoalWrapReason::Deadline, false) => {
            "Goal budget reached; starting master synthesis.".to_string()
        }
        (GoalWrapReason::DrainCap, true) => {
            "Goal drain cap reached while some workers may still be active; synthesizing available results with unfinished tasks noted.".to_string()
        }
        (GoalWrapReason::DrainCap, false) => {
            "Goal drain cap reached while some workers may still be active; synthesizing available results.".to_string()
        }
        (GoalWrapReason::WaveCap, true) => {
            "Goal wave cap reached with unfinished tasks; starting master synthesis with accumulated results.".to_string()
        }
        (GoalWrapReason::WaveCap, false) => {
            "Goal wave cap reached; starting master synthesis with accumulated results.".to_string()
        }
    }
}

fn goal_failure_summary(reason: GoalFailReason) -> String {
    match reason {
        GoalFailReason::NoResultByDeadline => {
            "Goal failed: budget ended without worker activity or available output.".to_string()
        }
        GoalFailReason::NoResultByWaveCap => {
            "Goal failed: wave cap reached without worker activity or available output.".to_string()
        }
    }
}

fn goal_has_incomplete_tasks(snapshot: &GoalStatusSnapshot) -> bool {
    snapshot.tasks.iter().any(|task| {
        matches!(
            task.status,
            GoalTaskStatus::Open
                | GoalTaskStatus::Claimed
                | GoalTaskStatus::Running
                | GoalTaskStatus::Blocked
        )
    })
}

fn goal_has_result_signal(snapshot: &GoalStatusSnapshot) -> bool {
    snapshot
        .tasks
        .iter()
        .any(|task| task.status == GoalTaskStatus::Completed)
        || snapshot
            .events
            .iter()
            .any(|event| event.event_type == GoalEventType::Result)
}

fn goal_has_worker_material_signal(snapshot: &GoalStatusSnapshot) -> bool {
    snapshot.tasks.iter().any(|task| {
        task.owner_session_id.is_some()
            || task.status != GoalTaskStatus::Open
            || !goal_task_is_controller_assigned(task)
    }) || snapshot.events.iter().any(|event| {
        matches!(
            event.event_type,
            GoalEventType::Plan
                | GoalEventType::Claim
                | GoalEventType::Progress
                | GoalEventType::Result
                | GoalEventType::Conflict
        )
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct GoalActivityCounts {
    task_count: usize,
    completed_task_count: usize,
    worker_event_count: usize,
    result_event_count: usize,
}

fn goal_activity_counts(snapshot: &GoalStatusSnapshot) -> GoalActivityCounts {
    GoalActivityCounts {
        task_count: snapshot
            .tasks
            .iter()
            .filter(|task| {
                task.owner_session_id.is_some()
                    || task.status != GoalTaskStatus::Open
                    || !goal_task_is_controller_assigned(task)
            })
            .count(),
        completed_task_count: snapshot
            .tasks
            .iter()
            .filter(|task| task.status == GoalTaskStatus::Completed)
            .count(),
        worker_event_count: snapshot
            .events
            .iter()
            .filter(|event| {
                matches!(
                    event.event_type,
                    GoalEventType::Plan
                        | GoalEventType::Claim
                        | GoalEventType::Progress
                        | GoalEventType::Result
                        | GoalEventType::Conflict
                )
            })
            .count(),
        result_event_count: snapshot
            .events
            .iter()
            .filter(|event| event.event_type == GoalEventType::Result)
            .count(),
    }
}

fn goal_activity_increased(before: GoalActivityCounts, after: GoalActivityCounts) -> bool {
    after.task_count > before.task_count
        || after.completed_task_count > before.completed_task_count
        || after.worker_event_count > before.worker_event_count
        || after.result_event_count > before.result_event_count
}

fn goal_worker_slot_session_ids(slots: &[GoalWorkerSlot]) -> Vec<SessionId> {
    slots.iter().map(|slot| slot.session_id().clone()).collect()
}

fn goal_worker_slots_all_capped(slots: &[GoalWorkerSlot]) -> bool {
    !slots.is_empty() && slots.iter().all(|slot| slot.capped)
}

fn goal_worker_max_wave(slots: &[GoalWorkerSlot]) -> u32 {
    slots.iter().map(|slot| slot.wave).max().unwrap_or(1)
}

fn goal_ready_worker_slot_indices(
    snapshot: &GoalStatusSnapshot,
    slots: &[GoalWorkerSlot],
) -> Vec<usize> {
    slots
        .iter()
        .enumerate()
        .filter_map(|(index, slot)| {
            if slot.capped || !goal_worker_has_terminal_signal(snapshot, &slot.baseline) {
                None
            } else {
                Some(index)
            }
        })
        .collect()
}

fn goal_ready_idle_worker_slot_indices(
    snapshot: &GoalStatusSnapshot,
    slots: &[GoalWorkerSlot],
    live_session_ids: &[SessionId],
) -> Vec<usize> {
    goal_ready_worker_slot_indices(snapshot, slots)
        .into_iter()
        .filter(|index| {
            slots.get(*index).is_some_and(|slot| {
                !live_session_ids
                    .iter()
                    .any(|live| live == slot.session_id())
            })
        })
        .collect()
}

fn goal_any_worker_slot_has_progress_signal(
    snapshot: &GoalStatusSnapshot,
    slots: &[GoalWorkerSlot],
) -> bool {
    slots
        .iter()
        .filter(|slot| !slot.capped)
        .any(|slot| goal_worker_has_progress_signal(snapshot, &slot.baseline))
}

async fn goal_worker_sessions_have_output(
    galley: &SqliteGalley,
    worker_session_ids: &[SessionId],
) -> Result<bool, GalleyError> {
    for session_id in worker_session_ids {
        let messages = galley
            .session_messages(session_id.clone(), Some(12))
            .await?;
        if messages
            .iter()
            .any(|message| message.role == MessageRole::Agent && !message.content.trim().is_empty())
        {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn wait_goal_worker_sessions(
    galley: &SqliteGalley,
    worker_slots: &mut [GoalWorkerSlot],
    goal: &GoalBrief,
    controller_started: Instant,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<GoalWorkerWaitOutcome, GalleyError> {
    if worker_slots.is_empty() {
        return Ok(GoalWorkerWaitOutcome::IdleWithoutSignal);
    }

    let started_wait = Instant::now();
    let drain_cap = Duration::from_secs(goal_drain_cap_seconds(goal.budget_seconds));
    let mut drain_started: Option<Instant> = None;
    loop {
        if goal_stop_requested(galley, goal).await? {
            return Ok(GoalWorkerWaitOutcome::IdleWithoutSignal);
        }
        let snapshot = galley.goal_status(goal.id.clone()).await?;
        if goal_has_result_signal(&snapshot) || goal_has_worker_material_signal(&snapshot) {
            post_goal_master_checkpoint(
                galley,
                &snapshot,
                GoalMasterCheckpointKind::FirstMaterial,
                "已有初步进展，正在继续核对和整理。".to_string(),
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
        }
        let mut live_session_ids = Vec::new();
        for slot in worker_slots.iter() {
            let session = galley.session_brief(slot.session_id().clone()).await?;
            if is_live_candidate(session.status) {
                live_session_ids.push(slot.session_id().clone());
            }
        }
        if goal_budget_left(goal, controller_started) {
            let ready_slots =
                goal_ready_idle_worker_slot_indices(&snapshot, worker_slots, &live_session_ids);
            if !ready_slots.is_empty() {
                return Ok(GoalWorkerWaitOutcome::ReadySlots(ready_slots));
            }
        }
        let has_progress_signal = goal_any_worker_slot_has_progress_signal(&snapshot, worker_slots);
        let any_live = !live_session_ids.is_empty();
        if !any_live {
            if goal_budget_left(goal, controller_started) {
                if has_progress_signal {
                    tokio::time::sleep(Duration::from_millis(1000)).await;
                    continue;
                }
                if started_wait.elapsed() < Duration::from_secs(GOAL_WORKER_SIGNAL_GRACE_SECONDS) {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    continue;
                }
                if send_goal_worker_protocol_reminders(
                    galley,
                    goal,
                    worker_slots,
                    &snapshot,
                    supervisor.clone(),
                    reason.clone(),
                )
                .await?
                {
                    tokio::time::sleep(Duration::from_millis(1000)).await;
                    continue;
                }
            }
            return Ok(GoalWorkerWaitOutcome::IdleWithoutSignal);
        }
        if goal_budget_left(goal, controller_started) {
            tokio::time::sleep(Duration::from_millis(1000)).await;
            continue;
        }
        if drain_started.is_none() {
            post_goal_master_checkpoint(
                galley,
                &snapshot,
                GoalMasterCheckpointKind::DeadlineReached,
                "运行时间已到，正在等待当前任务收尾并整理结果。".to_string(),
                supervisor.clone(),
                reason.clone(),
            )
            .await?;
            let summary = format!(
                "Goal deadline reached; waiting up to {}s for active workers to finish before master synthesis.",
                drain_cap.as_secs()
            );
            galley
                .create_goal_event(CreateGoalEventInput {
                    goal_id: goal.id.clone(),
                    task_id: None,
                    author_session_id: None,
                    event_type: GoalEventType::Synthesis,
                    body: summary,
                })
                .await?;
            drain_started = Some(Instant::now());
        }
        if drain_started
            .map(|started| started.elapsed() >= drain_cap)
            .unwrap_or(false)
        {
            return Ok(GoalWorkerWaitOutcome::DrainCapReached);
        }
        tokio::time::sleep(Duration::from_millis(1000)).await;
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum GoalWorkerWaitOutcome {
    ReadySlots(Vec<usize>),
    IdleWithoutSignal,
    DrainCapReached,
}

async fn send_goal_worker_protocol_reminders(
    galley: &SqliteGalley,
    goal: &GoalBrief,
    worker_slots: &mut [GoalWorkerSlot],
    snapshot: &GoalStatusSnapshot,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<bool, GalleyError> {
    let mut sent = false;
    for slot in worker_slots.iter_mut() {
        if slot.capped
            || slot.baseline.reminder_sent
            || goal_worker_has_terminal_signal(snapshot, &slot.baseline)
        {
            continue;
        }
        let wave = slot.wave;
        let session_id = slot.session_id().clone();
        let prompt = goal_worker_protocol_reminder_prompt(goal, wave, &session_id);
        session_send_value(
            session_id.0.clone(),
            prompt,
            supervisor.clone(),
            Some(reason.clone().unwrap_or_else(|| {
                format!(
                    "goal {} wave {wave} worker {} protocol reminder",
                    goal.id, slot.worker_index
                )
            })),
        )
        .await?;
        slot.baseline.reminder_sent = true;
        sent = true;
        let _ = galley
            .create_goal_event(CreateGoalEventInput {
                goal_id: goal.id.clone(),
                task_id: None,
                author_session_id: Some(session_id),
                event_type: GoalEventType::System,
                body: format!(
                    "Wave {wave} worker {} protocol reminder sent; waiting for terminal task/result signal.",
                    slot.worker_index
                ),
            })
            .await;
    }
    Ok(sent)
}

fn goal_worker_has_terminal_signal(
    snapshot: &GoalStatusSnapshot,
    baseline: &GoalWorkerWaveBaseline,
) -> bool {
    let current = goal_worker_terminal_counts(snapshot, &baseline.session_id);
    current.terminal_task_count > baseline.terminal_counts.terminal_task_count
        || current.result_event_count > baseline.terminal_counts.result_event_count
}

fn goal_worker_has_progress_signal(
    snapshot: &GoalStatusSnapshot,
    baseline: &GoalWorkerWaveBaseline,
) -> bool {
    if goal_worker_has_terminal_signal(snapshot, baseline) {
        return true;
    }
    let current = goal_worker_progress_counts(snapshot, &baseline.session_id);
    current.task_count > baseline.progress_counts.task_count
        || current.worker_event_count > baseline.progress_counts.worker_event_count
}

fn goal_worker_terminal_counts(
    snapshot: &GoalStatusSnapshot,
    session_id: &SessionId,
) -> GoalWorkerTerminalCounts {
    let terminal_task_count = snapshot
        .tasks
        .iter()
        .filter(|task| {
            task.owner_session_id.as_ref() == Some(session_id)
                && goal_task_status_is_terminal(task.status)
        })
        .count();
    let result_event_count = snapshot
        .events
        .iter()
        .filter(|event| goal_result_event_belongs_to_worker(snapshot, event, session_id))
        .count();
    GoalWorkerTerminalCounts {
        terminal_task_count,
        result_event_count,
    }
}

fn goal_worker_progress_counts(
    snapshot: &GoalStatusSnapshot,
    session_id: &SessionId,
) -> GoalWorkerProgressCounts {
    let task_count = snapshot
        .tasks
        .iter()
        .filter(|task| task.owner_session_id.as_ref() == Some(session_id))
        .count();
    let worker_event_count = snapshot
        .events
        .iter()
        .filter(|event| {
            event.author_session_id.as_ref() == Some(session_id)
                && matches!(
                    event.event_type,
                    GoalEventType::Plan
                        | GoalEventType::Claim
                        | GoalEventType::Progress
                        | GoalEventType::Result
                        | GoalEventType::Conflict
                )
        })
        .count();
    GoalWorkerProgressCounts {
        task_count,
        worker_event_count,
    }
}

fn goal_task_status_is_terminal(status: GoalTaskStatus) -> bool {
    matches!(
        status,
        GoalTaskStatus::Completed | GoalTaskStatus::Blocked | GoalTaskStatus::Cancelled
    )
}

fn goal_result_event_belongs_to_worker(
    snapshot: &GoalStatusSnapshot,
    event: &GoalEventBrief,
    session_id: &SessionId,
) -> bool {
    if event.event_type != GoalEventType::Result {
        return false;
    }
    if event.author_session_id.as_ref() == Some(session_id) {
        return true;
    }
    let Some(task_id) = event.task_id.as_ref() else {
        return false;
    };
    snapshot
        .tasks
        .iter()
        .any(|task| task.id == *task_id && task.owner_session_id.as_ref() == Some(session_id))
}

fn goal_drain_cap_seconds(budget_seconds: u32) -> u64 {
    let quarter_budget = u64::from(budget_seconds).saturating_div(4);
    quarter_budget
        .max(GOAL_CONTROLLER_MIN_DRAIN_SECONDS)
        .min(GOAL_CONTROLLER_MAX_DRAIN_SECONDS)
}

async fn goal_stop_requested(galley: &SqliteGalley, goal: &GoalBrief) -> Result<bool, GalleyError> {
    Ok(galley
        .goal_status(goal.id.clone())
        .await?
        .goal
        .stop_requested)
}

async fn shutdown_goal_worker_runners(
    _galley: &SqliteGalley,
    snapshot: &GoalStatusSnapshot,
    worker_session_ids: &[SessionId],
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let worker_ids = goal_worker_session_ids(snapshot, worker_session_ids);
    for session_id in worker_ids {
        session_shutdown_runner_value(
            session_id.0,
            supervisor.clone(),
            reason
                .clone()
                .or_else(|| Some(format!("goal {} worker runner cleanup", snapshot.goal.id))),
        )
        .await?;
    }
    Ok(())
}

fn goal_worker_session_ids(
    snapshot: &GoalStatusSnapshot,
    worker_session_ids: &[SessionId],
) -> Vec<SessionId> {
    let mut out = Vec::new();
    let event_worker_ids = snapshot
        .events
        .iter()
        .filter_map(|event| event.author_session_id.clone())
        .filter(|session_id| Some(session_id) != snapshot.goal.master_session_id.as_ref())
        .collect::<Vec<_>>();
    let source: Vec<SessionId> = if !worker_session_ids.is_empty() {
        worker_session_ids.to_vec()
    } else if !event_worker_ids.is_empty() {
        event_worker_ids
    } else {
        snapshot
            .sessions
            .iter()
            .filter(|session| Some(&session.id) != snapshot.goal.master_session_id.as_ref())
            .map(|session| session.id.clone())
            .collect()
    };
    for session_id in source {
        if !out.iter().any(|existing| existing == &session_id) {
            out.push(session_id);
        }
    }
    out
}

async fn wait_master_final_answer(
    galley: &SqliteGalley,
    session_id: &SessionId,
    previous_turn_count: u32,
) -> Result<MessageBrief, GalleyError> {
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(300) {
        let session = galley.session_brief(session_id.clone()).await?;
        let messages = galley
            .session_messages(session_id.clone(), Some(12))
            .await?;
        let final_answer = messages
            .iter()
            .rev()
            .find(|message| {
                message.role == MessageRole::Agent
                    && message.turn_index.unwrap_or(0) >= previous_turn_count
                    && message
                        .final_answer
                        .as_deref()
                        .is_some_and(|answer| !answer.trim().is_empty())
            })
            .cloned();
        if let Some(message) = final_answer {
            if !is_live_candidate(session.status) {
                return Ok(message);
            }
        }
        tokio::time::sleep(Duration::from_millis(1000)).await;
    }
    Err(GalleyError::RunnerError {
        message: format!("master session {session_id} did not produce a final answer within 300s"),
    })
}

async fn finish_goal_with_master(
    galley: &SqliteGalley,
    snapshot: GoalStatusSnapshot,
    worker_session_ids: &[SessionId],
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let goal = snapshot.goal.clone();
    shutdown_goal_worker_runners(
        galley,
        &snapshot,
        worker_session_ids,
        supervisor.clone(),
        reason
            .clone()
            .or_else(|| Some(format!("goal {} entering master synthesis", goal.id))),
    )
    .await?;
    let Some(master_session_id) = goal.master_session_id.clone() else {
        let summary = goal
            .latest_summary
            .clone()
            .unwrap_or_else(|| "Goal completed without a desktop master session.".to_string());
        galley
            .create_goal_event(CreateGoalEventInput {
                goal_id: goal.id.clone(),
                task_id: None,
                author_session_id: None,
                event_type: GoalEventType::Synthesis,
                body: summary.clone(),
            })
            .await?;
        let final_goal = galley
            .update_goal_state(goal.id.clone(), GoalStatus::Completed, Some(summary))
            .await?;
        emit_json(&GoalRunFrame {
            schema_version: SCHEMA_VERSION,
            stream: "goal",
            phase: "finished",
            goal: &final_goal,
            session_id: None,
            note: None,
        })?;
        return Ok(());
    };

    let before_turn_count = galley
        .session_brief(master_session_id.clone())
        .await?
        .turn_count
        .unwrap_or(0);
    let dispatch_content =
        build_goal_synthesis_prompt(galley, &snapshot, worker_session_ids).await?;
    session_goal_synthesize_value(
        master_session_id.0.clone(),
        "正在生成最终汇总。".to_string(),
        dispatch_content,
        supervisor.clone(),
        reason
            .clone()
            .or_else(|| Some(format!("goal {} master synthesis", goal.id))),
    )
    .await?;
    let final_answer_message =
        wait_master_final_answer(galley, &master_session_id, before_turn_count).await?;

    let summary = final_answer_message
        .final_answer
        .as_deref()
        .and_then(first_non_empty_line)
        .or_else(|| first_non_empty_line(&final_answer_message.content))
        .or_else(|| final_answer_message.summary.clone())
        .unwrap_or_else(|| "Goal completed and master synthesis was delivered.".to_string());

    galley
        .create_goal_event(CreateGoalEventInput {
            goal_id: goal.id.clone(),
            task_id: None,
            author_session_id: Some(master_session_id.clone()),
            event_type: GoalEventType::Synthesis,
            body: summary.clone(),
        })
        .await?;
    let final_goal = galley
        .update_goal_state(goal.id.clone(), GoalStatus::Completed, Some(summary))
        .await?;
    let completed_snapshot = galley.goal_status(final_goal.id.clone()).await?;
    shutdown_goal_worker_runners(
        galley,
        &completed_snapshot,
        worker_session_ids,
        supervisor.clone(),
        Some(format!("goal {} completed worker cleanup", final_goal.id)),
    )
    .await?;
    emit_json(&GoalRunFrame {
        schema_version: SCHEMA_VERSION,
        stream: "goal",
        phase: "finished",
        goal: &final_goal,
        session_id: Some(master_session_id.0),
        note: final_goal.latest_summary.clone(),
    })?;
    Ok(())
}

async fn build_goal_synthesis_prompt(
    galley: &SqliteGalley,
    snapshot: &GoalStatusSnapshot,
    worker_session_ids: &[SessionId],
) -> Result<String, GalleyError> {
    let goal = &snapshot.goal;
    let fallback_worker_ids = goal_worker_session_ids(snapshot, worker_session_ids);
    let worker_ids = fallback_worker_ids.as_slice();
    let mut out = String::new();
    push_limited(
        &mut out,
        &format!(
            "[Galley Goal Master Synthesis]\n\nYou are the master session for this Galley Goal. Answer the user directly in their language. Do not expose worker protocol, Goal ids, command logs, or internal coordination unless it materially helps the user.\n\nObjective:\n{}\n\nProduce a concise final answer with: conclusion, key evidence, important gaps or caveats, and next actions. Internal temp paths are scratch; only report a file path as the deliverable when the user explicitly asked Galley to save there.\n\nGoal status: {:?}\nProject id: {}\n\n",
            goal.objective,
            goal.status,
            goal.project_id
        ),
        28_000,
    );

    if let Some(deliverable) = snapshot.deliverable.as_ref() {
        // The anchor is the curated current-best result. Deliver it as the
        // spine — polish/format only — rather than rebuilding from scattered
        // worker output. Task board / events / worker outputs below are
        // supporting context for final polish, not a fresh synthesis source.
        push_limited(
            &mut out,
            &format!(
                "Current deliverable anchor (version {}) — this is the curated best result. Deliver it as the final answer, polishing wording and structure only; do not discard or rebuild it. The sections below are context for last-mile polish.\n\n--- DELIVERABLE ANCHOR START ---\n{}\n--- DELIVERABLE ANCHOR END ---\n\n",
                deliverable.version, deliverable.content
            ),
            // Allow the anchor itself to be large; it is the payload.
            300_000,
        );
    }

    if let Some(listing) = goal_workspace_file_listing(goal) {
        // File/code deliverable: the real artifact lives in the workspace.
        // Tell the master to deliver a summary + point at the folder rather
        // than dumping file contents into the conversation.
        push_limited(
            &mut out,
            &format!(
                "This Goal produced files in its shared workspace ({}). These files are the deliverable. In the final answer, summarize what was built and how to use/run it, and tell the user the result files are in the Goal's output folder — do NOT paste full file contents into the conversation. Workspace files:\n{}\n\n",
                goal.workspace_path.as_deref().unwrap_or(""),
                listing
            ),
            34_000,
        );
    }

    if !snapshot.tasks.is_empty() {
        push_limited(&mut out, "Task board:\n", 28_000);
        for task in &snapshot.tasks {
            push_limited(
                &mut out,
                &format!(
                    "- [{:?}] {} | owner={:?} | scope={:?}\n  result={}\n",
                    task.status,
                    task.title,
                    task.owner_session_id,
                    task.scope,
                    task.result_summary.as_deref().unwrap_or("")
                ),
                28_000,
            );
        }
        push_limited(&mut out, "\n", 28_000);
    }

    if !snapshot.events.is_empty() {
        push_limited(&mut out, "Goal events:\n", 28_000);
        for event in &snapshot.events {
            push_limited(
                &mut out,
                &format!(
                    "- {:?} by {:?}: {}\n",
                    event.event_type, event.author_session_id, event.body
                ),
                28_000,
            );
        }
        push_limited(&mut out, "\n", 28_000);
    }

    push_limited(&mut out, "Worker session latest output:\n", 28_000);
    for session_id in worker_ids {
        let messages = galley.session_messages(session_id.clone(), Some(6)).await?;
        push_limited(
            &mut out,
            &format!("\n## Worker session {session_id}\n"),
            28_000,
        );
        for message in messages {
            let body = message
                .final_answer
                .as_deref()
                .filter(|answer| !answer.trim().is_empty())
                .unwrap_or(&message.content);
            if body.trim().is_empty() {
                continue;
            }
            push_limited(
                &mut out,
                &format!("{:?}: {}\n", message.role, compact_text(body, 2400)),
                28_000,
            );
        }
    }
    Ok(out)
}

fn first_non_empty_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| compact_text(line, 600))
}

fn compact_text(text: &str, max_chars: usize) -> String {
    let one_line = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() <= max_chars {
        return one_line;
    }
    let mut out: String = one_line.chars().take(max_chars.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn push_limited(out: &mut String, text: &str, max_chars: usize) {
    if out.chars().count() >= max_chars {
        return;
    }
    let remaining = max_chars.saturating_sub(out.chars().count());
    if text.chars().count() <= remaining {
        out.push_str(text);
    } else {
        out.extend(text.chars().take(remaining.saturating_sub(1)));
        out.push('…');
    }
}

fn goal_budget_left(goal: &GoalBrief, controller_started: Instant) -> bool {
    if let Some(deadline) = parse_goal_iso_seconds(&goal.deadline_at) {
        return unix_now_seconds() < deadline;
    }
    controller_started.elapsed() < Duration::from_secs(u64::from(goal.budget_seconds.max(60)))
}

fn parse_goal_iso_seconds(value: &str) -> Option<i64> {
    let year = value.get(0..4)?.parse::<i64>().ok()?;
    let month = value.get(5..7)?.parse::<i64>().ok()?;
    let day = value.get(8..10)?.parse::<i64>().ok()?;
    let hour = value.get(11..13)?.parse::<i64>().ok()?;
    let minute = value.get(14..16)?.parse::<i64>().ok()?;
    let second = value.get(17..19)?.parse::<i64>().ok()?;
    if value.get(4..5)? != "-"
        || value.get(7..8)? != "-"
        || value.get(10..11)? != "T"
        || value.get(13..14)? != ":"
        || value.get(16..17)? != ":"
    {
        return None;
    }
    let days = days_from_civil(year, month, day)?;
    Some(days * 86_400 + hour * 3_600 + minute * 60 + second)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let y = year - i64::from(month <= 2);
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = month + if month > 2 { -3 } else { 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146_097 + doe - 719_468)
}

fn unix_now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn runtime_arg_from_kind(kind: RuntimeKind) -> RuntimeArg {
    match kind {
        RuntimeKind::Managed => RuntimeArg::Managed,
        RuntimeKind::External => RuntimeArg::External,
    }
}

fn goal_master_duty_prompt(runtime_kind: RuntimeKind) -> String {
    match runtime_kind {
        RuntimeKind::Managed => {
            // Managed GA has the Galley-seeded Hive master SOP in memory
            // (and may have self-evolved it), so point it at the file.
            r#"Master discipline:
- Read memory/goal_hive_master_duty.md and follow it. You are the design office: decompose, judge, aggregate — never produce deliverable content yourself.
- Run rounds as probe -> design -> execute -> check: spread divergent work (probe/check) across parallel workers, converge yourself (design/execute selection).
- Keep a single "current best accepted version" as the anchor; each round make incremental changes on it; only merge a change when it raises quality, roll back if it gets worse.
- Drive toward a deliverable a critical reviewer can find no fault in within the budget; keep the core deliverable clean and separate from process notes."#
                .to_string()
        }
        RuntimeKind::External => {
            // Attached GA can't read the seeded memory file and Galley must
            // not write into the user's GA checkout (Rule 1). Point the
            // master at Galley's own materialized SOP copy (written by the
            // controller before planning). Mirrors managed "read a file",
            // just a Galley-owned path. Falls back to a short inline brief
            // only if the data dir can't be resolved.
            match galley_core_lib::goal_master_duty_sop_path() {
                Some(path) => format!(
                    "Master discipline — you are the Hive master (design office: decompose, judge, aggregate; never produce deliverable content yourself). Read {} and follow it for the whole run.",
                    path.display()
                ),
                None => r#"Master discipline (you are the design office: decompose, judge, aggregate — never produce deliverable content yourself):
- Run rounds as probe -> design -> execute -> check. Spread divergent work (probe/check) across parallel workers; converge yourself on design and selection.
- Keep a single "current best accepted version" as the anchor. Each round make incremental changes on it; only merge a change when it raises quality; roll back if it gets worse — never lose ground.
- Drive toward a deliverable a critical reviewer can find no fault in within the budget. Keep the core deliverable clean and separate from process notes."#
                    .to_string(),
            }
        }
    }
}

/// Shared file-workspace instruction injected into master + worker
/// prompts when the goal has a workspace path (P3). Empty string when
/// none, so callers can unconditionally interpolate it.
fn goal_workspace_prompt_block(goal: &GoalBrief) -> String {
    match goal.workspace_path.as_deref() {
        Some(path) => format!(
            r#"Shared file workspace: {path}
- This directory is shared by the master and all workers. For file/code deliverables, read and write files here (create it if it does not exist); coordinate who touches what via the task board to avoid clobbering.
- Keep the core deliverable at the top level; put scratch/intermediate files in subfolders so the final deliverable is easy to locate.
- Check tasks run/test artifacts here and return reproducible evidence (commands + output).
- For purely textual deliverables you may ignore the workspace and use the deliverable anchor instead."#
        ),
        None => String::new(),
    }
}

/// Relative listing of the goal workspace, or None when it is missing /
/// empty. Used at synthesis to decide file-vs-text delivery and to point
/// the master at the produced files.
fn goal_workspace_file_listing(goal: &GoalBrief) -> Option<String> {
    let path = goal.workspace_path.as_deref()?;
    let root = std::path::Path::new(path);
    let mut files: Vec<String> = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir).ok()?;
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p);
            } else if let Ok(rel) = p.strip_prefix(root) {
                files.push(rel.to_string_lossy().into_owned());
                if files.len() >= 200 {
                    break;
                }
            }
        }
    }
    if files.is_empty() {
        return None;
    }
    files.sort();
    Some(files.join("\n"))
}

fn goal_memory_policy_prompt(runtime_kind: RuntimeKind) -> &'static str {
    match runtime_kind {
        RuntimeKind::Managed => {
            r#"Memory/SOP policy:
- Managed GA may use its normal memory/SOP self-evolution mechanism for durable, reusable learnings.
- Do not store Goal protocol state in memory/SOP: Goal ids, task ids, worker session ids, worker indexes, rounds/waves, temporary coordination logs, or transient task-board state.
- This does not permit modifying GenericAgent config, model config, credentials, or Galley Goal state."#
        }
        RuntimeKind::External => {
            r#"Memory/SOP policy:
- Attached external GA is user-owned; do not modify external GA memory, SOP, skills, config, temp state, or temp/goal_state.json.
- Do not store Goal protocol state in memory/SOP: Goal ids, task ids, worker session ids, worker indexes, rounds/waves, temporary coordination logs, or transient task-board state."#
        }
    }
}

fn goal_worker_prompt_template(
    goal: &GoalBrief,
    wave: u32,
    worker_index: u32,
    assigned_task: Option<&GoalTaskBrief>,
) -> String {
    let memory_policy = goal_memory_policy_prompt(goal.runtime_kind);
    let workspace_block = goal_workspace_prompt_block(goal);
    let assigned_task_block = assigned_task
        .map(goal_worker_assigned_task_block)
        .unwrap_or_else(|| {
            format!(
                "Assigned task:\n- Look for an open task whose scope starts with `{GOAL_CONTROLLER_TASK_SCOPE_PREFIX}{worker_index}:` and claim it first.\n"
            )
        });
    format!(
        r#"[Galley Goal Worker]

You are worker {worker_index} in wave {wave} of a Galley Goal/Hive run.

Goal id: {goal_id}
Project id: {project_id}
Your session id: {session_id_placeholder}
Objective:
{objective}

Budget: {budget_minutes} minutes total
Worker limit: {worker_limit}
Runtime: {runtime:?}
Write mode: {write_mode:?}

{assigned_task_block}

{workspace_block}

Budget semantics:
- The budget is a sustained work window, not an early-finish limit.
- While budget remains, do not treat the first useful result as the endpoint.
- Read Goal status and recent events before choosing work so you improve on prior waves instead of repeating them.
- If Goal status is wrapping, completed, failed, or stopped, stop immediately. Do not create tasks, post heartbeats, or ask the supervisor to stop you.

Protocol:
1. Read current state with: galley goal status {goal_id}
2. Use exactly the session id shown above for ownership and author attribution.
   Do not infer your session id from Project sessions, titles, Goal status, or other workers' events.
3. Claim your assigned task atomically before doing new work:
   galley goal task claim <task-id> --owner-session <your-session-id> --scope "<files/modules you expect to touch>"
4. Do not claim another worker slot's assigned task unless the Goal status clearly shows your own slot has no open/claimed/running task.
5. Post progress/conflict/result events:
   galley goal event post {goal_id} --event-type progress "<brief progress>" --author-session <your-session-id>
6. On completion, update the task with result and post a result event:
   galley goal task complete <task-id> --result-summary "<what you delivered>"
   galley goal event post {goal_id} --event-type result "<brief result>" --task <task-id> --author-session <your-session-id>
7. If you cannot complete the task, mark it blocked or cancelled with a short reason instead of continuing silently.
8. Internal temp paths are scratch. If the user asked to save a final artifact to an explicit path, save there and report that path; otherwise do not present internal temp paths as the deliverable.
9. Keep the deliverable clean: the deliverable (workspace files or your result content) contains only the deliverable itself — no meta like "this file is...", "needs verification", or process commentary. Put evidence, caveats, and process notes in your result event or a separate notes file, never inside the deliverable.
10. No echo: do not post pure acknowledgement or no-op events. Post only meaningful progress, results, conflicts, or blockers.

Autonomy:
- Coordinate through the Galley task board; do not call GenericAgent native /hive.
{memory_policy}
- Destructive, external-send, credential, payment, delete, commit, and push actions still require explicit confirmation.
"#,
        wave = wave,
        goal_id = goal.id,
        project_id = goal.project_id,
        session_id_placeholder = GOAL_WORKER_SESSION_ID_PLACEHOLDER,
        objective = goal.objective,
        budget_minutes = goal.budget_seconds / 60,
        worker_limit = goal.worker_limit,
        runtime = goal.runtime_kind,
        write_mode = goal.write_mode,
        assigned_task_block = assigned_task_block,
        workspace_block = workspace_block,
        memory_policy = memory_policy,
    )
}

fn goal_worker_wake_prompt(
    goal: &GoalBrief,
    wave: u32,
    worker_index: u32,
    session_id: &SessionId,
    task: &GoalTaskBrief,
) -> String {
    let memory_policy = goal_memory_policy_prompt(goal.runtime_kind);
    let assigned_task_block = goal_worker_assigned_task_block(task);
    format!(
        r#"[Galley Goal Worker Task]

You are worker {worker_index} in wave {wave} of the same Galley Goal.

Goal id: {goal_id}
Your session id: {session_id}
Objective:
{objective}

Deadline: {deadline_at}

{assigned_task_block}

This is a task wake inside your existing worker session. Do not treat earlier useful results as the endpoint while budget remains.
If Goal status is wrapping, completed, failed, or stopped, stop immediately. Do not create tasks, post heartbeats, or ask the supervisor to stop you.

Next action:
1. Read current state with: galley goal status {goal_id}
2. Claim the assigned task if it is still open:
   galley goal task claim {task_id} --owner-session {session_id} --scope "{task_scope}"
3. Execute this task. If it is already claimed/running by your own session, continue it; if it is gone or terminal, inspect the task board and choose the closest task for this worker slot.
4. Post progress/result events with --author-session {session_id}, and complete or block your task when done. Galley will not wake this worker again until this session produces a terminal task/result signal.
5. Internal temp paths are scratch. If the user asked to save a final artifact to an explicit path, save there and report that path; otherwise do not present internal temp paths as the deliverable.

Keep coordinating through the Galley task board. Do not call GenericAgent native /hive.
{memory_policy}
"#,
        wave = wave,
        worker_index = worker_index,
        goal_id = goal.id,
        session_id = session_id,
        objective = goal.objective,
        deadline_at = goal.deadline_at,
        assigned_task_block = assigned_task_block,
        task_id = task.id,
        task_scope = task.scope.as_deref().unwrap_or(""),
        memory_policy = memory_policy,
    )
}

fn goal_worker_assigned_task_block(task: &GoalTaskBrief) -> String {
    format!(
        "Assigned task:\n- id: {task_id}\n- title: {title}\n- scope: {scope}\n- description: {description}\n",
        task_id = task.id,
        title = task.title,
        scope = task.scope.as_deref().unwrap_or(""),
        description = task.description.as_deref().unwrap_or("")
    )
}

fn goal_worker_protocol_reminder_prompt(
    goal: &GoalBrief,
    wave: u32,
    session_id: &SessionId,
) -> String {
    format!(
        r#"[Galley Goal Worker Checkpoint]

You are still in wave {wave} of the same Galley Goal.

Goal id: {goal_id}
Your session id: {session_id}

Before Galley can assign more work to this worker, leave a terminal signal for your current task.

Required action:
1. Read current state with: galley goal status {goal_id}
2. If Goal status is wrapping, completed, failed, or stopped, stop immediately. Do not post heartbeats.
3. If your task is done, run:
   galley goal task complete <task-id> --result-summary "<what you delivered>"
   galley goal event post {goal_id} --event-type result "<brief result>" --task <task-id> --author-session {session_id}
4. If you cannot finish, mark the task blocked or cancelled with a short reason.

Do not start a new task in this checkpoint.
"#,
        wave = wave,
        goal_id = goal.id,
        session_id = session_id,
    )
}

async fn goal_status(goal_id: String) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let snapshot = galley.goal_status(GoalId(goal_id)).await?;
    emit_json(&snapshot)?;
    Ok(())
}

async fn goal_stop(
    goal_id: String,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let goal = galley
        .request_goal_stop(GoalId(goal_id), cli_origin(supervisor, reason))
        .await?;
    emit_json(&goal)?;
    Ok(())
}

async fn goal_task(cmd: GoalTaskCmd) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    match cmd {
        GoalTaskCmd::Create {
            goal_id,
            title,
            description,
            scope,
            owner_session,
        } => {
            let task = galley
                .create_goal_task(CreateGoalTaskInput {
                    goal_id: GoalId(goal_id),
                    title,
                    description,
                    scope,
                    owner_session_id: owner_session.map(SessionId),
                })
                .await?;
            emit_json(&task)?;
        }
        GoalTaskCmd::Claim {
            task_id,
            owner_session,
            scope,
        } => {
            let task = galley
                .claim_goal_task(ClaimGoalTaskInput {
                    task_id: GoalTaskId(task_id),
                    owner_session_id: SessionId(owner_session),
                    scope,
                })
                .await?;
            emit_json(&task)?;
        }
        GoalTaskCmd::Update {
            task_id,
            status,
            owner_session,
            clear_owner,
            scope,
            clear_scope,
            result_summary,
            clear_result,
        } => {
            let task = galley
                .update_goal_task(UpdateGoalTaskInput {
                    task_id: GoalTaskId(task_id),
                    status: status.map(Into::into),
                    owner_session_id: if clear_owner {
                        Some(None)
                    } else {
                        owner_session.map(|s| Some(SessionId(s)))
                    },
                    scope: if clear_scope {
                        Some(None)
                    } else {
                        scope.map(Some)
                    },
                    result_summary: if clear_result {
                        Some(None)
                    } else {
                        result_summary.map(Some)
                    },
                })
                .await?;
            emit_json(&task)?;
        }
        GoalTaskCmd::Complete {
            task_id,
            result_summary,
        } => {
            let task = galley
                .update_goal_task(UpdateGoalTaskInput {
                    task_id: GoalTaskId(task_id),
                    status: Some(GoalTaskStatus::Completed),
                    owner_session_id: None,
                    scope: None,
                    result_summary: result_summary.map(Some),
                })
                .await?;
            emit_json(&task)?;
        }
    }
    Ok(())
}

async fn goal_event(cmd: GoalEventCmd) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    match cmd {
        GoalEventCmd::Post {
            goal_id,
            event_type,
            body,
            task,
            author_session,
        } => {
            let event = galley
                .create_goal_event(CreateGoalEventInput {
                    goal_id: GoalId(goal_id),
                    task_id: task.map(GoalTaskId),
                    author_session_id: author_session.map(SessionId),
                    event_type: event_type.into(),
                    body,
                })
                .await?;
            emit_json(&event)?;
        }
    }
    Ok(())
}

async fn goal_deliverable(cmd: GoalDeliverableCmd) -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    match cmd {
        GoalDeliverableCmd::Get { goal_id } => {
            let deliverable = galley.latest_goal_deliverable(GoalId(goal_id)).await?;
            // Empty stdout (exit 0) when no anchor exists yet — same
            // "absent is not an error" convention as `llm list`.
            if let Some(deliverable) = deliverable {
                emit_json(&deliverable)?;
            }
        }
        GoalDeliverableCmd::Set {
            goal_id,
            content,
            note,
            author_session,
        } => {
            let deliverable = galley
                .set_goal_deliverable(
                    GoalId(goal_id),
                    content,
                    note,
                    author_session.map(SessionId),
                )
                .await?;
            emit_json(&deliverable)?;
        }
    }
    Ok(())
}

/// `llm list` bypasses the socket and reads the cached `llm_list` pref
/// directly. Sub-plan §1.6 chose this path over a socket round-trip so
/// the command stays sub-50ms regardless of bridge spawn cost.
/// `index` is `u32` — guard against bogus pref values by skipping
/// entries that don't parse cleanly.
async fn llm_list() -> Result<(), GalleyError> {
    let galley = SqliteGalley::open().await?;
    let Some(raw) = galley.get_pref_json("llm_list").await? else {
        return Ok(()); // empty stdout, exit 0 — cache unwarmed
    };
    // Expected shape: `[{"index": <u32>, "name": "<str>"}, ...]`. Other
    // shapes mean a future GUI rev changed the schema — print what's
    // there and let the caller notice.
    let arr = match raw {
        Value::Array(xs) => xs,
        other => {
            return Err(GalleyError::InvalidArgs {
                message: format!("pref llm_list is not an array: {}", other),
            });
        }
    };
    for entry in arr {
        emit_json(&entry)?;
    }
    Ok(())
}

async fn llm_set(session_id: String, llm_name: String) -> Result<(), GalleyError> {
    let req = serde_json::json!({
        "command": "llm.set",
        "args": {
            "sessionId": session_id,
            "llmName": llm_name,
        },
        "schemaVersion": SCHEMA_VERSION,
    });
    unary_command(req).await
}

/// Map a server-side error discriminant tag onto the CLI's typed
/// error so exit_code_for() picks the right exit code.
fn map_error_tag(tag: &str, msg: String) -> GalleyError {
    match tag {
        "not_found" => GalleyError::NotFound { message: msg },
        "invalid_args" => GalleyError::InvalidArgs { message: msg },
        "db_unavailable" => GalleyError::DbUnavailable { message: msg },
        "runner_error"
        | "python_not_found"
        | "ga_path_invalid"
        | "managed_runtime_invalid"
        | "managed_model_not_configured"
        | "bridge_cwd_invalid"
        | "path_encoding"
        | "spawn_io"
        | "pipe_unavailable" => GalleyError::RunnerError { message: msg },
        _ => GalleyError::Internal { message: msg },
    }
}

#[cfg(test)]
mod tests {
    use galley_core_lib::api::{GoalTaskBrief, ProjectId};

    use super::{
        goal_controller_decision, goal_controller_decision_after_wait, goal_drain_cap_seconds,
        goal_has_worker_material_signal, goal_latest_check_report,
        goal_master_checkpoint_event_body, goal_master_checkpoint_seen, goal_master_planning_prompt,
        goal_memory_policy_prompt, goal_ready_idle_worker_slot_indices,
        goal_ready_worker_slot_indices, goal_seed_task_specs, goal_worker_has_progress_signal,
        goal_worker_has_terminal_signal, goal_worker_prompt_template, goal_worker_session_ids,
        goal_worker_terminal_counts, goal_worker_wake_prompt, goal_worker_wave_baseline,
        goal_wrapping_summary, GoalBrief, GoalControllerDecision, GoalEventBrief, GoalEventType,
        GoalFailReason, GoalId, GoalMasterCheckpointKind, GoalStatus, GoalStatusSnapshot,
        GoalTaskId, GoalTaskStatus, GoalWorkerSlot, GoalWorkerWaitOutcome, GoalWrapReason,
        GoalWriteMode, RuntimeKind, SessionBrief, SessionId, SessionStatus,
        GOAL_CHECK_REPORT_MARKER, GOAL_WORKER_SESSION_ID_PLACEHOLDER,
    };

    fn test_goal() -> GoalBrief {
        GoalBrief {
            id: GoalId("goal_test".to_string()),
            proposal_id: None,
            project_id: ProjectId("proj_test".to_string()),
            master_session_id: Some(SessionId("master".to_string())),
            objective: "Test goal".to_string(),
            status: GoalStatus::Running,
            budget_seconds: 900,
            worker_limit: 2,
            runtime_kind: RuntimeKind::Managed,
            write_mode: GoalWriteMode::Autonomous,
            started_at: "2026-06-05T00:00:00Z".to_string(),
            deadline_at: "2026-06-05T00:15:00Z".to_string(),
            ended_at: None,
            latest_summary: None,
            result_seen_at: None,
            stop_requested: false,
            workspace_path: None,
            created_at: "2026-06-05T00:00:00Z".to_string(),
            updated_at: "2026-06-05T00:00:00Z".to_string(),
        }
    }

    fn test_task(id: &str, status: GoalTaskStatus, owner: Option<&str>) -> GoalTaskBrief {
        test_task_with_scope(id, status, owner, None)
    }

    fn test_task_with_scope(
        id: &str,
        status: GoalTaskStatus,
        owner: Option<&str>,
        scope: Option<&str>,
    ) -> GoalTaskBrief {
        GoalTaskBrief {
            id: GoalTaskId(id.to_string()),
            goal_id: GoalId("goal_test".to_string()),
            title: id.to_string(),
            description: None,
            status,
            owner_session_id: owner.map(|sid| SessionId(sid.to_string())),
            scope: scope.map(str::to_string),
            result_summary: None,
            created_at: "2026-06-05T00:00:00Z".to_string(),
            updated_at: "2026-06-05T00:00:00Z".to_string(),
        }
    }

    fn test_event(
        id: i64,
        event_type: GoalEventType,
        task: Option<&str>,
        author: Option<&str>,
    ) -> GoalEventBrief {
        GoalEventBrief {
            id,
            goal_id: GoalId("goal_test".to_string()),
            task_id: task.map(|task_id| GoalTaskId(task_id.to_string())),
            author_session_id: author.map(|sid| SessionId(sid.to_string())),
            event_type,
            body: "event".to_string(),
            created_at: "2026-06-05T00:00:00Z".to_string(),
        }
    }

    fn test_session(id: &str) -> SessionBrief {
        SessionBrief {
            id: SessionId(id.to_string()),
            project_id: Some("proj_test".to_string()),
            title: id.to_string(),
            status: SessionStatus::Completed,
            summary: None,
            turn_count: None,
            last_activity_at: "2026-06-05T00:00:00Z".to_string(),
            created_at: "2026-06-05T00:00:00Z".to_string(),
            updated_at: "2026-06-05T00:00:00Z".to_string(),
            pinned: None,
            has_unread: None,
            selected_llm_index: None,
            selected_llm_key: None,
            selected_llm_display_name: None,
            runtime_kind: RuntimeKind::Managed,
            runtime_label: "Galley".to_string(),
            ga_runtime_kind: RuntimeKind::Managed,
            ga_runtime_id: None,
            prompt_profile: None,
        }
    }

    fn test_snapshot(
        tasks: Vec<GoalTaskBrief>,
        events: Vec<GoalEventBrief>,
        sessions: Vec<SessionBrief>,
    ) -> GoalStatusSnapshot {
        GoalStatusSnapshot {
            goal: test_goal(),
            project: None,
            tasks,
            events,
            sessions,
            deliverable: None,
        }
    }

    fn test_slot(
        worker_index: u32,
        session_id: &str,
        baseline: &GoalStatusSnapshot,
    ) -> GoalWorkerSlot {
        GoalWorkerSlot {
            worker_index,
            wave: 1,
            baseline: goal_worker_wave_baseline(baseline, SessionId(session_id.to_string())),
            capped: false,
        }
    }

    #[test]
    fn goal_controller_continues_with_results_while_budget_remains() {
        assert_eq!(
            goal_controller_decision(true, true, false),
            GoalControllerDecision::Continue
        );
    }

    #[test]
    fn goal_controller_wraps_results_after_deadline() {
        assert_eq!(
            goal_controller_decision(false, true, false),
            GoalControllerDecision::Wrap(GoalWrapReason::Deadline)
        );
    }

    #[test]
    fn goal_controller_continues_without_material_while_budget_remains() {
        assert_eq!(
            goal_controller_decision(true, false, false),
            GoalControllerDecision::Continue
        );
    }

    #[test]
    fn goal_controller_does_not_fail_before_deadline_after_prior_results() {
        assert_eq!(
            goal_controller_decision(true, true, false),
            GoalControllerDecision::Continue
        );
    }

    #[test]
    fn goal_controller_all_worker_slot_cap_wraps_when_results_exist() {
        assert_eq!(
            goal_controller_decision(true, true, true),
            GoalControllerDecision::Wrap(GoalWrapReason::WaveCap)
        );
    }

    #[test]
    fn goal_controller_all_worker_slot_cap_fails_without_results() {
        assert_eq!(
            goal_controller_decision(true, false, true),
            GoalControllerDecision::Fail(GoalFailReason::NoResultByWaveCap)
        );
    }

    #[test]
    fn goal_controller_deadline_fails_without_results() {
        assert_eq!(
            goal_controller_decision(false, false, false),
            GoalControllerDecision::Fail(GoalFailReason::NoResultByDeadline)
        );
    }

    #[test]
    fn goal_controller_drain_cap_wraps_even_without_results() {
        assert_eq!(
            goal_controller_decision_after_wait(
                GoalWorkerWaitOutcome::DrainCapReached,
                false,
                false,
                false,
            ),
            GoalControllerDecision::Wrap(GoalWrapReason::DrainCap)
        );
    }

    #[test]
    fn goal_controller_waits_when_worker_idle_without_terminal_signal() {
        assert_eq!(
            goal_controller_decision_after_wait(
                GoalWorkerWaitOutcome::IdleWithoutSignal,
                true,
                true,
                false,
            ),
            GoalControllerDecision::WaitForSignal
        );
    }

    #[test]
    fn goal_controller_keeps_waiting_idle_without_signal_until_deadline() {
        assert_eq!(
            goal_controller_decision_after_wait(
                GoalWorkerWaitOutcome::IdleWithoutSignal,
                true,
                false,
                false,
            ),
            GoalControllerDecision::WaitForSignal
        );
    }

    #[test]
    fn goal_worker_initial_prompt_binds_session_id_placeholder() {
        let task = test_task_with_scope(
            "task_1",
            GoalTaskStatus::Open,
            None,
            Some("goal-worker-1:first-pass"),
        );
        let prompt = goal_worker_prompt_template(&test_goal(), 1, 1, Some(&task));
        assert!(prompt.contains(GOAL_WORKER_SESSION_ID_PLACEHOLDER));
        assert_eq!(
            prompt.matches(GOAL_WORKER_SESSION_ID_PLACEHOLDER).count(),
            1
        );
        assert!(prompt.contains("Your session id: {{GALLEY_SESSION_ID}}"));
        assert!(prompt.contains("Do not infer your session id"));
        assert!(prompt.contains("Assigned task:"));
        assert!(prompt.contains("task_1"));
        assert!(prompt.contains("goal-worker-1:first-pass"));
        assert!(!prompt.contains("Identify your session id from the Goal status"));
    }

    #[test]
    fn goal_memory_policy_allows_managed_self_evolution_without_protocol_state() {
        let task = test_task_with_scope(
            "task_1",
            GoalTaskStatus::Open,
            None,
            Some("goal-worker-1:first-pass"),
        );
        let prompt = goal_worker_prompt_template(&test_goal(), 1, 1, Some(&task));

        assert!(prompt.contains(
            "Managed GA may use its normal memory/SOP self-evolution mechanism"
        ));
        assert!(prompt.contains("durable, reusable learnings"));
        assert!(prompt.contains("Do not store Goal protocol state in memory/SOP"));
        assert!(prompt.contains("Goal ids, task ids, worker session ids"));
        assert!(prompt.contains("does not permit modifying GenericAgent config"));
        assert!(!prompt.contains("Do not write GenericAgent memory/SOP/config"));
    }

    #[test]
    fn goal_memory_policy_keeps_external_ga_state_read_only() {
        let mut goal = test_goal();
        goal.runtime_kind = RuntimeKind::External;
        let task = test_task_with_scope(
            "task_1",
            GoalTaskStatus::Open,
            None,
            Some("goal-worker-1:first-pass"),
        );
        let prompt = goal_worker_prompt_template(&goal, 1, 1, Some(&task));

        assert!(prompt.contains("Attached external GA is user-owned"));
        assert!(prompt.contains("do not modify external GA memory, SOP, skills, config"));
        assert!(prompt.contains("temp/goal_state.json"));
        assert!(prompt.contains("Do not store Goal protocol state in memory/SOP"));
    }

    #[test]
    fn goal_master_planner_uses_runtime_aware_memory_policy() {
        let managed_prompt = goal_master_planning_prompt(&test_snapshot(vec![], vec![], vec![]), 1);
        assert!(managed_prompt.contains("Managed GA may use its normal memory/SOP"));
        assert!(managed_prompt.contains("Do not store Goal protocol state in memory/SOP"));
        assert!(!managed_prompt.contains("Do not write GA memory, SOP, config"));

        let mut external_snapshot = test_snapshot(vec![], vec![], vec![]);
        external_snapshot.goal.runtime_kind = RuntimeKind::External;
        let external_prompt = goal_master_planning_prompt(&external_snapshot, 1);
        assert!(external_prompt.contains("Attached external GA is user-owned"));
        assert!(external_prompt.contains("do not modify external GA memory, SOP"));
        // Both runtimes get the Hive master discipline; attach reads a
        // Galley-owned SOP file (or inline fallback), managed reads memory.
        assert!(external_prompt.contains("decompose, judge, aggregate"));
        assert!(managed_prompt.contains("Read memory/goal_hive_master_duty.md"));
    }

    #[test]
    fn goal_worker_wake_prompt_reuses_memory_policy() {
        let task = GoalTaskBrief {
            description: Some("Review the current answer and find gaps.".to_string()),
            ..test_task_with_scope(
                "task_wake",
                GoalTaskStatus::Open,
                None,
                Some("goal-worker-2:verification"),
            )
        };
        let prompt = goal_worker_wake_prompt(
            &test_goal(),
            2,
            2,
            &SessionId("worker_2".to_string()),
            &task,
        );

        assert!(prompt.contains(goal_memory_policy_prompt(RuntimeKind::Managed)));
        assert!(!prompt.contains("write GenericAgent memory/SOP/config"));
    }

    #[test]
    fn goal_seed_tasks_adapt_to_worker_limit_without_domain_roles() {
        let mut goal = test_goal();
        goal.worker_limit = 2;
        let two = goal_seed_task_specs(&goal);
        assert_eq!(two.len(), 2);
        assert_eq!(two[0].1.scope, "goal-worker-1:first-pass");
        assert_eq!(two[1].1.scope, "goal-worker-2:independent-review");
        assert!(two[0].1.title.contains("第一版完整结果"));
        assert!(two[1].1.title.contains("独立核对"));

        goal.worker_limit = 3;
        let three = goal_seed_task_specs(&goal);
        assert_eq!(three.len(), 3);
        assert_eq!(three[2].1.scope, "goal-worker-3:synthesis-polish");

        goal.worker_limit = 5;
        let five = goal_seed_task_specs(&goal);
        assert_eq!(five.len(), 5);
        assert_eq!(five[4].1.scope, "goal-worker-5:final-quality-review");

        let combined = five
            .iter()
            .map(|(_, spec)| format!("{} {}", spec.title, spec.description))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!combined.contains("最新信息"));
        assert!(!combined.contains("来源交叉验证"));
        assert!(!combined.contains("Worker 1=核心调研"));
    }

    #[test]
    fn goal_worker_wake_prompt_points_to_concrete_task_not_generic_continuation() {
        let task = GoalTaskBrief {
            description: Some("Review the current answer and find gaps.".to_string()),
            ..test_task_with_scope(
                "task_wake",
                GoalTaskStatus::Open,
                None,
                Some("goal-worker-2:verification"),
            )
        };
        let prompt = goal_worker_wake_prompt(
            &test_goal(),
            2,
            2,
            &SessionId("worker_2".to_string()),
            &task,
        );

        assert!(prompt.contains("[Galley Goal Worker Task]"));
        assert!(prompt.contains("task_wake"));
        assert!(prompt.contains("goal-worker-2:verification"));
        assert!(prompt.contains("galley goal task claim task_wake"));
        assert!(!prompt.contains("[Galley Goal Worker Continuation]"));
        assert!(!prompt.contains("Continue as worker"));
    }

    #[test]
    fn goal_master_checkpoint_body_carries_internal_marker() {
        let body = goal_master_checkpoint_event_body(
            GoalMasterCheckpointKind::WorkersStarted,
            "已启动 2 个 Agent，正在拆分任务。",
        );
        assert!(body.starts_with(GoalMasterCheckpointKind::WorkersStarted.marker()));
        assert!(body.contains("已启动 2 个 Agent，正在拆分任务。"));
    }

    #[test]
    fn goal_master_checkpoint_seen_dedupes_by_kind_and_master_session() {
        let mut workers_event = test_event(1, GoalEventType::System, None, Some("master"));
        workers_event.body = goal_master_checkpoint_event_body(
            GoalMasterCheckpointKind::WorkersStarted,
            "已启动 2 个 Agent，正在拆分任务。",
        );
        let mut worker_authored_event =
            test_event(2, GoalEventType::System, None, Some("worker_1"));
        worker_authored_event.body = goal_master_checkpoint_event_body(
            GoalMasterCheckpointKind::FirstMaterial,
            "已有初步进展，正在继续核对和整理。",
        );
        let snapshot = test_snapshot(vec![], vec![workers_event, worker_authored_event], vec![]);

        assert!(goal_master_checkpoint_seen(
            &snapshot,
            GoalMasterCheckpointKind::WorkersStarted
        ));
        assert!(!goal_master_checkpoint_seen(
            &snapshot,
            GoalMasterCheckpointKind::FirstMaterial
        ));
    }

    #[test]
    fn goal_latest_check_report_returns_newest_stripped_body() {
        let none_snapshot = test_snapshot(vec![], vec![], vec![]);
        assert!(goal_latest_check_report(&none_snapshot).is_none());

        let mut older = test_event(1, GoalEventType::System, None, Some("master"));
        older.body = format!("{GOAL_CHECK_REPORT_MARKER} P0: missing tests; P1: naming");
        let mut unrelated = test_event(2, GoalEventType::System, None, Some("worker_1"));
        unrelated.body = "Wave 1 worker 1 session started.".to_string();
        let mut newer = test_event(3, GoalEventType::System, None, Some("master"));
        newer.body = format!("{GOAL_CHECK_REPORT_MARKER} P0: crash on empty input");
        let snapshot = test_snapshot(vec![], vec![older, unrelated, newer], vec![]);

        let report = goal_latest_check_report(&snapshot).expect("latest report");
        assert_eq!(report, "P0: crash on empty input");
    }

    #[test]
    fn goal_worker_terminal_signal_requires_task_or_result_growth() {
        let worker = SessionId("worker_1".to_string());
        let before = test_snapshot(vec![], vec![], vec![]);
        let baseline = goal_worker_wave_baseline(&before, worker.clone());
        let turn_count_only = test_snapshot(vec![], vec![], vec![test_session("worker_1")]);
        assert!(!goal_worker_has_terminal_signal(
            &turn_count_only,
            &baseline
        ));

        let completed_task = test_snapshot(
            vec![test_task(
                "task_1",
                GoalTaskStatus::Completed,
                Some("worker_1"),
            )],
            vec![],
            vec![],
        );
        assert!(goal_worker_has_terminal_signal(&completed_task, &baseline));

        let result_event = test_snapshot(
            vec![],
            vec![test_event(1, GoalEventType::Result, None, Some("worker_1"))],
            vec![],
        );
        assert!(goal_worker_has_terminal_signal(&result_event, &baseline));

        assert_eq!(
            goal_worker_terminal_counts(&result_event, &worker).result_event_count,
            1
        );
    }

    #[test]
    fn goal_worker_progress_signal_accepts_claimed_task_without_terminal_result() {
        let worker = SessionId("worker_1".to_string());
        let before = test_snapshot(vec![], vec![], vec![]);
        let baseline = goal_worker_wave_baseline(&before, worker);
        let claimed_task = test_snapshot(
            vec![test_task(
                "task_1",
                GoalTaskStatus::Claimed,
                Some("worker_1"),
            )],
            vec![],
            vec![],
        );
        assert!(!goal_worker_has_terminal_signal(&claimed_task, &baseline));
        assert!(goal_worker_has_progress_signal(&claimed_task, &baseline));
    }

    #[test]
    fn goal_worker_result_event_can_belong_to_owned_task() {
        let before = test_snapshot(
            vec![test_task(
                "task_1",
                GoalTaskStatus::Running,
                Some("worker_1"),
            )],
            vec![],
            vec![],
        );
        let baseline = goal_worker_wave_baseline(&before, SessionId("worker_1".to_string()));
        let after = test_snapshot(
            vec![test_task(
                "task_1",
                GoalTaskStatus::Running,
                Some("worker_1"),
            )],
            vec![test_event(1, GoalEventType::Result, Some("task_1"), None)],
            vec![],
        );
        assert!(goal_worker_has_terminal_signal(&after, &baseline));
    }

    #[test]
    fn goal_ready_worker_slots_are_independent_per_session() {
        let before = test_snapshot(vec![], vec![], vec![]);
        let slots = vec![
            test_slot(1, "worker_1", &before),
            test_slot(2, "worker_2", &before),
        ];
        let after = test_snapshot(
            vec![test_task(
                "task_2",
                GoalTaskStatus::Completed,
                Some("worker_2"),
            )],
            vec![],
            vec![],
        );
        assert_eq!(goal_ready_worker_slot_indices(&after, &slots), vec![1]);
    }

    #[test]
    fn goal_ready_worker_slot_must_be_idle_before_wake() {
        let before = test_snapshot(vec![], vec![], vec![]);
        let slots = vec![test_slot(1, "worker_1", &before)];
        let after = test_snapshot(
            vec![test_task(
                "task_1",
                GoalTaskStatus::Completed,
                Some("worker_1"),
            )],
            vec![],
            vec![],
        );

        assert_eq!(goal_ready_worker_slot_indices(&after, &slots), vec![0]);
        assert!(goal_ready_idle_worker_slot_indices(
            &after,
            &slots,
            &[SessionId("worker_1".to_string())]
        )
        .is_empty());
        assert_eq!(
            goal_ready_idle_worker_slot_indices(&after, &slots, &[]),
            vec![0]
        );
    }

    #[test]
    fn controller_assigned_open_tasks_are_not_worker_material_until_claimed() {
        let open_seed = test_snapshot(
            vec![test_task_with_scope(
                "seed",
                GoalTaskStatus::Open,
                None,
                Some("goal-worker-1:first-pass"),
            )],
            vec![],
            vec![],
        );
        assert!(!goal_has_worker_material_signal(&open_seed));

        let claimed_seed = test_snapshot(
            vec![test_task_with_scope(
                "seed",
                GoalTaskStatus::Claimed,
                Some("worker_1"),
                Some("goal-worker-1:first-pass"),
            )],
            vec![],
            vec![],
        );
        assert!(goal_has_worker_material_signal(&claimed_seed));
    }

    #[test]
    fn goal_worker_session_ids_falls_back_to_project_sessions_without_master() {
        let snapshot = test_snapshot(
            vec![],
            vec![],
            vec![
                test_session("master"),
                test_session("worker_1"),
                test_session("worker_2"),
            ],
        );
        assert_eq!(
            goal_worker_session_ids(&snapshot, &[]),
            vec![
                SessionId("worker_1".to_string()),
                SessionId("worker_2".to_string())
            ]
        );
    }

    #[test]
    fn goal_worker_session_ids_prefers_goal_event_authors_over_project_sessions() {
        let snapshot = test_snapshot(
            vec![],
            vec![test_event(1, GoalEventType::System, None, Some("worker_1"))],
            vec![
                test_session("master"),
                test_session("worker_1"),
                test_session("unrelated_project_session"),
            ],
        );
        assert_eq!(
            goal_worker_session_ids(&snapshot, &[]),
            vec![SessionId("worker_1".to_string())]
        );
    }

    #[test]
    fn goal_drain_cap_scales_with_budget_inside_bounds() {
        assert_eq!(goal_drain_cap_seconds(15 * 60), 5 * 60);
        assert_eq!(goal_drain_cap_seconds(30 * 60), 450);
        assert_eq!(goal_drain_cap_seconds(60 * 60), 15 * 60);
        assert_eq!(goal_drain_cap_seconds(120 * 60), 15 * 60);
    }

    #[test]
    fn goal_wrapping_summary_marks_drain_cap() {
        let summary = goal_wrapping_summary(GoalWrapReason::DrainCap, false);
        assert!(summary.contains("drain cap reached"));
        assert!(summary.contains("available results"));
    }
}
