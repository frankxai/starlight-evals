// Every harness entry point must answer --help, and reject unknown arguments, before it
// calls a model, fetches from the network or writes a receipt.
//
// The scripts run as subprocesses with a preload (written to a temp dir below) that replaces
// child_process.* and fetch. Any attempt to start a process or open a connection is logged
// and the subprocess exits 97, so these tests cannot spend model quota or touch the network
// whatever the code under test does. CLAUDE_CLI_BIN also points at a path that does not
// exist, and token-like environment variables are dropped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCli } from "./cli.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TRIPPED = 97;

const LANES = [
  { script: "harness/deep-reasoning.mjs", flags: ["--dry-run", "--tasks", "--models", "--effort", "--concurrency", "--out", "--timeout-ms"], valueFlag: "--out" },
  { script: "harness/session-continuity.mjs", flags: ["--out", "--require-collector", "--record-golden", "--keep-sandbox", "--mutation"], valueFlag: "--out" },
  { script: "harness/continuity/mutation-check.mjs", flags: [], valueFlag: null },
  { script: "harness/income-payments-safety.mjs", flags: [], valueFlag: null },
];

const GUARD = `
const { appendFileSync } = require("node:fs");
const cp = require("node:child_process");
const trip = (what) => { appendFileSync(process.env.CLI_TEST_GUARD_LOG, what + "\\n"); process.exit(${TRIPPED}); };
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  cp[name] = (...args) => trip("child_process." + name + " " + JSON.stringify(args[0]));
}
globalThis.fetch = (url) => trip("fetch " + String(url));
require("node:module").syncBuiltinESMExports();
`;

const scratch = mkdtempSync(join(tmpdir(), "harness-cli-test-"));
const guard = join(scratch, "guard.cjs");
writeFileSync(guard, GUARD);

function safeEnv(log) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/TOKEN|SECRET|PASSWORD|API_KEY/i.test(key)) delete env[key];
  delete env.NODE_TEST_CONTEXT;
  return { ...env, CLAUDE_CLI_BIN: join(scratch, "no-such-claude"), CLI_TEST_GUARD_LOG: log };
}

function run(name, script, args) {
  const log = join(scratch, `${name}.guard.log`);
  const outDir = join(scratch, `${name}.out`);
  const withOut = args.map((a) => (a === "<out>" ? outDir : a));
  const before = existsSync(join(ROOT, "out")) ? readdirSync(join(ROOT, "out")).sort() : null;
  const r = spawnSync(process.execPath, ["--require", guard, join(ROOT, script), ...withOut],
    { cwd: ROOT, encoding: "utf8", env: safeEnv(log), timeout: 30_000 });
  const after = existsSync(join(ROOT, "out")) ? readdirSync(join(ROOT, "out")).sort() : null;
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    attempts: existsSync(log) ? readFileSync(log, "utf8").trim() : "",
    wroteOutDir: existsSync(outDir),
    changedRepoOut: JSON.stringify(before) !== JSON.stringify(after),
  };
}

function assertNothingStarted(r, label) {
  assert.equal(r.attempts, "", `${label}: tried to start a process or fetch: ${r.attempts}`);
  assert.equal(r.wroteOutDir, false, `${label}: wrote to --out`);
  assert.equal(r.changedRepoOut, false, `${label}: changed the repo out/ directory`);
}

for (const { script, flags, valueFlag } of LANES) {
  for (const help of ["--help", "-h"]) {
    test(`${script} ${help} prints usage and exits 0 before doing any work`, () => {
      const r = run(`help${help}-${script.replace(/\W/g, "_")}`, script, [help, ...(valueFlag ? [valueFlag, "<out>"] : [])]);
      assertNothingStarted(r, `${script} ${help}`);
      assert.equal(r.status, 0, `exit code (stderr: ${r.stderr.slice(0, 300)})`);
      assert.match(r.stdout, /^Usage: node /m);
      assert.ok(r.stdout.includes(script), "usage names the script");
      for (const flag of flags) assert.ok(r.stdout.includes(flag), `usage lists ${flag}`);
    });
  }

  test(`${script} rejects an unknown flag with exit 2 before doing any work`, () => {
    const r = run(`unknown-${script.replace(/\W/g, "_")}`, script, ["--definitely-not-a-flag", ...(valueFlag ? [valueFlag, "<out>"] : [])]);
    assertNothingStarted(r, `${script} unknown flag`);
    assert.equal(r.status, 2, `exit code (stdout: ${r.stdout.slice(0, 300)})`);
    assert.match(r.stderr, /unknown argument: --definitely-not-a-flag/);
    assert.match(r.stderr, /--help/);
  });

  test(`${script} rejects a stray positional argument with exit 2`, () => {
    const r = run(`positional-${script.replace(/\W/g, "_")}`, script, ["stray"]);
    assertNothingStarted(r, `${script} positional`);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown argument: stray/);
  });

  if (valueFlag) {
    test(`${script} rejects ${valueFlag} with no value with exit 2`, () => {
      const r = run(`novalue-${script.replace(/\W/g, "_")}`, script, [valueFlag]);
      assertNothingStarted(r, `${script} ${valueFlag} without value`);
      assert.equal(r.status, 2);
      assert.match(r.stderr, new RegExp(`${valueFlag} needs a value`));
    });
  }
}

test("deep-reasoning still accepts its real flags: --dry-run assembles prompts without a model call", () => {
  const r = run("dry-run", "harness/deep-reasoning.mjs", ["--dry-run", "--models", "haiku", "--effort", "high", "--concurrency", "2", "--timeout-ms", "1000", "--out", "<out>"]);
  assertNothingStarted(r, "deep-reasoning --dry-run");
  assert.equal(r.status, 0, r.stderr.slice(0, 300));
  assert.match(r.stdout, /dry run — no model was called/);
});

test("deep-reasoning still rejects an unknown --models key with exit 2 before any call", () => {
  const r = run("bad-model", "harness/deep-reasoning.mjs", ["--models", "not-a-tier", "--out", "<out>"]);
  assertNothingStarted(r, "deep-reasoning --models not-a-tier");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown --models key/);
});

test("parseCli returns the values it was given and leaves unset flags undefined", () => {
  const flags = { "--out": "value", "--dry-run": "boolean" };
  assert.deepEqual(parseCli({ usage: "Usage: node x", flags }, ["--out", "a", "--dry-run"]), { "--out": "a", "--dry-run": true });
  assert.deepEqual(parseCli({ usage: "Usage: node x", flags }, []), {});
});

test.after(() => rmSync(scratch, { recursive: true, force: true }));
