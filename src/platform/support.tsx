// Schools, platform admins and the platform audit log. Every action goes through /api/platform/* and is
// checked again on the server; the buttons shown here only mirror the signed-in admin's permissions.
import React, { useState } from 'react';
import { Card, Status, fmtTime, usePolled } from './charts';

export interface Admin { id: string; username: string; name?: string; role: string; permissions?: string[] }
export const can = (a: Admin, perm: string) => !!a.permissions?.includes(perm);

type Out = () => void;
type Notify = (m: string) => void;

async function send(url: string, method: 'POST' | 'PUT', body: unknown, out: Out): Promise<{ ok: boolean; data: any }> {
  try {
    const res = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
    if (res.status === 401) { out(); return { ok: false, data: { error: 'Signed out.' } }; }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.success !== false, data };
  } catch {
    return { ok: false, data: { error: 'Could not reach the server.' } };
  }
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="pf-modal-bg" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pf-modal" role="dialog" aria-modal="true" aria-label={title}><h2>{title}</h2>{children}</div>
    </div>
  );
}

/** Generic confirm step with an optional extra form body; shows the server's error in place. */
function Confirm({ title, body, confirmLabel, danger, onClose, onConfirm, disabled, children }: {
  title: string; body?: React.ReactNode; confirmLabel: string; danger?: boolean; onClose: () => void;
  onConfirm: () => Promise<string | null>; disabled?: boolean; children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => { setBusy(true); setErr(null); const e = await onConfirm(); setBusy(false); if (e) setErr(e); };
  return (
    <Modal title={title} onClose={onClose}>
      {body && <div className="pf-muted" style={{ fontSize: 13.5 }}>{body}</div>}
      {children}
      {err && <div className="pf-error" role="alert">{err}</div>}
      <div className="pf-actions">
        <button className="pf-btn" onClick={onClose}>Cancel</button>
        <button className={`pf-btn ${danger ? 'pf-btn-danger' : 'pf-btn-primary'}`} disabled={busy || disabled} onClick={go}>{busy ? 'Working…' : confirmLabel}</button>
      </div>
    </Modal>
  );
}

function Secret({ username, password, expiresAt, onClose }: { username: string; password: string; expiresAt: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(password); setCopied(true); } catch { /* the text is selectable */ } };
  return (
    <Modal title="Temporary password" onClose={() => { /* must be closed with the button, so it is not lost by a stray click */ }}>
      <div className="pf-muted" style={{ fontSize: 13.5 }}>For <b>{username}</b>. Give it to them directly. It is shown <b>only now</b> and cannot be retrieved later.</div>
      <div className="pf-secret" data-testid="temp-password">{password}</div>
      <div className="pf-muted" style={{ fontSize: 13 }}>They must choose a new password at their next sign-in. It stops working on {fmtTime(expiresAt, true)}. Their existing sessions were ended.</div>
      <div className="pf-actions">
        <button className="pf-btn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        <button className="pf-btn pf-btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

// ---------------- Schools ----------------
export function Schools({ admin, out, notify }: { admin: Admin; out: Out; notify: Notify }) {
  const list = usePolled<any>('/api/platform/schools', out);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [dlg, setDlg] = useState<null | { kind: 'suspend' | 'reactivate' | 'signout-all' }>(null);
  const schools: any[] = list.data?.schools || [];
  const shown = schools.filter((s) => !q.trim() || `${s.name} ${s.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  const school = schools.find((s) => s.id === sel) || null;
  const canSuspend = can(admin, 'platform.schools.suspend'), canUsers = can(admin, 'platform.users.manage');

  return (
    <>
      <div className="pf-filters">
        <input className="pf-input" aria-label="Search schools" placeholder="Search name or code" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <span className="pf-muted">{shown.length} of {schools.length} schools</span>
      </div>
      {list.error && !list.data && <div className="pf-card pf-error" role="alert">{list.error}</div>}
      <Card title="Schools" sub="Select a school to see its users and the actions available to you.">
        <div className="pf-scroll" style={{ maxHeight: 360 }}>
          <table className="pf-table">
            <thead><tr><th>School</th><th>Code</th><th>Status</th><th className="num">Users</th><th className="num">Signed in now</th><th>Last sign-in</th><th className="num">Problems (7d)</th></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className={`click${s.id === sel ? ' sel' : ''}`} onClick={() => setSel(s.id)}>
                  <td>{s.name}</td><td><code>{s.code}</code></td>
                  <td>{s.status === 'suspended' ? <Status level="serious" label="Suspended" /> : <Status level="good" label="Active" />}</td>
                  <td className="num">{s.activeUsers}/{s.users}</td><td className="num">{s.sessions}</td>
                  <td>{s.lastLogin ? fmtTime(s.lastLogin, true) : '–'}</td><td className="num">{s.errors7d}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="pf-muted">No schools match.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {school && (
        <div style={{ marginTop: 14 }}>
          <Card title={school.name} sub={`Code ${school.code}${school.status === 'suspended' ? ` · suspended ${school.suspendedAt ? fmtTime(school.suspendedAt, true) : ''} by ${school.suspendedBy || '?'}` : ''}`}
            right={
              <div className="pf-row-actions">
                {canUsers && <button className="pf-btn pf-btn-sm" onClick={() => setDlg({ kind: 'signout-all' })}>Sign everyone out</button>}
                {canSuspend && (school.status === 'suspended'
                  ? <button className="pf-btn pf-btn-sm pf-btn-primary" onClick={() => setDlg({ kind: 'reactivate' })}>Reactivate school</button>
                  : <button className="pf-btn pf-btn-sm pf-btn-danger" onClick={() => setDlg({ kind: 'suspend' })}>Suspend school…</button>)}
              </div>
            }>
            {school.status === 'suspended' && <div className="pf-note"><Status level="serious" label="Suspended" /> Reason: {school.suspendReason || '–'}</div>}
            <SchoolUsers school={school} admin={admin} out={out} notify={notify} onChanged={list.reload} />
          </Card>
        </div>
      )}
      {dlg?.kind === 'suspend' && school && <SuspendDialog school={school} out={out} onClose={() => setDlg(null)} done={(m) => { setDlg(null); notify(m); list.reload(); }} />}
      {dlg?.kind === 'reactivate' && school && (
        <Confirm title={`Reactivate ${school.name}?`} body="Users can sign in again. Nobody is signed in automatically." confirmLabel="Reactivate"
          onClose={() => setDlg(null)}
          onConfirm={async () => { const r = await send(`/api/platform/schools/${school.id}/reactivate`, 'POST', {}, out); if (!r.ok) return r.data.error || 'Failed.'; setDlg(null); notify('School reactivated.'); list.reload(); return null; }} />
      )}
      {dlg?.kind === 'signout-all' && school && (
        <Confirm title={`Sign everyone out of ${school.name}?`} body={`${school.sessions} active session(s) will end. Users can sign in again straight away.`} confirmLabel="Sign everyone out" danger
          onClose={() => setDlg(null)}
          onConfirm={async () => { const r = await send(`/api/platform/schools/${school.id}/revoke-sessions`, 'POST', {}, out); if (!r.ok) return r.data.error || 'Failed.'; setDlg(null); notify(`${r.data.sessionsEnded} session(s) ended.`); list.reload(); return null; }} />
      )}
    </>
  );
}

function SuspendDialog({ school, out, onClose, done }: { school: any; out: Out; onClose: () => void; done: (m: string) => void }) {
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');
  const ok = reason.trim().length >= 5 && code.trim().toLowerCase() === String(school.code).toLowerCase();
  return (
    <Confirm title={`Suspend ${school.name}?`} confirmLabel="Suspend school" danger disabled={!ok} onClose={onClose}
      body="Everyone is signed out now and cannot sign in until you reactivate the school. No data is changed or deleted."
      onConfirm={async () => {
        const r = await send(`/api/platform/schools/${school.id}/suspend`, 'POST', { reason, confirmCode: code }, out);
        if (!r.ok) return r.data.error || 'Failed.';
        done(`School suspended. ${r.data.sessionsEnded} session(s) ended.`); return null;
      }}>
      <label>Reason (kept in the audit log)<textarea className="pf-input" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
      <label>Type the school code <b>{school.code}</b> to confirm<input className="pf-input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" /></label>
    </Confirm>
  );
}

function SchoolUsers({ school, admin, out, notify, onChanged }: { school: any; admin: Admin; out: Out; notify: Notify; onChanged: () => void }) {
  const r = usePolled<any>(`/api/platform/schools/${school.id}/users`, out);
  const [dlg, setDlg] = useState<null | { kind: 'reset' | 'signout' | 'deactivate' | 'reactivate'; user: any }>(null);
  const [secret, setSecret] = useState<null | { username: string; password: string; expiresAt: string }>(null);
  const canUsers = can(admin, 'platform.users.manage');
  const users: any[] = r.data?.users || [];
  const base = (u: any) => `/api/platform/schools/${school.id}/users/${u.id}`;
  const refresh = () => { r.reload(); onChanged(); };
  return (
    <div className={r.loading ? 'pf-refetching' : ''}>
      <div className="pf-scroll" style={{ maxHeight: 420 }}>
        <table className="pf-table">
          <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last sign-in</th><th className="num">Sessions</th>{canUsers && <th />}</tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><b>{u.name}</b><div className="pf-muted pf-mono">@{u.username}</div></td>
                <td>{u.role}</td>
                <td>
                  {u.status === 'deactivated' ? <Status level="serious" label={u.platformLocked ? 'Deactivated by platform' : 'Deactivated'} /> : <Status level="good" label="Active" />}
                  {u.mustChangePassword && <div className="pf-muted" style={{ marginTop: 2 }}>Must set a new password{u.tempPasswordExpiresAt ? ` by ${fmtTime(u.tempPasswordExpiresAt, true)}` : ''}</div>}
                </td>
                <td>{u.lastLogin ? fmtTime(u.lastLogin, true) : '–'}</td><td className="num">{u.sessions}</td>
                {canUsers && (
                  <td><div className="pf-row-actions">
                    <button className="pf-btn pf-btn-sm" onClick={() => setDlg({ kind: 'reset', user: u })}>Reset password</button>
                    <button className="pf-btn pf-btn-sm" disabled={u.sessions === 0} onClick={() => setDlg({ kind: 'signout', user: u })}>Sign out</button>
                    {u.status === 'deactivated'
                      ? <button className="pf-btn pf-btn-sm" onClick={() => setDlg({ kind: 'reactivate', user: u })}>Reactivate</button>
                      : <button className="pf-btn pf-btn-sm pf-btn-danger" onClick={() => setDlg({ kind: 'deactivate', user: u })}>Deactivate</button>}
                  </div></td>
                )}
              </tr>
            ))}
            {r.data && users.length === 0 && <tr><td colSpan={6} className="pf-muted">This school has no users.</td></tr>}
          </tbody>
        </table>
      </div>
      {r.error && <div className="pf-error" role="alert">{r.error}</div>}
      {dlg?.kind === 'reset' && <ResetRunner user={dlg.user} url={`${base(dlg.user)}/reset-password`} out={out} onCancel={() => setDlg(null)} onSecret={(s) => { setDlg(null); setSecret(s); refresh(); }} />}
      {dlg?.kind === 'signout' && (
        <Confirm title={`Sign ${dlg.user.name} out everywhere?`} body={`${dlg.user.sessions} session(s) will end. Their password is unchanged.`} confirmLabel="Sign out" onClose={() => setDlg(null)}
          onConfirm={async () => { const x = await send(`${base(dlg.user)}/revoke-sessions`, 'POST', {}, out); if (!x.ok) return x.data.error || 'Failed.'; setDlg(null); notify(`${x.data.sessionsEnded} session(s) ended.`); refresh(); return null; }} />
      )}
      {dlg?.kind === 'deactivate' && (
        <Confirm title={`Deactivate ${dlg.user.name}?`} body="They are signed out and cannot sign in. Their records stay. Only platform staff can reactivate an account deactivated here." confirmLabel="Deactivate" danger onClose={() => setDlg(null)}
          onConfirm={async () => { const x = await send(`${base(dlg.user)}/deactivate`, 'POST', {}, out); if (!x.ok) return x.data.error || 'Failed.'; setDlg(null); notify('User deactivated.'); refresh(); return null; }} />
      )}
      {dlg?.kind === 'reactivate' && (
        <Confirm title={`Reactivate ${dlg.user.name}?`} body="They can sign in again with their current password." confirmLabel="Reactivate" onClose={() => setDlg(null)}
          onConfirm={async () => { const x = await send(`${base(dlg.user)}/reactivate`, 'POST', {}, out); if (!x.ok) return x.data.error || 'Failed.'; setDlg(null); notify('User reactivated.'); refresh(); return null; }} />
      )}
      {secret && <Secret {...secret} onClose={() => setSecret(null)} />}
    </div>
  );
}

// The reset confirm and the call are kept in one place: the dialog above only explains; this performs it.
function ResetRunner({ user, url, out, onCancel, onSecret }: { user: any; url: string; out: Out; onCancel: () => void; onSecret: (s: { username: string; password: string; expiresAt: string }) => void }) {
  return (
    <Confirm title={`Reset password for ${user.name}?`} confirmLabel="Issue temporary password" onClose={onCancel}
      body="A one-time password is created. Their current password stops working, they are signed out everywhere, and they must choose a new password at next sign-in. The school's own audit trail records that support did this."
      onConfirm={async () => {
        const r = await send(url, 'POST', {}, out);
        if (!r.ok) return r.data.error || 'Failed.';
        onSecret({ username: r.data.username, password: r.data.temporaryPassword, expiresAt: r.data.expiresAt });
        return null;
      }} />
  );
}

// ---------------- Platform admins (Owner) ----------------
export function Admins({ admin, out, notify }: { admin: Admin; out: Out; notify: Notify }) {
  const r = usePolled<any>('/api/platform/admins', out);
  const [dlg, setDlg] = useState<null | { mode: 'create' } | { mode: 'edit'; a: any }>(null);
  const admins: any[] = r.data?.admins || [];
  return (
    <>
      <div className="pf-head"><h2>Platform admins</h2><div className="pf-spacer" /><button className="pf-btn pf-btn-primary" onClick={() => setDlg({ mode: 'create' })}>Add admin</button></div>
      <Card title="People with platform access" sub="Owner: everything. Support: monitor, schools, users, audit. Observer: view only.">
        <div className="pf-scroll">
          <table className="pf-table">
            <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}{a.id === admin.id && <span className="pf-badge" style={{ marginLeft: 6 }}>you</span>}</td><td className="pf-mono">{a.username}</td>
                  <td>{a.role}</td><td>{a.status === 'active' ? <Status level="good" label="Active" /> : <Status level="serious" label="Deactivated" />}</td>
                  <td>{a.lastLogin ? fmtTime(a.lastLogin, true) : '–'}</td>
                  <td><div className="pf-row-actions"><button className="pf-btn pf-btn-sm" onClick={() => setDlg({ mode: 'edit', a })}>Edit</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.error && <div className="pf-error" role="alert">{r.error}</div>}
      </Card>
      {dlg && <AdminForm key={dlg.mode === 'edit' ? dlg.a.id : 'new'} dlg={dlg} self={admin} out={out} onClose={() => setDlg(null)} done={(m) => { setDlg(null); notify(m); r.reload(); }} />}
    </>
  );
}

function AdminForm({ dlg, self, out, onClose, done }: { dlg: { mode: 'create' } | { mode: 'edit'; a: any }; self: Admin; out: Out; onClose: () => void; done: (m: string) => void }) {
  const a = dlg.mode === 'edit' ? dlg.a : null;
  const isSelf = !!a && a.id === self.id;
  const [username, setUsername] = useState('');
  const [name, setName] = useState(a?.name || '');
  const [role, setRole] = useState(a?.role || 'support');
  const [status, setStatus] = useState(a?.status || 'active');
  const [password, setPassword] = useState('');
  return (
    <Confirm title={a ? `Edit ${a.name}` : 'Add platform admin'} confirmLabel={a ? 'Save' : 'Create'} onClose={onClose}
      onConfirm={async () => {
        const r = a
          ? await send(`/api/platform/admins/${a.id}`, 'PUT', { name, ...(isSelf ? {} : { role, status }), ...(password ? { password } : {}) }, out)
          : await send('/api/platform/admins', 'POST', { username, name, role, password }, out);
        if (!r.ok) return r.data.error || 'Failed.';
        done(a ? 'Saved.' : 'Admin created.'); return null;
      }}>
      {!a && <label>Username<input className="pf-input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" /></label>}
      <label>Full name<input className="pf-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>Role
        <select className="pf-select" value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
          <option value="owner">Owner</option><option value="support">Support</option><option value="observer">Observer</option>
        </select>
      </label>
      {a && !isSelf && (
        <label>Status
          <select className="pf-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="deactivated">Deactivated</option></select>
        </label>
      )}
      <label>{a ? 'New password (leave empty to keep; ends their sessions)' : 'Password (12–128 characters)'}
        <input className="pf-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {isSelf && <div className="pf-muted" style={{ fontSize: 12.5 }}>You cannot change your own role or status.</div>}
    </Confirm>
  );
}

// ---------------- Audit log ----------------
export function Audit({ out }: { out: Out }) {
  const r = usePolled<any>('/api/platform/audit-logs?limit=400', out);
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const logs: any[] = r.data?.logs || [];
  const types = Array.from(new Set(logs.map((l) => l.actionType))).sort();
  const t = text.trim().toLowerCase();
  const shown = logs.filter((l) => (!type || l.actionType === type) && (!t || `${l.adminUsername} ${l.schoolName} ${l.description} ${l.actionTitle}`.toLowerCase().includes(t)));
  return (
    <>
      <div className="pf-filters">
        <select className="pf-select" aria-label="Action" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All actions</option>{types.map((x) => <option key={x} value={x}>{x.replace(/_/g, ' ')}</option>)}
        </select>
        <input className="pf-input" aria-label="Search" placeholder="Search admin, school or text" value={text} onChange={(e) => setText(e.target.value)} style={{ width: 260 }} />
        <span className="pf-muted">{shown.length} shown</span>
      </div>
      <Card title="Platform audit log" sub="Everything platform staff did. Passwords are never recorded.">
        <div className="pf-scroll" style={{ maxHeight: 620 }}>
          <table className="pf-table">
            <thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>School</th><th>Detail</th></tr></thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(l.timestamp, true)}</td>
                  <td>{l.adminUsername || '–'}{l.adminRole && <span className="pf-muted"> · {l.adminRole}</span>}</td>
                  <td>{l.actionTitle || l.actionType}</td><td>{l.schoolName || '–'}</td><td>{l.description || ''}</td>
                </tr>
              ))}
              {r.data && shown.length === 0 && <tr><td colSpan={5} className="pf-muted">Nothing matches.</td></tr>}
            </tbody>
          </table>
        </div>
        {r.error && <div className="pf-error" role="alert">{r.error}</div>}
      </Card>
    </>
  );
}
