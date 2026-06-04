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
    GalleyApi, GoalBrief, GoalEventType, GoalId, GoalProposalId, GoalStatus, GoalStatusSnapshot,
    GoalTaskId, GoalTaskStatus, GoalWriteMode, MessageBrief, Origin, ProjectBrief, RuntimeKind,
    SearchScope, SessionBrief, SessionFilter, SessionId, SessionStatus, UpdateGoalTaskInput,
    DEFAULT_GOAL_BUDGET_SECONDS, DEFAULT_GOAL_WORKER_LIMIT, GOAL_CONFIRMATION_PHRASE,
};
use galley_core_lib::db::SqliteGalley;
use galley_core_lib::error::GalleyError;
use galley_core_lib::socket_listener::socket_path;
use serde::Serialize;
use serde_json::Value;

const SCHEMA_VERSION: u32 = 1;
const PROJECT_FOLLOW_IDLE_QUIET_WINDOW: Duration = Duration::from_millis(1500);

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
    // Parse + decide whether to surface as success (exit 0) or map to
    // a CLI error (exit code based on the `error` discriminant).
    let parsed: serde_json::Value =
        serde_json::from_str(&resp_line).map_err(|e| GalleyError::Internal {
            message: format!("malformed socket response: {e}"),
        })?;
    if parsed["ok"] == serde_json::Value::Bool(true) {
        // Pass the result through as-is so agents can parse the
        // assigned message id + dispatch status.
        println!("{}", parsed["result"]);
        Ok(())
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

async fn session_new_value(
    task: String,
    project: Option<String>,
    llm: Option<String>,
    runtime: RuntimeArg,
    supervisor: Option<String>,
    reason: Option<String>,
) -> Result<serde_json::Value, GalleyError> {
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
    let controller_started = Instant::now();
    let mut wave = 1_u32;
    loop {
        for worker_index in 1..=goal.worker_limit {
            let prompt = goal_worker_prompt(&goal, wave, worker_index);
            let result = session_new_value(
                prompt,
                Some(goal.project_id.0.clone()),
                None,
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
                .map(str::to_string);
            if let Some(sid) = session_id.as_ref() {
                let _ = galley
                    .create_goal_event(CreateGoalEventInput {
                        goal_id: goal.id.clone(),
                        task_id: None,
                        author_session_id: Some(SessionId(sid.clone())),
                        event_type: GoalEventType::System,
                        body: format!("Wave {wave} worker {worker_index} session started."),
                    })
                    .await;
            }
            emit_json(&GoalRunFrame {
                schema_version: SCHEMA_VERSION,
                stream: "goal",
                phase: "worker_started",
                goal: &goal,
                session_id,
                note: Some(format!(
                    "wave {wave}; worker {worker_index}/{}",
                    goal.worker_limit
                )),
            })?;
        }

        project_follow(goal.project_id.0.clone(), 80, false, true, true).await?;

        let snapshot = galley.goal_status(goal.id.clone()).await?;
        let refreshed = snapshot.goal.clone();
        if refreshed.stop_requested {
            let summary = "Worker wave finished after stop request; Goal stopped.".to_string();
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
        if incomplete_tasks && budget_left {
            let summary =
                format!("Wave {wave} finished; incomplete tasks remain, continuing within budget.");
            galley
                .create_goal_event(CreateGoalEventInput {
                    goal_id: refreshed.id.clone(),
                    task_id: None,
                    author_session_id: None,
                    event_type: GoalEventType::Synthesis,
                    body: summary.clone(),
                })
                .await?;
            emit_json(&GoalRunFrame {
                schema_version: SCHEMA_VERSION,
                stream: "goal",
                phase: "continuing",
                goal: &refreshed,
                session_id: None,
                note: Some(summary),
            })?;
            goal = refreshed;
            wave = wave.saturating_add(1);
            continue;
        }

        let summary = if incomplete_tasks {
            "Budget reached with incomplete tasks; Goal controller completed this V1 run."
                .to_string()
        } else {
            "Worker wave finished; no incomplete Goal tasks remain.".to_string()
        };
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
            .update_goal_state(refreshed.id.clone(), GoalStatus::Completed, Some(summary))
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

fn goal_worker_prompt(goal: &GoalBrief, wave: u32, worker_index: u32) -> String {
    format!(
        r#"[Galley Goal Worker]

You are worker {worker_index} in wave {wave} of a Galley Goal/Hive run.

Goal id: {goal_id}
Project id: {project_id}
Objective:
{objective}

Budget: {budget_minutes} minutes total
Worker limit: {worker_limit}
Runtime: {runtime:?}
Write mode: {write_mode:?}

Protocol:
1. Read current state with: galley goal status {goal_id}
2. If there is an open task you can help with, claim it atomically:
   galley goal task claim <task-id> --owner-session <your-session-id> --scope "<files/modules you expect to touch>"
3. If no suitable task exists, create one:
   galley goal task create {goal_id} "<short task title>" --description "<what you will do>" --owner-session <your-session-id> --scope "<files/modules>"
4. Post progress/conflict/result events:
   galley goal event post {goal_id} --event-type progress "<brief progress>"
5. On completion, update the task with result and post a result event.

Autonomy:
- Coordinate through the Galley task board; do not call GenericAgent native /hive.
- Do not write GenericAgent memory/SOP/config or temp/goal_state.json.
- Destructive, external-send, credential, payment, delete, commit, and push actions still require explicit confirmation.
"#,
        wave = wave,
        goal_id = goal.id,
        project_id = goal.project_id,
        objective = goal.objective,
        budget_minutes = goal.budget_seconds / 60,
        worker_limit = goal.worker_limit,
        runtime = goal.runtime_kind,
        write_mode = goal.write_mode,
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
