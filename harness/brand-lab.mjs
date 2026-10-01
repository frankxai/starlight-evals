#!/usr/bin/env node
/**
 * Built on SIP — Brand Lab runner (v0.1).
 *
 * Runs one brand card (brand-lab/brands/<id>.json) with a CANDIDATE model
 * against one or more COMPARATORS (other frontier, previous generation, or open
 * weight), and emits a receipt that says whether the candidate should be
 * adopted for that brand's workflows — cost-adjusted, with intervals.
 *
 * ORDER OF OPERATIONS (load-bearing; see brand-lab/README.md)
 *   1. PRE-REGISTER. Hash the card, models, judges, sample count and decision
 *      rule; write prereg.json BEFORE any model call. The hash seeds every
 *      random choice (A/B order), so the run is reproducible from its raw rows.
 *   2. PREFLIGHT. Resolve every OpenRouter slug against the live catalog.
 *      Unknown slug => abort before spending anything.
 *   3. GENERATE. N samples per task per contestant. Provider pinned
 *      (allow_fallbacks=false). Cost read from the API, never estimated.
 *   4. MECHANICAL. Deterministic checks. A side that fails them forfeits the
 *      pairwise comparison — a judge cannot launder a constraint violation.
 *   5. JUDGE. Blind pairwise, two judges from families NOT in the pair, both
 *      A/B orders. Disagreement between orders => TIE (position bias).
 *   6. AGGREGATE. Task-level scores, paired bootstrap over TASKS (not calls),
 *      Wilson on raw comparisons for reference, Cohen's kappa between judges.
 *   7. VERDICT. Pre-registered rule in harness/lib/stats.mjs::verdict.
 *      Safety-gate tasks override everything.
 *
 * HONEST DEGRADATION
 *   No OPENROUTER_API_KEY (or --dry-run) => an UNRUN receipt with the planned
 *   call count and zero result rows. Budget cap reached => PARTIAL receipt;
 *   verdicts computed only over tasks that finished for every contestant.
 *   A number never appears in a receipt unless an API returned it.
 *
 * USAGE
 *   node harness/brand-lab.mjs --brand frankx --candidate claude-sonnet-5.5
 *   node harness/brand-lab.mjs --brand arcanea --candidate claude-opus-5.5 \
 *        --comparator gpt-5.5 --comparator claude-opus-5 --samples 3 --budget-usd 10
 *   node harness/brand-lab.mjs --brand animelegends --candidate gpt-image
 *   node harness/brand-lab.mjs --brand ai-architect --candidate opencode-default --tier T4
 *   node harness/brand-lab.mjs --brand all --candidate claude-sonnet-5.5 --dry-run
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runMechanical, imageDims } from "./lib/scorers.mjs";
import { call, callCli, hasOpenRouter } from "./lib/transport.mjs";
import { wilson, pairedBootstrap, cohensKappa, verdict, rng, seedFromHash, mean } from "./lib/stats.mjs";
import { pushLangfuse, pushClickHouse, lfTrace, lfGeneration, lfScore } from "./lib/sinks.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAB = join(ROOT, "brand-lab");
const SCHEMA = "brand-lab-run/v0.1";

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = { comparators: [], samples: 3, judgeOrders: 2, concurrency: 4, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--brand") a.brand = v();
    else if (k === "--candidate") a.candidate = v();
    else if (k === "--comparator") a.comparators.push(v());
    else if (k === "--tier") a.tier = v();
    else if (k === "--samples") a.samples = Number(v());
    else if (k === "--budget-usd") a.budgetUsd = Number(v());
    else if (k === "--judge-orders") a.judgeOrders = Number(v());
    else if (k === "--concurrency") a.concurrency = Number(v());
    else if (k === "--note") a.note = v();
    else if (k === "--out") a.out = v();
    else if (k === "--dry-run") a.dryRun = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

const sha = (s) => createHash("sha256").update(s).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function loadRegistry() {
  const reg = readJson(join(LAB, "models.json"));
  const byId = new Map(reg.models.map((m) => [m.id, m]));
  return { reg, byId };
}

export function loadBrands(id) {
  const dir = join(LAB, "brands");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  const all = files.map((f) => ({ file: f, raw: readFileSync(join(dir, f), "utf8") }));
  const pick = id === "all" ? all : all.filter((b) => b.file === `${id}.json`);
  if (!pick.length) throw new Error(`no brand card for "${id}" (have: ${files.map((f) => f.replace(".json", "")).join(", ")})`);
  return pick.map((b) => ({ ...JSON.parse(b.raw), _raw: b.raw }));
}

/** Flatten a card into tasks, tagging modality (default text) and tier. */
export function flattenTasks(brand, tierFilter) {
  const out = [];
  for (const wf of brand.workflows) {
    for (const t of wf.tiers) {
      if (tierFilter && t.tier !== tierFilter) continue;
      for (const task of t.tasks) {
        out.push({ ...task, modality: task.agent ? "agent" : task.modality || "text", tier: t.tier, workflow: wf.id });
      }
    }
  }
  return out;
}

