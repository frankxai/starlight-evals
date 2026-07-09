// Starlight Evals — promptfoo custom provider that shells out to the local
// `claude` CLI in print mode, instead of calling the Anthropic API with a key.
//
// Why: Frank's workstation already has `claude` authenticated via his Claude
// subscription (OAuth session, `claude auth status` -> loggedIn: true,
// authMethod: claude.ai). This provider reuses that session so evals never
// need ANTHROPIC_API_KEY locally. CI keeps the key-gated cloud provider as an
// optional fallback (see .github/workflows/evals.yml).
//
// Contract verified directly against promptfoo's provider loader (inspected
// dist/src/providers-DehrvR_t.js in the npx-cached install,
// npx/_npx/81bbc6515d992ace, promptfoo@0.121.18):
//   - `file://` provider paths are instantiated as
//     `new (importModule(path))({ ...providerOptions, id: providerId })`
//   - `importModule` unwraps `module.default.default || module.default ||
//     module` — a plain `export default class` satisfies this.
//   - providerOptions is `{ id, config, env }`; `config` is exactly the YAML
//     `config:` block under this provider's entry.
//   - Returned shape follows promptfoo's ProviderResponse: `{ output }` on
//     success, `{ error }` on failure (never throw — that produces a
//     less-informative promptfoo-internal error instead of a per-test one).
//
// `claude` resolves to a native compiled binary here (C:\Users\frank\.local\
// bin\claude.exe, confirmed via `Get-Command claude`), not a .cmd/.ps1 shim,
// so this spawns it directly with an argv array and shell:false — no shell
// quoting/injection surface for arbitrary prompt text.

import { spawn } from "node:child_process";

const DEFAULT_MODEL = "sonnet";
const DEFAULT_TIMEOUT_MS = 120_000;
const CLAUDE_BIN = process.env.CLAUDE_CLI_BIN || "claude";

function spawnClaude({ prompt, model, timeoutMs }) {
  return new Promise((resolve) => {
    const args = [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--model",
      model,
      // Text-generation only: no tool execution during evals.
      "--tools",
      "",
      "--no-session-persistence",
    ];

    let child;
    try {
      child = spawn(CLAUDE_BIN, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      resolve({ error: `claude-cli: failed to spawn "${CLAUDE_BIN}": ${err.message}` });
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ error: `claude-cli: timed out after ${timeoutMs}ms (model=${model})` });
    }, timeoutMs);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      finish({ error: `claude-cli: spawn error: ${err.message}` });
    });

    child.on("close", (code) => {
      finish({ code, stdout, stderr });
    });
  });
}

// Best-effort extraction of the human-readable failure reason from a
// claude -p --output-format json payload, even when the process exited
// non-zero. The CLI still emits full JSON on auth/API failures (a "system"
// init event, sometimes an "api_retry" event, then a "result" event whose
// `.result` field is the actual message, e.g. "Failed to authenticate. API
// Error: 401 Invalid authentication credentials") — that result event can
// sit well past the first few KB of output (the init event alone dumps the
// full tool/slash-command catalog), so naively slicing from the start of
// raw stdout silently drops the one line that matters. Always try JSON
// first; only fall back to a raw-text tail (not head) if parsing fails.
function extractFailureReason(stdout, stderr) {
  try {
    const parsed = JSON.parse(stdout);
    const events = Array.isArray(parsed) ? parsed : [parsed];
    const resultEvent = [...events].reverse().find((event) => event && event.type === "result");
    if (resultEvent) {
      const reason = resultEvent.result || resultEvent.subtype || JSON.stringify(resultEvent).slice(0, 1000);
      return `${reason}${resultEvent.api_error_status ? ` (api_error_status=${resultEvent.api_error_status})` : ""}`;
    }
  } catch {
    // fall through to raw-text handling below
  }
  const raw = (stderr || stdout || "").trim();
  return raw ? `(no result event; tail of raw output) ${raw.slice(-2000)}` : "(no output)";
}

// `claude -p --output-format json` normally prints one JSON object (the
// "result" event). Guard for the array-of-events shape too, in case a future
// CLI version streams events even in non-stream-json mode.
function parseClaudeStdout(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    return { error: `claude-cli: non-JSON stdout (${err.message}): ${stdout.slice(0, 2000)}` };
  }

  const result = Array.isArray(parsed) ? parsed.find((event) => event.type === "result") : parsed;

  if (!result) {
    return { error: `claude-cli: no result event in output: ${stdout.slice(0, 2000)}` };
  }

  if (result.is_error || result.subtype === "error") {
    return { error: `claude-cli: ${result.result || result.subtype || "unknown error"}` };
  }

  if (typeof result.result !== "string") {
    return { error: `claude-cli: result event missing string "result" field: ${JSON.stringify(result).slice(0, 2000)}` };
  }

  const usage = result.usage;
  return {
    output: result.result,
    tokenUsage: usage
      ? {
          prompt: usage.input_tokens ?? 0,
          completion: usage.output_tokens ?? 0,
          total: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        }
      : undefined,
    cost: result.total_cost_usd,
    metadata: {
      sessionId: result.session_id,
      durationMs: result.duration_ms,
      numTurns: result.num_turns,
    },
  };
}

export default class ClaudeCliProvider {
  constructor(options = {}) {
    this.config = options.config || {};
    this.model = this.config.model || DEFAULT_MODEL;
    this.timeoutMs = this.config.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  id() {
    return `claude-cli:${this.model}`;
  }

  toString() {
    return `[Claude CLI Provider ${this.model}]`;
  }

  async callApi(prompt) {
    const spawnResult = await spawnClaude({ prompt, model: this.model, timeoutMs: this.timeoutMs });
    if (spawnResult.error) {
      // Spawn-level failure (couldn't launch the binary) or a timeout kill —
      // no process output to inspect.
      return { error: spawnResult.error };
    }
    if (spawnResult.code !== 0) {
      const reason = extractFailureReason(spawnResult.stdout, spawnResult.stderr);
      return { error: `claude-cli: exited ${spawnResult.code} (model=${this.model}): ${reason}` };
    }
    return parseClaudeStdout(spawnResult.stdout);
  }
}
