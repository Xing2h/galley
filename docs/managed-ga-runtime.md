# Managed GenericAgent Runtime

> Design target for Galley's bundled / managed GenericAgent runtime.
> Attach-mode GenericAgent remains user-owned and non-invasive.

## Status

This document defines the target architecture for the built-in Galley runtime.
The current released path still supports attaching an existing user-owned
GenericAgent. Managed runtime work must preserve attach-mode behavior unless a
task explicitly changes this document.

## Product Model

Ordinary users should experience this as Galley, not as "installing
GenericAgent." The onboarding path is:

```text
Configure Galley's model -> start using Galley
```

GenericAgent is the internal agent kernel for this mode. Users should not need
to know about GA checkout paths, `mykey.py`, Python, virtual environments,
dependencies, or GA memory layout.

Attach mode is an advanced compatibility path for users who already have their
own GenericAgent environment:

```text
Already have GenericAgent? Connect your existing environment.
```

## Runtime Modes

Galley has two runtime modes.

```text
managed_ga
- Default path for new users.
- Galley owns the runtime code and model configuration.
- Galley may apply minimal managed-runtime patches.
- Galley Runtime Prompt and Galley Persona apply.
- Sessions shown in the UI are managed-runtime sessions.

external_ga
- Advanced attach path for an existing user-owned GA checkout.
- User owns code, memory, SOP, skills, model config, venv, and behavior.
- Galley does not inject Galley Persona or use Galley's model config.
- Sessions shown in the UI are external-runtime sessions.
```

Mode switching lives in Settings -> Runtime. The main UI does not need a
managed-mode badge because managed mode is the product default. When the user is
in attach mode, the sidebar should show a small "Existing GenericAgent" badge
in a suitable place and link to Settings -> Runtime.

When modes switch, the visible session list switches with the mode. This is
intentional: it reinforces that these are different agent kernels, not one
history with a different skin.

## Session History

Store sessions in the same Galley database, tagged by runtime kind, but display
only the current mode's sessions by default.

Suggested session metadata:

```text
ga_runtime_kind: managed | external
ga_runtime_id: string
prompt_profile: string | null
```

Rules:

- Creating a session snapshots the current runtime kind.
- Restoring a session uses the runtime kind it was created with.
- Changing the default runtime only affects new sessions.
- External sessions do not silently migrate to managed runtime.
- Managed sessions do not silently migrate to external runtime.
- A future "Copy to Galley runtime" action can explicitly duplicate selected
  external history into a managed session, but v1 should not auto-convert.

## Model Configuration

Managed mode owns Galley's model configuration. Attach mode never uses it.

Onboarding and Settings should expose two protocol families:

```text
Anthropic-compatible
OpenAI-compatible
```

Users may add multiple providers / models. The UI should frame this as "Add
model", not "edit mykey.py." Each model entry should contain:

```text
displayName
protocol: anthropic | openai
apiBase
apiKeyRef
model
advancedOptions
```

API keys live in the system credential store, such as macOS Keychain or Windows
Credential Manager. The database stores only `apiKeyRef` and non-secret model
metadata.

Generated GA-compatible config is an implementation detail. The first version
may generate a managed-only `mykey.py` or equivalent config from Galley's model
records, but users should not edit or rely on that file.

Do not expose non-native text-protocol sessions, mixin failover, IM bot config,
Langfuse, or arbitrary GA template fields in first-run onboarding. Those can
become advanced Settings later if there is real demand.

## Prompt Composition

Galley Persona applies only in managed mode. Attach mode must preserve the
user's existing GA behavior.

Managed prompt composition should be explicit:

```text
GA core prompt
+ GA memory
+ Galley Runtime Prompt
+ Galley Persona Prompt
```

The Galley Runtime Prompt describes the product environment: local desktop
workbench, GUI / CLI / supervisor operation, approvals, concrete progress
feedback, and not making the user do work Galley can do.

