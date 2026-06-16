# Managed IM Supervisor · Feishu Channel

**Date**: 2026-06-16
**Status**: Implemented
**Related**: [managed GA runtime](../managed-ga-runtime.md), [DESIGN](../DESIGN.md), [Managed IM Supervisor · WeChat alpha.2 prep](./2026-05-29-managed-im-supervisor-wechat.md)

## Context

Galley already exposes WeChat as a managed Channel for bundled GA users. Feishu
is different from WeChat: there is no QR-login happy path. Users must create a
Feishu internal app, add bot capability, enable message permissions, configure
long-connection events, and publish the app. Copying the official GA tutorial
verbatim into Galley would make the product feel like a README wrapper.

首版目标用户定为个人用户和小团队企业接入。默认访问策略是允许安装应用所在组织内所有飞书用户访问；首版不做 open_id allowlist、首次绑定或绑定码。

## Decisions

- Settings -> Channels 增加飞书卡片，与微信并列；仍只在 managed runtime 下显示。
- 飞书配置走 Galley UI：App ID 存 prefs，App Secret 存 Galley 本机 encrypted secret store，不写 managed GA 代码目录，也不读取外部 GA `mykey.py`。
- Rust Core 继续统一管理 Channel 进程、autostart、restart、model-config staleness 和状态事件；`feishu` 加入 IM Supervisor platform 集合。
- Python launcher 复用官方 `frontends/fsapp.py`，但由 Galley 注入 managed model loader、managed prompt、state/temp paths 和 Feishu app config。
- Managed GA patch stack 增加一个小 patch，让 `fsapp.py` 支持 `GALLEY_FEISHU_CONFIG_JSON` 和 `GALLEY_FEISHU_TEMP_DIR`。
- bundled Python 增加 `lark-oapi`，并把 `frontends.fsapp` / `lark_oapi` 纳入 import smoke gate。
- TopBar 继续只显示一个 Channels 总体状态；多渠道不会变成多个顶部状态点。

## Follow-up Review Fixes

- 飞书状态事件改为由真实 websocket 连接驱动：首次连接成功才进入 `running`；重连周期优先使用 `lark-oapi` 1.6.8 的 `on_reconnecting` / `on_reconnected` hooks。
- dev 环境可能使用旧版系统 `lark_oapi`，缺少公开重连 hooks 时 fallback 到 `_reconnect` 私有 seam；启动前做 contract check，避免升级 SDK 后静默退回错误状态。
- 启动阶段连续失败会进入 `error`，避免错凭据时长期卡在重连中；已成功运行后的断线仍持续自动重连。
- Managed 飞书进程的 workspace、user data 和 temp dir 固定在 Galley-owned state dir，不写入 bundled GA code payload。
- `GALLEY_FEISHU_CONFIG_JSON` 一旦存在就视为 managed config 边界；解析失败时硬失败，不 fallback 到 `mykey.py`。
- App Secret 静态存储仍在 Galley encrypted secret store；运行时继续通过本地 managed 子进程环境变量注入。这是本机同用户边界内的首版权衡，后续如要收紧再设计 pipe/socket 等传递机制。

## Rejected

- **Galley 自动创建飞书应用**：需要企业账号权限和开放平台写操作，产品复杂度和失败面都高于收益。
- **照搬官方教程到文档**：能工作但不低门槛；Galley 应承担保存凭证、启动进程、显示状态和下一步引导。
- **首版 allowlist / 首次绑定**：更适合正式企业大规模使用；当前目标是个人和小团队组织内可用。
