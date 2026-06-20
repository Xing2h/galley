# Release / Update SOP

> Maintainer checklist for shipping a Galley release and promoting the app
> update channel. Use this as the runbook during release day. Use
> [release workflow](./release-workflow.md) for deeper background and edge
> cases.

## Principle

Release and update are two separate gates:

1. `release.yml` builds installers and creates a **draft GitHub Release**.
2. Release-owner review and smoke test decide whether that exact draft build is
   safe to publish.
3. `promote-update-channel.yml` updates `updates/stable/latest.json` **only
   after publish + smoke**. It also keeps `updates/beta/latest.json` as a
   legacy alias for older installed builds.

Agent rule: stop at the draft Release gate. After CI creates the draft, report
the draft URL, asset list, and verification state, then wait for the release
owner to install / smoke the new build and explicitly approve publish. A
pre-flight "release this version" request is permission to prepare the release,
not permission to publish unseen installers. Build green is not publish
approval.

For stable and patch releases, the release is not complete at GitHub publish.
The default finish line is:

1. release owner approves the draft after installer smoke;
2. publish the GitHub Release;
3. promote the default update channel in the same release session;
4. verify the live update manifest.

Only skip promotion when the release owner explicitly marks the release as
`manual-download only` or `hold updater`. If either exception is used, record it
in the GitHub Release notes and [project status](./project-status.md), because
installed users will not see that version through Galley's update UI.

Do not point the update channel at a draft, untested, or failed build. The
draft Release `latest.json` is a review artifact, not the live user channel.
For tester / early-adopter alpha releases, publish for manual downloads only and
skip update-channel promotion unless we explicitly decide to offer that alpha to
all current update-channel users. Alpha releases normally stay marked as GitHub
Pre-release; if we want the repo sidebar to show the alpha as GitHub Latest,
GitHub requires removing the prerelease flag. This still does not promote the
app update channel.

## Pre-Flight

Set the release tag for the rest of the checklist:

```bash
RELEASE_TAG=v0.2.1
```

Replace the example value before every release.

- [ ] `main` is the intended release commit.
- [ ] Latest `check.yml` run is green on supported release targets: macOS Apple
      Silicon, macOS Intel, and Windows x64.
- [ ] Local verification passed for the change scope:
  - `pnpm --dir gui typecheck`
  - `pnpm --dir gui lint`
  - `cargo check --workspace` or the narrower Rust check justified by scope
- [ ] If the release touches managed GA, the GA baseline, or bundled
      dependencies, the bundled runtime gate passed:
  - `./scripts/bundle-python.sh <target-arch>`
  - `./scripts/check-bundled-python-managed-ga.sh`
- [ ] `docs/devlog/` has the durable release narrative if this is more than a
      tiny hotfix.
- [ ] Version is bumped consistently:
  - `package.json`
  - `gui/package.json`
  - `core/tauri.conf.json`
  - `core/Cargo.toml`
  - `cli/Cargo.toml`
- [ ] GitHub release/update config exists:
  - Secret: `TAURI_SIGNING_PRIVATE_KEY`
  - Secret: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if the key has a password
  - Variable: `GALLEY_UPDATER_PUBKEY`
  - Variable: `GALLEY_UPDATER_ENDPOINT`
- [ ] Update-channel policy is decided:
  - stable / patch release: promote `stable` after publish + smoke
  - tester / early-adopter release: manual download only by default
  - exception: `manual-download only` or `hold updater`, documented in notes and
    project status

Supported release targets are macOS Apple Silicon, macOS Intel, and Windows
x64. Windows ARM is not part of the default release matrix until
`release.yml`, `bundle-python.sh`, updater manifest generation / validation, and
the Windows smoke path all support `aarch64-pc-windows-msvc`.

Expected default endpoint:

```text
https://raw.githubusercontent.com/wangjc683/galley/galley-update-channel/updates/stable/latest.json
```

Legacy endpoint kept for older builds:

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

Agent stop point:

- Do not publish the draft from this step.
- Post the draft URL and direct installer links for release-owner smoke.
- Wait for an explicit post-draft approval such as "smoke passed, publish" or
  "publish and promote".

### 4. Review Draft Release

Open the draft Release in GitHub and check:

- Version and title are correct.
- It is marked prerelease for alpha / beta / rc tags, unless we explicitly plan
  to mark this release as GitHub Latest after smoke.
- Release notes follow the template below. They are user-facing, not just
  commit messages.
