# Update Channel Verifier

**Date**: 2026-05-28
**Status**: Implemented
**Related**: Tauri updater, release/update SOP, GitHub Actions

## Context

Galley 的应用内检查更新和后台准备更新已经接上 Tauri updater，但真实用户能不能
更新取决于另一个更脆的边界：live beta manifest 是否已经发布到
`galley-update-channel`。这次检查发现 GitHub secrets / variables 已配置，但
`v0.2.0-beta.1` release 尚不存在，live
`updates/beta/latest.json` 仍然 404。

这说明当前风险不在 `latest.yml` / `latest.json` 文件名，也不在 Settings 按钮；
风险在 release publish + promote 之后缺少一个自动失败的验收点。

## Decisions

- 保持 Tauri updater 的 JSON manifest 方案，不引入 Electron 风格
  `latest.yml`。
- 新增 `scripts/check-update-channel.mjs` 作为 live channel verifier。它检查：
  HTTP 200、manifest JSON 形状、目标版本、三平台 platform entries、inline
  signature、以及平台 asset URL 可访问。
- `promote-update-channel.yml` 推送 `galley-update-channel` 后自动运行 verifier。
  即使 channel 已经指向同一个 tag，也不再提前 `exit 0`；仍然验证 live endpoint。
- `docs/release-update-sop.md` 和 `docs/release-workflow.md` 把 verifier 作为
  release gate。生成 candidate 不等于用户更新通道上线，live verifier 通过才算。

## Rejected Alternatives

- 手写一个占位 `latest.json` 消掉 404：会把“channel 未发布”变成 manifest
  解析、版本或验签错误，对用户没有帮助。
- 把 endpoint 改成 GitHub `/releases/latest/download/latest.json`：beta release
  不能依赖 GitHub Latest 语义，之前已经明确选择独立 beta channel。
- 只在 SOP 里写 curl 命令：人工检查容易漏掉 version、signature 和 asset URL，
  也不能让 promote workflow 自动失败。

## Open Questions

- 是否要给 app 内错误映射增加更细的文案：例如远端 manifest 404 时提示“更新通道
  尚未发布”，而不是普通网络失败。
- 是否在 release dry-run 后自动跑一个 candidate verifier，专门检查 draft
  Release 里的 `latest.json` asset。

## Dry-Run Follow-Up

Manual `release.yml` dry-run does not create a GitHub Release because the final
release job is tag-only. It is safe for private dogfood artifacts.

The first dry-run exposed a Windows-only bundled-Python verification failure:
`bundle-python.sh win-x64` inserted a Git Bash path like
`/d/a/galley/galley/managed-ga/code` into Windows Python's `sys.path`, so
`agentmain.py` existed but `import agentmain` failed. The fix converts only
Windows verification paths through `cygpath -w` and passes them via environment
variables instead of interpolating shell paths into Python code.

## Next

重跑 release dry-run；通过后先下载 Actions artifacts 做内部安装 dogfood。公开
发布和 beta channel promotion 仍然等 dogfood 通过后再做。
