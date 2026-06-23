# v0.2.12 image intake and GA upgrade release

## Date / Status / Related

- Date: 2026-06-23
- Status: released as `v0.2.12` stable patch
- Related: [project status](../project-status.md), [release / update SOP](../release-update-sop.md), [GA upstream upgrade 53b48aea -> 70792af](./2026-06-23-ga-upstream-upgrade-53b48aea-to-70792af.md), [Composer image intake split](./2026-06-22-composer-image-split.md), [v0.2.11 release](./2026-06-20-v0211-process-lifecycle-hotfix.md)

## Context

`v0.2.11` shipped three days earlier. 31 commits accumulated since, mixing
user-visible work with a large internal cleanup:

- The Composer image-intake component split, closing two dogfood gaps along the
  way: a drag-over drop affordance on the composer, and a toast when image
  intake hits the 4-image cap instead of failing silently.
- An upstream managed GA upgrade `53b48aea -> 70792af` (per its own devlog):
  the per-task loop limit rises to 180 turns, `reasoning`-field compatibility
  lands, and the default context window is raised to 90000.
- A managed GA credential-storage redirect: `keychain.py` no longer hardcodes
  `~/ga_keychain.enc`, so managed-mode credentials stop leaking to the user's
  real home and stop colliding with an external GA checkout. They now bind to
  `GALLEY_GA_STATE_ROOT/ga_keychain.enc`.
- An Agent / CLI connectivity-probe fix.
- A large batch of GUI hook extractions and Rust core module splits — pure
  refactor, no behavior change.

No Agent API, database schema, or product-shape change. The GA baseline advances
to `70792af`.

## Decisions

1. Ship as patch `v0.2.12`, not minor `0.3.0`. Strict semver would bump minor
   for the drag-over feat, but the project keeps `schemaVersion` frozen on the
   `0.2.x` line, ships patch releases often, and there is no breaking change.
   Consistent with the `0.2.0 -> 0.2.11` precedent.
2. Release notes: 5 bullets scoped to user-visible change. Image intake (drag
   affordance + 4-image toast) collapses to one bullet; Bundled GA gets three
   (upstream upgrade + loop limit, context window 90000, credential storage
   under state root); the Agent connection probe gets one. Patch-range 3-5
   bullets per the SOP template.
3. The GA upstream desktop frontend / bridge rework — the bulk of the upgrade
   commit, roughly +/- 7861 lines in `app.js` — is deliberately NOT in
   user-facing notes. Per the GA-upgrade devlog, Galley does not invoke
   upstream's desktop bridge in managed mode (the GUI and CLI run through Rust
   Core + `runner.workbench_bridge`); the upstream desktop bridge is only
   import-smoked for dependency readiness. Advertising a refreshed desktop UI
   would mislead users into expecting a surface Galley does not expose.
4. Use "内置 GA" in Chinese and "Bundled GA" in English; never expose "managed
   GA" in user-facing notes (SOP rule).
5. Release flow followed the SOP: bump 5 source files, let `cargo check` refresh
   `Cargo.lock`, run local gates (typecheck / lint / cargo check /
   bundle-python / check-bundled-python — all green), push `main`, wait for
   `check.yml` green on all three targets, push tag `v0.2.12`, let `release.yml`
   build the draft, hand off to the owner for smoke, then publish and promote.

## Rejected alternatives

- `0.3.0` minor bump: no breaking change; `schemaVersion` frozen on `0.2.x`;
  patch precedent across the whole `0.2.x` line.
- Listing the GA desktop frontend rework in notes: Galley does not use the
  upstream desktop bridge, so it would read as a promise of a UI change users
  will not see.
- Treating the credential redirect (`556efe4`) as internal-only: it is a real,
  locatable behavior change (credentials move out of `~/ga_keychain.enc` into
  the state root), worth one bullet once the owner decided to surface it.
- Framing this as a hotfix: it ships a feat plus a GA baseline upgrade, not just
  a fix, so the title and bullets reflect everything shipped (SOP scope rule).

## Open questions

- `promote-update-channel.yml`'s verify step failed on CDN cache timing.
  `raw.githubusercontent.com` served `0.2.11` through the full 6 x 10s retry
  window and only flipped to `0.2.12` afterward. The channel was manually
  re-verified green (stable and beta both `0.2.12`, all three platforms
  present). Before the next release, widen `check-update-channel.mjs` retry
  budget, or validate by commit SHA instead of CDN content. Recorded in
  [project status](../project-status.md) post-release follow-up.
- Dogfood the in-app update path from an installed older build to `v0.2.12`.
- Watch the GA upgrade (180-turn loop limit, `reasoning` field, credential
  storage relocation) for regressions in real sessions.

## Next

1. Watch post-release feedback; monitor the GA upgrade in real use.
2. Fix the verify retry budget (or switch to SHA-based verification) before the
   next release.
3. Keep the `0.2.x` line open until a deliberate `0.3.0` / `schemaVersion: 2`
   decision.