/** Which tasks a given contestant can sit. Agent tasks need a CLI harness. */
export function eligible(task, model) {
  if (task.modality === "agent") return model.transport === "cli";
  if (model.transport === "cli") return false;
  return task.modality === model.modality;
}

/** Two judges from families not in the pair, in registry order. */
export function pickJudges(reg, byId, modality, familiesInPair) {
  const pool = modality === "image" ? reg.judges.vision : reg.judges.text;
  return pool.map((id) => byId.get(id)).filter((m) => m && !familiesInPair.includes(m.family)).slice(0, 2);
}

// ── concurrency ─────────────────────────────────────────────────────────────
async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Number(n) || 1) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// ── preflight ───────────────────────────────────────────────────────────────
async function preflight(models) {
  const res = await fetch("https://openrouter.ai/api/v1/models").catch((e) => ({ ok: false, statusText: e.message }));
  if (!res.ok) return { ok: false, error: `catalog unreachable: ${res.statusText || res.status}` };
  const { data } = await res.json();
  const catalog = new Map(data.map((m) => [m.id, m]));
  const missing = models.filter((m) => m.transport !== "cli" && !catalog.has(m.openrouterId)).map((m) => `${m.id} -> ${m.openrouterId}`);
  const prices = Object.fromEntries(
    models.filter((m) => catalog.has(m.openrouterId)).map((m) => {
      const p = catalog.get(m.openrouterId).pricing || {};
      return [m.id, { inputPer1m: Number(p.prompt) * 1e6, outputPer1m: Number(p.completion) * 1e6, image: p.image ?? null }];
    }),
  );
  return { ok: missing.length === 0, missing, prices, catalogSize: data.length };
}

// ── generation ──────────────────────────────────────────────────────────────
function messagesFor(task) {
  const m = [];
  if (task.system) m.push({ role: "system", content: task.system });
  m.push({ role: "user", content: task.prompt });
  return m;
}

async function runAgentTask(model, task, cli = callCli) {
  const dir = mkdtempSync(join(tmpdir(), `brand-lab-${task.id}-`));
  try {
    for (const [p, body] of Object.entries(task.agent.files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), body);
    }
    const verifyBefore = readFileSync(join(dir, "verify.mjs"), "utf8");
    const t0 = Date.now();
    const r = await cli({ ...model, cwd: dir }, { prompt: task.prompt, cwd: dir });
    const [cmd, ...args] = task.agent.verify;
    const v = spawnSync(cmd, args, { cwd: dir, encoding: "utf8", timeout: 60_000 });
    const tampered = readFileSync(join(dir, "verify.mjs"), "utf8") !== verifyBefore;
    return {
      ...r,
      ok: true,
      text: r.text || r.error || "",
      agentVerify: { pass: v.status === 0 && !tampered, tampered, stdout: (v.stdout || "").slice(0, 400), stderr: (v.stderr || "").slice(0, 400) },
      latencyMs: Date.now() - t0,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function transcribe(judge, b64, callFn = call) {
  const r = await callFn(judge, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe every piece of visible text in this image exactly as rendered, one item per line. Do not correct spelling. If there is no text, output NONE." },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      },
    ],
    maxTokens: 200,
    temperature: 0,
  });
  return r.ok ? { text: r.text, costUsd: r.usage.costUsd } : { text: "", costUsd: null, error: r.error };
}

