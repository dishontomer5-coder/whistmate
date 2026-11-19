# Visual designer, review round 4

## Who I was and what I tried
I reviewed as a product designer who had never seen WhistMate, with the job of keeping the navy/gold/spade identity and making it better.
Signed out: landing, login (including the error state), register, OTP and About. Then I signed up as a new user and created a group, to see onboarding and the empty states.
Signed in as Maya (admin): groups list, standings, menu, create/join dialogs, activity, Me, sessions, an open session, resume, results (renege on/off), save, pick table, bidding (trump picker, blocked total of 13), scoring sheet, scored and everyone-fell rounds, player profile, leave a note, delete round confirm, Players, Admin (member menu, add player), rules and the assistant, the 404 page and a missing session.
I used phone 390, small 320 (plus 375x667) and desktop 1440. Contrast and touch sizes were measured with eval on computed styles across 15+ screens.
Screenshots are in /private/tmp/claude-501/-Users-tomerdi-Personal-whistmate/67190dd3-7d53-45e6-8aae-1869c3f324ce/scratchpad/review/r4/visual-designer/shots/ (b-* are from the new-user session).

## What works well (keep these)
- **One identity, used with restraint.** Navy surfaces, gold used only for the single primary action and the active tab, and the spade tile on the landing, auth and header screens. It feels like one calm product (001-landing, 009-grouplist).
- **Contrast is solid.** My automated scan found no text pair under WCAG AA on any screen I measured. Muted text rgb(159,169,188) on navy rgb(14,29,62) is 7.0:1, and gold rgb(253,216,53) on navy is 11.9:1.
- **The round-entry screens are the best part.** The keypad sits in the thumb zone with keys of 44 px or more. The blocked total of 13 is struck through and explained in red. Live per-player feedback ('2 off −20', 'made +35'), the 13/13 tricks counter and the renege pill (−100) are all clear (021, 022, 030).
- **Picking the table** uses gold borders and seat numbers 1–4 that replace the avatar, which is clear and well suited to the table (026).
- **Onboarding and the empty, error and not-found states** have a consistent icon-in-circle + title + one action pattern (b-006, b-008, 063, 064). The destructive confirm uses solid red with an outlined Cancel (041).
- Card, list row, pill and dialog components are consistent across screens. Hebrew names and RTL text sit correctly in LTR rows.

## Findings (most serious first)
1. **major: The bottom bar swaps to a different set of tabs inside a group, and 'Me' can't be reached from inside a group.** Groups·Activity·Me vs Standings·Sessions·Players·Admin; Me is not in the menu, and 'Players' opens /profile. Fix: Standings·Sessions·Players·Me inside a group with Admin in the menu, or put 'My profile' at the top of the menu (009, 006, 008).
2. minor: Selected and focused look the same (both a gold 2px outline), and the selected key is a gold outline in Bidding but a green fill in Results. Fix: selected = rgba(253,216,53,.16) fill with gold text; keep the ring for :focus-visible only.
3. minor: On the groups list, Create group is gold while Resume (a round in play) is outlined. Make Resume the primary.
4. minor: Tap targets under 44 px: Edit round 111x36, the UP/DOWN chips (which are buttons) 73x24, 'What is a renege?' 103x28.
5. minor: A disabled primary in a dialog looks weaker than Cancel. Use gold at 40% opacity.
6. minor: The session page repeats a full 'Edit round' pill on every round, and Close session has grey text and a lock, so it looks disabled.
7. minor: Green means a positive delta, the Results phase and the selected key, while positive scores are white elsewhere.
8. minor: The invite link wraps mid-word ('Thursd|ay%20Whist'), and Share and Copy link are equal-weight full-width buttons.
9. minor: The chart has a dot on every round and uneven x ticks (1/41/81/153).
10. minor: Activity shows a grey 'New' pill on 9 of 12 cards, and one card has an unexplained gold border.
11. minor: The 'י' avatar for יוסי is nearly blank, and the award icons can't be made out at about 18 px.
12. minor: Rules has its own header and no tab bar, and the inline link stretches the intro's line spacing.
13. minor: At 320 px the Results step first shows only one player row, and the trump line orphans the name.
14. minor: A new user's Me page shows 12 tiles of '—'/'0' and the email prefix as the name.
15. minor: Signed-out About links '← Groups'; Login has no About/back link; the landing says 'Sign in' and the form says 'Log in'.
16. idea: Desktop is a 640 px phone column with a bottom tab bar. Use a left rail and two columns at 1024 px and wider.
17. idea (store icon, owner's call): I prefer the flat gold/navy spade, because it is the in-app mark. The jester's banner says 'Whist', and its detail is lost at icon size.
18. idea: Players mostly repeats Standings. Fold it in and give the tab to Me.

Errors: no console errors. The only failed requests were expected (401 /User/me while signed out, a 400 for the wrong password, a 404 for the fake session).

## Verdict
PUBLISH: yes. Top three changes:
1. Make navigation stable inside a group, with Me one tap away (finding 1).
2. Give selected states their own filled style, separate from the focus ring, and use one keypad selected style (2).
3. Raise the session/round tap targets to 44 px and calm the session page (Edit as an icon in the round header, Close session as a normal secondary) (4, 6).
