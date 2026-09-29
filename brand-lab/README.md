# Brand Lab — which model runs which brand, and how we know

> Built on SIP. Lane 9 of the Proving Ground (`lanes.json :: brand-lab`).
> Status: **v0.1 — harness + 10 seed cards, UNRUN.** No number below is a measurement.

A new model ships. We need to know whether it should replace what each brand uses today: tested on work that brand's ideal reader actually does, against the models it would replace, with cost in the same row as quality. Public benchmarks answer a different question — how a model does on someone else's distribution. Brand Lab answers ours, and publishes the receipt.

```
new model → preflight → pre-register → generate → mechanical → blind pairwise → bootstrap → verdict → receipt
                                                                                               │
                         routing-table.json ◄── ≥2 concordant rounds ◄─────────────────────────┤
                         /research/model-arena round page ◄─ claimsAllowed only ◄──────────────┤
                         brand posts, newsletter, social ◄── named weaknesses + one chart ◄────┘
```

## What is in the box

| Path | What it is |
|---|---|
| `brands/*.json` | One card per brand: avatar, jobs, workflows, tasks by tier, comparators, budget, decision parameters, publish surface |
| `models.json` | Registry: OpenRouter slug, family, modality, transport. Families drive judge exclusion |
| `../harness/brand-lab.mjs` | Runner. `--brand <id\|all> --candidate <id> [--comparator <id>]… [--tier T1..T4] [--samples 3] [--budget-usd N] [--dry-run]` |
| `../harness/lib/` | `stats` (Wilson, paired bootstrap, kappa, decision rule) · `scorers` (mechanical checks) · `transport` (OpenRouter, CLI harnesses) · `sinks` (Langfuse, ClickHouse) |
| `../scripts/validate-brand-lab.mjs` | Structural invariants on every card. Runs in `npm test` and CI |
| `../infra/clickhouse/schema.sql` | Tables + views for the longitudinal record |
| `../.github/workflows/brand-lab.yml` | Static checks on every PR; live runs on dispatch or monthly schedule, key-gated |

Seed estate: 10 cards, 47 tasks across text, image and agent modalities.

| Brand | Avatar (short) | Tasks | Modalities | Safety gates |
|---|---|---|---|---|
| frankx | founder-operator who wants systems | 6 | text, image | — |
| starlight | agent engineer composing memory + routing | 4 | text | — |
| arcanea | worldbuilder co-creating inside canon | 5 | text, image | — |
| ai-architect | enterprise architect shipping LLMs to production | 5 | text, agent | — |
| ai-music | independent producer releasing AI-assisted tracks | 5 | text, image | — |
| gencreator | expert creator turning one source into a week of content | 3 | text | — |
| agenticincome | operator of agent-run income streams | 5 | text, agent | injection, disclosure |
| agenticpassiveincome | creator packaging knowledge into digital products | 4 | text | — |
| animelegends | fan-creator keeping an original character on-model | 6 | image, text | — |
| realityarchitect | reflective high performer who wants grounded practice | 4 | text | lens labels, crisis boundary |

`realityarchitect` stands in for the reality-diffusion concept until that has its own avatar. AnimeLegends and Reality Architect have no live site in this repo's knowledge; their cards carry `site: null` rather than a guessed URL.

## Tiers of complexity

Tier is a property of the task, not the model. The same four tiers apply to every brand so results compose across the estate.

| Tier | Shape | Scored by | Why it exists |
|---|---|---|---|
| **T1 atomic** | one turn, hard constraints, often a ground-truth answer | mechanical only | catches the failures that break pipelines: wrong format, wrong fact, forbidden term |
| **T2 composed** | several constraints plus source grounding or brand voice | mechanical gate, then blind pairwise | where most real brand work lives |
| **T3 expert judgment** | trade-offs, audits, decisions under constraints | mechanical gate, then blind pairwise | where frontier models separate — or don't |
| **T4 agentic** | multi-step work in a sandbox with a verify script | `verify` exit code; tamper check on the verifier | harness + model together; run via CLI transport (OpenCode, Hermes, Claude Code) |

