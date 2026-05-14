# 2026-05-15 · Onboarding & empty-state polish · YOLO default · button system · v0.1 Mac-only 决策

**Date**: 2026-05-15
**Status**: 代码层完成；Windows prep 推到下次 session
**Related**: PRD §6.1 #4 / §11.5 / [Conversation marathon devlog](2026-05-14-conversation-streaming-and-btw-marathon.md) / commits [72ce4d3](https://github.com/wangjc683/galley/commit/72ce4d3) [143f44c](https://github.com/wangjc683/galley/commit/143f44c)

## Context

接 2026-05-14 conversation 改完后的延续。今天一整天围绕**用户第一次接触 Galley 的几个屏面**做系统打磨：

- 长任务多步骤 conversation 的步骤显示（前一日延续，preamble + ticker + tool pill 双区）
- Onboarding 三步流程的失败路径（接入 GA / 健康检查每一项失败时 → 提供针对性教程）
- Empty State 第一印象（heading / placeholder / 底部 chip 重塑）
- YOLO mode 默认值 + 首次声明对话框
- 按钮风格全代码库 audit + 部分系统化

收尾时讨论了 v0.1 Mac-only 释放 + v0.2 Win+Mac 的双平台路径。**没启动 Windows prep 工作**，留到下次 session。

## Decisions

### 1. Conversation 步骤渲染（午前 commit 72ce4d3）

讨论起点：长任务 12 步任务中，每步只显示 `第 N 步 · summary` + 一个秃头 `web_execute_js ▾` pill，跟 GA 官方 streamlit 前端可展开看「整轮 LLM 输出」比起来信息量过少。

- **TurnMarker 整行可点击 + 条件 chevron**：当 step 有 `<thinking>` 或「当前阶段：...」前言时，行尾出现 CaretDown，整行 hover→cursor-pointer。展开 inline DetailPanel（无 callout chrome，italic ink-soft serif）。settled state 才有这个 affordance；in-flight thinking 占位符不变
- **TurnTicker 流式**：streaming 中 TurnMarker 下面显示当前段落的最新一句前言，`line-clamp-3 + overflow-hidden` 防爆，turn_end 时消失。读起来像"股票快讯"，给用户实时的过程感
- **InlineToolPill 双区**：左侧 `[Phosphor icon] 中文名 · arg preview`（user-facing prose register），右侧 `mono GA tool name + chevron`（audit metadata）。`TOOL_META` 表覆盖 GA 8 个 user-facing tools（web_scan / web_execute_js / file_read / file_write / file_patch / code_run / update_working_checkpoint / start_long_term_update）。`web_execute_js` 显式无 arg preview（JS 代码作为 preview 信息密度太低）
- **数据层**：新加 `messages.preamble` migration 005 + AgentTurn.preamble 字段。`extractPreamble(text)` 反向抽取：strip 所有结构化 tag（thinking/summary/tool_use/file_content）+ 已知 frontend marker，剩下的自然语言文本就是 preamble。这样不管 LLM 用 `当前阶段：...` 还是 `因为 X 所以 Y` 自由文本写推演都能捕获
- **isFinalTurn 防护**：`tools.length === 0 || tools.every(t => t.name === 'no_tool')` 的 turn 不抽 preamble（避免 final answer 内容双重渲染）

实现路径教训：第一版正则 `/^\*{0,2}当前阶段\*{0,2}\s*[：:]/` 太窄，GPT 5.5 这类 terse 模型把所有内容塞 `<summary>` 里就匹不上。改成"strip-tags 反向抽取"鲁棒。

### 2. Onboarding 教程系统

讨论起点：用户失败时（路径不存在 / agentmain.py 缺失 / mykey.py 没配）只看到一行红字，没有 next step 指引。Datawhale Hello GA 教程（PDF + GitHub markdown）质量很高，可以作为权威 fallback。

- **`lib/onboarding-tutorials.ts`** 注册 5 个手写 fix-it 片段（50-150 字）：
  - `download-ga` · 路径不存在
  - `wrong-directory` · 路径在但缺 agentmain.py
  - `mykey-setup` · mykey.py 未配置（warning 升级到可操作）
  - `assets-missing` · GA 安装不完整
  - `memory-info` · memory/ 自动创建说明（reassurance，无外链）

  每条都带 `upstreamUrl` 指向 Datawhale Hello GA 对应章节（GitHub anchor 不可靠所以只链 chapter top）

