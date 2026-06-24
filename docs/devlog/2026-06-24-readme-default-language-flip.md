# README 默认语言翻转 · 英文设为 default

- **Date**: 2026-06-24
- **Status**: completed
- **Related**: [2026-05-20 disk cleanup + repo hygiene](./2026-05-20-disk-cleanup-and-repo-hygiene.md)（双语策略首次记录并 defer）· `README.md` / `README.zh-CN.md`

## Context

JC 正在找 Agent 开发相关工作，README 不只是 Galley 的产品主页，也是独立开发者能力的作品集主页，要给 HR / 猎头看。借一轮 README 打磨，顺带把 2026-05-20 devlog 里推迟的「双语默认翻转」做掉。

真实读者是**分层**的：HR / 猎头是前 30 秒的门卫（看视觉与完成度，不读术语），技术面试官是深读的评委（看工程判断）。本轮按这个分层重排 README，并定下默认语言。

## Decisions

### 默认语言：英文设为 default

- `README_en.md` → `README.md`（默认渲染 = 英文）；原中文 `README.md` → `README.zh-CN.md`；各自顶部一键互链。
- 理由一：开源约定。`README.md` 默认英文 = 面向全球开发者社区；中文 default 会被读成「国内项目」。作品集要前一种信号。
- 理由二：摩擦的不对称。GitHub 永远只渲染 `README.md`，裸仓库链接（搜索来的、直接敲 URL 的）应服务最不能容忍摩擦的读者——国际 hiring manager 落在中文页上刺眼且易误判定位；国内读者落在英文页完全正常，点一下「中文」无负担。
- 中文文件名用 `README.zh-CN.md`（国际仓库最通行写法）；`README_en.md` 消失后无需再迁就下划线风格。
- 仓库内其余指向 `README.md` 的引用无需改（文件名未变，仅内容语言变）。

### 同轮 README 打磨（中英同步）

- 删第一屏 5 个彩色功能 badge（对工程师是营销味、对 HR 是不认识的词，纯视觉噪声）；保留真实状态 badge（版本 / 平台 / License / Stars）。
- 副标题第二行去掉 `CLI` / `session` 术语，补「所有数据都留在本地」这一 HR 可读的本地 / 隐私信号。
- `Architecture` 节 3 条 bullet 折叠进一句 intro；ASCII 架构图收进 `<details>`——让 `Under the Hood`（最值钱的工程判断段落）独占深度表达，消除两节重复。
- 删 Screenshots 下「部分截图来自早期版本」备注：截图有代表性时无需为不存在的问题道歉，标具体旧版本号反而请读者算出「差了 12 个小版本」。

## Rejected alternatives

- **中英合并到单文件**（英文在前 / 中文在后 / 顶部锚点跳转）：否。文件翻倍臃肿，作品集减分；锚点 UX 弱（中文读者仍要滚过整篇英文）；违反双语仓库「独立文件 + 顶部互链」的通行约定；破坏「一边定稿再同步另一边」的工作流。
- **保持中文 default**：否。国际岗优先级 + 上述摩擦不对称。
- **截图备注改标 v0.1.0 版本号**：否。具体版本号让读者做减法算出 staleness，比模糊更糟；有代表性就不带歉意直接展示。

## Open questions

- scope-at-a-glance（一行规模信号：跨 3 平台 / N 条命令冻结 API / 全文搜索）本轮 defer，待定。
- 截图是否重拍当前 v0.2.12 版本（JC 认为界面变化不大，暂不动）。
- 英文版完整 proofread（本轮只做了结构同步，未逐句润色）。