The Galley Persona Prompt describes interaction style only. It must not override
GA's tool protocol, memory rules, approval policy, safety constraints, or the
user's explicit request.

Prefer a small extension seam in managed GA:

```text
GALLEY_RUNTIME_PROMPT_PATH
GALLEY_PERSONA_PROMPT_PATH
```

External attach mode does not pass these paths.

## Code And State

The managed runtime follows one central rule:

```text
Code is replaceable. State is user-owned.
```

Managed GA code is part of Galley's shipped product runtime. It may be replaced
when Galley updates to a newer upstream GenericAgent baseline plus the Galley
managed patch stack.

Managed GA state is user-owned Galley state. Runtime upgrades must not
overwrite it.

Suggested layout:

```text
App Resources/
  managed-ga-code/              # read-only, shipped with the app
  galley-prompts/
    runtime-v1.md
    persona-v1.md

Application Support/app.galley/
  galley.db
  managed-ga-state/
    memory/
    sop/
    skills/
    temp/
    model_responses/
  managed-model-config/
    generated-mykey.py          # or model-config.json
```

Initial setup may seed default state only when the target file or directory is
missing. Existing state must not be overwritten:

```text
if missing: create default
if exists: leave it alone
```

If an upstream GA release requires a state format change, treat it as a
high-risk migration: back up first, document the reason, and dogfood with real
managed-runtime state.

## Patch Discipline

Managed GA can be patched, but Galley must not become a divergent GA fork.

Recommended source strategy:

```text
third_party/GenericAgent        # pinned upstream baseline
managed-ga/patches/
  0001-galley-prompt-composition.patch
  0002-galley-managed-state-dir.patch
managed-ga/patches/manifest.md
scripts/build-managed-ga.sh
```

Rules:

- Keep every patch small and product-scoped.
- Prefer upstream public APIs or config first.
- Prefer environment-variable or file-path extension seams before code edits.
- Document every patch with reason, touched upstream files, rebase risk, and
  removal condition.
- Patches must be replayable on top of a newer upstream baseline.
- If upstream provides the same capability, delete the Galley patch.
- Changes touching agent loop, tool protocol, memory semantics, or backend
  history shape are high risk and require a baseline audit.

## Backup And Device Migration

Managed GA memory, SOP, skills, temp state, and model response state belong to
Galley-managed state and should be included in Galley backup / migration.

External GA memory, SOP, skills, venv, and model config belong to the user's
external GA checkout and are never included or modified by Galley unless the
user explicitly backs up that checkout outside Galley.

Ordinary Galley backup should not include API keys. On a new machine, restored
managed sessions and memory can appear, but the user should re-enter model
credentials.

Future encrypted export can include API keys behind an explicit migration
password, but that is out of scope for the first managed-runtime version.

## Implementation Phases

1. Update project constitution and this design document.
2. Add runtime mode metadata and filter sessions by current runtime kind.
3. Add managed model configuration using system credential storage for keys.
4. Package managed GA code with Galley and run it from a Galley-controlled
   runtime profile.
5. Add managed prompt composition with Galley Runtime Prompt and Galley Persona.
6. Split managed code from managed state so runtime upgrades replace code only.
7. Add onboarding: default "Configure Galley's model", secondary attach entry.
8. Add verification for attach-mode behavior preservation and managed-mode
   persona / model config behavior.

## Verification

Before shipping managed runtime, verify:

- New users can configure a model and start without seeing GA setup details.
- Existing attach users stay in attach mode after upgrade.
- Attach mode does not use Galley model config or Galley Persona.
- Managed mode applies Galley Runtime Prompt and Galley Persona.
- Switching modes changes the visible session list.
- Session restore uses the session's original runtime kind.
- Managed runtime upgrade replaces code without overwriting memory, SOP, skills,
  or other state.
- Galley backup restores managed sessions and state; API keys require re-entry
  on a new machine.
