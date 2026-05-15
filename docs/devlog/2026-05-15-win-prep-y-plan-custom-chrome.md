# 2026-05-15 · Windows 发版 prep · Y 计划自绘 chrome + A 阶段杂项

**Date**: 2026-05-15
**Status**: Y 计划 Step 1-5 + A1 / A2 / A4 / A5 / A7 全部代码层完成（A3 复盘后是 no-op）。Y6 + 6 项 Win 机实测推迟到 JC 借到 Windows 机器。
**Related**:
- [windows-build-checklist.md](../windows-build-checklist.md)（本次新建）
- CLAUDE.md Stage 3.7 状态表
- 9 个 commit：`a980b76` Y1 → `ab8ee74` Y2 → `4399761` Y3 → `c58c38e` Y4 → `058f0e1` Y5 → `b55c69c` A1 → `1c8587b` A2 → `4abadaf` A4 → `48e1099` A7 → `8538238` A5

## Context

5 月 15 日已完成 Stage 3.7（[onboarding + empty state + YOLO + button polish](./2026-05-15-onboarding-empty-state-yolo-button-polish.md)），那次决定 **v0.1 Mac-only 发版**、v0.2 才上 Win。当时列了一份 Mac 侧 prep 清单（6 项 ~3 h）推到下次 session 做。今天的目标就是把这份清单清完。

清单逐项过到第 6 项「窗口装饰 OS 条件化」时，JC 反问"红绿灯怎么办"——这一项才发现严重低估：Win 没原生红绿灯，自绘 chrome 跟回退原生 chrome 是两条完全不同的路径，前者要 4-10 h（含 / 不含 Snap Layouts），后者只要 30-45 min。讨论清楚两条路的代价之后 JC 选了 Y（"Galley 准备走精致工作台定位"），但 Snap Layouts 跳过。Y 计划接下来作为本 session 的主线，A 项作为收尾。

## Decisions

### 1 · 窗口 chrome 走 Y（fully custom），跳 Snap Layouts

- **Y vs X**：方案 X = Win 用原生标题栏 + 改 TopBar 不预留红绿灯空间，30-45 min；方案 Y = `decorations: false` + 自绘 min/max/close + 阴影 + 圆角 + 拖拽 + 失焦状态，4-6 h。
- **Snap Layouts** （Win 11 最大化按钮 hover 弹出多窗口布局选择器）：跳过。实现要在 Rust 写 `WM_NCHITTEST` 把 HTMAXBUTTON 命中区还给系统，约 50-100 行 + 容易跟 React hover 状态打架。Win 11 用户失去这个特性但有 Win+Arrow 兜底。**Why**: v0.2 阶段先把跨平台跑通比像素级 Win 11 还原更要紧。
- **为什么不走 X**：Galley 主张「精致工作台」品牌定位，Win 用户开 Galley 应该跟 Mac 用户看到的窗口形状一致——一条原生灰条 + 自定义 TopBar 上下叠加视觉破坏感太强（或者去掉装饰但右上角 Win 控件盖住 TopBar 右 cluster）。

### 2 · Y 计划 5 个 substep + Mac 安全三层

每个 substep 独立 commit、独立 Mac 验证、独立可回滚：

| Step | 内容 | Mac 验证 |
|---|---|---|
| Y1 (`a980b76`) | Rust setup hook `set_decorations(false)` + `window-shadows-v2` 阴影；`[target.'cfg(target_os = "windows")'.dependencies]` target-specific Cargo dep | cargo check 全过，Mac 二进制零 Win-specific 代码（Cargo 不编译 Win-only crate） |
| Y2 (`ab8ee74`) | `lib/platform.ts` UA-sniff `isMac` / `isWindows`；TopBar 左 spacer 70/12 OS-aware + 右 pr-3 仅 Mac | TS/lint clean，`isMac=true` 走原值 |
| Y3 (`4399761`) | `WindowControls.tsx` 三按钮 + Win-scoped capability `windows.json`（`platforms: ["windows"]`） | TopBar 用 `!isMac` 门 + 权限文件平台门双重保险 |
| Y4 (`c58c38e`) | 双击 TopBar → toggleMaximize；`isWindowActionTarget` walk-up DOM 排除按钮 / 输入框 | onDoubleClick `if (isMac) return` 直接早退 |
| Y5 (`058f0e1`) | `onFocusChanged` 订阅 → 失焦 opacity-50；新增 `core:window:allow-internal-on-focus-changed` 权限 | WindowControls Mac 完全不渲染，订阅代码不执行 |

