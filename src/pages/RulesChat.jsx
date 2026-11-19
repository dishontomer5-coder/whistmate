import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Send, BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SuitText } from "@/components/Suit";
import { errorMessage } from "@/lib/format";
import { withReturnTo } from "@/lib/authReturnTo";

// "Rules & scoring": a chat with the rules assistant.
//
// The rulebook and the assistant's behaviour live in the backend function `askRules`, which
// inlines docs/whist-rules.md as its only knowledge and answers in the language of the
// question. This page only sends the question and the recent history.

// What the assistant says to anything that is not about the rules. The function sends it
// itself; this copy — the same words as IDK in base44/functions/askRules/entry.ts — is
// shown if an answer ever arrives empty. Change them together.
const REFUSAL = "IDK bro 🤷 — that's not in the WhistMate rulebook. I only know the rules and scoring; for your account or your data, see About & privacy in the menu.";

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
    { role: "assistant", text: "Ask me about the rules of Israeli Whist and how WhistMate scores a round — bidding, trump, zero bids, penalties. Ask in any language." },
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
    // The history the assistant sees: real questions and answers only
    const history = messages.slice(1).filter((m) => !m.failed).map((m) => ({ role: m.role, text: m.text }));
    const next = [...messages, { role: "user", text: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await base44.functions.invoke("askRules", { question, history });
      const answer = res?.data?.answer || REFUSAL;
      setMessages([...next, { role: "assistant", text: answer }]);
    } catch (e) {
      // Say what went wrong and put the question back in the field, so it is not retyped
      setMessages([...next, { role: "assistant", failed: true, text: errorMessage(e, "Couldn't get an answer just now. Try again.") }]);
      setInput(question);
    } finally {
      setLoading(false);
    }
  };

  // `askRules` requires an authenticated caller (401 otherwise), and this route sits
  // outside the Layout shell, so it guards itself — and comes back here after sign-in.
  if (!user) return <Navigate to={withReturnTo("/login", "/rules")} replace />;

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
            className="-ml-2 w-11 h-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0" aria-hidden="true">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-heading text-lg font-bold leading-tight truncate">Rules &amp; scoring</h1>
            <p className="text-xs text-muted-foreground truncate">Ask the WhistMate rules assistant</p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" role="log" aria-live="polite" aria-label="Conversation">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              dir="auto"
              className={`max-w-[85%] px-4 py-2.5 text-base leading-relaxed rounded-[1.25rem] whitespace-pre-wrap break-words ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : m.failed
                    ? "border border-destructive/30 bg-destructive/10 text-negative rounded-bl-md"
                    : "bg-card text-card-foreground rounded-bl-md"
              }`}
            >
              {/* Hearts and diamonds in an answer are red, as on every other screen. */}
              {m.role === "user" ? m.text : <SuitText>{m.text}</SuitText>}
            </div>
            {/* The refusal points at "About & privacy in the menu" — this screen has no menu,
                so the way there is offered right under it. */}
            {m.role === "assistant" && m.text.includes("About & privacy") && (
              <Link to="/about" className="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary hover:underline">
                Open About &amp; privacy
              </Link>
            )}
          </div>
        ))}

        {messages.length === 1 && !loading && (
          <div className="flex flex-wrap gap-2 pt-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="min-h-11 px-3.5 py-2 rounded-full text-sm text-left bg-card text-card-foreground border border-border active:scale-[0.98] transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-start" role="status" aria-label="The assistant is answering">
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
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about a rule…"
            aria-label="Your question"
            className="flex-1 min-w-0 rounded-full bg-card px-4"
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={loading || !input.trim()}
            className="rounded-full"
          >
            <Send />
          </Button>
        </form>
      </div>
    </div>
  );
}
