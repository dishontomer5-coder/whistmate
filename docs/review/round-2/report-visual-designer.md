# Visual designer review, round 2

## Who I was and what I tried
- A product designer seeing WhistMate for the first time. I judged hierarchy, type, spacing, colour, components, touch and feel, and I respected the navy/gold/spade identity.
- Signed out: landing, login (empty and error states), register, about. Signed in as Maya (group admin): groups, create/join dialogs, standings, menu, scoring-help sheet, session, pick the table, bidding (trump winner, suit picker, blocked bid), results (partial, wrong total, renege), saved round, scored and everyone-fell rounds, history, Players/profile, switch-player list, note dialog, Me, activity, admin (member menu, add player, delete-group confirm), rules assistant, not-found states.
- Viewports: phone 390, small 320, desktop 1440. I measured contrast for all visible text, touch-target sizes and keypad positions with eval.
- I compared the jester store icon with the in-app tile and with docs/listing/whistmate-icon-1024.png. The owner has not yet chosen the store icon.
- About 180 browser commands. The only console errors were the expected 401s while signed out and the 404s I provoked on purpose.

## What works well (keep these)
- **The identity holds.** Navy #0E1D3E, a #FDD835 gold and the spade tile are used the same way on every screen. The product feels calm and trustworthy.
- **Contrast passes.** My scan of every visible text node on landing, login, register, standings, session, round, Me and admin found no pair below WCAG AA, apart from disabled controls, where that is intended.
- **No horizontal overflow at 320px.** At 320px the round keypad reflows to 5 columns, and the 46x48 keys stay comfortable to hit.
- **Round entry is excellent:**
  - live per-row feedback ("bid 3 · 1 off −10")
  - a blocked bid key that is struck through and dimmed, with a red reason
  - an UP/DOWN chip that appears as soon as the bids are complete
  - red and white suit glyphs
  - a clear solid-red 'renege on' state
  - a green step banner for results and a gold one for bidding
- **Picking the table** shows numbered gold seat badges with checkmarks, and the selected state is unambiguous.
- **Standings** show the 'you' row with a gold border and tonight's change as green or red arrows, so the change is not conveyed by colour alone.
- **Dangerous actions are well guarded:** deleting a group needs the typed name, and the danger zone is styled in red.
- **Hebrew names and notes** render correctly with dir=auto in notes and chat bubbles.

## Findings, most serious first
1. **Major: gold is not rationed.** It is used for brand, primary CTAs, the selected segment, the active tab, every positive score, You, Leading, OPEN, Claimed, Admin and even the "EVERYONE FELL" chip. Admin shows 4 solid-gold elements on one screen (shots/049-admin-top.png, shots/050-admin-settings.png, shots/038-everyone-falls.png).
   - Fix: positive scores in white (or the green already used for deltas); the selected segment as navy with a gold border; a red/neutral 'everyone fell' chip; Add player as an outline button.
2. **Major: the store icon does not match the app.**
   - The jester icon (shots/store-icon-jester.png) is painted, says "Whist" rather than WhistMate, and shares nothing with the in-app flat gold tile with a navy spade.
   - The listing tile (shots/listing-icon-spade.png) does match the app.
   - Choose the flat tile, sized at about 60% with optical centring.
3. **Major: renege outweighs the trick entry.** On the results step, four 95x32 'Renege −100' pills dominate the core screen (shots/020-round-results.png).
   - Fix: make renege a quiet 44px ghost icon, or one 'Mark a renege' control.
4. **Minor: the keypad jumps.** It moves 22px when the last bid is entered, because the helper line vanishes (shots/032-bids-3.png vs shots/033-bids-done.png).
   - Fix: reserve the line's height.
5. **Minor: the wrong trick total is not shown as an error.** "Tricks must total 13 — now 12" is neutral grey, while bidding errors are red (shots/022-round-overflow.png).
6. **Minor: two back controls on inner screens.** A chevron '< Groups' plus an arrow '← Session', using different glyphs (shots/018-session.png).
7. **Minor: desktop is a stretched phone.** A 640px column, a bottom tab bar and a keypad 200px from the rows (shots/b-011-d-bidding.png).
8. **Minor: too much uppercase.** 19 uppercase labels on Me, wrapping to 3 lines at 320px (shots/b-005-s-me.png).
9. **Minor: targets under 44px.**
   - Classic scoring 98x20
   - award names 30x20
   - UP/DOWN chips 24px tall
   - Renege 32px tall
   - 'What is a renege?' 28px tall
   - switch 28px tall
   - Leave this group 36px tall
10. **Minor: the same person, different avatars.** Maya is purple on Me and brown elsewhere; יוסי gets two initials (shots/016-me.png, shots/041-players-top.png).
11. **Minor: inconsistent error states.** 'Session not found' is top-aligned, with a '...' title and a 3-tab bar; 404 is centred with a gold button (shots/b-014-p-bad-session.png, shots/b-015-p-404.png).
12. **Minor: admin hierarchy.** 'Members (7)' is separated from its list by the invite card, and the raw URL wraps mid-word (shots/049-admin-top.png).
13. **Minor: misplaced destructive action.** 'Leave this group' sits in the profile hero (shots/041-players-top.png).
14. **Minor: Edit and Delete round are equal twins** (shots/037-scored-round.png).
15. **Minor: the password placeholder '••••••••'** looks pre-filled (shots/004-register.png).
16. **Minor: duplicate CTAs.** 'Resume round 4' and 'Enter the results →' go to the same place (shots/018-session.png).
17. **Minor: landing polish.** The uppercase tagline wraps to leave an orphan, and there are two Sign-in entries (shots/001-landing.png).
18. **Minor: heavy round history.** Each round on a profile is a 60px card; it should be a compact table (shots/044-players-mid2.png).
19. **Minor: muddy disabled buttons.** A disabled primary is gold at 50% opacity, which renders as khaki (shots/013-create-group.png).
20. **Minor: confusing trump-winner marker.** It is the brand spade, even when trump is hearts (shots/029-bidding.png).
21. **Idea:** show Pick the table as a seating diagram around a felt, with a gold dealer chip (shots/028-table-pick-3.png).

Full details and fixes are in findings.json.

## Verdict
PUBLISH: yes, after fixes

Top three changes:
1. Ration the gold: one solid-gold fill per screen, positive scores not gold, and the selected segment shown as an outline.
2. Ship the flat spade tile as the store icon so the icon matches the app.
3. Quiet the renege control on the results step and stop the bid keypad from jumping.
