# Stage 2 桌面端骨架完成

> Date: 2026-05-08（一天第三个 entry，stage 切换总结）
> Status: shipped — Stage 2 全部 11 个子任务（#1-#10b）落地
> Related: PRD §13-§16 · [docs/DESIGN.md](../DESIGN.md) v0.2 · `desktop/` 全栈代码 · 上一篇 [2026-05-08 design trio finale](./2026-05-08-design-trio-finale.md)

## Context

PRD / DESIGN.md / IPC 协议三个文档前置条件就绪后，Stage 2 桌面端从 0 到能端到端 demo 一气呵成做完。Tauri v2 + React 19 + Tailwind v4 + Zustand + SQLite + Python bridge subprocess 端到端串通。一天 11 个 commit（#1-#7 + #8 / #9 / #10a / #10b），覆盖 scaffold、组件库、状态管理、持久化、IPC 集成。

落地的范围远超 PRD §16 写的"技术栈"段，实际工程决策很多是边做边对齐的。这篇是 stage 切换总结，记关键决策 + 反向 patches + open questions 留给后续 polish session。

## Decisions

### 工程基础

- **React 19 + Vite 7 + Tailwind v4 + TypeScript 5.8 strict**：跟 Tauri 模板默认对齐，PRD §16 同步从 R18 升 R19
- **Tailwind v4 CSS-first `@theme`** + token 命名 ink/line 命名空间：避开 Tailwind 内置 `text-text-primary` / `border-border-default` 双重命名丑陋
- **Self-hosted 字体（`@fontsource/*`）**：Newsreader / Inter / JetBrains Mono npm 包打进 bundle，无运行时网络依赖
- **Phosphor thin icons**：全局唯一 icon set，跟 DESIGN.md §2.3 严格一致
- **macOS-first**：bundle 只打 .app + .dmg；`titleBarStyle: "Overlay"` 自定义 chrome + traffic light at {16, 16}
- **pnpm 单包**：bridge / desktop / docs 在同 repo 但 desktop 独立 package.json；命令必须 cd 进去跑（用户接受）

### 设计层与实现层互校

实现 Sidebar / TopBar / Conversation / 等组件时，发现 DESIGN.md 字面跟 prototype 实现不一致几处 —— 选 DESIGN.md（macOS 桌面应用习惯一致）：

- TopBar 全宽（DESIGN.md §4.1）vs prototype 仅 main 区上方 — 选全宽
- 加 `--brand-strong` (#C68762) + `--border-subtle` (rgba 0.06) — prototype 用了但 DESIGN.md 没列，patch 进 §2.1 token 表
- waiting_approval / failed callout 加 4% tint 背景（prototype 决定，DESIGN.md "不用 background tint" 破例）
- thinking summary 加杏沙左竖条 + 6% tint 背景（prototype 决定，超出 DESIGN.md "💭 + Newsreader italic muted")

### 组件归属：自研 vs 第三方

V0.1 实际比例约 **70% 自研 / 30% Radix-based**：

- shadcn ecosystem 故意没 init（避免 init 修改 globals.css 跟自定义 token 冲突）
- cmdk 直用而非 shadcn/command（shadcn/command 实质就是 cmdk + Tailwind classes）
- @radix-ui/react-dialog 直用（Settings modal）
- 自研所有视觉 specific 组件：Sidebar / Composer / Tool callout / Approval Form / Health Check / Error Card / Onboarding wizard

### file_patch diff 视图：@pierre/diffs reversal

DESIGN.md / PRD 反复提到 `@pierre/diffs` 作为 V0.1 file_patch split diff 实现。Stage 2 #6 做时验证发现：

- API 没问题（`PatchDiff` 接 unified diff 字符串就能跑）
- **但 Shiki backend 拉所有语言包进 bundle，build 输出暴涨 +414 KB gzipped**（emacs-lisp / wolfram / cpp 等也被打进去）
- 自研 PatchView（`diff` 包 line-level changes + Tailwind 自渲染 split layout）~200 行，**+17 KB cost** vs 414 KB
- 决策：V0.1 自研，`@pierre/diffs` 留 V0.2 候选（如果真需要 hover/highlight + 能 scope 到具体语言）
- DESIGN.md §4.6 / PRD §11.4 / §17.4 同步更新这个 reversal 决策

