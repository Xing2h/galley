# Large Component Split Guardrails · 2026-06

This refactor is structural only. Its purpose is to reduce maintenance cost in
large files without changing user-visible behavior or public contracts.

## Non-Goals

- Do not change SQL semantics, migrations, indexes, or DB row shapes.
- Do not change socket command names, request payloads, response payloads, or
  `schemaVersion: 1`.
- Do not change Tauri command names or frontend IPC contracts.
- Do not change CLI JSON schema, error identifiers, or exit-code mapping.
- Do not change GUI copy, navigation, Settings, Goal, or Browser Control flows.
- Do not introduce new runtime behavior while moving code.

## Module Rules

- `core/src/db/` keeps a single `impl GalleyApi for SqliteGalley`; domain files
  expose inherent methods and helpers only.
- `core/src/socket_listener/` keeps lifecycle and `dispatch_line` in `mod.rs`.
  Wire types live in `wire.rs`; shared command helpers live in `common.rs`;
  command-specific args and dispatchers live in focused command modules.
- `core/src/commands/` is only for thin Tauri wrappers that previously lived in
  `lib.rs`. Existing standalone modules such as `runner_commands`,
  `app_update`, and `conversation_image` stay where they are.
- `cli/src/main.rs` stays a thin binary entrypoint: parse CLI args, enforce the
  schema pin, dispatch top-level commands, and print stable error JSON.
- `cli/src/args.rs` owns the clap schema. Moving code must not change command
  names, flags, defaults, help text, JSON/NDJSON output, socket request shape,
  or exit-code mapping.
- `cli/src/goal/` is a structural split only. Goal prompt strings, controller
  decisions, runtime-aware memory/SOP policy, and worker socket helper calls
  must remain behavior-equivalent to the pre-split CLI.
- `gui/src/App.tsx` is settled — do not split it further. It has no effects of
  its own (flat prop-threading hub); its only extractions were pure helpers
  into `gui/src/lib/`. Region-container splitting was piloted and rejected
  (the indirection tax outweighed the gain).
- `gui/src/components/conversation/Composer.tsx` is the live GUI split target:
  a tangled `forwardRef` body with interdependent effect/state clusters. Lift
  each cohesive concern into a `gui/src/hooks/use*.ts` hook, with its pure
  module-level substrate (constants, decode helpers, error/contract types) in
  `gui/src/lib/`. The image-intake concern is done — `useImageAttachments`
  (state, paste/drop/picker intake, drag overlay) over `lib/composer-images.ts`
  (pure). The move stays behavior-preserving; ship any UX change as a separate
  commit, never folded into the extraction.

## Verification

After Rust phases:

```bash
cargo check --manifest-path core/Cargo.toml
cargo test --manifest-path core/Cargo.toml
cargo check --manifest-path cli/Cargo.toml
cargo test --manifest-path cli/Cargo.toml
git diff --check
```

After GUI phases:

```bash
pnpm --dir gui typecheck
pnpm --dir gui lint
git diff --check
```

Use `wc -l` only as a smell check. A file being smaller is not the acceptance
criterion; unchanged behavior and clearer ownership are.
