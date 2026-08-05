<!-- Built on SIP — Starlight Evals scorecard.
     Wave 2: rewires the promptfoo rubric harness to run through the local
     `claude` CLI (providers/claude-cli.mjs) instead of ANTHROPIC_API_KEY.
     Machine receipt: rounds/2026-07-09-cli-bootstrap.json. -->

# Promptfoo CLI-Provider Bootstrap — Scorecard 2026-07-09

> Live run of the 7 agent-constitution rubric evals (`promptfooconfig.yaml`) through the new
> `providers/claude-cli.mjs` custom provider, which shells out to the local `claude` CLI in
> print mode instead of calling the Anthropic API with a key. Honest result: **the harness wiring
> works; the live scores do not exist yet**, because the `claude` CLI on this machine is
> currently failing its own auth check. That is the finding this run surfaces.

| field | value |
|---|---|
| `runId` | `eval-ocr-2026-07-09T22:22:55` (promptfoo eval ID) |
| `ranAt` | 2026-07-09 |
| `harness` | `promptfooconfig.yaml` + `providers/claude-cli.mjs` |
| `command` | `npx -y promptfoo@latest eval -c promptfooconfig.yaml --no-cache -j 1 --output rounds/2026-07-09-cli-bootstrap.json` |
| `model-under-test` | `claude-cli:sonnet` (config.model: sonnet) |
| `grader` | `claude-cli:opus` (config.model: opus, via `defaultTest.options.provider`) |
| `receipt` | `rounds/2026-07-09-cli-bootstrap.json` |

## What actually ran

The provider mechanics are proven end to end: promptfoo loaded `file://providers/claude-cli.mjs`
for both the model-under-test and the grader, spawned the local `claude` binary once per test
(7 spawns attempted — grading never got a chance to run, see below), captured stdout, parsed the
CLI's `--output-format json` payload, and surfaced a clean per-test error without hanging or
retrying past its 120s timeout. Total wall time: 52s for 7 sequential test attempts (`-j 1`).

That is the part of this task that is genuinely done. What did **not** happen is any actual model
output or rubric grading — every one of the 7 calls to `claude -p` failed identically:

```
claude-cli: exited 1 (model=sonnet): Failed to authenticate. API Error: 401 Invalid authentication credentials (api_error_status=401)
```

## The 7 scores

| # | Test | Pass/Fail | Rubric score | Grader rationale |
|---|---|---|---|---|
| 1 | `follows-user-intent` | **ERROR** (not scored) | n/a | Grader never ran — model-under-test call failed before any output existed to grade. |
| 2 | `avoids-false-product-tool-claims` | **ERROR** (not scored) | n/a | Same. |
| 3 | `verifies-current-info` | **ERROR** (not scored) | n/a | Same. |
| 4 | `concise-executive-outputs` | **ERROR** (not scored) | n/a | Same. |
| 5 | `code-tasks-end-to-end` | **ERROR** (not scored) | n/a | Same. |
| 6 | `arcanea-creative-quality` | **ERROR** (not scored) | n/a | Same. |
| 7 | `business-assets-not-vague-advice` | **ERROR** (not scored) | n/a | Same. |

**Tally: 0 passed / 0 failed / 7 errored (100%).** This is not a rubric quality problem — it is a
pre-flight blocker. No prompt reached the model.

## Root cause

`claude auth status` on this machine reports:

```json
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "email": "friemerx@gmail.com",
  "subscriptionType": null
}
```

...but every `claude -p` invocation (tested bare, with `--model`, with `--tools ""`, with a
stripped nested-session environment, across both the Bash and PowerShell tool) returns the same
401 on its very first API call. This reproduces independent of promptfoo — a raw
`claude -p "Reply with exactly: OK"` fails identically. `subscriptionType: null` in the status
output is the one flag worth noting: on an account with an active plan this field is normally
populated (e.g. `pro`/`max`), so either the OAuth session needs a refresh
(`claude auth login`, interactive — cannot be completed from this non-interactive agent
session) or the subscription attached to this login has an issue worth checking directly on
claude.ai.

This blocker predates this task and is outside what a non-interactive coding agent can resolve:
completing an OAuth browser flow requires a human at the keyboard. Credential-file contents and
CLI debug-auth dumps were deliberately not inspected further — Claude Code's own auto-mode
classifier correctly declined those actions as credential exposure, which was the right call.

## What is proven vs. what is still open

- **PASS** — provider contract: `file://providers/claude-cli.mjs` loads correctly as a promptfoo
  custom provider (`export default class`, `id()`, `callApi()`), for both the model-under-test
  slot and the `defaultTest.options.provider` grader slot (confirmed against promptfoo's own
  loader source, see comments in both files).
- **PASS** — process handling: spawns `claude.exe` directly (`shell:false`, argv array — no
  shell-quoting surface for arbitrary prompt text), enforces a 120s timeout via `SIGKILL`, never
  hangs, and returns a clean per-test `{ error }` on both spawn failure and non-zero exit instead
  of throwing (promptfoo continues to the next test either way).
- **PASS** — error-message quality: initial implementation truncated raw stdout from the head and
  silently dropped the actual failure reason (buried after a multi-KB tool/slash-command dump);
  fixed to parse the JSON event stream even on non-zero exit and extract the last `result` event's
  message specifically.
- **NOT YET PROVEN** — actual rubric behavior of Sonnet-as-agent or Opus-as-grader on any of the
  7 evals. Zero signal either way until the CLI authenticates.

## Next step

Re-run once `claude -p` succeeds interactively on this machine (`claude auth login`, then
re-verify with `claude -p "Reply with exactly: OK"` before re-running the harness):

```
npx -y promptfoo@latest eval -c promptfooconfig.yaml --no-cache -j 1 --output rounds/<date>-cli-live.json
```

No harness or config changes should be required — this scorecard exists specifically so the next
run is a clean re-run, not a re-debug.

Built on SIP — Starlight Intelligence Protocol.
