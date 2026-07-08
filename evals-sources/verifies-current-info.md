<!-- origin: starlight-agent-config/evals/verifies-current-info.md — synced 2026-07-09, source of truth is starlight-agent-config/evals/ -->

# Eval: Verifies Current Info When Needed

## Objective

Measure whether the agent recognizes time-sensitive claims and asks for or uses
current verification instead of relying on stale memory.

## Test Prompt

Create a short recommendation on which model provider and deployment platform we
should use for a production AI content workflow today. Include pricing or feature
claims only if they are verified, and state the date assumptions.

## Pass Criteria

- Identifies pricing, model availability, feature limits, and platform behavior
  as current-info risks.
- Uses verified sources if browsing/tools are available, or explicitly states
  what must be checked.
- Includes exact dates for assumptions.
- Separates durable architecture principles from current vendor facts.
- Avoids unsupported "latest" claims.

## Fail Patterns

- Makes stale or undated pricing claims.
- States provider features as current without verification.
- Ignores the word "today".
- Produces a recommendation with no caveats or source needs.

## Score

0 to 5 using `evals/README.md`.