The R5 lesson (`rounds/2026-08-28-r5-deep-reasoning.json`): all four Claude tiers scored 6/6 on a mechanical reasoning card, which is a void result — the card was too easy to separate them. Brand Lab responds two ways. Pairwise judging on T2/T3 measures *better*, not just *passes*. And when a tier saturates for every contestant, the rule is to add harder tasks to that tier, not to report parity as a finding.

## Comparators

Every card names three default comparators plus two named slots:

- **other frontier** — the model a reader would otherwise choose (default list per card)
- **previousGeneration** — "is the upgrade worth it for this brand?"
- **openWeight** — "can this workload run on an open model at a fraction of the cost?"

Override per run with `--comparator`. The **estate verdict** (`--brand all`) requires explicit comparators so every card is scored against the same field.

## The decision rule (pre-registered, fixed in code)

`harness/lib/stats.mjs :: verdict`, hashed into every `prereg.json`:

1. Per task, the candidate's score is the mean over samples × judges of win = 1, tie = 0.5, loss = 0.
2. Win rate is 0.5 + the mean of (score − 0.5) across **tasks**; the 95% interval is a paired bootstrap over tasks (5,000 resamples, seed = prereg hash). Tasks are the unit of evidence; repeated calls are not independent evidence.
3. Cost ratio = candidate API-reported spend ÷ comparator spend on the same tasks.

| Condition | Verdict |
|---|---|
| any safety-gate task failed by the candidate in any sample | **BLOCKED-SAFETY** — overrides everything |
| fewer tasks than `decision.minItems` | **UNDERPOWERED** — no win or loss may be claimed |
| lower bound > 0.5 and cost ratio ≤ `costCeiling` | **ADOPT** |
| lower bound > 0.5, cost ratio above ceiling | **ADOPT-IF-BUDGET** |
| upper bound < 0.5 | **REGRESS** |
| interval straddles 0.5, candidate cheaper | **PARITY-CHEAPER** — route down if safety allows |
| interval straddles 0.5 | **PARITY** |

A verdict changes `routing-table.json` only after **two concordant rounds** (the existing A2 floor in `ROUTING-DOCTRINE.md`). One round informs; two route.

**Power, stated plainly.** With task-level scores spread around ±0.3, a 10-point win-rate difference needs roughly 30–40 tasks to show up with a 95% interval. The seed cards hold 3–6 tasks each, so single-brand runs will read UNDERPOWERED — correctly. The pooled estate run (47 tasks, fewer after modality filtering) is the first unit that can support a published claim. Each card should grow toward 30 tasks, mined from real work (see "Where new tasks come from").

## Validity controls

| Threat | Control in this harness |
|---|---|
| Post-hoc tuning (moving the goalposts after seeing results) | `prereg.json` is written and hashed before the first call; the hash seeds every random choice; the receipt carries it |
| Judge self-preference | judges are drawn only from families not present in the pair; four judge families registered so any pair leaves two |
| Position bias | each judge sees both A/B orders; disagreement between orders becomes a tie and is counted (`positionFlipRate`) |
| Judge noise | two judges per comparison; Cohen's kappa reported when there are ≥5 judged comparisons |
| Taste laundering a constraint violation | mechanical checks run first; a side that fails them forfeits the pair without a judge call |
| Serving variance (a different host or quantization) | provider pinned with `allow_fallbacks: false`; `servedBy` and `servedModel` recorded per call |
| Stale or wrong model slugs | preflight resolves every slug against OpenRouter's live catalog and aborts before spending on any unknown one |
| Invented numbers | no key → UNRUN receipt with zero rows; cost comes only from the API's `usage.cost`; unmeasured cost is `null`, never 0 |
| Wrong answer keys | `test/brand-lab.test.mjs` checks every ground-truth answer against its own accept pattern and recomputes the arithmetic |
| Non-independence | bootstrap over tasks, not calls |
| Cherry-picking pairs | every pair run appears in the receipt; `claimsAllowed` is generated from verdicts, and anything else is in `claimsForbidden` |
| Contamination over time | **not yet controlled**: v0.1 cards are all public. Next: hold 30% of each card privately (Starlight-Intelligence-System private tree) and report public vs held-out gap every round |
| Judge validity | **not yet controlled**: next, label 50 pairwise comparisons per brand by hand in a Langfuse annotation queue and publish judge-vs-human agreement next to every judged verdict |

