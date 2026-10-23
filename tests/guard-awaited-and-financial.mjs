// Guard 2: nothing may drop a result the operator needs, and every financial write is queued.
//
//  A. A context mutator that returns a promise (anything on the AppContext interface) must be
//     awaited, returned or assigned. A bare call, a `void` call, or an expression-bodied
//     event handler (onClick={() => mutator()}) throws the answer away: a failed save would
//     then look like a success. Fix: make the handler async and await it, then show the result.
//  B. Any other promise left dangling in the source must say so with `void` (a deliberate
//     fire-and-forget such as copying to the clipboard) and must not be a context mutator.
//  C. Every call to a financial server function (apiVoucherBatchUpdate, apiGenerateVouchers,
//     apiReceiveCollection, apiCarryForwardBatch) must sit inside runFinancialWrite(...), the
//     single queue that confirms first and changes the screen second. Components may not call
//     those functions at all.
//  D. The financial lists (vouchers, collections, transactions) may only be changed inside
//     runFinancialWrite(...) or in the places listed in FINANCIAL_SETTER_ALLOWED.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const cfg = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(cfg, ts.sys, '.');
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

const FINANCIAL_API = ['apiVoucherBatchUpdate', 'apiGenerateVouchers', 'apiReceiveCollection', 'apiCarryForwardBatch'];
const FINANCIAL_SETTERS = ['setVouchers', 'setCollections', 'setTransactions'];
// Where the financial lists may change without being inside runFinancialWrite, and why.
const FINANCIAL_SETTER_ALLOWED = {
  applyServerState: 'adopts data the server returned',
  adoptConfirmedCollection: 'only called from inside runFinancialWrite, after the server confirmed',
  applyServerVoucherNumbers: 'adopts numbers the server issued',
  clearLocalState: 'logout/reset: empties the screen',
  logout: 'logout/reset: empties the screen',
  lockSession: 'logout/reset: empties the screen',
  registerInstitution: 'new workspace: starts empty',
  loginOperator: 'login: starts empty before the server load',
  login: 'login: starts empty before the server load',
  deleteInstitution: 'workspace deleted on the server: empties the screen',
  restoreBackup: 'adopts data restored on the server',
  loadOlderHistory: 'adds closed history the server returned',
  ensureHistoryLoaded: 'adds closed history the server returned',
  mergeHistory: 'adds closed history the server returned',
};
// Loaders only read data (the screen shows whatever is loaded); they are not write mutators.
const READ_LOADERS = /^(ensure|refresh|load|fetch|check)/;
// Helpers that change the financial lists after confirmation; they may only run inside the queue.
const QUEUE_ONLY_HELPERS = { saveAdmissionVoucher: 'saves then adopts one admission voucher', adoptConfirmedCollection: 'adopts a confirmed collection' };
// Promise-returning calls that are deliberately not awaited (name -> why). Must be `void`-marked.
const FIRE_AND_FORGET_OK = /^(fetchServerState|apiFetchAuditLogs|apiUpdateInstituteSettings|writeText|loadUserPreferences|apiLogout|apiSavePreferences|apiPostAuditEvent|checkBackendHealth|apiFetchAuditSummary|apiFetchFineSincePayment|apiGetMe|flushSync)$/;

const rel = (sf) => path.relative(root, sf.fileName);
const lineOf = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
const isPromise = (t) => {
  const s = t.getSymbol();
  if (s && (s.getName() === 'Promise' || s.getName() === 'PromiseLike')) return true;
  return t.isUnion() && t.types.some(isPromise);
};

// 1) Names of context mutators: members of the AppContextType interface that return a promise.
const ctxFile = program.getSourceFile(path.join(root, 'src/context/AppContext.tsx'));
const mutators = new Set();
ts.forEachChild(ctxFile, (n) => {
  if (ts.isInterfaceDeclaration(n) && n.name.text === 'AppContextType') {
    for (const m of n.members) {
      if (!ts.isPropertySignature(m) || !m.name) continue;
      const t = checker.getTypeAtLocation(m);
      const sigs = t.getCallSignatures();
      if (sigs.length && sigs.some((s) => isPromise(s.getReturnType()))) mutators.add(m.name.getText());
    }
  }
});
if (mutators.size < 30) { console.error(`guard needs updating: found only ${mutators.size} context mutators`); process.exit(1); }

const calleeName = (call) => {
  const e = call.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
};
const unwrap = (n) => { while (n.parent && (ts.isParenthesizedExpression(n.parent) || ts.isAsExpression(n.parent) || ts.isNonNullExpression(n.parent))) n = n.parent; return n; };
const enclosingFnName = (n) => {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isVariableDeclaration(p) && p.initializer && ts.isIdentifier(p.name) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer) || (ts.isCallExpression(p.initializer) && calleeName(p.initializer) === 'useCallback'))) return p.name.text;
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
  }
  return ''; // innermost named function
};
const insideCall = (n, name) => {
  for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && calleeName(p) === name) return true;
  return false;
};

