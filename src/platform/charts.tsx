// Small SVG chart set for the platform dashboards. Built to the data-viz spec: 2px lines, 24px-max bars with a
// 4px rounded data-end, hairline recessive grid, a 2px surface ring on end dots, a legend whenever there are
// two or more series, a crosshair tooltip on time charts, and a table view for every chart. Text always wears
// text tokens; colour only rides on marks. Labels come from the API and are rendered as React text (never HTML).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, OctagonAlert, TriangleAlert } from 'lucide-react';

export type Severity = 'good' | 'warning' | 'serious' | 'critical';

export const fmtInt = (n: number | null | undefined) => (n == null ? '–' : Math.round(n).toLocaleString());
export function fmtCompact(n: number | null | undefined): string {
  if (n == null) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n * 10) / 10);
}
export const fmtMs = (n: number | null | undefined) => (n == null ? '–' : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + ' s' : Math.round(n) + ' ms');
export const fmtPct = (r: number | null | undefined, d = 1) => (r == null ? '–' : (r * 100).toFixed(r > 0 && r < 0.001 ? 2 : d) + '%');
export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1)) + ' ' + u[i];
}
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return '–';
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(sec % 60)}s`;
}
export function fmtTime(iso: string, long = false): string {
  const d = new Date(iso);
  return long
    ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    setW(Math.max(240, el.clientWidth));
    const ro = new ResizeObserver(() => setW(Math.max(240, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Round the top of the axis to a clean number. */
function niceMax(v: number): number {
  // Four even gridlines: pick a clean step for a quarter of the range.
  const q = Math.max(v, 1) / 4;
  const p = Math.pow(10, Math.floor(Math.log10(q)));
  const f = q / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p * 4;
}

export interface Series { name: string; color: string; values: (number | null)[]; fmt?: (v: number | null) => string }

export function Legend({ items, kind = 'line' }: { items: { name: string; color: string }[]; kind?: 'line' | 'bar' }) {
  if (items.length < 2) return null;
  return (
    <div className="pf-legend">
      {items.map((i) => (
        <span key={i.name}>
          {kind === 'line' ? <i className="pf-key" style={{ borderColor: i.color }} /> : <i className="pf-swatch" style={{ background: i.color }} />}
          {i.name}
        </span>
      ))}
    </div>
  );
}

function TableView({ x, series, long, fmt }: { x: string[]; series: Series[]; long: boolean; fmt: (v: number | null) => string }) {
  return (
    <div className="pf-scroll" style={{ maxHeight: 260, marginTop: 8 }}>
      <table className="pf-table">
        <thead><tr><th>Time</th>{series.map((s) => <th key={s.name} className="num">{s.name}</th>)}</tr></thead>
        <tbody>
          {x.map((t, i) => (
            <tr key={t}><td>{fmtTime(t, long)}</td>{series.map((s) => <td key={s.name} className="num">{(s.fmt || fmt)(s.values[i])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartFrame({ children, table, tableLabel = 'Table view' }: { children: React.ReactNode; table: React.ReactNode; tableLabel?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      {children}
      <div style={{ marginTop: 6 }}>
        <button type="button" className="pf-linkbtn" aria-pressed={show} onClick={() => setShow((s) => !s)}>{show ? 'Hide table' : tableLabel}</button>
      </div>
      {show && table}
    </div>
  );
}

const PAD = { l: 44, r: 12, t: 8, b: 22 };

interface TimeChartProps {
  x: string[];
  series: Series[];
  height?: number;
  fmt?: (v: number | null) => string;
  area?: boolean;
  yMax?: number;
  long?: boolean;
  empty?: string;
}

/** Line / area chart over time with a crosshair tooltip that lists every series at that X. */
export function LineChart({ x, series, height = 190, fmt = (v) => fmtCompact(v), area = false, yMax, long = false, empty = 'No data in this period.' }: TimeChartProps) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const hasData = x.length > 0 && series.some((s) => s.values.some((v) => v != null));
  const max = useMemo(() => niceMax(yMax ?? Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))) * 1.08), [series, yMax]);
  const iw = w - PAD.l - PAD.r, ih = height - PAD.t - PAD.b;
  const px = (i: number) => PAD.l + (x.length <= 1 ? iw / 2 : (i / (x.length - 1)) * iw);
  const py = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const nt = long ? 2 : 4; // long labels need more room
  const xTicks = x.length <= 1 ? [0] : Array.from(new Set(Array.from({ length: nt + 1 }, (_, k) => Math.round((k / nt) * (x.length - 1)))));
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left - PAD.l) / iw;
    setHover(Math.max(0, Math.min(x.length - 1, Math.round(rel * (x.length - 1)))));
  };
  if (!hasData) return <div className="pf-empty">{empty}</div>;
  const tipLeft = hover == null ? 0 : px(hover);
  return (
    <ChartFrame table={<TableView x={x} series={series} long={long} fmt={fmt} />}>
      <Legend items={series} />
      <div className="pf-chart" ref={ref}>
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ') + ' over time'} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={py(t)} y2={py(t)} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} strokeWidth={1} />
              <text x={PAD.l - 8} y={py(t) + 4} textAnchor="end">{fmt(t)}</text>
            </g>
          ))}
          {xTicks.map((i) => <text key={i} x={px(i)} y={height - 5} textAnchor={i === 0 ? 'start' : i === x.length - 1 ? 'end' : 'middle'}>{fmtTime(x[i], long)}</text>)}
          {series.map((s) => {
            const pts = s.values.map((v, i) => (v == null ? null : [px(i), py(v)] as const));
            const segs: (readonly [number, number])[][] = [];
            let cur: (readonly [number, number])[] = [];
            pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
            if (cur.length) segs.push(cur);
            const last = [...pts].reverse().find(Boolean);
            return (
              <g key={s.name}>
                {segs.map((sg, k) => (
                  <g key={k}>
                    {area && sg.length > 1 && <path d={`M${sg[0][0]},${py(0)} ` + sg.map((p) => `L${p[0]},${p[1]}`).join(' ') + ` L${sg[sg.length - 1][0]},${py(0)} Z`} fill={s.color} opacity={0.1} />}
                    <path d={sg.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  </g>
                ))}
                {last && <circle cx={last[0]} cy={last[1]} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />}
              </g>
            );
          })}
          {hover != null && (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--axis)" strokeWidth={1} />
              {series.map((s) => s.values[hover] != null && <circle key={s.name} cx={px(hover)} cy={py(s.values[hover] as number)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="pf-tip" style={{ left: Math.min(Math.max(tipLeft + 12, 0), w - 170), top: 4 }}>
            <div className="t">{fmtTime(x[hover], long)}</div>
            {series.map((s) => (
              <div className="row" key={s.name}><i className="pf-key" style={{ borderColor: s.color }} /><b>{(s.fmt || fmt)(s.values[hover])}</b>{series.length > 1 && <span>{s.name}</span>}</div>
            ))}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}

/** Stacked columns over time (counts). Each segment is separated by a 2px surface gap; the top segment has a 4px rounded end. */
export function StackedBars({ x, series, height = 190, long = false, empty = 'Nothing recorded in this period.' }: { x: string[]; series: Series[]; height?: number; long?: boolean; empty?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = x.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  if (!x.length || totals.every((t) => t === 0)) return <div className="pf-empty">{empty}</div>;
  const max = niceMax(Math.max(...totals) * 1.05);
  const iw = w - PAD.l - PAD.r, ih = height - PAD.t - PAD.b;
  const slot = iw / x.length, bw = Math.min(24, Math.max(2, slot - 2));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const nt = long ? 2 : 4;
  const xTicks = Array.from(new Set(Array.from({ length: nt + 1 }, (_, k) => Math.round((k / nt) * (x.length - 1)))));
  const fmt = (v: number | null) => fmtInt(v);
  return (
    <ChartFrame table={<TableView x={x} series={series} long={long} fmt={fmt} />}>
      <Legend items={series} kind="bar" />
      <div className="pf-chart" ref={ref}>
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(', ') + ' over time'} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={PAD.t + ih - (t / max) * ih} y2={PAD.t + ih - (t / max) * ih} stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'} />
              <text x={PAD.l - 8} y={PAD.t + ih - (t / max) * ih + 4} textAnchor="end">{fmtCompact(t)}</text>
            </g>
          ))}
          {xTicks.map((i) => <text key={i} x={PAD.l + slot * i + slot / 2} y={height - 5} textAnchor={i === 0 ? 'start' : i === x.length - 1 ? 'end' : 'middle'}>{fmtTime(x[i], long)}</text>)}
          {x.map((_, i) => {
            const cx = PAD.l + slot * i + slot / 2;
            let acc = 0;
            const topIdx = (() => { for (let k = series.length - 1; k >= 0; k--) if ((series[k].values[i] || 0) > 0) return k; return -1; })();
            return (
              <g key={i} onPointerEnter={() => setHover(i)} opacity={hover == null || hover === i ? 1 : 0.55}>
                <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={ih} fill="transparent" />
                {series.map((s, k) => {
                  const v = s.values[i] || 0;
                  if (v <= 0) return null;
                  const h = Math.max(1, (v / max) * ih), y = PAD.t + ih - ((acc + v) / max) * ih;
                  acc += v;
                  const top = k === topIdx, r = Math.min(4, bw / 2, h);
                  const x0 = cx - bw / 2, y0 = y + 1, hh = Math.max(0.5, h - 2), x1 = x0 + bw;
                  const d = top
                    ? `M${x0},${y0 + hh} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x1 - r},${y0} Q${x1},${y0} ${x1},${y0 + r} L${x1},${y0 + hh} Z`
                    : `M${x0},${y0} H${x1} V${y0 + hh} H${x0} Z`;
                  return <path key={s.name} d={d} fill={s.color} />;
                })}
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <div className="pf-tip" style={{ left: Math.min(Math.max(PAD.l + slot * hover + 16, 0), w - 190), top: 4 }}>
            <div className="t">{fmtTime(x[hover], long)} · {fmtInt(totals[hover])} total</div>
            {series.filter((s) => (s.values[hover] || 0) > 0).map((s) => <div className="row" key={s.name}><i className="pf-swatch" style={{ background: s.color }} /><b>{fmtInt(s.values[hover])}</b><span>{s.name}</span></div>)}
          </div>
        )}
      </div>
    </ChartFrame>
  );
}

/** Horizontal bars for a ranked list. The value sits at the tip; the label is text-token ink. */
export function HBars({ rows, color = 'var(--series-1)', fmt = fmtInt, onPick, empty = 'Nothing to show.' }: { rows: { key: string; label: string; value: number; note?: string }[]; color?: string; fmt?: (n: number) => string; onPick?: (key: string) => void; empty?: string }) {
  if (rows.length === 0) return <div className="pf-empty">{empty}</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: 'grid', gap: 7 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(80px, 38%) 1fr auto', alignItems: 'center', gap: 10 }}>
          {onPick
            ? <button type="button" className="pf-linkbtn pf-mono" style={{ textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label} onClick={() => onPick(r.key)}>{r.label}</button>
            : <span className="pf-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>}
          <div style={{ height: 14 }} title={r.note}>
            <div style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, height: 14, background: color, borderRadius: '0 4px 4px 0' }} />
          </div>
          <b style={{ fontVariantNumeric: 'tabular-nums', minWidth: 44, textAlign: 'right' }}>{fmt(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values, color = 'var(--series-1)', width = 96, height = 28 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const v = values.map((n) => n ?? 0);
  if (v.length < 2 || v.every((n) => n === 0)) return null;
  const max = Math.max(...v), min = Math.min(...v), span = max - min || 1;
  const pts = v.map((n, i) => [(i / (v.length - 1)) * (width - 6) + 3, height - 4 - ((n - min) / span) * (height - 8)]);
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')} fill="none" stroke="var(--series-other)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

const SEV_LABEL: Record<Severity, string> = { good: 'OK', warning: 'Watch', serious: 'Problem', critical: 'Critical' };
export function Status({ level, label }: { level: Severity; label?: string }) {
  const Icon = level === 'good' ? CheckCircle2 : level === 'warning' ? TriangleAlert : level === 'serious' ? AlertTriangle : OctagonAlert;
  return <span className={`pf-status ${level}`}><Icon size={14} aria-hidden="true" />{label || SEV_LABEL[level]}</span>;
}

export function StatTile({ label, value, unit, foot, level, trend, hero = false }: { label: string; value: React.ReactNode; unit?: string; foot?: React.ReactNode; level?: Severity; trend?: (number | null)[]; hero?: boolean }) {
  return (
    <div className={`pf-card pf-tile${hero ? ' pf-hero' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}{unit && <small>{unit}</small>}</div>
      <div className="foot"><span>{level ? <Status level={level} /> : foot}</span>{trend && <Sparkline values={trend} />}</div>
      {level && foot && <div className="pf-muted" style={{ marginTop: 2 }}>{foot}</div>}
    </div>
  );
}

export function Card({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="pf-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'start' }}>
        <div><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div>{right}
      </div>
      {children}
    </section>
  );
}

/** Fetches JSON, keeps the previous result on screen while refetching, and refreshes on an interval. */
export function usePolled<T>(url: string | null, onSignedOut: () => void, everyMs = 30_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const signedOut = useRef(onSignedOut);
  signedOut.current = onSignedOut;
  useEffect(() => {
    if (!url) return;
    let dead = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (res.status === 401) { signedOut.current(); return; }
        const body = await res.json().catch(() => ({}));
        if (dead) return;
        if (!res.ok || body.success === false) { setError(body.error || `The server answered ${res.status}.`); }
        else { setData(body as T); setError(null); setUpdated(new Date()); }
      } catch {
        if (!dead) setError('Could not reach the server.');
      } finally {
        if (!dead) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, everyMs);
    return () => { dead = true; clearInterval(id); };
  }, [url, everyMs, tick]);
  return { data, error, loading, updated, reload: () => setTick((t) => t + 1) };
}
