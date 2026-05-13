# Galley 重命名 + 多项 V0.1 功能马拉松

**Date**: 2026-05-13
**Status**: Shipped
**Related**:
- PRD §6 V0.1 七件事 → 实质已超额完成，加入了 ask_user UI、TopBar 紧凑/宽松宽度切换、Sidebar 真实 runtime 信号、Reinject Tools、Desktop Pet、手动 session rename
- CLAUDE.md 项目宪法第一条**重写**（"不读写" → "不修改 + 读取分级"）
- 项目品牌从 "GA Workbench" 改为 "**Galley**"

## Context

非常长的一次 work session（30+ 轮对话）。从 audit GA 官方新出的 `tuiapp_v2.py` 开始，到讨论 / 实施 / 拒绝多项功能并把品牌升级一并完成。这次的特点是 **决策密集**——每件事都先讨论后实施，避免一上来就 cargo cult 抄 GA 或追加 chrome。

## Decisions（按执行顺序）

### 1. `/btw` `/branch` `/rewind` 三件事写成 V0.2 提案

GA TUI v2 新出三个 power-user 命令，逐项 audit 后决定**全部进 V0.2 PRD 增量**而不是今天做：

- `/btw` 侧问：非打断主链的 sub-agent 单问回答（用 `backend.raw_ask` 复用 history snapshot）
- `/branch` 分支：deepcopy history 到新 session
- `/rewind` 悔棋：直接 mutate `backend.history[:cut]`

详见独立 devlog [`2026-05-13-v0.2-side-question-branch-rewind.md`](./2026-05-13-v0.2-side-question-branch-rewind.md)。

### 2. ask_user UI 实施（IPC 层早就有，desktop 层 V0.1 漏做）

发现 bridge 一直在 emit `ask_user` 事件但 ipc-handlers 只 `console.debug` —— **审批工具 UI 半成品**。

实施：
- 新组件 `AskUserBubble`：warning 黄色边条 + PauseCircle + 候选 chips（>40 字符自动 truncate + Tooltip 全文）
- 设计选项 inline 气泡 vs Modal vs Composer 占位符 → 选 inline 气泡（不打断 multi-session 监控 + 锚定视觉位置）
- 候选点击单步即发（vs 先高亮再确认）—— 直觉 + 一步交互
- 自由文本兜底永远开 —— Composer 始终可用，输入会走 `ask_user_response` IPC
- Sidebar **第四态**："⏸ 等你回复"（pendingAskUser 非空时），黄色 PauseCircle + 黄 dot + warning 字色，**覆盖 hasUnread 显示优先级**
- 不持久化 pendingAskUser —— 重启后黄点消失但 conversation 里问题文本仍在
- 抑制 ask_user tool callout 在 conversation 渲染层（live + replay 同一 chokepoint）

### 3. Composer 大段粘贴折叠

阈值 `> 10 行`——恰好对齐 `COMPOSER_MAX_HEIGHT_PX = 280` 的 textarea 视觉边界（10 行刚好撑满 max-height）。

- 折叠形态：`[Pasted text #N +M lines]` 占位符
- N 单调递增，每次 submit 后重置
- Map<number, string> 在 useRef 里
- 提交时 regex `/\[Pasted text #(\d+) \+\d+ lines\]/g` 展开占位符
- 用户改了占位符（人为打字 / 删字符）→ regex 不匹配 → 原样发送（尊重用户的手动改动）

### 4. 折叠完成 turn → **park**

讨论 GA TUI Ctrl+F 折叠模式。JC 反馈"我经常跑 10+ steps，但我喜欢看 sequential 展开"——auto-fold 中间步骤会**直接毁掉日常体验**。

判断：这是给"长 session 翻来翻去累"的人设计的功能，**JC 的实际使用模式不痛**，park 它。Per CLAUDE.md 克制原则：未来真有用户报需求再做。

### 5. Sidebar 内 "GA Workbench" 折叠按钮 → **删除整个功能**

发现 `SidebarSimple` 按钮是个 noop——comment 里都说"等以后做"。第一反应是接 wiring；按 70 LOC 做完后 JC 提"是不是 sidebar 不应该有折叠功能"，重新 first-principles 推理：

