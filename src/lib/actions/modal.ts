/**
 * Minimal modal focus management as a Svelte action.
 *
 * On mount: remembers the element that had focus (so it can be restored), then
 * moves focus into the dialog (the first focusable child, or the container).
 * While mounted: traps Tab / Shift+Tab so keyboard focus cycles within the
 * dialog (matching the `aria-modal="true"` promise that the rest is inert).
 * On destroy: returns focus to the previously-focused element.
 *
 * Escape is intentionally NOT handled here — callers keep their own dismiss
 * handler — but because focus now lives inside the dialog, a key handler on the
 * container will actually receive it.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export function modal(node: HTMLElement) {
  const previouslyFocused = document.activeElement as HTMLElement | null;

  const focusables = () =>
    Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement,
    );

  // Move focus into the dialog after it renders.
  queueMicrotask(() => {
    const first = focusables()[0];
    (first ?? node).focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) {
      e.preventDefault();
      node.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const activeEl = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (activeEl === first || activeEl === node || !node.contains(activeEl)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (activeEl === last || !node.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  node.addEventListener("keydown", onKeydown);

  return {
    destroy() {
      node.removeEventListener("keydown", onKeydown);
      previouslyFocused?.focus?.();
    },
  };
}
