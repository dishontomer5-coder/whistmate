# Review round 1 (19 November 2026) — the working record

Six independent reviewers went through WhistMate in a sandbox, through the browser only. This folder
keeps what they found and what was decided, so it survives the session that produced it.

- `briefs/` — how the reviewers were briefed: `COMMON.md` (rules for all) and one persona each.
- `all-findings.json` — the 138 raw findings (steps, expected/actual, severity, suggested fix).
  The `evidence` paths point at screenshots in a temporary folder that is not kept.
- `triage-verified.json` — the same findings reproduced by an independent verifier and grouped into
  86 distinct problems, each with a verdict and its cause in the code (file and line).
- `RULINGS.md` — the lead's 66 decisions on those problems, with an owner each, and what was
  deliberately not done.
- `SHARED-PIECES.md`, `DATA-SHAPES.md` — the shared components and data shapes the fix round built on.
- `rules-assistant-live.txt` — fifteen real answers from the live rules assistant, sampled for the
  Whist-player reviewer.

The decisions that outlive the round are in `plan.md` (Phase 13); the task list is in `todo.md`.
