# 2026-06-04 - GA upstream upgrade 5f46b438 -> 5d122e20

**Date / Status / Related**

- Date: 2026-06-04
- Status: implemented locally; not yet released
- Related: [GA baseline](../ga-baseline.md), [managed GA patch stack](../../managed-ga/patches/manifest.md), [v0.2.7 Windows runtime hotfix prep](./2026-06-04-v027-windows-runtime-hotfix-prep.md)

**Context**

Before publishing the `v0.2.7` Windows runtime hotfix, we refreshed the bundled
GenericAgent baseline from audited upstream `5f46b438` to official upstream
`5d122e20`. The external / attach audit was small: 5 commits, no dependency
diff, and no `agent_loop.py` contract movement.

The managed rebase exposed a real process issue: several user-facing managed
payload fixes from recent hotfixes were present in `managed-ga/code` but not in
the replay patch stack. A clean rebuild would have silently dropped Browser
Control recovery and ChatGPT / Codex backend behavior.

**Decisions**

- Upgrade the baseline to `5d122e20ea7e9dfd7941998acb902fbac4a2bc9a`.
- Preserve upstream's new `agentmain.py` / `ga.py` behavior: EXIT sentinel,
  per-instance `no_print`, lower-collision model-response log ids, and
  `safe_print` / `myprint` plumbing.
- Regenerate the managed state-root and asset-path patch contexts instead of
  editing generated payload by hand.
- Convert Browser Control recovery into `0006-managed-browser-control-recovery.patch`.
- Convert ChatGPT / Codex backend support into `0007-managed-codex-backend.patch`.
- Make `scripts/build-managed-ga.sh` apply the manifest-declared patch list
  rather than every `*.patch` by glob, and normalize patch-touched text files
  before and after replay.
- Update the Settings fallback runtime info so pre-bridge UI surfaces the new
  GA baseline, not the old `5f46b438` placeholder.

**Rejected Alternatives**

- Accepting the clean rebuild after only patching `0001` and `0003`: this would
  regress Browser Control no-tabs diagnostics and ChatGPT / Codex requests.
- Folding Browser Control and Codex changes into state-root or asset-path
  patches: that would hide removal conditions and make future upstream rebases
  harder to reason about.
- Carrying upstream trailing whitespace in patch contexts: it made patch files
  fail `git diff --check`; normalization belongs in the build script.

**Open Questions**

- Browser Control and ChatGPT / Codex remain managed-only integration patches.
  If upstream exposes equivalent extension status or Codex credential/request
  support, remove the Galley patches instead of keeping parallel behavior.
- Real bundled-GA dogfood should run before publishing `v0.2.7`; automated
  payload and runner checks are necessary but not enough for release confidence.

**Next**

Run the baseline verification set, commit the upgrade independently from the
Windows hotfix commit, then continue the `v0.2.7` release draft review.
