import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { Send, BookOpen, ArrowLeft, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SuitText } from "@/components/Suit";
import { ScoringGuide } from "@/components/ScoringHelp";
import EmptyState from "@/components/EmptyState";
import { errorMessage } from "@/lib/format";
import { withReturnTo } from "@/lib/authReturnTo";
import { cn } from "@/lib/utils";

// "Rules & scoring" (/rules), a full-screen page with two tabs:
//   How scoring works  the written guide: the same sections as the "?" help sheet. First,
//                      and readable signed out.
//   Ask a question     a chat with the rules assistant (signed in only).
// The tab is in the address (?tab=ask), so a link can open the chat directly.
//
// The rulebook and the assistant's behaviour live in the backend function `askRules`, which
// inlines docs/whist-rules.md as its only knowledge and answers in the language of the
// question. The chat only sends the question and the recent history.

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

const TABS = [
  { id: "guide", label: "How scoring works" },
  { id: "ask", label: "Ask a question" },
];

export default function RulesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "ask" ? "ask" : "guide";
  const setTab = (id) => setParams(id === "ask" ? { tab: "ask" } : {}, { replace: true });

  // No bottom nav on this full-screen route — the header's back arrow is the way out.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/home");
  };

  // Arrow keys move between the two tabs, as in any tab list.
  const onTabKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "guide" ? "ask" : "guide";
    setTab(next);
    document.getElementById(`rules-tab-${next}`)?.focus();
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="sticky top-0 z-10 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={goBack}
            aria-label="Back"
            className="-ml-2 w-11 h-11 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-secondary text-foreground flex items-center justify-center shrink-0" aria-hidden="true">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="min-w-0 font-heading text-lg font-bold leading-tight truncate">Rules &amp; scoring</h1>
        </div>
        {/* The chosen tab is outlined in gold, not filled: a gold fill is for the one
            primary action of a screen (src/index.css). */}
        <div role="tablist" aria-label="Rules and scoring" onKeyDown={onTabKey}
          className="mx-auto mt-3 flex max-w-2xl gap-1 rounded-xl bg-secondary p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`rules-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`rules-panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={cn(
                "min-h-11 min-w-0 flex-1 rounded-lg border-2 px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
                tab === t.id ? "border-primary bg-background text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div id="rules-panel-guide" role="tabpanel" aria-labelledby="rules-tab-guide" hidden={tab !== "guide"}
        className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div className="mx-auto max-w-2xl">
          <p className="mb-3 text-sm text-muted-foreground">
            How WhistMate scores a round, and what the standings show. Not covered here?{" "}
            <button type="button" onClick={() => setTab("ask")}
              className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
              Ask a question
            </button>
          </p>
          <ScoringGuide headingLevel={2} />
        </div>
      </div>

      {/* Kept mounted while the guide is shown, so the conversation survives a look at the guide. */}
      <div id="rules-panel-ask" role="tabpanel" aria-labelledby="rules-tab-ask" hidden={tab !== "ask"}
        className="min-h-0 flex-1 flex-col [&:not([hidden])]:flex">
        <ChatPanel />
      </div>
    </div>
  );
}

function ChatPanel() {
  const { user } = useAuth();
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

  // `askRules` requires an authenticated caller (401 otherwise). The guide is public; the
  // chat asks a signed-out visitor to sign in, and comes back to this tab afterwards.
  if (!user) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <EmptyState icon={BookOpen} title="Sign in to ask a question"
          description="The rules assistant answers questions about Israeli Whist and how WhistMate scores, in any language."
          action={<Button asChild><Link to={withReturnTo("/login", "/rules?tab=ask")}><LogIn /> Sign in</Link></Button>} />
      </div>
    );
  }

  return (
    <>
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-label="Conversation">
        <div className="mx-auto max-w-2xl space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              <div
                dir="auto"
                className={`max-w-[85%] px-4 py-2.5 text-base leading-relaxed rounded-[1.25rem] whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-secondary text-foreground ring-1 ring-inset ring-input/60 rounded-br-md"
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
                <Link to="/about" className="mt-1 inline-flex min-h-11 items-center px-2 text-sm font-medium text-foreground underline underline-offset-4">
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
      </div>

      {/* Composer */}
      <div className="px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 bg-background/80 backdrop-blur-xl border-t border-border">
        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="mx-auto flex max-w-2xl items-center gap-2"
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
    </>
  );
}
