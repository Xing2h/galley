# Session Close SOP

Use this when a long coding session is ending and the work should be made
recoverable for the next session.

## Trigger

Run this SOP when the user says any closeout phrase such as:

- "session close"
- "结束这个 session"
- "按 SOP 收尾"
- "今天先到这里"
- "收尾并 commit"

If the user only asks for status, report status and continue. Do not run the
full closeout unless the user is ending or pausing the session.

## Checklist

1. Confirm the current outcome.
   - What was fixed or decided?
   - What did the user dogfood or explicitly confirm?
   - What remains open?

2. Capture durable decisions.
   - Keep only decisions that should influence future work.
   - Prefer focused docs for current rules.
   - Prefer devlog for why a decision was made and what was rejected.

3. Update documentation only where needed.
   - `AGENTS.md`: global rules and routing links only.
   - Focused docs in `docs/`: current SOPs, architecture, API, release rules.
   - `docs/devlog/`: decision history, debugging narratives, rejected paths.
   - `docs/README.md`: add major new documents to the routing index.

4. Verify the work.
   - Run the smallest checks that cover the changed surface.
   - For GUI / desktop changes, default to:

     ```bash
     pnpm --dir gui typecheck
     pnpm --dir gui lint
     git diff --check
     ```

   - Add Rust checks when Rust or CLI code changed:

     ```bash
     cargo check --workspace
     cargo test --workspace
     ```

5. Clean the workspace.
   - Inspect `git status --short`.
   - Remove accidental generated files, local DBs, logs, and debug artifacts.
   - Do not revert unrelated user work.
   - Stop dev servers or subprocesses started for the session if they are no
     longer needed.

6. Commit.
   - Commit once the work is verified and the scope is coherent.
   - Use a concise message that names the durable outcome.
   - Do not push unless the user asks.

7. Leave a handoff.
   - Include latest commit, verification run, completed outcome, and next
     useful step.
   - Keep the handoff short enough for the next session to scan quickly.

## Closeout Shape

A good closeout answer should include:

- summary of changes
- verification results
- commit hash / message
- known remaining risks or next step

Avoid a full transcript recap. The devlog is the durable narrative.
