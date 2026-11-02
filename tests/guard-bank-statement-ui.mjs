// Guard 4: the bank statement screen shows only what the database has confirmed.
// Screen data (rows, uploads, suggestions) may be set ONLY by the loader functions that read from the server
// (loadUploads / loadRows). No optimistic or locally computed edits, no patching a row from a reply.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = 'src/plugins/bank-statements/BankStatementsView.tsx';
const src = fs.readFileSync(path.join(root, file), 'utf8');

const span = (startMarker) => {
  const a = src.indexOf(startMarker);
  if (a < 0) return null;
  const b = src.indexOf('\n  );', a); // end of the useCallback(...) block
  return [a, b < 0 ? src.length : b];
};
const allowed = [span('const loadUploads = useCallback('), span('const loadRows = useCallback(')];
const problems = [];
if (allowed.some((x) => !x)) problems.push('loader functions loadUploads / loadRows not found: update this guard if they were renamed.');

const re = /\b(setRows|setUploads|setSuggestions)\(([^)]*)/g;
let m;
let checked = 0;
while ((m = re.exec(src))) {
  checked++;
  const at = m.index;
  const inLoader = allowed.some((r) => r && at >= r[0] && at <= r[1]);
  const clearsOnly = m[1] === 'setRows' && m[2].trim() === '[]'; // "nothing selected": empties the table, derives nothing
  if (!inLoader && !clearsOnly) {
    const line = src.slice(0, at).split('\n').length;
    problems.push(`${file}:${line}: ${m[0]}) outside the server loaders. Reload from the server instead of editing screen data.`);
  }
}
if (/\breplaceRow\b/.test(src)) problems.push(`${file}: replaceRow must not exist (rows are replaced by reloading from the server).`);

if (problems.length) {
  console.error('FAIL (bank statement UI must be database-confirmed):\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`ok: bank statement screen data is only set by the server loaders (${checked} setter calls checked)`);
