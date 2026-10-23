import { AdapterError, type StatementAdapter, type StatementInput } from '../types';
import { genericCsvAdapter, genericXlsxAdapter } from './table-adapter';
import { genericPdfAdapter } from './pdf-adapter';

// To support a new bank layout: write an adapter implementing StatementAdapter and add it here,
// BEFORE the generic ones (the best detect() score wins; ties go to the earlier entry).
const adapters: StatementAdapter[] = [genericPdfAdapter, genericCsvAdapter, genericXlsxAdapter];

export function registerAdapter(adapter: StatementAdapter, position: 'first' | 'last' = 'first'): void {
  if (adapters.some((a) => a.id === adapter.id)) throw new Error(`Statement adapter "${adapter.id}" is already registered.`);
  if (position === 'first') adapters.unshift(adapter);
  else adapters.push(adapter);
}

export const listAdapters = (): readonly StatementAdapter[] => adapters;

export const getAdapter = (id: string): StatementAdapter | undefined => adapters.find((a) => a.id === id);

const MIN_CONFIDENCE = 0.3;

/** The named adapter, or the one that is most confident it can read the file. */
export async function selectAdapter(input: StatementInput, preferredId?: string): Promise<StatementAdapter> {
  if (preferredId && preferredId !== 'auto') {
    const a = getAdapter(preferredId);
    if (!a) throw new AdapterError(`Unknown statement format "${preferredId}".`);
    return a;
  }
  let best: { adapter: StatementAdapter; score: number } | null = null;
  for (const adapter of adapters) {
    let score = 0;
    try {
      score = await adapter.detect(input);
    } catch {
      score = 0;
    }
    if (score > (best?.score ?? 0)) best = { adapter, score };
  }
  if (!best || best.score < MIN_CONFIDENCE) {
    throw new AdapterError(
      'This file is not in a supported statement format. Upload a text PDF, a CSV or an .xlsx export of the statement.'
    );
  }
  return best.adapter;
}