- Workbench 对话栏 max-w 760 / 1200——折叠 sidebar **不会让对话变宽**
- Sidebar 是 multi-session 这件事的物理化身——折叠它 = 折叠产品核心卖点
- 拖拽分割条已能在 14%-30% 间自由调节，连续可控

**整套折叠链路 revert**。同时删了 SidebarHeader 里的 `SidebarSimple` toggle 按钮——它不该存在。

### 6. Conversation 宽度切换：紧凑 / 宽松

TopBar 新 pill `[紧凑 / 宽松]`：
- 紧凑：760px（默认，typography 甜区）
- 宽松：1200px（讨论 Notion 1040 vs 1400 后取中——Workbench 内容比 Notion 杂，code block / tool callout 需要更多呼吸）

Pill 视觉：
- 紧凑（off）：透明 + 灰字 + 向外箭头
- 宽松（on）：apricot bg + brand 字 + 向内箭头，跟 YOLO indicator 同视觉族
- 添加文字标签解决"光看图标看不出功能 / 状态"问题

应用范围：conversation 滚动列 + 底部栈（Dock + Composer + hint）+ EmptyState Composer 一起跟随。**全部 1200**——之前犹豫"composer 独立保 760" 的方案被否决，主要因为 EmptyState 没有 dock 时 toggle 看不到效果（"假坏按钮"）。

持久化：prefs key `conversation_width`，hydrateFromDB 读回。

### 7. TopBar Search 按钮删除

Sidebar Quick Actions 已有 Search + ⌘K 全局快捷键，TopBar Search 是冗余 chrome。**直接删**——也清掉 `onOpenCommandPalette` prop（dead code）。

### 8. Sidebar header 整体重塑

**Galley header**：
- 单行布局：左 wordmark + 右 GA runtime status
- Wordmark `GALLEY`：Newsreader semibold uppercase + tracking-0.04em（"workbench 扎实感"）
- 该 wordmark 写法跟 Settings → About 同源；Onboarding 大字号 36px 保留 `Galley` sentence-case（大尺寸 uppercase 偏 marketing-banner 调性）
- **品牌使用规则**写进 CLAUDE.md：body text 用 sentence-case，小 wordmark display ≤20px 用 uppercase，大尺寸 hero ≥30px 用 sentence-case

**Runtime indicator 真信号化**：发现 `runtimeStatus` 默认 `"healthy"` 一直没接上——**装饰品**。重写为 2 态：
- `ready`：gaConfig.gaPath + python 都非空 → 绿点 "GA 就绪"
- `unconfigured`：任一为空 → 灰点 "GA 未配置"，**可点击进 Settings → Runtime**

Status 文案从开发者术语 "Runtime · healthy" 改成普通话 "GA 就绪 / GA 未配置"。

### 9. **品牌重命名 GA Workbench → Galley**

最深思熟虑的一次决策，跨多轮讨论：

1. JC 提"GA Workbench vs GA-Workbench 排版"
2. 我深挖发现真正问题：GA 跟 Google Analytics namespace 撞 + Workbench 太通用
3. 讨论"是不是该独立品牌"——JC 明确"想做 public release / 涨 stars"
4. 候选词头脑风暴：Atelier / Cove / Galaxy / Gather / Galley / Gaze / Garage
5. 选 Galley（印刷 galley proof + 船上工坊语义双关，"GA" 开头自带 GenericAgent 暗码）
6. 选 sentence-case `Galley`（不是 `GAlley` 强调）——避免 readability 摩擦
7. **Origin story 句**："Galley started as a workbench for GenericAgent. The first two letters of our name are a quiet bow to where we came from." —— 放进 README + Settings → About + CLAUDE.md

**Tauri identifier 改动事故**：
- 改 identifier `app.gaworkbench` → `app.galley` 时 macOS Application Support 目录跟着变
- JC 重启 app 后 "session 都不见了"——其实是新 identifier 指向了新（空）数据目录，旧数据还在 `app.gaworkbench/`
- JC 决定旧数据是测试不需要保留，直接 `rm -rf` 旧目录
- **教训写进 CLAUDE.md 新增 "Tauri Identifier 不可随意改" 段落**——未来 public release 后改 identifier 必须先实现 Rust 端自动数据迁移

