"use client";

import { useState, useEffect, useRef } from "react";
import { IconTarget } from "@/components/icons";

interface JournalTag { id: string; label: string; emoji: string }

// One-tap daily behavior journal (Whoop-Journal style). Tagged days feed the
// deterministic correlation engine — after ~2 weeks of logging, the Correlations
// card shows what each behavior costs (or buys) in next-day recovery.
export default function JournalCard({ date }: { date: string }) {
  const [catalog, setCatalog] = useState<JournalTag[]>([]);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // Latest selection, so rapid taps collapse into one save of the final state
  const pendingRef = useRef<string[] | null>(null);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/journal?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.catalog)) setCatalog(d.catalog);
        setTags(new Set(Array.isArray(d.tags) ? d.tags : []));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [date]);

  async function persist(next: string[]) {
    pendingRef.current = next;
    if (saving) return; // an in-flight save will pick up the latest state after it lands
    setSaving(true);
    try {
      while (pendingRef.current) {
        const toSave = pendingRef.current;
        pendingRef.current = null;
        await fetch("/api/journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, tags: toSave }),
        });
      }
    } catch { /* optimistic UI keeps the local state; next toggle retries */ }
    setSaving(false);
  }

  function toggle(id: string) {
    const next = new Set(tags);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTags(next);
    persist([...next]);
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3">
          <IconTarget style={{ color: "var(--amber)" }} />
          <div>
            <h3 className="text-sm font-bold" style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}>
              Journal
            </h3>
            <p className="text-[10px]" style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              tag today&apos;s behaviors — they feed the correlations
            </p>
          </div>
        </div>
        {tags.size > 0 && (
          <span className="text-[10px] px-2 py-1 rounded-md tabular-nums"
            style={{ fontFamily: "var(--font-mono)", color: "var(--amber)", background: "var(--amber-dim)", border: "1px solid var(--amber-glow)" }}>
            {tags.size} logged
          </span>
        )}
      </div>

      <div className="px-5 py-4">
        {!loaded ? (
          <div className="loading-bar-track"><div className="loading-bar-fill" style={{ background: "var(--amber)" }} /></div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {catalog.map((t) => {
              const on = tags.has(t.id);
              return (
                <button key={t.id} onClick={() => toggle(t.id)}
                  aria-pressed={on}
                  className="px-3.5 py-2.5 min-h-[42px] rounded-full text-xs font-medium transition-all"
                  style={{
                    fontFamily: "var(--font-sans)",
                    color: on ? "#000" : "var(--text-muted)",
                    background: on ? "var(--amber)" : "var(--bg-raised)",
                    border: `1px solid ${on ? "var(--amber)" : "var(--border-mid)"}`,
                  }}>
                  <span className="mr-1">{t.emoji}</span>{t.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
