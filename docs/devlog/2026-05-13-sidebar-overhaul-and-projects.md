# Sidebar IA 重塑 · FTS5 全文搜索 · Inspector 退役 · Projects V0.1 · GA baseline cf65515

> Date: 2026-05-13
> Status: code-complete · all phases passing typecheck + lint + 80 bridge unit tests
> Related: [PRD §7.3 Projects](../PRD.md) · [DESIGN.md §4.2 Sidebar](../DESIGN.md) · [CLAUDE.md GA Baseline](../../CLAUDE.md) · 2026-05-09 [Project 模型](./2026-05-09-project-model-coding-agent.md)

## Context

V0.1 七件事 + Stage 3 dogfood polish 两轮完成后，本 session 是更深一层的 polish + 一个真正的新 feature：**Projects V0.1**。讨论触发点是 JC 一句"侧边栏的 Search 按钮按了没反应"——从这个表面小 bug 起手，往下挖出了 sidebar 在 scale 下的整体 IA 设计、Inspector 的存在必要性、Projects 该不该 V0.1 上、GA 升级到 upstream/main 等等一连串大问题。

Session 主线：

1. **Sidebar IA 在 sessions scale 下的处理**（Earlier 折叠 + EarlierDialog + 月分组 + FTS5 全文搜索）
2. **Inspector 整面退役**（第一性原理：每个 tab 都重复了其它地方的信息）
3. **AppShell overflow 修复**（Composer 被滚动推上去的 bug）
4. **MessageActions icon-only + Radix Tooltip**（hover 即时反馈）
5. **Multi-select bulk operations**（EarlierDialog / ArchivedDialog）
6. **GA Baseline 升级**（6a3eecc → cf65515，92 commits，0 breaking change）
7. **Projects 功能 V0.1**（5 个 phase，从数据层到 CWD 绑定，含 ProjectsDialog / 右键 Delete / 项目文件夹可见性）

## Decisions

### 1. Sidebar = "current work surface"（不是 archive browser）

**触发**："sidebar 越来越长 / earlier 桶无界" 这个 dogfood 隐患被 JC 提出来讨论。

**对齐结论：**
- 走 **Claude pattern**（bounded Recents + dedicated archive view），不走 ChatGPT pattern（无界 timeline + sidebar 内搜索）
- Earlier 桶**折叠成一行入口**：`Earlier (N) →` 点开打开 EarlierDialog
- EarlierDialog 内：按月分组（"April 2026"）+ 搜索框 + 多选批量 archive/pin
- 把 sidebar 高度封顶在 pinned + today + week + 1 行 earlier 入口

**关键的反向论证**：ChatGPT 后来给 sidebar 加搜索 modal 正是"完整时间线模型在 scale 下漏水"的证据。

### 2. SQLite FTS5 turn-body 全文搜索

**问题**：sidebar 把"找老 session"职责让给 CommandPalette / 搜索后，palette 只能搜 title + summary，不能搜对话内容——做完 1 之后这件事就必须做。

**对齐结论：**
- **trigram tokenizer**（SQLite 3.34+）—— 中英文混搜不用 segmenter
- **standalone FTS5 table**（`messages_fts`）+ 应用层维护（DELETE-then-INSERT pattern）
- 索引 user.content + assistant.final_answer（不索引 raw content 避免 `<thinking>` 块污染）
- 双路径：query ≥ 3 char 走 FTS5 MATCH + `snippet()` 高亮，2 char 走 LIKE fallback，<2 char 跳过
- CommandPalette 加 "在对话内容中" 分区，cmdk forceMount + 自定义 value 绕过其内置 fuzzy filter
- `backfillFtsIfEmpty()` 一次性回填升级用户

**Migration 004 写入**：`tokenize = 'trigram case_sensitive 0'`，零 breaking change。

### 3. Inspector 整面退役（IA 大决策）

**用第一性原理审视：** 右侧 Inspector 三个 tab 都在重复其它地方的信息：
- Details → ToolCallout 内联已经显示
- Approvals → ApprovalDock + 对话流 callout 已有
- Runtime → Settings → Runtime 完全重复

**判决：整面拿掉。** 回收 14–30% 横向空间给 Conversation，product 视觉从 "IDE-like" 偏回 "Notion + Claude" 气质。