**Mac 安全三层**：(a) `!isMac` 渲染门 → (b) Promise cancelled flag 在 effect cleanup → (c) `platforms: ["windows"]` capability 不下发权限。任一层就够保 Mac 不动；三层叠加是"防御性深度"。

### 3 · UA sniff 决定 OS，不引 `@tauri-apps/plugin-os`

`isMac` / `isWindows` 用 `navigator.userAgent` 的 `Macintosh` / `Windows` token 判别——webview 进程的 UA 由宿主 OS 注入，所以这些 token 是 authoritative。

**Why not plugin-os**：要装 npm 包 + Rust crate + permission 三件套 + async init 才能判 OS。对 "is this Mac?" 这个布尔问题成本过高。UA 判别是同步、模块加载时确定、终身不变，性能跟语义都对。

### 4 · `window-shadows-v2` 而非 `window-shadows`

两个候选：`window-shadows` 0.2.2（Tauri v1 时代）和 `window-shadows-v2` 0.1.1（明确为 Tauri v2 fork）。后者更合 Tauri 2 API，选它。如果将来出现兼容问题，crate 是 target-specific（Mac 不编译），切换风险低。

### 5 · `core:window:allow-internal-on-focus-changed` 权限名真实存在

担心过 `internal-on-focus-changed` 是不是 Tauri 2 真实权限名（不存在的话 build.rs 阶段会 schema validate 失败）。`cargo check` 通过验证它真实存在——Tauri 2 的 window-event 订阅权限按 `core:window:allow-internal-on-<event-name>` 模式命名。

### 6 · A 阶段决策

- **A1 NSIS bundle target**：`targets: ["app", "dmg", "nsis"]`，加 `bundle.windows.nsis.installMode: "currentUser"` 避开 UAC 提权。Mac 跑 `tauri build` 时 NSIS 静默忽略，零 Mac 副作用。
- **A2 Python OS-aware**：`python3`（Mac/Linux）vs `python`（Win）。两个 site：`stores/demo.ts` DEMO_GA_CONFIG.python + `lib/bridge.ts` spawn fallback。`shell:allow-spawn` capability 早就同时白名单两个 alias 了，不需要改权限。
- **A3 教程命令 OS-conditional**：现状盘点后发现**已经做完了**——`onboarding-tutorials.ts` 唯一有 shell 命令的 entry（memory-info）早就把 `mkdir memory` / `md memory` 双版本写进去了；其它 entry 用的 `git clone` / `git status` / `git pull` 都是 Mac/Win 同语法；mykey-setup 是纯文件操作描述无 shell 命令。No-op。
- **A4 快捷键显示**：新建 `lib/shortcuts.ts` 的 `formatShortcut("Mod+K")` → Mac `⌘K` / Win `Ctrl+K`。6 个显示点迁移（TopBar / Sidebar / CommandPalette / SettingsShortcuts）。**Mac 字符串 byte-identical**——`formatShortcut("Mod+K")` 在 Mac 上返回的字符串跟之前的字面量逐字符相同。
- **A5 Windows build checklist 文档**：放在 `docs/windows-build-checklist.md`，7 段：prerequisites（含 MSVC Build Tools + WebView2）/ build commands / smoke test 清单（含 Y plan chrome 16 项 + keyboard / onboarding / bridge / chat / tutorial / YOLO 各分组）/ known sharp edges / hand-back-to-Mac workflow / 后续 GitHub Actions CI plan。
- **A7 路径示例 OS-conditional**：新增 `EXAMPLE_GA_PATH` 常量到 `lib/platform.ts`。Mac `~/Documents/GenericAgent`（不变），Win `C:\Users\你的名字\Documents\GenericAgent`。三个 user-facing site 迁移：Onboarding 初始 path / StepAttach placeholder / 下载教程示例。`stores/demo.ts` 的两处 `~/Documents/GenericAgent` 是 demo fixture，被 prod prefs 覆盖，不动。

### 7 · SettingsShortcuts 的 macOS 文案保留

