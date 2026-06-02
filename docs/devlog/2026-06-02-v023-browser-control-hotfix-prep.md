# 2026-06-02 — v0.2.3 Browser Control hotfix prep

## Date / Status / Related

- Date: 2026-06-02
- Status: Published stable release `v0.2.3`
- Related:
  - [Browser Control core](../../core/src/browser_control.rs)
  - [Browser Control setup dialog](../../gui/src/components/screens/BrowserControlSetupDialog.tsx)
  - [TMWebDriver bridge](../../managed-ga/code/TMWebDriver.py)
  - [Chrome extension background script](../../managed-ga/code/assets/tmwd_cdp_bridge/background.js)
  - [Release / update SOP](../release-update-sop.md)

## Context

After `v0.2.2` shipped, a macOS user reported that a fresh install plus the
`tmwd_cdp_bridge` Chrome extension looked normal in Chrome, but Galley's
Browser Control test did nothing and managed GA could not control the browser.
The decisive signal was that opening any ordinary webpage in Chrome made the
test pass immediately.

The root issue was not "extension missing". It was "extension connected, but no
scriptable `http` / `https` tab exists yet". The previous UI collapsed that
state into a generic failure, which made a recoverable setup step look like a
broken install.

After the draft artifacts were built, JC installed the macOS DMG and did not
find release-blocking issues. `v0.2.3` was then published as GitHub Latest and
promoted to the beta update channel; the live beta manifest verifier passed
with cache-busting.

## Decisions

- Ship this as a stable patch target, `v0.2.3`, rather than waiting for a larger
  feature release.
- Split Browser Control probe state into an explicit `connected_no_tabs` result
  so Galley can say the extension is connected but needs a normal webpage.
- Keep the cold-start managed-GA probe quiet in this state. A newly opened app
  should not warn the user when the bridge is ready and only lacks a page.
- Add a browser-specific setup step that opens `https://example.com` in Chrome
  or Edge before asking the user to run the Galley test.
- Keep the step explicit instead of automatically opening a page on app launch;
  app startup should avoid surprising browser side effects.
- Make dragging the whole `tmwd_cdp_bridge` folder the primary instruction.
  `Load unpacked` remains a fallback, not the visual emphasis.
- On macOS / Windows, "locate folder" now selects the whole
  `tmwd_cdp_bridge` folder, because that is what the user needs to drag into
  Chrome.
- Keep Browser Control setup usable at Galley's 600px minimum window height by
  making the step list scroll while the footer actions stay visible.
- Retain extension reconnect hardening so service-worker wakeup timing is less
  brittle on fresh installs.

## Rejected alternatives

- Automatically opening a webpage during Galley startup: too much surprise for a
  local desktop app and too easy to confuse with unsolicited browser control.
- A default-browser link button: on macOS it could open Safari, which does not
  help when the user installed the Chrome / Edge extension.
- Treating "no ordinary webpage open" as a test failure: technically true for
  control, but wrong for setup diagnosis because the extension itself is ready.
- Making `Load unpacked` the emphasized instruction: it teaches the backup path
  first and hides the simpler drag-folder path.
- Letting the setup dialog footer scroll away: small-screen users need the
  primary next action to remain available.

## Open questions

- No open release blockers for `v0.2.3`.
- A separate older-installed-app update dogfood pass remains useful for future
  release confidence, even though the live beta manifest verifier passed.

## Next

Monitor Browser Control user reports after `v0.2.3`. For the next patch, keep
GitHub Release publishing and beta update-channel promotion as separate gates.
