# Returning player (Dan) — review round 2

## Who I was and what I tried
I was Dan, a Thursday Whist regular who never keeps score, opening the app a week later on the bus (phone 390x844; also checked 320x568 and desktop).
I answered all eight brief questions: group leader and gap, last Thursday and my worst round, a round three sessions back (bids, trump), my own stats, Maya vs me, the awards, Activity + leaving a note on Maya, switching to Old Crew, account, rules help and the About page.
I then went through every tab and menu item at both levels (all groups: Groups / Activity / Me; inside a group: Standings / Sessions / Players, + Admin in Old Crew), the in-page back buttons and the browser Back button.
About 75 browser commands; a second session (Maya) confirmed my note reached her Activity.
No console errors or failed requests other than the expected 401 on the login page.

## What works well (keep these)
- Numbers agree everywhere I checked: Dan +757 on the group card, standings, Players page and Me "By group"; +757 + (-7) = +750 all-time. Session results add up per round (tricks total 13), and Progressive/Classic penalties match the help text (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/006-last-thursday.png).
- Sessions list is excellent for a returning player: name, date, place, rounds, method, winner and "You: 4th · +64" on every card (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/005-sessions.png).
- Player page answers Q4 in one screen: best/worst night (linked), contract accuracy "57 of 113 made", zero-bid "0 of 1", lost too few/too many, score-over-time chart; each stat has a tap-to-explain line ("Of the rounds bid at zero, how many ended with no trick taken.") (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/007-dan-player.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/010-zero-info.png).
- Round history on the player page groups my rounds under each session with bid/took/score, and each row opens the round.
- Leaving a note is quick and clear ("A note about Maya, visible to everyone in the group", optional session link, anonymous switch); it appeared at once on her page and in Maya's Activity (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/012-note-dialog.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/013-note-posted.png).
- In-page back buttons name where they go ("← Sessions", "← Player", "← Standings") and were always right; browser Back also behaved, including across a group switch, and a deep link to an Old Crew session switches the header to OLD CREW · ARCHIVED.
- Level is visible: "‹ Groups" + group name in the header inside a group, WHISTMATE logo outside; archived group has a badge and a "read-only" banner (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/018-oldcrew.png).
- "How scoring works" dialog is thorough (making/missing bids, zero, renege, trump order) with worked examples.
- About page clearly says who makes the app and how to ask for data deletion.

