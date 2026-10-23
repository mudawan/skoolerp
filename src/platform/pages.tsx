import React, { useMemo, useState } from 'react';
import { Card, HBars, LineChart, Severity, StackedBars, StatTile, Status, fmtBytes, fmtDuration, fmtInt, fmtMs, fmtPct, fmtTime, usePolled } from './charts';

export type Range = '1h' | '6h' | '24h' | '7d' | '14d';
export const RANGES: Range[] = ['1h', '6h', '24h', '7d', '14d'];
type Out = () => void;

// Fixed slots per entity: a filter never repaints the survivors.
export const KIND_LABEL: Record<string, string> = {
  server_error: 'Server error', conflict: 'Conflict', rejected: 'Rejected write', aborted: 'Aborted', slow_request: 'Slow request',
  unhandled_exception: 'Unhandled exception', db_unreachable: 'Database unreachable', db_recovered: 'Database recovered',
  events_suppressed: 'Events suppressed', client_network: 'Dropped on the device', client_error: 'Browser error', rate_limited: 'Rate limited',
};
const SLOT: Record<string, string> = { server_error: 'var(--series-1)', conflict: 'var(--series-2)', client_network: 'var(--series-3)', rejected: 'var(--series-4)' };
const DROPPED = ['server_error', 'conflict', 'rejected', 'aborted', 'client_network', 'unhandled_exception'];

function Shell<T>({ r, children }: { r: { data: T | null; error: string | null; loading: boolean }; children: (d: T) => React.ReactNode }) {
  if (!r.data) return r.error ? <div className="pf-card pf-error" role="alert">{r.error}</div> : <div className="pf-empty">Loading…</div>;
  return (
    <div className={r.loading ? 'pf-refetching' : ''}>
      {r.error && <div className="pf-error" role="alert" style={{ marginBottom: 8 }}>{r.error} Showing the last result.</div>}
      {children(r.data)}
    </div>
  );
}

const sev = (v: number | null, warn: number, serious: number, crit: number): Severity | undefined =>
  v == null ? undefined : v >= crit ? 'critical' : v >= serious ? 'serious' : v >= warn ? 'warning' : 'good';

// ---------- Overview ----------
export function Overview({ out, goto }: { out: Out; goto: (p: string) => void }) {
  const api = usePolled<any>('/api/platform/monitor/api?range=1h', out);
  const db = usePolled<any>('/api/platform/monitor/database?range=1h', out);
  const er = usePolled<any>('/api/platform/monitor/errors?range=1h&limit=1', out);
  const ready = api.data && db.data && er.data;
  if (!ready) return <Shell r={{ data: null, error: api.error || db.error || er.error, loading: false }}>{() => null}</Shell>;
  const t = api.data.totals, s = db.data.summary, series = api.data.series as any[];
  const dropped = (er.data.byKind as any[]).filter((k) => DROPPED.includes(k.kind)).reduce((a, k) => a + k.n, 0);
  const availLevel: Severity | undefined = s.availability == null ? undefined : s.availability >= 0.999 ? 'good' : s.availability >= 0.98 ? 'warning' : s.availability >= 0.9 ? 'serious' : 'critical';
  return (
    <div className={api.loading || db.loading ? 'pf-refetching' : ''}>
      <p className="pf-muted" style={{ marginTop: 0 }}>Last hour. Updates every 30 seconds.</p>
      <div className="pf-grid pf-tiles">
        <StatTile hero label="Requests per minute" value={t.requestsPerMinute} foot={`${fmtInt(t.count)} ${t.count === 1 ? 'request' : 'requests'}`} trend={series.map((x) => x.count)} />
        <StatTile label="Server errors (5xx)" value={fmtPct(t.errorRate5xx)} level={sev(t.errorRate5xx, 0.001, 0.01, 0.05)} foot={`${fmtInt(t.errors5xx)} ${t.errors5xx === 1 ? 'request' : 'requests'}`} trend={series.map((x) => x.errors5xx)} />
        <StatTile label="Slowest 5% take over" value={fmtMs(t.p95Ms)} level={t.p95Ms == null ? undefined : sev(t.p95Ms, 1000, 2500, 5000)} foot={`median ${fmtMs(t.p50Ms)}`} />
        <StatTile label="Database reachable" value={fmtPct(s.availability, 2)} level={availLevel} foot={`${fmtInt(s.samples)} checks`} />
        <StatTile label="Database latency (p95)" value={fmtMs(s.latencyP95Ms)} level={s.latencyP95Ms == null ? undefined : sev(s.latencyP95Ms, 100, 500, 2000)} foot={`median ${fmtMs(s.latencyP50Ms)}`} />
        <StatTile label="Commands that may have been lost" value={fmtInt(dropped)} level={dropped === 0 ? 'good' : dropped < 5 ? 'warning' : 'serious'} foot="Writes that failed or never got an answer" />
      </div>
      <div className="pf-grid pf-cols-2">
        <Card title="Requests" sub="Per interval, last hour">
          <LineChart x={series.map((x) => x.t)} series={[{ name: 'Requests', color: 'var(--series-1)', values: series.map((x) => x.count) }]} area />
        </Card>
        <Card title="Errors by kind" sub="Count of events, last hour" right={<button className="pf-linkbtn" onClick={() => goto('errors')}>Open error log</button>}>
          <ErrorBars data={er.data} long={false} />
        </Card>
      </div>
    </div>
  );
}

