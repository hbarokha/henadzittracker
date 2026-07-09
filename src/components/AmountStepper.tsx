"use client";

interface Props {
  amount: number;
  unit: "g" | "ml";
  onChange: (v: number) => void;
  accentColor?: string;
  step?: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Compact grams / ml amount editor: [−] [ 150 g ] [+]. Type an exact value or step. */
export default function AmountStepper({
  amount,
  unit,
  onChange,
  accentColor = "var(--amber)",
  step = 10,
}: Props) {
  const btn = "w-6 h-6 rounded flex items-center justify-center text-sm font-bold shrink-0 transition-all";
  const btnStyle = {
    background: "var(--bg-raised)",
    color: "var(--text-muted)",
    border: "1px solid var(--border-mid)",
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, round(amount - step)))}
        className={btn}
        style={btnStyle}
      >
        −
      </button>
      <div
        className="flex items-center rounded overflow-hidden"
        style={{ background: "var(--bg-raised)", border: "1px solid var(--border-mid)" }}
      >
        <input
          type="number"
          inputMode="decimal"
          min={1}
          value={amount}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange(isNaN(v) || v < 1 ? 1 : round(v));
          }}
          className="w-11 text-center bg-transparent text-xs font-semibold focus:outline-none tabular"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}
          onFocus={(e) => { e.target.select(); e.currentTarget.parentElement!.style.borderColor = accentColor; }}
          onBlur={(e) => (e.currentTarget.parentElement!.style.borderColor = "var(--border-mid)")}
        />
        <span
          className="pr-1.5 text-[10px] select-none"
          style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}
        >
          {unit}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(round(amount + step))}
        className={btn}
        style={btnStyle}
      >
        +
      </button>
    </div>
  );
}
