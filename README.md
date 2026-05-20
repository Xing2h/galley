# Galley

> **基于 [GenericAgent](https://github.com/lsdefine/GenericAgent) 的 开源本地 Agent 工作台：桌上跑着一支 Agent 队伍。出门后，手机里的 Supervisor Agent 替你接管。**

> 本地 agent team 编排器，dual-native by design。<br/>
> 派任务、看进度、远程托管 —— **human 和 agent 都是一等公民**。

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

Galley 是一个**本地 agent team orchestrator** —— 同一台 Mac/PC 上跑多个 AI agent session，每个 session 是一个 GenericAgent 子进程。Galley GUI 给坐在电脑前的你，Galley CLI 给另一个 **Supervisor Agent** 来远程托管。出门后通过手机 IM 给 supervisor 发指令，让它替你监管 agent team。

Galley **不动**用户已有的 [GenericAgent](https://github.com/lsdefine/GenericAgent) —— 随时可以删 Galley，GA 独立运行不受影响。


## Why "Galley"?

船上的 galley 是厨房，也是工作台 —— 做饭的厨子、来打饭的水手、来交班的舵手、午夜来沏咖啡的船长，每个人来这里都有自己的事，**但桌子是同一张**。

我们认为本地 AI workbench 也是这样的桌子：人类用户在 GUI 推进工作，supervisor agent 通过 CLI 控制和管理 agent team，两边共享同一份 session、同一份历史、同一份决策日志 —— 不是各开各的 tab，是真共用一张桌子。

名字的前两个字母是对 [GenericAgent](https://github.com/lsdefine/GenericAgent) 的致意 —— 我们从那里出发。

## 功能亮点

- ⚙️ **Dual-native: GUI + CLI 对等前端** —— `galley` 命令是公开契约 ([schema v1 frozen](./docs/agent-api.md))，supervisor agent 能做的 GUI 都能做，反过来也成立
- 🪟 **多 session 并行** —— 每个 session 都是独立 GenericAgent 子进程，子进程 alive 的数量上限由你的机器内存决定，per-session 可选用不同的 LLM 
- 👤 **Origin tracking + supervisor 活动 timeline** —— supervisor 派给 session 的消息带 `(who, when, why)` 标注，GUI 显示「@ga-claude-1 · reason · 2 min ago」，TopBar pill 汇总 supervisor 活动
- 🔧 **结构化工具时间线** —— 工具调用、参数、结果、时延都在对话流内联展示
- 🛡️ **审批系统 + YOLO 模式** —— 高风险动作（file_patch / code_run...）可拦审批，或者干脆全程信任 agent
- 🤖 **per-session LLM 切换** —— 对话中途换模型，不丢上下文
- 💾 **会话持久化 + 全文搜索** —— 关掉 Galley 几天后回来续聊；SQLite FTS5 trigram 跨对话搜索
- 📁 **项目分组** —— 按项目组织 session
- 🍱 **Background mode** —— 关窗不退出，留在 macOS menubar 持续接 supervisor 命令

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
                ┌──────────┴──────────┐
                ▼                     ▼
        ┌─────────────┐       ┌─────────────┐
        │  Runner #1  │  ···  │  Runner #N  │   每 session 一个
        │  (Python)   │       │  (Python)   │   GenericAgent 子进程
        └─────────────┘       └─────────────┘   bundled CPython 3.11
```

(1) GUI 跟 CLI 是**对等前端**，不是 GUI 包 CLI；
(2) **Rust core 是权威层**，session 状态、SQLite 写、runner 生命周期都归它管；
(3) **localhost-only**，没有 TCP 端口、没有 token、没有 TLS——远程访问让 supervisor agent 走它自己的传输层（GA 的 IM frontend / SSH / 其他）。

**技术栈：** Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4 / Rust (Galley Core + Galley CLI) / Python (runner，包装 GenericAgent) / SQLite + FTS5 trigram

## Quick Start

### 1 · 装 GenericAgent

Galley 目前只支持 attach 模式，需要用户先安装和配置好 [GenericAgent](https://github.com/lsdefine/GenericAgent)。按 [GA 的安装说明](https://datawhalechina.github.io/hello-generic-agent/part1/chapter1/) 走，**最少**需要：

- GA 仓库 clone 到任意路径（如 `~/Documents/GenericAgent/`，启动 Galley 后选择 GA 所在路径）
- `mykey.py` 至少配置一个 LLM provider（Galley dogfood 主要使用 Claude Opus 4.6 / Sonnet 4.6，GPT 5.5 和 GLM 5.1）

### 2 · 装 Galley

**macOS** —— 从 [Releases](https://github.com/wangjc683/galley/releases) 下 `Galley_aarch64.dmg`（Apple Silicon）或 `Galley_x64.dmg`（Intel）。打开 .dmg 拖 **Galley.app** 到应用程序。Galley 暂未购买 Apple 签名证书，**首次开启请在 Terminal 跑**：

```bash
xattr -d com.apple.quarantine /Applications/Galley.app
```

然后双击 Galley.app 启动。

**Windows** —— 下 `Galley_Windows_x64-setup.exe` 跑安装程序。SmartScreen 提示发布者未知时 → 「更多信息」→「仍要运行」。

### 3 · 首次启动

GUI 自动跑 Onboarding wizard：

- 探测 GA 路径 + LLM provider 配置
- 一切就绪后进入主对话界面

## Supervisor 集成

Galley 的 GUI 跟 CLI 是**对等前端**——CLI 能做的，GUI 也能做；反过来也成立。CLI 是给另一个 agent 远程托管你 session team 的入口。

### 一键安装

GUI 启动后进 **Settings → Integration tab**，三个按钮：

| 按钮 | 做什么 |
|---|---|
| **Install galley to PATH** | 把 `galley` 命令装到 `/usr/local/bin/`（macOS sudo，Windows 用户级 PATH）—— supervisor 直接调用 |
| **Install Supervisor SOP** | 把 [`galley-supervisor-sop.md`](./docs/integrations/galley-supervisor-sop.md) 装到你 GA 的 `memory/` —— GA bot 自动学会编排 Galley |
| **Install Claude Skill** | symlink [`.claude/skills/galley-supervisor`](./.claude/skills/galley-supervisor) 到 `~/.claude/skills/` —— Claude Code 自动识别「帮我看看 Galley」「galley 跑啥」trigger 词 |

### Supervisor 视角

装完后远程 agent 可以这样派任务：

```bash
# 看现在跑啥
galley session list --output=json | jq '.[] | {id, title, status}'

# 开个新 session 让 GA 跟进 PR
galley session new --project=work --llm="Claude Sonnet 4.6" \
  --supervisor=ga-claude-1 --reason="跟进 PR review" \
  "看下 #1234 的反馈"

# 长连接看一个 session 的事件流
galley session watch <id>

# 切 LLM / 归档 / 重启
galley session set-llm <id> --llm="GLM 5.1"
galley session archive <id> --supervisor=ga-claude-1 --reason="done"
```

每个命令都自动携带 origin 三元组 (`via=supervisor`, `supervisor=ga-claude-1`, `reason=...`)，GUI 端时间线上会标注「@ga-claude-1 · 跟进 PR review · 2 分钟前」让 human 一眼看到 supervisor 做过什么。

完整命令清单 + JSON schema + exit code 见 [`docs/agent-api.md`](./docs/agent-api.md) (schema v1 frozen)。

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

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) —— Galley 建立在其之上的 agent framework。

### 核心特性

| 特性 | 说明 |
| :--- | :--- |
| **自我进化** | 每次任务自动沉淀可复用 SOP / Skill，能力随使用累积 |
| **轻量架构** | ~3K 行核心代码，Agent Loop 约百行，无复杂依赖 |
| **真实环境工具** | 注入真实浏览器（保留登录态），9 个原子工具直接操作系统 |
| **多模型支持** | 支持 Claude / Gemini / Kimi / MiniMax 等主流模型，跨平台运行 |
| **Token 高效** | 上下文窗口约 30K（多数同类 Agent 用 200K–1M），通过上下文密度优化降低噪声 |

相关论文：[GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)