- **`TutorialModal.tsx`** Radix Dialog 包装，复用 MarkdownView `agent` variant（fenced code block 自然渲染）。Sticky header + sticky footer + body 中间滚动
- **`HealthCheckCard.tsx`** `showActions` 从 `failed` 扩到 `failed || warning`。mykey.py 缺失是 .gitignored 的 warning，但是最 actionable 的 fix-it 入口，必须显示按钮
- **`StepHealth.tsx`** 加「重新检查」按钮（只在 `settled && !allPassed` 时显示），驱动 `healthRunNonce` 重跑 useEffect，让用户外部修完文件能原地刷新而非 Back → Continue
- **`StepAttach.tsx`** validation 失败状态显示「查看教程：下载 GA / 选对目录」上下文按钮；OK / 空状态保留原静态「前往安装」链接

  顺手统一中文：StepAttach 大标题「Attach 已安装的 GenericAgent」→「接入已经安装的 GenericAgent」 + Top progress dot「Attach GA」→「接入 GA」，跟后续 welcome 卡片「接入」字面对齐

### 3. Welcome 双卡片入口

讨论起点：原 Welcome 是大标题 + 3 条 feature bullet + 「开始」按钮 + footer trust 文案，平铺直叙不够产品姿态。

- **删**：3 条 bullet（多对话并行 / 审批 / 历史）+ 底部 footer trust 文案 + 「开始」按钮
- **加**：两个 ModeCard
  - Mode 1（灰）：「帮我安装 GenericAgent · 敬请期待」（disabled + Prohibit icon）—— 未来路径显式占位，v0.1 不实现
  - Mode 2（active）：「接入已经安装的 GenericAgent · Galley 不会修改你的 GenericAgent。删除 Galley 后 GenericAgent 仍可独立运行。」—— 原 footer trust 文案搬进卡片 body，因为这句话是 Attach 路径的 value prop，不是 app 全局事实
- 卡片整张可点击，无需「继续」按钮——一次点击 = 决策 + 跳转
- 标题保持 sentence-case `Galley`（per CLAUDE.md brand wordmark rule：large hero 用 sentence case 软语气，small wordmark 才用 GALLEY uppercase logotype）
- 副标题「GenericAgent 的本地桌面工作台」（去句号）跟 SettingsAbout 同步对齐

### 4. Empty State 重塑

讨论起点：原本「你想做什么？」标题 + 4 个 chip 按钮（翻译 / 整理会议笔记 / 论文查询 / 写脚本），泛而无品味，且 chip 视觉权重高在抢 Composer 的戏。

- **删大标题**：Composer 是英雄，标题没必要。Placeholder 升级承担「邀请」功能：「今天交代什么？」（"交代"是中文里专门用于"上级派任务给下级"的动词，比通用 Q&A 框架的「想做什么？」更契合 agent 产品）
- **4 个 chip → 4 行 prose 提示**：italic serif 12.5px ink-muted 居中，无 border 无 bg 无 icon，hover 只变 `text-ink`。视觉权重从「按钮 chip」降到「ambient hint」，让 Composer 绝对主角，提示当 positioning statement
- **新文案**（JC 微调）：
  - 这两天有什么有趣的新闻？（web research）
  - 列出 Downloads 里面最大的 10 个文件（local file ops）
  - 查电影《奥德赛》的最新资讯（multi-source web）
  - 聊聊维特根斯坦与 LLM（pure reasoning，无工具）

  4 个 prompt 跨 4 个任务形态：网络多源 / 本地文件 / 多源验证 / 纯对话推理，是产品定位声明

### 5. LLM display name heuristic

讨论起点：JC 注意到 Composer pill 显示「GPT 5.5」跟 mykey.py 里他写的 name 字段不一致。

- Bridge `_simplify_llm_name(raw, model=None)` 加 heuristic：
  - `if model and name != model: return name`（用户起了独立名 → 原样返回，保留大小写和分隔符）
  - 否则 fall through 到 prettify 路径（`NativeOAISession/gpt-5.5` → `GPT 5.5`）
  - 空字符串 model 视为缺失（防御性）