- Assets are present for supported platforms.
- Updater artifacts are present:
  - macOS `.app.tar.gz` plus `.sig`
  - Windows setup `.exe` plus `.sig`
  - `latest.json` candidate

Do not publish if assets are missing or release notes are misleading.

Do not publish before the release owner has installed and smoked the draft
artifacts. If an agent is driving the release, this is a hard handoff point:
the agent waits here and resumes only after explicit approval for this exact
draft build.

#### Stable Release Notes Template

Use this compact template for stable and beta releases. Future GitHub Release
notes should follow this structure unless the release owner explicitly approves
a different format. The point is to answer two user questions directly: what
changed, and which installer should I download? For alpha releases, use the
alpha template below.

Writing rules:

- Chinese first, English second. Both sections should be complete; do not use a
  thin machine translation. Keep the two halves in sync — a bullet in one must
  appear in the other.
- Keep the headings stable: `## What's New`, `## 安装指南`, `---`,
  `## What's New`, `## Installation Guide`.
- Write bullets as `功能区域：用户看得见的变化` in Chinese and
  `Area: user-visible change` in English.
- Tone: concise and professional. One bullet per user-visible change, one
  sentence each. Lead with the change, not the symptom — "新增字号切换"
  (adds a font-size switcher), not "修复了用户反馈的字号问题". Drop
  hedge / filler like "修复了一个 case", "保持不变", or describing the
  pre-release state for its own sake. If a sentence does not tell the user
  something they can see or act on, cut it.
- Scope to what changed this tag, not the whole product. Before drafting, run
  `git log <PREVIOUS_TAG>..HEAD --oneline` and walk every commit; map each
  user-facing commit to a bullet. A release that ships a new feature plus a
  fix is not a "hotfix" even if it started as one — title and bullets must
  reflect everything shipped.
- For patch releases, 3-5 focused bullets are enough. For larger releases, keep
  the list scannable instead of turning it into a changelog dump. Related
  changes (e.g. several typography commits) collapse into one bullet rather
  than one per commit.
- Keep established product terms such as `Galley`, `GA`, `GenericAgent`,
  `Agent / CLI`, `Browser Control`, `Channels`, and `ChatGPT / Codex`.
- Use `内置 GA` in Chinese and `Bundled GA` in English. Do not expose
  `managed GA` in user-facing release notes.
- Installation links must point directly to GitHub Release assets.
- Always include the macOS quarantine command and Windows SmartScreen note while
  Galley is unsigned.
