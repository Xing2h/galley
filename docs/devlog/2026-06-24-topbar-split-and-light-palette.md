# TopBar 拆双栏 header + 浅色调色板收敛 + 对话框配色统一

- **Date**: 2026-06-24
- **Status**: completed
- **Related**: `gui/src/styles/globals.css`（调色板）· `gui/src/components/layout/AppShell.tsx` / `MainHeader.tsx` / `sidebar/SidebarHeader.tsx`（双栏 header）· `docs/DESIGN.md` §2 / §4.1（调色板与列头 spec）· `gui/src/components/screens/earlier/EarlierDialog.tsx` / `archived/ArchivedDialog.tsx`（对话框配色）· commit `9ba30afc` / `b32f3c98`

## Context

一次 session 做了三件视觉层的事，彼此独立但同属「主工作台第一眼」的范畴：

1. session title 在 header 里从「居中」改「左对齐」，暴露了「一条全宽 top bar」与「下方两栏」的结构错配——短标题落在 Sidebar 上方、长标题横跨分割线。
2. 顺带把浅色中性轴收敛到一个稳定值，此前一直在几个偏暖/偏冷的中性之间摇摆。
3. 两个列表浏览对话框（Earlier / Archived）的配色和 Settings 不统一，读起来像两套系统。

## Decisions

### 一、全宽 TopBar 拆为每栏各自的 header（`SidebarHeader` + `MainHeader`）

- `AppShell` 移除 full-width `topBar` slot；两栏各自在 panel 内部长出 44px header，底边对齐成顶部一条连续 chrome，被全高 `ResizeSeparator` 分隔。
- **根因**：session title 语义属于「当前对话」（Main 栏）。全宽 bar 里左对齐会落到 Sidebar 上方；按 sidebar 宽度在 bar 内切两段又要追可拖拽 + 持久化的宽度（脆弱）。让每栏各管自己的 header，宽度天然继承、分割线天然全高。
- 两栏两色：Sidebar `bg-chrome`（暗）/ Main `bg-app`（亮），靠明度分层而非色相。
- OS 窗口控制各归本栏：macOS traffic light 浮于窗口左上 = SidebarHeader 左上，左 padding 让出 ~78px（红绿灯簇右缘 ~68px + ~10px 间隙，不退回 flush 70px）；Windows window controls 贴 MainHeader 最右端。
- 两个 header 都带 `data-tauri-drag-region`，共同作为窗口拖动 handle；非 mac 双击 header 空白切最大化。
- `TopBar.tsx` 更名 `MainHeader.tsx`；历史名（prose / 注释里的 `TopBar`、`copy.topbar` 命名空间、`TopBarStatusCluster` helper）**刻意保留**以限制 churn，DESIGN.md 带命名注记解释。

### 二、浅色中性轴收敛到 true-neutral + whisper-warm

- 落地值：`--color-app #faf9f8` / `--color-surface #fcfbfa` / `--color-elevated #ffffff`。
- **演进经过**（同 session 内迭代）：warm-yellow（hue ~45°，「cream」，读太黄）→ warm-neutral（hue ~30°，仍读黄）→ cool-neutral（hue ~215°，读冷/灰）→ true-neutral（纯灰，读「差一点，缺点暖」）→ **true-neutral + whisper-warm**（R 比 B 高 ~2 counts，sat ~0.5%，hue 不可解析——不足以读成色相，刚好够去掉纯灰的冷边）。
- 暖度的来源从「底色带黄」转到「暖墨水 + 杏沙 brand 压在近中性纸上」：inks 保持 warm axis（`#211f1c` 等），底色不再承担暖度。
- 新增 `--color-chrome #f4f3f1`：比 app 暗一档、同一 hue 轴，专给 sidebar/topbar chrome（DESIGN.md「明度即抬升」规则此处倒置用于 chrome）。明确标注「不要复用给 cards/insets」。
- DESIGN.md §2 surface 层 + globals.css token 注释同步更新，把演进经过写进 token 注释作 decision provenance。

### 三、Earlier / Archived 对话框配色统一到 Settings

- 两个列表浏览对话框通体从 `bg-elevated` 改 `bg-app`，搜索输入框从「下沉的 `bg-app`」改「抬起的 `bg-surface` + `border-line`」，与 Settings 的 model-filter 输入框一致。
- 理由：三个对话框（Settings / Earlier / Archived）同属「用户进入工作的工作台」语义，要读成一个配色家族，而不是 Settings 一个系统、列表对话框另一个系统。
- **边界**：内嵌的 alert-grade 确认小弹窗（per-row delete / bulk delete / empty-all）保留 `bg-elevated`——它们是确认而非工作台面，要与其余 app 的确认弹窗对齐。
- DESIGN.md §「Elevation 不倒置」的例外条款更新：把 Earlier/Archived 折进 Settings 那条工作台 modal 例外，记录 surface-vs-confirm 边界；删掉原「2026-06 据此把 Archived/Earlier 收归 bg-elevated」一句（该决策被本次反转）。
- 讨论过但未采纳的反方向：把主体刷成深色、搜索栏刷浅色——违反 §「Elevation 不倒置」（dialog 主体 elevation 不得低于自身 chrome），且搜索框在浮层里应「沉」不应「浮」。

## Rejected alternatives

- **全宽 bar 内按 sidebar 宽度切两段**：否。要追可拖拽 + 持久化的 sidebar 宽度，脆弱；长标题仍横跨分割线。
- **主体深、搜索栏浅的对话框配色翻盘**：否（见上）。
- **只把对话框搜索框边框收成 `border-line-subtle`（凹槽感）**：首轮方案，落地后觉得与 Settings 仍不统一，进一步改成整体 `bg-app` + 抬起输入框。
- **command palette 跟着一起翻成 `bg-app`**：否。palette 是轻量快速调用、不是「进入工作」，保留 `bg-elevated` 维持一点层级区分；本次改动只覆盖 Settings / Earlier / Archived 三个工作台面。
- **把 `--color-chrome` 复用给对话框 inset 控件**：否。token 注释明确 chrome 专指 navigation chrome，不复用给 cards/insets。

## Open questions

- command palette 是否长期保持 `bg-elevated` 作为唯一 elevated 搜索面——等下次配色 audit 时复核。
- README 截图仍是 v0.2.12 界面；本次布局 + 调色板变化是否值得重拍截图待 JC 定（上一轮 README devlog 已 defer）。
- 真机视觉验收（尤其 Windows 窗口控件贴 MainHeader 右上、macOS 红绿灯让位）留 v0.2.13 smoke。

## Next

进 v0.2.13 release pre-flight：version bump → tag → push → CI draft → smoke handoff。
