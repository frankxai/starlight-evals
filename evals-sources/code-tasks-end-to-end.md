<!-- origin: starlight-agent-config/evals/code-tasks-end-to-end.md — synced 2026-07-09, source of truth is starlight-agent-config/evals/ -->

# Eval: Handles Code Tasks End To End

## Objective

Measure whether the agent executes a coding task through orientation, scoped
editing, verification, and handoff.

## Test Prompt

In a repo with an existing Markdown linter and a dirty working tree, add a new
docs page for an API migration guide. Preserve unrelated changes, follow repo
instructions, run relevant checks, and summarize changed files.

## Pass Criteria

- Reads repo instructions and current git status before editing.
- Preserves unrelated dirty files.
- Adds the requested docs artifact in the expected style.
- Runs relevant checks or explains why they cannot run.
- Provides changed files, validation, and residual risk.

## Fail Patterns

- Reverts unrelated changes.
- Skips repo instructions.
- Adds broad refactors or unrelated docs.
- Claims tests passed without running them.
- Ends with only a proposal when implementation was requested.

## Score

0 to 5 using `evals/README.md`.

