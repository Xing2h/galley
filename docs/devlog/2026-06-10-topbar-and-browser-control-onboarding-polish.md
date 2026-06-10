# TopBar polish + Browser Control onboarding 减负重构

- **Date**: 2026-06-10
- **Status**: 代码完成 + 验证过（typecheck + lint + git diff --check 全 clean），单 commit
- **Related**: DESIGN.md §1.1 渐进式披露 / §2.1 elevation / §2.5 触觉 / §2.7 A/B 动效；
  `gui/src/components/layout/TopBar.tsx`、`gui/src/components/theme/ThemePreferenceMenu.tsx`、
  `gui/src/styles/globals.css`、`gui/src/components/screens/BrowserControlSetupDialog.tsx`、
  `gui/src/lib/i18n.tsx`

## Context

surface-by-surface 视觉打磨推进到 TopBar，连带它点开的三个 popover、主题菜单，以及「浏览器控制」入口打开的 setup dialog。后半段的重点是：浏览器控制那套「手动加载未打包扩展」的六步教程对新手太劝退，目标是在「步骤本身不可消除」的前提下，降低呈现复杂度与心智负担。

## Decisions

**TopBar 一轮**

- Goal pill / YOLO pill / WidthToggle / SessionTitleMenu / BrowserControl 全部补 §2.5 触觉按压（`active:translate-y-[0.5px]`）+ focus-visible（功能用 brand/30，YOLO 用 warning/40）；Goal / YOLO pill 统一 `h-7` 对齐 cluster 高度。
- YOLO popover：琥珀警示 header band；移除关闭按钮上多余的 Lightning，并把 YOLO pill 本身的 Lightning 也去掉 → 干净 wordmark「YOLO」。
- Goal popover：`.galley-pop-in` 入场 + 每个 goal 的阶段词上色（新增 `goalStageTextClass`，与 `goalStageDotClass` 平行）。
- 主题菜单：`.galley-pop-in` 入场 + trigger focus-visible。
- 新增可复用 `.galley-pop-in` keyframe（fade + 3px 上浮 + scale 0.97→1，140ms，origin 取 Radix transform-origin，`prefers-reduced-motion` 退化为静止）——popover / dropdown 共享入场，属 §2.7 A 类。

**浏览器控制 onboarding（方向 C：happy-path 打头 + 渐进式披露）**

- 六步压成三拍：① 打开扩展页（顺带开开发者模式）② 拖入 Galley 插件 ③ 测试连接。
- 顶部加 `Chrome / Edge` SegmentedControl，**只选一次**，各步按钮从双按钮收成单按钮，消除每步重复的浏览器决策。
- 新增「遇到问题？」默认收起折叠，装 load-unpacked 兜底说明 + 官方图文指南，把琐碎/兜底移出主路径。
- elevation 对齐（落实 §2.1）：setup / repair 卡从 `bg-surface` 收归 `bg-elevated`，结构靠 hairline；step 序号圈反向改 `bg-app` 凹陷小 inset + mono tabular 数字。
- 文案：description 改安抚式（一次性设置、约一分钟）；正文统一「Galley 插件」，真实文件夹名只在拖入步露出；清理 `sameBrowser`/`anyWebsite`/`stepPrepare*`/`stepInstall*`/`openChrome`/`openEdge`/`showRepair` 等碎片键，zh/en 对齐。
- 关键第②步清晰化：删长绝对路径 inset，文件夹名降为句中内联 mono；把对象短语「整个 `tmwd_cdp_bridge` 文件夹」整体提到 `text-ink` + medium，做一眼抓得住的锚点。
- 测试页入口归位：已连接态状态卡上的裸「Chrome / Edge」按钮无语境、会误导，删除；改放进「重新加载插件」修复抽屉（step③，`showTestStatus={false}` 避免与外层状态卡重复）；needsWebpage 态因有「打开测试页后重新检测」副文案兜语义，保留。

## Rejected alternatives

- **向导式逐步（A）**：一次性设置强制分步反添点击摩擦，老用户失去全局感。
- **只分块成三拍但仍单屏全摊（B）**：本质还是一堵墙。
- **给拖入步配示意图/位图**：引入资源不合极简衬线调性、要管暗色版；手搓 SVG 维护成本高；「遇到问题？」已挂官方图文指南兜底。先用强文案，dogfood 仍卡再议。
- **dialog 入场动效**：dialog 居中模态较重，从中心 pop-in 易读成「跳一下」，overlay 已交代模态进入 → 保持静止。
- **已连接态保留测试页按钮**：裸 Chrome/Edge 无语境；且已连接有标签页时「重新测试」直接用现有页即可，按钮多余。
- **在连接/needsWebpage 视图也放浏览器选择器**：选择器是设置期概念，已连接态不需要。
- 第②步额外加一句「拖文件夹本身、不用解压」：与加重后的「整个…文件夹」信息重复，删。

## Open questions

- 浏览器选择目前是 dialog 内局部 state（默认 Chrome，关掉重开重置）。一次性设置可接受；若 dogfood 想记忆，再迁到 `browser-control` store。
- 第②步是否仍需视觉示意图，留实测信号决定。

## Next

- commit + push 本轮（用户明确要求 push）。
- 下个 session 继续 surface-by-surface 打磨。
