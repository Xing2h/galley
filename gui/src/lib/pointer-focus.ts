import type { MouseEvent } from "react";

export function preventMouseFocus<T extends HTMLElement>(
  event: MouseEvent<T>,
) {
  if (event.button !== 0 || event.defaultPrevented) return;
  event.preventDefault();
}

export function blurAfterClick<T extends HTMLElement>(event: MouseEvent<T>) {
  event.currentTarget.blur();
}
