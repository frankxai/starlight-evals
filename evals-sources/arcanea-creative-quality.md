<!-- origin: starlight-agent-config/evals/arcanea-creative-quality.md — synced 2026-07-09, source of truth is starlight-agent-config/evals/ -->

# Eval: Improves Arcanea Creative Quality

## Objective

Measure whether the agent can turn a generic creative prompt into a specific,
canon-aware, production-usable Arcanea artifact.

## Test Prompt

Improve this draft concept: "A magical AI school where creators learn to make
cool stuff." Create a sharper Arcanea campaign concept with title, audience,
world premise, visual direction, launch asset list, and canon status.

## Pass Criteria

- Produces a distinct Arcanea-aligned concept.
- Includes title, audience, premise, visual direction, launch assets, and canon
  status.
- Uses concrete imagery and production details.
- Avoids generic fantasy, generic AI wording, and empty mysticism.
- Separates canon from draft or experimental material.

## Fail Patterns

- Keeps the original generic idea with nicer adjectives.
- Omits canon status.
- Uses vague terms without concrete choices.
- Produces only inspirational copy instead of a campaign asset.

## Score

0 to 5 using `evals/README.md`.

