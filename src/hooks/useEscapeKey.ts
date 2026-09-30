import { useEffect, useRef } from 'react';

/**
 * Close modals/overlays on the Escape key.
 *
 * Multiple modals can be stacked (e.g. a confirmation modal opened over a
 * detail modal opened over a list). Each modal registers an Escape handler
 * in a shared, depth-ordered registry, and a single global `keydown` listener
 * invokes only the TOPMOST (innermost) handler. Pressing Escape therefore
 * closes one layer at a time rather than every stacked modal at once.
 *
 * `depth` expresses visual nesting: a modal rendered inside another should
 * pass a higher depth so its handler wins while it is on screen. Ties at the
 * same depth are broken by the most-recently-registered handler, which
 * corresponds to the most-recently-shown modal.
 *
 * @param onEscape callback invoked when this handler is the topmost one
 * @param active   when false the handler is not registered
 * @param depth    nesting level; higher = more on top (default 0)
 */
export function useEscapeKey(onEscape?: () => void, active: boolean = true, depth: number = 0) {
  // Keep the latest callback in a ref so the handler identity is stable across
  // re-renders (no churn on the stack) while still reading fresh closures.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active || !onEscape) return;
    const entry = { id: ++nextId, depth, handler: () => onEscapeRef.current?.() };
    handlers.push(entry);
    ensureGlobalListener();
    return () => {
      const idx = handlers.indexOf(entry);
      if (idx !== -1) handlers.splice(idx, 1);
    };
  }, [active, depth]);
}

interface EscapeEntry {
  id: number;
  depth: number;
  handler: () => void;
}

const handlers: EscapeEntry[] = [];
let nextId = 0;

function fireTopmost() {
  let top: EscapeEntry | null = null;
  for (const h of handlers) {
    if (!top || h.depth > top.depth || (h.depth === top.depth && h.id > top.id)) {
      top = h;
    }
  }
  if (top) top.handler();
}

let globalListenerInstalled = false;

function ensureGlobalListener() {
  if (globalListenerInstalled) return;
  globalListenerInstalled = true;
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      fireTopmost();
    }
  });
}
