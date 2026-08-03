import { createClientFromRequest } from "npm:@base44/sdk@0.8.38";

// ── The assistant's ONLY knowledge: docs/whist-rules.md (inlined; Deno can't read repo files). ──
// To teach the assistant new rules: edit docs/whist-rules.md, then `npm run rules:gen`.
// Never hand-edit the block below — the generator overwrites it and `npm run rules:check` fails on drift.
// <<< BEGIN GENERATED RULES_DOC — do not edit by hand; run `npm run rules:gen` >>>
// Source: docs/whist-rules.md (§0 stripped — it documents the pipeline, not the game).
const RULES_DOC = `# WhistMate — Israeli Whist Rules & Scoring (AI reference)

> **Purpose.** This document is the **sole knowledge source** for the in-app "Ask about the game"
> assistant. The assistant answers questions about **Israeli Whist as played and scored in WhistMate**
> — nothing else. Everything the assistant is allowed to state about rules and scoring is in this file.
> If a question isn't covered here, the assistant should say it doesn't know rather than invent a rule.

---

## 1. The game at a glance

- **Players:** exactly **4** per round.
- **Cards:** a standard 52-card deck; each player is dealt **13 cards**; there are **13 tricks** per round.
- **Flow of one round:** **Bid** (each player commits to a number of tricks) → **Play** the 13 tricks →
  **Enter results** (how many tricks each actually took) → WhistMate **scores** the round automatically.
- **What WhistMate is:** a mobile scorekeeper and stats tracker. It does **not** deal cards or judge how
  a trick is won — the players do that at the table. WhistMate records the bids and the tricks won and
  does all the math.
- **A "session"** is one whist night; it contains many **rounds** (WhistMate calls a round a "game").
  Scores accumulate across the rounds of a session, and long-term stats accumulate across sessions.

---

## 2. Bidding (contracts)

Each of the 4 players bids a number from **0 to 13** — the number of tricks they promise to take.

**The core rule — the four bids may not total exactly 13.**
- If the four bids sum to **14 or more**, the table is **UP** (over-booked — more tricks are promised than exist).
- If they sum to **12 or fewer**, the table is **DOWN** (under-booked).
- A total of **exactly 13 is not allowed.** WhistMate blocks the **last** player from choosing the value
  that would make the total 13, so the round is always clearly UP or DOWN.

Why UP/DOWN matters: it changes the bonus for a successful **zero bid** (see §4).

**Who "wins" the bid (the highest bidder):** the player with the **highest** bid — and when two players
call the **same number**, the **suit decides it**, not who spoke first. Suit rank, lowest to highest:

> **♣ clubs < ♦ diamonds < ♥ hearts < ♠ spades < no-trump**

So **5♠ beats 5♥**, and **5 no-trump beats 5♠**. (Alphabetical for the four suits, with no-trump on top —
the same ranking bridge uses.) The winner of the auction sets the trump suit for the round.

**What WhistMate records vs. what happens at the table.** The live auction — players raising each other
until nobody outbids — happens at the table; WhistMate is not involved and never sees the losing calls.
What you type into the app is each player's **final** bid, as a number. That means **the app cannot work
out who won the auction on its own**: it doesn't know which suit anyone called. So WhistMate asks you to
**mark the winner directly** — on the bidding screen you tap the trump slot next to whoever took it and
pick the suit they called. That is the record of who won trump for the round.

If someone asks "who is the highest bidder here?", the answer is whoever the table marked as the trump
winner — and if two equal bids are in question, remember the suit ranking above settles it, not bid order.

**Trump is recorded for every session.** Marking the trump winner and suit is available in all sessions
(optional there). **Advanced Rules** (set per session) additionally require a **card hierarchy** —
**Standard** or **Down-Up** (see §3) — and make the trump record mandatory before bids can be locked.

---

## 3. Suits, trump, and "which suit is strongest?"

WhistMate doesn't play the cards, but here's how strength works so the assistant can explain it:

- **During play, the trump suit is the strongest suit.** Any card of the trump suit beats any card of a
  non-trump suit. Among cards of the same suit, the higher-ranked card wins (per the hierarchy below).
  The trump suit is the one the **highest bidder chose** (Advanced Rules).
- **No-Trump:** no suit is trump. Each trick is won by the highest card of the suit that was **led**
  (players must follow the led suit if they can).
- **In the auction, suits are ranked** even before trump is settled: ♣ < ♦ < ♥ < ♠ < no-trump (§2). This
  is what decides a contest between two equal numbers.

So *"what suit is the strongest?"* has two correct answers depending on which moment is meant:
1. **During play:** the **trump suit** of that round — the suit the auction winner called. A trump card
   beats any non-trump card. Under **No-Trump**, no suit is stronger; the led suit's highest card wins.
2. **During the auction:** the fixed ranking **♣ < ♦ < ♥ < ♠ < no-trump**, which is how a tie between
   two players calling the same number is settled (5♠ beats 5♥).

**Card hierarchy** (Advanced Rules — the order of card strength, high → low):
- **Standard:** Ace (high), King, Queen, Jack, 10, 9, … 3, 2 (2 is lowest). The normal ranking.
- **Down-Up:** **Ace is highest, then 2, 3, 4, … up to King (King is lowest).** A twist where the small
  cards become strong right after the Ace.

WhistMate stores the chosen hierarchy for reference; it doesn't enforce it during play.

---

## 4. Scoring (the heart of the game)

After the hand, each player's **actual tricks won** are entered. The four players' tricks must total
**exactly 13**. Then WhistMate scores **each player independently** for that round:

### 4.1 Made your contract exactly (bid 1 or more, tricks won = bid)
> **Score = (bid × bid) + 10**

Examples: bid 3 and take 3 → 3² + 10 = **19**. Bid 5 and take 5 → 25 + 10 = **35**. Higher bids you hit
are worth much more — the square rewards ambition.

### 4.2 Missed your contract (bid 1 or more, tricks won ≠ bid)
Let **miss = |tricks won − bid|** (how many off you were, over or under). WhistMate has **two penalty
schemes**, chosen per session:

- **Classic:** **−10 points for every trick you were off.** Score = −10 × miss.
  - Example: bid 5, took 3 (miss 2) → **−20**. Bid 3, took 6 (miss 3) → **−30**.

- **Progressive:** the per-trick penalty **grows the more you miss** — small misses are cheap, big
  misses are brutal:

  | How far you missed | Penalty per trick | Example |
  |---|---|---|
  | 1–4 tricks | −5 each | miss 4 → −20 |
  | exactly 5 | −10 each | miss 5 → −50 |
  | exactly 6 | −15 each | miss 6 → −90 |
  | 7 or more | −20 each | miss 7 → −140 |

  (Score = −(per-trick rate) × miss.) Same small miss as Classic is gentler; a blow-up is far worse.

### 4.3 Zero bid (you bid 0 — promising to take **no** tricks)
Bidding 0 is a special contract, and its reward depends on whether the table is UP or DOWN (§2):

- **Success (you take 0 tricks):**
  - Table **DOWN** → **+50**
  - Table **UP** → **+25**
  - (Why the difference: when the table is **DOWN**, fewer than 13 tricks were promised, so loose tricks
    are floating around and staying empty-handed is harder — hence the bigger **+50**. When **UP**, tricks
    are scarce and easier to dodge, so a clean zero pays **+25**.)
- **Failure (you take 1 or more tricks):** **−50 for the first trick, then +10 back for each further
  trick.** Score = −50 + 10 × (tricks won − 1).
  - Took 1 → **−50**; took 2 → **−40**; took 3 → **−30**; and so on (the more you were forced to take
    beyond the first, the less it hurts).

### 4.4 "Everyone Falls" (nobody made their contract)
If **no player** made their contract in a round (a successful zero-bid counts as "making it"), the round
is **cancelled**: everyone's contract points are **zeroed** and the round doesn't count toward a session's
optional game limit. Nobody is rewarded or penalized for the busted hand — except a renege penalty still
stands (below).

### 4.5 Reneging (failing to follow suit — a rule break)
If a player **reneged** (didn't follow suit when they could have), they take a flat **−100** for that
round, **on top of** their normal score — and it **still applies even if the round was an "Everyone
Falls" cancel.** It's a punishment, so it isn't waived.

### 4.6 Quick worked round (Classic scoring, table DOWN)
Bids 4 / 3 / 3 / 2 (total 12 → DOWN). Tricks taken 4 / 3 / 2 / 4 (total 13):
- P1 bid 4, took 4 → made → 4²+10 = **+26**
- P2 bid 3, took 3 → made → 3²+10 = **+19**
- P3 bid 3, took 2 → missed by 1 → **−10**
- P4 bid 2, took 4 → missed by 2 → **−20**

---

## 5. Sessions, standings & stats (so the assistant can explain the app's numbers)

- **Session score / standings:** within a session, each player's round scores add up; the leaderboard
  ranks players by total. Across the group, WhistMate also shows an **overall (all-time) score** and how
  much it moved in the latest session.
- **Winning a session:** the player with the highest total when the session closes.

Per-player stats WhistMate tracks:
- **Average score** — points per round.
- **Win rate / podiums** — share of sessions finished 1st / in the top 3.
- **Contract accuracy** — share of rounds where tricks taken exactly matched the bid.
- **0-bid success rate** — of your zero bids, how often you took exactly zero.
- **Bid aggressiveness** — your average bid size (higher = you commit to more tricks).

Awards (group "hall of fame"):
- **The Greedy** — most points lost from taking **too few** tricks (bidding higher than you delivered).
- **The Coward** — most points lost from taking **too many** tricks (over-delivering / busting a low bid).
- **The Destroyer** — was in the most **"Everyone Falls"** rounds.

---

## 6. FAQ (direct answers to common questions)

**Q: What suit is the strongest?**
Two answers, depending on the moment. **During play:** the **trump suit** of that round — the suit the
auction winner called; a trump card beats any non-trump card, and under **No-Trump** no suit is stronger
(the led suit's highest card wins the trick). **In the auction:** suits have a fixed rank,
**♣ clubs < ♦ diamonds < ♥ hearts < ♠ spades < no-trump**.

**Q: One player bids 5♥ and another bids 5♠ — who wins, or is it a tie?**
Not a tie: **5♠ wins**, because spades outrank hearts. The full order is ♣ < ♦ < ♥ < ♠ < no-trump, so a
no-trump call beats every suit at the same number. It is never settled by who bid first. WhistMate doesn't
compute this — the table resolves the auction and then marks the winner in the app (§2).

**Q: What is "Progressive" scoring?**
A missed-contract penalty scheme where the cost **per trick missed grows with the size of the miss**:
−5/trick if you're off by 1–4, −10/trick if off by exactly 5, −15/trick if off by exactly 6, and −20/trick
if off by 7 or more. So a small miss is cheap but a big blow-up is very costly. (The alternative,
**Classic**, is a flat −10 per trick missed no matter what.) The scheme is chosen when a session starts.

**Q: How does scoring work if I bet 0?**
You're promising to take **no** tricks. If you succeed (take 0), you score **+50** when the table is DOWN
or **+25** when it's UP. If you fail, it's **−50 for the first trick** you're forced to take, then **+10
back for every additional trick** (so 1 trick = −50, 2 = −40, 3 = −30, …).

**Q: What do UP and DOWN mean?**
They describe the four bids together: if the bids total **14+** the table is **UP** (over-booked); **12 or
less** is **DOWN** (under-booked). The total can never be exactly 13. It mainly affects the zero-bid bonus.

**Q: What's the most points I can get in one round?**
By making a big contract: a made bid of *n* scores *n²+10*, so a made bid of 13 would be 179 (rare!). A
made bid of 6 is 46; a made 4 is 26. Big, hit bids are the way to rack up points.

**Q: What happens if nobody makes their bid?**
"Everyone Falls" — the round is cancelled and everyone scores 0 for it (a reneging player still takes −100).

**Q: What's the penalty for reneging?**
−100 for that round, added on top of your other points, even if the round was cancelled.

**Q: Does the app decide who wins each trick?**
No. WhistMate is a scorekeeper — you play the physical cards and just tell it how many tricks each player
took. It handles all the scoring and stats.

---

## 7. Glossary

| Term | Meaning |
|---|---|
| Bid / contract | The number of tricks (0–13) a player promises to take. |
| Trick | One round of four cards played; someone "takes" it. 13 per hand. |
| UP / DOWN | The four bids total ≥14 (UP) or ≤12 (DOWN); never 13. |
| Trump | The strongest suit for the round — the suit the auction winner called. Recorded per round. |
| No-Trump | No trump suit; the led suit's highest card wins each trick. Outranks every suit in the auction. |
| Suit rank | ♣ < ♦ < ♥ < ♠ < no-trump — settles two players calling the same number (5♠ beats 5♥). |
| Standard / Down-Up | Card-strength order. Standard = A high…2 low. Down-Up = A high, then 2,3…King low. |
| Made the contract | Took exactly the number of tricks you bid (0-bid: took 0). |
| Everyone Falls | No player made their contract → round cancelled, all score 0. |
| Renege | Failing to follow suit; −100 penalty. |
| Classic / Progressive | The missed-contract penalty scheme (flat −10 vs. escalating). |
| Session | One whist night; contains many rounds ("games"). |
| Round / game | A single deal: bid → play → results → score. |`;
// <<< END GENERATED RULES_DOC >>>

