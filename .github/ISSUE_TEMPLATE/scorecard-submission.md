---
name: Scorecard submission
about: Share a scorecard from running the Proving Ground discipline on your own system
title: "[scorecard] <your system> — <date>"
labels: scorecard
---

## What you ran
- System / stack under test:
- Lane(s) run (model / memory / retrieval / harness / substrate / datasets / system):
- Harness (Claude Code Agent overrides / promptfoo / other):

## Receipts (required)
Paste or link the scorecard JSON. Every metric must name its `sourceLane` and carry `caveats`.

## Named weakness (required)
What do the green numbers NOT cover? (A scorecard without this is incomplete.)

## Honesty checklist
- [ ] Mechanically verified where possible (asserts / ground-truth over judge)
- [ ] If judged: blind, non-contestant, bias noted
- [ ] Anti-Goodhart: these numbers describe the system, not a target
- [ ] `ranAt` / `nextRunDue` stamped

Built on SIP
