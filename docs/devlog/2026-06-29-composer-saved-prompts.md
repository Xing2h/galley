# 2026-06-29 · Composer saved prompts

> Status: implemented · Related: `docs/DESIGN.md §4.4 Composer`

## Context

用户想在 Composer 附近加一个小入口：hover 后显示常用 prompt，点击预填到
Composer；点击入口进入 dialog 管理常用提示词，包括 Galley 预设和用户自定义。

这触碰了一个历史约束：Empty State 的 quick prompt 建议已经在 2026-06-03
删除，原因是它和题词、Composer 主角地位互相打架。因此这次不能把功能做成
空状态示例回归。

## Decisions

- 入口放在 Composer 右下角图片按钮旁边，和图片附件同属「往输入框添加内容」
  的工具；LLM picker 回到左下角，只显示模型名 + caret。
- “最常用”定义为用户手动置顶，不做使用次数或最近使用排序。
- 内置预设收敛为 8 个，按大众用户使用频率展示：信息查证、整理长文、翻译润色、
  审阅草稿、网页内容提取、整理表格、本地文件整理、执行前检查清单。默认置顶前三个。
- Quick-fill popover 最多显示 5 条置顶 prompt；点击只预填，不自动发送。
- Dialog 从左右分栏管理器改为卡片式提示词库：先显示最多 5 条置顶 prompt，
  再显示其他 prompt。整张卡片点击即预填 Composer；hover 暴露置顶、
  排序、编辑、复制、删除等管理动作。
- 提示词库从 `760x560` 放大到约 `920x680`。卡片保留摘要视图；完整正文进入
  同一 dialog 内的预览阅读页，避免用户必须先预填到 Composer 才能看全内容。
- 自定义 prompt 新增后插入自定义列表最前；未置顶自定义卡片提供上移 / 下移，
  让用户在置顶上限之外也能维护自己的常用顺序。置顶顺序仍由独立的置顶排序控制。
- Prompt Library 归入 Settings / Earlier / Archived 同族的工作台式 dialog：
  主画布用 `bg-app`，prompt 卡片和编辑字段用 `bg-surface`，不再整体使用
  小型确认弹窗式的 `bg-elevated`。
- Prompt 入口和卡片库采用 pointer-first 交互：focus 不再触发 hover popover
  或管理按钮，入口本身也不进入 Tab 顺序 / 不显示 focus ring，避免桌面
  WebView 焦点恢复导致菜单/选中态粘住。
- 管理能力仍只覆盖 v1 必需范围：预设置顶 / 排序 / 复制为自定义，自定义增删改、
  置顶、排序。
- 数据只存在 GUI prefs `saved_prompts_v1`。不改 Rust Core schema、CLI
  Agent API 或 session data。

## Rejected

- 把 prompt 入口塞进 LLM pill 的 Cube icon：同一控件承载两个不同动作，误触和
  可访问性都差。
- 做更完整的 Prompt Library：分类、搜索、变量、统计都会把高频便利变成新产品面。
- 做能力发现入口：更外显，但会违反 Empty State 的克制方向。

## Next

- Dogfood 组合胶囊在 compact / wide Composer 下的视觉重量。
- 观察用户是否需要搜索或更多 pinned 上限；没有信号前不扩。
