# Scorekeeper review — round 3 (Maya, Thursday Whist admin)

**Who / what I tried.** I was Maya, admin of Thursday Whist, scoring one-handed on a 390x844 phone (also 375x667 and desktop), with a second phone session in some steps.
I finished the in-play round 4 of "Midweek special", then played rounds 5–8: up and down tables, the blocked 13th bid, a zero bid in a down table (made +50, and failed −40), a renege, an "everyone fell" round, a trump winner with a suit and with NT, "Same table" plus a changed table, and a wrong-players round that I discarded.
Mistakes I recovered from: Edit bids after locking (tricks kept), Edit round after saving (14/13 caught), browser Back and reload in both steps, leaving through Groups and coming back, a triple-tap on Save, and two phones starting and locking the same round.
I closed the session, then started "Late night test" (Dan's balcony, Progressive, Advanced rules, limit 2) and played 2 rounds to the limit, then a third plain session.
`errors`: only the expected 409s from my double-save and two-phone tests; no console errors.

## What works well (keep these)
- **Very few taps.** A full round is 11 taps: Same table (1), 4 bids, Lock, 4 trick counts, Save. With a trump winner and suit it is 13. The keypad advances to the next player by itself, and the trump winner automatically bids first.
- **Everything you press often is at the bottom.** The 0–13 keypad, Lock bids and Save round sit at the bottom in big 44px+ buttons. It fits without scrolling at 375x667 (shots/020-bid375.png), and the numbers are readable at arm's length.
- **You can't enter an impossible total.** The bid that would make 13 is greyed out and the reason is given ("3 is blocked — the bids can't total 13"). A wrong trick total shows "Tricks must total 13 — now 14", with the counter pill in red and Save disabled (shots/004, 009).
- **Points show live on every row** ("bid 4 · 1 off −10 − 100 renege", "made +50", "everyone fell 0"). An everyone-falls round gets a clear notice (shots/017). Renege is one toggle that turns red with "−100" (shots/011).
- **Recovery is solid.** Reload and Back keep what you entered ("Restored: tricks for 2 players.", "Restored: 4 bids and the trump mark."). Edit bids keeps the tricks already entered. Edit round recalculates correctly. Tapping Save three times saves once. A second phone tapping "Same table" joins the same round instead of creating a duplicate.
- **You can tell it saved.** After Save you land on the session with a "LAST ROUND" card and updated standings (shots/012). Every score I checked by hand was right, both Classic and Progressive.
- **Advanced rules and the round limit work.** The top bidder is marked as trump winner automatically, a tie asks you to choose ("Tie on the top bid — tap who won the auction"), then suit and card order. When the limit is reached the session says so and offers Close session. Going to /round/new directly says "Round limit reached" (shots/025, 026).
- **Dangerous actions ask first.** Discard and Close session each have a confirmation with plain consequences ("a closed session cannot be reopened").

## Findings (most serious first)
1. **minor: a second phone's Lock bids silently overwrites the first phone's locked bids.** The two phones showed DOWN·8 and UP·16 for the same round. Start and save are protected by 409s; lock is not (shots/027, s3b-001).
2. **minor: after discarding a wrong-players round, the shortcut becomes "Redeal — same table" for the wrong four.** "Same players as last round" disappears. Getting back to the correct table takes 8 taps. There is no "Change players" on the Bidding screen (shots/016).
3. **minor: at 375x667 the running score is below the fold.** You scroll every round to see it (shots/019).
4. **minor: the "Restored: 4 bids…" note stays on the Results step after the bids are locked** (shots/021).
5. **minor: bidding rows keep the seat numbers ("1. Maya") when the trump winner bids first** (shots/009).
6. **minor: Edit bids and ← Session are at the top of the round screen,** out of one-thumb reach.
7. **minor: the "Tonight / Last night" standings toggles really mean this session / last session.**
8. **minor: the round limit is stated twice once it is reached** (shots/026).
9. **idea: no keyboard number entry on desktop.**

I was never unsure whether something had saved, and no error message was confusing. Nothing here would send me back to pen and paper.

## Verdict
PUBLISH: yes
Top three changes: (1) refuse a second Lock bids on an already-locked round, like start and save already do; (2) after discarding a round, keep offering the last scored table, and add "Change players" before bids are entered; (3) show a compact standings strip above the Last round card on short screens.