const IDK = "IDK bro 🤷 — that's not in the WhistMate rulebook.";

const SYSTEM_PROMPT = `You are the WhistMate Rules Assistant. Your ENTIRE knowledge is the rulebook provided below. You answer questions ONLY about the card game Israeli Whist as played and scored in the WhistMate app.

Strict rules:
- Answer using ONLY what is in the rulebook. Do NOT use any outside knowledge. Do NOT invent rules.
- Keep answers short and plain. Use the rulebook's wording. A short worked example is fine when it helps the math.
- If the question is not clearly covered by the rulebook, or is off-topic (anything other than Israeli Whist / WhistMate rules and scoring — including app internals, code, accounts, or other games), reply EXACTLY this and nothing else:
${IDK}
- Never discuss app internals, code, accounts, or data storage. Rules and scoring only.
- Do not add greetings, apologies, or filler. Just the answer (or the exact IDK line).`;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const question = body && typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return Response.json({ error: "question is required" }, { status: 400 });

    const history = Array.isArray(body.history) ? body.history : [];
    const convo = history
      .filter((m) => m && typeof m.text === "string")
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Player" : "WhistMate Rules"}: ${m.text}`)
      .join("\n");

    const prompt =
      `${SYSTEM_PROMPT}\n\n=== RULEBOOK ===\n${RULES_DOC}\n\n` +
      `=== Conversation so far ===\n${convo}\nPlayer: ${question}\nWhistMate Rules:`;

    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({ prompt });
    const answer = typeof res === "string" ? res : res?.response ?? res?.text ?? res?.answer ?? "";

    return Response.json({ answer: typeof answer === "string" && answer.trim() ? answer : IDK });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});