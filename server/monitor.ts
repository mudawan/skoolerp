// Monitoring capture: what the platform dashboards read.
//
//  - Every /api request is counted per minute, per route pattern (never per id), with a latency
//    histogram.
//  - Anything that means an operator's action did not go through becomes an error event:
//    server errors, stale-version/in-use conflicts, refused writes, rate limiting, requests the
//    client abandoned, slow requests, unhandled exceptions, database trouble, and failures the
//    browser itself reports (network down, JavaScript errors).
//  - The database is sampled every 30 seconds.
//
// What is stored is deliberately thin: route pattern, status, error code, request id, and the
// school and user ids. Never request bodies. A server-written message is kept only for 5xx
// errors (those are our own faults); a 4xx message can quote user data (e.g. a duplicate ID), so
// only its code is kept.
//
// Capture must never hurt the app: everything is buffered in memory, written in the background,
// capped, and a failed write is retried later instead of surfacing.
import crypto from 'crypto';
import os from 'os';
import express from 'express';
import { dbService, MonitorEvent, MonitorDbSample, MonitorMetricRow } from './db';

const INSTANCE = `${os.hostname()}:${process.pid}`.slice(0, 64);
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const EVENT_FLUSH_MS = num(process.env.MONITOR_FLUSH_MS, 5_000);
const METRICS_FLUSH_MS = num(process.env.MONITOR_METRICS_FLUSH_MS, 60_000);
const SAMPLE_MS = num(process.env.MONITOR_SAMPLE_MS, 30_000);
const METRICS_DAYS = 14;
const EVENT_DAYS = 30;
const MAX_EVENTS_PER_MINUTE = 300;
const MAX_BUFFERED_EVENTS = 2_000;
const MAX_BUFFERED_SAMPLES = 500;
const SLOW_MS = 5_000;
// Upper edges in ms; the last bucket is everything slower.
export const LATENCY_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const clip = (v: unknown, n: number) => (typeof v === 'string' && v ? v.slice(0, n) : undefined);

interface Agg { minute: string; method: string; route: string; count: number; e4: number; e5: number; totalMs: number; maxMs: number; buckets: number[] }

let metricAgg = new Map<string, Agg>();
let events: MonitorEvent[] = [];
let samples: MonitorDbSample[] = [];
let droppedEvents = 0;
let minuteStart = 0;
let minuteCount = 0;
let suppressedThisMinute = 0;
let lastDbOk: boolean | null = null;

/** Records an event. Safe to call from anywhere; never throws. */
export function recordEvent(e: Omit<MonitorEvent, 'ts'> & { ts?: string }) {
  try {
    const now = Date.now();
    if (now - minuteStart >= 60_000) {
      if (suppressedThisMinute > 0) {
        events.push({ ts: new Date().toISOString(), kind: 'events_suppressed', message: `${suppressedThisMinute} events were not stored (more than ${MAX_EVENTS_PER_MINUTE} per minute).` });
      }
      minuteStart = now;
      minuteCount = 0;
      suppressedThisMinute = 0;
    }
    if (++minuteCount > MAX_EVENTS_PER_MINUTE) {
      suppressedThisMinute++;
      return;
    }
    if (events.length >= MAX_BUFFERED_EVENTS) {
      events.shift();
      droppedEvents++;
    }
    events.push({ ts: new Date().toISOString(), ...e });
  } catch {
    /* monitoring must not throw */
  }
}

function recordMetric(method: string, route: string, status: number, ms: number) {
  const d = new Date();
  d.setSeconds(0, 0);
  const minute = d.toISOString();
  const key = `${minute}|${method}|${route}`;
  let a = metricAgg.get(key);
  if (!a) {
    a = { minute, method, route, count: 0, e4: 0, e5: 0, totalMs: 0, maxMs: 0, buckets: new Array(LATENCY_BUCKETS_MS.length + 1).fill(0) };
    metricAgg.set(key, a);
  }
  a.count++;
  if (status >= 500) a.e5++;
  else if (status >= 400) a.e4++;
  a.totalMs += Math.round(ms);
  a.maxMs = Math.max(a.maxMs, Math.round(ms));
  let i = LATENCY_BUCKETS_MS.findIndex((edge) => ms <= edge);
  if (i < 0) i = LATENCY_BUCKETS_MS.length;
  a.buckets[i]++;
}

