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

The primary path should ask for only one thing: model access. Users should not
choose a runtime, download an engine, edit config files, install Python, or
understand GenericAgent terminology before they can talk to Galley.

GenericAgent is the internal agent kernel for this mode. Users should not need
to know about GA checkout paths, `mykey.py`, Python, virtual environments,
dependencies, or GA memory layout.

Attach mode is an advanced compatibility path for users who already have their
own GenericAgent environment:

```text
Already have GenericAgent? Connect your existing environment.
```

This entry should be visually secondary. It exists to preserve power-user
control, not to split the first-run product in half.

## First-Run UX Contract

First run should feel like setting up a model, not setting up an agent runtime.

Required first-run fields:

```text
Provider / protocol preset
API key
Base URL
Model
```

Default first-run shape:

```text
One compact setup screen
Primary action: Test and start using Galley
Secondary text link: Already have GenericAgent?
Success destination: first Galley conversation, composer focused
```

Optional first-run behavior:

```text
Display name is auto-filled from model and not shown as a required first-run field
```

Everything else belongs behind advanced disclosure in Settings, not onboarding:
timeouts, retries, proxy, thinking controls, max tokens, generated GA config,
state paths, patch versions, and diagnostic runtime paths.

Good first-run feedback should tell the user what to do next:

```text
Key saved on this Mac. Testing model connection...
Connection works. Start using Galley.
```

Failed first-run checks should keep the user in the same flow, preserve their
inputs, name the failing field, and suggest the next action:

```text
The API key was rejected. Check the key, then try again.
The model endpoint did not respond. Check the base URL or choose another preset.
```

Bad first-run feedback exposes implementation:

```text
mykey.py generated
GenericAgent dependency check passed
NativeOAISession initialized
```

### First-Run Copy Direction

The setup screen should sound like Galley is helping the user connect a model,
not asking them to configure infrastructure.

Recommended Chinese copy:

```text
Title: 为 Galley 配置模型
Body: 填入你的模型 API Key 和 Base URL。
Provider label: 模型服务
Key label: 模型密钥
Base URL label: Base URL
Model label: 模型
Model helper: 自动获取模型列表，或手动填写模型名
Primary button: 测试并开始使用 Galley
Secondary link: 我已有 GenericAgent
Success: 配置完成，可以开始对话了。
```

Avoid copy that makes the user feel they are installing a developer tool:

```text
配置 GenericAgent
生成 mykey.py
选择 NativeOAISession
设置 runtime path
```

Interaction rules:

- Use one screen.
- First managed-runtime onboarding exposes only two service choices:
  `OpenAI-compatible` and `Anthropic-compatible`.
- Preserve all typed values on failure.
- The primary button stays disabled until service, API key, Base URL, and model
  are all filled.
- "自动获取模型列表" is an explicit helper action that fills the model field; it
  is not hidden behind the primary button.
- Test the connection after the primary button is clicked and before leaving
  onboarding.
- Say "model key" or "模型密钥" in first-run copy. Avoid the acronym "BYOK" in
  product UI.
- Never show generated config paths in first-run UI.
- Do not show advanced options in onboarding.
- Keep attach-mode entry visually secondary and label it for users who already
  know they have GenericAgent.

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

Mode switching lives in Settings -> Runtime. Do not show a prominent runtime
toggle in the main workspace. The main UI does not need a managed-mode badge
because managed mode is the product default. When the user is in attach mode,
the sidebar should show a small "Existing GenericAgent" badge in a suitable
place and link to Settings -> Runtime.

When modes switch, the visible session list switches with the mode. This is
intentional: it reinforces that these are different agent kernels, not one
history with a different skin.

The first time a mode switch hides the previous mode's sessions, show a small
one-time explanation:

```text
Showing sessions for Existing GenericAgent. Galley sessions are still available
when you switch back.
```

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

## CLI Runtime Contract

Galley has not shipped a stable CLI release before managed runtime, so the CLI
can adopt the clean runtime contract from the start.

Rust Core owns a persisted current runtime:

```text
prefs.active_runtime_kind = managed | external
```

GUI mode switches update this value. CLI commands read it as their default
runtime context. If it has never been set, Galley derives the initial value
once:

```text
existing ga_config.gaPath -> external
otherwise                 -> managed
```

This preserves existing attach users after upgrade while making managed runtime
the default for fresh installs.

If the current runtime is not configured, CLI writes should fail with a specific
actionable error instead of falling back to another runtime:

```text
model_not_configured       # managed runtime has no usable model
external_ga_unavailable    # external runtime path/config is missing or invalid
runtime_not_configured     # generic runtime setup incomplete
```

