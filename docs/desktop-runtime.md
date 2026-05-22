# Desktop Runtime

> Maintainer-facing document for packaging, app data, and runtime policy.
> For a general architecture overview, read [architecture](./architecture.md).

This document covers desktop packaging and runtime invariants: Tauri app data,
identifier safety, unsigned releases, bundled Python, and Mac / Windows notes.

## Tauri Identifier

Tauri `identifier` binds the app data directory on all supported platforms:

- macOS: `~/Library/Application Support/{identifier}/`
- Linux: `$XDG_DATA_HOME/{identifier}/` or `~/.local/share/{identifier}/`
- Windows: `%APPDATA%/{identifier}/`

Galley currently uses `app.galley`. SQLite data for sessions, projects,
tool events, prefs, and migrations lives under that identifier-controlled data
directory.

Changing the identifier without migration makes user data appear to vanish,
because the app starts reading an empty new directory.

## Identifier Change Rule

Do not change the Tauri identifier unless the same change includes:

1. Rust-side startup migration from old data directory to new data directory.
2. Fallback copy / rename behavior if the new DB is missing but the old DB
   exists.
3. Dogfood using a manually seeded old data directory.
4. Release notes explaining the one-time migration.

Historical lesson: the 2026-05-13 rename from `app.gaworkbench` to `app.galley`
made sessions appear missing during dogfood. The data was not lost; the app was
looking at a new directory.

## Signing Strategy

Pre-v1.0 Galley ships unsigned:

- macOS `.app` / `.dmg` are not codesigned or notarized.
- Windows `.exe` / NSIS installer is not signed with an EV certificate.
- Release notes must explain first-launch friction.

Current decision, 2026-05-18: unsigned is acceptable for the current personal
open-source stage. Re-evaluate before v1.0 or when user scale makes manual
Gatekeeper / SmartScreen bypass too costly.

Expected user flow:

- macOS: right click the app, choose Open, then confirm the Gatekeeper dialog.
- Windows: SmartScreen -> More info -> Run anyway.

Any PR adding `codesign`, `notarytool`, or `signtool.exe` should also update
this policy and [release workflow](./release-workflow.md).

## Auto Update Runtime

Galley checks for app updates on startup and exposes the current update state in
Settings -> About / Runtime. Update delivery is enabled only for builds that
provide both compile-time variables:

- `GALLEY_UPDATER_PUBKEY`: Tauri updater public key embedded in the app.
- `GALLEY_UPDATER_ENDPOINT`: HTTPS URL for the updater manifest.

Current beta endpoint:

```text
https://raw.githubusercontent.com/wangjc683/galley/galley-update-channel/updates/beta/latest.json
```

Without both values, the app reports that this build is not connected to an
update channel and local development keeps working. This is intentional: Tauri
updater package verification is mandatory and should not be bypassed just
because Galley itself is still unsigned at the OS level.

Tauri updater signing is separate from macOS codesigning / Windows Authenticode.
The private updater key must stay in release secrets; only the public key is
safe to embed in app builds.

Release builds opt into signed updater artifacts by generating
`core/tauri.updater.generated.conf.json` inside CI. The default
`tauri.conf.json` intentionally does not enable `createUpdaterArtifacts`, so
local Dev and unsigned local builds do not require `TAURI_SIGNING_PRIVATE_KEY`.

The release workflow creates a candidate `latest.json` as a draft Release asset.
After smoke test and publishing the release, run the manual
`promote-update-channel.yml` workflow to update the beta manifest that installed
apps read.

## Bundled Python

Since v0.1.1, Galley release builds embed CPython 3.11.15 plus GenericAgent core
dependencies. Users do not need to configure Python or a venv for normal use.

Implementation notes:

- Source: `python-build-standalone` install-only stripped builds.
- Script: `scripts/bundle-python.sh`.
- Output: `core/python-bundle/python/` generated per target arch.
- Tauri resource: `python-bundle/python/` is bundled as `$RESOURCE/python/`.
- Tauri aliases:
  - `python-bundled` for macOS / Linux (`bin/python3`)
  - `python-bundled-win` for Windows (`python.exe`)
- User escape hatch: `gaConfig.useExternalPython = true`.
- Dev mode uses external Python because `$RESOURCE` does not point at the final
  bundle resource directory during `pnpm tauri dev`.

Bundled GenericAgent core deps are audited during baseline upgrades. See
[GA baseline](./ga-baseline.md).

## Release Artifacts

Current release path:

- macOS Apple Silicon DMG via CI.
- macOS Intel DMG via CI cross-compile path where available, local fallback if
  needed.
- Windows x64 NSIS installer via CI.

The detailed release process lives in [release workflow](./release-workflow.md).
Windows manual smoke lives in [windows build checklist](./windows-build-checklist.md).

## Platform Terminology

- `macOS` means the operating system. Use for platform names, system
  requirements, and release titles.
- `Mac` means the hardware family or user device.
- Release title examples:
  - `Galley v0.2.0-beta.1 · macOS (Beta)`
  - `Galley v0.2.0-beta.1 · Windows (Beta)`