function ErrorBars({ data, long }: { data: any; long: boolean }) {
  const kinds = useMemo(() => {
    const present = new Set<string>(data.byKind.map((k: any) => k.kind));
    return { named: Object.keys(SLOT).filter((k) => present.has(k)), hasOther: [...present].some((k) => !SLOT[k]) };
  }, [data]);
  const times: string[] = Array.from(new Set<string>(data.series.map((r: any) => r.t))).sort();
  const val = (pred: (k: string) => boolean) => times.map((t) => data.series.filter((r: any) => r.t === t && pred(r.kind)).reduce((a: number, r: any) => a + r.n, 0));
  const series = [
    ...kinds.named.map((k) => ({ name: KIND_LABEL[k], color: SLOT[k], values: val((x) => x === k) })),
    ...(kinds.hasOther ? [{ name: 'Other', color: 'var(--series-other)', values: val((x) => !SLOT[x]) }] : []),
  ];
  return <StackedBars x={times} series={series} long={long} empty="No errors recorded in this period." />;
}

// ---------- API health ----------
export function ApiHealth({ range, out }: { range: Range; out: Out }) {
  const r = usePolled<any>(`/api/platform/monitor/api?range=${range}`, out);
  const long = range === '7d' || range === '14d';
  return (
    <Shell r={r}>{(d) => {
      const t = d.totals, s = d.series as any[];
      const x = s.map((p) => p.t);
      const sorted = [...(d.routes as any[])].sort((a, b) => b.count - a.count);
      const routes = sorted.slice(0, 12);
      return (
        <>
          <div className="pf-grid pf-tiles">
            <StatTile label="Requests" value={fmtInt(t.count)} foot={`${t.requestsPerMinute} per minute`} trend={s.map((p) => p.count)} />
            <StatTile label="Server errors (5xx)" value={fmtPct(t.errorRate5xx)} level={sev(t.errorRate5xx, 0.001, 0.01, 0.05)} foot={`${fmtInt(t.errors5xx)} ${t.errors5xx === 1 ? 'request' : 'requests'}`} />
            <StatTile label="Client errors (4xx)" value={fmtPct(t.errorRate4xx)} foot={`${fmtInt(t.errors4xx)} ${t.errors4xx === 1 ? 'request' : 'requests'}`} />
            <StatTile label="Median / p95" value={fmtMs(t.p50Ms)} foot={`p95 ${fmtMs(t.p95Ms)} · max ${fmtMs(t.maxMs)}`} />
          </div>
          <div className="pf-grid pf-cols-2">
            <Card title="Traffic" sub="Requests per interval">
              <LineChart x={x} long={long} area series={[{ name: 'Requests', color: 'var(--series-1)', values: s.map((p) => p.count) }]} />
            </Card>
            <Card title="Response time" sub="Estimated from timing buckets; value is the upper edge of the bucket">
              <LineChart x={x} long={long} fmt={(v) => fmtMs(v)} series={[
                { name: 'Median', color: 'var(--series-1)', values: s.map((p) => p.p50Ms) },
                { name: '95th percentile', color: 'var(--series-2)', values: s.map((p) => p.p95Ms) },
              ]} />
            </Card>
            <Card title="Failed requests" sub="Count per interval">
              <StackedBars x={x} long={long} series={[
                { name: 'Server errors (5xx)', color: 'var(--series-1)', values: s.map((p) => p.errors5xx) },
                { name: 'Client errors (4xx)', color: 'var(--series-2)', values: s.map((p) => p.errors4xx) },
              ]} empty="No failed requests in this period." />
            </Card>
            <Card title="Busiest routes" sub="Requests in the period">
              <HBars rows={routes.map((q) => ({ key: q.method + q.route, label: `${q.method} ${q.route}`, value: q.count }))} />
            </Card>
          </div>
          <Card title="Routes" sub="Sorted by volume. Percentiles are bucket estimates.">
            <div className="pf-scroll">
              <table className="pf-table">
                <thead><tr><th>Route</th><th className="num">Requests</th><th className="num">5xx</th><th className="num">4xx</th><th className="num">Median</th><th className="num">p95</th><th className="num">Max</th></tr></thead>
                <tbody>
                  {sorted.map((q) => (
                    <tr key={q.method + q.route}>
                      <td><code>{q.method} {q.route}</code></td><td className="num">{fmtInt(q.count)}</td>
                      <td className="num">{fmtInt(q.errors5xx)}</td><td className="num">{fmtInt(q.errors4xx)}</td>
                      <td className="num">{fmtMs(q.p50Ms)}</td><td className="num">{fmtMs(q.p95Ms)}</td><td className="num">{fmtMs(q.maxMs)}</td>
                    </tr>
                  ))}
                  {d.routes.length === 0 && <tr><td colSpan={7} className="pf-muted">No requests recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      );
    }}</Shell>
  );
}

// ---------- Database ----------
export function DatabaseHealth({ range, out }: { range: Range; out: Out }) {
  const r = usePolled<any>(`/api/platform/monitor/database?range=${range}`, out);
  const long = range === '7d' || range === '14d';
  return (
    <Shell r={r}>{(d) => {
      const s = d.summary, L = d.live || {}, sn = d.snapshot, ser = d.series as any[], x = ser.map((p) => p.t), c = d.connection || {}, sv = d.server || {};
      const orphanTotal: number | null = sn ? (Object.values(sn.orphans || {}) as any[]).reduce((a: number, n: any) => a + Number(n), 0) : null;
      const availLevel: Severity | undefined = s.availability == null ? undefined : s.availability >= 0.999 ? 'good' : s.availability >= 0.98 ? 'warning' : s.availability >= 0.9 ? 'serious' : 'critical';
      return (
        <>
          <div className="pf-grid pf-tiles">
            <StatTile label="Reachable" value={fmtPct(s.availability, 2)} level={availLevel} foot={`${fmtInt(s.samples)} checks`} />
            <StatTile label="Latency (median / p95)" value={fmtMs(s.latencyP50Ms)} foot={`p95 ${fmtMs(s.latencyP95Ms)}`} />
            <StatTile label="Connections" value={fmtInt((Object.values(L.connectionsByState || {}) as number[]).reduce((a, n) => a + n, 0))} foot={L.maxConnections ? `limit ${fmtInt(L.maxConnections)}` : undefined} />
            <StatTile label="Database size" value={fmtBytes(sn?.dbBytes ?? L.sizeBytes)} foot={sn ? `measured ${fmtTime(sn.at, true)}` : undefined} />
            <StatTile label="Deadlocks" value={fmtInt(s.deadlocks)} level={s.deadlocks > 0 ? 'serious' : 'good'} foot="in this period" />
            <StatTile label="Orphan rows" value={orphanTotal == null ? '–' : fmtInt(orphanTotal)} level={orphanTotal == null ? undefined : orphanTotal > 0 ? 'warning' : 'good'} foot="Records pointing at something missing" />
          </div>
          <div className="pf-grid pf-cols-2">
            <Card title="Latency" sub="Round-trip of the health query">
              <LineChart x={x} long={long} fmt={(v) => fmtMs(v)} series={[
                { name: 'Average', color: 'var(--series-1)', values: ser.map((p) => p.latencyAvgMs) },
                { name: 'Worst', color: 'var(--series-2)', values: ser.map((p) => p.latencyMaxMs) },
              ]} />
            </Card>
            <Card title="Connections in use" sub="Highest in each interval">
              <LineChart x={x} long={long} series={[
                { name: 'Server connections', color: 'var(--series-1)', values: ser.map((p) => p.connectionsMax) },
                { name: 'App pool in use', color: 'var(--series-2)', values: ser.map((p) => p.poolInUseMax) },
              ]} />
            </Card>
            <Card title="Rollbacks" sub="Transactions rolled back per interval">
              <LineChart x={x} long={long} series={[{ name: 'Rollbacks', color: 'var(--series-1)', values: ser.map((p) => p.rollbacks) }]} />
            </Card>
            <Card title="Database size" sub="Hourly measurement">
              <LineChart x={(d.sizeSeries as any[]).map((p) => p.t)} long fmt={(v) => fmtBytes(v)} series={[{ name: 'Size', color: 'var(--series-1)', values: (d.sizeSeries as any[]).map((p) => p.bytes) }]} empty="The first size measurement is taken within the hour." />
            </Card>
          </div>
          <div className="pf-grid pf-cols-2">
            <Card title="Connection" sub="Read-only. Set by the server environment, not editable here.">
              <dl className="pf-kv">
                <dt>Host</dt><dd>{c.host || '–'}</dd><dt>Port</dt><dd>{c.port || '–'}</dd>
                <dt>Database</dt><dd>{c.database || '–'}</dd><dt>User</dt><dd>{c.user || '–'}</dd>
                <dt>Configured by</dt><dd>{c.source}</dd><dt>Version</dt><dd>{L.version || '–'}</dd>
                <dt>Database uptime</dt><dd>{fmtDuration(L.uptimeSeconds)}</dd>
              </dl>
              <div className="pf-note">To point the app at a different database, change <code>DATABASE_URL</code> in the server environment and restart. The password is never shown here.</div>
            </Card>
            <Card title="This server" sub="The app process">
              <dl className="pf-kv">
                <dt>Uptime</dt><dd>{fmtDuration(sv.uptimeSeconds)}</dd><dt>Node</dt><dd>{sv.node}</dd>
                <dt>Memory (RSS)</dt><dd>{fmtBytes(sv.rssBytes)}</dd><dt>Heap used</dt><dd>{fmtBytes(sv.heapUsedBytes)}</dd>
                <dt>Live update clients</dt><dd>{fmtInt(sv.connectedClients)}</dd>
                <dt>Pool (total / idle / waiting)</dt><dd>{d.pool ? `${d.pool.total} / ${d.pool.idle} / ${d.pool.waiting}` : '–'}</dd>
                <dt>Schools</dt><dd>{fmtInt(L.schools)}</dd><dt>Active sessions</dt><dd>{fmtInt(L.activeSessions)}</dd>
              </dl>
              {(L.longRunning?.length > 0 || L.lockWaiters > 0 || L.idleInTransaction > 0) && (
                <div className="pf-note">
                  <Status level="warning" label="Needs a look" />{' '}
                  {L.longRunning?.length > 0 && <>Running over 5 s: {L.longRunning.map((q: any) => `${q.verb} ${q.seconds}s`).join(', ')}. </>}
                  {L.lockWaiters > 0 && <>{L.lockWaiters} waiting on locks. </>}
                  {L.idleInTransaction > 0 && <>{L.idleInTransaction} idle in a transaction.</>}
                </div>
              )}
            </Card>
          </div>
          <Card title="Storage" sub="Largest tables, measured hourly. Row counts are estimates.">
            {sn ? (
              <div className="pf-scroll">
                <table className="pf-table">
                  <thead><tr><th>Table</th><th className="num">Size</th><th className="num">Rows (est.)</th></tr></thead>
                  <tbody>{sn.tables.map((t: any) => <tr key={t.name}><td><code>{t.name}</code></td><td className="num">{fmtBytes(t.bytes)}</td><td className="num">{t.rows < 0 ? '–' : fmtInt(t.rows)}</td></tr>)}</tbody>
                </table>
              </div>
            ) : <div className="pf-empty">No measurement yet.</div>}
            {sn && orphanTotal! > 0 && (
              <div className="pf-note">
                <Status level="warning" label="Orphan rows" />{' '}
                {Object.entries(sn.orphans).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k.replace(/_/g, ' ')}: ${n}`).join(' · ')}
              </div>
            )}
          </Card>
          <div className="pf-note" style={{ marginTop: 14 }}>
            <b>How data is stored.</b> PostgreSQL is the single source of truth. The browser holds no authoritative data; every school action is confirmed by the database before the screen shows it. Backups are taken by the server owner (see <code>DEPLOYMENT.md</code>); schools can export and restore their own data from their Backups page.
          </div>
        </>
      );
    }}</Shell>
  );
}

// ---------- Errors ----------
export function Errors({ range, out }: { range: Range; out: Out }) {
  const [kind, setKind] = useState('');
  const [school, setSchool] = useState('');
  const [reqId, setReqId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const qs = new URLSearchParams({ range, limit: '200' });
  if (kind) qs.set('kind', kind);
  if (school) qs.set('school', school);
  if (reqId.trim()) qs.set('requestId', reqId.trim());
  const r = usePolled<any>(`/api/platform/monitor/errors?${qs}`, out);
  const long = range === '7d' || range === '14d';
  return (
    <Shell r={r}>{(d) => (
      <>
        <div className="pf-filters">
          <select className="pf-select" aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {Object.keys(KIND_LABEL).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <select className="pf-select" aria-label="School" value={school} onChange={(e) => setSchool(e.target.value)}>
            <option value="">All schools</option>
            {(d.bySchool as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            {school && !(d.bySchool as any[]).some((s) => s.id === school) && <option value={school}>{school}</option>}
          </select>
          <input className="pf-input" aria-label="Request id" placeholder="Request id (r…)" value={reqId} onChange={(e) => setReqId(e.target.value)} style={{ width: 170 }} />
          {(kind || school || reqId) && <button className="pf-btn" onClick={() => { setKind(''); setSchool(''); setReqId(''); }}>Clear</button>}
        </div>
        <div className="pf-grid pf-cols-2">
          <Card title="Events over time" sub="Count per interval; the first four kinds have their own colour">
            <ErrorBars data={d} long={long} />
          </Card>
          <Card title="By kind">
            <HBars rows={(d.byKind as any[]).map((k) => ({ key: k.kind, label: KIND_LABEL[k.kind] || k.kind, value: k.n }))} onPick={(k) => setKind(k)} empty="No events in this period." color="var(--series-other)" />
          </Card>
          <Card title="By route" sub="Where failures happen">
            <HBars rows={aggregateRoutes(d.byRoute)} empty="No route-level events." color="var(--series-other)" />
          </Card>
          <Card title="By school" sub="Top 10">
            <HBars rows={(d.bySchool as any[]).map((s) => ({ key: s.id, label: s.name, value: s.n }))} onPick={(k) => setSchool(k)} empty="No school-attributed events." color="var(--series-other)" />
          </Card>
        </div>
        <Card title="Recent events" sub={`${d.recent.length} shown, newest first. Messages are kept for server errors only; other kinds keep a code.`}>
          <div className="pf-scroll" style={{ maxHeight: 520 }}>
            <table className="pf-table">
              <thead><tr><th>Time</th><th>Kind</th><th>School</th><th>Route</th><th className="num">Status</th><th>Detail</th><th>Request id</th></tr></thead>
              <tbody>
                {(d.recent as any[]).map((e) => (
                  <React.Fragment key={e.id}>
                    <tr className="click" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(e.ts, true)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{KIND_LABEL[e.kind] || e.kind}</td>
                      <td>{e.school || '–'}</td>
                      <td><code>{e.method} {e.route}</code></td>
                      <td className="num">{e.status ?? '–'}</td>
                      <td>{e.code || e.message || '–'}</td>
                      <td><code>{e.requestId || '–'}</code></td>
                    </tr>
                    {open === e.id && (
                      <tr><td colSpan={7}><pre className="pf-mono" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify({ durationMs: e.durationMs, message: e.message, meta: e.meta }, null, 2)}</pre></td></tr>
                    )}
                  </React.Fragment>
                ))}
                {d.recent.length === 0 && <tr><td colSpan={7} className="pf-muted">Nothing matches.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </>
    )}</Shell>
  );
}

function aggregateRoutes(rows: any[]) {
  const m = new Map<string, number>();
  for (const r of rows) { const k = `${r.method} ${r.route}`; m.set(k, (m.get(k) || 0) + r.n); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ key: k, label: k, value: v }));
}