// ── judging ─────────────────────────────────────────────────────────────────
function judgeMessages(brand, task, a, b) {
  const sys =
    `You are a blind evaluator for ${brand.name}. The reader is: ${brand.avatar.who}. ` +
    `You will see a task and two responses, A and B. Judge only against the criterion. ` +
    `Longer is not better. Do not reward confident tone over correctness. ` +
    `Reply with JSON only: {"winner":"A"|"B"|"TIE","reason":"<=25 words"}.`;
  const header = `TASK:\n${task.prompt}\n\nCRITERION:\n${task.rubric}`;
  if (task.modality === "image") {
    return [
      { role: "system", content: sys },
      {
        role: "user",
        content: [
          { type: "text", text: `${header}\n\nImage A then image B follow.` },
          { type: "image_url", image_url: { url: `data:image/png;base64,${a.image}` } },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b.image}` } },
        ],
      },
    ];
  }
  return [
    { role: "system", content: sys },
    { role: "user", content: `${header}\n\n<response_A>\n${a.text}\n</response_A>\n\n<response_B>\n${b.text}\n</response_B>` },
  ];
}

function parseWinner(text) {
  const m = String(text).match(/"winner"\s*:\s*"(A|B|TIE)"/i);
  return m ? m[1].toUpperCase() : null;
}

// ── main ────────────────────────────────────────────────────────────────────
export async function runBrand(brand, rawArgs, ctx) {
  const args = { comparators: [], samples: 3, judgeOrders: 2, concurrency: 4, ...rawArgs };
  const { reg, byId } = ctx;
  const callFn = ctx.call ?? call;
  const keyPresent = ctx.hasKey ?? hasOpenRouter();
  const cand = byId.get(args.candidate);
  if (!cand) throw new Error(`unknown candidate ${args.candidate} (brand-lab/models.json)`);
  const compIds = args.comparators.length ? args.comparators : brand.comparators.default;
  const comps = compIds.map((id) => {
    const m = byId.get(id);
    if (!m) throw new Error(`unknown comparator ${id}`);
    return m;
  });
  const contestants = [cand, ...comps];
  const tasks = flattenTasks(brand, args.tier).filter((t) => eligible(t, cand));

  const runId = `${new Date().toISOString().slice(0, 10)}-${brand.id}-${cand.id}-${sha(String(Date.now())).slice(0, 6)}`;
  const outDir = join(args.out || join(ROOT, "out", "brand-lab"), runId);
  mkdirSync(outDir, { recursive: true });

  const judgePlan = tasks
    .filter((t) => t.rubric)
    .flatMap((t) => comps.filter((c) => eligible(t, c)).map((c) => ({ task: t.id, vs: c.id, judges: pickJudges(reg, byId, t.modality, [cand.family, c.family]).map((j) => j.id) })));

  const prereg = {
    schema: "brand-lab-prereg/v0.1",
    runId,
    createdAt: new Date().toISOString(),
    brand: brand.id,
    cardSha256: sha(brand._raw),
    registrySha256: sha(readFileSync(join(LAB, "models.json"), "utf8")),
    candidate: cand.id,
    comparators: comps.map((c) => c.id),
    tierFilter: args.tier ?? null,
    samples: args.samples,
    judgeOrders: args.judgeOrders,
    judgePlan,
    decisionRule: {
      source: "harness/lib/stats.mjs::verdict",
      costCeiling: brand.decision.costCeiling,
      minItems: brand.decision.minItems,
      interval: "95% paired bootstrap over tasks, 5000 iters, seed = prereg hash",
      safetyGates: brand.safetyGates ?? [],
    },
    budgetUsd: args.budgetUsd ?? brand.budget.perRunCapUsd,
    note: args.note ?? null,
  };
  prereg.sha256 = sha(JSON.stringify(prereg));
  writeFileSync(join(outDir, "prereg.json"), JSON.stringify(prereg, null, 2) + "\n");
  const next = rng(seedFromHash(prereg.sha256));

  const plannedGen = tasks.reduce((n, t) => n + contestants.filter((m) => eligible(t, m)).length * args.samples, 0);
  const plannedJudge = judgePlan.reduce((n, p) => n + p.judges.length * args.judgeOrders * args.samples, 0);
  const plannedTranscribe = tasks.filter((t) => t.mechanical?.some((c) => c.type === "transcriptionMatch")).reduce((n, t) => n + contestants.filter((m) => eligible(t, m)).length * args.samples, 0);

  const base = {
    schema: SCHEMA,
    runId,
    brand: { id: brand.id, name: brand.name, avatar: brand.avatar.who },
    prereg: { path: "prereg.json", sha256: prereg.sha256 },
    candidate: cand.id,
    comparators: comps.map((c) => c.id),
    plan: { tasks: tasks.length, generations: plannedGen, judgeCalls: plannedJudge, transcriptions: plannedTranscribe, maxJudgeCallsIfNoForfeits: plannedJudge },
  };

  const needsApi = contestants.some((m) => m.transport !== "cli") || plannedJudge > 0;
  if (args.dryRun || (needsApi && !keyPresent)) {
    const receipt = {
      ...base,
      status: "UNRUN",
      reason: args.dryRun ? "--dry-run" : "OPENROUTER_API_KEY not set",
      results: [],
      caveats: ["No model was called. Plan counts only. No number in this receipt is a measurement."],
    };
    writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    return { receipt, outDir };
  }

  const pf = !needsApi ? { ok: true, missing: [], prices: {}, catalogSize: null, skipped: "no API calls in this run" } : await (ctx.preflight ?? preflight)(contestants.concat([...reg.judges.text, ...reg.judges.vision].map((id) => byId.get(id)).filter(Boolean)));
  if (!pf.ok) {
    const receipt = { ...base, status: "ABORTED-PREFLIGHT", preflight: pf, results: [], caveats: ["Unknown or unreachable model slugs. Nothing was spent."] };
    writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
    return { receipt, outDir };
  }

  // Budget guard: shared across generation, transcription and judging.
  const cap = prereg.budgetUsd;
  let spent = 0;
  let halted = false;
  const spend = (c) => {
    if (typeof c === "number") spent += c;
    if (spent >= cap) halted = true;
  };

  const callsPath = join(outDir, "calls.jsonl");
  const judgePath = join(outDir, "judgments.jsonl");
  mkdirSync(join(outDir, "images"), { recursive: true });

  // 3–4. generation + mechanical
  const jobs = [];
  for (const t of tasks) for (const m of contestants) if (eligible(t, m)) for (let s = 0; s < args.samples; s++) jobs.push({ t, m, s });
  const gens = await pool(jobs, args.concurrency, async ({ t, m, s }) => {
    if (halted) return null;
    const startedAt = new Date().toISOString();
    let r;
    if (t.modality === "agent") r = await runAgentTask(m, t, ctx.callCli);
    else r = await callFn(m, { messages: messagesFor(t), maxTokens: t.maxTokens ?? 2048, image: t.modality === "image", seed: s });
    spend(r.usage?.costUsd);
    const rec = { brand: brand.id, taskId: t.id, tier: t.tier, workflow: t.workflow, model: m.id, family: m.family, sample: s, startedAt, endedAt: new Date().toISOString(), ok: r.ok, error: r.error ?? null, servedBy: r.servedBy ?? null, servedModel: r.servedModel ?? null, usage: r.usage ?? null, latencyMs: r.latencyMs, prompt: t.prompt, output: r.text ?? "" };
    if (r.agentVerify) rec.agentVerify = r.agentVerify;
    if (r.images?.length) {
      rec.image = r.images[0];
      rec.imageDims = imageDims(r.images[0]);
      const f = `images/${t.id}-${m.id}-${s}.png`;
      writeFileSync(join(outDir, f), Buffer.from(r.images[0], "base64"));
      rec.imageFile = f;
    }
    if (t.mechanical?.some((c) => c.type === "transcriptionMatch") && rec.image) {
      const tj = pickJudges(reg, byId, "image", [m.family])[0];
      const tr = await transcribe(tj, rec.image, callFn);
      spend(tr.costUsd);
      rec.transcription = tr.text;
      rec.transcribedBy = tj.id;
    }
    rec.mechanical = r.ok ? runMechanical(t.mechanical, rec.output, rec) : [{ type: "call", pass: false, detail: r.error }];
    if (t.modality === "agent" && !rec.agentVerify) rec.mechanical.push({ type: "agentVerify", pass: false, detail: "verify did not run" });
    if (rec.agentVerify) rec.mechanical.push({ type: "agentVerify", pass: rec.agentVerify.pass, detail: rec.agentVerify.tampered ? "verify.mjs tampered" : rec.agentVerify.stdout || rec.agentVerify.stderr });
    rec.mechPass = rec.mechanical.every((c) => c.pass);
    const { image, ...line } = rec;
    appendFileSync(callsPath, JSON.stringify(line) + "\n");
    return rec;
  });
  const done = gens.filter(Boolean);
  const get = (taskId, modelId, s) => done.find((g) => g.taskId === taskId && g.model === modelId && g.sample === s);

  // 5. judging
  const comparisons = [];
  const judgeJobs = [];
  for (const t of tasks) {
    for (const c of comps) {
      if (!eligible(t, c)) continue;
      for (let s = 0; s < args.samples; s++) {
        const A = get(t.id, cand.id, s);
        const B = get(t.id, c.id, s);
        if (!A || !B) continue;
        const cmp = { taskId: t.id, tier: t.tier, vs: c.id, sample: s, outcome: null, how: null, votes: [] };
        comparisons.push(cmp);
        if (A.mechPass && !B.mechPass) Object.assign(cmp, { outcome: 1, how: "mech-forfeit-comparator" });
        else if (!A.mechPass && B.mechPass) Object.assign(cmp, { outcome: 0, how: "mech-forfeit-candidate" });
        else if (!A.mechPass && !B.mechPass) Object.assign(cmp, { outcome: 0.5, how: "both-failed-mechanical" });
        else if (!t.rubric) Object.assign(cmp, { outcome: 0.5, how: "both-passed-mechanical-no-rubric" });
        else {
          const judges = pickJudges(reg, byId, t.modality, [cand.family, c.family]);
          for (const j of judges) judgeJobs.push({ t, cmp, j, A, B });
        }
      }
    }
  }
  await pool(judgeJobs, args.concurrency, async ({ t, cmp, j, A, B }) => {
    if (halted) return;
    const candFirst = next() < 0.5;
    const orders = args.judgeOrders >= 2 ? [candFirst, !candFirst] : [candFirst];
    const picks = [];
    for (const cf of orders) {
      const [x, y] = cf ? [A, B] : [B, A];
      const r = await callFn(j, { messages: judgeMessages(brand, t, x, y), maxTokens: 200, temperature: 0 });
      spend(r.usage?.costUsd);
      const w = r.ok ? parseWinner(r.text) : null;
      const candWon = w === "TIE" || w == null ? null : (w === "A") === cf;
      picks.push(w == null ? "INVALID" : w === "TIE" ? "TIE" : candWon ? "CAND" : "COMP");
      appendFileSync(judgePath, JSON.stringify({ taskId: t.id, vs: cmp.vs, sample: cmp.sample, judge: j.id, candidateShownAs: cf ? "A" : "B", raw: r.text ?? r.error, parsed: w, costUsd: r.usage?.costUsd ?? null }) + "\n");
    }
    const consistent = picks.every((p) => p === picks[0]) && picks[0] !== "INVALID";
    const vote = consistent ? picks[0] : "TIE";
    cmp.votes.push({ judge: j.id, vote, positionFlip: !consistent });
  });
  for (const cmp of comparisons) {
    if (cmp.outcome != null) continue;
    if (!cmp.votes.length) continue; // halted before judging
    cmp.outcome = mean(cmp.votes.map((v) => (v.vote === "CAND" ? 1 : v.vote === "COMP" ? 0 : 0.5)));
    cmp.how = "judged";
  }

  // 6. aggregate
  const perModel = contestants.map((m) => {
    const rows = done.filter((g) => g.model === m.id);
    const passes = rows.filter((g) => g.mechPass).length;
    const lat = rows.map((g) => g.latencyMs).filter((x) => x != null).sort((a, b) => a - b);
    const costs = rows.map((g) => g.usage?.costUsd);
    const measured = costs.filter((c) => typeof c === "number");
    return {
      model: m.id,
      calls: rows.length,
      mechanicalPass: wilson(passes, rows.length),
      costUsd: measured.length === costs.length && costs.length ? measured.reduce((a, b) => a + b, 0) : null,
      costMeasuredShare: costs.length ? measured.length / costs.length : null,
      latencyMs: lat.length ? { p50: lat[Math.floor(lat.length * 0.5)], p95: lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] } : null,
      servedBy: [...new Set(rows.map((g) => g.servedBy).filter(Boolean))],
    };
  });

  const gateFails = (brand.safetyGates ?? []).filter((id) => done.some((g) => g.taskId === id && g.model === cand.id && !g.mechPass));
  const pairwise = comps.map((c) => {
    const rows = comparisons.filter((x) => x.vs === c.id && x.outcome != null);
    const byTask = new Map();
    for (const r of rows) byTask.set(r.taskId, [...(byTask.get(r.taskId) || []), r.outcome]);
    const taskScores = [...byTask.entries()].map(([taskId, xs]) => ({ taskId, score: mean(xs) }));
    const boot = pairedBootstrap(taskScores.map((x) => x.score - 0.5), { seed: seedFromHash(prereg.sha256) });
    const raw = wilson(rows.reduce((s, r) => s + r.outcome, 0), rows.length);
    const judged = rows.filter((r) => r.how === "judged");
    const pairsForKappa = judged.filter((r) => r.votes.length === 2);
    const candCost = perModel.find((p) => p.model === cand.id).costUsd;
    const compCost = perModel.find((p) => p.model === c.id).costUsd;
    const costRatio = candCost != null && compCost ? candCost / compCost : null;
    const winLo = boot.lo == null ? null : 0.5 + boot.lo;
    const winHi = boot.hi == null ? null : 0.5 + boot.hi;
    let v = verdict({ winLo, winHi, costRatio: costRatio ?? Infinity, costCeiling: brand.decision.costCeiling, minN: brand.decision.minItems, n: taskScores.length });
    if (gateFails.length) v = "BLOCKED-SAFETY";
    return {
      vs: c.id,
      tasks: taskScores.length,
      comparisons: rows.length,
      winRate: boot.mean == null ? null : 0.5 + boot.mean,
      winInterval95: [winLo, winHi],
      rawComparisonWilson: raw,
      howCounts: rows.reduce((acc, r) => ((acc[r.how] = (acc[r.how] || 0) + 1), acc), {}),
      positionFlipRate: judged.length ? judged.flatMap((r) => r.votes).filter((v) => v.positionFlip).length / judged.flatMap((r) => r.votes).length : null,
      judgeKappa: pairsForKappa.length >= 5 ? cohensKappa(pairsForKappa.map((r) => r.votes[0].vote), pairsForKappa.map((r) => r.votes[1].vote)) : null,
      costRatio,
      verdict: v,
      taskScores,
    };
  });

  const namedWeaknesses = [...new Set(done.filter((g) => g.model === cand.id && !g.mechPass).map((g) => g.taskId))].map((id) => {
    const fails = done.filter((g) => g.model === cand.id && g.taskId === id && !g.mechPass);
    return { taskId: id, failedSamples: fails.length, of: args.samples, detail: fails[0].mechanical.filter((c) => !c.pass).map((c) => `${c.type}: ${c.detail}`) };
  });

  const date = runId.slice(0, 10);
  const claimsAllowed = pairwise
    .filter((p) => ["ADOPT", "ADOPT-IF-BUDGET", "REGRESS", "PARITY", "PARITY-CHEAPER"].includes(p.verdict))
    .map((p) => {
      const pct = (x) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);
      return `On the ${brand.name} card (${p.tasks} tasks x ${args.samples} samples, ${date}), ${cand.id} vs ${p.vs}: blind pairwise win rate ${pct(p.winRate)} (95% CI ${pct(p.winInterval95[0])}-${pct(p.winInterval95[1])}), cost ratio ${p.costRatio == null ? "unmeasured" : p.costRatio.toFixed(2) + "x"}. Verdict: ${p.verdict}.`;
    });

  const receipt = {
    ...base,
    status: !done.length ? "EMPTY" : halted ? "PARTIAL" : "COMPLETE",
    spendUsd: Number(spent.toFixed(4)),
    budgetUsd: cap,
    preflight: { catalogSize: pf.catalogSize, prices: pf.prices },
    perModel,
    pairwise,
    safetyGateFailures: gateFails,
    namedWeaknesses,
    claimsAllowed,
    claimsForbidden: [
      "Any claim not listed in claimsAllowed.",
      "'Best model' or rankings beyond the pairs actually run.",
      "Generalising from this card to other domains or to the model's overall capability.",
      ...pairwise.filter((p) => p.verdict === "UNDERPOWERED").map((p) => `Any win/loss claim for ${cand.id} vs ${p.vs} (underpowered: ${p.tasks} tasks < ${brand.decision.minItems}).`),
    ],
    caveats: [
      `n = ${tasks.length} tasks on one brand card; results describe this card, not the model in general.`,
      "Judges are LLMs; mechanical forfeits and position-flip ties bound their influence but do not remove it.",
      "Model slugs resolve through OpenRouter with provider fallbacks disabled; a different host or quantization can change results.",
      ...(halted ? [`Budget cap $${cap} reached; unfinished comparisons are excluded, not imputed.`] : []),
    ],
  };
  writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");

  // Sinks (views, never the record)
  const traceId = runId;
  const events = [lfTrace(traceId, `brand-lab:${brand.id}`, { candidate: cand.id, comparators: comps.map((c) => c.id), prereg: prereg.sha256 }, ["brand-lab", brand.id])];
  done.forEach((g, i) => {
    const gid = `${runId}-g${i}`;
    events.push(lfGeneration(gid, traceId, g));
    events.push(lfScore(`${gid}-mech`, traceId, `mechanical:${g.taskId}:${g.model}`, g.mechPass ? 1 : 0, g.mechanical.map((c) => c.detail).join("; ")));
  });
  const lf = ctx.sinks === false ? { skipped: true } : await pushLangfuse(events);
  const ch = ctx.sinks === false ? { skipped: true } : await pushClickHouse("lab.calls", done.map(({ image, prompt, output, mechanical, ...g }) => ({ run_id: runId, prereg_sha: prereg.sha256, brand: g.brand, task_id: g.taskId, tier: g.tier, workflow: g.workflow, model: g.model, family: g.family, sample: g.sample, ok: g.ok ? 1 : 0, mech_pass: g.mechPass ? 1 : 0, input_tokens: g.usage?.input ?? null, output_tokens: g.usage?.output ?? null, cost_usd: g.usage?.costUsd ?? null, latency_ms: g.latencyMs ?? null, served_by: g.servedBy ?? "", started_at: g.startedAt.replace("T", " ").slice(0, 19) })));
  const chp = ctx.sinks === false ? { skipped: true } : await pushClickHouse("lab.pairwise", pairwise.map((p) => ({ run_id: runId, prereg_sha: prereg.sha256, brand: brand.id, run_date: date, candidate: cand.id, comparator: p.vs, tasks: p.tasks, win_rate: p.winRate, win_lo: p.winInterval95[0], win_hi: p.winInterval95[1], cost_ratio: p.costRatio, verdict: p.verdict })));
  receipt.sinks = { langfuse: lf, clickhouseCalls: ch, clickhousePairwise: chp };
  writeFileSync(join(outDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  return { receipt, outDir };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.brand || !args.candidate) {
    console.log("usage: node harness/brand-lab.mjs --brand <id|all> --candidate <model-id> [--comparator <id>]... [--tier T1..T4] [--samples 3] [--budget-usd N] [--judge-orders 2] [--dry-run]");
    process.exit(args.help ? 0 : 2);
  }
  const ctx = loadRegistry();
  const brands = loadBrands(args.brand);
  const receipts = [];
  let total = 0;
  for (const b of brands) {
    if (args.budgetUsd != null && total >= args.budgetUsd) {
      console.log(`[brand-lab] shared budget exhausted before ${b.id}; skipping`);
      continue;
    }
    const { receipt, outDir } = await runBrand(b, args.budgetUsd != null ? { ...args, budgetUsd: args.budgetUsd - total } : args, ctx);
    total += receipt.spendUsd ?? 0;
    receipts.push(receipt);
    const banner = receipt.status === "UNRUN" ? "UNRUN — nothing was measured" : receipt.status;
    console.log(`[brand-lab] ${b.id}: ${banner}; plan ${receipt.plan.tasks} tasks / ${receipt.plan.generations} generations / <=${receipt.plan.judgeCalls} judge calls -> ${outDir}`);
    for (const p of receipt.pairwise ?? []) console.log(`  vs ${p.vs}: ${p.verdict} win=${p.winRate?.toFixed(2) ?? "n/a"} [${p.winInterval95.map((x) => x?.toFixed(2) ?? "n/a").join(", ")}] cost x${p.costRatio?.toFixed(2) ?? "?"}`);
  }
  if (args.brand === "all" && args.comparators.length) {
    const estate = poolEstate(receipts, args);
    const f = join(args.out || join(ROOT, "out", "brand-lab"), `${new Date().toISOString().slice(0, 10)}-estate-${args.candidate}.json`);
    writeFileSync(f, JSON.stringify(estate, null, 2) + "\n");
    console.log(`[brand-lab] estate pooled: ${estate.status} -> ${f}`);
    for (const p of estate.pairwise) console.log(`  vs ${p.vs}: ${p.verdict} over ${p.tasks} tasks from ${p.brands} brands`);
  }
}

/**
 * Estate-level pooling. Brand cards are small by design (they mirror real
 * workflows, not benchmark filler), so a single brand rarely clears minItems.
 * Pooling task-level scores across brands answers "is the candidate better for
 * the estate's workloads" with enough tasks to mean something; brand-level
 * verdicts stay the routing signal once each card is large enough.
 * Only valid when every brand ran the SAME explicit comparators.
 */
export function poolEstate(receipts, args, { minItems = 12, costCeiling = 1.5 } = {}) {
  const ran = receipts.filter((r) => r.status === "COMPLETE" || r.status === "PARTIAL");
  const pairwise = args.comparators.map((vs) => {
    const scores = ran.flatMap((r) => (r.pairwise ?? []).filter((p) => p.vs === vs).flatMap((p) => p.taskScores.map((t) => ({ brand: r.brand.id, ...t }))));
    const seed = seedFromHash(sha(ran.map((r) => r.prereg.sha256).join("")) || "0");
    const boot = pairedBootstrap(scores.map((x) => x.score - 0.5), { seed });
    const cand = ran.reduce((s, r) => s + (r.perModel?.find((m) => m.model === args.candidate)?.costUsd ?? NaN), 0);
    const comp = ran.reduce((s, r) => s + (r.perModel?.find((m) => m.model === vs)?.costUsd ?? NaN), 0);
    const costRatio = Number.isFinite(cand) && Number.isFinite(comp) && comp > 0 ? cand / comp : null;
    const winLo = boot.lo == null ? null : 0.5 + boot.lo;
    const winHi = boot.hi == null ? null : 0.5 + boot.hi;
    const blocked = ran.some((r) => r.safetyGateFailures?.length);
    return {
      vs,
      brands: new Set(scores.map((s) => s.brand)).size,
      tasks: scores.length,
      winRate: boot.mean == null ? null : 0.5 + boot.mean,
      winInterval95: [winLo, winHi],
      costRatio,
      verdict: blocked ? "BLOCKED-SAFETY" : verdict({ winLo, winHi, costRatio: costRatio ?? Infinity, costCeiling, minN: minItems, n: scores.length }),
    };
  });
  return {
    schema: "brand-lab-estate/v0.1",
    status: ran.length ? "POOLED" : "UNRUN",
    candidate: args.candidate,
    comparators: args.comparators,
    receipts: receipts.map((r) => ({ runId: r.runId, status: r.status, prereg: r.prereg.sha256 })),
    pairwise,
    caveats: ["Pooled over brand cards with different task mixes; the estate verdict does not transfer to any single brand without that brand's own powered card."],
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[brand-lab] ${err.message}`);
    process.exit(1);
  });
}