`SettingsShortcuts.tsx` 里 ⌥↑/⌥↓ 那行的 note 原本是 "焦点在 Composer 时不生效（macOS 文本编辑原生快捷键保留）"。A4 顺手想把 "macOS" 词去掉以兼容 Win，但发现这违反 [feedback_mac_compat.md](../../../.claude/projects/-Users-inkstone-Documents-genericagent-webui/memory/feedback_mac_compat.md) 的「替换现有文案需要确认 byte-equivalent」。改成 `isMac` 条件分支：Mac 保留原文一字不动，Win 一条平行的不带 "macOS" 字样的句子。

## Rejected alternatives

- **方案 X · 保留 Win 原生 chrome**：30 min 就能 ship，但跟 Galley「精致工作台」定位冲突。如果 v0.2 Win 用户反馈"窗口 chrome 不一致很难受"会重新评估。
- **Snap Layouts 现在做**：4 h + Rust/React 边界 regression 风险。等 Win 11 dogfood 实际反馈再说。
- **`@tauri-apps/plugin-os` 而非 UA sniff**：方案过重（npm + Rust crate + permission + async）。UA 是同步 + 零成本 + 等价正确。
- **`window-shadows` 0.2.2**：可能能用但不是 v2 优先支持。选 v2 fork。
- **literal Win 11 #c42b1c 红色**：自绘 close 按钮的 hover 红用了 Galley `bg-danger` 而不是 Win 11 字面 hex。**Why**: 保持 chrome 在 DESIGN.md token 系统内，避免一次性 magic color；用户读到 "destructive 按钮被 hover" 的语义是对的，即使具体红跟 Win 11 略差。
- **自绘 restore icon（Win 11 双叠方块）**：Phosphor 没完全对应的 glyph。用 `CopySimple`（两个重叠 rect）近似。如果 Win 机实测显示读不出 "restore" 含义，再换 inline SVG。
- **`%USERPROFILE%\Documents\GenericAgent` 作 Win 路径示例**：env var 在文本输入框里不展开，用户照抄过去路径不存在。选 `C:\Users\你的名字\Documents\GenericAgent` 一眼看出来「你的名字」是占位符。
- **demo.ts fixture 也 OS-aware**：fixture 在 prod 被 prefs 覆盖，触发不到。不动，避免改动面扩大。
- **不预先 OS-condition SettingsShortcuts 那条 note**：feedback 规则要 byte-equivalent；与其改动文案再回退，不如一开始就用 `isMac` 条件分支保留 Mac 文字。

## Open questions

- **Win 11 圆角是否自动应用到 borderless 窗口**：现状不确定。Win 11 默认对大多数 app 给圆角（DWM 自动），但自定义 chrome 窗口可能要手动调 `DwmSetWindowAttribute(DWMWA_WINDOW_CORNER_PREFERENCE)`。Y6 smoke test 会发现。
- **Resize handle 抓握宽度**：`decorations: false` 默认让 Tauri 保留 ~4px 隐形 resize 边框，但版本间行为不稳。Y6 验证。
- **Maximize 时是否 8px 溢出屏幕**：Win 系统 bug，社区常用 `--margin: 8px` CSS workaround。Y6 验证、必要时加 workaround。
- **CopySimple 作 restore icon 读不读得出**：方案 6 的 fallback 是 inline SVG。Win 机实测决定。
- **`onResized` 是否所有路径都触发**：snapped / aero-shake / Win+Up 全屏路径是否都触发事件、`isMaximized()` 是否正确返回。要在 Win 机所有情况都试一遍。
- **Snap via Win+Arrow 跟我们 toggleMaximize 是否冲突**：用 Win+Up snap 全屏后，再点我们的 max 按钮表现如何？

## Next

立即可以做：
- 暂时没有；剩余工作全部依赖 Win 机器。

需要 Win 机器：
1. **Y6 smoke test** —— 按 `docs/windows-build-checklist.md` §4 的 25 项 checkbox 跑一遍
2. 出 `.exe` 验证 NSIS bundle 真能 build
3. 截图 + bug list 回 Mac 修

中期（v0.2.x）：
- 写 `.github/workflows/build.yml` matrix 让 Mac + Win CI 一起出包，避免下次发版又借机器
- 如果 Win 11 用户反馈 Snap Layouts 缺失痛点高，加 `WM_NCHITTEST` Rust 实现
