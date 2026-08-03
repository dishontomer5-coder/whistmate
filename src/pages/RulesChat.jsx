import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Send, Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The game rules + LLM behavior live in the backend function `askRules`, which
// inlines docs/whist-rules.md as the assistant's sole knowledge. This UI only
// sends the question + recent history; the function enforces the "IDK bro" rule.

const SUGGESTIONS = [
  "What suit is the strongest?",
  "What is progressive scoring?",
  "How does scoring work if I bid 0?",
  "What happens if everyone misses?",
];

export default function RulesChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    const history = messages.slice(1).map((m) => ({ role: m.role, text: m.text }));
    const next = [...messages, { role: "user", text: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("askRules", { question, history });
      const answer = res?.data?.answer || "IDK bro 🤷 — that's not in the WhistMate rulebook.";
      setMessages([...next, { role: "assistant", text: answer }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", text: "Sorry, I couldn't get an answer right now. Try again." }]);
    } finally {
      setLoading(false);
    }
  };

  // `askRules` requires an authenticated caller (401 otherwise), and this route sits
  // outside the Layout shell, so it guards itself.
  if (!user) return <Navigate to="/login" replace />;

  // No bottom nav on this full-screen route — the header's back arrow is the way out.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/home');
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={goBack}
            aria-label="Back"
            className="-ml-1 w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-lg font-semibold leading-tight truncate">WhistMate Rules</h1>
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