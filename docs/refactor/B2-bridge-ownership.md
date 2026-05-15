# B2 · Bridge ownership 迁 Rust (stub)

```
Cursor:   (B2 未启动，B1 完成时一个 dedicated session 填详细 sub-tasks)
Status:   ⏳ Stub · 等待 B1 完成 + B1 完成 devlog 写完后展开
Duration: 3 周（D16-D30）
Predecessor: B1 完成 + acceptance A1-A12 全过
Successor:   B3 (useAppStore 拆 slice)
```

**这是 stub**：只有 goal + acceptance + milestone 大纲，**不**填具体 sub-task。理由：B1 实施过程会改变很多 B2 设计假设（GalleyApi trait 长啥样、Tauri command 形态、Rust SQLite 异步模型……）。在 B1 完成前展开 B2 sub-task = 早期优化 = 浪费。

B1 完成时启动 B2 前一个 dedicated session 把本文件填充成跟 [B1-rust-core.md](./B1-rust-core.md) 同样详细程度。

## 这个 phase 在干啥

把 Python runner 子进程的 spawn / stdin / stdout / lifecycle 管理从 TypeScript (`gui/src/lib/bridge.ts`) 迁到 Rust (`core/src/runner_manager.rs`)。CLI 加第一个 write 命令 `send_message`，验证从 CLI → Rust → runner stdin 这条新路径打通。**GUI 也改用同一条新路径**（不再直接 spawn），但行为对用户完全不变。

依据 prototype 验证过的设计（`tokio::process::Child` + `tokio::sync::broadcast` 多 subscriber），把这个抽象提到 production。

## Prerequisites

- [ ] B1 全部 acceptance criteria 跑过 + devlog ship
- [ ] B1 完成时记录的性能基线（P1 first-token / P2 throughput）
- [ ] prototype 的 `BridgeRegistry` 设计已被 B1 实施验证过（trait + types 不会大改）
- [ ] dogfood 在 B1 后稳定一周以上（regression 浮现期）

## Acceptance criteria

- [ ] **A1**: `core/src/runner_manager.rs` 是 runner 子进程 ownership 的 single source of truth。`gui/src/lib/bridge.ts:spawnBridge` 不再直接 spawn——改为通过 Tauri invoke 委托给 Rust
- [ ] **A2**: 老 `gui/src/lib/bridge.ts` 的 `spawnBridge` 函数留着但内部完全是 invoke wrapper（业务逻辑全在 Rust）
- [ ] **A3**: CLI `galley session send <id> "<msg>"` 跑通——通过 Unix socket 调 Galley Core (Galley 必须开着 GUI 才能调；GUI 关了 CLI 报 exit 4)
- [ ] **A4**: Galley Core 启动时开 Unix socket listener（macOS / Linux：`/tmp/galley-<uid>.sock`；Windows: named pipe）
- [ ] **A5**: 多 subscriber 工作：runner 的 IPC event 同时进 React (Tauri event) + CLI watch 命令的 socket 流
- [ ] **A6**: runner subprocess lifecycle 正确——Galley 退出时所有 runner 子进程清理干净，没有孤儿
- [ ] **A7**: Schema migration（创建 socket / 加 supervisor / origin_note / created_via columns）已 ship，号段 010-019 范围
- [ ] **A8**: 性能基线（B1 测的）不变差（[invariants.md I7](./invariants.md)）
- [ ] **A9**: Galley GUI 行为对用户 0 regression：multi-session / streaming / ask_user / approval / /btw 全部跑通
- [ ] **A10**: `docs/agent-api.md` 已加 `session send` schema
- [ ] **A11**: Origin enum 真正生效——CLI 调用打入的 message 在 GUI 上显示"via CLI · supervisor: X · reason: Y"标记
- [ ] **A12**: Cargo + Python + TypeScript 三套测试全过

## Milestone 大纲（无 sub-tasks）

- **M1: Rust runner_manager 抽象** (D16-D18)
  - 把 prototype 的 `BridgeRegistry` 升级到 production：单 runner 生命周期管理 + 多 subscriber broadcast
  - 移植 stdin / stdout / stderr 处理
  - 加 PID tracking / kill-on-shutdown semantics
