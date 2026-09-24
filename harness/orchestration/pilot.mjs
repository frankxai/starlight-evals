import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const sha256 = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fail = (ok, message) => { if (!ok) throw new Error(message); };
const models = ['gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra'];
const dimensions = ['correctness', 'completeness', 'regressionSafety', 'sourceAccuracy'];
export const fixtures = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url)));

export function matrix(suite = fixtures) {
  fail(suite.version === 1 && suite.fixtures.length === 10, 'Expected frozen ten-fixture suite');
  fail(new Set(suite.fixtures.map(f => f.id)).size === 10, 'Duplicate fixture ids');
  const rows = [];
  for (const f of suite.fixtures) {
    for (const model of models) rows.push({ id: `${f.id}:baseline:${model}`, fixtureId: f.id, kind: 'baseline', model, effort: model === 'gpt-6-luna' ? 'medium' : 'high', pattern: 'single', repeat: 1 });
    for (const repeat of [1, 2]) rows.push({ id: `${f.id}:candidate:${repeat}`, fixtureId: f.id, kind: 'candidate', model: f.leadModel, effort: 'high', pattern: f.pattern, repeat });
    rows.push({ id: `${f.id}:review`, fixtureId: f.id, kind: 'review', model: null, pattern: 'independent-review', repeat: 1 });
  }
  return { version: 1, suiteHash: sha256(suite), maxTaskRuns: 60, billing: 'existing-subscriptions-only', status: 'planned-not-executed', rows };
}

export function prompt(fixtureId) {
  const f = fixtures.fixtures.find(f => f.id === fixtureId);
  fail(f, 'Unknown fixture');
  return { id: f.id, taskClass: f.taskClass, prompt: f.prompt, inputs: f.inputs, outputContract: f.outputContract };
}

export function validateReceipt(r, plan = matrix()) {
  const row = plan.rows.find(row => row.id === r?.cellId);
  fail(row && r.suiteHash === plan.suiteHash, 'Unknown cell or stale fixture hash');
  fail(r.mode === 'live' && r.status === 'complete', 'Only completed live evidence can be scored');
  fail(r.billing === 'subscription', 'Pilot forbids new API spend');
  fail(typeof r.runtime === 'string' && r.runtime.length && typeof r.provider === 'string' && r.provider.length, 'Missing actual provider/runtime');
  fail(typeof r.model === 'string' && r.model.length && (row.model === null || r.model === row.model), 'Actual model does not match cell');
  fail(r.pattern === row.pattern && r.repeat === row.repeat, 'Pattern or repeat differs from cell');
  fail(typeof r.effort === 'string' && r.effort.length, 'Missing actual effort');
  fail(!row.effort || row.effort === r.effort, 'Actual effort differs from cell');
  fail(typeof r.protocolHash === 'string' && /^[a-f0-9]{64}$/.test(r.protocolHash), 'Missing protocol hash');
  fail(Array.isArray(r.invocations) && r.invocations.length > 0, 'Missing invocation accounting');
  for (const i of r.invocations) fail(i.model && i.provider && i.runtime && i.evidenceRef, 'Incomplete invocation receipt');
  fail(r.invocations.some(i => i.model === r.model && i.provider === r.provider && i.runtime === r.runtime), 'No invocation supports claimed lead identity');
  fail(Array.isArray(r.artifacts) && r.artifacts.length > 0 && r.artifacts.every(a => a.ref && /^[a-f0-9]{64}$/.test(a.sha256)), 'Missing artifact hashes');
  fail(typeof r.elapsedMs === 'number' && Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0, 'Invalid elapsed time');
  fail(r.costUsd === null, 'Subscription cost must remain unknown, not API-equivalent');
  if (row.kind === 'review') {
    fail(r.provider !== 'openai' && r.verdict && Array.isArray(r.reviewedCells) && r.reviewedCells.length === 5, 'Review must be independent and cover five cells');
    const expected = plan.rows.filter(x => x.fixtureId === row.fixtureId && x.kind !== 'review').map(x => x.id);
    fail(new Set(r.reviewedCells.map(x => x.cellId)).size === 5 && r.reviewedCells.every(x => expected.includes(x.cellId) && /^[a-f0-9]{64}$/.test(x.receiptHash)), 'Invalid review bindings');
  } else {
    fail(r.provider === 'openai', 'GPT-6 pilot cells require the OpenAI provider');
    const f = fixtures.fixtures.find(f => f.id === row.fixtureId);
    fail(r.checks && f.checks.every(c => typeof r.checks[c] === 'boolean'), 'Missing required deterministic checks');
    fail(r.scores && dimensions.every(k => Number.isInteger(r.scores[k]) && r.scores[k] >= 0 && r.scores[k] <= 4), 'Invalid quality scores');
    fail(typeof r.criticalRegression === 'boolean', 'Missing regression assessment');
    fail(Array.isArray(r.verificationEvidence) && r.verificationEvidence.length > 0 && r.verificationEvidence.every(x => x.ref && /^[a-f0-9]{64}$/.test(x.sha256)), 'Missing verifier evidence hashes');
  }
  return row;
}