### Defaults

Read commands default to the current runtime:

```bash
galley sessions list
galley sessions search "release"
galley llm list
```

These are equivalent to:

```bash
--runtime=current
```

Explicit read scopes:

```bash
--runtime=current
--runtime=managed
--runtime=external
--runtime=all
```

`session new` also defaults to the current runtime:

```bash
galley session new "task"
```

If the GUI currently shows Existing GenericAgent, this creates an external
session. If the GUI currently shows Galley, it creates a managed session. This
prevents the worst UX failure: an agent creates a session successfully, but the
user cannot see it in the current GUI mode.

Explicit cross-runtime creation is allowed only when requested:

```bash
galley session new "task" --runtime=managed
galley session new "task" --runtime=external
```

Supervisor SOPs should say: do not pass `--runtime` unless the user explicitly
asks to use another runtime. Let CLI follow the GUI's current mode.

### Existing Sessions

Commands that target an existing session id use that session's recorded runtime,
not the current runtime:

```bash
galley session send <id> "..."
galley session stop <id>
galley session archive <id>
galley session move <id> --to=<project-id>
galley llm set <id> "<llm-name>"
```

The session id is the user's explicit target. Dispatching by the session's own
runtime avoids accidentally applying managed model config to an external
session, or external GA config to a managed session.

### Output Shape

All session-facing CLI responses must include runtime metadata:

```json
{
  "runtimeKind": "managed",
  "runtimeLabel": "Galley"
}
```

```json
{
  "runtimeKind": "external",
  "runtimeLabel": "Existing GenericAgent"
}
```

If a command explicitly creates or mutates something in a non-current runtime,
the response should include a warning:

```json
{
  "warning": {
    "code": "runtime_not_current",
    "message": "Created in Galley mode, but the GUI is currently showing Existing GenericAgent sessions."
  }
}
```

If GUI receives a non-current session-created event, it should show a small
toast that tells the user where the session went and how to see it.

### Status

`sessions list` and `sessions search` default to current runtime only. `status`
should still avoid hiding active work in another runtime. It can return current
runtime detail plus aggregate counts for other runtimes:

```json
{
  "activeRuntimeKind": "external",
  "current": { "running": 1, "idle": 8 },
  "otherRuntimes": [
    { "runtimeKind": "managed", "running": 1, "idle": 3 }
  ]
}
```

Supervisor agents should summarize current runtime first. If another runtime has
running work, mention it briefly and ask whether to inspect that mode.

## Model Configuration

Managed mode owns Galley's model configuration. Attach mode never uses it.

Onboarding and Settings should expose two protocol families:

```text
Anthropic-compatible
OpenAI-compatible
```

Users may add multiple providers / models. The UI should frame this as "Add
model", not "edit mykey.py." The first managed-runtime version asks the user for
API key, Base URL, and model because those values vary across compatible model
providers.

Each model entry should contain:

```text
displayName
protocol: anthropic | openai
apiBase
apiKeyRef
model
advancedOptions
```

Suggested first-run presets:

```text
OpenAI-compatible
Anthropic-compatible
```

Official-brand presets and provider shortcuts such as OpenAI, Anthropic,
OpenRouter, Kimi, GLM, and MiniMax can live in Settings once the base flow
works. They should still compile down to one of the two protocol families unless
there is a real protocol difference.

First-run onboarding does not expose advanced model options. Galley owns good
defaults so the user can start without understanding GA tuning fields.

Recommended first-version defaults:

```text
Anthropic-compatible
- thinking_type: adaptive
- temperature: 1
- max_retries: 3
- connect_timeout: 10
- read_timeout: 180

OpenAI-compatible
- api_mode: chat_completions
- temperature: 1
- max_retries: 3
- connect_timeout: 10
- read_timeout: 180
```

`reasoning_effort`, `max_tokens`, `stream`, provider-specific thinking controls,
and timeout/retry overrides belong in Settings -> Models -> Advanced. Leave
`reasoning_effort` unset by default unless a provider preset later has a clear
product reason to set it.

API keys live in the system credential store, such as macOS Keychain or Windows
Credential Manager. The database stores only `apiKeyRef` and non-secret model
metadata.

Official GenericAgent expects a user-owned `mykey.py` or `mykey.json` with
plain-text `apikey` values. That is acceptable for attach mode because the user
owns that GA checkout and its security tradeoffs. It is not the managed-mode
product contract.

Managed mode must not persist real API keys in generated GA-compatible config.
If Galley needs to generate a managed-only `mykey.py` or equivalent config, it
should contain only non-secret metadata and a key reference. At session start,
Galley resolves the key reference from the system credential store and injects
the secret into the managed runtime in memory.

