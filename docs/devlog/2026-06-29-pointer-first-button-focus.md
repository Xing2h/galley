# 2026-06-29 · Pointer-first button focus

> Status: implemented · Related: `docs/DESIGN.md §2`, `gui/src/styles/globals.css`

## Context

Dogfood saved-prompts 时发现桌面 WebView 会在 icon-only 按钮点击后留下蓝色
focus outline。用户会把它理解成“按钮被选中”，而不是键盘焦点；hover action 还
可能因为 focus / focus-within 留在屏幕上，造成 Composer 或列表操作被遮挡。

## Decisions

- Galley 的 button-like 鼠标控件采用 pointer-first：鼠标点击不应落焦点，也不
  显示浏览器默认蓝 outline。
- 共享 `Button` / `IconButton` 在 `mousedown` 阶段阻止 mouse focus，并在
  click 后主动 blur，覆盖大多数对话框、设置页、侧边栏按钮。
- 纯 hover action 不再用 focus / focus-within 作为显形条件；例如消息复制、
  code block 复制、右侧 question rail、历史 / 归档 row actions、模型列表
  hover actions。
- 文本输入、textarea、inline rename / edit、表单字段继续保留焦点反馈；这些
  focus 态表示“正在编辑”，不是按钮选中。

## Rejected

- 全局删除所有 focus 样式：会让输入框、inline edit、设置表单失去编辑状态反馈。
- 逐个按钮只加 `outline-none`：能消掉蓝圈，但不能解决 `focus-within` 导致的
  hover action 粘住。
- 保留 hover action 的 keyboard reveal：桌面主场景下收益低，且在 Galley 当前
  UI 里更容易被误读为选中 / 粘住。

## Next

- 后续新增 hover-only action 时默认不加入 Tab 顺序，不用 focus 显形。
- 若未来要系统性恢复键盘导航，应作为一条完整产品线设计，而不是零散地给 hover
  控件补 focus ring。