### 状态管理：Zustand 单 store

- `stores/useAppStore.ts` 一个 store + actions，不分 slice 文件（V0.1 surface 小，slice pattern 是 ceremony）
- bridge subprocess 引用（不可序列化）放 module-level `let _bridgeClient`，store 状态保持 serializable
- conversation source-of-truth 优先级：**store 优先 + demo fallback**（保留 pre-bridge dev visibility 不破坏 demo flow）
- 用户 submit 时 bridge 未连接故意 skip appendUserTurn（否则 turn precedence 翻转，用户看到自己 message 但没 demo agent reply）

### SQLite 持久化

- `tauri-plugin-sql` Rust 端管 migrations，前端 `@tauri-apps/plugin-sql` 客户端
- Schema：projects / sessions / messages / tool_events / approval_rules / prefs，全 PRD §8 表 + 5 个常用 index
- **所有时间戳 TEXT ISO 8601**：跟 IPC wire format 同 shape，sortable lexicographically，无 timezone 边界
- DB 双写**best-effort**：SQLite 不可用 silent fail（Vite-only dev / 首次 launch / migration mid-run），保留 demo fixture 为 fallback

### Bridge spawn + IPC

- 前端 `@tauri-apps/plugin-shell` 直 spawn Python subprocess（而非 Rust 端 SessionManager）—— V0.1 简单粗暴够用
- `lib/bridge.ts` 包装 Command + JSON Lines 解析 + 双向 IO + graceful shutdown（3s timeout fallback to kill）
- `lib/ipc-handlers.ts` 单 dispatcher 路由 12 个 IPC events 到 store actions
- 5 个 events 真接 store（ready / llm_changed / error / turn_end / tool_call_pending），其他 7 个 console.debug
- `cleanFinalAnswer` mirror bridge 的 `_clean_response_for_display`：strip `<thinking>` / `<summary>` / `<tool_use>` / `<file_content>` 标签 + `[FILE:...]` refs

### Onboarding step 0-2 真完整

- 4 步 wizard takeover（Welcome / Attach / Health / Done）—— DESIGN.md §5 严格落地
- Step 1 path 实时 validation 当前是 mock（包含 "GenericAgent" → ok / "incomplete" → missing-agentmain warning / 其他 → not-found）
- Step 2 health check 5 项 sequential 动画（每项 ~570ms），全过才能继续
- "全过才能进入"决定保留（不允许 read-only 模式，DESIGN.md §5 故意决策）

### DEV affordances（production 自动消失）

- 右上角 DEV toolbar：screen toggle (intro/empty/main) + "+ toast" 循环 4 个 hint variants + bridge "spawn/kill" + 状态 indicator
- 全部由 `import.meta.env.DEV` 守护，production build 自动消失

## Rejected alternatives

整个 stage 中考虑过但被否的方案：

- **Mock data 作为基础设施**：JC 反驳"什么 mock data？不需要 mock data 吧？"—— 改为组件接 props，dev demo 数据集中在 `stores/demo.ts` 作为 store initial seed
- **React 18 stuck**：Tauri 模板默认 R19，跟着升避免降级踩坑
- **shadcn 提前 init**：init 会改 globals.css 跟 token 冲突；改为按需 import + cmdk / Radix Dialog 直用
- **shadcn/command**：实质就是 cmdk + Tailwind classes，indirection 无收益
- **`@pierre/diffs` 用于 file_patch diff**：bundle 暴涨 414 KB 不可接受，改自研 200 行
- **Rust SessionManager backend** for IPC：plugin-shell 前端方案够用且简单
- **Settings 真独立 macOS 窗口**：需要 Tauri WebviewWindow API + 第二 React entry，V0.1 用 Radix Dialog modal 占位（同 720x560 frame，graduate 时 React API 不变）
- **Multi-session 同时实现**：先单 session 跑通，多 session 状态分布留 polish session
- **真 dry-run LLM** in onboarding step 2：保留跳过决策（不烧 quota），首次 message 失败由 hint 系统翻译错误
- **buildDemoTurns 派生 turns 永久作为 source-of-truth**：#8 后转向 store-first
- **slice pattern**（multiple store files）：V0.1 surface 小，单 store 简洁
- **Onboarding step 1 真 path validation**：mock 用于 #5 demo，真 Tauri command 留 polish session
- **App.tsx state by useState**：#8 全部提到 store，#10 IPC events 直接 dispatch 到 store actions（不再 useState 闭包）
- **conversation 完全切到 store-driven**：保留 demo fallback 让 pre-bridge dev visibility 不破坏