/** Middleware: request id, per-route metrics and the "action did not go through" events. */
export function monitorRequests(req: express.Request, res: express.Response, next: express.NextFunction) {
  const started = process.hrtime.bigint();
  const requestId = 'r' + crypto.randomBytes(5).toString('hex');
  res.setHeader('X-Request-Id', requestId);
  // The live event stream stays open for hours; timing it would be meaningless.
  if (req.originalUrl.split('?')[0] === '/api/events') return next();

  let body: { code?: string; error?: string } = {};
  const origJson = res.json.bind(res);
  res.json = ((b: any) => {
    if (b && typeof b === 'object') body = { code: typeof b.code === 'string' ? b.code : undefined, error: typeof b.error === 'string' ? b.error : undefined };
    return origJson(b);
  }) as typeof res.json;

  let finished = false;
  const common = () => {
    const r: any = req;
    return {
      method: req.method,
      route: (req.route?.path ? String(req.route.path) : '(unmatched)').slice(0, 200),
      institutionId: r.institutionId || undefined,
      userId: r.user?.id || (r.platformAdmin?.id ? `platform:${r.platformAdmin.id}` : undefined),
      requestId,
    };
  };
  res.on('finish', () => {
    finished = true;
    try {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const c = common();
      const status = res.statusCode;
      recordMetric(c.method, c.route, status, ms);
      const write = c.method !== 'GET' && c.method !== 'HEAD' && c.method !== 'OPTIONS';
      let kind: string | undefined;
      if (status >= 500) kind = 'server_error';
      else if (status === 409) kind = 'conflict';
      else if (status === 429) kind = 'rate_limited';
      else if (write && (status === 400 || status === 404 || status === 422)) kind = 'rejected';
      if (kind) {
        recordEvent({ kind, ...c, status, code: clip(body.code, 64), durationMs: Math.round(ms), message: kind === 'server_error' ? clip(body.error, 300) : undefined });
      } else if (ms > SLOW_MS) {
        recordEvent({ kind: 'slow_request', ...c, status, durationMs: Math.round(ms) });
      }
    } catch {
      /* ignore */
    }
  });
  res.on('close', () => {
    if (finished) return;
    // The connection ended before an answer was sent: the operator's action may not have gone through.
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    recordEvent({ kind: 'aborted', ...common(), durationMs: Math.round(ms) });
  });
  next();
}

/** Last-resort handler for errors thrown before a route answers (bad JSON, oversized body, ...). */
export function monitorErrorHandler(err: any, req: express.Request, res: express.Response, next: express.NextFunction) {
  if (res.headersSent) return next(err);
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) console.error('[API] Unhandled error:', err);
  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error.' : status === 413 ? 'The request is too large.' : 'The request could not be understood.',
  });
}

async function flushEvents() {
  if (events.length === 0 && samples.length === 0) return;
  const evBatch = events.splice(0, 500);
  const smBatch = samples.splice(0, 100);
  try {
    await dbService.insertErrorEvents(INSTANCE, evBatch);
    await dbService.insertDbSamples(INSTANCE, smBatch);
  } catch {
    // Database unreachable: keep them for the next try (within the caps).
    events = evBatch.concat(events).slice(-MAX_BUFFERED_EVENTS);
    samples = smBatch.concat(samples).slice(-MAX_BUFFERED_SAMPLES);
  }
}

async function flushMetrics() {
  if (metricAgg.size === 0) return;
  const rows: MonitorMetricRow[] = [...metricAgg.values()].map((a) => ({
    minute: a.minute, method: a.method, route: a.route, count: a.count, errors4xx: a.e4, errors5xx: a.e5, totalMs: a.totalMs, maxMs: a.maxMs, buckets: a.buckets,
  }));
  const old = metricAgg;
  metricAgg = new Map();
  try {
    await dbService.insertApiMetrics(INSTANCE, rows);
  } catch {
    // Put the counts back so they are written next time.
    for (const [k, a] of old) {
      const cur = metricAgg.get(k);
      if (!cur) metricAgg.set(k, a);
      else { cur.count += a.count; cur.e4 += a.e4; cur.e5 += a.e5; cur.totalMs += a.totalMs; cur.maxMs = Math.max(cur.maxMs, a.maxMs); cur.buckets = cur.buckets.map((v, i) => v + a.buckets[i]); }
    }
  }
}

