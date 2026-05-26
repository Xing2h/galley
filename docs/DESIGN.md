# Galley DESIGN.md

> Status: **v0.2.0-beta.1 — current implementation baseline**
> Last updated: 2026-05-26
> v0.1（dark-first / Linear 风）已被 v0.2 整体方向替换，Notion 历史稿仅作对照。
> 本文件以当前两栏 Galley GUI 为准：旧三栏 Inspector、独立 Settings window、Project emoji tree 等历史 spec 已退役。
> 决策叙事与 rejected alternatives 见 [docs/devlog/](./devlog/) 中 2026-05-07 / 2026-05-08 的设计相关 entry。

---

## 1. 设计哲学

Galley 的视觉与交互气质 = **Notion + Claude**。

- **Notion 给**：文档心智、舒展留白、callout 块、Sidebar 树
- **Claude 给**：暖色调、文学性可读性、对话感、克制
- **二者结合 = 在文档工作区里跟一个温和但严肃的助手协作**

不是「驾驶舱盯着野兽工作」，不是 IDE，不是 chat 气泡 IM，不是 dashboard。

### 1.1 三个统摄性约束（PRD §15.4 重申，DESIGN 落地）

1. **单容器更新** —— 一个 session 的所有进展在同一视图内持续刷新，不开新窗口 / 不 toast / 不弹层抢焦点
2. **渐进式披露** —— 默认只展示摘要，细节按需展开。Tool event / raw JSON / 历史 turn 都默认折叠
3. **结果优先** —— 最终答案与过程必须视觉分离，用户第一眼看到结论再展开过程

### 1.2 设计源头分级

| 源头 | 借用 | 不借用 |
|---|---|---|
| **Notion** | sidebar 树、文档留白、callout 块 | 数据库视图复杂度、cover image、emoji-heavy 页面装饰 |
| **Claude.ai** | 暖底色、衬线正文、hero composer、对话节奏 | message 气泡、artifact 侧边栏（V0.1） |
| **Linear** | 键盘优先、Command Palette、密度 | dark-first、cyan/emerald 信号、紧凑驾驶舱感 |
| **Raycast** | overlay Command Palette 形态 | 顶部贴边、酷炫渐变 |

---

## 2. 设计 Tokens

### 2.1 色板（Light-first）

> 命名约定：CSS variable 写 `--color-*`（Tailwind v4 `@theme` 友好），utility class 写 `bg-*` / `text-*` / `border-*`。文字色用 `ink` 命名空间（避开 `text-text-*` 双重命名），边框色用 `line` 命名空间（避开 `border-border-*`）。设计稿与文档讨论时可用语义名（"主文本色 / 卡片边"），代码层用工程名。

#### 基底层

| CSS variable | Utility | 值 | 用途 |
|---|---|---|---|
| `--color-app` | `bg-app` | `#FAF7F2` | App background，暖米白（不是纯白） |
| `--color-surface` | `bg-surface` | `#FDFAF5` | 普通卡片底 |
| `--color-elevated` | `bg-elevated` | `#FFFFFF` | 浮起卡片（Health Check / Error / Command Palette） |
| `--color-overlay` | `bg-overlay` | `rgba(31,27,23,0.4)` | Command Palette / modal 遮罩 |

#### 边框 / 分隔（line 命名空间）

| CSS variable | Utility | 值 | 用途 |
|---|---|---|---|
| `--color-line` | `border-line` | `#EDE6D8` | 卡片边、divider 默认 |
| `--color-line-strong` | `border-line-strong` | `#D9CFB8` | hover 边、focus 边（非杏沙时） |
| `--color-line-subtle` | `border-line-subtle` | `rgba(31,27,23,0.06)` | 更弱的内分隔（如 modal / settings row 之间） |

#### 文字三档（ink 命名空间）

| CSS variable | Utility | 值 | 用途 |
|---|---|---|---|
| `--color-ink` | `text-ink` / `bg-ink` | `#1F1B17` | charcoal-warm，标题、主文本、主 CTA 填充 |
| `--color-ink-soft` | `text-ink-soft` | `#5C544A` | 次要文本、metadata |
| `--color-ink-muted` | `text-ink-muted` | `#8E867A` | hint、placeholder、timestamp |

#### 互动状态

| CSS variable | Utility | 值 | 用途 |
|---|---|---|---|
| `--color-hover` | `bg-hover` | `#F2EDE3` | 中性灰 hover（不抢戏） |
| `--color-selected` | `bg-selected` | `#F8EDDA` | 杏沙 tint（品牌时刻） |

> Focus ring 用 `--color-brand`（`ring-brand`），不单独 token。

#### 品牌 / 状态

| CSS variable | Utility | 值 | 用途 |
|---|---|---|---|
| `--color-brand` | `bg-brand` / `text-brand` / `ring-brand` | `#D9A78A` | 杏沙，体温色 + Composer Submit CTA 例外 |
| `--color-brand-soft` | `bg-brand-soft` | `#F8EDDA` | 杏沙最浅 tint |
| `--color-brand-strong` | `bg-brand-strong` / `text-brand-strong` | `#C68762` | 杏沙 hover/active；当前 step 状态 icon、Submit hover |
| `--color-success` | `text-success` / `bg-success` | `#5A8C5A` | 成功状态 line icon |
| `--color-warning` | `text-warning` / `bg-warning` | `#BF7A1F` | 深琥珀 warning（与杏沙拉开 13° 色相） |
| `--color-error` | `text-error` / `bg-error` | `#B14545` | 深红 |
| `--color-info` | `text-info` / `bg-info` | `#7A7A8E` | muted 灰蓝（info severity） |

### 2.2 字体（方案 C：三 register）

| Register | 字体（英 / 中） | 用途 |
|---|---|---|
| **Serif（被读）** | Newsreader / 思源宋体 | 用户消息、agent 回复、turn summary |
| **Sans（被点）** | Inter / 苹方 / 思源黑体 | 按钮、菜单、metadata、session row |
| **Mono（技术 ID）** | JetBrains Mono | shell 命令、路径、JSON、tool 名 |

字号 / 行高：

- Body: 16px / line-height 1.65–1.7
- Subtle: 13px / line-height 1.5
- Hint: 11px uppercase tracked
- Heading（Newsreader medium）: 20–24px

### 2.3 Icon set

**Phosphor Thin** 全局唯一 icon set。

- 默认 16px stroke 1.25px
- 状态色随上下文（参考 §2.1 状态色）
- **不用 emoji 做状态指示**（跨平台渲染不一致 + 视觉太重）
- **Phosphor-only，产品无 emoji 锚**（2026-05-14 收回了原本 ThinkingSummary 的 💭 例外——bg-surface callout chrome + italic serif 已经足以标识 callout 块，不需要图标装饰）

### 2.4 圆角 / 阴影 / 间距

| Token | 值 | 用途 |
|---|---|---|
| `radius-sm` | 6px | inline element |
| `radius-md` | 12px | card |
| `radius-lg` | 14px | overlay (Command Palette) |
| `shadow-card` | `0 1px 2px rgba(31,27,23,0.04)` | 普通卡片 |
| `shadow-elevated` | `0 8px 24px rgba(31,27,23,0.12)` | 浮起卡片、Command Palette |
| `space-unit` | 4px | 间距基础单位 |

### 2.5 UI primitives

当前代码层的基础控件在 `gui/src/components/ui/`，新按钮 / 表单控件优先复用这些 primitive：

| Primitive | 用途 |
|---|---|
| `Button` | 文本按钮；variants: `primary` / `secondary` / `ghost` / `brand-soft` / `accent-secondary` / `warning` / `destructive` / `destructive-soft` |
| `IconButton` | 纯图标按钮；必须提供 `ariaLabel`，用于 close / toolbar / row actions |
| `DialogActionRow` | 弹窗底部 action 区，统一 `gap` / 对齐 |
| `Checkbox` | 带 label 的 checkbox 行，支持 `onCheckedChange` |
| `Switch` | 二元开关，支持 `brand` / `warning` tone |
| `SegmentedControl` | 小型互斥选项组，如 compact / wide |

`Button` / `IconButton` 默认带克制的实体反馈：按钮本体有低位阴影或明确
surface，hover 只允许 0.5px 级别的微上浮，active 用更短 transition 向下压。
目标是让控件“可按”，不是做弹跳动效。

- `primary` / `secondary` / `brand-soft` / `accent-secondary` / `warning` /
  `destructive` / `destructive-soft`：可以有轻阴影和 hover lift。
