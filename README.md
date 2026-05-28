# Galley

> **开箱即用的本地 Agent Team Orchestrator：Galley 自带 GenericAgent 内核、Python 和运行依赖。配置模型后，桌上跑着一支 agent team；出门后，Supervisor Agent 继续替你看进度、派任务。**

> 本地优先，GUI 和 CLI 双原生。<br/>
> Human 在桌面操作，Supervisor Agent 在同一台机器上通过 `galley` CLI 操作 —— **human 和 agent 都是一等公民**。

> *Galley started as a workbench for [GenericAgent](https://github.com/lsdefine/GenericAgent). The first two letters of our name are a quiet bow to where we came from.*

[English README](./README_en.md)

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/github/v/release/wangjc683/galley?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/wangjc683/galley/stargazers"><img src="https://img.shields.io/github/stars/wangjc683/galley?style=social" alt="Stars" /></a>
</p>

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Galley 主对话界面" width="800" />
</p>

## Galley 是什么

Galley 是一个**本地 agent team orchestrator**，在你的电脑上并行运行多个 AI agent session。

Galley 内置了 GenericAgent 内核、CPython 3.11 和所有运行依赖，并会准备浏览器控制插件目录。首次启动只需要配置好 LLM，即可使用。

Galley GUI 给坐在电脑前的你看进度、发指令、做审批；Galley CLI 给你的 **Supervisor Agent** 编排同一支 session team。你可以在手机 IM 软件或其他外部渠道里联系 Supervisor Agent，让它在这台电脑上继续调度 Galley 工作。

内置 GA 已带微信、飞书、QQ、Telegram、Discord 等 IM 前端能力；当前 Galley 版本先通过 SOP + CLI 接入，GUI 内一键配置入口后续再补。

已经有自己的 [GenericAgent](https://github.com/lsdefine/GenericAgent)？可以在 **Settings → Runtime** 接入外部 GA。这个兼容路径保持 non-invasive：Galley 不修改你的外部 GA 代码、venv、memory、SOP 或 `mykey.py`；删除 Galley 后，外部 GA 仍可独立运行。

## Why "Galley"?

船上的 galley 是厨房，也是工作台 —— 做饭的厨子、来打饭的水手、来交班的舵手、午夜来沏咖啡的船长，每个人来这里都有自己的事，**但桌子是同一张**。

我们认为本地 AI workbench 也是这样的桌子：人类用户在 GUI 推进工作，Supervisor Agent 通过 CLI 控制和管理 agent team，两边共享同一份 session、同一份历史、同一份决策日志 —— 不是各开各的 tab，是真共用一张桌子。

名字的前两个字母是对 [GenericAgent](https://github.com/lsdefine/GenericAgent) 的致意 —— 我们从那里出发。

## 功能亮点

- 📦 **开箱即用的内置 GA runtime** —— Galley 自带 GenericAgent 内核、bundled CPython 3.11 和运行依赖；新用户只需要配置好 LLM 即可上手
- 🪟 **多 session + 项目分组** —— 同一台机器上并行运行多个独立 agent session，按项目组织，方便 human 和 Supervisor Agent 一起管理
- ⚙️ **GUI + CLI 双原生** —— `galley` 命令是公开契约 ([schema v1 frozen](./docs/agent-api.md))；Supervisor Agent 可通过 CLI 编排同一支 session team
- 💬 **IM 接入能力** —— 内置 GA 已带微信、飞书、QQ、Telegram、Discord 等 IM 前端；当前版本先通过 SOP + CLI 使用，GUI 内一键配置入口后续再补
- 🔒 **Localhost-only + local-first** —— Galley Core 只监听 Unix socket / Windows named pipe，不开 TCP，不持有远程 token；远程传输交给 Supervisor Agent 自己的 IM / SSH / 其他通道
- 🔧 **工具时间线 + 审批** —— 工具调用、参数、结果、时延都在对话流内联展示；高风险动作可拦审批，可添加白名单，也可以 YOLO
- 🌐 **浏览器控制引导** —— Galley 准备 `tmwd_cdp_bridge` 插件目录并检测连接；连接 Chrome/Chromium 后，agent 可以操作你已登录的浏览器。发挥空间很大
- 💾 **持久化 + 搜索 + 后台常驻** —— 关掉 Galley 几天后回来续聊；SQLite FTS5 trigram 跨对话搜索；关窗后留在 macOS menubar / Windows system tray 继续工作

## 架构

```
┌──────────────┐                          ┌──────────────┐
│  Galley GUI  │ ───┐                ┌─── │  Galley CLI  │
│ (Tauri/React)│    │                │    │    (Rust)    │
└──────────────┘    │                │    └──────────────┘
                    ▼                ▼
              ┌──────────────────────────┐
              │      Galley Core         │      localhost only
              │         (Rust)           │ ◀──  unix socket / named pipe
              │  · session 生命周期      │      0600 · 无 token · 无 TLS
              │  · SQLite 写权威         │
              │  · runner 管理 + 事件广播│
              └────────────┬─────────────┘
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
          ┌─────────────┐     ┌─────────────┐
          │  Runner #1  │ ··· │  Runner #N  │   每 session 一个
          │  (Python)   │     │  (Python)   │
          └──────┬──────┘     └──────┬──────┘
                 │                   │
                 └─────────┬─────────┘
                           ▼
              ┌──────────────────────────┐
              │  Galley-managed GA       │
              │  · GenericAgent kernel   │
              │  · Galley prompt profile │
              │  · bundled CPython 3.11  │
              │  · bundled dependencies  │
              └──────────────────────────┘
```

(1) GUI 跟 CLI 是**对等前端**，不是 GUI 包 CLI；
(2) **Rust core 是权威层**，session 状态、SQLite 写、runner 生命周期都归它管；
(3) 默认路径是 **Galley-managed GA**：GenericAgent 是内置 agent 内核；

**技术栈：** Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4 / Rust (Galley Core + Galley CLI) / Python (runner，包装 GenericAgent) / SQLite + FTS5 trigram

更多文档入口：
[架构说明](./docs/architecture.md) ·
[贡献指南](./CONTRIBUTING.md) ·
[文档索引](./docs/README.md)

## Quick Start

你需要先准备好可用的 LLM 服务：API Key、Base URL 和模型名。

### 1 · 安装 Galley

**macOS** —— 从 [Releases](https://github.com/wangjc683/galley/releases) 下载文件名包含 `macOS_aarch64.dmg`（Apple Silicon）或 `macOS_x64.dmg`（Intel）的安装包。打开 .dmg，把 **Galley.app** 拖到应用程序。Galley 暂未购买 Apple 签名证书，首次开启如被系统拦截，可在 Terminal 跑：

```bash
xattr -d com.apple.quarantine /Applications/Galley.app
```

然后双击 Galley.app 启动。

**Windows** —— 下载文件名包含 `Windows_x64-setup.exe` 的安装包并运行。SmartScreen 提示发布者未知时，点「更多信息」→「仍要运行」。

### 2 · 配置模型

首次启动会进入模型配置：

- 选择模型服务 / 协议预设（OpenAI-compatible 或 Anthropic-compatible）
- 填入 API Key、Base URL 和模型名
- 点击「测试并开始使用 Galley」

### 3 · 可选：接入外部 GenericAgent

已经有自己的 GenericAgent 环境时，可以在 **Settings → Runtime → 接入外部 GA** 选择 GA 目录。这个模式适合熟悉 GA、需要继续使用自己 memory / SOP / skills 的用户。

## Supervisor 集成

Galley 的 GUI 跟 CLI 是**对等前端**——CLI 能做的，GUI 也能做；反过来也成立。CLI 是给 Supervisor Agent 在本机编排 session team 的入口。

### Agent 接入

GUI 启动后进 **Settings → Agent**：

| 按钮 | 做什么 |
|---|---|
| **复制 SOP** | 复制 [`galley-supervisor-sop.md`](./docs/integrations/galley-supervisor-sop.md)，发给你的 Agent，让它学会调度和编排 Galley |
| **查看 Agent API 文档** | 打开完整命令清单、JSON schema 和 exit code |

### Supervisor 视角

Galley 运行时，Supervisor Agent 可以在同一台机器上调用 `galley` 派任务：

```bash
# 看现在跑啥
galley status
galley sessions list

# 开个新 session 跟进 PR
galley session new --project=proj_work \
  --supervisor=ga-claude-1 --reason="跟进 PR review" \
  "看下 #1234 的反馈"

# 长连接看一个 session 的事件流
galley session watch <id>

# 切 LLM / 归档 / 重启
galley llm set <id> "另一个模型名"
galley session archive <id> --supervisor=ga-claude-1 --reason="done"
```

每个命令都自动携带 origin 三元组 (`via=supervisor`, `supervisor=ga-claude-1`, `reason=...`)，GUI 端时间线上会标注「@ga-claude-1 · 跟进 PR review · 2 分钟前」让 human 一眼看到 supervisor 做过什么。

用户无需学习任何 CLI 命令，直接用自然语言告诉 Supervisor Agent，让它安排 Galley 做什么即可。需要接入或写脚本时，完整命令清单 + JSON schema + exit code 见 [`docs/agent-api.md`](./docs/agent-api.md) (schema v1 frozen)。

## 截图

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

<sub>*v0.1.0 版本截图*</sub>

## 贡献 / 从源码构建

```bash
git clone https://github.com/wangjc683/galley
cd galley

# Python runner（测试）
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest          # unit tests
GA_PATH=/path/to/GenericAgent BRIDGE_PYTHON=/path/to/python .venv/bin/python -m pytest -m e2e

# 桌面应用（开发 / 构建）
cd gui
pnpm install
pnpm tauri dev                       # macOS / Windows 桌面开发模式
pnpm tauri build                     # 出 .app / .dmg / .exe

# Galley CLI（独立构建）
cd ../core
cargo build --release -p galley-cli  # 出 target/release/galley
```

CI release 流程见 [docs/release-workflow.md](./docs/release-workflow.md)；手动 Windows build 见 [docs/windows-build-checklist.md](./docs/windows-build-checklist.md)。

## 致谢

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) 是 Galley 当前的 agent 内核。Galley 的内置 runtime 基于 GenericAgent，并保留外部 GA attach 兼容路径；Galley 额外提供本地编排、GUI / CLI 对等前端、session 持久化、审批、搜索和打包后的开箱即用体验。

相关论文：[GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)
