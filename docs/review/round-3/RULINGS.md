# Review round 3 — rulings (19 November 2026)

Six fresh reviewers, same briefs, on the build live since the round-2 fixes. 61 findings: 1 blocker,
4 majors, 50 minors, 6 ideas (`all-findings.json`; reports `report-<persona>.md`). Three of six said
plain "PUBLISH: yes". This was the last review round the goal allows; the blocker and the majors are
fixed and independently verified, not re-reviewed.

| Finding | Ruling |
|---|---|
| qa-tester-1 (**blocker**) + scorekeeper-1 (minor, same cause) | **No silent overwrite.** `updateRound` (editing a scored round) and `submitBids` (locking or re-locking bids) take the round's `updated_date` the client loaded as `expected_updated_date`; if the stored round has changed since, they answer 409 "This round was changed on another phone — reload to see it" and write nothing. The screens send it and, on 409, reload the round and say so. Old clients that send nothing keep working (no check) — the field is optional so a cached old site cannot break. |
| qa-tester-2 (major) | **A detached player is told.** When `getMyGroups` finds the caller's cached membership pointing at a row that is no longer theirs (detached/removed), it returns `removed_from: [{ group_name }]`; the groups page shows once: "You were removed from <group> by an admin. Your rounds stay in its history." |
| returning-player-1 (major) | **Say when trump was not recorded.** A scored round card with no trump shows a muted "Trump not recorded" instead of nothing (the app records trump only when the table marks it). |
| visual-designer-1 (major) + newcomer-6-like minors | **Renege keeps its label.** Off: a small neutral "Renege" text button with a 44 px hit area, visually lighter than the tricks number. On: "Renege · −100" in the negative colour, outline not solid fill, so it never reads as the round's score. |
| visual-designer-2 (major) + whist-player-3, returning-player-5 | **"Last session", with its date.** The switch reads "Tonight · Last session"; the caption reads "Last session: <name>, <date>". |

Cheap minors fixed with them: the trick keypad stays on the row just edited when a correction pushes
the total over 13 (whist-player-1); averages near zero round correctly, e.g. −4 over 76 rounds is −0.1
(whist-player-2); the renege row's preview shows the net ("made +35 − 100 renege = −65", whist-player-4);
the round page shows its scoring method (qa-tester-3); the "Restored" note disappears once bids are
locked (scorekeeper-4). Everything else is logged as minor or idea for a later phase.
