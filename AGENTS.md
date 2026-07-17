# Repository Instructions

This repo is part of the FrankX / Starlight / Arcanea agent estate.

## Classification

- Repo: `starlight-evals`
- Class: public mirror — whole-system evaluation harness (scorecards + round receipts) for the Starlight Intelligence System
- Default health command: `npm run validate` (schema-checks published JSON receipts) and `npm run probe` (runs the income/payments red-blue adversarial lane; degrades to `PENDING` without cross-repo dependencies, exits nonzero on a real defense failure). `npm test` runs both.
- Remote: https://github.com/frankxai/starlight-evals

## What this repo is

**This repo is a mirror, not the origin.** The canonical source of truth for eval methodology is [`Starlight-Intelligence-System`](https://github.com/frankxai/Starlight-Intelligence-System) under `tools/proving-ground/` and `tools/arena/`. This repo publishes copies of scorecards and round receipts (`scorecards/`, `rounds/`) so they can be read, cited, and forked without the full substrate. Open methodology issues in SIS, not here — changes made only in this mirror will drift from the source on the next sync.

Lanes measured: Model, Memory, Retrieval, Harness, Substrate, Datasets, System, and the Income & Payments Safety red/blue lane (`harness/income-payments-safety.mjs`). Lane composition is registered in `lanes.json`; the scoring contract and cadence are in `SPEC.md`.

## Agent Rules

- Read this file before making changes.
- Preserve existing user work and unrelated dirty files.
- Keep edits scoped to the requested task.
- Prefer existing repo conventions over new abstractions.
- Run the health command before handoff when feasible.
- Do not publish secrets, private memory, credentials, or internal-only strategy.

## Class-Specific Guidance

- Never edit a published scorecard under `scorecards/` or a round receipt under `rounds/` after the fact — every number must trace to a receipt. If a number was wrong, publish a new dated run; don't rewrite history.
- Do not optimize the system to this score — these numbers describe the system, they are not targets. Don't frame doc or code changes as "improving the eval score" as a goal in itself.
- If methodology needs to change, change it in `Starlight-Intelligence-System` first and mirror the result here — don't fork the methodology in this repo.
- Community scorecard submissions arrive via `.github/ISSUE_TEMPLATE/scorecard-submission.md` per `CONTRIBUTING.md` — keep that path working.

## Handoff

Summarize changed files, validation run, risks, and any follow-up needed.

## Design Taste Kernel

For any site, app, landing page, dashboard, visual identity, brand, motion, media, social, or frontend task, apply the shared Design Taste Kernel before handoff:

- C:\Users\frank\starlight\repos\DESIGN_TASTE.md
- C:\Users\frank\starlight\repos\WEB_EXPERIENCE_STANDARD.md
- C:\Users\frank\starlight\repos\MOTION_TASTE_RUBRIC.md
- C:\Users\frank\starlight\repos\MULTI_AGENT_DESIGN_COUNCIL.md
- C:\Users\frank\starlight\repos\VISUAL_QA_GATE.md

When motion, scroll, generated media, GIF/video, or premium polish matters, route through the Motion Design Studio plugin/skills and verify the result visually.
