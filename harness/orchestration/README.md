# Orchestration quality pilot

Ten fixed coding/research fixtures, 60 maximum task runs, existing subscriptions
only. No new API spend. The planner and tests make no model calls.

```sh
node harness/orchestration/pilot.mjs plan
node harness/orchestration/pilot.mjs prompt debugging-empty
node --test harness/orchestration/pilot.test.mjs
node harness/orchestration/pilot.mjs assess private-receipts.json
```

For each fixture: three single-agent baselines (Luna, Sol, Astra), two candidate
pattern runs, and one independent-provider review of all five artifacts. A review
must bind exact receipt hashes. Every child invocation and failed attempt counts
in usage accounting. Reserve the cell before launch; failures consume the budget
and quota limits stop the pilot. No hidden retries or automatic provider fallback.

The host runs one admitted task at a time, in a disposable sandbox for generated
code. Do not execute untrusted patches in this repo. Supply a frozen tool list,
input revision, instructions and scoring rubric in `protocolHash`; record actual
model, effort and runtime separately. Keep tools and fixtures matched across
comparisons. Use high effort for Sol/Astra, medium for Luna for the initial
configuration comparison; this measures configurations, not model-only effects.

Return patch artifacts and test results for coding fixtures. Architecture and
research are assessed against the explicit checks and four 0–4 rubric dimensions:
correctness, completeness, regression safety, and source accuracy. Score 0 means
absent/incorrect; 1 major defects; 2 material gaps; 3 meets the contract; 4 fully
meets the contract with evidence and no substantive gaps. Independent reviewers
inspect actual artifacts and test output, not only the maker's summary.

Receipts must be captured by a trusted host. The pure comparator validates their
structure and bindings, not their authenticity. Before comparison the host must
verify artifact and evidence bytes against their hashes. Fabricated self-reports,
demo outputs and incomplete templates are not live evidence. Private receipts
stay private; publish sanitized fixtures and reviewed results only.

Promotion is provisional and requires both fixtures in a task class, both candidate
repetitions meeting the strongest passing baseline, all mandatory checks, no
critical regression, and independent review. No passing baseline means no promotion.
Missing results remain pending. Cost/time are tie-breakers; subscription cost is
null rather than invented API pricing. This module never changes routing defaults.

The runtime reference kit lives in `frankxai/starlight-swarm`, under
`src/swarm/orchestration`. Official methodological source:
https://developers.openai.com/api/docs/guides/evaluation-best-practices