async function sampleDatabase() {
  const ts = new Date().toISOString();
  const t0 = Date.now();
  try {
    const ping = await dbService.ping();
    if (!ping.healthy) throw new Error(ping.error || 'ping failed');
    const stats = await dbService.collectDbStats();
    samples.push({ ts, ok: true, latencyMs: Date.now() - t0, ...stats });
    if (lastDbOk === false) recordEvent({ kind: 'db_recovered', message: 'The database is reachable again.' });
    lastDbOk = true;
  } catch (err: any) {
    const pool = dbService.getPoolStats();
    samples.push({ ts, ok: false, latencyMs: Date.now() - t0, poolTotal: pool?.totalCount, poolIdle: pool?.idleCount, poolWaiting: pool?.waitingCount, error: err?.message || 'database check failed' });
    if (lastDbOk !== false) recordEvent({ kind: 'db_unreachable', message: clip(err?.message, 300) });
    lastDbOk = false;
  }
  if (samples.length > MAX_BUFFERED_SAMPLES) samples = samples.slice(-MAX_BUFFERED_SAMPLES);
}

const CLIENT_KINDS = new Set(['client_error', 'client_network']);
const perUser = new Map<string, { n: number; reset: number }>();

/** POST /api/client-errors: failures the browser saw that the server could not (network down, JavaScript errors). */
export function registerClientReporting(app: express.Express, requireAuth: () => express.RequestHandler) {
  app.post('/api/client-errors', requireAuth(), (req: any, res) => {
    const now = Date.now();
    const key = req.user?.id || 'anon';
    const slot = perUser.get(key);
    if (!slot || slot.reset <= now) perUser.set(key, { n: 1, reset: now + 5 * 60_000 });
    else if (++slot.n > 30) return res.status(429).json({ success: false });
    const b = req.body || {};
    if (!CLIENT_KINDS.has(b.kind)) return res.status(400).json({ success: false, error: 'Unsupported report.' });
    const path = typeof b.path === 'string' ? b.path.split('?')[0] : undefined;
    recordEvent({
      kind: b.kind,
      institutionId: req.institutionId,
      userId: req.user?.id,
      route: clip(path, 200),
      method: clip(b.method, 8),
      code: clip(b.context, 64),
      message: clip(b.message, 300),
      meta: { ua: clip(req.headers['user-agent'], 160), at: clip(b.at, 40) },
    });
    res.json({ success: true });
  });
}

let started = false;
export function startMonitoring() {
  if (started) return;
  started = true;
  const every = (fn: () => Promise<void>, ms: number) => setInterval(() => void fn().catch(() => {}), ms).unref();
  every(flushEvents, EVENT_FLUSH_MS);
  every(flushMetrics, METRICS_FLUSH_MS);
  every(sampleDatabase, SAMPLE_MS);
  void sampleDatabase();
  // Hourly: sizes, biggest tables, orphan rows.
  const snapshot = () => void dbService.collectDbSnapshot().catch((err) => console.error('[Monitor] Snapshot failed:', err?.message || err));
  setTimeout(snapshot, 45_000).unref();
  setInterval(snapshot, 60 * 60_000).unref();
  const purge = async () => {
    try {
      const r = await dbService.purgeMonitoring(METRICS_DAYS, EVENT_DAYS);
      if (r.metrics + r.samples + r.events > 0) console.log(`[Monitor] Retention removed ${r.metrics} metric rows, ${r.samples} samples, ${r.events} events.`);
    } catch (err) {
      console.error('[Monitor] Retention failed:', err);
    }
  };
  setTimeout(() => void purge(), 60_000).unref();
  setInterval(() => void purge(), 60 * 60_000).unref();

  const drain = async () => {
    await Promise.race([Promise.all([flushMetrics(), flushEvents()]), new Promise((r) => setTimeout(r, 3_000))]);
  };
  // Previously a stop signal ended the process without warning; now what is buffered is written first.
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.once(sig, () => void drain().finally(() => process.exit(0)));
  }
  process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught exception:', err);
    recordEvent({ kind: 'unhandled_exception', message: clip(String((err as any)?.message || err), 300), meta: { stack: clip((err as any)?.stack, 1500) } });
    void drain().finally(() => process.exit(1));
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Process] Unhandled promise rejection:', reason);
    recordEvent({ kind: 'unhandled_exception', message: clip(String((reason as any)?.message || reason), 300), meta: { rejection: true, stack: clip((reason as any)?.stack, 1500) } });
  });
}