- Omit general compatibility / non-change statements ("no Agent API / DB / GA
  baseline changes", "reduce heat and resource usage") unless they change what
  a user does next. The release notes describe changes, not reassurances.

Replace `<TAG>` with the Git tag (for example `v0.2.5`) and `<VERSION>` with
the package version (for example `0.2.5`).

````markdown
## What's New

- <功能区域>：<一句话说明用户看得见的新增、修复或体验变化>。
- <功能区域>：<一句话说明用户看得见的新增、修复或体验变化>。
- <功能区域>：<一句话说明用户看得见的新增、修复或体验变化>。

## 安装指南

### macOS

- [下载 Apple Silicon 版](https://github.com/wangjc683/galley/releases/download/<TAG>/Galley_<VERSION>_macOS_aarch64.dmg)
- [下载 Intel 版](https://github.com/wangjc683/galley/releases/download/<TAG>/Galley_<VERSION>_macOS_x64.dmg)

如果 macOS 提示无法打开 Galley，可以在终端执行：

```bash
xattr -dr com.apple.quarantine /Applications/Galley.app
```

### Windows

- [下载 Windows 版](https://github.com/wangjc683/galley/releases/download/<TAG>/Galley_<VERSION>_Windows_x64-setup.exe)

如果 Windows SmartScreen 提示风险，点击「更多信息」->「仍要运行」。

---

## What's New

- <Area>: <one sentence describing the user-visible addition, fix, or experience change>.
- <Area>: <one sentence describing the user-visible addition, fix, or experience change>.
- <Area>: <one sentence describing the user-visible addition, fix, or experience change>.

## Installation Guide

### macOS

- [Download for Apple Silicon](https://github.com/wangjc683/galley/releases/download/<TAG>/Galley_<VERSION>_macOS_aarch64.dmg)
- [Download for Intel](https://github.com/wangjc683/galley/releases/download/<TAG>/Galley_<VERSION>_macOS_x64.dmg)

If macOS says Galley cannot be opened, run this in Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Galley.app
```

### Windows

- [Download for Windows](https://github.com/wangjc683/galley/releases/download/<TAG>/Galley_<VERSION>_Windows_x64-setup.exe)

If Windows SmartScreen shows a warning, click "More info" -> "Run anyway".

**Full Changelog**: https://github.com/wangjc683/galley/compare/<PREVIOUS_TAG>...<TAG>
````

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

If an agent is driving the release, the release owner performs or explicitly
accepts this smoke result. The agent must not infer approval from CI status,
asset presence, or an earlier "go release" instruction.

### 6. Publish Release

Publish only after smoke passes and the release owner explicitly approves
publishing this exact draft build.

After publish:

- The GitHub Release is user-visible.
- The update channel is still unchanged until Step 7.
- For stable / patch releases, continue immediately to Step 7. Do not stop here
  unless the release is explicitly `manual-download only` or `hold updater`.
- Existing installed apps will not see this version until promotion.

### 7. Promote Update Channel

Promote after publish + smoke. For stable / patch releases, this is a default
release step, not optional cleanup.

Skip this step for tester / early-adopter alpha releases unless we explicitly
decide that all current update-channel users should receive the alpha build.
Also skip only when the release is explicitly marked `manual-download only` or
`hold updater` in the release notes and project status.

```bash
gh workflow run promote-update-channel.yml \
  --repo wangjc683/galley \
  --ref main \
  -f tag="${RELEASE_TAG}" \
  -f channel=stable

gh run watch --repo wangjc683/galley --exit-status
```

The workflow refuses draft releases. It regenerates `latest.json` from the
published release artifacts and pushes it to the `galley-update-channel`
branch. Promoting `stable` also writes the same manifest to `updates/beta/` so
older installed builds that were compiled with the legacy endpoint can still
update.

### 8. Verify Live Update Channel

Run the live channel verifier:

```bash
node scripts/check-update-channel.mjs \
  --repo wangjc683/galley \
  --tag "${RELEASE_TAG}" \
  --channel stable \
  --cache-bust
```

Check:

- `version` matches the promoted tag.
- Platform URLs point at the published GitHub Release assets.
- `signature` values are inline signature contents, not `.sig` URLs.
- Platform asset URLs return a successful HTTP status.
- The manifest changed on `galley-update-channel`.

The promote workflow runs the same verifier after it pushes the channel branch.
It passes `--cache-bust` so GitHub raw CDN cache cannot keep returning a stale
but valid old manifest. If this step fails, treat the update channel as not
promoted even if the workflow generated a local `latest.json`.

After verification passes, edit the GitHub Release notes if needed so installed
users are told they can update in Galley, not that they should wait for the
update channel.

### 9. Sync Project Status Docs

After publish and update-channel verification, update
[project status](./project-status.md) so the repository reflects the released
state.

For a docs-only status sync, do not wait for full `check.yml` before moving on.
Run the lightweight whitespace check, commit, push, and confirm that GitHub
Actions was triggered. Let CI finish in the background.

```bash
git diff --check
git add docs/project-status.md
git commit -m "Update release status for ${RELEASE_TAG}"
git push origin main
```

Wait for CI only if the post-release commit touches code, scripts, workflows,
packaging config, or release / update-channel logic. Those changes can affect
future builds or updater behavior; a pure status document cannot affect the
already-published installers or live update manifest.

### 10. Dogfood App Update

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
  -f channel=stable
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
| Live channel verifier returns 404 | Channel branch was not promoted or raw URL is wrong | Rerun promote, then verify `updates/stable/latest.json` on `galley-update-channel`; for old builds, also verify the `updates/beta/latest.json` alias |
| Live channel verifier reads previous version | GitHub raw CDN returned stale but valid manifest content | Use `--cache-bust`, keep validation inside verifier retries, and confirm the pushed file on `galley-update-channel` |

## Done Criteria

- [ ] Release owner explicitly approved the exact draft build after installer
      smoke.
- [ ] GitHub Release published.
- [ ] For stable / patch releases, default update channel promoted after smoke,
      unless the release is explicitly `manual-download only` or `hold updater`.
- [ ] Live `updates/stable/latest.json` verified.
- [ ] Legacy `updates/beta/latest.json` alias verified when promoting `stable`.
- [ ] Older installed app can update to the new version.
- [ ] Any release-specific caveats are in Release notes and devlog.
