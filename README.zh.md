# Galley

> **本地 agent team 编排器，人和 agent 都是一等公民。**

> *Galley started as a workbench for [GenericAgent](https://github.com/lsdefine/GenericAgent). The first two letters of our name are a quiet bow to where we came from.*

[English README](./README.md)

<p align="center">
  <img src="docs/screenshots/screenshot_05.png" alt="Galley 主对话界面" width="800" />
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/github/v/release/wangjc683/galley?include_prereleases" alt="Latest Release" /></a>
  <a href="https://github.com/wangjc683/galley/releases"><img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue" alt="Platform" /></a>
  <a href="https://github.com/wangjc683/galley/stargazers"><img src="https://img.shields.io/github/stars/wangjc683/galley?style=social" alt="Stars" /></a>
</p>

## Galley 是什么

Galley 是一个桌面应用，让你并行跑多个 AI agent session——v0.5 之后，还能让一个 **Supervisor Agent** 远程指挥整个 agent team。

**今天（v0.1 / v0.2）**：Galley 是 [GenericAgent](https://github.com/lsdefine/GenericAgent) 的本地桌面工作台。多个 agent session 并排跑，工具调用走结构化时间线展示，高风险动作可以等审批（也可以开 YOLO mode 一路放行），历史会话随时回来续聊。

**v0.5 之后**：Galley 变成 **dual-native** ——Rust 写的 `Galley Core` 同时支撑现有 GUI 和新的 `Galley CLI`。CLI 让外部 **Supervisor Agent** 来编排整个 session team：同一台机器上另一个 GenericAgent 进程（接入飞书 / 微信等 IM frontend），收到你在手机上的指令后调用本地 `galley` 命令；回到电脑前，所有 session 在 GUI 里一目了然。

Galley 是 **local-first** 的。你的数据不离开你的机器。**远程访问**由 Supervisor 在外部传输层（IM / SSH / 其他）负责，不是 Galley 的责任。随时可以删 Galley——GenericAgent 独立运行不受影响。

## 功能

### 今日（v0.1 / v0.2）

- 🪟 **多 session 并行** —— 每个 session 独立 GenericAgent 子进程
- 🔧 **结构化工具时间线** —— 工具调用、参数、结果、时延都在对话流内联展示
- 🛡️ **审批系统 + YOLO 模式** —— 高风险动作（file_patch / code_run...）可拦审批，或者干脆全程信任 agent
- 💾 **会话持久化 + 恢复** —— 关掉 Galley，几天后回来继续聊
- 📁 **项目分组 + 全文搜索** —— 按项目组织 session；SQLite FTS5 trigram 跨对话搜索
- 🤖 **per-session LLM 切换** —— 对话中途换模型，不丢上下文

### 即将（v0.5）

- 🚧 **Galley CLI** —— `galley sessions list / send / new / watch / ...` 给 Supervisor Agent 用
- 🚧 **Background mode** —— 关窗不退出，留在 menubar
- 🚧 **Agent-API 公开契约** —— 版本化 JSON schema，让 agent 集成长期稳定
- 🚧 **Galley Supervisor SOP**（给 GenericAgent）+ **galley-supervisor skill**（给 Claude）

完整 v0.5 计划见 [PRD](./docs/PRD.md) 和 [refactor playbook](./docs/refactor/)。

## 截图

| | |
|---|---|
| ![](docs/screenshots/screenshot_01.png) | ![](docs/screenshots/screenshot_02.png) |
| ![](docs/screenshots/screenshot_03.png) | ![](docs/screenshots/screenshot_04.png) |

## 架构

```
              ┌─────────────────┐  ┌─────────────────────────┐
              │  Galley GUI     │  │  Galley CLI 🚧 v0.5     │
              │  (Tauri+React)  │  │  (Rust)                 │
              └────────┬────────┘  └────────┬────────────────┘
                       └────────┬───────────┘
                          localhost only
                       (Unix socket / named pipe)
                                ↓
                       ┌────────────────────────┐
                       │  Galley Core 🚧 v0.5   │
                       │  (Rust)                │
                       │  • Session 生命周期    │
                       │  • SQLite 写            │
                       │  • Runner 管理         │
                       │  • Event 广播          │
                       └────────┬───────────────┘
                                ↓
                       ┌────────────────────────┐
                       │  Runner (Python)       │
                       │  每 session 一个        │
                       │  GenericAgent 子进程    │
                       └────────────────────────┘
```

**v0.1 / v0.2 今天 ship 的是**：只有 GUI 那一格真实存在，业务逻辑目前在 TypeScript 层。**v0.5 引入 Rust 写的 Galley Core**，进而暴露 CLI。具体执行计划见 [refactor playbook](./docs/refactor/)。

**技术栈：**

- **前端** —— Tauri v2 + React 19 + TypeScript 5.8 + Tailwind v4
- **后端** —— Rust (Galley Core，v0.5 实现中) + Python (runner，包装 GenericAgent)
- **本地数据库** —— SQLite (FTS5 trigram 搜索)
- **IPC** —— 当前 stdio JSON Lines；v0.5 起 CLI 走 Unix socket / named pipe
- **平台** —— macOS + Windows（Linux 候选 · v0.5 之后）

## 安装

### 前置条件

Galley 需要 [GenericAgent](https://github.com/lsdefine/GenericAgent) 先装好。按 [GA 的安装说明](https://github.com/lsdefine/GenericAgent) 走。最少需要：

- GenericAgent 仓库 clone 到 `~/Documents/GenericAgent/`（或任意路径，Galley 首次启动让你选）
- Python 3.10+ 装好 GA 的依赖
- `mykey.py` 配置好至少一个 LLM provider（Galley dogfood 主要用 Claude 和 GLM 4）

Galley 首次启动会跑健康检查，缺什么会明确告诉你。

### macOS

1. 从 [Releases](https://github.com/wangjc683/galley/releases) 下载 `Galley-v0.x.x-aarch64.dmg`（Apple Silicon）或 `Galley-v0.x.x-x86_64.dmg`（Intel）
2. 打开 .dmg，把 **Galley.app** 拖到 **应用程序** 文件夹
3. Galley 暂时没有 Apple code signing 证书（小项目还没买）。首次打开请在 Terminal 跑：
   ```bash
   xattr -d com.apple.quarantine /Applications/Galley.app
   ```
   然后双击 Galley.app 启动。*（替代方案：右键应用 → 打开 → 再点打开。最近 macOS 版本上 `xattr` 命令更稳。）*

### Windows

1. 从 [Releases](https://github.com/wangjc683/galley/releases) 下载 `Galley-v0.x.x-x64-setup.exe`
2. 跑安装程序。Windows SmartScreen 会提示发布者未知（Galley 没买 EV 签名证书）：
   - 点 **"更多信息"** → **"仍要运行"**
3. 从开始菜单启动 Galley

## 贡献 / 从源码构建

```bash
git clone https://github.com/wangjc683/galley
cd galley

# Python bridge（测试）
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"
.venv/bin/python -m pytest          # unit tests
GA_PATH=/path/to/GenericAgent BRIDGE_PYTHON=/path/to/python .venv/bin/python -m pytest -m e2e

# 桌面应用（开发 / 构建）
cd desktop
pnpm install
pnpm tauri dev                       # macOS 桌面开发模式
pnpm tauri build                     # 出 .app / .dmg / .exe
```

CI release 流程见 [docs/release-workflow.md](./docs/release-workflow.md)；手动 Windows build 见 [docs/windows-build-checklist.md](./docs/windows-build-checklist.md)。

## 致谢

[**lsdefine/GenericAgent**](https://github.com/lsdefine/GenericAgent) —— Galley 建立在其之上的 agent framework —— 是一个自演化的 LLM agent，围绕单一原则设计：**上下文信息密度最大化（contextual information density maximization）**。它不追求 raw context 长度，而是通过四个互锁机制——最小原子工具集、默认只暴露浅层 high-level 视图的分层按需记忆、把过往轨迹蒸馏成可复用 SOP 和可执行代码的自演化层、以及在长执行中维持密度的 context 截断/压缩层——让 active context 保持小巧且决策相关。推理、工具调度、记忆固化、SOP 系统全部来自 GA。Galley 提供桌面工作台和（v0.5 起）让外部 agent 编排的 CLI，但严格 non-invasive：删掉 Galley，GA 独立运行不受影响。

论文：[GenericAgent: A Token-Efficient Self-Evolving LLM Agent via Contextual Information Density Maximization (arXiv:2604.17091)](https://arxiv.org/abs/2604.17091)

## License

[MIT](./LICENSE)
