#!/usr/bin/env node
// lint-skills — static linter for SKILL.md files across the estate.
//
// Catches the bug classes that silently corrupt skills at load time:
//   1. dollar-digit ($0.05 → "<args>.05"): skill loaders substitute $<n> as
//      positional arguments, so any $<digit> in prose renders corrupted.
//   2. inline secrets (gho_/ghp_/sk-/whsec_/xoxb-/re_...): must never ship.
//   3. frontmatter contract: name present + matches folder, description
//      present and ≤1024 chars.
//   4. personal absolute paths (C:\Users\...): error with --strict (public
//      repos), warning otherwise (private estate skills may reference them).
//
// Usage: node scripts/lint-skills.mjs [--strict] <dir-or-file> [...more]
// Suppress a single line: append  <!-- lint-allow: dollar-digit -->
// Exit codes: 0 clean, 1 findings, 2 usage error.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const STRICT = process.argv.includes('--strict');
const roots = process.argv.slice(2).filter((a) => a !== '--strict');
if (roots.length === 0) {
  console.error('usage: lint-skills.mjs [--strict] <dir-or-file> [...]');
  process.exit(2);
}

const SECRET_PATTERNS = [
  /gho_[A-Za-z0-9]{16,}/, /ghp_[A-Za-z0-9]{16,}/, /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9-_]{20,}/, /whsec_[A-Za-z0-9]{16,}/, /xoxb-[A-Za-z0-9-]{16,}/,
  /re_[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/,
];

function collectSkillFiles(root) {
  const st = statSync(root);
  if (st.isFile()) return root.endsWith('.md') ? [root] : [];
  return readdirSync(root, { recursive: true })
    .map((p) => join(root, String(p)))
    .filter((p) => basename(p) === 'SKILL.md');
}

function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

const findings = [];
function finding(file, line, rule, msg, level = 'error') {
  findings.push({ file, line, rule, msg, level });
}

for (const rootArg of roots) {
  const root = resolve(rootArg);
  let files;
  try { files = collectSkillFiles(root); }
  catch (e) { console.error(`cannot read ${root}: ${e.message}`); process.exit(2); }

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const folder = basename(dirname(file));

    const fm = parseFrontmatter(text);
    if (!fm) {
      finding(file, 1, 'frontmatter', 'missing YAML frontmatter block');
    } else {
      if (!fm.name) finding(file, 1, 'frontmatter', 'missing `name` in frontmatter');
      else if (fm.name !== folder)
        finding(file, 1, 'frontmatter', `name "${fm.name}" does not match folder "${folder}"`);
      if (!fm.description) finding(file, 1, 'frontmatter', 'missing `description` in frontmatter');
      else if (fm.description.length > 1024)
        finding(file, 1, 'frontmatter', `description is ${fm.description.length} chars (max 1024)`);
    }

    let inFence = false;
    lines.forEach((ln, i) => {
      const n = i + 1;
      if (/^\s*```/.test(ln)) { inFence = !inFence; return; }
      if (ln.includes('lint-allow:')) return;

      // 1. dollar-digit — outside code fences; $ARGUMENTS-style is fine.
      if (!inFence && /\$\d/.test(ln)) {
        finding(file, n, 'dollar-digit',
          'contains $<digit> — skill loaders substitute this as a positional arg ' +
          '(e.g. "$0.05" renders as "<args>.05"). Write "5 cents" / "USD 0.05".');
      }

      // 2. secrets — everywhere, including fences.
      for (const re of SECRET_PATTERNS) {
        if (re.test(ln)) finding(file, n, 'secret', `matches secret pattern ${re}`);
      }

      // 3. personal absolute paths.
      if (/C:\\+Users\\+frank/i.test(ln) || /\/Users\/frank/.test(ln)) {
        finding(file, n, 'personal-path',
          'hardcoded personal path — breaks portability',
          STRICT ? 'error' : 'warning');
      }
    });
  }
}

const errors = findings.filter((f) => f.level === 'error');
const warnings = findings.filter((f) => f.level === 'warning');
for (const f of findings) {
  console.log(`${f.level.toUpperCase()} ${f.file}:${f.line} [${f.rule}] ${f.msg}`);
}
console.log(`\nlint-skills: ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length > 0 ? 1 : 0);
