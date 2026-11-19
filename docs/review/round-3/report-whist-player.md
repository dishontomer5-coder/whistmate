# Round 3: the Whist player (Maya, group admin)

## Who I was and what I tried
I'm the player at the table who knows the rulebook (`docs/whist-rules.md`), signed in as Maya.
1. I finished the open Classic session "Midweek special" (rounds 4–7) and closed it.
2. I started a Progressive + Advanced session with a Hebrew name ("ערב בדיקה 3", place "אצל דני") and a round limit of 3. I played rounds 1–5, edited round 1 into an everyone-falls round, and discarded one round.
3. I added a Hebrew player ("שירה ב.") and seated them as a fifth player who rotates in. I posted a mixed Hebrew/English note.
4. I used the rules chat (simulated in the sandbox) and read the live transcript. I checked the standings, profiles and awards by hand. Phone first, desktop as a spot check. No console errors in either session.

## Scoring check: every branch (bids / tricks → app vs. rulebook)
| Branch | Case | App | Rule | OK |
|---|---|---|---|---|
| Made, several sizes | 5/5, 3/3, 7/7, 4/4, 2/2, 10/10 | +35, +19, +59, +26, +14, +110 | n²+10 | yes |
| Classic miss 1 / 2 | 2→3, 4→2, 7→5 | −10, −20, −20 | −10×miss | yes |
| Progressive miss 1 | 4→3, 2→1 (live preview) | −5 | −5 | yes |
| Progressive miss 5 | 7→2 | −50 | −10×5 | yes |
| Progressive miss 6 | 1→7 | −90 | −15×6 | yes |
| Progressive miss 7 / 8 | 9→2, 1→9 | −140, −160 | −20×miss | yes |
| Zero made, UP (14) | 0→0 | +25 | +25 | yes |
| Zero made, DOWN (9, 12) | 0→0 | +50 | +50 | yes |
| Zero failed, 1 trick | 0→1 | −50 | −50 | yes |
| Zero failed, 3 tricks | 0→3 | −30 | −30 | yes |
| Everyone falls (Classic and Progressive) | all four missed | 0 ×4, "Everyone fell" | 0 | yes |
| Renege alone | 5→5 + renege | −65 (+35 −100) | −65 | yes |
| Renege in everyone-falls | 3→2 + renege | −100 | −100 | yes |
| Everyone falls, zero bidder failed | 0→3 in an all-miss round | 0 | 0 | yes |

The session totals and averages all add up by hand: נועה +154 over 7 rounds = +22.0; יוסי −145 = −20.7; Rachel +64 over 4 rounds = +16.0. The overall totals moved by exactly the session result (Maya 1586 → 1470). The round limit counts only scored rounds. Editing round 1 into an everyone-falls round dropped the count from "3 counted" back to "2 counted" and brought back "Start round 5".

## What works well (keep these)
- Every score matched the rulebook. A preview per player ("bid 4 · 2 off −20", "zero bid failed (3 tricks) −30", "everyone fell 0 − 100 renege") shows as you type, so the table can check before saving.
- The no-13 rule is enforced on the last bidder and also on any player when you edit a round ("3 is blocked — the bids can't total 13").
- Trump handling knows how a real table works. A tie on the top bid asks "Tie on the top bid — tap who won the auction". Marking a lower bidder warns "Dan bid 3, below the top bid of 5 — is that the right trump winner?". In Advanced, the top bidder is pre-marked and the card order is required.
- Table flow: you tap the four players in seat order, then "Same players as last round — Maya bids first" rotates the first bidder each round. A fifth player can sit in or out. The results list starts with the trump winner. Edit round, Discard round and Edit bids all work.
- Terms are explained where they appear: the UP/DOWN badges, "What is a renege?", and a complete "How scoring works" sheet with correct worked examples. The language is the table's language: up/down, everyone fell, renege, trump, no trump.
- Hebrew displays correctly in the session title, place, bidding rows, results, standings, notes (Hebrew with English and numbers mixed) and the session picker (shots/033-session-hebrew.png, shots/028-note-posted.png).
- The live transcript answers match the rulebook on all 13 rules questions: a made 7 = 59, a 4→6 miss = −20 Classic / −10 Progressive, the 5♠ vs 5♥ ruling, a renege still applies when everyone falls.

## Findings, most serious first
1. (minor) After a correction pushes the total past 13, the trick keypad jumps back to the first player. My next tap overwrote יוסי's 5 with a 7: "16 / 13 tricks". Save is blocked, so the score can't come out wrong, but it is a trap when you're fixing a typo.
2. (minor) אבי's average shows "0.0", but his profile says "−4 in 76 rounds", which works out to −0.05 a round. Rounded to one decimal that is −0.1 (−0.0526 is not a tie). Every other average I checked matched.
3. (minor) The standings tab says "Last night" for a session that was closed today ("Last session: Midweek special", Nov 19).
4. (minor) The renege line on the results screen reads "made +35 − 100 renege" and never shows the net −65. The net only appears after saving.
5. (minor) The chat's refusal is "IDK bro 🤷 — that's not in the WhistMate rulebook…". It is too flippant for the rules authority. The live transcript also answers the Hebrew question in English. That transcript predates the prompt change, so I could not re-check this here.
6. (minor) The wording mixes terms. The everyone-falls alert says "Nobody made their contract", while every other label says "bid".
7. (idea) Show who deals or leads each round, next to the existing "X bids first".

## Verdict
PUBLISH: yes
Top three changes:
1. Keep the trick keypad on the row you just edited instead of wrapping to the first player.
2. Round averages near zero correctly (−4 / 76 should show −0.1).
3. Show the net score on renege rows, and change the "Last night" label to "Last session".