## Findings (most serious first)
1. **major — Standings cannot show how the last finished night changed things.** The delta column under "Total score · ↑↓ tonight" is the *in-progress* session (Midweek special, +35/+90/+23). There is no previous rank or "since last session" movement, so "how did Last Thursday change the lead?" needs manual maths from the session page (Maya +143, נועה +110 → gap grew by 33). In Old Crew the same column is headed "One last time" (session name), in Thursday Whist "tonight" — same column, two labelling schemes. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/003-group-home.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/018-oldcrew.png)
2. **major — "Activity" holds only table-talk notes, and it is hidden from inside a group.** All 10 items are "X left a note about Y"; nothing about sessions started/closed, results, or awards changing hands, although a session was in progress. Inside a group the only cue is a dot on "‹ Groups" (accessible name "All groups — new activity"); you have to leave the group to read it. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/015-activity.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/003-group-home.png)
3. **major — "Players" tab is not a list of players.** The tab with the people icon opens *my own* profile (URL /profile) with a "Player: Dan (you)" dropdown; there is no roster. It also duplicates the all-groups "Me" tab (another profile of me). I expected a player list; "Me in this group" is what it actually is. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/009-players.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/016-me.png)
4. **major — No way to compare two players.** Q5 needed switching the dropdown between Dan and Maya on ~2,800px-long pages and remembering numbers (Dan 50% contract / +6.7 avg vs Maya 62% / +11.92). No side-by-side or "vs you" view. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/011-switch-player.png)
5. **major — Rules are split across two places with different names.** The menu item "Rules & scoring" opens only a chat assistant (four suggested questions, no written rules). The full written guide ("How scoring works") is reachable only via a small "?" icon inside a group's pages — not from the menu, Me, or the rules page. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/017-rules.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/004-scoring-help.png)
6. **minor — Same session, two names.** Notes are tagged "Whist Night · Jul 16, 2026", but that session is called "Thursday, 16 Jul" in the Sessions list, worst-night card and session page. "Whist Night" appears nowhere else. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/007-dan-player.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/022-jul16.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/015-activity.png)
7. **minor — Round detail page is a dead end.** /round/… has no bottom bar, the session name ("Rematch · Nov 5, 2026") is plain text, not a link, player names aren't tappable, and in 5-player sessions it doesn't say who sat the round out. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/008-round-page.png)
8. **minor — Finding "the round that hurt me most" is unaided.** Session pages list every player per round with no highlight on my row and no running total; I had to scan 40 lines (my worst in Last Thursday were four tied -5s). (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/006-last-thursday.png)
9. **minor — Trump shown on some rounds only, silently.** In Last Thursday only rounds 2, 3, 6 show "Trump ♦ Diamonds · …"; other rounds show nothing — no "trump not recorded". Q3 ("who took the trump") cannot be answered for most rounds and the user can't tell why.
10. **minor — "Leave this group" sits right under my name on the Players (stats) page** — a destructive action in the place I go to read numbers. (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/025-small-players.png)
11. **minor — Inconsistent decimal precision.** Avg "+11.9" (standings) vs "+11.92" (Maya's page); Old Crew "-0.5" vs "-0.54" (Me); Dan "+6.7" everywhere.
12. **minor — Mixed vocabulary: session / night / tonight.** Tab and stats say "Sessions", cards say "Best night / Worst night", standings say "tonight", sessions are named "Last Thursday", "Midweek special". Understandable, but pick one word for the user-facing unit ("night" reads naturally; keep "session" for the admin flow).
13. **minor — Open session card says "4 rounds"** while only 3 are scored and round 4 is "in play". (/private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/005-sessions.png, /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r2/returning-player/shots/019-midweek.png)
14. **minor — "wins" on standings is unexplained** ("9 wins · +11.9 avg") — wins of what? Session wins; the player page says "2 wins in 11 sessions", standings don't.
15. **idea — Account section is thin.** Me → Account shows only name, e-mail and Sign out (Sign out also in the menu). No way to change display name; data deletion is only via e-mail on About.

## Structure — labels, icons, contents
| Level | Item | Icon | Contains | Match? |
|---|---|---|---|---|
| All groups | Groups | two people | group cards + all-time stats | yes |
| All groups | Activity | bell + count | notes only | partly — bell suggests notifications of everything |
| All groups | Me | person | cross-group stats, by group, account | yes; account buried at the bottom |
| Group | Standings | trophy | leaderboard, live-session banner, awards | yes |
| Group | Sessions | calendar | session list → session → rounds | yes |
| Group | Players | two people | my own profile with player switcher | no — no list |
| Group (admin) | Admin | gear | (not explored; archived group) | — |
| Menu (both) | Rules & scoring | — | AI chat only | partly |
| Menu (both) | About & privacy | — | maker, data, contact | yes |

Two levels are always distinguishable by the header. The same pages (About, Rules) open inside whichever frame you came from, which is fine.

## Proposed structure
- **All groups:** Groups (people icon) · Activity (bell) — notes *and* results: "Last Thursday closed — Maya won, you 4th +64", "Award The Greedy went to Dan" · Me (person) — stats + Account at top-level of the page.
- **Inside a group:** Standings (trophy) — add "since last night" movement (▲1 / +33) and a "Last night" summary card · Nights (calendar) — list → night → rounds, my row highlighted, running totals, worst/best round flagged · Players (people) — a real roster with avg/contract%/wins columns; tap → player page with a "Compare with me" toggle · Notes or an in-group Activity entry so group news is reachable without leaving.
- **Menu:** Rules (written guide, with the assistant as a tab inside it) · About · Sign out.

## Verdict
PUBLISH: yes, after fixes
1. Make Standings answer "what changed since last night" (movement vs previous closed session; a consistent label for the delta column).
2. Turn Players into a roster with a compare-with-me view; keep my profile under Me.
3. Make Activity cover results/sessions/awards and reachable inside a group; put the written rules behind the "Rules & scoring" menu item.
