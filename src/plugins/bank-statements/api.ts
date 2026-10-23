import { getApiHeaders } from '../../services/apiSync';
import type {
  AdapterInfo,
  ApplyPreview,
  ApplyResult,
  PaymentModeChoice,
  StatementTxRow,
  StatementUploadSummary,
  Suggestion,
} from './shared';

// The project does not compile in strict mode, so a plain intersection (check `success` before using the data) is used.
type Reply<T> = T & { success: boolean; error?: string };

async function call<T>(method: string, path: string, body?: unknown): Promise<Reply<T>> {
  try {
    const res = await fetch(`/api/bank-statements${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...getApiHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!data) return { success: false, error: `The server sent an unexpected reply (${res.status}).` } as Reply<T>;
    if (!res.ok || data.success === false) return { success: false, error: data.error || `Request failed (${res.status}).`, upload: data.upload } as unknown as Reply<T>;
    return data;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Network request failed.' } as Reply<T>;
  }
}

export const bsApi = {
  adapters: () => call<{ adapters: AdapterInfo[] }>('GET', '/adapters'),
  uploads: () => call<{ uploads: StatementUploadSummary[] }>('GET', '/uploads'),
  upload: (p: { filename: string; mimeType: string; contentBase64: string; feeMonth: string; adapterId?: string }) =>
    call<{ upload: StatementUploadSummary }>('POST', '/uploads', p),
  one: (id: string) => call<{ upload: StatementUploadSummary }>('GET', `/uploads/${id}`),
  transactions: (id: string, status: string, q?: string) =>
    call<{ transactions: StatementTxRow[] }>('GET', `/uploads/${id}/transactions?status=${encodeURIComponent(status)}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  suggestions: (id: string) => call<{ suggestions: Record<string, Suggestion[]> }>('GET', `/uploads/${id}/suggestions`),
  suggestionsFor: (txId: string, q?: string) =>
    call<{ suggestions: Suggestion[] }>('GET', `/transactions/${txId}/suggestions${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  assign: (txId: string, studentId: string) => call<{ transaction: StatementTxRow }>('PUT', `/transactions/${txId}/assign`, { studentId }),
  unassign: (txId: string) => call<{ transaction: StatementTxRow }>('DELETE', `/transactions/${txId}/assign`),
  ignore: (txId: string, reason?: string) => call<{ transaction: StatementTxRow }>('POST', `/transactions/${txId}/ignore`, { reason }),
  unignore: (txId: string) => call<{ transaction: StatementTxRow }>('POST', `/transactions/${txId}/unignore`),
  reopen: (txId: string) => call<{ transaction: StatementTxRow }>('POST', `/transactions/${txId}/reopen`),
  preview: (id: string, txIds?: string[]) => call<{ preview: ApplyPreview }>('POST', `/uploads/${id}/apply/preview`, { txIds }),
  apply: (id: string, paymentMode: PaymentModeChoice, txIds?: string[]) =>
    call<{ result: ApplyResult }>('POST', `/uploads/${id}/apply`, { paymentMode, txIds }),
  fileUrl: (id: string) => `/api/bank-statements/uploads/${id}/file`,
};

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
