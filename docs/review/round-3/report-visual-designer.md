# Visual designer review, round 3

## Who I was and what I tried
I reviewed this as a product designer seeing WhistMate for the first time, and kept to its navy-and-gold spade identity.
Signed out, on phone, small (320px) and desktop: landing, log in (including the error state), sign up (validation, password mismatch, email code), about, 404.
Signed in as Maya (group admin): groups list, standings (Tonight and Last night), menus, session, picking the table, bidding with trump and suit, results with a renege, a saved round, a scored round, an everyone-falls round, the scoring help sheet, the delete dialog, sessions, a player profile, players, Me, activity, group admin (member menu, add player), and the rules assistant (both tabs).
In a second session I signed up as a new user and saw the empty groups, activity and Me screens. I also went through create group (and its three-step onboarding), new session (the advanced-rules switch) and the join dialog (bad code, then the invite-link claim).
I measured touch targets, text contrast and font use with `eval` on every main screen. All shots are in `shots/`, and those taken in the second session start with `b-`.

## What works well (keep these)
- **The identity holds together.** Navy, one gold accent and the spade tile are used with restraint. Gold is saved for primary actions, the active tab, "you" and selection, so the screens feel calm and look like one product.
- **Contrast passes everywhere I measured.** The contrast script found no text pair under WCAG AA on landing, login, standings, menu, session, round entry, player, Me, activity, admin or rules. Secondary text is #9FA9BC on navy.
- **Touch targets are almost all at least 44px.** The only ones under that are the Up/Down and "Everyone fell" pills, "Edit round" (36px) and "What is a renege?" (28px).
- **Round entry is strong.** There is a fixed keypad in thumb reach, a live "made +35" / "1 off −10" under each name, and a "14 / 13 tricks" counter that turns red. The blocked bid shows as a struck-through 1 with the reason "1 is blocked — the bids can't total 13". The suit picker uses red hearts and diamonds and white clubs and spades.
- **Picking the table shows the order clearly.** Each selected player gets a gold border with a numbered 1–4 badge, and the same pattern is reused in the join-claim dialog.
- **Empty and onboarding states are good.** "No groups yet", and "Three steps to your first round" with numbered steps and one gold primary.
- **Dialogs are consistent.** The title, a body line, then the primary button above an outline Cancel. Delete is red and says "This cannot be undone." The red inline alert component is shared by login, join and the password mismatch.
- **Hebrew names and notes are aligned per line.** Hebrew notes right-align inside English cards, and the up/down deltas use arrows as well as colour.

## Findings, most serious first
1. **major: the renege control outweighs the tricks entry, and its "on" state hides what it is.** Each row has a 72x44 outlined "Renege" button as heavy as the tricks number, in the thumb's path. When tapped it becomes a solid red "−100" block and the word "Renege" disappears (`shots/017-round-play.png`, `shots/032-renege.png`).
   - Fix: make it a quiet "⚑ Renege" chip under the name, 32px visual with a 44px hit area. When on, show a red outline with the text "Renege −100", not a solid fill.
2. **major: the "Last night" tab shows a session from a week ago.** The caption under it reads "Last session: Last Thursday", which is a session's name, from Nov 12, and today is Nov 19 (`shots/010-lastnight.png`).
   - Fix: rename the tab "Last session" and the caption "Last Thursday · Nov 12", and keep the caption on one line so the layout does not jump.
3. **minor: a gold 2px outline means four things.** It marks the selected segment, keyboard focus, the active input row and the trump winner. On the bidding screen two of them show at once (`shots/028-bid-3.png`).
   - Fix: give the selected segment a gold-tint fill with gold text, give the trump chip a solid gold fill, and keep the outline only for the active row and focus.
4. **minor: some small tap targets.** UP/DOWN pills measure 73x24, "Everyone fell" 92x24, "Edit round" 111x36 and "What is a renege?" 103x28. Keep their look but give them 44px hit areas.
5. **minor: two bottom bars and two badge styles.** The top level shows a numeric "9" badge. Inside a group, new activity is unlabeled white dots on "‹ Groups" and on the menu, and "Me" cannot be reached.
   - Fix: use one numeric badge everywhere, and add "My profile" to the in-group menu.
6. **minor: section headings look like card labels on Player and Me.** They use 12px uppercase grey, the same as the card eyebrows, and some labels wrap to two lines.
   - Fix: use 18px/700 sentence case like "Awards" on Standings, and shorten the card labels.
7. **minor: desktop is a stretched phone.** It is a 640px column with a bottom tab bar across 1440px and 12px meta text.
   - Fix: at 1024px and wider, move the tabs into the header, use two columns and raise the type a step.
8. **minor: line spacing breaks in the Rules intro.** The inline "Ask a question" button pushes the lines to 32px apart instead of 24px.
9. **minor: the raw invite URL wraps mid-word and shows "%20".** It appears as "Thursd / ay%20Whist" on the admin screen.
10. **minor: the signed-out About page's back link says "← Groups" but goes to the landing page.**
11. **minor: the two not-found states use different layouts.** "Round not found" also leaves "…" as the header title.
12. **minor: sign-up shows Chrome's own validation bubble** instead of the app's inline alert.
13. **minor: rounds with no trump record leave a gap.** Add a muted "Trump not recorded" line so the cards keep the same rows.
14. **minor: the keypad dock has an 8px side gutter, but the page and the Save button use 16px.**
15. **minor: the landing tagline leaves "SCOREKEEPER" alone on its second line.** At 320x568 the sign-in button is cut off at the bottom of the screen.
16. **minor: the Players tab looks almost the same as Standings.**
17. **idea: use the flat spade as the store icon.** This is the owner's choice and my view only. The painted jester says "Whist", not WhistMate, its style clashes with the flat interface, and its detail will not read at 48px. `docs/listing/whistmate-icon-1024.png` is the same mark people see inside the app.
18. **idea: show "Pick the table" as a small four-seat table** that fills in as players are tapped, to make the order of play obvious.

## Verdict
PUBLISH: yes, after fixes

Top three changes:
1. Make renege a quiet secondary chip whose "on" state still says "Renege −100".
2. Rename "Last night" to "Last session" and show the session's date.
3. Use the gold outline only for focus and the active row, and give selected segments and the trump chip a fill.
