# Release / Update SOP

> Maintainer checklist for shipping a Galley release and promoting the app
> update channel. Use this as the runbook during release day. Use
> [release workflow](./release-workflow.md) for deeper background and edge
> cases.

## Principle

Release and update are two separate gates:

1. `release.yml` builds installers and creates a **draft GitHub Release**.
2. Human review and smoke test decide whether the Release is safe to publish.
3. `promote-update-channel.yml` updates `updates/beta/latest.json` **only after
   publish + smoke**.

Do not point the update channel at a draft, untested, or failed build. The
draft Release `latest.json` is a review artifact, not the live user channel.
For tester / early-adopter alpha releases, publish the GitHub Pre-release for
manual downloads only and skip the beta-channel promotion unless we explicitly
decide to offer that alpha to all current update-channel users.

## Pre-Flight

Set the release tag for the rest of the checklist:

```bash
RELEASE_TAG=v0.2.0-alpha.1
```

Replace the example value before every release.

- [ ] `main` is the intended release commit.
- [ ] Latest `check.yml` run is green on macOS and Windows.
- [ ] Local verification passed for the change scope:
  - `pnpm --dir gui typecheck`
  - `pnpm --dir gui lint`
  - `cargo check --workspace` or the narrower Rust check justified by scope
- [ ] `docs/devlog/` has the durable release narrative if this is more than a
      tiny hotfix.
- [ ] Version is bumped consistently:
  - `gui/package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
- [ ] GitHub release/update config exists:
  - Secret: `TAURI_SIGNING_PRIVATE_KEY`
  - Secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has a password
  - Variable: `GALLEY_UPDATER_PUBKEY`
  - Variable: `GALLEY_UPDATER_ENDPOINT`

Expected beta endpoint:

```text
https://raw.githubusercontent.com/wangjc683/galley/galley-update-channel/updates/beta/latest.json
```

## Dry Run

Use this after touching workflow, packaging, signing, updater, or CI config.
It builds the release artifacts without creating a GitHub Release.

```bash
gh workflow run release.yml --ref main
gh run watch --repo wangjc683/galley --exit-status
```

Pass criteria:

- macOS and Windows build jobs are green.
- Updater signing config validation is green.
- No Node/runtime deprecation warnings or runner migration notices that should
  be handled before release.

## Release Steps

### 1. Commit Version Bump

Use one small commit so a bad release prep can be reverted cleanly.

```bash
git add gui/package.json core/tauri.conf.json core/Cargo.toml cli/Cargo.toml
git commit -m "Bump version ${RELEASE_TAG}"
```

### 2. Tag And Push

Push `main` and the tag together so CI can fetch the exact commit.

```bash
git tag "${RELEASE_TAG}"
git push origin main "${RELEASE_TAG}"
```

### 3. Wait For Release Workflow

```bash
gh run list --repo wangjc683/galley --workflow release.yml --limit 5
gh run watch --repo wangjc683/galley --exit-status
```

Pass criteria:

- Platform build jobs are green.
- Draft GitHub Release exists.
- Draft assets include installers and updater artifacts.
- Draft assets include `latest.json` candidate.

### 4. Review Draft Release

Open the draft Release in GitHub and check:

- Version and title are correct.
- It is marked prerelease for alpha / beta / rc tags.
- Release notes are user-facing, not just commit messages.
- Assets are present for supported platforms.
- Updater artifacts are present:
  - macOS `.app.tar.gz` plus `.sig`
  - Windows setup `.exe` plus `.sig`
  - `latest.json` candidate

Do not publish if assets are missing or release notes are misleading.

#### Alpha Release Notes Template

Use this compact template for tester / early-adopter alpha builds. Keep updater
checks out of the default test list unless the alpha is explicitly promoted to
an update channel.

````markdown
适合内测用户和愿意尝鲜的用户体验。alpha 版本仍在快速迭代，可能存在稳定性问题，不建议普通用户安装。
For testers and early adopters. This alpha build is still evolving quickly and may be unstable, so it is not recommended for general users.

## 请重点测试

- 全新安装后完成 Onboarding，配置模型并进入主界面。
- 新建对话，确认 Galley 能正常回复。
- Settings -> IM 接入微信，扫码后从微信给 Galley 发消息。
- 浏览器控制扩展安装、连接测试和简单浏览器任务。
- 退出并重启 Galley，确认模型配置、历史对话和微信接入状态符合预期。

## macOS 安装提示

如果 macOS 提示无法打开，可以在终端执行：

```bash
xattr -dr com.apple.quarantine /Applications/Galley.app
```

## Please Test

- Complete Onboarding after a fresh install, configure a model, and enter the main screen.
- Start a new conversation and confirm Galley replies normally.
- Connect WeChat in Settings -> IM, then send a message to Galley from WeChat.
- Install the Browser Control extension, test the connection, and run a simple browser task.
- Quit and relaunch Galley, then confirm model settings, conversation history, and WeChat connection state still look correct.

## macOS Install Note

If macOS says Galley cannot be opened, run this in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Galley.app
```
````

