/**
 * Built on SIP — brand-lab mechanical scorers.
 *
 * Mechanical checks run BEFORE any judge and cannot be overridden by one: a
 * judge's taste may not launder a constraint violation (tools/arena/README.md).
 * Each scorer returns { pass: boolean, detail: string }.
 */

// Shared slop list — mirrors the language-refusal lists in the brand CLAUDE.md
// contracts. Brand specs may extend it; they may not shrink it.
export const BASE_BANNED = [
  "delve",
  "dive into",
  "it's worth noting",
  "unlock",
  "supercharge",
  "seamless",
  "elevate your",
  "harness the power",
  "in today's fast-paced world",
  "game-changer",
  "revolutionary",
];

function words(text) {
  return String(text).trim().split(/\s+/).filter(Boolean);
}

function extractJson(text) {
  const s = String(text);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : s;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(body.slice(start).trim());
  } catch {
    return null;
  }
}

export const SCORERS = {
  /** All regexes must match (case-insensitive). */
  regexAll(output, { patterns }) {
    const miss = patterns.filter((p) => !new RegExp(p, "imu").test(output));
    return { pass: miss.length === 0, detail: miss.length ? `missing: ${miss.join(" | ")}` : "all matched" };
  },
  /** No regex may match. */
  regexNone(output, { patterns }) {
    const hit = patterns.filter((p) => new RegExp(p, "imu").test(output));
    return { pass: hit.length === 0, detail: hit.length ? `forbidden: ${hit.join(" | ")}` : "clean" };
  },
  wordRange(output, { min = 0, max = Infinity }) {
    const n = words(output).length;
    return { pass: n >= min && n <= max, detail: `${n} words (want ${min}-${max})` };
  },
  /** Output parses as JSON and carries every required top-level key. */
  jsonKeys(output, { keys, arrayMin }) {
    const j = extractJson(output);
    if (j == null) return { pass: false, detail: "not parseable JSON" };
    const obj = Array.isArray(j) ? j[0] ?? {} : j;
    const missing = keys.filter((k) => !(k in obj));
    if (arrayMin != null && (!Array.isArray(j) || j.length < arrayMin)) {
      return { pass: false, detail: `expected array of >=${arrayMin}` };
    }
    return { pass: missing.length === 0, detail: missing.length ? `missing keys: ${missing.join(",")}` : "schema ok" };
  },
  /** Brand slop list + spec additions. */
  bannedPhrases(output, { extra = [] } = {}) {
    const list = [...BASE_BANNED, ...extra];
    const lower = String(output).toLowerCase();
    const hit = list.filter((p) => lower.includes(p.toLowerCase()));
    return { pass: hit.length === 0, detail: hit.length ? `slop: ${hit.join(", ")}` : "no slop" };
  },
  /** Exact final-line answer, for tasks with ground truth. */
  answerLine(output, { accept }) {
    const m = String(output).match(/ANSWER:\s*(.+)\s*$/im);
    if (!m) return { pass: false, detail: "no ANSWER: line" };
    const ok = accept.some((p) => new RegExp(p, "imu").test(m[1].trim()));
    return { pass: ok, detail: `answer="${m[1].trim()}"` };
  },
  /** Count of lines matching a pattern (e.g. numbered hooks, bullet items). */
  lineCount(output, { pattern, min = 0, max = Infinity }) {
    const n = String(output).split("\n").filter((l) => new RegExp(pattern, "u").test(l)).length;
    return { pass: n >= min && n <= max, detail: `${n} matching lines (want ${min}-${max})` };
  },
  /**
   * Image legibility: a vision model transcribes the rendered text, and the
   * transcription is compared mechanically. The judge reads; the regex scores.
   * Requires the runner to have attached `transcription` to the output record.
   */
  transcriptionMatch(_output, { required }, record = {}) {
    const t = String(record.transcription || "").toLowerCase();
    if (!t) return { pass: false, detail: "no transcription" };
    const miss = required.filter((w) => !t.includes(w.toLowerCase()));
    return { pass: miss.length === 0, detail: miss.length ? `illegible/missing: ${miss.join(", ")}` : "legible" };
  },
  /** Image output present with expected aspect (from PNG/JPEG header). */
  imageAspect(_output, { ratio, tolerance = 0.05 }, record = {}) {
    const d = record.imageDims;
    if (!d) return { pass: false, detail: "no image returned" };
    const [w, h] = ratio.split(":").map(Number);
    const want = w / h;
    const got = d.width / d.height;
    return { pass: Math.abs(got - want) / want <= tolerance, detail: `${d.width}x${d.height}` };
  },
};

export function runMechanical(checks = [], output, record) {
  return checks.map((c) => {
    const fn = SCORERS[c.type];
    if (!fn) return { type: c.type, pass: false, detail: `unknown scorer ${c.type}` };
    return { type: c.type, ...fn(output, c, record) };
  });
}

/** PNG/JPEG dimension sniff from a base64 payload (no image deps). */
export function imageDims(b64) {
  const buf = Buffer.from(b64, "base64");
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: "png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), format: "jpeg" };
      }
      i += 2 + len;
    }
  }
  return null;
}