## Where new tasks come from

Tasks should come from work that already happened, not be invented for a benchmark. The loop:

1. Production calls on each site (AI SDK through the Vercel AI Gateway on frankx.ai, GenCreator Companion, Arcanea) trace to Langfuse.
2. Weekly, pull the calls where a human edited or rejected the output. Each one is a candidate task: the prompt is the input, the edit shows the pass criterion.
3. Write the mechanical check first. If no mechanical check can be written, the task needs a rubric and goes to T2/T3.
4. Add it to the brand card through a PR. The validator enforces the invariants.

## Budget

Tokens are cheap relative to attention. The binding constraint on this programme is the number of tasks and human-labelled comparisons, not API spend.

**Per-run estimate** (assumptions, not measurements: 600 input / 700 output tokens per generation, 1,800 / 80 per judge call, blended frontier list price ≈ $2.50 / $12 per million; preflight records real prices on every live run):

| Unit | Calls | Estimated cost |
|---|---|---|
| One brand, text, 3 comparators, 3 samples, 2 judge orders | ~60 generations + ≤108 judge calls | ~$1–2 |
| Estate text run (all 10 cards) | ~450 generations + ≤800 judge calls | ~$10–20 |
| Image run (8 image tasks on 4 cards, 2 image comparators) | ~70 images + transcriptions + vision judging | ~$5–15 at typical per-image prices |
| Agent-harness run (T4) | 3 samples × harness | subscription or harness cost; recorded as `null` unless reported |

**Monthly envelope:** each card declares `budget.monthlyUsd` (sum across the estate: $495) as a hard ceiling. At two or three new models a month, expected spend is roughly $50–100. The per-run cap (`perRunCapUsd`, or `--budget-usd`) halts a run and emits a PARTIAL receipt; unfinished comparisons are excluded, never imputed.

**Allocation rule:** about 70% on eval generations (more tasks and samples), 20% on judging and replication, 10% on drafting the published write-ups. Writing the post is the cheapest step; making the claim true is the expensive one.

## Publishing: one run, many surfaces

Publish from the receipt, never from memory. Every public sentence about a model result comes from `claimsAllowed`, links the receipt, and carries the date and n.

| When | What | Where |
|---|---|---|
| Release day | Price and context only, from OpenRouter; no quality claims | `frankx.ai/llm-hub/<model>` (live pricing already wired in `lib/llm-hub/openrouter.ts`) |
| +48h | Estate run → round page: verdict per comparator, intervals, cost ratio, named weaknesses, prereg hash | `frankx.ai/research/model-arena` + receipt on GitHub |
| +72h | Brand posts only where the brand verdict is powered, or where a named weakness teaches something ("what changed for Suno prompting", "canon drift at the Starweave Gate") | each brand's surface, linking back to the round page |
| +7d | Newsletter section + social: one chart, one surprise, one link. No selling | FrankX newsletter, GenCreator, social |
| +30d | Re-run the same prereg card to check for drift in served models | ClickHouse `lab.model_month`, short update on the round page |

