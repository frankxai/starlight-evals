---
name: clean-example
description: A minimal, deliberately clean SKILL.md fixture used to CI-test scripts/lint-skills.mjs against a known-good file. It has valid frontmatter, no dollar-digit sequences, no secret-shaped strings, and no personal paths.
---

# Clean Example Skill

This fixture exists only so `npm run lint:skills -- fixtures/lint` has something
that must pass. It exercises the frontmatter contract (name matches folder,
description present and under 1024 chars) without tripping the dollar-digit,
secret-pattern, or personal-path rules.

## Usage

Reference this skill by describing the task you want handled; there is no
real behavior here, it is a linter fixture.
