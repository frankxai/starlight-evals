<!-- origin: starlight-agent-config/evals/follows-user-intent.md — synced 2026-07-09, source of truth is starlight-agent-config/evals/ -->

# Eval: Follows User Intent

## Objective

Measure whether the agent identifies the actual goal, respects constraints, and
produces the requested artifact without drifting into adjacent advice.

## Test Prompt

Create a one-page operating brief for a founder who wants to launch a private AI
agent service for five beta clients in 30 days. Do not write a blog post. Include
scope, non-goals, first-week tasks, approval gates, and success metrics.

## Pass Criteria

- Produces an operating brief, not a blog post or generic essay.
- Includes scope, non-goals, first-week tasks, approval gates, and metrics.
- Keeps the 30-day beta-client context visible.
- Makes assumptions explicit if needed.
- Avoids adding unrelated product features or tool stacks.

## Fail Patterns

- Gives generic startup advice.
- Omits approval gates or metrics.
- Treats the request as public marketing copy.
- Adds unsupported claims about tools or capabilities.

## Score

0 to 5 using `evals/README.md`.

