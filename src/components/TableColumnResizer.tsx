import React, { useEffect } from 'react';

/**
 * Makes every on-screen data table's columns user-adjustable, so long values can be widened
 * until they no longer wrap. Mounted once at the app root; it finds tables in the DOM, adds a
 * drag handle to the right edge of each header cell, and remembers the widths per table
 * (keyed by its header labels) in this browser.
 *
 * - Drag a header's right edge to resize. Double-click the edge to reset the table.
 * - Tables inside an element with data-no-resize (print layouts) are left alone.
 * - Tables whose header row has merged cells (colSpan) are skipped.
 */

const STORAGE_KEY = 'skooler_table_col_widths_v1';
const MAX_SAVED_TABLES = 200;
const MIN_WIDTH = 48;
const HANDLE_CLASS = 'col-resize-handle';

type Store = Record<string, number[]>;

const readStore = (): Store => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveWidths = (sig: string, widths: number[] | null) => {
  try {
    const store = readStore();
    delete store[sig];
    if (widths) store[sig] = widths; // re-inserted last = most recently used
    const keys = Object.keys(store);
    if (keys.length > MAX_SAVED_TABLES) {
      keys.slice(0, keys.length - MAX_SAVED_TABLES).forEach((k) => delete store[k]);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // storage unavailable: widths simply last until reload
  }
};

/** Header cells of the table's last header row, or [] when the table isn't resizable. */
const getHeaderCells = (table: HTMLTableElement): HTMLTableCellElement[] => {
  const row = table.tHead ? table.tHead.rows[table.tHead.rows.length - 1] : table.rows[0];
  if (!row) return [];
  const cells = Array.from(row.cells);
  if (cells.length < 2) return [];
  if (!cells.every((c) => c.tagName === 'TH' && c.colSpan === 1)) return [];
  return cells;
};

const signatureOf = (cells: HTMLTableCellElement[]): string => {
  const labels = cells.map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim());
  return labels.some(Boolean) ? labels.join('|') : '';
};

const STYLE_PROPS = ['boxSizing', 'width', 'minWidth', 'maxWidth'] as const;

/** Remembers an element's own inline sizing the first time we override it, so reset can restore it. */
const rememberOriginal = (el: HTMLElement) => {
  if (el.dataset.colOrigStyle !== undefined) return;
  el.dataset.colOrigStyle = JSON.stringify(STYLE_PROPS.map((p) => el.style[p]));
};

const restoreOriginal = (el: HTMLElement) => {
  const saved = el.dataset.colOrigStyle;
  const values: string[] = saved ? JSON.parse(saved) : STYLE_PROPS.map(() => '');
  STYLE_PROPS.forEach((p, i) => (el.style[p] = values[i]));
  delete el.dataset.colOrigStyle;
};

const applyWidths = (table: HTMLTableElement, cells: HTMLTableCellElement[], widths: number[]) => {
  rememberOriginal(table);
  let total = 0;
  cells.forEach((cell, i) => {
    rememberOriginal(cell);
    const w = Math.max(MIN_WIDTH, Math.round(widths[i]));
    total += w;
    cell.style.boxSizing = 'border-box';
    cell.style.width = `${w}px`;
    cell.style.minWidth = `${w}px`;
    cell.style.maxWidth = `${w}px`;
  });
  table.style.width = `${total}px`;
  table.style.maxWidth = 'none';
  // A table wider than its card must scroll inside it rather than spill out.
  const parent = table.parentElement;
  if (parent && total > parent.clientWidth && getComputedStyle(parent).overflowX === 'visible') {
    parent.style.overflowX = 'auto';
  }
};

const clearWidths = (table: HTMLTableElement, cells: HTMLTableCellElement[]) => {
  cells.forEach(restoreOriginal);
  restoreOriginal(table);
};

let dragging = false;

const enhanceTables = () => {
  if (dragging) return;
  const store = readStore();
  document.querySelectorAll('table').forEach((table) => {
    if (table.closest('[data-no-resize]')) return;
    const cells = getHeaderCells(table);
    if (cells.length === 0) return;
    const sig = signatureOf(cells);
    if (!sig) return;

    const saved = store[sig];
    if (saved && saved.length === cells.length) {
      const stale = cells.some((c, i) => c.style.width !== `${Math.max(MIN_WIDTH, Math.round(saved[i]))}px`);
      if (stale) applyWidths(table, cells, saved);
    }

    cells.forEach((cell) => {
      if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
      const hasHandle = Array.from(cell.children).some((el) => el.classList.contains(HANDLE_CLASS));
      if (hasHandle) return;
      const handle = document.createElement('span');
      handle.className = HANDLE_CLASS;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'vertical');
      handle.title = 'Drag to resize column. Double-click to reset all columns.';
      cell.appendChild(handle);
    });
  });
};

const onPointerDown = (e: PointerEvent) => {
  const handle = (e.target as Element | null)?.closest?.(`.${HANDLE_CLASS}`) as HTMLElement | null;
  if (!handle || e.button !== 0) return;
  const th = handle.parentElement as HTMLTableCellElement | null;
  const table = th?.closest('table') as HTMLTableElement | null;
  if (!th || !table) return;
  const cells = getHeaderCells(table);
  const index = cells.indexOf(th);
  if (index < 0) return;
  const sig = signatureOf(cells);

  e.preventDefault();
  e.stopPropagation();
  dragging = true;
  handle.classList.add('active');
  handle.setPointerCapture?.(e.pointerId);

  // Snapshot every column's current width. Nothing changes until the pointer actually moves,
  // so a plain click or double-click on the handle never shifts the layout.
  const widths = cells.map((c) => Math.round(c.getBoundingClientRect().width));
  const startX = e.clientX;
  const startWidth = widths[index];
  let moved = false;

  const onMove = (ev: PointerEvent) => {
    if (!moved && Math.abs(ev.clientX - startX) < 2) return;
    moved = true;
    widths[index] = Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX));
    applyWidths(table, cells, widths); // every column is written, so only the dragged one changes
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
    handle.classList.remove('active');
    dragging = false;
    if (moved) saveWidths(sig, widths);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
};

// A drag ends with a click on the handle; it must neither sort the column nor do anything else.
const swallowHandleClick = (e: MouseEvent) => {
  if ((e.target as Element | null)?.closest?.(`.${HANDLE_CLASS}`)) {
    e.stopPropagation();
    e.preventDefault();
  }
};

const onDoubleClick = (e: MouseEvent) => {
  const handle = (e.target as Element | null)?.closest?.(`.${HANDLE_CLASS}`);
  if (!handle) return;
  const table = handle.closest('table') as HTMLTableElement | null;
  if (!table) return;
  const cells = getHeaderCells(table);
  clearWidths(table, cells);
  saveWidths(signatureOf(cells), null);
  e.stopPropagation();
  e.preventDefault();
};

export const TableColumnResizer: React.FC = () => {
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(enhanceTables, 60);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    schedule();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', swallowHandleClick, true);
    document.addEventListener('dblclick', onDoubleClick, true);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('click', swallowHandleClick, true);
      document.removeEventListener('dblclick', onDoubleClick, true);
    };
  }, []);

  return null;
};

export default TableColumnResizer;