## Open questions

留给后续 polish / V0.1 release 前必须解决：

### Multi-session（V0.1 PRD goal）

- store BridgeClient ref 改成 `Map<sessionId, BridgeClient>`
- bridgeStatus 改成 `Record<sessionId, BridgeStatus>`
- spawnBridge / sendIPCCommand 接 sessionId 参数
- conversation state 也按 sessionId 索引（`turnsBySession: Record<sessionId, Turn[]>`）
- Sidebar session row 切换驱动 active session 切换 + UI 重新渲染对应 conversation

### Session 恢复

- bridge spawn 后立即发 `load_history` command 注入 SQLite 中加载的 messages
- bridge 接到后 inject `client.backend.history`，agent_runner_loop 接续
- desktop 端：session row 点击 → spawn bridge with sessionId + load_history → bridge ready 后 user 可继续聊

### Onboarding step 1 真 validation

- Rust 端 Tauri command `validate_ga_path(path)` → `{ exists, has_agentmain, has_mykey, llm_count }`
- step 1 input 调用此命令替换 mock validation
- step 2 真 health check：spawn bridge 验 ready event 收到（需考虑 quota 问题，PRD 已决定不真 dry-run）

### Settings → Runtime → path picker

- folder picker 走 `@tauri-apps/plugin-dialog`
- 路径写入 prefs 表
- 改 GA path 后弹 confirm dialog "重启 Workbench"，重启时 spawnBridge 用新 args

### tool_events 表写入

- Inspector Approvals tab 当前显示 demo records；真 records 来自 SQLite tool_events 表
- 每个 tool_call_pending / tool_call_end → INSERT/UPDATE tool_events 行
- approval_decision 字段记录 user choice + auto_allowed

### IPC errors 真 hint 字典扩展

- bridge 端 `_classify_error` 当前 13 个 keyword
- V0.1 用户内测时收集真 LLM error formats（OpenAI / Anthropic / GLM 各家不同）扩词典
- bridge 已 emit `hint`，desktop ErrorCard 已渲染 hint variant

### 工程 polish

- macOS app icon（当前 Tauri 模板默认）
- code-signing / notarization（distribute 前置）
- DB migration 策略（schema 演进 + 已有 user data 处理）
- 多 session 启动后 quota / API rate limit 的 desktop 端兜底

## Next

**先 push 一波**（4 个 pending commits + 这篇 devlog）：

```
a827bee Stage 2 #8: Zustand store
25e702a Stage 2 #9: SQLite + tauri-plugin-sql
e25a5a7 Stage 2 #10a: Bridge spawn + IPC wiring
8e11342 Stage 2 #10b: real conversation state + DB double-write
+ docs commit
```

**新 session 议题**（按 V0.1 release 优先级排序）：

1. 端到端真跑 `pnpm tauri dev` + spawn bridge → user message → turn_end 全链路验证（视觉 + 行为）
2. Multi-session 状态分布（PRD §6.1 七件事中的"多 session 并行"必做）
3. Session 恢复（PRD §6.1 "历史会话查看 + 继续聊"）
4. Onboarding step 1 真 validation（用户首次启动就需要）
5. Settings → Runtime path picker（Onboarding 完成后改路径的入口）
6. tool_events 表写入（Inspector Approvals 真 history）
7. macOS app icon / 签名 / dmg 打包（V0.1 distribute）

Stage 3 V0.1 七件事在 #1-#10b 之上是"接通 + polish"工作，工程难度递减。