涉及 14 个文件（README / CLAUDE.md / PRD.md / DESIGN.md / ipc-protocol.md / devlog index / Tauri config / package.json / index.html / SettingsAbout / StepWelcome / Sidebar / demo.ts / pyproject.toml / bridge 文档串）。

### 10. CLAUDE.md 项目宪法重写："不读写" → "不修改 + 读取分级"

audit Reinject Tools 时发现宪法字面表述：

> 不读写 GA 的 `mykey.py`、`memory/`、`assets/`

**但我们一直在读 mykey.py**——`agent.list_llms()` 返回的 LLM 配置就来自 mykey.py。宪法字面错了。

JC 一针见血："应该是不修改才对吧"。重新推 first principles：

- non-invasive 真正保护的是 **GA 独立运行 + GA 状态不被外部破坏**
- 读取永远不破坏这两点
- 直接读 GA 内部文件 vs 走 GA 公开 API 是**工程脆弱性差别**，不是 non-invasive 违反

新规则：
- **不修改**任何 GA 文件（mykey.py / memory/ / assets/ / 源代码）
- **读取分级**：优先走 GA public API，直接读文件**只读**前提下允许，但需标注 coupling 点 + GA baseline 升级时审计
- 读取后**不**回写

这开了 Reinject Tools 和 Desktop Pet 实现的门——它们都需要直接读 GA 内部资源。

### 11. Reinject Tools + Desktop Pet 实施

讨论 GA 官方前端 sidebar 4 个按钮的对照：
- LLM 切换：我们已有（更好——常驻 Composer Pill 而非 sidebar dropdown）
- Force Stop：我们已有（更好——条件态 Composer 替代键，运行时才出现）
- Reinject Tools：缺失 → 加
- Desktop Pet 🐱：缺失 → 加（弱化处理）

**Reinject Tools**：
- IPC 新增 `reinject_tools` command + `tools_reinjected` event
- Bridge 端：读 `<ga_path>/assets/tool_usable_history.json` + reset `last_tools` + extend history
- 复用 GA stapp.py 同款逻辑，coupling 点已注释

**Desktop Pet**：
- IPC 新增 `attach_pet { port }` + `detach_pet` 命令；`pet_attached` + `pet_detached` 事件
- Bridge 端：spawn `<ga_path>/frontends/desktop_pet_v2.pyw` 子进程，注册 `agent._turn_end_hooks[f"galley_pet_{sessionId}"]`，每个 turn_end POST 进展到本地 41983 端口
- **Sticky-B 行为**：pet 绑定到点击 attach 时的 active session，切换 session 不重新 attach（要换 session 必须先 detach 再 attach）
- 全局唯一（pet 绑定固定端口）
- Shutdown 时自动 silent detach 避免 orphan 子进程

### 12. TopBar `⋯` overflow menu

Reinject + Pet 不能各占独立 TopBar icon——chrome 太挤、单个低频功能不该常驻。**收纳到一个 `⋯` 菜单**：

- Phosphor `DotsThree` (bold 18px) 按钮
- Radix DropdownMenu z-[70]（高于 dev panel z-[60] 避免遮挡）
- 第一版位置错了：放在右 cluster 跟全局元素（YOLO / 紧凑 / Settings）混

**JC 反馈**：`⋯` 是 session 级动作，应该跟 session title 视觉绑定。修正：

- 移到**center title 旁边**（title + `⋯` 一起居中浮动作为单元）
- **无 active session 时整个 `⋯` 隐藏**（EmptyState 不显示——之前是显示但 click no-op，"假坏按钮"）
- 跟我们其它 affordance 模式一致：Composer Stop / ApprovalDock / AskUserBubble / Sidebar 未读点 / Sidebar 黄点——**affordance 只在能用时出现**

V0.2 时 `/branch` `/rewind` 等 session 操作可以加入同一菜单。

### 13. 手动 Session Rename

讨论 manual vs LLM auto-rename：