**Memory Inspector**（V0.2 PRD 提过）：将来真做时**不复用这个 slot**，应该重新设计。

**唯一独特价值**——Approval 历史——一度迁到 Settings → Approval。然后 JC 提出"Recent decisions · 本次 session · 0"指向不明确：Settings 是全局配置场所，session 级数据放进去是抽象层错位。最终**整段删除**。SQLite tool_events 仍持续写入，将来要做 Activity Log 时数据是现成的。

### 4. AppShell overflow-hidden fix

**Dogfood 报告**："滚 conversation 到底后还能继续滚，输入框被推上去露白底。"

**第一次诊断错了**：归因到 `min-h-[720px]` 导致页面级溢出。JC 试了不同窗口高度都复现，否决。

**第二次诊断对了**：react-resizable-panels 的 Panel 默认不锁子元素 overflow，`<main>` 内部高度计算的任何漂移都会让整个 main 列被滚动。

**修复**：四个 Panel 直接子（2 个 `<main>` + 2 个 `<aside>`）都加 `overflow-hidden`。

### 5. MessageActions：icon-only + Radix Tooltip

**渐进决策链：**

1. Copy / Save 按钮以"右对齐"被提出 → 我反对，认为根因是"text label 在 reading column 边缘干扰阅读流"
2. 改成 icon-only + 原生 `title` tooltip → JC 反馈 "hover 等很久才出现"
3. 原生 title 是 spec-level 500-700ms 延迟，无 CSS/JS 调整空间 → 上 `@radix-ui/react-tooltip`
4. 抽 `IconTooltip` 复用 helper + 全局 `Tooltip.Provider delayDuration={100} skipDelayDuration={200}`

**ChatGPT/Claude 都做了 icon-only**——他们试过文字标签也都拿掉了，业界共识。

### 6. Multi-select bulk operations

**触发**：mock 24 个 session 后，dogfood EarlierDialog 一条条右键 archive 太痛。

**模式选择**——A. 显式 "Select" 按钮（Gmail）vs B. 修饰键 implicit（macOS Finder）：

走 **A**。理由：(a) 可发现性高，(b) 进/出 mode 边界清晰，(c) 触控板拖拽不误触，(d) 真高频用户后续可叠加 ⌘/⇧+click（A ⊃ B）。

**Action bar 内容演化**：先做全套（Pin / Archive / 全选可见），dogfood 后 JC 反馈"bulk Pin 频率低"——单删 bulk Pin 留单条 Pin（右键），action bar 聚焦 Archive。

**文案微调**：JC 反馈"全选可见"啰嗦、"Select"在中文环境割裂。改 `Select`→`多选`、`全选可见`→`全选`（业界默认就是"眼前可见"含义）。

### 7. GA Baseline 6a3eecc → cf65515（92 commits）

**JC 问"能不能升"**——我做了逐项 surface 审计：

| 我们依赖的表面 | baseline 6a3eecc | upstream/main cf65515 | 状态 |
|---|---|---|---|
| `agent_loop.py`（BaseHandler 3 callback + dispatch 生成器） | 全文 | 全文 | **byte-identical** |
| `_turn_end_hooks` 字典 + `hook(locals())` | ga.py:547 | ga.py:572 | 同代码，行号位移 |
| `agentmain.GenericAgentHandler` import | unchanged | unchanged | ✓ |
| `llmclient.backend.history` 读写 | list | list | unchanged |
| `agent_runner_loop` 主链路 | unchanged | unchanged | ✓ |

**结论**：零 breaking change。GA 内部行为有改进（`_fold_earlier` working memory 折叠 / `_retry_or_exit` 空响应重试 / summary prompt 措辞）但属预期升级。

**附加产出**：Settings → Runtime 加 "GA Version" 卡片：当前 commit hash + commit date + 测试 baseline + ✓ 对齐徽章。`gaCommit`/`gaCommitDate` 字段加进 ReadyEvent IPC 协议。

**Tooltip 反思**：曾打算给"用户的实际 cwd"加显示，被 JC 指出 "Settings 是全局配置，不该装某个 project 的路径"——抽象层错位，撤回。

