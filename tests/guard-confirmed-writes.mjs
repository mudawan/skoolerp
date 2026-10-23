// Guard: shared data may only change on screen after the server confirmed it.
//
// Fails when AppContext.tsx changes one of the shared collections directly (setClasses,
// setStudents, ...) from anywhere except the places that are allowed to:
//   - adopting server data (loading, live updates, logout/reset, restore, cleanup)
//   - mirroring a cascade the server already performed, after a confirmed commit
// Every other change must go through commitEntity(), which sends the change first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'src/context/AppContext.tsx');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');

const SETTERS = [
  'setClasses', 'setStudents', 'setFamilies', 'setBuses', 'setStops',
  'setTransportAssignments', 'setTemplates', 'setBankAccounts', 'setStudentAccountHistory',
];
// Enclosing top-level function -> why it may touch the setter directly.
const ALLOWED = {
  applyServerState: 'adopts data the server returned',
  commitEntity: 'adopts the rows the server confirmed',
  deleteFamilies: 'mirrors the link clearing the server already did (inside a confirmed commit)',
  dropLocalAssignments: 'mirrors cascade deletes the server already did',
  dropLocalTemplates: 'mirrors cascade deletes the server already did',
  adoptFamilyNumber: 'adopts the family number issued by the server',
  clearLocalState: 'logout/reset: empties the screen',
  logout: 'logout/reset: empties the screen',
  lockSession: 'logout/reset: empties the screen',
  registerInstitution: 'new workspace: starts from empty/default data',
  loginOperator: 'login: starts from empty data before the server load',
  login: 'login: starts from empty data before the server load',
  deleteInstitution: 'workspace deleted on the server: empties the screen',
  restoreBackup: 'adopts data restored on the server',
};

const enclosing = (idx) => {
  for (let i = idx; i >= 0; i--) {
    const m = lines[i].match(/^  (?:const|function|async function)\s+([A-Za-z0-9_]+)/);
    if (m) return m[1];
    const e = lines[i].match(/^  useEffect\(/);
    if (e) return '(useEffect)';
  }
  return '(top)';
};

const offenders = [];
const seen = new Map();
lines.forEach((line, i) => {
  if (/^\s*(\/\/|\*)/.test(line)) return;
  for (const s of SETTERS) {
    if (new RegExp(`\\b${s}\\(`).test(line) && !new RegExp(`const \\[\\w+, ${s}\\]`).test(line)) {
      // Emptying the screen (logout, reset, workspace switch) is not a data write.
      if (new RegExp(`${s}\\(\\[\\]\\)`).test(line) || /setTemplates\((INITIAL_GLOBAL_TEMPLATES|freshTemplates)\)/.test(line)) continue;
      // Adopting the family number the server issued.
      if (s === 'setFamilies' && /familyNo/.test(line)) continue;
      const fn = enclosing(i);
      seen.set(fn, (seen.get(fn) || 0) + 1);
      if (!(fn in ALLOWED)) offenders.push(`${path.relative(root, file)}:${i + 1} ${s}() inside ${fn}()`);
    }
  }
});

// The old background diff-and-sync is gone for good: every write is confirmed first.
// Fail if any of its pieces come back.
const DEAD = ['queueDatabaseSync', 'diffAndSyncSimpleCollection', 'syncSimpleEntityCollectionNow', 'adoptSnapshot',
  'initializeSyncSnapshots', 'resetSyncSnapshots', 'lastSyncedSnapshots', 'permanentlyFailedIds', 'subscribeSyncFailures'];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]);
for (const f of [...walk(path.join(root, 'src')), path.join(root, 'server.ts')].filter((x) => /\.(ts|tsx)$/.test(x))) {
  const text = fs.readFileSync(f, 'utf8');
  for (const name of DEAD) if (text.includes(name)) offenders.push(`${path.relative(root, f)} mentions ${name}: the background sync must not come back`);
}

if (offenders.length) {
  console.error('FAIL: shared state changed without server confirmation:');
  offenders.forEach((o) => console.error('  - ' + o));
  console.error('Use commitEntity(...) for the change, or add the function to ALLOWED with a reason.');
  process.exit(1);
}
console.log(`ok: all direct changes to shared collections are in allowed places (${[...seen.keys()].join(', ')})`);
