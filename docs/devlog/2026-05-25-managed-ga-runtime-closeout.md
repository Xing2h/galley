# Managed GA runtime closeout · packaging gate + lazy Keychain access

**Date**: 2026-05-25
**Status**: ✅ Shipped locally, ready for next-session dogfood
**Related**: `8fa3025` / `6fc06a6` / `7b0a0a9` / `cdb37c6` / `c919eba` + closeout commit · [managed GA runtime](../managed-ga-runtime.md)

## Context

This session moved "managed / bundled GA" from product architecture discussion
into an end-to-end implementation path. The original attach-only Galley model
was too high-friction for ordinary users: they had to understand GA checkout,
Python, `mykey.py`, model config, and runtime ownership before a first chat.

The new product direction: for new users, Galley is the product. First launch
should say "为 Galley 配置模型", collect model credentials, and start a
conversation. Existing attach users keep their own GA untouched. Managed GA is
Galley-owned, but still must preserve upstream upgradability and never mix code
with user state.

Late dogfood exposed two release-quality issues: packaged builds could run the
GUI but lacked the bundled CLI sibling required by Supervisor discovery, and
macOS Keychain prompts appeared on ordinary app startup because passive model
list paths probed secure storage.

## Decisions

### 1. Runtime boundary split became the core rule

- Attach / external GA remains non-invasive: no Galley Persona injection, no GA
  code edits, no writes to user-owned GA state.
- Managed / bundled GA may carry minimal Galley patches and prompt profiles,
  because it is part of Galley. The boundary is still strict: code is
  replaceable, user state is not.
- Managed GA upgrades replace code only; `memory/`, SOP, skills, temp state,
  and model responses stay in Galley-owned state paths.

### 2. First-run model setup is the mainstream path

- Onboarding copy centers "为 Galley 配置模型", not "download/install GA".
- Users provide Provider protocol, API key, Base URL, and model name. Advanced
  options stay out of first-run flow.
- Attach existing GenericAgent stays as a secondary path for advanced users.
- Session history stays separated by runtime mode, so switching modes does not
  make work appear to vanish into another GA identity.

### 3. Provider / Model split replaced one-key-per-model UX

- Provider owns API key + Base URL + protocol.
- Model owns model name + display name + defaults.
- A user can add many models under one Provider, which matches OpenRouter and
  similar services.
- Existing Provider / Model metadata can be edited; deleting a Model never
  deletes the Provider key.

### 4. Keychain stays, but secret reads are lazy

- API keys remain in the OS credential store; SQLite and generated config only
  store non-secret metadata and `apiKeyRef`.
- Galley must not read Keychain during cold start, sidebar rendering, Settings
  list rendering, or passive diagnostics.
- Passive list APIs return credential status `unknown`; UI renders this as
  "Key 已保存" instead of "Key 缺失".
- Secret reads happen only on user-initiated paths: save new key, test
  connection, fetch model list, delete Provider secret, or start a managed
  session.

### 5. M9 packaging gate now checks the finished app, not just source payload

- `managed-ga/` source payload gate rejects generated, local, secret, and
  user-state artifacts.
- Tauri now bundles the Galley CLI as an `externalBin`, so production
  `Galley.app/Contents/MacOS/galley` exists beside `galley-core`.
- A new app-bundle gate inspects the finished macOS `.app` for CLI, runner,
  bundled Python, managed GA code, runtime/persona prompts, and patch manifest.
- Release workflow prepares the CLI sidecar before Cargo / Tauri validation and
  runs the app-bundle gate before uploading macOS artifacts.

## Rejected alternatives

- **Make users manage bundled GA as an install step**: too much cognitive load.
  Users should configure a model and talk to Galley.
- **Expose Galley Persona as a user setting**: not needed for the first
  product shape; it would turn a carefully designed assistant voice into yet
  another option.
- **Mix attach and managed session history**: cheaper technically, but worse
  mental model. Separate history makes "two GA kernels" legible.
- **Probe Keychain to keep Settings status precise**: precise but hostile. A
  scary OS prompt on startup is worse than a passive "saved but unchecked"
  status.
- **Local encrypted API-key file instead of Keychain**: either weaker security
  or more product surface. The right fix was timing, not storage replacement.
- **Source-only M9 gate**: insufficient. The real user artifact is the app/DMG,
  and packaging can fail even when source payload is correct.

## Open questions

- Dogfood the lazy Keychain behavior in dev and packaged app: ordinary launch
  should not prompt; model test / send may prompt.
- Re-enter a managed Provider key on this machine before the next full managed
  conversation smoke, because the current Keychain entry is unavailable.
- Decide later whether Windows needs an equivalent package inspection gate for
  NSIS contents.
- Menubar / background mode remains a beta release gate decision.
- Windows smoke remains required before public beta unless shipped with an
  explicit caveat.

## Next

Start next session by running dev dogfood on the current managed runtime:

1. Open Galley normally and confirm no Keychain prompt appears on startup.
2. Re-save the managed Provider key in Settings -> Models.
3. Test connection / fetch model list, then send one managed-mode message.
4. Run attach-mode smoke once to confirm the runtime boundary stayed intact.
5. If packaging changed again, rerun the app-bundle gate on the built `.app`
   and mounted DMG.
