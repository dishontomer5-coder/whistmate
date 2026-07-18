import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Authoritative rules context (the ONLY context the assistant uses). ──
// Mirrors base44/functions/submitBids, saveRoundResults, startRound + the
// Israeli Whist conventions the app implements. Edit this string to teach it.
const RULES_CONTEXT = `
You are "WhistMate Rules", an assistant that ONLY answers questions about the
Israeli Whist card game as implemented in this app. Do not use outside knowledge
beyond standard playing-card basics. If a question is not about whist rules,
scoring, bidding, suits/hierarchy, or how this app works, say you can only help
with the game rules.

=== Setup ===
- Israeli Whist is a 4-player trick-taking card game. A standard 52-card deck is
  dealt out fully (13 cards per player). Each round is one deal.
- Players are seated in a fixed order; that order is the bidding order.
- A "session" is a whist night made of several rounds. A "group" holds players.
- Roles: App Admin, Group Admin, Player.

=== Bidding ===
- Before play, each player bids how many tricks they will win this round.
- Each bid is an integer from 0 to 13.
- The four bids MAY NOT sum to exactly 13. The app blocks the last bid that would
  make the sum exactly 13, and flashes:
  • "UP" when the running total reaches 14 or more (overbid — the table is "up").
  • "DOWN" when the total is 12 or below (underbid — the table is "down").
- table_state is "up" if the bids sum to 14+, otherwise "down".
- The highest bidder (ties broken by earliest bid_order) is the "top bidder".
- Under "advanced rules" the top bidder also sets the trump suit and the card
  hierarchy for the round. Otherwise trump/hierarchy are not recorded.

=== Trump suit & card hierarchy ===
- Trump suit options: spades, hearts, diamonds, clubs, notrump.
- "notrump" means there is no trump — the led suit governs each trick.
- Hierarchy options: "standard" or "down_up".
- Within a suit the standard order from highest to lowest is Ace, King, Queen,
  Jack, 10, 9, 8, 7, 6, 5, 4, 3, 2. Trump cards beat non-trump cards.
- "What suit is the strongest?" → there is no permanently strongest suit. The
  strongest suit of a round is whatever trump the top bidder chooses; if they
  choose notrump, no suit is stronger than another.

=== Tricks ===
- 13 tricks are played per round. The app requires the four tricks-won entries
  to total exactly 13 before a round can be scored.
- A "renege" is a rule violation (e.g. not following suit when able). A player
  flagged for a renege is docked −100 points for the round, independent of their
  contract result and independent of "everyone falls".

=== Scoring ===
Two scoring methods exist; the session picks one (classic or progressive).

contract_points for a player (bid = B, tricks won = W, table_state T):
- If B = 0 (zero bid):
  • W = 0 (success): +50 when the table is "down", +25 when the table is "up".
  • W > 0 (failure): −50, then +10 for every extra trick beyond the first.
    Formula: −50 + 10*(W − 1).  (So 1 trick = −50, 2 = −40, 3 = −30, …)
- If B > 0:
  • Exact contract (W = B): +(B*B + 10). e.g. bid 3 made = 3²+10 = +19.
  • Missed (W ≠ B):
    - Classic: −10 per trick missed. miss = |W − B|. Score = −10 * miss.
    - Progressive: the penalty per missed trick grows with the size of the miss:
        miss 1–4: −5/trick
        miss 5:  −10/trick
        miss 6:  −15/trick
        miss 7–13: −20/trick
      Score = −(rate(miss) * miss).

=== "Everyone falls" ===
- If all four players miss their contracts (no one made exactly their bid), the
  round is "cancelled": every player gets 0 contract points. (Renege −100 still
  applies additively.) Cancelled rounds do NOT count toward the session game_limit.

=== Answering ===
- Be concise, friendly, and concrete. Use short numbered steps or a small table
  when helpful. Quote the exact formula. Give a worked example when the user
  asks about a specific bid/score. Never invent rules not in this context.
`;

const SUGGESTIONS = [
  "What suit is the strongest?",
  "What is progressive scoring?",
  "How does scoring work if I bid 0?",
  "What happens if everyone misses?",
];

export default function RulesChat() {
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Ask me anything about Israeli Whist rules — bidding, scoring, trump, the works." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const buildPrompt = (history, question) => {
    const convo = history
      .map((m) => `${m.role === "user" ? "Player" : "WhistMate Rules"}: ${m.text}`)
      .join("\n");
    return `${RULES_CONTEXT}\n\n=== Conversation so far ===\n${convo}\nPlayer: ${question}\nWhistMate Rules:`;
  };

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    const next = [...messages, { role: "user", text: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt(next.slice(1), question),
      });
      const answer = typeof res === "string" ? res : res?.response ?? res?.text ?? JSON.stringify(res);
      setMessages([...next, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", text: "Sorry, I couldn't get an answer right now. Try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold leading-tight">WhistMate Rules</h1>
            <p className="text-xs text-muted-foreground">Game rules assistant</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] px-4 py-2.5 text-[15px] leading-relaxed rounded-[1.25rem] ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-card text-card-foreground rounded-bl-md"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-3.5 py-2 rounded-full text-sm bg-card text-card-foreground border border-border active:scale-[0.98] transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-card text-card-foreground rounded-[1.25rem] rounded-bl-md px-4 py-3 flex gap-1">
              <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 bg-background/80 backdrop-blur-xl border-t border-border">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a rule…"
            className="flex-1 h-11 rounded-full bg-card border-border"
          />
          <Button
            type="submit"
            size="icon"
            disabled={loading || !input.trim()}
            className="h-11 w-11 rounded-full bg-primary text-primary-foreground shrink-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>
    </div>
  );
}