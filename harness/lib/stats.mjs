/**
 * Built on SIP — brand-lab statistics. Small, dependency-free, deterministic.
 *
 * Every interval here is reported, never hidden: a verdict that ignores its
 * interval is a vibe, not a finding. The PRNG is seeded from the pre-registration
 * hash so a rerun over the same raw rows reproduces the same bootstrap bounds.
 */

/** Mulberry32 — seeded PRNG. Seed is a 32-bit int. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First 8 hex chars of a hash -> 32-bit seed. */
export function seedFromHash(hex) {
  return parseInt(String(hex).slice(0, 8), 16) >>> 0;
}

/** Fisher-Yates with a supplied PRNG. Returns a new array. */
export function shuffle(arr, next) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Wilson score interval for a binomial proportion (95% by default).
 * Ties in pairwise judging count as half a win — the caller passes
 * wins + 0.5*ties as `successes`.
 */
export function wilson(successes, n, z = 1.959964) {
  if (n <= 0) return { p: null, lo: null, hi: null, n: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half), n };
}

export function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Paired bootstrap on per-item differences (candidate - comparator).
 * Items are resampled, not individual calls, so repeated samples of the
 * same task do not masquerade as independent evidence.
 */
export function pairedBootstrap(diffs, { iters = 5000, seed = 1, alpha = 0.05 } = {}) {
  if (!diffs.length) return { mean: null, lo: null, hi: null, n: 0 };
  const next = rng(seed);
  const n = diffs.length;
  const means = new Float64Array(iters);
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += diffs[Math.floor(next() * n)];
    means[i] = s / n;
  }
  means.sort();
  const lo = means[Math.floor((alpha / 2) * iters)];
  const hi = means[Math.min(iters - 1, Math.floor((1 - alpha / 2) * iters))];
  return { mean: mean(diffs), lo, hi, n };
}

/** Cohen's kappa for two raters over the same items (categorical labels). */
export function cohensKappa(a, b) {
  if (a.length !== b.length || !a.length) return null;
  const labels = [...new Set([...a, ...b])];
  const n = a.length;
  let agree = 0;
  for (let i = 0; i < n; i++) if (a[i] === b[i]) agree++;
  const po = agree / n;
  let pe = 0;
  for (const l of labels) {
    pe += (a.filter((x) => x === l).length / n) * (b.filter((x) => x === l).length / n);
  }
  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

/**
 * Pre-registered decision rule. Inputs are the pairwise win interval and the
 * candidate/comparator cost ratio. The rule is fixed in brand-lab/README.md
 * and hashed into the pre-registration; it is not tuned after results land.
 */
export function verdict({ winLo, winHi, costRatio, costCeiling, minN, n }) {
  if (n == null || n < minN) return "UNDERPOWERED";
  if (winLo > 0.5) return costRatio <= costCeiling ? "ADOPT" : "ADOPT-IF-BUDGET";
  if (winHi < 0.5) return "REGRESS";
  // Interval straddles parity: prefer the cheaper side, never claim a win.
  return costRatio < 1 ? "PARITY-CHEAPER" : "PARITY";
}
