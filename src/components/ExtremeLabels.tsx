// Selective direct labels for a series' extremes — marks the lowest/highest points
// in the visible window with a small mono value label (▲ high, ▼ low). Labels wear
// a text token rather than the series color, and any index the caller already
// labels itself (e.g. the amber "now" marker) is skipped to avoid collisions.
export interface ExtremePt { i: number; v: number }

export default function ExtremeLabels({
  pts, toX, toY, width, show = "both", format = (v: number) => String(v),
  skip = [], yMin = 8, yMax = Infinity,
}: {
  pts: ExtremePt[];
  toX: (i: number) => number;
  toY: (v: number) => number;
  /** viewBox width — labels near the edges switch anchor so they never overflow */
  width: number;
  show?: "both" | "max" | "min";
  format?: (v: number) => string;
  /** indices not to label (already labeled by the caller) */
  skip?: number[];
  yMin?: number;
  yMax?: number;
}) {
  if (pts.length < 3) return null;
  let min = pts[0], max = pts[0];
  for (const p of pts) {
    if (p.v < min.v) min = p;
    if (p.v > max.v) max = p;
  }
  if (min.v === max.v) return null; // flat series — nothing worth pointing at
  const skipSet = new Set(skip);
  const label = (p: ExtremePt, isMax: boolean) => {
    if (skipSet.has(p.i)) return null;
    const x = toX(p.i);
    const anchor = x < 34 ? "start" : x > width - 34 ? "end" : "middle";
    const y = Math.max(yMin, Math.min(yMax, isMax ? toY(p.v) - 6 : toY(p.v) + 13));
    return (
      <text key={isMax ? "max" : "min"} x={x} y={y} textAnchor={anchor}
        fontSize="9" fill="var(--text-muted)" fontFamily="var(--font-mono)">
        {isMax ? "▲" : "▼"}{format(p.v)}
      </text>
    );
  };
  return (
    <>
      {(show === "both" || show === "max") && label(max, true)}
      {(show === "both" || show === "min") && label(min, false)}
    </>
  );
}
