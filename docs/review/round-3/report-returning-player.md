# Returning player (Dan), round 3

## Who I was and what I tried
I was Dan, a player in "Thursday Whist" who didn't keep score, checking results on the bus a week later. Phone preset mostly, plus small (320) and desktop.
I answered all eight brief questions: leader and gap, last Thursday, a round three sessions back, my stats, comparing with Maya, awards, notes/activity (I posted a note), and switching groups / account / rules / about.
I checked back buttons, browser Back, deep links across groups, and the two levels (all groups vs inside a group).
I cross-checked my numbers against all 113 rounds in my round history: 57 made, total +757, the zero bid (bid 0 took 2 = -40). All of them match.
No console errors or failed requests in the whole run (`errors`: "nothing recorded").

## What works well (keep these)
- Standings answer Q1 at once: Maya +1586, נועה "406 behind", me "829 behind". The Tonight / Last night switch shows each player's session result (shots/001, 002).
- The help (?) opens right at "The standings" and explains every number and award precisely.
- **My player page is excellent.** Best and worst session are links. Contract accuracy is "50% · 57 of 113 made", with zero-bid success and lost-too-few/too-many beside it. The round history groups rounds by session, which answered "which round hurt me most" faster than the session page did (shots/007, 008).
- Another player's page shows "You: …" under every stat. That comparison is exactly what I wanted (desk-002-maya.png).
- Round page back button is contextual ("Player" when I came from a player page). Browser Back behaves correctly everywhere I tried. A deep link to a Thursday Whist session while I was in Old Crew switched groups correctly.
- Leaving a note is easy: link to a session, post anonymously, and it appears at once with a delete option (shots/010, 011).
- About & privacy says plainly who makes the app and how to contact him. The archived Old Crew is clearly marked "read-only".
- Small and desktop layouts hold up (shots/018, 019, desk-001).

## Findings (most serious first)
1. **major**: Trump is shown on only 3 of 10 rounds (Last Thursday) and 4 of 11 (גשם בחוץ). The other rounds show nothing, not even "not recorded", so "who took the trump?" has no answer (shots/005, 009).
2. minor: Round cards on a session page don't mark my row, and the player order changes every round. Finding myself means reading every name (shots/005).
3. minor: Round cards on a session page can't be tapped, although a round page exists and can be reached from a player page.
4. minor: "Activity" in the group menu jumps to the all-groups level. The header and tabs change without warning (shots/012, 013).
5. minor: My account ("Me") can't be reached from inside a group. The email in the menu is not a link.
6. minor: The "Last night" toggle actually shows a session from a week ago, captioned "Last session: Last Thursday". Night, session and session names get mixed up.
7. minor: The Players tab mostly repeats Standings (shots/006 vs 001).
8. minor: "Leave this group" sits at the bottom of my stats page.
9. minor: The "By group" rows on Me are not links.
10. idea: Standings don't show rank change or the previous gap after the last session.

## Structure review
- **Inside a group**, the tabs are Standings (trophy), Sessions (calendar) and Players (people). Standings and Sessions match their icons and content. "Players" mostly repeats Standings, and its URL is /profile.
- **At the top level**, the tabs are Groups, Activity (bell) and Me. Activity holds only table-talk notes; the label is broader than what's inside.
- The menu offers Activity both as a tab and as a menu item at the top level. Sign out appears in both menus and on Me.
- The two levels are always distinguishable: "< Groups | GROUP NAME" versus "♠ WHISTMATE". The exceptions are the Activity jump (finding 4) and the Rules page, which drops both header and tabs and shows only a Back button.
- **Naming:** "session" is used consistently in lists and stats. "Night" appears only in the Tonight / Last night toggle. "Round" is consistent.

**Proposed structure, inside a group:**
- Standings (trophy): ranking, last-session movement and awards.
- Sessions (calendar): the session list, then session, then round, with round cards tappable and my row highlighted.
- Me (person): my stats in this group, with a "Compare with…" picker and other players reachable from Standings rows.
- Menu: Group activity (notes for this group), Rules & scoring, Account, About, Leave group, Sign out.

**At the top level:** Groups, Activity, Me / Account.

## Verdict
PUBLISH: yes, after fixes
1. Show "trump not recorded" (or the inferred top bidder) on every round that has no trump.
2. Highlight my row in round cards and make the cards link to the round page.
3. Keep the group context: make menu Activity group-scoped, or label it clearly, and add an Account link inside the group menu.
