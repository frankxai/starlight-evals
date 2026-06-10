# Contributing to Starlight Evals

> This repo is a **published mirror** of the eval discipline that lives canonically
> in the [Starlight Intelligence System](https://github.com/frankxai/Starlight-Intelligence-System).
> The point isn't to consume our scorecards — it's to **run the discipline on your
> own system and publish your own.** That's the mission: help people build their own
> systems, not consume someone else's leaderboard.

## Fork & run in ~10 minutes

You don't need our infrastructure. The harness is a *usage pattern* on
[Claude Code](https://claude.com/claude-code) + plain files — no servers, no DB.

1. **Read `SPEC.md`** — the seven lanes and the scorecard contract.
2. **Pick one lane to start** — the **model lane** is the easiest entry: it's just
   dispatching the same task to two models and checking who got it right.
   - In a Claude Code session, spawn two subagents on the same prompt with different
     `model:` overrides, give them a *self-verifying* task (asserts, or a known
     answer), and record who passed. That's a round.
3. **Write a scorecard** following the JSON shape in `scorecards/` — every metric
   names its `sourceLane`, carries `caveats`, and (the important part) a **named
   weakness**. A green number without a named weakness is incomplete.
4. **Keep it honest** — the three rules that make this trustworthy:
   - *Mechanically verified beats judged.* Prefer asserts/ground-truth over a model
     judge. When you must judge, use a blind, non-contestant, ideally cross-family judge.
   - *Anti-Goodhart.* The scorecard describes your system; it is not a target.
   - *Staleness is visible.* Stamp `ranAt` / `nextRunDue`; show STALE when overdue.

## What we welcome

- **New lanes** — measure a dimension we don't (latency, cost-per-task, multi-turn
  agentic, long-context fidelity). Add it to `lanes.json` with an entrypoint.
- **Cross-family adapters** — run the model lane against GPT / Gemini / OSS models
  (via OpenRouter or direct) and contribute the round receipt.
- **Better ground-truth** — our memory lane is honest that its judge is lexical;
  semantic/labeled relevance sets are gold.
- **Your own scorecards** — open a PR adding a `scorecards/community/<you>-<date>.json`
  from running the discipline on your stack. We'd love a registry of these.

## What we won't merge

- Scorecards without receipts, caveats, or a named weakness.
- Results from a judge grading its own family with no note (state the bias).
- "Our model wins" framing without a `does-NOT-measure` honesty section.

## How to propose

Open an issue (methodology questions, new-lane proposals) or a PR (adapters,
scorecards, fixes). Substantive methodology changes get pressure-tested against the
same Board discipline the canonical repo uses — expect a "what would falsify this?"
question. That's a feature.

Canonical methodology + issues: the
[Starlight Intelligence System](https://github.com/frankxai/Starlight-Intelligence-System)
repo. This mirror tracks published results; methodology debates happen upstream.

Built on SIP — Starlight Intelligence Protocol. Code MIT, methodology open.
