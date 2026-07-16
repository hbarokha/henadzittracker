// Shared SVG icon set — outline style, 1.8px stroke, currentColor.
// Replaces emoji used in card/section header "icon" slots so the whole app
// draws from one coherent icon language (matching the tab + header-button SVGs).
// Content taxonomy emoji (meal categories, activity types, highlight tags) are
// intentionally left as color emoji — there they aid at-a-glance scanning.

import type { CSSProperties } from "react";

interface IconProps {
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

function base(className?: string) {
  return className ?? "w-[18px] h-[18px]";
}

function Svg({
  className, style, strokeWidth = 1.8, children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={base(className)}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/* ── Sleep ─────────────────────────────────────────────────────────────────── */
export function IconMoon(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
    </Svg>
  );
}

/* ── Body Battery ──────────────────────────────────────────────────────────── */
export function IconBattery(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2" y="7" width="16" height="10" rx="2.5" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 11v2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 9.5 8 12.5h3l-2.5 3" />
    </Svg>
  );
}

/* ── Stress (activity pulse) ───────────────────────────────────────────────── */
export function IconActivity(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </Svg>
  );
}

/* ── Blood pressure / heart rate (heart pulse) ─────────────────────────────── */
export function IconHeartPulse(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 0 1 12 5.5a5 5 0 0 1 7.5 7.1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12.5h3l1.5-2.5 2 4 1.5-2.5h2" />
    </Svg>
  );
}

/* ── Heart (heart rate) ────────────────────────────────────────────────────── */
export function IconHeart(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </Svg>
  );
}

/* ── Biological age (hourglass) ────────────────────────────────────────────── */
export function IconHourglass(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12M6 21h12M7 3v3.2a2 2 0 0 0 .59 1.42L12 12l4.41-4.38A2 2 0 0 0 17 6.2V3M7 21v-3.2a2 2 0 0 1 .59-1.42L12 12l4.41 4.38A2 2 0 0 1 17 17.8V21" />
    </Svg>
  );
}

/* ── Weight (scale dial) ───────────────────────────────────────────────────── */
export function IconScale(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="3.5" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9a5 5 0 0 1 8 0" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.5 13.5 7" />
    </Svg>
  );
}

/* ── Correlations / experiments (beaker) ───────────────────────────────────── */
export function IconBeaker(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6M10 3v6.2a2 2 0 0 1-.34 1.11l-4.32 6.4A2 2 0 0 0 7 20h10a2 2 0 0 0 1.66-3.11l-4.32-6.4A2 2 0 0 1 14 9.2V3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h9" />
    </Svg>
  );
}

/* ── Supplement (pill) ─────────────────────────────────────────────────────── */
export function IconPill(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 20.5 20.5 10.5a5 5 0 0 0-7-7L3.5 13.5a5 5 0 0 0 7 7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 8.5 7 7" />
    </Svg>
  );
}

/* ── Streak (flame) ────────────────────────────────────────────────────────── */
export function IconFlame(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.468 5.99 5.99 0 00-1.925 3.547 5.975 5.975 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </Svg>
  );
}

/* ── Garmin / energy (bolt) ────────────────────────────────────────────────── */
export function IconBolt(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </Svg>
  );
}

/* ── Training (target) ─────────────────────────────────────────────────────── */
export function IconTarget(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" />
    </Svg>
  );
}

/* ── Intensity (bar chart) ─────────────────────────────────────────────────── */
export function IconBars(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V14M10 20V6M16 20v-8M22 20V4" />
    </Svg>
  );
}

/* ── DNA (bio markers) ─────────────────────────────────────────────────────── */
export function IconDna(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3c0 5 10 6 10 11M17 3c0 5-10 6-10 11M7 21c0-4 10-5 10-9M17 21c0-4-10-5-10-9" />
      <path strokeLinecap="round" d="M8.5 6h7M8.5 18h7M7.5 9h9M7.5 15h9" />
    </Svg>
  );
}

/* ── Trending up (week) ────────────────────────────────────────────────────── */
export function IconTrendingUp(p: IconProps) {
  return (
    <Svg {...p}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 7h4v4" />
    </Svg>
  );
}

/* ── Calendar (month) ──────────────────────────────────────────────────────── */
export function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9.5h18M8 3v4M16 3v4" />
    </Svg>
  );
}