- `ghost` / 文字链接 / session row / menu item：只给色块和极轻 active press，
  不加厚阴影，避免页面里所有东西都漂起来。
- disabled 控件必须静止，不保留 hover lift。

长任务反馈同样克制：普通等待不打扰，30 秒后才在原状态行补充
`仍在运行` / `Still running`。不要 toast，不要 banner，不要额外提示
“可停止 / 可切后台继续”。

例外：Composer submit / stop、window controls、复杂 row trigger、Radix menu item 这类强语义控件可以保留局部实现，但颜色、字号、按下节奏仍应对齐 token。

### 2.6 Desktop WebView discipline

Galley 是桌面客户端，不应暴露不必要的网页线索：

- `html` 禁用 overscroll bounce；`body` 不出现整页滚动。
- 默认不允许随手选中 UI chrome，避免拖拽时出现网页蓝色选区。
- conversation markdown、用户消息、code block、input / textarea、路径 / key /
  error detail 等内容区域必须保留可选择文本。Galley 是工作台，复制内容是核心任务。

---

## 3. 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│ Top Bar（44px）— traffic light reserve · Title menu · actions │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  Sidebar     │   Conversation + Tool Timeline               │
│  14–30%      │                                              │
│  resizable   │   ┌──────────────────────────────────────┐   │
│              │   │ Approval Dock（sticky, pending only） │   │
│              │   ├──────────────────────────────────────┤   │
│              │   │ Composer                             │   │
│              │   └──────────────────────────────────────┘   │
└──────────────┴──────────────────────────────────────────────┘
```

- 两栏布局：Sidebar / Main，整体 minimum window width 1120px，minimum height 720px。
- Sidebar 用 `react-resizable-panels`，默认 20%，约束 14–30%；宽度持久化到 localStorage。
- Sidebar **不可折叠**。多 session 是 Galley 的核心产品形态，隐藏 Sidebar 等于隐藏差异化；需要更少 chrome 时通过拖拽缩到 14%。
- 右侧 Inspector 已退役。详情分散到各自最相关的上下文：Tool callout inline 展示工具细节，Approval Dock/Approval Card 处理审批，Runtime/Approval metadata 进入 Settings。
- 主区只有 Conversation column；阅读宽度由 TopBar 的 compact / wide toggle 控制，而不是靠右侧面板挤压。

---

## 4. 组件 Spec

### 4.1 Top Bar

- **44px 高**，自定义 titlebar（macOS traffic light 集成）
- 三段 flex 布局：traffic light reserve（macOS 70px / Windows 12px）｜ **session title 居中**（flex-1）｜ 右侧 actions
  - title 居中是 macOS chrome 标准（Safari / Notion / Mail / Pages / Finder），跟 traffic light 之间不靠近避免视觉拥挤
  - 长 title truncate 居中
- **Session title menu**：有 active session 时 title + `CaretDown` 是一个按钮，打开 session-scoped 菜单（Rename / Reinject Tools / Desktop Pet）。空状态渲染 italic muted "新对话"，不可点。
- Rename 从 title menu 进入 inline edit；Enter 提交，Esc 取消。
- 右：YOLO indicator（条件渲染）+ conversation width toggle（compact / wide）+ Settings 入口（Phosphor `Gear` thin，中文 UI tooltip "设置 · ⌘ + ,"）+ Windows window controls。
- **不在 TopBar 放 Command Palette 按钮**：Sidebar 已有 Search quick action，`⌘K` 全局可用；重复 click affordance 只增加 chrome 噪音。
- **不放 Sidebar toggle**：Sidebar 当前不可折叠，只可拖拽调整宽度。
- 整个 TopBar 加 `data-tauri-drag-region`，作为窗口拖动 handle（Tauri v2 需要 `core:window:allow-start-dragging` 权限，buttons 由 Tauri 自动豁免）
- **不显示**：runtime（在 Sidebar 顶部）/ Stop（在 Composer Submit 位置）/ Context Window / 价格
- Windows 路径渲染自定义 WindowControls；macOS 由 overlay traffic light 接管窗口控制。

#### YOLO Indicator（条件渲染，PRD §11.5）

YOLO mode 开启时在右侧 actions 最前渲染 persistent badge：

```
[ Lightning icon · YOLO ]
```

- 视觉：6px padding-x / 4px padding-y / 圆角 6px / `bg-warning/10` 浅琥珀背景 / `text-warning` 深琥珀文字 / `border border-warning/30` 1px 同色边框
- 内容：14px Phosphor `Lightning` thin + "YOLO" 12px Inter medium 大写
- 不闪烁、不脉动——视觉警示靠颜色对比，动效会让用户疲劳后忽略
- 永远可见（不 hover 显示），这是核心承诺
- **点击行为**：弹 popover（Radix Popover，宽 280px，14px padding）
  - 标题 13px Inter medium："YOLO 模式已开启"
  - 一行 12px muted："所有工具调用跳过审批直接执行"
  - 一个深琥珀 button：`Lightning` 16px + "立即关闭"——点击直接关 + 关闭 popover + indicator 消失
  - secondary link "在设置中查看 →"（打开 Settings → Approval tab）
- **未开启时不渲染**——这个位置完全空（不留占位），TopBar 视觉跟现在一致

设计判断：indicator 视觉上比"普通的右侧按钮"重，不是因为追求漂亮，而是要让用户**每次扫 TopBar 都注意到**这个状态。深琥珀 (`--color-warning`) 在 light theme 主背景上反差足够，不至于过度恐吓用 error 红色（用户开了 YOLO 不是出了问题，只是在做"我知道风险"的事）。

### 4.2 Sidebar

#### 结构（自上而下）

```
┌──────────────────────────────────┐
│ GALLEY                    ● GA 就绪 │  wordmark + runtime dot
├──────────────────────────────────┤
│ + 新对话                   ⌘N    │  Quick action
│ 搜索                       ⌘K    │  打开 Command Palette
│ 项目                       [+]    │  进入/退出 Project Review；+ 新建项目
│                                  │
│ ACTIVE PROJECTS                  │  Project Review: 点击项目行展开/收起
│   FolderOpen Galley        +     │  行点击展开/收起；+ 新建项目对话
│     ◐ Session A                  │
│   FolderOpen Website       +     │
│     + 新建项目对话               │  空项目 CTA，点击新建到该项目
│ OLDER PROJECTS              12   │  默认折叠；点击展开 7 天前项目
├──────────────────────────────────┤
│ PINNED                           │  仅有 pin session 时显示
│   ◐ Session A                    │
├──────────────────────────────────┤
│ TODAY                            │
│   ◐ Session 1                    │
│   ◐ Session 2                    │
│ THIS WEEK                        │
│ EARLIER                          │  单行 "查看全部 N"，打开 EarlierDialog
├──────────────────────────────────┤
│ Archived                   N     │  底部
└──────────────────────────────────┘
```

#### 关键决策

- **单行 Header**：GALLEY wordmark + runtime dot 同行。`GA 就绪` 只是状态；`GA 未配置` 才可点并进入 Settings → Runtime。
- **Quick Actions 靠顶部**：New Chat / Search / Project Review 是最高频入口。Project Review 入口在同一组里，避免旧方案里「PROJECTS 标题行」和项目 row 叠在一起。右侧轻量 `+` 只负责新建项目；创建后进入 Project Review 并展开新项目。
- **普通 sidebar 不再显示项目列表**：普通视图只保留时间线，减少重复层级；需要看项目时显式进入 Project Review。
- **Project row 不用 emoji**：用 Phosphor `Folder` / `FolderOpen` 表达层级与 filter，避免跨平台 emoji 造成的视觉重量和渲染差异。
- **Project Review 由 Quick Action `项目` 切换**：开启后隐藏普通 timeline，展示完整 project list；项目 row 只负责展开/收起，允许多项目同时展开；再次点击 `项目` 退出 Project Review。入口用 selected tint 表示开启状态，不额外加说明文案；active 时 tooltip / aria-label 为「退出项目视图」。
- **Project Review 进出动效**：模式切换不是硬替换。进入时 Project Review 从 0 高度轻展开并 fade in，普通 timeline 下沉 fade out；退出时 Project Review 保留约 150ms 完成上收 fade out，普通 timeline 从下方回到原位。项目内部 drawer 继续使用独立展开动画，避免两层动效互相抢戏。
- **Project Review 按活跃度分组**：pinned 或 7 天内有非归档 session 活动的项目进入 `ACTIVE PROJECTS`；其余进入 `OLDER PROJECTS`，默认折叠。新建但 7 天内为空的项目视作 active，避免刚建完就被藏起来。
- **项目对话创建是独立动作**：项目 row 右侧轻量 `+` 和空项目 CTA `+ 新建项目对话` 才会把右侧切到 project-aware EmptyState（placeholder: `在 {Project} 里交代什么？`，第一句话 lazily create 到该 project）。展开/收起项目不改变右侧当前对话。
- **去掉 ACTIVE / WAITING FOR YOU 区块**：状态由 row icon 颜色对比 + Approval Dock 兜底
- **去掉 "UNFILED" 命名**：通用 Agent 工作台 80%+ 对话本就 free-floating，时间分组就是主体
- **PINNED section** 仅在有 pin session 时显示，空时不占位
- **EARLIER 折叠成单行入口**：sidebar 是当前工作面，不是无限历史列表；完整旧 session 浏览进入 `EarlierDialog`。
- **Archived 不叫 Trash**：archive 是保留数据；真正永久删除只在 Archived dialog 里出现。
- Sidebar 不可折叠；可拖拽调整宽度。`⌘K` 全局 Command Palette，右键菜单提供 rename / pin / move to project / archive 等低频操作。

#### Session Row（参考 PRD §7.5）

每行显示：

- 16px Phosphor thin **状态 icon**（颜色随状态）
  - idle: `Circle` muted / connecting: `CircleNotch` 旋转 / running: `CircleNotch` 杏沙旋转 / pending ask_user: `PauseCircle` 深琥珀 / error: `X` 深红 / completed: `CheckCircle` 杏沙 / archived: `ArchiveBox` muted
- **Title**（13px Inter medium，1 行 truncate）
- **下一行**：
  - running：`第 N 步 · {summary}` 或 `思考中…`，font-serif italic
  - settled：`已完成 · {summary}`，11px Inter muted
  - ask_user：`等你回复`，warning
- **角标**：pending approval count（深琥珀点 + 数字）/ error count（深红点）
- **Desktop Pet**：Cat icon 是 session status badge，仅在绑定 session 出现。

#### Project 行

- Project Review list：`pinned desc`，再按项目内容活跃度排序（项目内非归档 session 的最大 `lastActivityAt`；空项目回退 `createdAt`）。Project Review 显示全部项目；`OLDER PROJECTS` 默认折叠来承接长期增长。
- Row：Phosphor `Folder` / `FolderOpen` + name + optional pinned icon + project conversation `+`。项目行右侧 `+` 是 32px 透明 hit area 的 contextual action：默认收敛，row hover / active 时显现为裸 `+`；button hover 只给轻量 `bg-hover` + 文字色变化，不加常驻边框或阴影。Quick Action 里的新建项目 `+` 使用同一套轻按钮规则，但常驻可见。空项目 CTA 用显性 `+ 新建项目对话`。当前右侧项目上下文或展开 row 用 `bg-selected`。
- Right-click menu：Pin / Unpin、Edit、Delete。Delete 走 confirm dialog；删除 Project 不删除 session。
- `CreateProjectDialog` 是 420px modal，只收 `name`。rootPath / cwd-binding 已回滚，避免悄悄改变 GA 相对路径语义。

### 4.3 Conversation 主区

#### Turn 结构

```
第 1 步                                          ← italic serif 12px muted（来自 GA turnIndex）
[Thinking summary callout]                       ← 序列最前（仅在 GA 真实 emit <thinking> 时出现）
[Tool callout 1]                                 ← 行动序列
[Tool callout 2]
─────────────────                                ← 稍深 1px 全宽 hr（行动 → 结论）
[Final answer，浮在文档里]                       ← 不放 callout
第 2 步                                          ← 自带 mt-7 (28px) 的 chapter-mark，承担 turn 间分隔
[Thinking summary callout]
...
```

**没有 turn 之间的 SoftHr** —— TurnMarker 自带视觉重量 + 上方间距，承担 turn-to-turn 的章节分隔。不再有水平横线。

#### User vs Agent 三重区分（不用气泡）

| 维度 | User | Agent |
|---|---|---|
| 字体 | Inter 500 | Newsreader 400 |
| 字重 | medium | regular |
| 锚点 | 左侧 3px 杏沙竖条 + 杏沙底 `bg-brand-soft` + 右侧 6px 圆角 | 无 |
| 对齐 | 左对齐 | 左对齐 |

不要 right-align 不要气泡 —— 这是文档区，不是聊天 IM。**用户消息是 callout 块，不是 bubble**：全宽对齐、左强边线、轻底色——参照 Markdown blockquote / Notion callout 的文档语法，而非 IM 单侧浮起。

长对话里这是用户**回找自己提问**的主视觉锚——杏沙底 + 品牌竖线让每个 user turn 成为滚动停靠点。AI 回复保持纯散文无底色，"提问（高亮锚）→ AI 回复（要读的内容）" 的层次随之建立。

#### Thinking Summary

- 每 turn 第一个 callout（仅当 GA 真实 emit `<thinking>` 内容时出现）
- 内容 = LLM 这一轮"打算做什么"的总结
- Newsreader italic 14px ink-soft，3px 中性 `ink-soft` 左竖条 + `bg-surface` 底 + 右 8px 圆角
- 无图标——typography + 容器 chrome 已足够标识 callout 块，2026-05-14 收回了原 💭 例外

#### Markdown 渲染

Final answer 跟 Thinking summary 都通过 `react-markdown` + `remark-gfm` + Shiki 渲染。LLM 输出的 markdown（标题 / 列表 / 表格 / 代码块 / 引用 / 链接 / 删除线）全部解析成对应 DOM，没解析的纯文本走默认段落。

**typography 映射**（每个元素 pull 现有 token，不引入新字号）：

| markdown | 渲染 |
|---|---|
| `p` | Newsreader 16.5px (`agent`) / Newsreader italic 14px muted (`thinking`) |
| `h1` | Newsreader medium 22px |
| `h2` | Newsreader medium 19px |
| `h3` | Newsreader medium 17px（故意接近正文，避免视觉跳跃） |
| `h4` | Newsreader medium 15.5px |
| `ul` / `ol` | 标准缩进，`::marker` text-ink-muted |
| `li` | 紧 paragraph 形态（list 内 `<p>` margin 0） |
| 行内 `code` | mono 0.86em + bg-hover 浅底（pill） |
| 块代码 ` ```python ` | 详见下方 Shiki 段 |
| `blockquote` | 左 3px brand 竖线 + italic + ink-soft |
| `a` | text-brand-strong + 1px 下划线 + 安全 _blank |
| `table` (GFM) | border-collapse + th `bg-surface` + 单元格 padding 12px×8px |
| `hr` | 1px line + my-5 |
| `strong` | font-medium（不到 bolder，跟 Newsreader 协调） |
| `em` | italic |
| `~~del~~` (GFM) | line-through ink-muted |

