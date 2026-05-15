# B3 · useAppStore 拆 slice + 改订阅 Rust event (stub)

```
Cursor:   (B3 未启动)
Status:   ⏳ Stub · 等 B2 完成 + B2 完成 devlog
Duration: 3-4 周（D31-D50+）
Predecessor: B2 完成 + acceptance 全过
Successor:   B4 (CLI feature-complete + background mode)
```

**这是 stub**。B2 完成后启动 B3 前一个 dedicated session 把本文件填充成详细 playbook。

**B3 是整个重构最 risky 的阶段**。原因：

- `gui/src/stores/useAppStore.ts` 2727 行，6 个月的 dogfood UX 教训都在里面
- 拆 slice + 改订阅 = 重新实现，80% 容易做对，20% 会以 regression 形式被 dogfood 发现
- 不是一次性切换，是 capability by capability 渐进迁移，期间 store 同时存在新老两套机制
- 每个 capability 迁完需要 dogfood 一天验证才能算"安全"

**B3 前的心理准备**：3-4 周可能拖到 5-6 周。预算保守。

## 这个 phase 在干啥

把 `gui/src/stores/useAppStore.ts` (单文件 2727 行) 拆成多个按 domain 组织的 slice：

```
gui/src/stores/
├── sessionsStore.ts      session list / current session / 状态
├── messagesStore.ts      messages / turns / streaming state
├── runtimeStore.ts       bridge / runner / LLM / health 等运行时态
├── uiStore.ts            modals / selected items / composer text 等纯展示态
└── shared/               共用 types / helpers
```

每个 slice 改为**订阅 Rust event** 而不是**自己 own 数据**。从 [invariants.md I6](./invariants.md)："前端永远 stateless presenter"——B3 完成时这条 invariant 才真正生效。

具体说就是：
- **authoritative state**（session list / messages / runtime status）由 Rust core 持有，gui store 订阅 Tauri event 更新本地缓存（cache，不是 source of truth）
- **display state**（modal open / composer text / selected session id）继续由 store 持有，因为不存在其它 transport 会修改它们

这一步做完，B4 加 CLI write 命令时 GUI 会自动响应（Rust 端 dispatch CLI 命令 → emit event → GUI store 自动 update），不需要额外 wiring。

## Prerequisites

- [ ] B2 全部 acceptance criteria 跑过 + devlog ship
- [ ] B2 完成后**至少 dogfood 一周**，确保 B2 引入的 runner ownership 切换没有 regression
- [ ] B1+B2 完成时累积的 dogfood scenario 列表（用作 B3 每次迁完后的 regression suite）

## Acceptance criteria

- [ ] **A1**: `useAppStore.ts` 拆成 4-5 个 slice 文件，每个 < 600 行
- [ ] **A2**: authoritative state（session / message / runtime）的写入路径 100% 走 Rust event → store cache 更新
- [ ] **A3**: display state 仍在 store 端管理，没有"假装通过 Rust 走一圈"的多余 indirection
- [ ] **A4**: 所有 SQLite 写入路径都在 Rust（gui 不再有 `persistSession` / `persistUserMessage` 等直接 SQL 写）
- [ ] **A5**: 所有 bridge / runner spawn 路径都在 Rust（gui 不再有 `spawnBridge` 业务逻辑，只有 invoke wrapper）
- [ ] **A6**: dogfood 跑遍 B1+B2 累积的 regression suite，零 regression
- [ ] **A7**: store 改造**不影响** v0.1 七件事 acceptance（multi-session / Tool Timeline / Approval / Session 历史 / Session 状态展示 / LLM 切换 / GA Attach）
- [ ] **A8**: dogfood 期间 useShallow 类性能问题不复发（参考 [2026-05-11 useShallow 踩坑 devlog](../devlog/2026-05-11-stage3-multi-session-and-perf.md)）
- [ ] **A9**: TypeScript / Rust 测试全过 + 性能基线不变差

## Milestone 大纲

- **M1: Slice 切分设计 + types 提取** (D31-D33)
  - 静态分析现有 useAppStore：每个 action / state 字段归到哪个 slice
  - 共享 types 提到 `shared/`
  - 写 ADR 风格的 slice 设计文档
  - **不**改任何代码，先纸面对齐