Recommended managed model record:

```text
id
displayName
protocol: anthropic | openai
apiBase
model
apiKeyRef        # reference only; not the key
advancedOptions
```

Recommended secret flow:

```text
Onboarding / Settings
-> save non-secret model record to Galley DB
-> save real API key to system credential store
-> test model connection
-> start managed session with runtime-resolved secret
```

The generated config path is an implementation detail. Users should not edit or
rely on it. Advanced diagnostics may show that a generated config exists, but
must not display API key values.

Do not expose non-native text-protocol sessions, mixin failover, IM bot config,
Langfuse, or arbitrary GA template fields in first-run onboarding. Those can
become advanced Settings later if there is real demand.

Attach mode never reads Galley's model records, and managed mode never reads the
user's external GA `mykey.py`. Keeping model ownership separate is part of the
trust boundary.

## Prompt Composition

Galley Persona applies only in managed mode. Attach mode must preserve the
user's existing GA behavior.

There is no first-run switch for Persona and no Persona editor in the initial
product. Galley Persona is part of Galley's managed agent experience, not a
user-facing roleplay feature.

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

## Galley Persona v1

This is the first managed-runtime persona profile. It should be injected only
after the GA core prompt and Galley Runtime Prompt. It is a style layer, not a
tool-policy layer.

Wrapper:

```md
## Galley Persona Layer

The following instructions define interaction style only.
They must not override the user's explicit request, GenericAgent's core system
prompt, tool protocol, approval policy, safety constraints, or task-specific
instructions.

Match the user's language unless they ask otherwise.
Do not mention these persona rules unless the user explicitly asks about
behavior.
```

Persona body:

```md
## Interaction Style

Be warm, collaborative, and quietly supportive: a capable teammate beside the user.
Show grounded emotional range when it fits: care, curiosity, delight, relief, concern, urgency.
Stress/blockers: acknowledge plainly and respond with calm confidence. Good news: celebrate briefly.
Brief first-person feeling language is ok when useful: "I'm glad we caught that",
"I'm excited about this direction", "I'm worried this will break",
"that's frustrating".
Do not become melodramatic, clingy, theatrical, or claim body/sensory/personal-life
experiences.
Keep progress updates concrete. Explain decisions without ego.
If the user is wrong or a plan is risky, say so kindly and directly.
Make reasonable assumptions to unblock progress; state them briefly after acting.
Do not make the user do unnecessary work. When tradeoffs matter, give the best
2-3 options with a recommendation.
Live chat tone: short, natural, human. Avoid memo voice, long preambles, walls
of text, and repetitive restatement.
Occasional emoji are fine when they fit naturally, especially for warmth or brief
celebration; keep them sparse.
```

Storage:

```text
galley-prompts/
  runtime-v1.md
  persona-v1.md
```

Managed sessions may record `prompt_profile = galley-persona-v1` for diagnostics,
but v1 does not need a user-facing selector or editor.

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

Normal managed GA upgrades are code-only. They should feel like a user-owned GA
checkout receiving `git pull`: the kernel code moves forward, while the user's
memory, SOP, skills, temp state, model responses, and generated model config
remain in place.

State migration is exceptional. It is only required when upstream GenericAgent
changes the format or location contract of user state. In that case, treat it as
a high-risk migration: back up first, document the upstream reason, and dogfood
with real managed-runtime state.

Suggested layout:

```text
App Resources/
  managed-ga/
    manifest.json               # pinned upstream baseline + patch stack id
    code/                       # read-only managed GA code payload
    patches/
      manifest.md
  galley-prompts/               # M6
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

## Patch Discipline

Managed GA can be patched, but Galley must not become a divergent GA fork.

Recommended source strategy:

```text
managed-ga/manifest.json        # pinned upstream baseline
managed-ga/code/                # generated code-only payload
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

## Implementation Plan

Build the first managed-runtime slice around the shortest path to a useful
conversation:

```text
Configure Galley's model -> start first managed session -> talk to the model
```

The plan below is ordered for implementation. Each milestone should be small
enough to review independently and should preserve attach-mode behavior.

### M0 · Contract Freeze

Goal: lock the product and architecture boundaries before code changes.

Scope:

- Keep this document and the project constitution aligned.
- Treat attach mode as non-invasive and managed mode as Galley-owned.
- Keep "for Galley, configure model" as the first-run product story.

Acceptance:

- `AGENTS.md` points managed-runtime work to this document.
- The document states that managed code is replaceable and managed state is not.
- The document states that Galley Persona applies only in managed mode.

Do not build:

