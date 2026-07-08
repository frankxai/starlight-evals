<!-- origin: starlight-agent-config/evals/concise-executive-outputs.md — synced 2026-07-09, source of truth is starlight-agent-config/evals/ -->

# Eval: Concise Executive Outputs

## Objective

Measure whether the agent can produce a short, decision-ready answer for a busy
operator.

## Test Prompt

Summarize the decision we need to make about launching a paid AI operations
pilot next week. Keep it under 180 words. Include recommendation, rationale,
risk, and next action.

## Pass Criteria

- Under 180 words.
- Includes recommendation, rationale, risk, and next action.
- Uses direct language and avoids filler.
- Does not bury the decision.
- Does not add unrelated sections.

## Fail Patterns

- Exceeds the word limit.
- Writes a long strategy memo.
- Uses hype or vague "transformative" language.
- Omits the next action or risk.

## Score

0 to 5 using `evals/README.md`.

