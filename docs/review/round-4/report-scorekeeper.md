# Scorekeeper review, round 4 (Maya, admin of Thursday Whist)

## Who I was and what I tried
I was Maya running game night one-handed on a phone (390x844, plus 375x667, 320x568 and desktop). I scored the round that was already in play, then played rounds 5–9: up and down tables, a blocked total of 13, zero bids made and failed, a renege, an everyone-falls round, trump winners with a suit and with NT, "same table" and a changed table.
I made mistakes on purpose: I locked a wrong bid and edited it, saved wrong tricks and edited them, started a round with the wrong four players and discarded it, pressed Back mid-round, reloaded mid-round, left for the home page and came back.
I used a second phone (session s4-b) to lock different bids and save different tricks on the same round.
I closed the session, then started "Late night" (Dan's balcony, progressive, advanced rules, limit 2) and played both rounds until the limit was reached.
About 150 browser commands. Apart from the expected signed-out 401 on /login, the browser recorded no console errors or failed requests.

## What works well (keep these)
- **Entering a round is fast.** You tap the number pad once per player and focus moves to the next player. A typical round costs about 4 bid taps, 1 tap to lock, 4 trick taps and 1 tap to save. The pad and the main button sit in the bottom third of the screen, within thumb reach.
- **Live feedback on every row:** "bid 3 · 2 off −20", "made +35", "13 / 13 tricks", and "Tricks must total 13 — now 12" with Save disabled.
- **The 13-total rule is enforced in place.** The blocked number is greyed out and the line says "4 is blocked — the bids can't total 13" (shots/010-r5-13.png).
- **Mistakes are easy to fix.** "Edit bids" says "the tricks entered are kept". "Edit round" on a saved round says "Saving replaces this round's points". Standings recompute correctly (I checked Maya's +64 and Dan's +131 by hand).
- **Nothing was lost.** A reload mid-round shows "Restored: tricks for 2 players." Leaving and resuming shows "Restored: 2 bids." Back from a round lands on the session page with "Resume round 5".
- **Two phones are handled clearly.** Bids: "This round was changed on another phone. It has been reloaded — what you typed here was not used." Results: "Already saved from another phone — here is what was saved." No silent overwrite (shots/b-001-conflict-save.png).
- **Renege and everyone-falls are clear.** "made +19 − 100 renege = −81" (shots/020-renege-filled.png). "Nobody made their contract — everyone falls, all contract points are 0".
- **Session options are clear.** The round limit shows "Round limit reached — 2 of 2 rounds counted" and the Close button becomes the main action. Discard and Close each ask to confirm, and the wording says what will happen.
- **Readable at 320px** (shots/026-small-results2.png). The list scrolls so the current player stays above the pad.

## Findings (most serious first)
1. **MAJOR — After discarding a round with the wrong players, "Redeal — same table" brings the wrong players back. The real table's shortcut is gone.**
   - **Steps:** After round 5 (Maya, Dan, נועה, יוסי) I picked Maya, Omer, Rachel, אבי by mistake, started the round and discarded it.
   - **What the session page showed:** "Redeal — same table, Maya bids first", directly above the "LAST ROUND Round 5" card with Maya, Dan, נועה, יוסי (shots/017-after-discard.png).
   - **What tapping it did:** it opened round 6 with Maya, Omer, Rachel, אבי, the table I had just discarded.
   - **The picker:** it also offered only "Redeal — same table, Maya bids first" (shots/018-pick-after-discard.png). Before the discard it had offered "Same players as last round — Dan bids first".
   - **Effect:** the one-tap path repeats the mistake. To recover, Maya has to discard again and tap the four real players in seat order from memory.
2. **MINOR — Players appear in a different order on each screen of the same round.** For round 5:
   - Bidding: Maya, Dan, נועה, יוסי.
   - Results: Dan, נועה, יוסי, Maya (starts with the trump winner).
   - Session card: Maya, Dan, נועה, יוסי.
   - Round 4 was in a different order again: results נועה first, card יוסי first.

   When reading tricks off the table, the scorekeeper has to re-find each name.
3. **MINOR — "Resume" on the Groups card opens the session page, not the round.** The card says "Round 9 in play", but the button goes to /session/…, so getting back into the round takes a second tap.
4. **MINOR — A saved round has no explicit confirmation.** After "Save round" or "Save changes" the app just returns to the session page. The updated "LAST ROUND" card implies the save, but in a noisy room a brief "Round 5 saved" would remove the doubt.
5. **MINOR — No running total on the round screens.** During bidding or results the bottom nav is hidden and no totals are shown. Checking the score means going to "← Session" (top-left, a stretch for the thumb) and then "Resume round N". Nothing is lost, but it is 2 taps away during the round, which is when people ask "what's the score?".
6. **MINOR — The closed-session summary "9 rounds played · 1 cancelled (everyone fell)" is ambiguous.** It reads as 10 rounds. There were 9, one of which was round 7 (everyone fell).
7. **MINOR — Advanced rules: once all bids are in, the app marks the highest bidder (אבי, bid 5) as trump winner without being asked.**
   - The screen then shows "Trump won by אבי". It does show this, and it can be changed, so the guess is visible.
   - But "TRUMP WINNER" was never chosen by the user. A scorekeeper who simply picks a suit confirms the guess without noticing (shots/034-adv-notrump.png).
8. **IDEA — The first round of a new session has no "same table as last session" shortcut.** All four players must be tapped in seat order.
9. **IDEA — Progressive wording "−5 each for 1–4 off, −10 each for 5…" can be read either way.** The app scored 5 off as −50 (all five tricks at 10), not 4×5 + 10. The rule could say "5 off = −50".

## Verdict
PUBLISH: yes, after fixes
1. After a discard, make the quick-start button offer the last *scored* round's table (or both choices with the names shown), never silently the discarded one.
2. Keep one player order (seat order) on the bidding, results and summary screens.
3. Make "Resume" open the round in play, and show a brief "Round N saved" after saving.