**视觉哲学**：每个 markdown 元素 reuse 现有 Newsreader / Inter / JetBrains-Mono token，不为 markdown 单独引入字号 ramp。整段对话读起来是一个 document，不是 stylesheet 拼贴。

#### 代码块语法高亮（Shiki）

- 引擎：[Shiki](https://shiki.style) v1+，TextMate grammar，跟 VS Code / Claude.ai web 同款
- 主题：`github-light`，跟 Galley light 主题对齐
- 注册语言（hand-picked）：`bash` / `css` / `diff` / `html` / `javascript` / `json` / `markdown` / `python` / `rust` / `shell` / `sql` / `tsx` / `typescript` / `yaml` —— 14 种 coding agent 用户高频
- 别名：`js → javascript` / `ts → typescript` / `py → python` / `rs → rust` / `sh → bash` / `yml → yaml`
- 未注册的语言：fallback 到无色 mono code block（同样的 chrome，仅没 token color），不报错
- async render：第一次 highlighter 加载时显示 plain mono fallback，加载完替换；同 highlighter 实例 cache，跨 code block 共享
- 视觉容器：1px line border + bg-surface + 圆角 6px + 顶部一行 mono uppercase 11px 显示语言名
- 横向 overflow scrollable（不 wrap）

V0.1 代码块顶部 header 右侧加 **hover-revealed Copy 按钮**（11px Phosphor `Copy` thin + uppercase "Copy" 标签，hover 时 fade-in，复制后变 ✓ + "Copied" 1.5s 反馈）。复制内容是**纯代码**——不带 ` ``` ` fence、不带 markdown chrome。Claude.ai / ChatGPT / Cursor 的肌肉记忆位置。

V0.1 不做：代码块行号 / Edit 在行内（V0.2 候选）。

#### Message Actions（reply 级行动条）

每段 agent final answer 下方常驻一行 muted 行动条（DESIGN.md §4.3 dogfood 反馈：用户经常想保留 reply 内容）：

| 按钮 | 行为 |
|---|---|
| `Copy` | 复制原始 markdown source（带 `**bold**` `## headers`），不是渲染后纯文本——用户粘贴目的地（Notion / Obsidian / Slack / 邮件）多数能 re-render markdown |
| `Save` | Tauri save dialog → `.md` 文件。默认文件名 `ga-{YYYYMMDD-HHmmss}.md`，用户可改 |

视觉：

- 位置：reply markdown 渲染**正下方**，gap 8px (`mt-2`)
- 字号 12px Inter + 13px Phosphor thin icon
- **常驻可见**（不 hover-only），text-ink-muted；hover 升 ink-soft + bg-hover
- 点击后 0.5s 内 icon 变 Check + 文字变 "Copied" / "Saved"，1.5s 后回 idle
- success 反馈用 `text-success`（绿色 token）

工程：
- Copy 走 `navigator.clipboard.writeText` web API（Tauri webview 支持）
- Save 走 `@tauri-apps/plugin-dialog` `save()` + `@tauri-apps/plugin-fs` `writeTextFile`
- Capabilities 加 `dialog:default` / `fs:allow-write-text-file` + `fs:scope` 限制到 `$HOME` / `$DOCUMENT` / `$DESKTOP` / `$DOWNLOAD`（保留用户常去的目录）

V0.1 **不做**：

- **Regenerate 按钮**：需要 GA history 回滚 + 跨 turn 状态管理，工程量大；推后到 V0.2 跟 multi-session / session 恢复一并设计
- **Continue 按钮**：用户自己输入"继续"即可，不需要专用按钮
- **Pin / 收藏**：需要数据模型扩展，V0.1 单 session 不值
- **Branch（从这里分叉新 session）**：跟 multi-session 深度耦合，V0.1 没法做
- **TTS / 翻译 / Share**：依赖外部服务，跟产品定位不符

ReactNode children（非 markdown string）的 reply 不渲染 actions——demo fixture 没 markdown source 可复制。

#### Scroll behaviour（stick to user message top）

Conversation 主区是 `overflow-y-auto` 的列。用户提交新消息时**不**滚到底部（reply 还没生成，跳到一片空地）；**也不**被动什么都不做（user message 出现在视口外，看不到反馈）。**正确做法**：把刚 submit 的 user message 顶端贴到 viewport 顶部下方 32px 处。

跟 Claude.ai / ChatGPT 收敛的同一模式。理由：

- 用户提交完立刻能看到自己的提问
- 长 reply 不会推走问题——问题永远在视口顶端附近
- 短 reply 用户也不必往下找答案——它就在问题正下方
- 阅读 reply 期间**不被打扰**（不跟随）

实现细节：

- store 加 `userSubmitTick` 计数器，`appendUserTurn` 时 +1
- MainView `useEffect` 监听 `userSubmitTick` 变化（不监听 `turns.length`——避免 `turn_end` 也触发滚）
- RAF 推迟到 `<MessageUser data-role="user-msg">` 真实 mount 后
- 找最后一个 `[data-role="user-msg"]`，算 offset (`top - container.top - 32`)，`container.scrollBy({ top: delta, behavior: "smooth" })`
- 不用 `scrollIntoView({block: "start"})`：它没法控 padding

边界：

| 场景 | 行为 |
|---|---|
| 第一次提交（EmptyState → MainView 切换） | 同样滚一次（保险，user message 已经在顶部时 delta 接近 0，相当于 noop） |
| Turn_end 来 / 流式 token 流入 | 不触发（store 状态变了但 tick 没变） |
| 用户主动向上翻历史 | 不打断（仅 submit 触发） |
| 切换历史 session（multi-session 后） | 默认滚到底（看到最后 turn）；不属于此 spec 范畴 |

#### Streaming generation（流式 partial 渲染）

Bridge 订阅 GA 的 `display_queue`（`agentmain.put_task` 返回），把每个 partial chunk 通过 IPC `turn_progress` event 推给 desktop。Desktop 累积成 `inFlightContent`，跑 `cleanPartialContent` strip 掉 GA 内部 tag 后用 `MarkdownView` 实时渲染。

| 时机 | 显示 |
|---|---|
| User 提交 → bridge spawn → LLM TTFT | `第 N 步 · 思考中` TurnMarker（thinking 态） |
| 第一批 token 到 | placeholder 消失，partial markdown 开始流出 |
| 流式过程中 | partial 持续增长，Markdown re-render（行内 / 列表 / 代码块都跟着出现） |
| `turn_end` 到 | partial 被 finalized AgentTurn **替换**（store `appendAgentTurn` clear inFlightContent） |
| Tool call 触发 | partial 暂停，Approval Card 出现 |
| 用户决策后 → bridge 继续 → 下一 turn | 新 turn 的 partial 重新开始流（store `turn_start` clear inFlightContent） |

**关键 robustness**：partial 输入是 GA-raw（`<thinking>` / `<summary>` / `<tool_use>` / `<file_content>` / `[FILE:...]`），且**可能 mid-tag**（比如刚收到 `<thi` 没 close）。`cleanPartialContent` 的 4 步算法：

1. Strip 完整的 `<tag>...</tag>` block
2. 找 leftmost unclosed open tag → 截断
3. 找 trailing partial open-tag start（"<thi" / "</sum"）→ 截断
4. Strip `[FILE:...]` refs + 折叠空行

效果：用户在任何 sampling instant 都看不到 GA 内部 scaffolding 闪过。

#### Sticky-bottom + Scroll-to-bottom 浮动按钮

- 流式过程中**默认跟随**：`atBottom` flag 通过 scroll listener 维护（24px tolerance），在底部时 `useLayoutEffect` 监听 `inFlightContent` 变化把 `scrollTop = scrollHeight`
- **用户向上滚 → 不跟随**：`atBottom = false`，stream 继续但视图不动
- **浮动按钮**：`atBottom = false` 时 conversation 列右下角（Composer 上方 140px）出现一个 36px 圆形 ghost 按钮，⬇ ArrowDown thin icon
- 点按钮 → `scrollTo({ top: scrollHeight, behavior: "smooth" })` + `atBottom = true`（重新启用跟随）
- ESC / 任何手动 wheel 不影响按钮可见性（仅 scroll position 决定）

#### Thinking Placeholder（in-flight 占位）

用户提交消息后到 `turn_end` 到达之间存在显著延迟（LLM TTFT 可达几秒到十几秒）。如果不显示状态指示，用户会觉得 UI 卡住。

- 用户提交瞬间 store 设 `agentRunning = true`（不等 `turn_start` IPC，避免一次往返延迟）
- conversation 末尾立即渲染 `TurnMarker` 的 thinking 态：单行 italic serif 12px ink-muted，内容 "第 N 步 · 思考中" + TypingDots
- 触发条件：`agentRunning && pendingApprovals.length === 0 && !visiblePartial`
- `turn_end` 到达时占位消失，真正的 AgentTurn（含同一个 step number 的 TurnMarker + tools + final answer）一次性渲染替换。**before/after 视觉一致**——同一个 TurnMarker 组件的两态，用户感受到的是一个步骤的进展，不是两个独立的 UI
- **等待 ≥ 30 秒时显示 elapsed 计数 + 仍在运行**——模型调用 / 大输出任务到 30s
  并不异常，过早显示秒表会制造焦虑；30s 后给一个轻量活性确认，证明系统仍在跑。
  Caller 用 `key={currentTurnIndex}` 让每步独立计时（step 1 等 40s，step 2 时钟归零）
  - `0-29s` → 仅 `思考中···`
  - `30-59s` → `思考中··· · 32 秒 · 仍在运行`
  - `60s+` → `思考中··· · 已 1 分 23 秒 · 仍在运行`

历史设计（已废弃）：原本占位走 ThinkingSummary callout（bg-surface + 左竖条 + 💭 emoji），跟正式 ThinkingSummary 块视觉同款。问题是 callout chrome 是给"GA 真实 emit `<thinking>` 多段内容"设计的容器，套在 10 字占位上视觉权重严重失衡。2026-05-14 改成 TurnMarker thinking 态。

Composer 状态同步：`agentRunning = true` 时 Submit 按钮切到 Stop 模式，LLM dropdown disable。

#### Turn 编号 + 间距

**不是**用户↔agent 对话轮次，**是 GA 内部 agent loop 的 turn 计数**——每次 LLM call + dispatch = 1 turn。一个 user message 可以触发 GA 跑 N 个 turn（agent 不断 reflect + 调 tool 直到出 final answer）。这跟 PRD §7.5 sidebar session row 显示的 "Turn N · summary" 同一个 N。

- 数据来源：每个 IPC `turn_start` / `turn_end` event 都带 `turnIndex` 字段
- AgentTurn type 持有 `turnIndex`（一个 user message 在 conversation 里可能产生多个 AgentTurn）
- 渲染：每个 AgentTurn 的 thinking summary 之上一行，`Turn N` 11px Inter mono uppercase soft（`text-ink-soft`，比 muted 重一档），`tracking-[0.12em]` 大字距增强 chapter-mark 仪式感，`mt-7`（28px）上方间距承担 turn 间章节分隔
- in-flight 状态：`currentTurnIndex` 从 `turn_start` 读取；thinking placeholder 顶部也显示 `Turn N` 标记让用户感知 agent 当前跑到第几迭代
- `run_complete` / `error` 时清空 currentTurnIndex
- **没有 turn 之间的 SoftHr**——TurnMarker 自带 chapter-break 视觉重量，水平横线已删除

#### 间距演化历史

`turn 间分隔`经过四次调整：

1. v0.1 初版：SoftHr `my-9`（72px）—— dogfood 反馈"每个 turn 浪费 1/3 屏"
2. SoftHr `my-6`（48px）—— 仍反馈"还是大"
3. SoftHr `my-5`（40px）—— 仍反馈"还是大"
4. **现行**：删除 SoftHr，TurnMarker `mt-7`（28px）+ tracking 加大承担分隔

教训：当用户反复反馈"间距大"时，缩 hr 到极小已经不是答案；该思考"分隔信号"是不是必须靠 hr 承担。结果：TurnMarker 的章节标识 + 间距 + 字号已经足够。

### 4.4 Composer

#### 视觉

- **杏沙 focus ring**（`brand` token）
- 圆角 12px / `surface` 背景 / 默认 1px `border-default`
- 上方留 1.5em，下方贴 viewport bottom（in-session）或居中（empty state hero）
- + icon 占位（V0.2 接 attach）/ Submit 按钮

#### Submit 按钮（杏沙 CTA 例外）

- **Submit 是全局唯一用杏沙作为 CTA 填充的元素** —— 用户最高频元素，杏沙带来"亲和体温"
- Phosphor `ArrowUp` thin / 32px circle / 杏沙填充 / charcoal icon
- Enter 触发，Shift+Enter 换行
- agent running 时**位置替换为 Stop 按钮**（深琥珀填充 / Phosphor `Stop` thin），点击触发 abort

#### LLM 切换器（V0.1）

位置：**Composer 内部左下角**，跟 + button 并列。

- 形态：Phosphor `Cube` thin icon + LLM displayName + `CaretDown` thin
- Ghost button / hover `hover-tint` / 13px Inter / 28px 高
- 点击展开 popover：
  - `surface-elevated` 背景 + `shadow-elevated`
  - 圆角 12px / 内边距 8px / 每行 32px
  - current 项右侧杏沙 ✓
  - 切换中 `Check` 替换为 `CircleNotch` 旋转
- agent running / waiting approval 时 disabled，hover 显示 tooltip "Wait for the current run to finish"
- LLM list > 8 时加 scroll
- displayName 由 bridge 按 runtime 边界生成：external GA 显示完整 raw name；managed GA 显示 Galley Models 里的显示名或原始 model id（详见 IPC 协议）

#### 不显示

Context Window / 价格 / token estimate（V0.1 拿不到 + 信息噪音）

### 4.5 Tool Event Callout

#### 视觉（像 Notion callout，不像 stdout log）

每个 tool call 是独立 block：

- **左侧 3px 状态色竖条** + **1px `border-default`** + **12px 圆角**
- **不用 background tint**（暖米白底上太花）
- 16px Phosphor thin icon + tool name（mono）+ status pill + `CaretDown`
- 内边距 16px / 上下 margin 12px

#### 6 状态映射

| 状态 | 左竖条色 | icon | 默认折叠 |
|---|---|---|---|
| running | 杏沙 `brand` | `CircleNotch` 旋转 | 当前 step 默认展开 |
| success-current | 杏沙 | `CheckCircle` | 当前 step 默认展开 |
| **success-historical** | **几乎不可见**（融入背景） | `CheckCircle` muted | **默认折叠** |
| waiting_approval | 深琥珀 | `Pause` | **强制展开**（不可折叠） |
| failed | 深红 | `X` | **强制展开** |
| denied | muted | `Prohibit` | 折叠（结果已知，不重要） |

#### 展开内容

- **args preview**：mono 等宽，syntax highlight
- **stdout / progress**：mono 等宽，scroll 区域 max 200px
- **result preview**：折叠 raw JSON 链接

### 4.6 Approval Dock + Approval Card

#### Approval Dock（Composer 上方 sticky）

- **仅在有 pending approval 时存在**（不是 hide，是不渲染）
- amber-tint `#F8EDDA` 背景 + 3px 深琥珀左竖条
- 单行：`{count} pending approval · Next: {tool_name}` + Advance button
- **不可 dismiss**（必处理状态必须 surface）
- hover 显示 tooltip 预览
- 决策仍必须在对应的 callout 内做（dock 是 navigator，callout 是 decider）

#### Approval Card（waiting_approval 状态的 inline form）

**不是独立组件**，是 Tool callout 的 waiting_approval 形态。展开后内嵌：

- **风险等级 pill**：high（深红）/ medium（深琥珀）/ low（muted）
- **动作说明**：1 行人话 ("Run shell command" / "Patch file at /path")
- **目标对象 / 工具特定渲染**（见下）
- **为什么需要审批**：1 行 muted 文案
- **四个按钮**（Phosphor icon + label）：
  - Allow once（charcoal primary）
  - Deny（深红 ghost）
  - Always allow in this Project（杏沙 ghost）
  - Always allow globally（杏沙 ghost，high risk 工具如 `start_long_term_update` disabled）

#### 工具特定渲染

##### `file_patch` — split diff 视图（V0.1 必做）

- **V0.1 实现**：自研 PatchView（`diff` npm 包计算 line-level changes + Tailwind 渲染 split layout），无语法高亮
- 数据来源：`args.path` / `args.old_content` / `args.new_content`（GA `file_patch(path, old_content, new_content)` 签名）
- 视觉：
  - Header：path（mono）+ 文件 size delta（`+12 / -3 lines`，13px muted）
  - Split layout（左旧右新）/ 行号显示
  - +/- 行用 success/error 8% tint 背景；空 placeholder 行用 hover-tint 斜纹
  - max-height 480px，超出 scroll
  - 折叠时只显示 header + `View diff`
- 为什么 V0.1 必做：file_patch 是审批高频工具，没 diff 视图等于"审批黑盒"，违反"不要让用户思考"原则
- 为什么不用 `@pierre/diffs`：试过，其 Shiki backend 拉所有语言包进 bundle（+400 KB gzip）。V0.1 审批界面不需要工业级语法高亮，line-level +/- 已足够。`@pierre/diffs` 留 V0.2 候选 —— 真需要 hover/highlight + scoped 语言时再切换

##### `file_write` — 仅 path + mode

- 显示 `path`（mono）+ `mode pill`（overwrite/append/prepend）
- 下方 muted 一行："内容由 LLM 当前回复决定，将写入此文件"
- **不做内容预览**：GA 架构限制（`do_file_write` 跑时才从 `response.content` 提取，dispatch 拦截时还没跑），提前预览需要复刻 GA 逻辑，违反 non-invasive

##### `code_run` — 命令展示

- mono 等宽 + 语言高亮（bash / python / powershell）
- 多行命令完整展示（不截断）
- 顶部 language pill

##### `start_long_term_update` — memory 写入

- 显示 memory key + 内容预览
- high risk 标记，**Always allow globally 选项 disabled**

### 4.7 Inspector（已退役）

右侧 Inspector panel 已在 2026-05-12 退役，不再是当前布局基准。

退役原因不是"暂时没做"，而是信息归宿更清楚了：

| 旧 Inspector 信息 | 当前归宿 |
|---|---|
| Tool raw / args / stdout / result | 对应 Tool callout 内 inline 展开 |
| Pending approvals | Approval Dock + waiting_approval Tool callout |
| Approval 历史与 always-allow 规则 | Settings → Approval |
| Runtime / GA path / Python / LLM displayName | Sidebar runtime dot + Settings → Runtime |
| Message copy / save | Message Actions |

产品判断：右侧常驻面板让 Galley 读起来像 IDE，而不是本地 agent team orchestrator。把信息放回触发它的上下文，用户少一次"去右边找详情"的认知跳转，也释放了 conversation column 的阅读空间。

如果未来需要 Memory Inspector / file inspector，必须重新设计入口与信息架构，不复用旧右栏槽位。

---

## 5. 流程：Onboarding

默认路径是 managed / bundled GA：用户只需要配置模型，不需要理解 GA
checkout、Python、venv、`mykey.py` 或依赖安装。Attach 已有 GA 是次级入口。

### Step 1 — 配置模型

- 标题：`为 Galley 配置模型`
- 副标题：`填入你的模型 API Key 和 Base URL。`
- 字段：
  - `模型服务` segmented control：`OpenAI-compatible` / `Anthropic-compatible`
  - `模型密钥`
  - `Base URL`
  - `模型`
- `自动获取模型列表`：API Key + Base URL 后可点；成功后显示 select。
- 模型信息填写完整后自动测试连接：停止输入约 800ms 后发送最小开销真实模型请求；成功显示延迟，失败保留 HTTP code，并用人话解释 401 / 403 / 404 / 429 / 网络 / 超时等常见原因。
- 失败态提供低权重 `重新测试`，但不把测试作为主流程按钮。
- 主 CTA：`开始使用 Galley`；只有当前 API Key / Base URL / 模型组合测试成功后可点。
- 次级链接：`接入已有的 GenericAgent`，进入 attach flow。
- 成功后进入 Empty state composer，并 focus 输入框。

### Attach Step — Existing GenericAgent

- 路径输入框（mono / 预填 `~/Documents/GenericAgent` / 可改）
- 文件夹选择器按钮（Phosphor `FolderOpen`）
- **实时反馈**（路径变化时立刻校验）：
  - 路径不存在 → 深红 X icon + "路径不存在"
  - 路径存在但找不到 `agentmain.py` → 深琥珀 Warning + "未在此路径找到 agentmain.py，确认这是 GA 安装目录？"
  - 路径合法 → 杏沙 Check + "找到 GA 安装"
- 主 CTA `继续`（路径合法时启用）
- 弱链接 muted 文案："还没装 GenericAgent？→ 在这里安装"（外链 GA GitHub）

### Attach Health Check

跑 5 项检查，**全过才能继续**：

1. 路径存在
2. Python 可用（默认 system Python，可在 Settings 改 BRIDGE_PYTHON）
3. `agentmain.py` 可 import
4. `mykey.py` 存在
5. 至少一个 LLM 配置可解析

**故意决策**：跳过 LLM session dry-run（dry-run 真发 API 请求会消耗 quota）。第一次发 message 时如有问题再报错（详见 §7 Error Card 的首次失败引导）。

UI：嵌入 Health Check Card（详见 §6.1），失败项必须 fix 才能继续，**不允许"以只读模式进入"**（Galley 没 LLM 什么都做不了）。

### 进入主界面

本质是"Onboarding 消失"。用户被带到主界面，看到 Empty state hero composer。

### Settings 里的再次进入

Settings → Runtime → More 提供低调入口 `打开设置向导...`。它复用同一套
Onboarding，从第一屏开始，不清空历史、不删除对话、不重置数据库。打开入口本身
没有副作用；只有用户在步骤里主动修改 Runtime / 模型 / GA 路径并完成，才改变
设置。

有 Agent task 正在运行时，该入口禁用。原因是设置向导可能切换 Runtime 或模型，
不应该在长任务中途改变运行时语义。

从 Settings 进入时，Onboarding 顶部进度条右侧保留低权重 `返回设置` 出口，
贯穿模型、GA 路径、Health Check 步骤；首次安装路径不显示这个出口。底部
action row 只放当前步骤动作，不混入全局退出。

---

## 6. 卡片家族（Health Check / Error）

两个 card 共享同一个视觉骨架：

- `surface-elevated` 背景 + 1px `border-default` + `shadow-card`
- 圆角 12px / 内边距 16px
- 左侧 16px Phosphor thin icon + severity 色

### 6.1 Health Check Card

#### 5 个出场场合

1. Onboarding Step 2
2. Settings → Runtime "Re-run health check"
3. Sidebar runtime dot 处于 `GA 未配置` 时，引导进入 Settings → Runtime
4. 系统检测 GA 异常时主动弹
5. Onboarding 后的后台复检失败 toast（候选）

#### 视觉

- 标题："Health Check" + 总状态 pill（All passed / N failed）
- 5 项目列表，每项一行：
  - 16px Phosphor thin icon + 状态色：
    - pending: muted dot
    - running: `CircleNotch` 杏沙旋转
    - success: `Check` muted 灰
    - failed: `X` 深红
    - warning: `Warning` 深琥珀
    - blocked: `Pause` muted
  - 13px Inter / 项目名
  - 失败项 expand 显示错误简要 + inline action button："打开 GA 安装指南" / "选择其他路径" / "View details"
- 底部："All checks passed" 或 "Fix N issue(s) to continue"

#### 行为差异

- onboarding：失败必须 fix（阻断）
- 其他场合：允许查看 unhealthy，但 Sidebar runtime indicator 显示 unhealthy / unconfigured

### 6.2 Error Card

#### 三种 severity

| Severity | icon | 色 | token |
|---|---|---|---|
| error | `X` | 深红 `#B14545` | `error` |
| warning | `Warning` | 深琥珀 `#BF7A1F` | `warning` |
| info | `Info` | muted 灰蓝 `#7A7A8E` | `info` |

#### 三种出场场合

| Category | 场合 | 形态 |
|---|---|---|
| `runtime` | Tool 执行失败 / LLM 调用失败 / agent 报错 | **Conversation 流内 inline message bubble**（紧跟出错 tool 之后，Tool callout 行保持失败状态） |
| `bridge` | bridge crash / IPC 协议 mismatch | **Top-level toast**（5s auto-dismiss 或手动叉） |
| `business` | Attach 路径非法 / 历史恢复失败 / SQLite 损坏 | **Top-level toast** |

Inline 类**不可 dismiss**（属于对话历史）；toast 类可手动 dismiss。

#### 标准展示

- 标题（14px Inter medium）+ 一行简要（13px muted）
- 主 action button（杏沙轮廓 ghost / 28px / Phosphor icon + label）
- 可折叠 details panel（点 `CaretDown` 展开）：
  - stack trace / 完整 error message / source 字段
  - 等宽 12px JetBrains Mono
  - 给 power user 看的，普通用户不需要看

#### 重试语义

- bridge **不主动 retry**
- desktop 根据 IPC 字段 `retryable=true` 显示 Retry button
- 点击 Retry = 触发新的 send_message（参数复用上次），不是隐藏副作用

#### 首次 message 失败的友好引导（hint 系统）

bridge 端检测错误类型，emit 时附 `hint` 字段，desktop 渲染专用引导卡片：

| hint | 触发条件 | 卡片内容 |
|---|---|---|
| `check_llm_config` | 401/403/`api_key`/`unauthorized` keyword | 标题 "LLM 配置可能有问题" / 一行 "首次发送失败，通常是 API key 或配置问题" / Actions: "检查 mykey.py" / "查看 GA 文档" / "View raw error" |
| `network` | 网络超时 / DNS 失败 | 标题 "网络无法连接" / Actions: "Retry" / "View raw error" |
| `quota_exceeded` | 429 / quota keyword | 标题 "API 配额耗尽" / 一行 "可切换其他 LLM 继续" / Actions: "Switch LLM" (打开 Composer LLM dropdown) / "View raw error" |
| （无 hint） | 其他错误 | 标准 Error Card |

**为什么不直接显示 "401 Unauthorized"**：普通用户看到原始错误不知道下一步。"哪里出错 → 怎么解决"的翻译是 Galley 比裸跑 GA 增值的关键点。

---

## 7. Empty State（无 session 时主区）

主界面没 session 时**不放大段欢迎文案**，**Composer 浮在视口中部**（不在底部正常位置）。提交第一条后切入 conversation。

参考 Claude.ai / ChatGPT / Cursor 标准模式，跟"对话工作台"心智一致。

### 视觉

```
            ┌─────────────────────────────┐
            │ Composer (居中，560px max)   │
            │ [Cube] LLM dropdown │ [+]   │
            │                       [↑]   │
            └─────────────────────────────┘

             这两天有什么有趣的新闻？
             列出 Downloads 里面最大的 10 个文件
             查电影《奥德赛》的最新资讯
             聊聊维特根斯坦与 LLM             ← 4 quick prompts，纵向 quiet hints
```

- Composer 居中（含 LLM 切换器，跟 in-session 对称），placeholder 是 "今天交代什么？"。
- Conversation width toggle 同样影响 Empty State：compact = 560px，wide = 1200px。用户在空状态点击 toggle 必须看到变化，否则像坏了。
- 下方 4 条 quick prompts 用 `font-serif italic text-[12.5px] text-ink-muted`，不是 chip button；它们是定位信号，不抢 Composer 的行动焦点。
- 当前 prompt 组合覆盖 web scan、本地文件、电影资讯、哲学 / LLM reasoning 四种任务形态。
- Sidebar 正常显示 Header / Quick Actions / timeline；Project Review 通过 Quick Action 进入；没有 session 时只出现一句 muted empty hint。
- **不放快捷键 hint 行**（曾尝试在底部加快捷键提示，但稀释了"今天交代什么？"的聚焦感；完整快捷键列表移到 Settings → Shortcuts tab）。

---

## 8. Command Palette（⌘K Overlay）

### 触发与形态

- `⌘K` 开 / `Esc` 或点遮罩关
- **居中 overlay**（不贴顶；居中更聚焦，不遮 Top Bar 状态）
- 宽度 **560px**（不顶天立地）
- 高度自适应，max 420px（约 8 行结果），超出 scroll
- 背景 `surface-elevated` + `shadow-elevated` + 圆角 14px
- 触发后页面其余加 `surface-overlay` 遮罩，**无模糊**（模糊太花）

### 不加 ⌘P 别名

只 `⌘K`，少而精（VS Code/macOS `⌘P` 习惯不引入）。

### 内容范围（V0.1 收敛）

#### Session 类（主轴）

- 最近 8 个 session（按 `lastActiveAt` 倒序）
- 搜索：按 title 模糊匹配（V0.2 加 message 内容全文搜索）
- "New chat" 永远固定在第一项

#### Action 类（少而精）

- Switch LLM → 嵌套二级（展开当前 availableLLMs 列表）
- Re-run health check
- Open settings
- Attach GA folder（仅 onboarding 已完成、想换路径时）

#### 故意排除（V0.1 不做）

- 跨 session 全文搜索
- Theme switcher（V0.1 light-only）
- Quick prompt insertion（empty state 已经有）
- 任何 destructive action（删除 session 之类，Palette 不该让破坏太轻松）

### 视觉细节

- **Input row**：48px 高 / 17px Inter / placeholder italic muted "搜索 session 或输入命令…" / 左侧 16px Phosphor `MagnifyingGlass` thin / 右侧 `Esc` shortcut hint（13px muted）
- **Divider**：1px `border-default`
- **Result row**：36px 高 / 13px Inter / 左侧 16px Phosphor icon / 中间 label / 右侧 keyboard shortcut（如 `⌘N`）灰色 hint
- **Section header**（仅多组结果时）：11px Inter uppercase tracked `RECENT` / `ACTIONS` / `LLMS` —— 大多数情况下不显示 header（结果少时 header 是噪音）
- **Hover / 键盘选中态**：背景 `hover-tint`，左侧 2px charcoal 竖条
- **Empty state**：输入有内容但无匹配 → 中央一行 muted "没找到。Enter 直接发问？" + Enter shortcut（**做** —— 输入框里写的字 Enter 直接 new chat + 把它当第一句 prompt，是对"文档对话工作台"心智的延伸）

### 关键交互

- ↑↓ 选 / Enter 执行 / Tab 进二级（如 Switch LLM 子菜单）
- 输入"#"前缀强制只搜 session（V0.2 留）；输入">"前缀只搜 action（V0.2 留）
- **没有最近搜索历史持久化**（V0.1 简化）

### 排序规则

- Session 类按 lastActiveAt
- Action 类按内置优先级：New chat > Switch LLM > Re-run health check > Open settings > Attach GA folder
- Switch LLM 嵌套二级而不是平铺（避免 LLM 多时淹没 session）

---

## 9. Settings（modal overlay）

### 形态决策

当前实现是 **Radix Dialog modal overlay**，720 × 560px，左侧 tab list + 右侧内容区。独立 settings window 是历史方向，已从当前基准移出。

理由：

- Tauri 多窗口需要第二 React entry + WebviewWindow 生命周期，成本不应压过 v0.2 beta 的核心任务。
- 当前 settings 多数是即时保存的低频配置，modal 的短暂停留成本可接受。
- 用固定 overlay frame 先统一 Settings 内部信息架构，未来若升级为独立窗口，tab/content API 可以保留。

### 规格

- **720 × 560px / centered modal / `bg-overlay` scrim**
- 左侧 180px Tab list（垂直），右侧主内容区
- 右上角 28px close icon，Esc 可关闭
- 触发：主窗口 ⌘, / Sidebar runtime unconfigured / Command Palette "Open settings" / TopBar Gear
- 内容区 `px-8 py-7`，可滚动；Tab list 固定

### 语言与 Tabs

- 语言选项不为当前 Settings 单独新增 `General` tab。现阶段放在左侧 tab
  list 底部，作为轻量全局偏好。
- 选项为 `Auto / 跟随系统`、`中文`、`English`；默认 `Auto / 跟随系统`。
- 首次启动没有保存偏好时，根据 OS / WebView language preference 推断：
  `zh-*` 显示中文，其余显示 English。不要根据 IP、地区或时区判断。
- 用户显式选择 `中文` 或 `English` 后持久化；之后不再跟随系统语言变化，
  除非用户切回 `Auto / 跟随系统`。
- 中文 UI 的左侧 tab 使用英文主标签 + 小号中文辅助标签；英文 UI 只显示
  英文标签。

```text
Runtime      / 运行环境
Models       / 模型
Approval     / 审批
Agent        / 智能体接入
Shortcuts    / 快捷键
About        / 关于
```

视觉上不要真的使用斜杠；主标签和辅助标签上下两行显示。辅助标签
只做注释，不与英文主标签同权重：英文约 14px medium，中文约 10.5px
normal muted，两行之间保留明确间距。即使 tab 处于 active 状态，中文也
不要抬到主标签权重。该双层标签只用于 Settings 左侧导航，正文不做大面积
双语。

### 当前 Tabs

#### Runtime

- **GA path**：当前路径显示（mono）+ 重选按钮（触发文件夹选择器）
  - 改动后弹 confirm dialog："路径改动需要重启 Galley 才能生效。立即重启？/ 稍后"（不悄悄 kill 所有 session）
- **Bridge Python**：当前 interpreter 路径显示 + 重选 + muted hint "用于运行 bridge，影响 GA 子进程"
- **Re-run health check**：button → 弹 Health Check Card 重跑
- Bundled Python / external Python mode 在这里切换；默认 bundled，external 是高级路径。
- 底部显示 GenericAgent 版本 / Galley 版本。

#### Models

- Managed / bundled GA 的模型配置入口；attach mode 不读取这里。
- 支持添加多个模型：`OpenAI-compatible` / `Anthropic-compatible`、API Key、Base URL、模型名、可选显示名。
- 页面分为主视图和维护区：
  - `当前配置模型` 是主视图，显示 Galley 当前会使用的模型队列、默认模型和排序。
  - `当前配置模型` 行 hover / focus 只做轻底色和排序箭头显性化，提示可操作但不做抬升、缩放或阴影。
  - `已接入的模型提供商` 是维护区，默认折叠；Provider 摘要压成单行，长名称截断，不撑高卡片；协议类型放在模型数量之后，用低权重 badge 显示，避免和 Provider 名称连读。
  - Provider 展开后才显示模型测试、自动获取列表、手动添加、编辑和删除等维护操作。
- Provider 检查成功态使用低权重 inline 文本，不长期占用绿色块；失败态保留说明块并贴近对应 Provider。
- Provider 内的默认模型在右侧操作区显示轻量 `默认模型` 状态；非默认模型才显示 `设为默认` 动作。
- API Key 字段只用于保存到系统 credential store；列表和诊断只显示 `apiKeyRef` 对应状态，不显示密钥。
- 第一版保留为 Settings 高级入口；first-run onboarding 会复用同一套能力，但不暴露高级参数。

#### Approval

- **YOLO mode toggle**（PRD §11.5）—— Tab 顶部第一项，跟下方常规设置之间留 32px gap + 一条 `border-line` 分隔线，视觉上独立成块（不被埋没在普通 toggle 列表里）
  - Toggle 行：左 18px Phosphor `Lightning` thin（深琥珀 `--color-warning`）+ "YOLO 模式" Newsreader medium 14px + 右侧 Switch
  - Toggle 下方一行 muted 12px："跳过所有工具调用的审批，直接执行——适合完全信任 Agent + 沙盒环境"
  - 当前已开启状态：Switch 杏沙激活 + 行底部一段 13px 文案"YOLO 已启用 · 顶部栏显示状态" + secondary button "立即关闭"
  - 关闭 → 开启触发 confirm modal（见下）；开启 → 关闭直接生效，无 confirm
- **需要审批的工具**：复选列表（默认 `code_run` / `file_write` / `file_patch` / `start_long_term_update`），用户可勾选；YOLO 开启时整个 section 显示 `opacity-50` + tooltip "YOLO 已开启，单项工具审批不生效"，但**不禁用**——用户关 YOLO 后仍生效
- **白名单规则**：分两组显示
  - **Per-project**（当前 attached GA 目录下的）—— 列出 tool name + 添加日期 + remove 按钮
  - **Global** —— 同上
  - YOLO 开启时同样 dimmed
- 改动后弹 toast "已应用到所有 session"（避免"太隐式"）
- 底部 muted hint："在审批弹窗里加入白名单后，规则会显示在这里。"

##### YOLO 启用 confirm modal

Radix Dialog，~480 × 360。文案（中文）：

```
打开 YOLO 模式？

YOLO = "You Only Live Once"。
所有工具调用将不经审批直接执行——包括：

  · file_patch（修改文件）
  · file_write（写入文件）
  · code_run（执行命令）
  · 其他高风险操作

适合：完全信任 Agent + 在沙盒环境工作（个人 repo / 临时虚拟机）
不适合：生产代码 / 共享系统 / 不熟悉的 Agent / 敏感数据

打开后顶部栏会显示闪电图标和 YOLO 标识，随时可一键关闭。

  [取消]  [是的，我知道在做什么]
```

视觉细节：

- 标题左侧用 Phosphor `Lightning` + "打开 YOLO 模式？" Newsreader medium 18px
- 主体 13px Inter，bullet 列表用 mono `·` 锚点
- "是的，我知道在做什么" 按钮：深琥珀 `bg-warning` 背景 + 白色文字（不是品牌杏沙——视觉上要显眼但不像"OK"那种条件反射按钮）
- "取消"：ghost button 默认 focus，回车默认是取消（避免误触确认）
- ESC 关闭 = 取消

#### About

- App icon + `Galley` 标题（Newsreader medium 18px）
- 版本号 / GA baseline commit / build date
- Links（Phosphor `ArrowSquareOut`）：GitHub / Documentation / Report issue（外链浏览器）
- License：MIT
- 一行 `Made by JCONE · Open source`

#### Agent

- Copy Supervisor SOP：复制 Galley Agent SOP，不写入 GenericAgent memory。
- CLI install / path 指引：帮助可信 Agent 找到 `galley` CLI。
- Agent API reference：链接到 `docs/agent-api.md`，强调 `schemaVersion: 1`。

#### Shortcuts（read-only）

- 三个 group：Navigation / Composer / Overlays。
- 每行：左侧 kbd chip（`bg-surface` + `border-line` + mono）+ action label + 可选 note。
- 当前只展示，不提供自定义；重绑入口留到未来版本。

### 视觉

- **Tab list**：每项 32px 高 / 13px Inter / 左侧 16px Phosphor icon
  - Runtime: `Cpu`
  - Approval: `ShieldCheck`
  - Agent: `PlugsConnected`
  - Shortcuts: `Keyboard`
  - About: `Info`
- 选中态：`hover-tint` 背景 + 左侧 2px charcoal 竖条
- **主内容区**：内边距 32px / 标题 18px Newsreader medium / 描述 13px Inter muted / 控件之间 24px 垂直间距
- **Form 控件**：路径 input + 文件夹选择器按钮（Phosphor `FolderOpen`）/ 复选框跟 Approval Dock 同款 / Button 体系跟主界面一致
- **没有 sticky save button**：所有改动**即时生效 + 自动持久化**（违反"不要让用户思考"），破坏性改动单独 confirm dialog

### 推到未来版本的 Tab

- **General / Preferences**（theme / telemetry / launch behavior 等）—— 只有当全局偏好超过左侧轻量入口承载范围时再新增；语言当前不单独触发这个 tab。
- **LLM**（custom displayName / default index）—— per-app preference 已够，custom name V0.2
- **Data**（SQLite 位置 / export / clear history）—— V0.1 不做高危数据 UI
- **Developer**（Logs / IPC trace）—— V0.1 用 stderr 调试

---

## 10. 全局快捷键

| 键位 | 动作 |
|---|---|
| `⌘K` | 命令面板 |
| `⌘N` | 新对话 |
| `⌘ + ,` | 打开设置 |
| `Esc` | 关闭浮层 / 退出编辑状态 |
| `Enter` | 输入框发送 / 命令面板执行 |
| `Shift + Enter` | 输入框换行 |
| `↑ / ↓` | 命令面板选项 |
| `Tab` | 命令面板进二级 |
| `⌥↑ / ⌥↓` | 跳到对话中上 / 下一条用户提问（焦点在 Composer 时不生效） |

---

## 11. 已知未决与扩展方向

### 当前 beta 范围内 open

- **Settings 是否升级为独立窗口**：当前 modal 够用；只有当用户需要边看 session 边改设置的频率被 dogfood 证实时再升级。
- **Composer LLM dropdown 在 long LLM list 下的 UX**：V0.1 不做特殊处理，超过 8 个加 scroll
- **Onboarding 走完后下次启动是否每次跑 Health Check**：建议**后台**重新跑（不阻塞 UI），失败时弹 toast；V0.2 desktop 阶段验证
- **按钮与图标 primitive 收口**：当前仍存在 raw button / raw glyph drift，需要分阶段收。
- **暖色 token 的层级校准**：当前底色一致性足够，但 brand / selected / hover / warning 的使用边界还需要更明确，避免全局一片杏沙。

### 推到未来版本的设计扩展

- **Dark mode**：light-first token 已预留命名空间（`surface-dark` 系列待补）
- **`file_write` 内容预览**：依赖 GA 上游把 `extract_robust_content` 前置到 dispatch，可以是给 GA 的 PR
- **Slash commands** in Composer（`/restore` `/new` 等）
- **Cross-session 全文搜索**（Command Palette `#` prefix）
- **Custom LLM displayName**（Settings → LLM tab）
- **拖拽 session 到 Project**（V0.1 用右键 + `...`）
- **Trees / file explorer**（如果 V0.2+ 加 file inspector，候选 [trees.software](https://trees.software) + [@pierre/diffs](https://diffs.com) 配套）

---

## 12. 与 Notion 历史稿的关系

- v0.1 完整版（dark-first / Linear 风）保留在 Notion 作为历史对照（page id `3552aab6e913815f91a1c2b8b0a15672`）
- 当前权威版本在本仓库 `docs/DESIGN.md` + devlog
- Notion 不再作为当前实现 spec 的同步源；避免同一设计基准出现两个真源

完整决策叙事见 `docs/devlog/`：

- `2026-05-07-design-direction-pivot.md` — Notion + Claude 转向，9 块基础对齐
- `2026-05-08-onboarding-and-llm-switching.md` — Onboarding / Empty / Health Check / LLM 切换
- `2026-05-08-design-trio-finale.md` — Error Card / Command Palette / Settings + file_patch diff
