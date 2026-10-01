import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, fixtures, matrix, prompt, reserve, sha256, validateReceipt } from './pilot.mjs';
const plan = matrix();
function receipt(row) {
  const f = fixtures.fixtures.find(f => f.id === row.fixtureId);
  return { cellId: row.id, suiteHash: plan.suiteHash, mode: 'live', status: 'complete', billing: 'subscription', runtime: 'fixture-runtime', provider: row.kind === 'review' ? 'anthropic' : 'openai', model: row.model ?? 'fixture-reviewer', pattern: row.pattern, repeat: row.repeat, effort: row.effort ?? 'high', protocolHash: sha256('frozen-protocol'), invocations: [{ model: row.model ?? 'fixture-reviewer', provider: row.kind === 'review' ? 'anthropic' : 'openai', runtime: 'fixture-runtime', evidenceRef: 'fixture:invocation' }], artifacts: [{ ref: 'fixture:artifact', sha256: sha256('artifact') }], elapsedMs: 100, costUsd: null, checks: Object.fromEntries(f.checks.map(c => [c, true])), criticalRegression: false, verificationEvidence: [{ ref: 'fixture:test', sha256: sha256('test') }], scores: { correctness: 4, completeness: 4, regressionSafety: 4, sourceAccuracy: 4 } };
}
function complete() {
  const receipts = plan.rows.filter(r => r.kind !== 'review').map(receipt);
  for (const row of plan.rows.filter(r => r.kind === 'review')) receipts.push({ ...receipt(row), verdict: 'pass', reviewedCells: receipts.filter(r => r.cellId.startsWith(`${row.fixtureId}:`)).map(r => ({ cellId: r.cellId, receiptHash: sha256(r) })) });
  return receipts;
}
function rebind(rs) {
  for (const r of rs.filter(r => r.pattern === 'independent-review')) for (const binding of r.reviewedCells) binding.receiptHash = sha256(rs.find(x => x.cellId === binding.cellId));
}
test('matrix is 30 baselines, 20 candidates and 10 independent reviews', () => {
  assert.equal(plan.rows.length, 60);
  for (const [kind, n] of [['baseline', 30], ['candidate', 20], ['review', 10]]) assert.equal(plan.rows.filter(r => r.kind === kind).length, n);
  assert.equal(new Set(plan.rows.map(r => r.id)).size, 60);
  assert.equal('checks' in prompt('debugging-empty'), false);
});
test('empty and partial evidence stay pending', () => {
  assert.equal(assess([]).remainingCells, 60);
  assert.ok(assess([]).taskClasses.every(t => !t.eligible));
  assert.equal(assess([receipt(plan.rows[0])]).completedCells, 1);
});
test('synthetic receipts exercise comparator only', () => {
  const r = assess(complete()); assert.equal(r.remainingCells, 0); assert.ok(r.taskClasses.every(t => t.eligible));
});
test('demo, stale, duplicate, wrong model, wrong pattern and fabricated costs reject', () => {
  const r = receipt(plan.rows[0]);
  for (const delta of [{ mode: 'demo' }, { suiteHash: 'old' }, { model: 'other' }, { pattern: 'manager' }, { costUsd: 0 }, { checks: {} }, { verificationEvidence: [] }]) assert.throws(() => validateReceipt({ ...r, ...delta }));
  assert.throws(() => assess([r, r]), /Duplicate/);
});
test('review must be independent and bound to current receipts', () => {
  const rs = complete(); const review = rs.find(r => r.pattern === 'independent-review'); review.provider = 'openai'; review.invocations[0].provider = 'openai'; assert.throws(() => assess(rs), /independent/);
  review.provider = 'anthropic'; review.invocations[0].provider = 'anthropic'; rs[0].elapsedMs++; assert.throws(() => assess(rs), /stale/);
});
test('regressions, mandatory check failure and weak quality prevent promotion', () => {
  for (const change of [r => { r.criticalRegression = true; }, r => { r.checks['empty-rejected'] = false; }, r => { r.scores.correctness = 2; }]) {
    const rs = complete(); change(rs.find(r => r.cellId === 'debugging-empty:candidate:1')); rebind(rs);
    assert.equal(assess(rs).taskClasses.find(t => t.taskClass === 'debugging').eligible, false);
  }
});
test('unmatched protocols reject', () => {
  const rs = complete(); rs[0].protocolHash = sha256('different'); rebind(rs); assert.throws(() => assess(rs), /protocols/);
});
test('reservations count failures and prohibit unbudgeted retry', () => {
  let ledger = { suiteHash: plan.suiteHash, attempts: [] };
  for (const r of plan.rows) ledger = reserve(ledger, r.id);
  assert.throws(() => reserve(ledger, plan.rows[0].id), /budget/);
  const one = reserve({ suiteHash: plan.suiteHash, attempts: [] }, plan.rows[0].id);
  assert.throws(() => reserve(one, plan.rows[0].id), /already attempted/);
  assert.throws(() => reserve({ ...one, stopped: true }, plan.rows[1].id), /stopped/);
});
