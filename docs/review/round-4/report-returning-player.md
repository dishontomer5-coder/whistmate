# Returning player (Dan) — review round 4

## Who I was and what I tried
I was Dan, a regular in "Thursday Whist" who never keeps score, opening the app a week later on the bus (phone 390x844, plus 320x568 and desktop 1440x900).
I signed in by token (phone) and through the login form (desktop) and answered the brief's eight questions: leader and gap, my last Thursday, a round three sessions back, my own numbers, a comparison with Maya, the awards, Activity and notes (I posted one about Rachel), and switching groups / account / rules / about.
I then checked every tab and menu item at both levels, the in-app and browser Back buttons, and moving between groups.
About 70 browser commands. No console errors or failed requests were recorded (`errors`: "nothing recorded since start").

## Paths taken (and wrong turns)
1. Leader: Standings, first screen. Maya +1586; נועה is "406 behind". The small figure shows *tonight* (the open session) by default; I had to tap "Last session" to see last Thursday (Maya +143, נועה +110, so the gap grew by 33). I had to work that out myself.
2. Last Thursday: Sessions > "Last Thursday" card says "You: 4th · +64". Worst round: I scanned all 10 round cards. Six rounds tie at -5. Easier route: Players > Dan > Round history, which lists only my rows.
3. Three sessions ago: Sessions > "גשם בחוץ" (Oct 29) > Round 5: "Trump ♠︎ Spades · Maya", Maya bid 9 took 9 +91. Clear.
4. My numbers: Players > Dan. Avg +6.7, best session +249 (Whist & pizza), contract accuracy 50% (57 of 113), zero bids 0 of 1.
5. Comparison: Players > Maya shows "You: …" under every stat. Excellent.
6. Awards: bottom of Standings, with a one-line meaning each. The full rule is in the "?" dialog.
7. New things: the dot on Menu > "Activity 9". Wrong turn: it dropped me out of the group into the all-groups level (see finding 1). Leaving a note: player page > "Leave a note". This worked first time.
8. Groups: "< Groups" at top left. Account: Groups level > "Me" (ACCOUNT section at the bottom). Rules: Menu > Rules & scoring. Maker: Menu > About & privacy ("Made by Tomer Dishon").

## What works well (keep these)
- A player page shows "You: …" under each of another player's stats, plus a one-line summary under their name (shots/009-maya.png). This answers "how do I compare" with no extra screen.
- My player page has everything a returning player wants: awards held, best/worst session (both links), the stat cards with explanations you can open, a score-over-time chart, table talk, and a round history whose rows open the round (shots/006-me-top.png, 007-me-chart.png).
- Session pages are clear. Final standings sit on top, then rounds newest first, each with UP/DOWN and the total, the trump suit and who named it, and bid · took · score (shots/003, 004).
- The scores I checked agree with the Rules page: Classic -10 a trick, Progressive -5 a trick for 1–4 off, a zero on an up table +25, a failed zero with 3 tricks -30, bid 9 made +91, and "everyone fell" scores 0.
- Back buttons name where they go ("← Sessions", "← Players", "← Player", "← Me"). Browser Back retraced my path correctly, even across groups (Back from /home to a Thursday Whist player page correctly showed THURSDAY WHIST).
- Inside a group the header always shows which group you are in ("THURSDAY WHIST", "OLD CREW ARCHIVED" plus a read-only notice).
- The note dialog is simple and honest ("visible to everyone in the group", optional session, "Your name is not stored with the note"). The note appeared at once with a Delete control.
- Words are used consistently: "session" everywhere and "round" for a hand; "night" never appears. "Tonight" is used only for the open session.
- Desktop centres the phone layout and adds "· 133 rounds" to the standings rows (desk-001-standings.png).

## Findings (most serious first)
1. **major — Menu > Activity inside a group silently switches you to the all-groups level.** The header changes to "♠ WHISTMATE" and the bottom tabs become Groups / Activity / Me. There is no Back button on the page. The other items in the same menu (Rules, About) keep you inside the group (shots/010-menu.png, 011-activity.png, 020-about-from-group.png).
2. **minor — Browser Back can land you in a different group.** I tapped an Old Crew note in Activity, then pressed Back twice. I came back to "/" showing OLD CREW standings, although that entry had been Thursday Whist standings. The header does say OLD CREW.
3. **minor — Session pages do not link a round to its own page.** A round's page (/round/…) can only be opened from a player's Round history. When you open it that way, the bottom bar highlights "Sessions", not "Players" (shots/008-round.png).
4. **minor — Finding "my worst round" in a session means scanning every card.** The player order changes each round and my row is not highlighted (shots/004-session-rounds.png).
5. **minor — "Activity" (bell icon) holds only table-talk notes.** There are no new sessions or results, though the label and icon suggest a general feed. The count clears all 9 "New" items as soon as you open it once.
6. **minor — Account is thin and hard to find.** It is the last section of Groups > Me: name, e-mail and Sign out. The e-mail at the top of the menu cannot be tapped. Deleting your data is explained only on About ("write to …").
7. **minor — The Players tab mostly repeats Standings.** It shows the same totals and averages in a different order. Your own stats are one more tap away (Players > Dan), and "Leave this group" sits at the bottom of that stats page (shots/005-players.png).
8. **minor — Two wordings for "everyone fell".** The session summary calls it "1 cancelled (everyone fell)", while the standings help says it "counts as a round played". The two read as if they contradict each other.
9. **minor — Text is cut off at 320px.** "406 behind · 3 wins ·…" loses the average, and the best-session caption is cut ("1st of"). Only about 1.5 standings rows show on the first screen (shots/022-small-standings.png, 023-small-maya.png).
10. **minor — The Awards section does not say over what period it counts** (all-time, it turns out, since Dan's -600 equals his all-time "Lost taking too few").
11. **idea — The standings could show how the last session moved the table**, for example rank changes or the leader's gap before and after.
12. **idea — Let stats lead to their rounds.** Tapping "Zero-bid 0 of 1" or "Fell as top bidder 1" could list those rounds.

## A better structure (proposal)
- Inside a group (bottom tabs): **Standings** (trophy): table, awards, and the open-session banner. **Sessions** (calendar): unchanged, with each round card linking to its round page. **Me** (person): my stats in this group, with an "Other players" list at the top or a player picker, so the Players tab goes. **Notes** (speech bubble): this group's table talk and new-note count.
- Top bar: "< Groups" (always to the group list) and a menu with Rules & scoring, About, and Account.
- All-groups level: **Groups**, **Activity** (notes from every group, clearly labelled "All groups"), and **Me / Account** (all-groups stats, then account settings).
- Rule: a menu item never changes the level. Anything at the other level opens with a Back button.

## Verdict
PUBLISH: yes, after fixes
1. Keep Menu > Activity inside the group (or label it "All groups" and give it Back).
2. Put the group in the URL (or the history entry) so Back always returns to the same group.
3. Link round cards on session pages to the round page and highlight my row in each round.
