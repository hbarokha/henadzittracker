"use client";

import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTERS = [
  "How did I sleep this week?",
  "Why was my HRV low recently?",
  "Am I hitting my protein goal?",
  "Compare this week's stress to last week",
];

// Conversational panel over the user's own health data — Claude answers via
// tool-use against the local Garmin/nutrition/supplement caches.
export default function HealthChat({ date }: { date: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, date }),
      });
      const raw = await resp.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any;
      try { data = JSON.parse(raw); } catch {
        throw new Error(resp.ok ? "Server returned an invalid response" : "Request timed out — try again");
      }
      if (!resp.ok) throw new Error(data.error ?? "Unknown error");
      // The route streams with status 200 committed up front — failures arrive
      // as {"error": ...} in the body rather than a non-2xx status.
      if (data && typeof data === "object" && "error" in data) throw new Error(String(data.error));
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <span className="text-lg">💬</span>
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Ask Your Health Data
            </h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              Claude · reads your Garmin, food & supplement logs
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setError(null); }}
            className="text-[10px] font-medium px-2 py-1 rounded-md transition-colors"
            style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)", border: "1px solid var(--border-mid)" }}
            title="Start a new conversation"
          >
            NEW CHAT
          </button>
        )}
      </div>

      {busy && (
        <div className="loading-bar-track">
          <div className="loading-bar-fill" style={{ background: "#38bdf8" }} />
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="px-4 py-4 space-y-3 overflow-y-auto" style={{ maxHeight: 380 }}>
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Ask anything about your own data — sleep, HRV, workouts, food, supplements.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] transition-all"
                  style={{
                    color: "var(--text-sec)",
                    background: "var(--bg-raised)",
                    border: "1px solid var(--border-mid)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--amber)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-mid)")}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap"
              style={m.role === "user"
                ? { background: "var(--amber-dim)", color: "var(--text)", border: "1px solid var(--amber-glow)" }
                : { background: "var(--bg-raised)", color: "var(--text-sec)", border: "1px solid var(--border-mid)" }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl text-xs"
              style={{ background: "var(--bg-raised)", color: "var(--text-dim)", border: "1px solid var(--border-mid)", fontFamily: "var(--font-mono)" }}>
              checking your data…
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg px-3 py-2"
            style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.25)" }}>
            <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3 flex gap-2" style={{ borderTop: "1px solid var(--border)" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
          placeholder="e.g. why was my sleep score low on Friday?"
          disabled={busy}
          className="flex-1 px-3 py-2 text-sm rounded-lg focus:outline-none transition-all disabled:opacity-50"
          style={{
            background: "var(--bg-raised)",
            color: "var(--text)",
            border: "1px solid var(--border-mid)",
            fontFamily: "var(--font-sans)",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--amber)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border-mid)")}
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: "var(--amber)", color: "#000", fontFamily: "var(--font-display)" }}
        >
          Ask
        </button>
      </div>
    </div>
  );
}
