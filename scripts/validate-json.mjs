#!/usr/bin/env node
/**
 * Built on SIP — validates that lanes.json and every scorecards/*.json parse as
 * valid JSON. Cheap structural guard wired into `npm test` + CI. Exits non-zero
 * on the first parse failure so broken receipts never ship.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [];
const lanes = join(ROOT, "lanes.json");
if (existsSync(lanes)) targets.push(lanes);
const scorecardsDir = join(ROOT, "scorecards");
if (existsSync(scorecardsDir)) {
  for (const f of readdirSync(scorecardsDir)) {
    if (f.endsWith(".json")) targets.push(join(scorecardsDir, f));
  }
}

let failures = 0;
for (const t of targets) {
  try {
    JSON.parse(readFileSync(t, "utf8"));
    console.log(`  ok   ${t.slice(ROOT.length + 1)}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${t.slice(ROOT.length + 1)} — ${err.message}`);
  }
}

console.log(`\n${targets.length - failures}/${targets.length} JSON files valid`);
if (failures > 0) process.exit(1);
