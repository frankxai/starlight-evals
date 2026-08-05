#!/usr/bin/env node
/**
 * Built on SIP — validates that lanes.json, routing-table.json, and every
 * scorecards/*.json parse as valid JSON, and that promptfooconfig.yaml
 * exists (existence-only — a full parse would require a YAML dependency
 * this repo doesn't otherwise carry; the eval harness itself is the real
 * validator for that file's contents). Cheap structural guard wired into
 * `npm test` + CI. Exits non-zero on the first failure so broken receipts
 * or a missing eval config never ship silently.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const jsonTargets = [];
const lanes = join(ROOT, "lanes.json");
if (existsSync(lanes)) jsonTargets.push(lanes);
const routingTable = join(ROOT, "routing-table.json");
if (existsSync(routingTable)) jsonTargets.push(routingTable);
const scorecardsDir = join(ROOT, "scorecards");
if (existsSync(scorecardsDir)) {
  for (const f of readdirSync(scorecardsDir)) {
    if (f.endsWith(".json")) jsonTargets.push(join(scorecardsDir, f));
  }
}

let failures = 0;
for (const t of jsonTargets) {
  try {
    JSON.parse(readFileSync(t, "utf8"));
    console.log(`  ok   ${t.slice(ROOT.length + 1)}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${t.slice(ROOT.length + 1)} — ${err.message}`);
  }
}

const promptfooConfig = join(ROOT, "promptfooconfig.yaml");
if (existsSync(promptfooConfig)) {
  console.log(`  ok   promptfooconfig.yaml (exists)`);
} else {
  failures++;
  console.error(`  FAIL promptfooconfig.yaml — file not found`);
}

const total = jsonTargets.length + 1;
console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
