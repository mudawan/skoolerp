import { useState, useCallback } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | boolean | null | undefined;

export interface SortState {
  key: string | null;
  dir: SortDir;
}

/**
 * Click-to-sort state for a table header row. First click sorts ascending,
 * second click descending, third click returns to the original order.
 */
export function useSortState(initial?: { key: string; dir?: SortDir }) {
  const [state, setState] = useState<SortState>({
    key: initial?.key ?? null,
    dir: initial?.dir ?? 'asc',
  });

  const toggle = useCallback((key: string) => {
    setState((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: null, dir: 'asc' };
    });
  }, []);

  return { sort: state, toggleSort: toggle };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Returns a sorted copy; leaves the input order untouched when no sort is active. */
export function sortRows<T>(
  rows: T[],
  sort: SortState,
  accessors: Record<string, (row: T) => SortValue>
): T[] {
  const get = sort.key ? accessors[sort.key] : undefined;
  if (!sort.key || !get) return rows;
  const factor = sort.dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: get(row) }))
    .sort((a, b) => {
      const av = a.value;
      const bv = b.value;
      const aEmpty = av === null || av === undefined || av === '';
      const bEmpty = bv === null || bv === undefined || bv === '';
      if (aEmpty && bEmpty) return a.index - b.index;
      if (aEmpty) return 1; // blanks always last
      if (bEmpty) return -1;
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else if (typeof av === 'boolean' && typeof bv === 'boolean') cmp = Number(av) - Number(bv);
      else cmp = collator.compare(String(av), String(bv));
      return cmp !== 0 ? cmp * factor : a.index - b.index;
    })
    .map((x) => x.row);
}
