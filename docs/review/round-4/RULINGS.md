# Review round 4 — rulings (19 November 2026)

Run at the owner's request after the three planned rounds. Six fresh reviewers on the live build:
0 blockers, 8 majors, 47 minors, 10 ideas (`all-findings.json`; reports `report-<persona>.md`).
Owner's decision: fix the eight majors, verify, deploy, and stop (no fifth round).

| Finding | Ruling |
|---|---|
| returning-player (Activity leaves the group) | Menu › Activity opened inside a group keeps the group frame: Activity renders under the group's header with a back link to where you were (like Rules and About). |
| visual-designer (Me unreachable in a group) | The menu gets "My stats & account" (→ the all-groups Me page) from anywhere, with a back link. |
| scorekeeper (redeal brings back the discarded four) | After a discarded round, "Same players as last round" offers the last round that was actually PLAYED (scored or in play), not the discarded one. "Redeal — same table" is offered only right after discarding a round whose table was right (it stays as a second, smaller option, labelled with the four names). |
| whist-player (results order ≠ bidding order) | **One player order everywhere for a round: seat order** — bidding rows, results rows, the round card, the round page. The trump winner and the first bidder are MARKED (badge/arrow), never moved to the top. This supersedes the round-2 change (results starting from the trump winner); scorekeeper r4's "different order on each screen" minor is resolved by the same rule. |
| whist-player (trump winner below the top bid, no warning) | The hint becomes a visible warning line in the dock whenever the marked winner's bid is below the top bid ("Rachel bid 3 — the top bid was 6 (Maya). Is Rachel really the trump winner?"), shown at lock time too; locking still allowed (the app records what the table decided). |
| qa-tester-1 (two phones start a round at once) | When starting a round answers 409 with `open_round_id`, the second phone says "A round was just started on another phone with <four names>" and offers "Open that round" or "Back to session" — never drops the user into it silently. |
| qa-tester-2 (anonymous note can never be deleted) | The anonymous switch says, before posting, "Anonymous notes can't be deleted later — not even by you. A group admin can remove one." (shown to everyone, admins included). |
| qa-tester-3 (group deleted under a member) | A page whose group is gone shows "This group was deleted" with a button to Your groups (not "Try again"); Your groups shows a one-time notice for a group that disappeared from the member's list (same mechanism as `removed_from`, extended to deleted groups). |

Cheap minors fixed with them: a Hebrew name ending in a digit is separated from its seat number
(whist-player); "Resume" on a group card opens the round in play directly (scorekeeper); "Saved" is
confirmed after Save round / Save changes (scorekeeper); an edit to a round deleted meanwhile shows
"This round was deleted" with a way back and disables Save (qa-tester-5). Everything else is logged
for a later phase.
