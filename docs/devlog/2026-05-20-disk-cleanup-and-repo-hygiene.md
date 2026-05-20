# Disk cleanup + repo hygiene pass

- **Date**: 2026-05-20
- **Status**: completed
- **Related**: CLAUDE.md (line 492 handoff 引用) · .gitignore · [2026-05-13 UI copy i18n + brand sweep devlog](./2026-05-13-ui-copy-i18n-and-brand-sweep.md)（line 147 当时决定保留 handoff 目录名）

## Context

JC 报项目硬盘占用太多排查。`du -sh` 32G —— 跟 git checkout 出的源码体量完全不匹配。同时引出第二个话题：Galley 作为开源项目要"专业 / 优雅 / 简洁"，repo 上应该 push 什么、现状哪些不对。

两件事 session 内一并办：(a) 清磁盘，(b) repo hygiene 评估 + 局部执行。

## Decisions

### 磁盘清理（32G → 122M）

全部都是 build artifact + 工具缓存，无源码风险：

- `cargo clean --manifest-path core/Cargo.toml` 释放 25.0 GiB（cargo 自报）—— 主 workspace target/，debug 14G + release 1.2G
- `rm -rf core/experiments/tray-mode/target` 释放 ~16G —— B4 M2 tray-mode spike 独立 Cargo workspace 编译产物
- `rm -rf gui/node_modules .venv core/python-bundle .cache .mypy_cache .pytest_cache .ruff_cache` 释放 ~530M —— 工具缓存 + 内嵌 Python bundle（`scripts/bundle-python.sh` 可重生成）+ PBS tarball 下载缓存

第一次 `rm -rf core/experiments/tray-mode/target` 失败：`out/` 目录里有 `.DS_Store`（Finder 元数据带 `com.apple.FinderInfo` 扩展属性 + Finder 窗口可能在监视），第二次重试成功。**记给未来：B4 M2 重启迭代时如果再撞 `Directory not empty`，先 close Finder 窗口或 `find ... -name .DS_Store -delete` 前置**。

### Repo hygiene 三类问题 + 执行

评估时把"应该 push 什么"分成四类，session 内执行了前三类（A + B + C），第四类（开源标配文档）留下次：

**A. 本地 working dir 污染（.gitignore 已救但物理目录还在）** —— 全删:
- `node_modules/`（root, 10M, pnpm 工作区残留只有 `@radix-ui` 一个包）
- `ga_workbench_bridge.egg-info/`（20K, **项目旧名 GA Workbench 时代** `pip install -e .` 副产物）
- 10 处 `.DS_Store`

**B. Untracked 大文件**（参考资料不该入 git）—— 挪到 `~/Documents/galley-refs/`:
- `docs/GenericAgent2604.17091v1.pdf` 3.1M — arxiv 论文（编号 2604.17091）
- `docs/hello-generic-agent.pdf` 16M — 来源不明的大 PDF
- `docs/galley_icon_v2.png` 2.2M — 命名带 `_v2` 不专业，user 没说要替换 v1，先按参考材料挪走

**C. 命名一致性问题** —— rename:
- `docs/GenericAgent Workbench-handoff/` → `docs/design-handoff/`
  - 目录名带**空格** + **项目旧名**双重问题，专业开源项目里基本是禁忌
  - `git mv` 保留 15 个 history rename detection
  - CLAUDE.md:492 同步更新（加注释说"在 rebrand 后从 GenericAgent Workbench-handoff/ rename"）
  - `.gitignore` 中 `docs/GenericAgent Workbench-handoff/project/uploads/` 同步改成新路径（这条 ignore 是为了排除 design agent 受到的 CLAUDE.md/PRD/DESIGN 输入副本不重复入库）

### Devlog 不回写历史

[2026-05-13 UI copy devlog](./2026-05-13-ui-copy-i18n-and-brand-sweep.md) line 147 当时记录的决策是「rebrand 前的 design handoff 文物，目录名 + 内部 README 都是『彼时彼刻』的快照」—— **故意保留**那一行旧路径不改。devlog 是历史决策快照，回写会篡改 decision provenance 的诚实性。今天反转那个决策，应该写新 entry（即本文）而不是回去改旧的。这条今天确立为 devlog workflow 的隐含规则。

## Rejected alternatives

- **删 `docs/galley_icon.png` v1**：现在 README 没引用（grep 已确认），看起来是孤儿，但 user 没明确要删；保守保留，孤儿状态先 flag 不动手
- **删整个 `docs/design-handoff/`**：是 design agent prototype handoff bundle，CLAUDE.md 还在引用作为视觉参考；命名修了就行，内容不动
- **`rm -rf core/experiments/tray-mode` 整体清掉**：tray-mode spike 在 WIP commit `016d055`，源码可能还有用，只清 target/ 不动源码
- **批量 commit user 的 WIP 改动**：`git status` 显示 3 个 `M`（`manager.rs` / `runtime.ts` / `sessions.ts`）不是本 session 改的，user 自己的 in-progress 不能擅自 stage
- **同 commit 起草 CONTRIBUTING / SECURITY / issue template**：D 类（开源标配文档）评估列了但 user 选 A+B+C，留下次

## Open questions

- **D 类（开源标配文档）何时启动**：CONTRIBUTING.md（高）/ SECURITY.md（中）/ .github/ISSUE_TEMPLATE/（中）/ PULL_REQUEST_TEMPLATE.md（低）/ CODE_OF_CONDUCT.md（低）。CHANGELOG.md 评估为**不必加**——GitHub Releases 已经在顶，单一来源更省事
- **`docs/galley_icon.png` 孤儿命运**：v1 在 repo 但没人引用，v2 已被挪走。后续要不要在 PRD/DESIGN/SettingsAbout 引用一张？还是直接删掉？
- **README 双语策略**：现在 README.md 是中文 default，README_en.md 副本；GitHub 默认渲染 `.md`，国际访客看到中文。可考虑反过来（README.md = 英文，README.zh.md = 中文）+ 英文 README 头部 link 跳转。本 session 没动
- **后台进程持续重建**：清完后 `gui/node_modules` 247M + `core/target` 2.1G 又长出来 —— IDE 或某个 watcher 在后台跑 `pnpm install` / `cargo check`。不影响 repo，但用户机器磁盘会重新涨。如果想保持 lean，得识别后台 trigger 关掉

## Next

- 用户确认后 commit：A 类无文件改动（纯本地删除）+ B 类无文件改动（move 出 repo）+ C 类有 `.gitignore` / CLAUDE.md / 15 个 rename + 本 devlog + devlog README index
- 不 push（按 CLAUDE.md 规则：「git push 仅用于跨设备同步，不要自动执行」）
- D 类（开源标配文档）等下次 session
