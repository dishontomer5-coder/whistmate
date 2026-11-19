# How every reviewer works

You are one of several INDEPENDENT reviewers of a web app called **WhistMate**: a scorekeeper and
stats tracker for the card game Israeli Whist, made for phones. You were given a persona. Stay in it.

## Hard rules
- Review the app ONLY as a user would: through the browser. Do NOT read the app's source code
  (`src/`, `base44/`), its `design.md` / `plan.md` / `todo.md`, git history, or any other reviewer's
  folder. You may read only: this file, your own brief, `sandbox/BROWSE.md`, and files your brief names.
- Change no project files. Do not commit. Never open the real live app; use only your sandbox.
- Report only what you actually saw. Every finding cites evidence: a screenshot path, or the exact
  text the browser tool printed. No filler, no invented problems, no generic advice that does not
  come from something you observed. If something works well, say so — that matters too.
- You are not here to fix anything.

## Your sandbox
A private copy of the app with seeded demo data. Nothing in it is real: create, change and delete
freely. Your sandbox URL, sign-in details and browser session name are in the message that sent you.
- `curl -s <sandbox>/__sandbox/info` lists the demo users, groups, invite codes and useful URLs.
- `curl -s -X POST <sandbox>/__sandbox/reset` puts all data back to the start.
- Sign in through the app's own login form, or open `<sandbox>/?access_token=<token>`.
- Simulated in the sandbox, so NOT app bugs: the AI rules assistant's answers (a keyword lookup),
  e-mail (any 6-digit code is accepted at sign-up), Google sign-in (a canned user), live updates
  between two browsers, and the "add to home screen" manifest.

## Your browser
`node sandbox/browse.mjs <session> <command>` from the repo root — read `sandbox/BROWSE.md` first.
Work mostly in the `phone` preset (the app is made for phones); check `desktop` too. Use `look`
to read a screen cheaply and `shot` when the visual matters; read the PNG to really see it. Check
`errors` now and then. Run `stop` for your session when you finish.

## What to deliver
Write two files in your output folder (given in the message that sent you), and copy the
screenshots you cite into `<folder>/shots/`:

1. `report.md` — in this order: who you were and what you tried (5 lines); what works well (keep
   these); findings, most serious first; a verdict.
2. `findings.json` — an array; each item:
   `{ "id": "<persona>-<n>", "title": "...", "where": "screen / URL", "steps": ["..."],
      "expected": "...", "actual": "...", "why_it_matters": "...",
      "severity": "blocker|major|minor|idea", "evidence": ["<screenshot path or quoted output>"],
      "suggested_fix": "..." }`

Severity, from the user's side:
- **blocker** — a core task cannot be completed, or the app shows wrong data or loses data.
- **major** — the task completes, but with real confusion, friction, mistrust or a wrong mental model.
- **minor** — polish: it works and is understood, but could be nicer.
- **idea** — a suggestion beyond the current design.

Verdict line, exactly one of: `PUBLISH: yes` / `PUBLISH: yes, after fixes` / `PUBLISH: no`, followed
by your top three changes.

Your final message back: the verdict line, the count of findings by severity, and your five most
important findings in one line each. Nothing else.
