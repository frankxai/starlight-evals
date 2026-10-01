#!/usr/bin/env node
/**
 * Built on SIP — structural validator for brand-lab cards + model registry.
 * Cheap, offline, deterministic. Wired into `npm test` and CI.
 *
 * Invariants (each one closes a way to publish a number that means nothing):
 *   - every task carries >=1 mechanical check (no pure-judge task); T4 agent
 *     tasks satisfy this with their sandbox verify script
 *   - every scorer type exists and every regex compiles with the runner's flags
 *   - task ids are unique across the estate (receipts join on them)
 *   - comparators and judges resolve in the registry
 *   - every default candidate/comparator pair leaves >=2 non-contestant judges
 *   - image tasks declare an aspect; agent tasks declare files + verify
 *   - every card declares budget + decision rule + publish surface
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCORERS } from "../harness/lib/scorers.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAB = join(ROOT, "brand-lab");
const TIERS = new Set(["T1", "T2", "T3", "T4"]);

export function validateEstate() {
  const errors = [];
  const summary = [];
  const reg = JSON.parse(readFileSync(join(LAB, "models.json"), "utf8"));
  const byId = new Map(reg.models.map((m) => [m.id, m]));
  for (const pool of ["text", "vision"]) for (const j of reg.judges[pool]) if (!byId.has(j)) errors.push(`registry: judge ${j} not a model`);

  const seen = new Map();
  for (const f of readdirSync(join(LAB, "brands")).filter((x) => x.endsWith(".json")).sort()) {
    const where = `brands/${f}`;
    let b;
    try {
      b = JSON.parse(readFileSync(join(LAB, "brands", f), "utf8"));
    } catch (e) {
      errors.push(`${where}: invalid JSON (${e.message})`);
      continue;
    }
    if (`${b.id}.json` !== f) errors.push(`${where}: id "${b.id}" does not match filename`);
    for (const k of ["name", "avatar", "publish", "budget", "decision", "comparators", "workflows"]) if (!(k in b)) errors.push(`${where}: missing ${k}`);
    if (!b.avatar?.who || !b.avatar?.jobs?.length) errors.push(`${where}: avatar needs who + jobs`);
    if (!(b.budget?.monthlyUsd > 0) || !(b.budget?.perRunCapUsd > 0)) errors.push(`${where}: budget.monthlyUsd and perRunCapUsd must be > 0`);
    if (!(b.decision?.costCeiling > 0) || !(b.decision?.minItems >= 1)) errors.push(`${where}: decision.costCeiling/minItems required`);
    for (const c of b.comparators?.default ?? []) if (!byId.has(c)) errors.push(`${where}: comparator ${c} not in registry`);

    let tasks = 0;
    let judged = 0;
    const modalities = new Set();
    for (const wf of b.workflows ?? []) {
      for (const tier of wf.tiers ?? []) {
        if (!TIERS.has(tier.tier)) errors.push(`${where}: ${wf.id} bad tier ${tier.tier}`);
        for (const t of tier.tasks ?? []) {
          tasks++;
          const id = `${where}:${t.id}`;
          if (seen.has(t.id)) errors.push(`${id}: duplicate task id (also in ${seen.get(t.id)})`);
          seen.set(t.id, where);
          if (!t.prompt) errors.push(`${id}: missing prompt`);
          if (!t.mechanical?.length && !t.agent) errors.push(`${id}: needs >=1 mechanical check (agent tasks use their verify script)`);
          if (t.rubric) judged++;
          const modality = t.agent ? "agent" : t.modality || "text";
          modalities.add(modality);
          if (modality === "image" && !t.aspect) errors.push(`${id}: image task needs aspect`);
          if (t.agent && (!t.agent.files || !t.agent.verify?.length)) errors.push(`${id}: agent task needs files + verify`);
          if (t.agent && tier.tier !== "T4") errors.push(`${id}: agent tasks belong in T4`);
          for (const c of t.mechanical ?? []) {
            if (!SCORERS[c.type]) errors.push(`${id}: unknown scorer ${c.type}`);
            for (const p of [...(c.patterns ?? []), ...(c.accept ?? []), ...(c.pattern ? [c.pattern] : [])]) {
              try {
                new RegExp(p, "imu");
              } catch (e) {
                errors.push(`${id}: regex does not compile: ${p} (${e.message})`);
              }
            }
          }
        }
      }
    }
    for (const s of b.safetyGates ?? []) if (![...seen.entries()].some(([tid, w]) => tid === s && w === where)) errors.push(`${where}: safety gate ${s} is not a task in this card`);

    // Judge availability for each default pair, per modality present.
    for (const c of b.comparators?.default ?? []) {
      const m = byId.get(c);
      if (!m) continue;
      for (const pool of ["text", "vision"]) {
        const eligibleJudges = reg.judges[pool].map((j) => byId.get(j)).filter((j) => j && j.family !== m.family);
        if (eligibleJudges.length < 3) errors.push(`${where}: ${pool} judge pool leaves <3 judges excluding ${m.family}; any cross-family pair would drop below 2`);
      }
    }
    summary.push({ brand: b.id, tasks, judged, judgedShare: tasks ? judged / tasks : 0, modalities: [...modalities] });
  }
  return { errors, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, summary } = validateEstate();
  for (const s of summary) console.log(`  ${s.brand.padEnd(22)} ${String(s.tasks).padStart(2)} tasks  judged ${Math.round(s.judgedShare * 100)}%  [${s.modalities.join(", ")}]`);
  if (errors.length) {
    for (const e of errors) console.error(`  FAIL ${e}`);
    process.exit(1);
  }
  console.log(`brand-lab: ${summary.length} cards, ${summary.reduce((n, s) => n + s.tasks, 0)} tasks, all invariants hold`);
}
