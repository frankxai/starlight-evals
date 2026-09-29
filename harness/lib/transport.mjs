/**
 * Built on SIP — brand-lab transports.
 *
 * openrouter: one API, every frontier + open-weight family, per-call cost in
 *   the response (`usage: { include: true }`). Provider routing is PINNED per
 *   model entry (allow_fallbacks=false, optional quantization floor) so a run
 *   measures one model on one serving stack, not whatever host answered.
 * cli: any agent harness that takes a prompt and prints an answer — OpenCode,
 *   Hermes, Claude Code in -p mode, Codex exec. Cost is recorded as null
 *   (unmeasured) unless the harness reports it; null is never coerced to 0.
 */
import { spawn } from "node:child_process";

const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

export function hasOpenRouter() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function callOpenRouter(model, { messages, maxTokens = 2048, temperature, seed, image = false }) {
  const body = {
    model: model.openrouterId,
    messages,
    max_tokens: maxTokens,
    usage: { include: true },
  };
  if (temperature != null) body.temperature = temperature;
  if (seed != null) body.seed = seed;
  if (image) body.modalities = ["image", "text"];
  if (model.provider) body.provider = { allow_fallbacks: false, ...model.provider };
  if (model.reasoning) body.reasoning = model.reasoning;

  const t0 = Date.now();
  const res = await fetch(OR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://frankx.ai/research/model-arena",
      "X-Title": "Starlight Brand Lab",
    },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - t0;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: json?.error?.message || `HTTP ${res.status}`, latencyMs };
  }
  const msg = json.choices?.[0]?.message ?? {};
  const images = (msg.images || [])
    .map((im) => im?.image_url?.url || "")
    .filter((u) => u.startsWith("data:image"))
    .map((u) => u.split(",")[1]);
  return {
    ok: true,
    text: typeof msg.content === "string" ? msg.content : "",
    images,
    finishReason: json.choices?.[0]?.finish_reason ?? null,
    servedBy: json.provider ?? null,
    servedModel: json.model ?? null,
    usage: {
      input: json.usage?.prompt_tokens ?? null,
      output: json.usage?.completion_tokens ?? null,
      reasoning: json.usage?.completion_tokens_details?.reasoning_tokens ?? null,
      costUsd: typeof json.usage?.cost === "number" ? json.usage.cost : null,
    },
    latencyMs,
  };
}

export function callCli(model, { prompt, timeoutMs = 600_000, cwd }) {
  return new Promise((resolve) => {
    const [cmd, ...rest] = model.command;
    const args = model.promptVia === "arg" ? [...rest, prompt] : rest;
    const t0 = Date.now();
    let child;
    try {
      child = spawn(cmd, args, { cwd: cwd ?? model.cwd, stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      resolve({ ok: false, error: `spawn failed: ${err.message}`, latencyMs: 0 });
      return;
    }
    let out = "";
    let errOut = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (errOut += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message, latencyMs: Date.now() - t0 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(
        code === 0
          ? { ok: true, text: out.trim(), images: [], servedBy: model.id, usage: { input: null, output: null, reasoning: null, costUsd: null }, latencyMs: Date.now() - t0 }
          : { ok: false, error: `exit ${code}: ${errOut.slice(0, 400)}`, latencyMs: Date.now() - t0 },
      );
    });
    if (model.promptVia !== "arg") child.stdin.end(prompt);
  });
}

export async function call(model, req) {
  if (model.transport === "cli") return callCli(model, { prompt: req.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n\n") });
  return callOpenRouter(model, req);
}
