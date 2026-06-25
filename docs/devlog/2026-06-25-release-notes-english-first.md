# GitHub Release notes 英文优先

- **Date**: 2026-06-25
- **Status**: completed
- **Related**: [README 默认语言翻转](./2026-06-24-readme-default-language-flip.md) · [release / update SOP](../release-update-sop.md)

## Context

README 已经翻转为英文 default。GitHub Releases 是公开仓库里同样高频的外部入口，继续中文在前会让国际读者先看到非默认语言，也和作品集 / 开源仓库的英文优先信号不一致。

## Decisions

- GitHub Release notes 的双语顺序改为英文在前、中文在后。
- 稳定版保持同一套结构：英文 `What's New` / `Installation Guide` / `Full Changelog` 在前，`---` 后接中文 `What's New` / `安装指南`。
- Alpha release notes 也统一为英文测试说明在前，`---` 后接中文测试说明。
- 已发布的 21 个 GitHub Releases（`v0.1.0-alpha.1` 到 `v0.2.15`）全部在 GitHub 端更新正文顺序；不改 tag、资产、draft、prerelease 或 Latest 状态。
- `v0.2.0` 到 `v0.2.15` 共 16 个稳定版的 `What's New` 进一步改成结果优先写法：用户可见变化放在主段，非用户功能的维护项放到 `Under the Hood`。
- 早期 alpha / 内测 release 只保留英文优先顺序，不重写测试说明内容。
- `docs/release-update-sop.md` 同步改为英文优先和结果优先，避免未来发版回到旧模板或工程模块清单式写法。

## Rejected alternatives

- **只改未来 release**：否。裸 GitHub Releases 列表里历史 release 仍会给外部读者中文优先信号，和 README 翻转后的定位不一致。
- **中英合并到同一段落**：否。可扫读性差，也更难保证两种语言内容完整同步。

## Open questions

- Release 正文里的中文 `What's New` 标题是否未来改成 `更新内容`：本次不动，保持既有发布正文最小变更。
- 旧中文区标题 `What's New` 是否未来改成 `更新内容`：同上，本次不动。

## Next

- 下次 release 起按英文优先、结果优先模板出稿。