- **JC 倾向 LLM auto 是"理想"** —— 我反对：auto-trigger 有 cost surprise / 质量不可控 / 时机难拿 / 与 manual 状态机互斥逻辑复杂
- **三种路径**：A 手动重命名 / B LLM 自动 / C LLM 一键（user-triggered）
- 推荐 **A + C 双路径**——A 永远兜底，C 是 user agency 的 LLM 增援

**今天先做 A**：

- Sidebar 右键菜单首项「✏️ 重命名」
- 行进入编辑态：input 替换 title span，auto-focus + select-all，Enter 提交 / Esc 取消 / blur 提交
- stopPropagation 防止编辑中误激活 session
- visual：编辑态 ring-brand + bg-elevated，不显示 hover/active bg
- 自动派生逻辑**意外地**已经兼容：`appendUserTurn` 只在 title === `"新对话"`（默认）时自动派生，重命名后永远不再覆盖。**零额外 flag 需要**

**C 推迟**：JC 明确"先不上这个功能，下个 session 再看"。设计已捕获在独立 devlog [`2026-05-13-v0.2-ai-session-rename.md`](./2026-05-13-v0.2-ai-session-rename.md)。

### 14. 空闲自主行动（Idle Autonomy）

讨论 GA TUI 的"30 分钟无活动自动注入 [AUTO]🤖 prompt"机制对 Galley 的适配。

**关键决策**：
- Scope: 全局 toggle，自动跟随 active session（不要 per-session opt-in）
- UI 位置: Sidebar Quick Actions 下面（New Chat / 搜索 / 自主行动）
- 安全门: 必须开 YOLO mode 才允许（auto = 无人审批，必须显式接受）
- 预算: 单次触发硬限 N step (默认 30)
- 通知: macOS 系统通知 + sidebar unread + 🤖 自主 indicator
- **今天不实施**——设计先固化进 V0.2 devlog [`2026-05-13-v0.2-idle-autonomy.md`](./2026-05-13-v0.2-idle-autonomy.md)

## Rejected Alternatives（这次 session 里被 explicitly 否决的）

- **Sidebar 折叠 / collapse**：cargo cult。Sidebar 是 multi-session 的物理化身，折它毁产品核心卖点
- **折叠完成 turn (Ctrl+F)**：JC 喜欢 sequential 展开。GA TUI 这个特性给"长 session 翻累的人"，我们的实际使用模式不痛
- **Reinject Tools 走右键 session 菜单**：JC 反馈"用户痛感在 conversation 里，不在 sidebar 里"——改 TopBar
- **Reinject Tools 独立 TopBar IconButton**：低频专家操作不该常驻 chrome
- **Desktop Pet 独立 TopBar Cat icon**：同上 + JC 想要弱化——收进 `⋯`
- **AI rename auto-trigger（option B）**：cost surprise + 时机难拿 + 质量不可控 + 状态机复杂
- **Composer 加宽到 1400** + **Conversation 加宽到 1400**：太宽 prose 累读，折衷到 1200
- **TopBar Search 按钮**：跟 Sidebar Search + ⌘K 重复，删掉

## Open Questions

- **TopBar `⋯` 菜单的 V0.2 扩展**：`/branch` `/rewind` 实施时直接加进菜单，名字定为 "分支当前 session" / "回退 N 步"？还是用更技术化的 "/branch" / "/rewind" 暗示这是 power 命令？
- **Reinject Tools UI**：现在是无差别响应—— 即使 session 还没开始（空 history）点了也会跑。需要加个 "history 为空时按钮 disabled" 边界？或保持简单？
- **Desktop Pet 跨多 session**：当前是 Sticky-B（绑点击时的 active）。如果 user 切到别的 session 想看 pet，要先 detach 再 attach——两步。可以接受吗？还是值得做"切 session 自动跟随" 选项？

## Next

- 用户报回测试结果（特别是 reinject + pet 真跑通的体验）
- 下个 session 准备：用户已说明会开新 session 继续，并希望本次 session 的设计成果固化下来——已通过本 devlog + 两个 V0.2 devlog 完成
- V0.2 工作流明确：`/btw` `/branch` `/rewind` / AI rename C / 空闲自主行动——这些都已经有完整设计，下次按顺序实施
