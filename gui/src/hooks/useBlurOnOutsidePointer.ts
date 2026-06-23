import { useEffect } from "react";

/**
 * Blur the composer textarea on a pointerdown that lands outside the
 * composer, then forward the click to its intended target. Works around a
 * desktop WebView focus quirk: some focus paths turn the first outside
 * click into "blur only", swallowing the click on a button / link /
 * menuitem. We blur during the capture phase, then re-dispatch the click
 * ourselves if the native one never arrives.
 *
 * DOM-only — touches no React state, takes only the two refs it guards.
 * Pulled out of Composer so the WebView workaround doesn't crowd the
 * textarea's core interaction logic.
 */
export function useBlurOnOutsidePointer(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  composerRootRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const blurBeforeOutsidePointerTarget = (event: PointerEvent) => {
      if (document.activeElement !== textareaRef.current) return;
      if (event.button !== 0 || event.ctrlKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (composerRootRef.current?.contains(target)) return;
      const clickTarget = target.closest<HTMLElement>(
        'button, a[href], [role="button"], [role="menuitem"], [role="radio"]',
      );
      let nativeClickSeen = false;

      const markNativeClick = (clickEvent: MouseEvent) => {
        if (!clickTarget) return;
        const nativeTarget = clickEvent.target;
        if (!(nativeTarget instanceof Node)) return;
        if (
          nativeTarget === clickTarget ||
          clickTarget.contains(nativeTarget)
        ) {
          nativeClickSeen = true;
        }
      };

      // Some desktop WebView focus paths can turn the first outside
      // click into "blur only". Blur during capture instead, then
      // let the same pointer event continue to the intended target.
      textareaRef.current?.blur();
      if (!clickTarget) return;

      document.addEventListener("click", markNativeClick, true);
      window.setTimeout(() => {
        document.removeEventListener("click", markNativeClick, true);
        if (nativeClickSeen || !clickTarget.isConnected) return;
        clickTarget.click();
      }, 80);
    };

    document.addEventListener(
      "pointerdown",
      blurBeforeOutsidePointerTarget,
      true,
    );
    return () => {
      document.removeEventListener(
        "pointerdown",
        blurBeforeOutsidePointerTarget,
        true,
      );
    };
  }, [textareaRef, composerRootRef]);
}