**Why this brings the right readers without selling.** Each brand post is framed on that avatar's job ("which model writes a disclosure-safe affiliate blurb"), so the people who find it are the people the brand serves. Receipts, stable URLs, and machine-readable JSON make the results citable by answer engines — add `schema.org/Dataset` markup to round pages and list them in `llms.txt`. The replication kit (`CONTRIBUTING.md`) invites other builders to run a card and send a scorecard, which earns links. The teaser is the method; the product never needs a pitch on these pages.

**Compared with single-vendor model reviews** such as the CodeRabbit piece referenced in the brief (not fetched during this build, so no claims are made about its contents here): a code-review company can review a model on one workflow using a private corpus. Brand Lab covers ten reader workflows, publishes its pre-registration and raw receipts, prices every row, invites replication, and re-runs over time. That openness is the edge; keep it.

## Stack wiring

| Layer | Use | Why |
|---|---|---|
| **OpenRouter** | eval transport | one key for every family, per-call cost in the response, provider pinning, public catalog for preflight |
| **Vercel AI SDK + AI Gateway** | production features on the sites (already in `frankx.ai/lib/ai/gateway-client.ts`) | streaming, `generateObject` with Zod, fallbacks, spend observability. A *production-path* eval that calls the same Gateway route the site uses is the next transport to add, so we measure what readers actually get |
| **Langfuse** | traces, generations and scores from every run (`LANGFUSE_*`); later, datasets for cards and annotation queues for judge calibration | human-in-the-loop labels are what make a judged verdict defensible |
| **ClickHouse** | the longitudinal record (`infra/clickhouse/schema.sql`): pass rate, cost per passing output, verdict history per brand × model × month | one query answers "did the new generation get better at our work". Self-hosted Langfuse v3 already runs on ClickHouse, so one cluster can serve both |
| **promptfoo** | stays on the agent-constitution rubric lane (`promptfooconfig.yaml`) | no need to move it |
| **OpenCode / Hermes Agent / Claude Code** | T4 contestants via the CLI transport | answers "same model, different harness" and "same harness, different model" as separate experiments |
| **GitHub Actions** | `brand-lab.yml`: static checks on every PR; key-gated live runs; receipts uploaded as artifacts, never committed | promotion into `scorecards/brand-lab/` stays a reviewed PR |

Secrets to configure on this repo for live runs: `OPENROUTER_API_KEY` (required), `LANGFUSE_HOST` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` and `CLICKHOUSE_URL` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` (optional). Repository variables `BRAND_LAB_CANDIDATE` and `BRAND_LAB_COMPARATORS` arm the monthly schedule.

## Runbook: a new model drops

```bash
# 1. Register it (slug from openrouter.ai/models), family, modality.
$EDITOR brand-lab/models.json

# 2. See the plan and what it will cost to call — nothing is spent.
node harness/brand-lab.mjs --brand all --candidate <new-id> \
  --comparator <incumbent> --comparator <previous-gen> --comparator <open-weight> --dry-run

# 3. Run it (locally with OPENROUTER_API_KEY, or dispatch the brand-lab workflow).
node harness/brand-lab.mjs --brand all --candidate <new-id> \
  --comparator <incumbent> --comparator <previous-gen> --comparator <open-weight> --budget-usd 25

# 4. Image models: run the image cards against image comparators (text comparators cannot sit image tasks).
for b in animelegends frankx arcanea ai-music; do
  node harness/brand-lab.mjs --brand $b --candidate <new-image-id> --comparator gemini-flash-image --comparator gpt-image
done

# 5. Review out/brand-lab/<runId>/receipt.json, open a PR promoting it into scorecards/brand-lab/.
```

## Roadmap

1. First live estate run on the current frontier set; promote the receipt; publish the round page.
2. Grow each card toward 30 tasks from Langfuse edit/reject traces; start the 30% private holdout.
3. Human calibration: 50 labelled comparisons per brand; publish judge agreement.
4. Production-path transport through the AI Gateway route each site uses.
5. frankx.ai: render round pages from promoted receipts (a separate PR through that repo's web release gate), and replace any arena figures that are not backed by a receipt.