- **M2: Tauri command 包装 runner ops** (D19-D20)
  - `spawn_runner_cmd` / `send_to_runner_cmd` / `kill_runner_cmd`
  - React 侧 bridge.ts 改为 invoke wrappers
  - dogfood verify 行为不变
- **M3: Unix socket / named pipe listener** (D21-D23)
  - Galley Core 启动时开 socket + listener task
  - Protocol 设计：clap CLI 调用 → serialize 命令 + 参数 → socket → Rust dispatch
  - Auth = filesystem permission only ([CLAUDE.md Galley 架构原则 #1](../../CLAUDE.md))
  - Galley Core 不在跑时 CLI exit 4
- **M4: CLI write command `send_message`** (D24-D26)
  - 实现 `galley session send <id> "<msg>" [--supervisor=X] [--reason=Y]`
  - 实现 `galley session watch <id>` (从 socket 订阅 runner events 流)
  - Origin 标记入 DB (supervisor / origin_note / created_via 字段)
- **M5: Schema migration 010-014** (D27)
  - `messages.created_via`, `messages.supervisor`, `messages.origin_note`
  - `sessions.created_via`, `sessions.created_by_supervisor`, `sessions.created_origin_note`
- **M6: agent-api.md 增量** (D28)
  - `session send` schema
  - `session watch` NDJSON stream schema
- **M7: B2 acceptance + 收尾** (D29-D30)
  - 跑遍 A1-A12
  - 性能基线对比 B1
  - dogfood 跑 week 收 regression
  - 写 B2 完成 devlog
  - 写 B3 playbook（升级 stub 成完整）

## 已知风险 / 要在 B2 启动前确认的事

- runner subprocess 在 Rust 端的 lifetime 模型——`Child` handle 持有者死亡时如何确保 kill?
  - prototype `kill_on_drop(true)` 验证过，但 production 还要看长跑稳定性
- `tokio::sync::broadcast` 容量上限 (1024 events) 够吗？streaming verbose token 1000+ event 可能撑爆
  - prototype S3 已测过，需要数据落地到本文件
- Unix socket 路径冲突：多用户同机？多 Galley 实例？
  - 建议路径 `${TMPDIR}/galley-${UID}.sock`，user-scoped
- Windows named pipe API 差异：Linux/macOS 用 socket 接口，Windows 用 `\\.\pipe\galley-<user>`，Rust 端要抽象
  - `tokio` 的 `windows_named_pipe` 还是单独 crate？查
- ORIGIN 标记字段是否在 user-facing GUI 上展示？per-session supervisor 行动日志 v0.5 实现到什么程度？
  - PRD §6.1 #4 + §15 supervisor 行动日志已规划，B2 数据层落，B3 / B4 UI 落

## Open decisions（B2 启动前要拍）

- [O1] socket 路径在 macOS / Linux / Windows 上具体怎么选
- [O2] CLI watch 退出条件：session idle / archived / supervisor send SIGINT — 哪个先？
- [O3] `send_message` 异步语义：CLI 调用是 fire-and-forget 还是等 ack？fire-and-forget 上游 agent 体验差（不知道是否到了），等 ack 又 block 长。倾向 fire-and-forget + 输出 message_id，supervisor 可以 watch 验证
- [O4] runner 子进程实际由谁 own：Galley Core 进程 own 还是单独 daemon process？v0.5 暂走 Core own（[B4 background mode](./B4-cli-bg-artifact.md) 让 Core 自己常驻就够）

## Running notes / gotchas

（B2 启动前空白，启动后追加）

## Migration pattern（B1 M6 那个 template）

B2 沿用 B1 写好的 [migration pattern](./B1-rust-core.md#migration-pattern--给-b2b3-用的迁移模板)，但加 write path 维度：

- write 操作不能在 React 直接发，必须 invoke
- runner stdin 由 Rust 持有，TS 不能再 write
- ORIGIN 字段统一在 invoke 入口注入，TS 端不构造
