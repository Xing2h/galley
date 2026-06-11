# Settings 逐 tab 视觉一致性打磨

- **Date**: 2026-06-11
- **Status**: 代码完成 + 验证过（`pnpm --dir gui typecheck` + `lint` + `git diff --check` 全 clean），未 push
- **Related**: DESIGN.md §2.1 elevation / §2.5 触觉 / 配色与透明度 token 约定；
  `gui/src/components/screens/settings/` 下 Runtime / Approval / Agent(Integration) /
  Channels(IM) / BrowserControl / Shortcuts / About 各 tab 及 `runtime/` 子组件、
  新增 `runtime/RuntimeAccordionRow.tsx`、`gui/src/lib/i18n.tsx`

## Context

surface-by-surface 打磨推进到 Settings，按 tab 逐个 AUDIT → 讨论 → 实施。主线不是加功能，而是把 8 个 tab 收敛到同一套视觉语言：列表用统一的 hairline 容器、动效只给真正可交互的元素、brand 只留给 current/selected/default 与注意力态、elevation 守规则。Models tab 早先已单独做过 Direction A 重设计（已 commit），本轮覆盖其余 7 个 + 跨 tab 统一。

## Decisions

**确立 Settings 列表基准（hairline 容器）**

- 新增可复用 `RuntimeAccordionRow`（可展开行，caret 右）+ `RuntimeActionRow`（直接动作行，trailing 控件）。
- Runtime「更多」三个异形项（设置向导 / 接入外部 GA / 高级诊断）收进一个 `border + divide-y` 的 `bg-surface` 容器：设置向导降为不折叠的直接行（一个按钮不值得套折叠），外部 GA / 诊断卡拍平内层边框消除 box-in-box。
- Approval 的「必经审批工具」勾选列表 + project/global「放行规则」全部改成同款 hairline 容器；必经工具描述从 `ml-auto` 顶右改为紧跟工具名。
- Shortcuts 四组键位表各自容器化，键帽翻 `bg-app` 做「凹陷键帽」在 surface 容器上保对比。

**触觉诚实：动效只给真可点的元素**

- Channels(IM) 的 WeChat 卡片去掉整卡级 `hover:-translate-y` / `active:translate-y` / `shadow` 按钮动效——卡片本体不可点，只有 header toggle 可点，hover 反馈收到 toggle 上。
- Shortcuts 只读参考行去掉 `hover:bg-hover`（rebinding 是 V0.2，现在点了没反应）。

**brand 纪律**

- Channels 展开态不再整卡 `bg-selected/35` + caret/标题/图标全 `brand-strong`；展开只留中性 `border-line-strong` + `bg-hover`。brand 不为「展开」消费，注意力交给 StatusBadge + 自动展开 + primary 按钮。
- StatusBadge 的 running 绿 / error·expired 红**保留**——IM 连接有真实失败态，绿/红是「连接健康」红绿灯，是有信息量的健康信号，与 Runtime「正在使用」那种「模式选中→中性」语义不同（见 Rejected）。

**跨 tab 统一**

- 编号步骤统一成圆形 stepper（`rounded-full border bg-app font-mono tabular-nums`）：Channels 的 `ConnectionSteps` 对齐 Browser Control 的 `SetupStep`。

**Agent tab**

- 「复制 SOP」从 `secondary/sm` 提为 `primary/md`——它是这个 tab 的核心任务、视线落点（tab 内无竞争 primary）。
- 「试试这些 prompt」补静止态可发现性：左 hairline 常驻、复制图标常驻 40% 透明、hover 加 `bg-hover/50`，不再是「看不出可复制的几行文字」。
- 高级选项触发器从旧 `hover:underline` ghost-link 改成全宽切换行（标题左 + caret 右 + 顶部 hairline），呼应 accordion 行头。
- 发现文件 `dl` 左列 `150px → 88px`。
- `sopDescription` 文案：去掉「信任的本地」（Supervisor 可远程，「本地」反误导），保留「用 Galley 调度 sessions」的对象关系（中「复制给你的 Agent，让它学会用 Galley 调度 sessions。」/ 英「…so it learns to drive Galley sessions.」）。

**About tab**

- origin 故事卡 `bg-elevated → bg-surface`（画布上的卡应是凹陷卡，纯白浮层留给 dialog）+ `rounded-md → rounded-callout`。
- 版本块补对称 section 标题「版本 / Version」（新增 i18n key）：之前版本表无标题、其灰色 dt 标签与「LINKS」标签同权同列，被读成一串列表——根因是层级糊在一起而非纯间距。

**徽标 / 透明度收口（本轮早段）**

- BuiltinRuntimeCard「正在使用」徽标从 success 绿改中性（`bg-hover text-ink-muted`），与外部 GA 卡一致；GAVersionCard / SettingsUpdateControl / Approval YOLO 卡把裸 `/10` `/5` 对齐到 `--opacity-soft` / `--opacity-subtle` token。

## Rejected alternatives

- **把整个 Runtime「更多」藏到单一开关后面（方案二）**：默认最干净但把「接入外部 GA」这种偶尔要找的入口埋更深，展开瞬间信息量过大。
- **Approval 两个列表保持不同风格**：必经工具与放行规则语义不同，但视觉应成套；用「同款容器 + 不同语义（选择组 vs 记录组）」解决，而非两套列表语言。
- **把 IM StatusBadge 的 running 绿也改成中性**：连接健康有红绿灯价值，与 Runtime「正在使用」的纯模式选中不同，保留绿。
- **Shortcuts 保持留白裸行只去 hover（更轻备选）**：可行但少结构与跨 tab 一致性；选结构化容器。
- **About 链接列表也容器化**：它们是真外链、hover 诚实，是导航不是数据/设置项，保持轻量 hover 列表。
- **Agent 高级 caret 保持旧 ghost-link**：它是单区段开关不同于 Runtime 三并列折叠，但仍统一成全宽切换行以呼应 accordion。

## Open questions

- 侧栏底部主题 / 语言两个偏好菜单是本轮唯一没单独审过的 Settings 子面（非 tab），可选收尾。
- Channels 当前只有 WeChat 一张卡，多渠道时卡片列表节奏需再看。
- About VERSION ↔ LINKS 之间若仍想更分明，可单独加大间距或加一道极淡 hairline（已留给 dogfood 决定）。

## Next

- 本轮全部改动按一个 coherent commit 收口（Settings 视觉一致性打磨），未 push（按宪法默认）。
- 下个 session 可选：偏好菜单收尾，或换面继续 surface-by-surface。