### 8. Projects 功能 V0.1（重磅）

**战略判断**（JC）："GA 用户群有相当多人想要 Projects；官方 Streamlit 给不了；飞书/微信/Telegram IM bot 因为单 chat 形态本质上也给不了。这是 GA Workbench 真正能拉差距的 surface。**V0.1 上，且要打磨到惊艳。**"

**心智边界**（PRD §7.3 + 2026-05-09 devlog）：Project = **纯归类抽屉**（A. 归类 + B. 可选 cwd），**完全不改变 GA 内核体验**。不做项目级 CLAUDE.md / system prompt / RAG / 默认 LLM。

**5 个 phase 拆解：**

1. **数据层**：Project 类型 + DB 表 + IPC 已就绪，加 `deleteProject` helper + store 5 个 action（create / update / delete / assign / setFilter）
2. **创建 + sidebar 渲染**：CreateProjectDialog（420px，name + 可选 picker）+ Sidebar PROJECTS section 上移到时间桶之上 + 0-project 引导 + CommandPalette `+ New Project`
3. **分配 + filter mode**：session 右键子菜单 `Move to project` + filter banner + `+ New Chat` 在 filter 模式 inherit projectId
4. **CWD 绑定**（"wow"）：store 在 `activateSession` 查 project.rootPath → spawnBridge cwd → bridge `os.chdir`。IPC 协议先行（`docs/ipc-protocol.md` 加 CLI args 表）
5. **编辑/删除 + 审批恢复**：EditProjectDialog + 单层 ConfirmDelete + project 右键菜单 + `ApprovalForm` "Always allow in {projectName}" 按钮条件渲染 + Settings → Approval per-project section 条件渲染

**Sidebar IA 决策（PROJECTS 放哪儿）：**

- **PROJECTS 位置**：QuickActions 之下、时间桶之上。理由：持续性 > 近期性；Pinned 桶就是"加 stickiness"的载体，Projects 是这个机制的更高抽象。
- **入口形态**：section header 右侧 inline `+`（Notion/Linear/Slack pattern）。**绝不**放进 Quick Actions —— "+ New Project" 是低频操作（5-15 次终生），不该跟 "+ New Chat"（每天 5-20 次）等权重。

**关于"是否双侧边栏"**（JC 提的另一种 IA）：

详细讨论后**拒绝**。理由：
- Slack/Discord 双栏成立是因为左栏装"不同身份/工作空间"，右栏装"频道"——本质不同对象
- 我们双栏的话两栏都是 "sessions 列表，过滤方式不同"——同类内容拆 panel = chrome 重复，不是 IA 深度
- Conversation 列横向空间刚回收（Inspector 拿掉），双栏会再吃掉 14–30%
- 双栏一旦 ship 改回去比改过去难

**关于 PROJECTS 多到爆的处理（scale）：**

- ≤ 8 全显示
- ≥ 9 显示 top 8 + "查看全部 (N) →" 链接 → 打开 ProjectsDialog（仿 EarlierDialog）
- ProjectsDialog 内：搜索 + 完整列表（含 rootPath + session 计数 + active dot）+ 右键 Pin/Edit/Delete + 内部 `+ New` 按钮
- 删除了之前的 inline expand（"+ N 个更多" / "收起"）—— 阈值之外 dialog 是更对的工具，避免两种交互模式并存

**Discoverability fix**（after JC dogfood）：用户创建 project 后不知道怎么在 project 里开 chat。修：
1. filter 模式下 Quick Actions `+ New Chat` label 自适应：`+ New chat in 📂 {ProjectName}`
2. filter + project 无 session 时，sidebar 空 hint 升级为可点击 CTA（dashed border + 实色 brand 按钮 `+ 在 {ProjectName} 里新建对话`）

**右键 Delete 加 destructive 样式**（after JC 问"删除还要进 Edit 太深"）：
- separator 隔开 + 红色 text-error + `data-[highlighted]:bg-error/10`
- 单层 ConfirmDeleteProjectDialog 还在（双层保护没拆）