- 新加 `_safe_get_model(client)` defensive helper（处理 MixinSession 没 `.model` / BADCONFIG dict 没 `.backend` 等场景）
- `_collect_available_llms` + `_handle_set_llm` 两个 displayName 计算点都传 model
- 8 个新 heuristic-coverage 测试（bridge 共 98 → 106 全过）

### 6. YOLO 默认 ON + 首次声明 modal

讨论起点：JC 提出「GA 的设计哲学就是没有审批，我们第一批用户是 GA 重度用户，YOLO 应该默认开」。但 PRD §6.1 #4 把审批写进了 Galley value-add，全静默默认 ON 等于把审批降级成「opt-in 功能」。

- **决策**：v0.1 YOLO 默认 ON，但**第一次进 MainView 强制弹声明 modal**，让用户知道当前状态 + 提供「改回审批模式」一键退出
- **不放 Onboarding**：approval 是抽象概念，新用户没见过 agent 跑就让他选 Y/N 是无效决策。也会 bloat onboarding 步数
- **阻塞式 modal 不是 banner**：banner 太软会被忽略；YOLO 是安全状态披露，值一次 explicit acknowledgment。ESC / 点遮罩 / 点 X 都禁用，必须点两个 CTA 之一
- **`yoloIntroSeen` pref**：默认 `true`（不显示）；只有「`yolo_mode` pref 也从未设过」的真新用户才在 hydration 后翻成 `false` 显示 modal。现有 dogfood 用户（JC 已经设过 yolo_mode pref）跳过 dialog——避免「title 说默认 ON 但你的实际状态是 OFF」的尴尬
- 实现：`acknowledgeYoloIntro(revertToApproval?)` action 处理两路径 + 持久化。App.tsx 渲染 dialog；onboarding takeover early-return 保证只在 post-onboarding 显示

### 7. 按钮系统统一

Audit 通过 Explore agent 跑了一遍，发现 4 个系统问题：

- Primary CTA 颜色二分裂：`bg-ink`（Onboarding）vs `bg-brand-strong`（Project 系 dialog），无规则
- Primary 尺寸差 25-40%：`px-5 py-2` / `px-4 py-1.5` / `px-3.5 py-1.5` 三种
- Secondary 文字色三分裂：`text-ink` / `text-ink-soft` / `text-brand-strong`
- Disabled hover 行为不一致

**A 路径（轻量）落地**：

- **`components/ui/button.tsx`** 新 Button 组件，5 个 variant（primary / secondary / ghost / destructive / destructive-soft）× 3 个 size（sm / md / lg）。详细 JSDoc 作为系统规约
- **Primary canonical color 选 `bg-ink`**：克制、跟"文人 workbench"气质一致；JC 觉得 brand-strong 过于强调品牌色，过于 marketing 感
- **不强制全代码库迁移**：只改最显眼的 4 个 primary site（CreateProjectDialog / EditProjectDialog / Sidebar empty-project CTA / YoloIntroDialog），其余在自然 touch 时迁移
- **副产品**：EditProjectDialog「删除项目」入口顺便迁成 `variant="destructive-soft" size="sm"`，跟 ConfirmDeleteProjectDialog 的 `variant="destructive"` 形成「软入口 → 硬确认」两级语义

### 8. v0.1 Mac-only release 决策（收尾讨论）

- v0.1 ship Mac-only（`.app` + `.dmg`），release notes 写明
- v0.2 plan：dual Mac + Windows via GitHub Actions CI build NSIS `.exe` + `.dmg`
- 不走 Mac-side cross-compile（Tauri 不官方支持，碎玻璃路径）
- 不走 VM-only 长期维护（一次性可，持续不行）
- Windows 机器借机 1-2 晚做 dry-run，目标 = 产物 + bug list，不是 ship
- 已识别 Mac-side prep work 6 项（NSIS bundle / Python OS-aware default / OS-conditional 教程命令 / 键盘 mod-key 抽象 / joinPath / Windows checklist），全部必须 Mac-backward-compatible

