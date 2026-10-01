/**
 * Built on SIP — optional observability sinks. Local files are the receipt of
 * record; Langfuse and ClickHouse are views over it. A sink failure is logged
 * and never fails the run, and never alters the committed receipt.
 *
 * Langfuse: public ingestion API (trace / generation / score events).
 *   env LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
 * ClickHouse: HTTP interface, JSONEachRow into infra/clickhouse/schema.sql.
 *   env CLICKHOUSE_URL, CLICKHOUSE_USER, CLICKHOUSE_PASSWORD
 */

export async function pushLangfuse(events) {
  const { LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = process.env;
  if (!LANGFUSE_HOST || !LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) return { skipped: true };
  const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64");
  let sent = 0;
  for (let i = 0; i < events.length; i += 200) {
    const res = await fetch(`${LANGFUSE_HOST.replace(/\/$/, "")}/api/public/ingestion`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ batch: events.slice(i, i + 200) }),
    }).catch((err) => ({ ok: false, statusText: err.message }));
    if (!res.ok) return { skipped: false, sent, error: res.statusText || `HTTP ${res.status}` };
    sent += Math.min(200, events.length - i);
  }
  return { skipped: false, sent };
}

export async function pushClickHouse(table, rows) {
  const { CLICKHOUSE_URL, CLICKHOUSE_USER = "default", CLICKHOUSE_PASSWORD = "" } = process.env;
  if (!CLICKHOUSE_URL || !rows.length) return { skipped: true };
  const q = encodeURIComponent(`INSERT INTO ${table} FORMAT JSONEachRow`);
  const auth = Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString("base64");
  const res = await fetch(`${CLICKHOUSE_URL.replace(/\/$/, "")}/?query=${q}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body: rows.map((r) => JSON.stringify(r)).join("\n"),
  }).catch((err) => ({ ok: false, statusText: err.message }));
  return res.ok ? { skipped: false, sent: rows.length } : { skipped: false, error: res.statusText || `HTTP ${res.status}` };
}

/** Langfuse event builders — ids are deterministic from runId so re-pushes upsert. */
export function lfTrace(id, name, metadata, tags) {
  return { id: `${id}-t`, timestamp: new Date().toISOString(), type: "trace-create", body: { id, name, metadata, tags } };
}
export function lfGeneration(id, traceId, r) {
  return {
    id: `${id}-g`,
    timestamp: new Date().toISOString(),
    type: "generation-create",
    body: {
      id,
      traceId,
      name: r.taskId,
      model: r.model,
      input: r.prompt,
      output: r.output,
      startTime: r.startedAt,
      endTime: r.endedAt,
      usage: { input: r.usage?.input ?? undefined, output: r.usage?.output ?? undefined, unit: "TOKENS" },
      metadata: { brand: r.brand, tier: r.tier, workflow: r.workflow, sample: r.sample, costUsd: r.usage?.costUsd, servedBy: r.servedBy },
    },
  };
}
export function lfScore(id, traceId, name, value, comment) {
  return { id: `${id}-s`, timestamp: new Date().toISOString(), type: "score-create", body: { id, traceId, name, value, comment } };
}
