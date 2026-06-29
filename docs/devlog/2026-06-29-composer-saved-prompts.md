# 2026-06-29 · Composer saved prompts

> Status: implemented · Related: `docs/DESIGN.md §4.4 Composer`

## Context

用户想在 Composer 附近加一个小入口，快速选用常用 prompt 预填到 Composer；
点击入口进入 dialog 管理常用提示词，包括 Galley 预设和用户自定义。

这触碰了一个历史约束：Empty State 的 quick prompt 建议已经在 2026-06-03
删除，原因是它和题词、Composer 主角地位互相打架。因此这次不能把功能做成
空状态示例回归。

## Decisions

- 入口放在 Composer 右下角图片按钮旁边，和图片附件同属「往输入框添加内容」
  的工具；LLM picker 回到左下角，只显示模型名 + caret。
- 内置预设收敛为 8 个，按大众用户使用频率展示：信息查证、整理长文、翻译润色、
  审阅草稿、网页内容提取、整理表格、本地文件整理、执行前检查清单。
- 入口最终收敛为 Dialog-only：点击书签直接打开提示词库，hover 只显示 tooltip。
  早期 quick-fill popover 被移除，因为它让主路径多一步，也持续带来 Composer
  工具区误触风险。
- 提示词库分两个 group：上方「预设」（常驻可折叠的模板库，固定顺序、只读），
  下方「自定义」（用户可上移 / 下移调序、增删改）。整张卡片点击即预填 Composer；
  hover 暴露查看 / 复制（预设）或查看 / 编辑 / 删除 / 排序（自定义）。
- 提示词库从 `760x560` 放大到约 `920x680`。卡片保留摘要视图；完整正文进入
  同一 dialog 内的预览阅读页，避免用户必须先预填到 Composer 才能看全内容。
- 复制预设为自定义、或新增自定义后，新项落在自定义列表最前并短暂高亮、自动
  滚到该卡片，让用户确认操作生效。
- Prompt Library 归入 Settings / Earlier / Archived 同族的工作台式 dialog：
  主画布用 `bg-app`，prompt 卡片和编辑字段用 `bg-surface`，不再整体使用
  小型确认弹窗式的 `bg-elevated`。
- Prompt 入口和卡片库采用 pointer-first 交互：focus 不触发 hover 管理按钮，
  入口本身也不进入 Tab 顺序 / 不显示 focus ring，避免桌面
  WebView 焦点恢复导致菜单/选中态粘住。
- 早期版本有过「置顶（pinned）」机制：pinned prompt 单独成区、最多 5 条、
  独立排序。发布前移除——dialog-only 后 pinned 已没有 manager 之外的出口，
  数量上限失去了展示位根据，且「置顶」与组内排序两个概念重叠。`pinnedIds`
  字段一并删除，prefs 升到 schemaVersion 2，旧数据落到空默认（0 用户、未发布，
  不做迁移）。
- 管理能力只覆盖首版必需范围：预设复制为自定义，自定义增删改 + 排序。
- 数据只存在 GUI prefs `saved_prompts_v1`（schemaVersion 2）。不改 Rust Core
  schema、CLI Agent API 或 session data。

## Rejected

- 把 prompt 入口塞进 LLM pill 的 Cube icon：同一控件承载两个不同动作，误触和
  可访问性都差。
- 做更完整的 Prompt Library：分类、搜索、变量、统计都会把高频便利变成新产品面。
- 做能力发现入口：更外显，但会违反 Empty State 的克制方向。

## Next

- Dogfood 组合胶囊在 compact / wide Composer 下的视觉重量。
- 观察用户是否需要搜索；没有信号前不扩。