- **M2: uiStore 抽离** (D34-D35)
  - 先抽 display state（最安全，没有跨进程同步问题）
  - modals / composer / selected ids / 滚动锚点等
  - 验证：dogfood 一天，确认行为不变
- **M3: runtimeStore 抽离 + 订阅化** (D36-D40)
  - bridge / runner 状态、LLM list、health status 这类"运行时 read-only state"
  - 改订阅 Rust event（Rust 端是 ground truth）
  - useShallow / re-render 调优
- **M4: sessionsStore 抽离 + 订阅化** (D41-D44)
  - session list / current session / per-session metadata
  - **这一步动用户感知最强**：sidebar 渲染、unread 状态、status 切换全靠它
  - 每个 sub-feature 迁完都要 dogfood 一天
- **M5: messagesStore 抽离 + 订阅化** (D45-D49)
  - per-session messages / turns / streaming state
  - **最复杂**：要兼容 streaming token 高频 update、ask_user 阻塞、approval 暂停
  - 跟 follow-bottom / auto-scroll 互动多
- **M6: useAppStore 收尾** (D50)
  - 原文件清到 < 200 行（只剩 store composition）
  - 老 export 加 @deprecated 或直接删（B1/B2 残留的）
- **M7: B3 acceptance + 收尾** (D50+)
  - 跑 acceptance
  - 写 devlog
  - 写 B4 详细 playbook

## 已知风险

- **风险 1: useShallow 等 React 19 strict mode 反模式复发**
  - [2026-05-11 useShallow 踩坑 devlog](../devlog/2026-05-11-stage3-multi-session-and-perf.md) 已经踩过：strict mode 下 getSnapshot 死循环→app 空白。store-side enrichment 是当前修法。
  - B3 拆 slice 时**每个新 selector 都要走 store-side enrichment 模式**，不允许在 React 端做 derive
- **风险 2: 6 个月 dogfood UX 教训被忽视**
  - auto-scroll snap、unread 三态、/btw routing、乐观更新 reconciliation、N-active 边界——这些 invariant 散在 2727 行 store 里，拆分时容易漏
  - 缓解：每个迁移前 grep 现有 store 找跟该 capability 相关的所有逻辑，列出来作 acceptance check
- **风险 3: 多 session 并发更新**
  - B2 之后 runner subprocess 由 Rust own，event broadcast 到 store，多 session 同时 stream token 时 store update 频率高
  - 缓解：batch event in Rust 端（10ms window 攒一批 emit），减少 React re-render 触发
- **风险 4: dogfood 期间老 store 跟新 slice 并存导致状态分裂**
  - 迁移期间一段时间内同一个 capability 在两个 store 里都有 state，更新不同步会让 UI 错乱
  - 缓解：每次迁移有明确的 "switchover commit"，commit 前 dogfood、commit 后老 path 删除——不留长期双轨

## Open decisions（B3 启动前要拍）

- [O1] Store 库选型：继续用 Zustand 还是切到 Redux Toolkit / Jotai？Zustand 倾向保留（dogfood 稳定 + JC 熟悉 + 小 bundle），但 strict mode 兼容是真问题
- [O2] Event batch window 时长（10ms? 16ms? 50ms?）——streaming token rate 决定
- [O3] React 端是否需要重新设计 selector layer？现在很多组件 `useAppStore(s => s.x.y.z)` 深路径，slice 后 path 变了
- [O4] 老 store 最终清理时机：B3 内一次性删？还是 B4 完成后再清？保守倾向 B4 之后

## Running notes / gotchas

（B3 启动前空白）

---

## 给 B3 启动 session 的 todo（B2 完成后这个 session 要做的事）

把本文件升级成完整 playbook：

1. 先做 M1 静态分析：每个 useAppStore field / action 归属到哪个 slice，列出表
2. 把上面"Milestone 大纲"展开成具体 sub-tasks (~30-40 个)
3. 每个 sub-task 关联：要动哪个文件 / 写多少代码估算 / 跑哪些 dogfood scenario 验证
4. Open decisions 全部拍（除非真的依赖 B3 实施数据）
5. 把 B3 跑下来已知的风险 / gotcha 写到 "Running notes" 顶部
