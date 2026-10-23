// Guard 3: the platform area and the school area must never share a door.
//  A. Every route under /api/platform/ is wrapped in requirePlatform(...); the only exception
//     is the sign-in itself.
//  B. requireAuth (the school guard) is never used on a /api/platform/ route.
//  C. Nothing in server/platform.ts reads the school session cookie, a Bearer token, the
//     x-institution-id header or the school resolved from a school session. (A platform admin may
//     name a school explicitly, e.g. a ?school= filter; that is a parameter, not an identity.)
//  D. No school route is registered from server/platform.ts and no platform table is read
//     from the school code paths in server.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const platform = fs.readFileSync(path.join(root, 'server/platform.ts'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const problems = [];

const routeRe = /app\.(get|post|put|delete|patch)\(\s*'([^']+)'\s*,([^\n]*)/g;
let m, count = 0;
while ((m = routeRe.exec(platform))) {
  const [, method, route, rest] = m;
  count++;
  if (!route.startsWith('/api/platform/')) problems.push(`server/platform.ts registers a route outside /api/platform: ${method} ${route}`);
  if (route === '/api/platform/login') continue;
  if (!/requirePlatform\(/.test(rest)) problems.push(`${method.toUpperCase()} ${route} is not behind requirePlatform()`);
  if (/requireAuth\(/.test(rest)) problems.push(`${method.toUpperCase()} ${route} uses the school guard`);
}
if (count < 5) problems.push(`expected at least 5 platform routes, found ${count} (is the pattern out of date?)`);

for (const [re, why] of [
  [/school_session_token|SESSION_COOKIE_NAME\b/, 'reads the school session cookie'],
  [/authorization/i, 'reads the Authorization header'],
  [/x-institution-id|req\.institutionId|req\.institution\b/i, 'takes the acting school from the request (header or school session)'],
]) {
  const code = platform.replace(/\/\/[^\n]*/g, '');
  if (re.test(code)) problems.push(`server/platform.ts ${why}`);
}
for (const line of server.split('\n')) {
  if (/app\.(get|post|put|delete|patch)\(\s*'\/api\/platform/.test(line)) problems.push('server.ts registers a platform route directly; use server/platform.ts');
}
if (/platform_(admins|sessions|audit_logs)/.test(server)) problems.push('server.ts touches a platform table directly');

if (problems.length) {
  console.error('FAIL guard-platform-isolation:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`ok: ${count} platform routes, all behind requirePlatform; no shared cookie, header or school guard`);
