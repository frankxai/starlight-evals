# fixtures/lint/

CI fixture for `scripts/lint-skills.mjs`. `clean-example/SKILL.md` is a
deliberately clean skill file — valid frontmatter, no dollar-digit sequences,
no secret-shaped strings, no personal paths — so CI has a stable, known-good
target to run the linter against without depending on any real skill repo.

This directory does not attempt to cover every rule the linter enforces
(dollar-digit corruption, inline secrets, frontmatter contract, personal
absolute paths — see `scripts/lint-skills.mjs` header for the full list).
It only proves the linter runs clean end-to-end.

Real skill repos (e.g. `frankxai/creator-skills`) run `lint-skills.mjs`
against their own full skill tree in their own CI — that is where the rules
actually get exercised against real content and where `--strict` matters.
This fixture is a smoke test for the linter itself, not a substitute for
that.
