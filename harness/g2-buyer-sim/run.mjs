#!/usr/bin/env node
// G2 buyer-simulation harness — PRODUCT-RELEASE-GATE.md gate 2.
// A fresh-context agent plays the buyer: receives the artifact, follows the
// instructions exactly as written, attempts the promised outcome. Transcript is
// evidence; friction is a defect, not a note.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProvider } from './providers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : null)).filter(Boolean)
);

if (!args.product) {
  console.error('usage: node run.mjs --product <manifest.json> --provider <claude|codex|grok|mock> [--out <dir>]');
  process.exit(2);
}

const manifestPath = resolve(args.product);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.files = (manifest.files ?? []).map(f => resolve(dirname(manifestPath), f));
const provider = args.provider ?? 'mock';
const stamp = new Date().toISOString().slice(0, 10);
const outDir = resolve(args.out ?? join(here, 'runs', `${manifest.id}-${stamp}`));
mkdirSync(outDir, { recursive: true });

const promptTemplate = readFileSync(join(here, 'buyer-prompt.md'), 'utf8');
const prompt = promptTemplate
  .replaceAll('{{PRODUCT_NAME}}', manifest.name)
  .replaceAll('{{PRICE}}', manifest.price ?? 'unknown')
  .replaceAll('{{PROMISE}}', manifest.promise)
  .replaceAll('{{ARTIFACT_PATH}}', resolve(dirname(resolve(args.product)), manifest.artifact))
  .replaceAll('{{ENTRYPOINT}}', manifest.entrypoint)
  .replaceAll('{{BUYER_PLATFORM}}', manifest.buyerPlatform ?? 'a clean Windows 11 machine');

const started = Date.now();
const result = await runProvider(provider, prompt, manifest);

const defects = extractDefects(result.transcript);
const p0 = defects.filter(d => d.severity === 'P0').length;
const p1 = defects.filter(d => d.severity === 'P1').length;
const verdict = p0 > 0 ? 'FAIL' : p1 > 0 ? 'BLOCKED-P1' : 'PASS';

writeFileSync(join(outDir, `transcript-${provider}.md`), result.transcript);
writeFileSync(join(outDir, `defects-${provider}.json`), JSON.stringify(defects, null, 2));
writeFileSync(
  join(outDir, `summary-${provider}.json`),
  JSON.stringify(
    {
      gate: 'G2',
      product: manifest.id,
      provider: result.providerLabel,
      date: new Date().toISOString(),
      durationMs: Date.now() - started,
      outcomeReached: result.outcomeReached ?? p0 === 0,
      defectCounts: { P0: p0, P1: p1, P2: defects.length - p0 - p1 },
      verdict
    },
    null,
    2
  )
);

console.log(`G2 ${manifest.id} [${provider}] → ${verdict} (P0:${p0} P1:${p1}) → ${outDir}`);
process.exit(verdict === 'PASS' ? 0 : 1);

// Defects are emitted by the buyer agent as a fenced ```defects json block.
function extractDefects(transcript) {
  const m = transcript.match(/```defects\s*([\s\S]*?)```/);
  if (!m) return [{ severity: 'P0', title: 'Buyer agent produced no structured defect block', evidence: 'transcript missing ```defects fence — run invalid' }];
  try {
    const parsed = JSON.parse(m[1]);
    return Array.isArray(parsed) ? parsed : parsed.defects ?? [];
  } catch (e) {
    return [{ severity: 'P0', title: 'Defect block is not valid JSON', evidence: String(e) }];
  }
}