**filter banner 显示 rootPath**（after JC 问"绑了哪个文件夹用户怎么验证"）：
- banner 改成两行：第一行 `📂 ProjectName ×`；第二行 mono `~/Documents/...`
- `shortenHomeDir()` helper 把 `/Users/X/...` / `/home/X/...` 折成 `~/...`
- 完整路径 hover title 浮出

## Rejected alternatives

**双侧边栏 IA for Projects** — 拒绝（见上）。
**Hover preview popover** — 给 sidebar project 加 hover 浮出该 project 最近 sessions。讨论后 V0.1 不做（dogfood 1-2 个月看真信号再考虑），暂时 filter 模式足够。
**Settings → Runtime 加 cwd 字段** — 一度打算加，JC 指出 "Settings 是全局，不该装某个 project 的状态"，抽象层错位，撤回 + 顺手清掉 `runtimeInfo.cwd` orphan（type + IPC handler write + demo fixture）。
**Recent decisions section in Settings** — Inspector 退役后审批历史本来要搬过来，做了一版后 JC 提出"本次 SESSION 在全局 Settings 里很奇怪"——撤回 + 整段删除。SQLite 数据照旧持久化。
**Inspector 整面（彻底）** — 已退役。Memory Inspector 将来要做也是新设计，不复用这个 slot。
**EarlierDialog bulk Pin** — 做了一版后 JC 反馈"在 archive 流里 pin 是极低频操作"，拿掉 bulk Pin，保留 right-click 单条 Pin。
**Onboarding 引导创建 first Project** — 拒绝（增加流程噪音）。靠 sidebar 0-project muted 引导自然发现。
**Filter 状态持久化** — 拒绝（fresh launch = 全局视图，少惊喜）。
**Per-project always-allow rules as Record<projectId, string[]>** — V0.1 保留 flat list 简化模型，dogfood 后再升级到 surgical 模式。
**Inline expand for ProjectsDialog** — 之前 sidebar Projects section 有 inline "+ N 个更多" expand。引入 ProjectsDialog 后删除，避免两种交互并存。
**ChatGPT-style 完整 timeline + 搜索 modal** —— 见上，被作为反例论证我们走 Claude pattern。
**纯 CSS tooltip / 不要 tooltip** — Radix Tooltip 是正解（portal + a11y + delay config），CSS 自定义太局限，无 tooltip 又损失可发现性。

## Open questions

**1. Projects scale 上限的真实需求**：dogfood 后看是否有用户撞到 30+ projects；如果有，ProjectsDialog 是否够用，还是需要加分组/标签？

**2. `alwaysAllowProject` 升级到 Record<projectId, string[]>**：什么时候做？等用户真的反馈"我想 project A 允许这工具但 project B 不允许"。

**3. TopBar 显示 project chip**：active session 在 project 里时 TopBar 是否要显示？目前 banner 在 sidebar 已经够看，TopBar 留待 V0.2 polish。

**4. CommandPalette "New Chat" 是否也要自适应**：目前 sidebar 的 "+ New Chat" 自适应，CommandPalette 那一条没改。低频，dogfood 看反馈。

**5. 拖拽分配 session 到 project**：V0.1 只右键，没拖拽。Cursor / Notion 等都做了拖拽，dogfood 看是否真需要。

**6. CommandPalette "Matches in conversations" 排序**：当前按 session lastActivityAt desc。FTS5 自带 rank 可能在某些场景更好。dogfood 看。

**7. Auto-allowed tools 持久化**：当前 SQLite tool_events 只写需要审批的 tool。auto_allowed 决策（rules 命中跳过 gate）完全没写入。要持久化的话，写入路径需要从 `tool_call_pending` 之外的事件再钩一次。V0.2 配合完整 tool timeline 一起做。

**8. ProjectsDialog 内部排序选项**：当前固定 pinned → recency。dogfood 看是否需要按名字 / cwd 排序选项。

## Next

V0.1 至此**功能完整**——七件事 + 多轮 polish + GA 升级 + Projects 都落齐。

实际 ship 前的剩余事项（不在本 session 范围）：
- JC 跑 `pnpm tauri build` 实测产物
- README.md 上线前统一打磨（JC 已 flag："门面，留到上线前调"）
- e2e smoke test 升 GA cf65515 验证（GA repo 已切到 main）

后续 dogfood 反馈再迭代。
