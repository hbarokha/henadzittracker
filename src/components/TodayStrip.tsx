"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { Supplement, SupplementLog } from "@/lib/supplements";
import { isScheduledOn } from "@/lib/schedule";
import { TIME_OF_DAY_LABELS } from "@/lib/timeOfDay";
import { loadReminders, slotsDueNow, wasNotified, markNotified, type ReminderSlot } from "@/lib/reminders";

interface Props {
  todayIso: string;
  /** Food entries logged today — drives the "nothing logged yet" nudge. */
  loggedToday: number;
  onGoSupplements: () => void;
  onGoNutrition: () => void;
}

const REFRESH_MS = 5 * 60_000;

// "What's left today" — the one place that answers it. Supplements whose slot has
// started and aren't checked off, plus an unlogged-food nudge. Also fires the browser
// notification for each supplement slot (once per slot per day) when reminders are on.
//
// Notifications are fired from the page itself, not from a server: this runs while the
// app is open or sitting in a background tab / installed window. A closed app can't be
// woken without a push service, and the strip says so in the settings rather than
// pretending otherwise.
export default function TodayStrip({ todayIso, loggedToday, onGoSupplements, onGoNutrition }: Props) {
  const [pending, setPending] = useState<{ slot: ReminderSlot; names: string[] }[] | null>(null);
  const [hour, setHour] = useState(() => new Date().getHours());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setHour(new Date().getHours());
    try {
      const res = await fetch(`/api/supplements?date=${todayIso}&today=${todayIso}`);
      if (!res.ok) return;
      const body = await res.json() as { supplements: Supplement[]; log: SupplementLog[] };
      const takenIds = new Set(body.log.filter((l) => l.taken).map((l) => l.supplementId));
      const settings = loadReminders();
      // The strip always follows the reminder clock; when reminders are off it still shows
      // what is due by the default times, so the view is useful without any permission.
      const due = slotsDueNow(settings);
      const groups = due.map((slot) => ({
        slot,
        names: body.supplements
          .filter((s) => s.timeOfDay === slot && isScheduledOn(s.schedule, todayIso) && !takenIds.has(s.id))
          .map((s) => s.name),
      })).filter((g) => g.names.length > 0);
      setPending(groups);

      if (settings.enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const g of groups) {
          if (wasNotified(todayIso, g.slot)) continue;
          markNotified(todayIso, g.slot);
          const title = `${TIME_OF_DAY_LABELS[g.slot]} supplements`;
          const bodyText = g.names.slice(0, 4).join(", ") + (g.names.length > 4 ? ` +${g.names.length - 4} more` : "");
          try {
            const reg = await navigator.serviceWorker?.getRegistration();
            if (reg) await reg.showNotification(title, { body: bodyText, tag: `supp-${g.slot}`, icon: "/icon-192.png", badge: "/icon-192.png" });
            else new Notification(title, { body: bodyText, tag: `supp-${g.slot}` });
          } catch { /* notification APIs vary by platform; the strip below still shows it */ }
        }
      }
    } catch { /* offline — keep whatever was last shown */ }
  }, [todayIso]);

  useEffect(() => {
    refresh();
    timer.current = setInterval(refresh, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const totalPending = (pending ?? []).reduce((s, g) => s + g.names.length, 0);
  const noFood = loggedToday === 0 && hour >= 11;
  if (!totalPending && !noFood) return null;

  const chip = "min-h-[44px] px-3 rounded-lg text-left text-xs flex-1 min-w-[200px]";
  return (
    <div className="flex flex-wrap gap-2" role="region" aria-label="Still to do today">
      {totalPending > 0 && (
        <button onClick={onGoSupplements} className={chip}
          style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", color: "var(--text)" }}>
          <span className="font-semibold" style={{ color: "#a78bfa" }}>💊 {totalPending} supplement{totalPending === 1 ? "" : "s"} to take</span>
          <span className="block truncate" style={{ color: "var(--text-dim)" }}>
            {pending!.map((g) => `${TIME_OF_DAY_LABELS[g.slot]}: ${g.names.slice(0, 2).join(", ")}${g.names.length > 2 ? "…" : ""}`).join(" · ")}
          </span>
        </button>
      )}
      {noFood && (
        <button onClick={onGoNutrition} className={chip}
          style={{ background: "var(--amber-dim)", border: "1px solid var(--amber-glow)", color: "var(--text)" }}>
          <span className="font-semibold" style={{ color: "var(--amber)" }}>🍽 Nothing logged yet today</span>
          <span className="block" style={{ color: "var(--text-dim)" }}>Tap to log — recent meals are one tap</span>
        </button>
      )}
    </div>
  );
}