### 5. Smoke Test Installers

Download from the draft Release and run the platform smoke path:

- macOS Apple Silicon: install DMG, right click Open if Gatekeeper blocks, run
  a new session, switch LLM once, trigger one approval path.
- macOS Intel: smoke the x64 build when available or use the documented local
  fallback.
- Windows x64: install NSIS setup and run the
  [Windows checklist](./windows-build-checklist.md).

If smoke fails, stop here. Delete the bad tag, fix, bump or retag as needed,
and run release again.

### 6. Publish Release

Publish only after smoke passes.

After publish:

- The GitHub Release is user-visible.
- The update channel is still unchanged.
- Existing installed apps will not see this version until promotion.

### 7. Promote Update Channel

Promote after publish + smoke:

Skip this step for tester / early-adopter alpha releases unless we explicitly
decide that all current beta-channel users should receive the alpha build.

```bash
gh workflow run promote-update-channel.yml \
  --repo wangjc683/galley \
  --ref main \
  -f tag="${RELEASE_TAG}" \
  -f channel=beta

gh run watch --repo wangjc683/galley --exit-status
```

The workflow refuses draft releases. It regenerates `latest.json` from the
published release artifacts and pushes it to the `galley-update-channel`
branch.

### 8. Verify Live Update Channel

Run the live channel verifier:

```bash
node scripts/check-update-channel.mjs \
  --repo wangjc683/galley \
  --tag "${RELEASE_TAG}" \
  --channel beta
```

Check:

- `version` matches the promoted tag.
- Platform URLs point at the published GitHub Release assets.
- `signature` values are inline signature contents, not `.sig` URLs.
- Platform asset URLs return a successful HTTP status.
- The manifest changed on `galley-update-channel`.

The promote workflow runs the same verifier after it pushes the channel branch.
If this step fails, treat the update channel as not promoted even if the
workflow generated a local `latest.json`.

### 9. Dogfood App Update

Use an installed older release build, not `tauri dev`.

Expected path:

1. Launch older Galley.
2. Settings -> About or Runtime shows update status.
3. If no session is running, Galley downloads/prepares in the background.
4. If a session is running, Galley remembers the update and waits.
5. After preparation, click restart.
6. Relaunched app shows the new version.

Dev builds without updater compile-time variables should show the expected
"not connected to update channel" state.

## Rollback

Rollback the update channel first. Do not start by deleting the Release.

If the promoted version is bad but an older release is still safe:

```bash
gh workflow run promote-update-channel.yml \
  --repo wangjc683/galley \
  --ref main \
  -f tag=<last-good-tag> \
  -f channel=beta
```

Then:

- Keep the bad Release visible only if users need manual downgrade assets.
- Add a warning to the Release notes if appropriate.
- Ship a hotfix tag when ready.

## Failure Guide

| Symptom | Likely cause | Action |
|---|---|---|
| Release workflow fails at signing config | Missing GitHub secret / variable | Fix repo settings, rerun dry-run |
| `failed to decode base64 pubkey` | Used decoded minisign text instead of `.pub` file content | Set `GALLEY_UPDATER_PUBKEY` to `updater.key.pub` content |
| Promote workflow refuses release | Release is still draft | Publish only after smoke, then rerun promote |
| App says update channel not connected | Build lacks updater compile-time config | Expected in Dev; for release, inspect generated Tauri config |
| Update downloads during active task | Protection regression | Stop release, fix before promotion |
| Manifest URL points at wrong version | Wrong tag promoted | Promote the correct tag |
| Live channel verifier returns 404 | Channel branch was not promoted or raw URL is wrong | Rerun promote, then verify `updates/beta/latest.json` on `galley-update-channel` |

## Done Criteria

- [ ] GitHub Release published.
- [ ] Update channel promoted only after smoke.
- [ ] Live `latest.json` verified.
- [ ] Older installed app can update to the new version.
- [ ] Any release-specific caveats are in Release notes and devlog.