## Rejected alternatives

- **TurnMarker 整行自动展开当前步**（JC 提的"过程感最强"方向）：12 步任务每步开始就展开、结束就折回，24 次自动 reflow 视觉很跳，用户眼睛被牵着走反而难安心扫读 summary 时间线。改方案：保持默认折叠 + 增加 streaming TurnTicker 单独承担"过程实时可见"
- **`<thinking>` 单独 callout vs 并入 DetailPanel**：原本 ThinkingSummary 是独立 bordered 块；新设计并入 DetailPanel 跟 preamble 同源。理由：thinking 在 Galley 罕见出现（多数 LLM 不主动写），分两层暴露反而增加视觉层数
- **第一性原理删 4 个 chip**：JC 提出「直接删掉，让 Composer 当唯一主角」。否决——Empty State 是产品门面，删完后用户坐下看空白 Composer 容易输入单轮 Q&A，错过 Galley 的多步骤定位声明。改方向：视觉权重大幅降级，保留作为 positioning statement
- **Onboarding 加 YOLO 偏好选择步**：让用户在 onboarding 第 4 步选「要 / 不要审批」。否决——approval 是抽象概念，新用户没见过 agent 运行就要选偏好是无效决策；onboarding 角色是装起来，不夹带偏好设置
- **YOLO 声明走 banner 而非阻塞 modal**：banner 太软容易被忽略，YOLO 是安全状态披露值得一次 explicit 停顿
- **按钮全代码库迁移（B 重型路径）**：~15-20 文件改动，半天-一天工作量，回归风险中等。v0.1 dogfood 阶段目标是「用户感觉一致」不是「代码 perfect」。改 4 个最刺眼的就解决 70% 视觉违和（per audit 数据）
- **Primary 用 `bg-brand-strong`**：杏色品牌色拉满，但偏 marketing 感。bg-ink 跟产品克制、文人 workbench 气质一致
- **EmptyState chip 用 prefill 模板**（点击填 placeholder，等用户补语境）：会让新用户面对半完整 prompt 不知道怎么补；完整可跑 demo 直接揭示"按一下真的开始干活"的 wow moment 更有价值
- **Mac-side prep 路径用 `joinPath` 改 Tauri path API**：`/` 在 Windows 大部分 fs API 也工作，强行替换 introduce 不必要 churn。降级为「nice to have」
- **借 Windows 机器今晚通宵 build**：JC 自己决定先收工，节奏不被「机器借期」绑架。健康节奏

## Open questions

- **Windows prep 何时启动**：取决于 JC 借 Windows 机器的实际时间；约 3 小时 Mac-side prep 工作可以独立于机器先做
- **键盘快捷键 audit 精细度**：mod-key 抽象方向已定，但当前代码里 `event.metaKey` 调用点没系统化盘点，第一次跑要先 grep + list 出所有触发点
- **教程片段 OS-conditional 渲染机制**：用 `navigator.platform` runtime 检测 vs Tauri `os.platform()` async API？前者 sync 简单，后者 official。倾向前者
- **CI workflow 文件落地时机**：JC 没有 Windows 机器持续运转，CI 是 Windows build 的最终路径。可以在 Mac-side prep 之前就先写 workflow YAML（仅 macos runner），后续 add Windows matrix entry。或者等机器验证完一次后再补 CI
- **destructive-soft variant 推广面**：今天只用在 EditProjectDialog 删除项目入口。ConfirmDeleteProjectDialog destructive 入口、ArchivedDialog 删除入口都可以归类——但 audit 时发现已经视觉对，没必要为统一而统一
- **PRD §11.5 YOLO 默认值条款是否更新**：今天把默认从 OFF 翻到 ON 是产品级决策，PRD 应该对齐。Defer 到下次 session

## Next

- 下次 session 启动 Mac-side prep 6 项工作（约 3 小时）
- 等 JC 借到 Windows 机器后单晚 dry-run，目标：build artifact + bug list + 截图
- 根据 Windows 验证结果决定 v0.2 release notes / CI workflow 时间表
- 把今日 YOLO 默认 ON 决策同步进 PRD §11.5
- /rewind 4-commit 计划（前一日留下）继续待启动
