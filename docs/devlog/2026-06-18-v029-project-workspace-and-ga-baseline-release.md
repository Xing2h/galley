# 2026-06-18 - v0.2.9 Project Workspace and GA baseline release

## Date / Status / Related

- Date: 2026-06-18
- Status: release prep in progress
- Related:
  - [Project status](../project-status.md)
  - [GA baseline](../ga-baseline.md)
  - [Release / Update SOP](../release-update-sop.md)
  - [Project Workspace and GA upstream upgrade](./2026-06-18-project-workspace-and-ga-upstream-12655687.md)
  - [GA upstream upgrade 12655687 -> 53b48aea](./2026-06-18-ga-upstream-upgrade-12655687-to-53b48aea.md)

## Context

After `v0.2.8`, the main branch accumulated enough user-visible reliability
work for a stable patch release: Project folder binding returned through
GenericAgent's upstream Workspace model, Channels / Feishu setup became more
settled, and the managed GA baseline caught up to official upstream latest.

## Decisions

- Ship `v0.2.9` as a stable patch release, not a minor release; Agent API stays
  at `schemaVersion: 1`.
- Promote the stable update channel after GitHub Release publish and smoke, so
  installed users can upgrade in Galley.
- Keep Windows ARM out of this release; supported release targets remain macOS
  Apple Silicon, macOS Intel, and Windows x64.
- Keep external GA non-invasive. The release updates Galley's verified baseline
  and comparison UI, but does not modify user-owned GenericAgent checkouts.

## Rejected Alternatives

- Hold for a larger `v0.3.0`: none of the shipped changes require a public API
  or product-tier jump.
- Release as manual-download only: this is a normal stable patch, so installed
  users should get it through the updater after promotion.
- Re-enable Project root as process cwd: the v0.2.9 path uses GA Workspace and
  avoids the old memory / SOP coupling failure mode.

## Open Questions

- Whether to run a full installed-app dogfood on Windows before promotion if
  CI artifacts are green but no Windows machine is immediately available.

## Next

- Finish local release gates, push `main` and `v0.2.9`, review the draft
  GitHub Release, smoke artifacts, publish, and promote `stable`.
