# Starlight Evals

**Whole-system evaluation for AI agent systems — published with the weaknesses named, dated, and falsifiable.**

Most AI projects publish a model benchmark. Almost none publish an eval of *their own system* — its memory recall, its harness integrity, its dataset provenance — and fewer still publish the parts that are weak. This does. Every green number ships with the weakness it hides. The candor is the point.

This repo mirrors the public scorecards from the [Starlight Intelligence System](https://github.com/frankxai/Starlight-Intelligence-System) Proving Ground, so they can be read, cited, and forked without the full substrate.

**Last run: 2026-06-10 · Next run due: 2026-07-10 · Status: 🟢 current**
*If the next-run date is in the past, this surface is STALE and the numbers below are no longer trustworthy. Staleness is shown, never hidden.*

> [!NOTE]
> This repo is a **mirror, not the origin.** The source of truth lives in the [Starlight Intelligence System](https://github.com/frankxai/Starlight-Intelligence-System) repo under `tools/proving-ground/` and `tools/arena/`. Open methodology issues there.

---

## Why a whole-system eval

A model arena ranks models. It cannot tell you whether the system the models run inside is any good. The Proving Ground evaluates that system — across every layer that can be measured — and renders a per-lane verdict plus one system-level synthesis through the Starlight Board's `PROCEED / REVISE / STOP` vocabulary.

It does not invent new measurement. It composes the eval layers that already exist (`SPEC.md` documents the entrypoint for each) into one scorecard, run by evaluator agents held to three rules:

- **Precision** — every number traces to a receipt. State `n` and the caveats. No rounded-up wins.
- **Wisdom** — name the weakness the passing tests don't cover.
- **Transcendence** — propose the experiment that would falsify the system's current self-image.

## The seven lanes

| # | Lane | Measures |
|---|---|---|
| 1 | **Model** | capability + instruction compliance + behavioral safety of models in-harness |
| 2 | **Memory** | recall@k, precision@10, latency |
| 3 | **Retrieval** | BM25/FTS5 ranking quality |
| 4 | **Harness** | trust-contract + privacy + provenance integrity |
| 5 | **Substrate** | symmetry invariants (docs↔code, registry coverage) |
| 6 | **Datasets** | provenance + labeling honesty (no synthetic benchmarks) |
| 7 | **System** | the unifying scorecard + Overseer synthesis across lanes 1–6 |

Lane registry and entrypoints: [`lanes.json`](./lanes.json). Full contract: [`SPEC.md`](./SPEC.md).

## Latest scorecard — 2026-06-10 (v0.1)

System verdict: **PROCEED-WITH-REVISE**

| Lane | Verdict | Headline | Named weakness |
|---|---|---|---|
| Model | PROCEED | parity at R1; Fable 4/4 on the 4-way constraint round | no hard-reasoning lane; no cross-family judge; no agentic task |
| Memory | **REVISE** | **precision@10 = 0.20** | the single weakest number; no cross-session recall |
| Retrieval | PROCEED | recall@5 = 100% (n=10) | ceiling unearned on 10 queries; no semantic path |
| Harness | PROCEED | 34 pass / 0 fail / 7 todo | 7 unmeasured risk dimensions |
| Substrate | PROCEED | green after catching a real orphan | symmetry suite is load-bearing |
| Datasets | PROCEED | 0 synthetic benchmarks | token-overlap ground truth is soft |

On its first run, the substrate lane caught the release's own new agent (`agents/starlight-evaluator.md`) sitting unregistered and flagged it — the symmetry test failed 14/15 until the registry entry was added. A Proving Ground that can't catch its own builder is theater.

Full receipts: [`scorecards/`](./scorecards) (system + memory-lane runs) and [`rounds/`](./rounds) (model-arena rounds).

## Do not optimize to this score

These numbers describe the system. They are **not targets.** The moment a metric becomes something to design *toward*, it stops measuring and we retire it. Read the scorecard to understand the system's real shape — then build your own system and measure it the same way. That is the whole point: help people build their own, not consume someone else's leaderboard.

## Structure

```
SPEC.md         the specification — lanes, scorecard contract, cadence, evaluator
lanes.json      lane registry: what each lane composes
scorecards/     system-eval receipts (one per run)
rounds/         model-lane arena round receipts
```

## Run it on your own system

The Proving Ground is a usage pattern plus a scorecard contract, not a black box. Read `SPEC.md`, point the lanes at your own infrastructure, and run the evaluator under the same three rules. The harness is [Claude Code](https://claude.com/claude-code) Agent-tool model overrides — no extra infrastructure to stand up.

---

Built on SIP — Starlight Intelligence Protocol. Code: MIT ([`LICENSE`](./LICENSE)). Methodology: open.
