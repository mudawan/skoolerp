import React, { useCallback, useEffect, useState } from 'react';
import './platform.css';
import { ApiHealth, DatabaseHealth, Errors, Overview, RANGES, Range } from './pages';
import { Admins, Audit, Schools, can } from './support';

interface Admin { id: string; username: string; name?: string; fullName?: string; full_name?: string; role: string; permissions?: string[] }
const PAGES: { id: string; label: string; perm: string; monitor?: boolean }[] = [
  { id: 'overview', label: 'Overview', perm: 'platform.monitor.view' },
  { id: 'api', label: 'API health', perm: 'platform.monitor.view', monitor: true },
  { id: 'database', label: 'Database', perm: 'platform.monitor.view', monitor: true },
  { id: 'errors', label: 'Errors', perm: 'platform.monitor.view', monitor: true },
  { id: 'schools', label: 'Schools', perm: 'platform.schools.view' },
  { id: 'audit', label: 'Audit log', perm: 'platform.audit.view' },
  { id: 'admins', label: 'Platform admins', perm: 'platform.admins.manage' },
];
const ROLE: Record<string, string> = { owner: 'Owner', support: 'Support', observer: 'Observer' };

function Login({ onDone }: { onDone: (a: Admin) => void }) {
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const res = await fetch('/api/platform/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
      const b = await res.json().catch(() => ({}));
      if (res.ok && b.success) onDone(b.admin); else setErr(b.error || (res.status === 429 ? 'Too many attempts. Try again later.' : 'Sign-in failed.'));
    } catch { setErr('Could not reach the server.'); } finally { setBusy(false); }
  };
  return (
    <div className="pf-login">
      <form onSubmit={submit}>
        <h1 style={{ fontSize: 18 }}>Platform sign-in</h1>
        <p className="pf-muted" style={{ margin: 0 }}>For the app owner and support team. School accounts do not work here.</p>
        <label>Username<input className="pf-input" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} autoFocus /></label>
        <label>Password<input className="pf-input" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></label>
        {err && <div className="pf-error" role="alert">{err}</div>}
        <button className="pf-btn pf-btn-primary" disabled={busy || !u || !p}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function PlatformApp() {
  const [admin, setAdmin] = useState<Admin | null | undefined>(undefined);
  const [page, setPage] = useState('overview');
  const [range, setRange] = useState<Range>('24h');
  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 4000); }, []);
  useEffect(() => {
    document.title = 'Platform';
    const load = async () => {
      try {
        const r = await fetch('/api/platform/me', { credentials: 'same-origin' });
        const b = r.ok ? await r.json() : null;
        setAdmin(b?.admin || null);
      } catch { setAdmin(null); }
    };
    void load();
  }, []);
  const out = useCallback(() => setAdmin(null), []);
  const logout = async () => { try { await fetch('/api/platform/logout', { method: 'POST', credentials: 'same-origin' }); } finally { setAdmin(null); } };
  if (admin === undefined) return <div className="pf-root"><div className="pf-empty">Loading…</div></div>;
  if (!admin) return <div className="pf-root"><Login onDone={setAdmin} /></div>;
  return (
    <div className="pf-root">
      <header className="pf-top">
        <div className="pf-brand">Platform<small>Monitoring</small></div>
        <nav className="pf-nav" aria-label="Sections">
          {PAGES.filter((p) => can(admin, p.perm)).map((p) => <button key={p.id} className="pf-tab" aria-current={page === p.id ? 'page' : undefined} onClick={() => setPage(p.id)}>{p.label}</button>)}
        </nav>
        <div className="pf-spacer" />
        <div className="pf-who">{admin.name || admin.fullName || admin.full_name || admin.username}<span className="pf-badge">{ROLE[admin.role] || admin.role}</span><button className="pf-btn" onClick={logout}>Sign out</button></div>
      </header>
      <main className="pf-main">
        {PAGES.find((p) => p.id === page)?.monitor && (
          <div className="pf-filters">
            <div className="pf-seg" role="group" aria-label="Time range">
              {RANGES.map((r) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}
            </div>
          </div>
        )}
        {page === 'overview' && <Overview out={out} goto={setPage} />}
        {page === 'api' && <ApiHealth range={range} out={out} />}
        {page === 'database' && <DatabaseHealth range={range} out={out} />}
        {page === 'errors' && <Errors range={range} out={out} />}
        {page === 'schools' && can(admin, 'platform.schools.view') && <Schools admin={admin} out={out} notify={notify} />}
        {page === 'audit' && can(admin, 'platform.audit.view') && <Audit out={out} />}
        {page === 'admins' && can(admin, 'platform.admins.manage') && <Admins admin={admin} out={out} notify={notify} />}
      </main>
      {toast && <div className="pf-toast" role="status">{toast}</div>}
    </div>
  );
}