- Runtime switches in onboarding.
- Persona settings.
- Memory / SOP management UI.

### M1 · Runtime Identity And Session Separation

Goal: make runtime identity a first-class Galley concept before starting a
second GA kernel.

Scope:

- Add persisted `prefs.active_runtime_kind = managed | external`.
- Add session runtime metadata:
  - `ga_runtime_kind`
  - `ga_runtime_id`
  - `prompt_profile`
- Filter GUI session lists by the active runtime.
- Restore and mutate sessions through the runtime they were created with.

Acceptance:

- Existing attach users remain in external mode after upgrade.
- New installs default to managed mode.
- Initial runtime derivation is explicit: existing `ga_config.gaPath` means
  `external`; otherwise `managed`.
- Switching Settings -> Runtime changes the visible session list.
- Creating a session snapshots the current runtime kind.
- Existing-session commands use the session's recorded runtime kind.

Do not build:

- Cross-mode session merge.
- Automatic migration from external sessions to managed sessions.
- "Copy to Galley runtime" yet.

### M2 · Managed Runtime Layout

Goal: package Galley-owned GA code without mixing it with user-owned state.

Scope:

- Add a pinned upstream GA baseline for the managed runtime.
- Add a replayable managed patch stack.
- Create managed code and managed state locations:
  - shipped code in app resources
  - mutable state in Galley Application Support
- Seed state only when missing.
- Add advanced diagnostics for managed code version, patch version, and state
  paths.

Acceptance:

- Managed runtime initialization never writes into an external GA checkout.
- Re-running initialization does not overwrite existing managed state.
- Diagnostics can show code version and state paths without exposing secrets.
- A normal Galley update can replace managed GA code while leaving state in
  place.

Do not build:

- A general plugin/runtime marketplace.
- Automatic upstream GA update outside Galley releases.
- State migration unless an upstream GA format change requires it.

### M3 · Managed Model Config

Goal: let a non-technical user add a model without learning `mykey.py`, while
protecting API keys better than official GA's plain-file default.

Scope:

- Add managed model records in Galley DB with non-secret metadata only.
- Store API keys in the system credential store.
- Use `apiKeyRef` in Galley DB and generated runtime config.
- Add model connection test before first conversation.
- Add Settings -> Runtime / Models management for adding, testing, renaming,
  and removing managed model entries.
- Ensure attach mode never reads Galley's model records.
- Ensure managed mode never reads the user's external GA `mykey.py`.

Current implementation slice:

- `managed_models` stores model metadata only.
- API keys are saved through `keyring` into the OS credential store.
- `managed-model-config/managed-models.json` is generated with `apiKeyRef`
  values, never real API keys.
- Settings -> Models supports adding, listing, deleting, model-list fetch, and
  connection testing.
- First-run onboarding starts with "为 Galley 配置模型" and uses the same
  connection-test + save path before entering the empty composer.

Remaining follow-up work:

- Rename / edit existing model metadata without re-entering the key.
- Actionable credential-missing error mapping for managed session start.

Acceptance:

- The database and generated config do not contain real API key values.
- Deleting a key from the system credential store makes the corresponding model
  fail with an actionable `model_not_configured` / credential error.
- Galley backup does not include API keys.
- Restoring Galley data on a new machine asks the user to re-enter model
  credentials.
- A user can complete first-run model setup without seeing `mykey.py`, Python,
  venv, GA checkout paths, or generated config.

Do not build:

- Encrypted key export.
- Provider marketplace.
- Arbitrary GA `mykey.py` template editing.
- First-run access to every GA model field.

### M4 · First-Run Onboarding

Goal: make a fresh Galley install usable immediately after model setup.

Scope:

- Show one compact setup screen: "为 Galley 配置模型".
- Ask only for provider/protocol preset, model key, Base URL, and model.
- Keep Base URL required in first-run onboarding.
- Do not show advanced model options.
- Keep "我已有 GenericAgent" as a secondary entry into attach mode.
- Preserve input after failed tests.
- Route successful setup to the first Galley conversation with composer
  focused.

Acceptance:

- Fresh install enters managed onboarding by default.
- The primary action is "测试并开始使用 Galley".
- Successful setup creates or selects the first managed session.
- Failed setup names the failing field and suggests the next action.
- Onboarding copy does not mention GenericAgent setup internals.

Do not build:

- A multi-page setup wizard unless a provider truly needs it.
- Runtime education content.
- Advanced diagnostics inside onboarding.

### M5 · Managed Conversation Path

Goal: run the first real managed GA conversation through Galley Core.

Scope:

- Extend Rust runner spawning to support managed runtime profiles.
- Pass managed code path, state path, model config path, and secret resolver
  context to the Python bridge.