// Pure comparison: receipt authenticity/artifact bytes must be verified by the host.
export function assess(receipts, plan = matrix()) {
  const byId = new Map();
  for (const r of receipts) {
    validateReceipt(r, plan);
    fail(!byId.has(r.cellId), 'Duplicate cell receipt');
    byId.set(r.cellId, r);
  }
  const results = [];
  for (const f of fixtures.fixtures) {
    const required = plan.rows.filter(x => x.fixtureId === f.id);
    const missing = required.filter(x => !byId.has(x.id)).map(x => x.id);
    if (missing.length) { results.push({ fixtureId: f.id, status: 'pending', missing }); continue; }
    const review = byId.get(`${f.id}:review`);
    fail(review.reviewedCells.every(x => sha256(byId.get(x.cellId)) === x.receiptHash), 'Review is stale for artifact receipts');
    const baselines = required.filter(x => x.kind === 'baseline').map(x => byId.get(x.id));
    const candidates = required.filter(x => x.kind === 'candidate').map(x => byId.get(x.id));
    fail(new Set([...baselines, ...candidates].map(r => r.protocolHash)).size === 1, 'Unmatched evaluation protocols');
    const sum = r => dimensions.reduce((s, d) => s + r.scores[d], 0);
    const passing = r => !r.criticalRegression && f.checks.every(c => r.checks[c]) && r.scores.correctness >= 3;
    const validBaselines = baselines.filter(passing);
    const strongest = validBaselines.toSorted((a, b) => b.scores.correctness - a.scores.correctness || sum(b) - sum(a))[0];
    const best = strongest ? sum(strongest) : null;
    const eligible = Boolean(strongest) && review.verdict === 'pass' && candidates.every(r => passing(r) && dimensions.every(d => r.scores[d] >= strongest.scores[d]));
    results.push({ fixtureId: f.id, status: eligible ? 'provisional-pass' : 'retain-baseline', bestBaselineScore: validBaselines.length ? best : null, candidateScores: candidates.map(sum) });
  }
  const taskClasses = [...new Set(fixtures.fixtures.map(f => f.taskClass))].map(taskClass => {
    const ids = fixtures.fixtures.filter(f => f.taskClass === taskClass).map(f => f.id);
    return { taskClass, eligible: ids.every(id => results.find(r => r.fixtureId === id).status === 'provisional-pass') };
  });
  return { version: 1, suiteHash: plan.suiteHash, completedCells: byId.size, remainingCells: 60 - byId.size, results, taskClasses, scope: 'Small pilot; no automatic default change or universal model ranking' };
}

// Hosts persist this reservation before any provider call; failures consume a run.
export function reserve(ledger, cellId, plan = matrix()) {
  fail(ledger?.suiteHash === plan.suiteHash && Array.isArray(ledger.attempts), 'Invalid pilot ledger');
  fail(ledger.attempts.length < 60 && !ledger.stopped, 'Pilot budget exhausted or stopped');
  fail(plan.rows.some(r => r.id === cellId), 'Unknown cell');
  fail(!ledger.attempts.some(a => a.cellId === cellId), 'Cell already attempted; no unbudgeted retry');
  return { ...ledger, attempts: [...ledger.attempts, { cellId, status: 'reserved' }] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [command = 'plan', arg] = process.argv.slice(2);
    let result;
    if (command === 'plan') result = matrix();
    else if (command === 'prompt') result = prompt(arg);
    else if (command === 'assess') result = assess(JSON.parse(readFileSync(arg, 'utf8')));
    else throw new Error('Usage: pilot.mjs plan | prompt <fixture-id> | assess <receipts.json>');
    console.log(JSON.stringify(result, null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
