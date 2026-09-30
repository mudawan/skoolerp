export interface DbStatus {
  isConnected: boolean;
  isSyncing: boolean;
  engine: string;
  revision: number;
  activePeers: number;
}

type DbStatusListener = (status: DbStatus) => void;
type FailureListener = (err: any) => void;

let currentDbStatus: DbStatus = {
  isConnected: true,
  isSyncing: false,
  engine: 'postgres',
  revision: 1,
  activePeers: 1,
};

let activeInstId: string = 'default';

export function setActiveInstitutionId(id: string) {
  activeInstId = id || 'default';
}

const statusListeners = new Set<DbStatusListener>();
const failureListeners = new Set<FailureListener>();
const remoteSubscribers = new Set<(data: any) => void>();

function notifyStatus() {
  statusListeners.forEach((fn) => fn({ ...currentDbStatus }));
}

export function subscribeDbStatus(listener: DbStatusListener): () => void {
  statusListeners.add(listener);
  listener({ ...currentDbStatus });
  return () => statusListeners.delete(listener);
}

export function subscribeSyncFailures(listener: FailureListener): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

export function reportSyncFailure(err: any) {
  failureListeners.forEach((fn) => fn(err));
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    const ok = res.ok;
    currentDbStatus.isConnected = ok;
    notifyStatus();
    return ok;
  } catch {
    currentDbStatus.isConnected = false;
    notifyStatus();
    return false;
  }
}

export function checkMutationAllowed(): boolean {
  return currentDbStatus.isConnected;
}

export function initializeSyncSnapshots(data: any): void {}
export function resetSyncSnapshots(): void {}

export async function syncSimpleEntityCollectionNow(table: string, items: any[]): Promise<any> {
  return { success: true };
}

export function queueDatabaseSync(state: any): void {}

export function initLiveRealtimeSync(): () => void {
  try {
    const es = new EventSource('/api/events');
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        remoteSubscribers.forEach((cb) => cb(data));
      } catch {}
    };
    return () => es.close();
  } catch {
    return () => {};
  }
}

export function subscribeRemoteChanges(callback: (data: any) => void): () => void {
  remoteSubscribers.add(callback);
  return () => remoteSubscribers.delete(callback);
}

async function request(url: string, options: RequestInit = {}): Promise<any> {
  currentDbStatus.isSyncing = true;
  notifyStatus();
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-institution-id': activeInstId,
      ...((options.headers as any) || {}),
    };
    const res = await fetch(url, {
      ...options,
      headers,
    });
    currentDbStatus.isConnected = true;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    reportSyncFailure(err);
    throw err;
  } finally {
    currentDbStatus.isSyncing = false;
    notifyStatus();
  }
}

export async function fetchServerState(institutionId?: string): Promise<{ success: boolean; data: any }> {
  try {
    const meRes = await fetch('/api/auth/me');
    if (!meRes.ok) return { success: false, data: null };
    const meData = await meRes.json();
    if (!meData?.success || !meData?.user) return { success: false, data: null };

    if (meData.institution?.id) {
      setActiveInstitutionId(meData.institution.id);
    }

    const [
      classesRes,
      studentsRes,
      familiesRes,
      busesRes,
      stopsRes,
      asgnRes,
      tmplsRes,
      vouchersRes,
      collectionsRes,
      txnsRes,
      banksRes,
      lockedRes,
    ] = await Promise.all([
      fetch('/api/classes').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch('/api/students').then((r) => (r.ok ? r.json() : { students: [] })).catch(() => ({ students: [] })),
      fetch('/api/families').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch('/api/transport/buses').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch('/api/transport/stops').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch('/api/transport/assignments').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch('/api/fee-templates').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch('/api/vouchers').then((r) => (r.ok ? r.json() : { vouchers: [] })).catch(() => ({ vouchers: [] })),
      fetch('/api/collections').then((r) => (r.ok ? r.json() : { collections: [] })).catch(() => ({ collections: [] })),
      fetch('/api/transactions').then((r) => (r.ok ? r.json() : { transactions: [] })).catch(() => ({ transactions: [] })),
      fetch('/api/bank-accounts').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
      fetch('/api/locked-months').then((r) => (r.ok ? r.json() : { lockedMonths: [] })).catch(() => ({ lockedMonths: [] })),
    ]);

    return {
      success: true,
      data: {
        institute: meData.institution,
        users: meData.user ? [meData.user] : [],
        classes: classesRes.items || [],
        students: studentsRes.students || [],
        families: familiesRes.items || [],
        buses: busesRes.items || [],
        stops: stopsRes.items || [],
        transportAssignments: asgnRes.items || [],
        templates: tmplsRes.items || [],
        vouchers: vouchersRes.vouchers || [],
        collections: collectionsRes.collections || [],
        transactions: txnsRes.transactions || [],
        bankAccounts: banksRes.items || [],
        lockedMonths: lockedRes.lockedMonths || [],
      },
    };
  } catch {
    return { success: false, data: null };
  }
}

export async function apiRegisterInstitution(payload: any): Promise<any> {
  return request('/api/auth/register-institution', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiRegisterUser(payload: any): Promise<any> {
  return request('/api/auth/register-user', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiLogin(payload: any): Promise<any> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiLogout(): Promise<any> {
  return request('/api/auth/logout', { method: 'POST' });
}

export async function apiGetMe(): Promise<any> {
  return request('/api/auth/me');
}

export async function apiCreateInvite(payload: any): Promise<any> {
  return request('/api/invites/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiListInvites(): Promise<any> {
  return request('/api/invites/list');
}

export async function apiCreateUser(payload: any): Promise<any> {
  return request('/api/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateUser(id: string, payload: any): Promise<any> {
  return request(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function apiDeleteUser(id: string): Promise<any> {
  return request(`/api/users/${id}`, { method: 'DELETE' });
}

export async function apiDeleteInstitution(code: string): Promise<any> {
  return request('/api/institution', {
    method: 'DELETE',
    body: JSON.stringify({ code }),
  });
}

export async function apiGenerateVouchers(vouchers: any[], carriedPriorVouchers: any[] = []): Promise<any> {
  return request('/api/vouchers/generate', {
    method: 'POST',
    body: JSON.stringify({ vouchers, carriedPriorVouchers }),
  });
}

export async function apiReceiveCollection(payload: any): Promise<any> {
  return request('/api/collections/receive', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiCarryForwardVoucher(payload: any): Promise<any> {
  return request('/api/vouchers/carry-forward', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiVoucherBatchUpdate(payload: any): Promise<any> {
  return request('/api/vouchers/batch-update', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateInstituteSettings(settings: any): Promise<any> {
  return request('/api/institute', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export async function apiValidateCode(code: string): Promise<any> {
  return request('/api/auth/validate-code', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function apiNextDocumentNumber(prefix: string, year: string, digits = 6): Promise<string | null> {
  try {
    const res = await request('/api/sequences/next', {
      method: 'POST',
      body: JSON.stringify({ prefix, year, digits }),
    });
    return res?.documentNumber || null;
  } catch {
    return null;
  }
}
