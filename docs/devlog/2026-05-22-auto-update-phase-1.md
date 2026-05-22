# Auto Update Phase 1

**Date**: 2026-05-22  
**Status**: Implemented  
**Related**: Settings -> About, Tauri updater, release workflow

## Context

目标体验是：Galley 后台发现新版本，准备好更新，然后提示用户重启。
但当前 release 仍是 beta prerelease，且项目的 macOS / Windows 分发策略还未进入
完整代码签名阶段。Tauri updater 又强依赖独立的更新包签名，所以不能把
「加一个检查更新按钮」误做成「发布链路已经完整可用」。

## Decisions

- 第一阶段先接入真实 updater plumbing：Rust 注册 `tauri-plugin-updater`，
  Settings -> About 增加检查 / 下载 / 重启入口，启动时后台检查一次。
- 更新通道用编译期变量显式启用：`GALLEY_UPDATER_PUBKEY` 和
  `GALLEY_UPDATER_ENDPOINT` 同时存在才会真正检查远端 manifest。
- 未配置时 UI 显示「当前构建未配置更新通道」，但不让 Dev、本地 build、
  或普通启动失败。
- Webview 不直接调用 updater plugin command；前端只调用 Galley 自己的
  Rust command。这样可以把「未配置」作为产品状态，而不是暴露成底层
  `EmptyEndpoints` 错误。
- `plugin-process` 只用于安装完成后的 relaunch；如果仍有 session 在运行，
  Settings 阻止立即重启并提示先等任务结束。
- 默认 Tauri config 不打开 updater artifact 生成，避免 Dev / local build 被
  signing key 绑定。
- Release workflow 通过 `core/tauri.updater.conf.json` 单独打开
  `createUpdaterArtifacts`，并要求 `TAURI_SIGNING_PRIVATE_KEY`、
  `GALLEY_UPDATER_PUBKEY`、`GALLEY_UPDATER_ENDPOINT` 在构建前存在。
- Release artifacts 会包含平台安装包以及 updater 所需的 signed artifacts：
  macOS `.app.tar.gz` + `.sig`，Windows setup `.exe` + `.sig`。
- Release workflow 生成 `latest.json` candidate 作为 draft Release asset；这个
  candidate 用于 review，不直接更新用户通道。
- 新增手动 `promote-update-channel.yml`：release publish + smoke test 之后，
  明确把某个 tag 推到 `galley-update-channel` 分支的
  `updates/beta/latest.json`，已安装 app 读取这个稳定 beta endpoint。

## Rejected Alternatives

- 直接配置 `/releases/latest/download/latest.json`：beta release 按规则不能标记
  Latest，这个 endpoint 会指错 channel。
- 在默认 `tauri.conf.json` 里开启 `createUpdaterArtifacts`：没有
  `TAURI_SIGNING_PRIVATE_KEY` 时会让 Dev / local build 变脆；release-only
  override 更符合当前阶段。
- 把更新失败当普通 error toast：未配置在当前阶段不是故障，而是发布通道尚未启用。
- 让前端直接用 `@tauri-apps/plugin-updater`：产品状态会被底层错误语义牵着走，
  也更难保持本地 Dev 的降级体验。
- beta channel 的 manifest 托管用 GitHub Release asset、GitHub Pages，还是
  独立对象存储。当前选择 `galley-update-channel` 分支上的 raw GitHub URL，
  因为不需要额外基础设施，也不依赖 prerelease 的 Latest 语义。
- release workflow 直接更新 beta manifest：会让 draft / 未 smoke 版本提前暴露给
  用户，和当前发版 SOP 冲突。

## Open Questions

- 更新可用时是否需要全局 toast / 顶部轻提示，而不是只在 Settings -> About 里显示。
- Windows NSIS 更新安装会退出 app，是否需要单独的任务保护文案。

## Next

配置 GitHub updater secrets / variables 后，跑一次 release dry-run 和真实 beta
promote dogfood；之后再接自动静默下载。