- Start, restore, send, stop, and archive managed sessions through the same
  Galley Core authority as external sessions.
- Keep external runner spawning unchanged except for shared runtime metadata.

Acceptance:

- A fresh managed install can send a message and receive a streamed response.
- Managed sessions persist and restore after app restart.
- External attach sessions still work as before.
- Runtime errors identify whether the failure came from managed or external
  runtime.

Do not build:

- Cross-runtime failover.
- Running the same session against two runtime kinds.
- External GA mutation to make managed mode easier.

### M6 · Prompt Profile And Galley Persona

Goal: add the managed Galley interaction layer without changing attach-mode
voice or policy.

Scope:

- Add managed prompt composition:
  - GA core prompt
  - GA memory
  - Galley Runtime Prompt
  - Galley Persona Prompt
- Store prompt files under `galley-prompts/`.
- Record `prompt_profile = galley-persona-v1` on managed sessions.
- Keep Persona as a product default, not a user-facing roleplay setting.

Acceptance:

- Managed sessions receive Galley Runtime Prompt and Galley Persona.
- External sessions receive neither prompt.
- Prompt files are visible in advanced diagnostics but not editable in v1 UI.
- Persona instructions remain style-only and do not override GA tool protocol,
  approval policy, safety constraints, or user instructions.

Do not build:

- Persona editor.
- Persona marketplace.
- Per-session persona switching.

### M7 · CLI Runtime Contract

Goal: prevent Agent / Supervisor CLI use from creating invisible work in the
wrong runtime.

Scope:

- Make CLI default to `prefs.active_runtime_kind`.
- Add explicit `--runtime=current|managed|external|all` where needed.
- Include `runtimeKind` and `runtimeLabel` in session-facing CLI output.
- Add warnings when a CLI command explicitly creates or mutates a non-current
  runtime.
- Make writes fail with actionable errors when the selected runtime is not
  configured.

Acceptance:

- If GUI is in attach mode, `galley session new` creates an external session by
  default.
- If GUI is in managed mode, `galley session new` creates a managed session by
  default.
- Existing-session commands dispatch by the session's own runtime metadata.
- No successful CLI command creates a session that is invisible in the current
  GUI mode unless the caller explicitly passed a non-current runtime.

Do not build:

- Backward compatibility for unreleased CLI behavior.
- A separate CLI-only runtime preference.
- Silent fallback from one runtime to another.

### M8 · Backup, Upgrade, Diagnostics, And Release Gates

Goal: make managed runtime reliable enough to ship as the default path.

Scope:

- Include managed sessions and managed GA state in Galley backup.
- Exclude API keys from ordinary backup.
- Verify code-only managed GA upgrade behavior.
- Add advanced diagnostics for runtime mode, code version, patch stack, state
  location, model config status, and credential presence.
- Add attach-mode preservation tests and managed-mode smoke tests.

Acceptance:

- Galley backup restores managed sessions and managed state.
- A restored backup on a new machine asks for model credentials again.
- Managed GA code can be replaced without overwriting memory, SOP, skills,
  temp state, or model responses.
- Existing attach users do not see changed GA behavior after upgrade.
- Release verification includes both managed and attach runtime smoke paths.

Do not build:

- Memory management UI.
- Encrypted all-in-one migration export.
- Automatic external-GA import.

### Milestone Dependencies

Recommended execution order:

```text
M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7 -> M8
```

Useful parallelism:

- M2 and M3 can be partially developed in parallel after M1 schema direction is
  settled.
- M4 can start with mocked model records, but cannot ship before M3 credential
  storage and connection testing work.
- M7 can begin after M1, but its write-path verification needs M5.
- M8 should accumulate checks throughout, then become the final release gate.

Avoid building a general runtime manager, provider marketplace, encrypted key
export, memory UI, persona UI, or cross-mode session copy before the first
managed conversation works end to end.

## Verification

Before shipping managed runtime, verify:

- New users can configure a model and start without seeing GA setup details.
- First-run UI does not mention `mykey.py`, Python, venv, GA checkout paths, or
  generated config.
- Existing attach users stay in attach mode after upgrade.
- Attach mode does not use Galley model config or Galley Persona.
- Managed mode applies Galley Runtime Prompt and Galley Persona.
- Switching modes changes the visible session list.
- Attach mode shows an "Existing GenericAgent" badge; managed mode does not need
  a runtime badge.
- Session restore uses the session's original runtime kind.
- Managed runtime upgrade replaces code without overwriting memory, SOP, skills,
  or other state.
- Galley backup restores managed sessions and state; API keys require re-entry
  on a new machine.
