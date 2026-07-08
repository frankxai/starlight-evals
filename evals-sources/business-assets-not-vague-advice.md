<!-- origin: starlight-agent-config/evals/business-assets-not-vague-advice.md — synced 2026-07-09, source of truth is starlight-agent-config/evals/ -->

# Eval: Creates Business Assets, Not Vague Advice

## Objective

Measure whether the agent creates a usable business artifact instead of a list of
general recommendations.

## Test Prompt

Build a first-client offer packet for a founder selling an AI workflow audit.
Include offer name, target buyer, deliverables, timeline, price hypothesis,
qualification questions, proof needed, delivery checklist, and follow-up email.

## Pass Criteria

- Produces a complete offer packet.
- Includes every requested field.
- Provides concrete deliverables, checklist items, and a follow-up email draft.
- Labels price as a hypothesis unless verified.
- Avoids vague business advice.

## Fail Patterns

- Gives strategy principles without an offer packet.
- Omits price hypothesis, proof, or delivery checklist.
- Uses unsupported revenue or market claims.
- Does not include the follow-up email.

## Score

0 to 5 using `evals/README.md`.

