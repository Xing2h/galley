# Conversation UX and Update Closeout

**Date**: 2026-05-22
**Status**: Implemented
**Related**: `63e4484`, `25cb4b8`, `df03650`, `9729498`, `12a3284`, `e20b2ba`, `b8b6533`, `a6c9aaf`

## Context

这次 session 从 ManView 对话区的等待感开始，逐步扩展到长任务多步骤呈现、
dense session navigation、自动更新的真实发布链路，以及最后一轮 Settings /
UI primitive 收口。

核心问题不是单个控件是否好看，而是 Galley 在长任务里如何让用户始终知道：

- agent 正在做事，不是卡住；
- 中途摘要有价值，但不应该和 final answer 抢权重；
- 一个很长的 session 仍然能快速回到某个 user prompt；
- 更新可以后台准备，但不能打断正在运行的任务；
- UI 控件应该逐渐有统一语法，而不是每个 screen 自己发明。

## Decisions

- Thinking marker 的秒数从 5 秒改成 3 秒后出现。立即显示读秒会太机械，
  但 5 秒空等又明显让人产生等待感；3 秒是更好的中点。
- 放弃粗光扫 / breathing 方案，改成整句
  `第 N 步 · 思考中... · Ns` 的逐字符 opacity typing indicator。读秒也参与同一
  节奏，避免 marker 变成两套视觉语言。
- typing indicator 的休止缩短、速度放慢。目标不是制造注意力特效，而是给用户
  一个温和的"仍在运行"生命体征。
- GA 中途输出的 thinking summary / narration 保留在主对话流，不折叠隐藏；
  但视觉权重低于 final answer。用户需要能看到 agent 的过程判断，但不能误以为
  它就是最终答复。
- 长单行 assistant answer 需要在对话宽度内折行。命令、路径、runner 调用这类
  内容很容易超过阅读栏，不能撑破 conversation column。
- user prompt dot rail 修复后进一步加 dense-session 处理：大量 prompt 时用聚合
  marker + hover 列表保持可导航，而不是把右侧 rail 变成一串不可辨认的点。
- dot rail hover popover 必须可点击，所以触发区和浮层之间要给用户可移动的时间
  与空间；说明性文案如 "N 条提问" 价值不高，移除后更安静。
- Auto update 的 release gate 明确拆成两步：release workflow 只产出 draft
  Release 和 `latest.json` candidate；真实用户 update channel 只在 publish +
  smoke 后通过 `promote-update-channel.yml` 手动推进。
- Update protection 放在 store action 层。只拦按钮不够，后台 auto check 也可能
  触发下载 / 安装；只要有 session 正在运行，就只记录 available，不下载、不安装、
  不 relaunch。
- Release / Update SOP 单独成文。自动升级牵涉 signing key、draft release、beta
  channel、rollback，不适合只散落在聊天或 workflow 注释里。
- UI primitive 开始收束：`Button` 扩展 variant，新增 `IconButton`、
  `DialogActionRow`、`Checkbox`、`Switch`、`SegmentedControl`，Settings 页面先
  迁移一批。目标是减少各页面各写一套按钮 / 开关 / checkbox 的 drift。
- Project icon emoji 退为 legacy metadata。当前 GUI 统一渲染 Phosphor folder
  icon，CLI / schema 保留字段只是为了兼容历史数据。
- Project filter 下的新对话继承当前 project context；用户在某个 project 里发起
  新任务，默认就应归入这个 drawer，不需要再手动移动。

## Rejected Alternatives

- **立即显示秒数**：过于机械，像计时器而不是工作状态。
- **粗光扫或明显 breathing**：视觉太抢，和 Galley 的安静工作台气质冲突。
- **把中途 summary 折叠进 step header**：省空间，但会让有价值的过程判断不可见。
- **保留原始 dense dot rail**：点太密时反而降低导航能力。
- **用户主动跳转下载页更新**：流程太重，不符合"后台检测 -> 准备好 -> 重启"目标体验。
- **不做 Tauri updater signing**：Tauri updater 的包验签是安全边界，不能因为 beta
  阶段就绕过。
- **release workflow 直接更新 live manifest**：draft / 未 smoke 的版本会被已安装
  app 看到，发布闸门失效。
- **继续让每个 Settings screen 手写控件样式**：短期快，长期会让 UI 语言继续分叉。

## Open Questions

- 更新可用时是否需要全局轻提示，而不是只在 Settings -> About / Runtime 显示。
- Windows NSIS 更新安装过程是否需要更具体的任务保护文案。
- Dot rail dense-session 聚合阈值是否要根据真实长 session 再调。
- UI primitive 迁移是否继续覆盖 CommandPalette / dialogs / project screens，还是只在触碰文件时顺手收束。
- Project context 新建对话的行为需要继续 dogfood：它应该感觉像"在这个 drawer 里开新任务"，而不是误以为 project 会改变 GA 的 cwd 或 memory。

## Next

- 用真实 older release build dogfood updater：检查 available -> prepared ->
  restart -> 新版本号完整路径。
- release day 按 [release / update SOP](../release-update-sop.md) 跑，而不是临场记命令。
- 后续 UI 改动优先复用已有 primitives；只有语义明显不匹配时再扩展 primitive API。
