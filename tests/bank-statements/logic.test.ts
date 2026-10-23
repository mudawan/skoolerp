import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractFragments, scoreHistory, type FragmentMatchRow } from '../../server/bank-statements/fragments';
import { scoreCandidate } from '../../server/bank-statements/suggest';
import { inferPaymentMode } from '../../server/bank-statements/service';

const v = (outstanding: number, over: object = {}) => ({
  voucherId: 'v', voucherNo: 'FE1', month: '2026-09', status: 'Issued', outstanding, payable: true, blockedReason: null, netDue: outstanding, ...over,
});

test('fragments keep identifying parts and drop banking noise, dates and bank txn ids', () => {
  const f = extractFragments('IBFT FROM MUHAMMAD IQBAL 0300123456 FEE SEPT FT26244X 20260910123456', 'FT26244X');
  const texts = f.map((x) => `${x.kind}:${x.text}`);
  assert.ok(texts.includes('word:MUHAMMAD'));
  assert.ok(texts.includes('word:IQBAL'));
  assert.ok(texts.includes('phrase:MUHAMMAD IQBAL'));
  assert.ok(texts.includes('number:0300123456'));
  assert.ok(!texts.some((t) => /IBFT|FEE|SEPT|FT26244X|2026091012/.test(t)), texts.join(','));
});

test('masked account/phone tails are kept as weak fragments', () => {
  const f = extractFragments('TRANSFER FROM 0300XXXX4567 ALI');
  assert.ok(f.some((x) => x.kind === 'masked' && x.text === '4567'));
});

test('history score: a rare fragment beats a common surname', () => {
  const rows: FragmentMatchRow[] = [
    { studentId: 'a', fragment: 'KHAN', kind: 'word', hits: 1, token: 'KHAN', similarity: 1, students: 40 },
    { studentId: 'b', fragment: 'ZAINULABIDEEN', kind: 'word', hits: 1, token: 'ZAINULABIDEEN', similarity: 1, students: 1 },
  ];
  const s = scoreHistory(rows);
  assert.ok(s.get('b')!.score > s.get('a')!.score * 3);
  assert.ok(s.get('b')!.score <= 1);
});

test('ranking: history > exact amount > close amount > any open voucher; assigned students sink', () => {
  const hist = scoreCandidate(5000, { history: { score: 0.8, reasons: ['h'] }, voucher: v(9000) as any, assignedInUpload: false });
  const exact = scoreCandidate(5000, { history: null, voucher: v(5000) as any, assignedInUpload: false });
  const close = scoreCandidate(5000, { history: null, voucher: v(5200) as any, assignedInUpload: false });
  const any = scoreCandidate(5000, { history: null, voucher: v(20000) as any, assignedInUpload: false });
  assert.ok(hist.score > exact.score && exact.score > close.score && close.score > any.score);
  const taken = scoreCandidate(5000, { history: null, voucher: v(5000) as any, assignedInUpload: true });
  assert.ok(taken.score < any.score, 'an exact match already assigned elsewhere ranks below a plain open voucher');
  const blocked = scoreCandidate(5000, { history: null, voucher: v(5000, { payable: false, blockedReason: 'not latest' }) as any, assignedInUpload: false });
  assert.ok(blocked.score < exact.score && blocked.reasons.includes('not latest'));
});

test('payment mode follows the channel named in the narration', () => {
  assert.equal(inferPaymentMode('IBFT FROM ALI'), 'OnlineTransfer');
  assert.equal(inferPaymentMode('RAAST P2P'), 'OnlineTransfer');
  assert.equal(inferPaymentMode('CASH DEPOSIT AT BRANCH'), 'BankDeposit');
});
