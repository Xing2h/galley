# 2026-06-12 - v0.2.8 Goal and workbench polish release prep

## Date / Status / Related

- Date: 2026-06-12
- Status: `v0.2.8` published as stable GitHub Latest and promoted to the default
  update channel.
- Related:
  - [Project status](../project-status.md)
  - [Release / update SOP](../release-update-sop.md)
  - [Release workflow](../release-workflow.md)
  - [Galley Goal V1](./2026-06-04-galley-goal-v1.md)
  - [GA upstream upgrade ba19018a -> 0def7441](./2026-06-12-ga-upstream-upgrade-ba19018a-to-0def7441.md)
  - [Settings tab-by-tab polish](./2026-06-11-settings-tab-by-tab-polish.md)

## Context

After `v0.2.7`, `main` accumulated 38 commits. The release is large for a patch
line, but the public Agent API stays at `schemaVersion: 1` and the changes are
additive or internal. The user-visible story is cohesive: Goal V1 moved from
headless capability into a usable desktop flow, the main workbench and Settings
were polished through dogfood, Browser Control recovery got clearer, and the
bundled GenericAgent baseline was refreshed again after audit.

The current release infrastructure still supports three shipped targets:
macOS Apple Silicon, macOS Intel, and Windows x64. Windows ARM is technically
plausible now, but it needs its own workflow, bundled-Python, updater-manifest,
and smoke path before it can be treated as a supported stable asset.

## Decisions

- Target `v0.2.8` as a stable patch release, not `v0.3.0`, because no public
  schema break or product-boundary reset is included.
- Keep release notes focused on four user-facing buckets:
  1. Galley Goal V1 and master-session delivery.
  2. Main workbench polish: sidebar, conversation density, Markdown/code blocks,
     question rail, and Composer `/btw` guidance.
  3. Settings / Models / Browser Control polish and clearer setup / repair
     surfaces.
  4. Runtime reliability: audited bundled GA baseline `0def7441`, Browser
     Control reconnect timing, and managed payload gates.
- Keep Core/CLI large-file splits out of headline release notes. They matter for
  maintainability, but users should not be asked to care about module layout.
- Keep Windows ARM out of `v0.2.8`. Add it later only after
  `aarch64-pc-windows-msvc` is supported by the release matrix,
  `bundle-python.sh`, updater manifest generation / validation, and a smoke
  checklist.
- Treat `v0.2.8` as a normal stable / patch release: after publish and smoke,
  promote `stable` and verify both `stable` and the legacy `beta` alias.

## Verification

- GitHub Actions `check.yml` run `27406003983` passed on current `main` for:
  - workflow lint
  - frontend typecheck / lint and managed payload gate
  - Core / CLI checks and tests on macOS Apple Silicon
  - Core / CLI checks and tests on macOS Intel target
  - Core / CLI checks and tests on Windows x64 target
- Previous post-`v0.2.7` work already included a real model e2e pass for the
  GA baseline work:
  `GA_PATH=/tmp/galley-ga-e2e.QvM93c BRIDGE_PYTHON=python3 E2E_LLM_NAME=glm-5.1 .venv/bin/python -m pytest runner/tests/ -m e2e -vv`
- Local release-prep gates after the version bump and docs updates:
  - `pnpm --dir gui typecheck`
  - `pnpm --dir gui lint`
  - `cargo check --manifest-path core/Cargo.toml`
  - `cargo check --manifest-path cli/Cargo.toml`
  - `cargo test --manifest-path core/Cargo.toml`
  - `cargo test --manifest-path cli/Cargo.toml`
  - `node scripts/check-managed-ga-payload.mjs`
  - `git diff --check`
- Release state:
  - GitHub Actions `release.yml` run `27406851173` completed successfully on
    macOS Apple Silicon, macOS Intel, Windows x64, and draft Release creation.
  - GitHub Release `v0.2.8` is published, non-prerelease, and GitHub Latest.
  - Release assets include both macOS DMGs, Windows setup, updater archives,
    updater signatures, and `latest.json`.
  - `promote-update-channel.yml` run `27408494572` promoted `stable` and the
    legacy `beta` alias.
  - `node scripts/check-update-channel.mjs --repo wangjc683/galley --tag v0.2.8 --channel stable --cache-bust --retries 6 --retry-delay-ms 10000`
  - `node scripts/check-update-channel.mjs --repo wangjc683/galley --tag v0.2.8 --channel beta --cache-bust --retries 6 --retry-delay-ms 10000`

## Rejected alternatives

- Waiting for more features: rejected because the release already has a coherent
  user-facing story and delaying only increases release-note size and regression
  surface.
- Shipping as `v0.3.0`: rejected because the Agent API remains stable and the
  release does not redefine Galley's public contract.
- Adding Windows ARM directly to this release: rejected because a single extra
  installer without updater manifest support and smoke coverage would create a
  half-supported platform.
- Listing every UI polish commit in release notes: rejected because users need a
  high-signal summary, not a changelog dump.

## Next

Dogfood update from an installed `v0.2.7` or older build. Keep Windows ARM as a
separate platform-support task instead of retrofitting it into this stable patch.