const offenders = [];
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile || sf.fileName.includes('node_modules')) continue;
  const inSrc = sf.fileName.startsWith(path.join(root, 'src'));
  const isCtx = sf === ctxFile;
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      const top = unwrap(n);
      const parent = top.parent;
      const dropped =
        ts.isExpressionStatement(parent) ||
        (ts.isVoidExpression(parent) && ts.isExpressionStatement(unwrap(parent).parent));
      const isVoided = ts.isVoidExpression(parent);
      // A. mutators
      if (inSrc && mutators.has(name) && !READ_LOADERS.test(name) && isPromise(checker.getTypeAtLocation(n))) {
        if (dropped) offenders.push(`${rel(sf)}:${lineOf(sf, n)} ${name}() result dropped${isVoided ? ' (void)' : ''}: await it and show the result`);
        else if (ts.isArrowFunction(parent) && parent.body === top) {
          // expression-bodied arrow: only fine when the arrow itself is awaited/returned by a caller
          const arrow = parent;
          const holder = arrow.parent;
          if (ts.isJsxExpression(holder) && ts.isJsxAttribute(holder.parent)) {
            offenders.push(`${rel(sf)}:${lineOf(sf, n)} ${holder.parent.name.getText()}={() => ${name}(...)} drops the result: use an async handler and await it`);
          }
        }
      }
      // B. other dangling promises
      if (inSrc && (!mutators.has(name) || READ_LOADERS.test(name)) && dropped && !isVoided && isPromise(checker.getTypeAtLocation(n))) {
        // `x.catch(...)` or `x.then(...)` chains are judged by their root call name
        let rootName = name; let e = n.expression;
        while (ts.isPropertyAccessExpression(e) && ts.isCallExpression(e.expression)) { rootName = calleeName(e.expression); e = e.expression.expression; }
        const auditPost = rootName === 'fetch' && sf.fileName.endsWith('services/apiSync.ts'); // best-effort audit post (reviewed in Step 6)
        if (!auditPost && !FIRE_AND_FORGET_OK.test(rootName) && !FIRE_AND_FORGET_OK.test(name)) offenders.push(`${rel(sf)}:${lineOf(sf, n)} ${rootName || name}() promise not awaited: await it, or mark a deliberate fire-and-forget with void and add it to FIRE_AND_FORGET_OK`);
      }
      // Queue-only helpers
      if (isCtx && Object.hasOwn(QUEUE_ONLY_HELPERS, name) && !insideCall(n, 'runFinancialWrite') && !(Object.hasOwn(QUEUE_ONLY_HELPERS, name) && Object.hasOwn(QUEUE_ONLY_HELPERS, enclosingFnName(n)))) {
        offenders.push(`${rel(sf)}:${lineOf(sf, n)} ${name}() may only be called inside runFinancialWrite`);
      }
      // C. financial server calls
      if (FINANCIAL_API.includes(name)) {
        if (!isCtx) { if (inSrc) offenders.push(`${rel(sf)}:${lineOf(sf, n)} ${name}() may only be called from AppContext inside runFinancialWrite`); }
        else if (!insideCall(n, 'runFinancialWrite') && !(Object.hasOwn(QUEUE_ONLY_HELPERS, enclosingFnName(n)))) {
          offenders.push(`${rel(sf)}:${lineOf(sf, n)} ${name}() outside runFinancialWrite (financial writes must be queued and confirm-first)`);
        }
      }
      // D. financial setters
      if (isCtx && FINANCIAL_SETTERS.includes(name)) {
        const fn = enclosingFnName(n);
        if (!insideCall(n, 'runFinancialWrite') && !(Object.hasOwn(FINANCIAL_SETTER_ALLOWED, fn)) && !(Object.hasOwn(QUEUE_ONLY_HELPERS, fn))) {
          const inEffect = (() => { for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && calleeName(p) === 'useEffect') return true; return false; })();
          const emptying = n.arguments.length === 1 && ts.isArrayLiteralExpression(n.arguments[0]) && n.arguments[0].elements.length === 0;
          if (!inEffect && !emptying) offenders.push(`${rel(sf)}:${lineOf(sf, n)} ${name}() inside ${fn || '(top)'}() — change financial lists only inside runFinancialWrite, or add the function to FINANCIAL_SETTER_ALLOWED with a reason`);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

if (offenders.length) {
  console.error('FAIL: a result is being dropped, or a financial write bypasses the queue:');
  offenders.forEach((o) => console.error('  - ' + o));
  process.exit(1);
}
console.log(`ok: ${mutators.size} context mutators are always awaited; financial writes all go through runFinancialWrite`);
