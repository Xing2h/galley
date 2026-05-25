# Settings Models + Runtime UX polish

## Date / Status / Related

- Date: 2026-05-25
- Status: Shipped in local commit
- Related: Managed GA runtime, Settings -> Models, Settings -> Runtime, Sidebar runtime indicator

## Context

Managed / bundled GA moved from implementation into real dogfood. The first working slice exposed a product problem: Settings still carried attach-era mental models. Models and Provider were initially too separate, the default runtime was over-explained, and the main Sidebar still said "GA 就绪", which made Galley feel like a wrapper around an externally managed GenericAgent instead of a product with a recommended built-in runtime.

The user goal for this session was not just cosmetic Chinese copy. It was to make a first-time user understand how to configure a model quickly, while keeping external GA as an available but quieter path for advanced users.

## Decisions

1. **Models page centers Provider ownership**
   Models now live under configured model providers. Adding a provider can also add the first model in one pass, so a new user does not have to complete two disconnected forms.

2. **Provider presets are first-class**
   The picker now starts with OpenAI and Anthropic official-style presets, then common third-party providers: DeepSeek, Zhipu GLM, Kimi for Coding, MiniMax, and OpenRouter. The selected protocol is shown as a small compatibility tag instead of a heavy two-button mode switch.

3. **Model ordering is explicit, not drag-based**
   Drag interaction felt poor and opaque. We replaced it with small up/down controls plus subtle row-swap motion. The first configured model is the default; "设为默认" remains and moves the model to the top.

4. **Provider checks and model tests are different actions**
   Provider "检查" is distinct from model "测试". Model tests now use a minimal real inference request when a model id is present, instead of depending on `/models`. This fits Anthropic-compatible third-party providers that support `/messages` but not model listing.

5. **Runtime page defaults to quiet built-in GA**
   "内置 GA" is the primary path. "接入外部 GA" and "更多" are collapsed, lower-weight sections. Switching runtime modes shows a reminder that old sessions are preserved and can be revisited.

6. **Sidebar runtime indicator is exception-only**
   Built-in GA with configured models shows nothing in the Sidebar header. Built-in GA without models shows "配置模型" and opens Settings -> Models. External GA shows "外部 GA" with a green dot; external unconfigured shows "接入外部 GA" and opens Runtime.

7. **Model configuration backup is deferred**
   The need is real for users with many models, but the first version will not add import/export. Galley keeps API keys in Keychain / Windows Credential Manager. A future model-config export should default to no keys, with any full key migration requiring explicit encrypted export.

8. **Settings uses one stable larger frame**
   Models has become a real configuration surface, so the old 720x560 Settings dialog was too cramped. The dialog now uses one larger 960x680 frame across all tabs instead of resizing only Models. This keeps Settings spatially stable while giving model-heavy screens room to breathe.

9. **About is identity, version, and links only**
   The local-first privacy/value-prop block was removed from About. That information is still true, but it belongs closer to API-key/model setup moments, not in the product identity page. About now focuses on Galley version, built-in GA version, source/feedback/upstream links, maker links, and license.

10. **TopBar status pills should match visual weight**
    YOLO and conversation-width pills can appear side by side, so their active text needs comparable contrast even though they use different semantic colors. The width pill now uses the stronger brand token when active. The YOLO popover's "在 Settings 中查看" action also opens Settings -> Approval directly.

## Rejected Alternatives

- **Show "内置 GA 已就绪" in the Sidebar**: rejected because it makes the default state noisy and keeps exposing implementation detail.
- **Make all Provider/model tests rely on `/models`**: rejected because many compatible third-party services only guarantee chat/messages endpoints.
- **Keep drag reorder**: rejected after dogfood because the affordance and feedback were not trustworthy enough.
- **Store or export API keys in ordinary SQLite/JSON for convenience**: rejected as the default path. It optimizes migration but weakens Galley's security posture.
- **Hide Models entirely in external GA mode**: rejected because it caused more confusion. The current page stays visible but explains that these settings affect only built-in GA.
- **Resize Settings only for Models**: rejected because tab changes would make the dialog feel unstable. A single larger frame is calmer and more predictable.
- **Keep About as a value-prop page**: rejected because it mixed product promises with version/source identity. Privacy messaging should appear where it affects user trust decisions.

## Open Questions

- Whether Settings -> Models needs a later "导入/导出配置" flow once users start configuring many providers.
- Whether model test payloads need provider-specific overrides for services that reject very small `max_tokens` or special beta headers.
- Whether Sidebar's "外部 GA" signal should become clickable even when configured, or stay passive as a non-default mode marker.

## Next

- Dogfood the current Settings -> Models flow with at least one OpenAI-compatible provider and one Anthropic-compatible third-party provider.
- On Windows, verify Credential Manager storage and model-provider testing with the same flow.
- Revisit import/export after the core managed-GA setup path feels settled.
