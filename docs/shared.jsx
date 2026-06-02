/* Shared primitives for all four directions. Exported to window. */

// Tiny up/down/flat triangle
function TrendArrow({ dir, color, size = 8 }) {
  if (dir === 0) {
    return <span style={{ display: "inline-block", width: size, height: 2, background: color, borderRadius: 2 }} />;
  }
  const up = dir > 0;
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" style={{ display: "block" }}>
      <path d={up ? "M5 1 L9 8 L1 8 Z" : "M5 9 L9 2 L1 2 Z"} fill={color} />
    </svg>
  );
}

// Muted change chip for M/M and Y/Y — kept low-key so attainment RAG stays the hero.
function DeltaChip({ value, align = "flex-end" }) {
  const dir = value > 0 ? 1 : value < 0 ? -1 : 0;
  const color = dir > 0 ? "var(--success-dark)" : dir < 0 ? "var(--error-dark)" : "var(--gray-5)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: align, gap: 5, minWidth: 56 }}>
      <TrendArrow dir={dir} color={color} />
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 13, color: "var(--gray-8)" }}>
        {window.fmt.delta(value)}
      </span>
    </span>
  );
}

// Solid status dot
function StatusDot({ status, size = 10 }) {
  return <span style={{ width: size, height: size, borderRadius: "50%", background: status.fill, flexShrink: 0, display: "inline-block" }} />;
}

// Attainment pill — number + colored ground, the core RAG signal
function AttainmentPill({ att, size = "md" }) {
  const s = window.statusFor(att);
  const pad = size === "lg" ? "6px 14px" : "3px 10px";
  const fs = size === "lg" ? 18 : 14;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: pad, borderRadius: "var(--radius-full)",
      background: s.tint, color: s.text, fontWeight: 700, fontSize: fs, fontVariantNumeric: "tabular-nums",
      lineHeight: 1, whiteSpace: "nowrap",
    }}>
      <StatusDot status={s} size={size === "lg" ? 9 : 7} />
      {att == null ? "—" : window.fmt.pct(att)}
    </span>
  );
}

// Horizontal attainment bar: forecast fill vs 100% target track, capped visual at 100
function AttainmentBar({ att, height = 8, showTarget = true }) {
  const s = window.statusFor(att);
  const w = Math.max(0, Math.min(att, 100));
  return (
    <div style={{ position: "relative", width: "100%", height, background: "var(--gray-2)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, width: w + "%", background: s.bar, borderRadius: "var(--radius-full)", transition: "width .6s cubic-bezier(.2,.7,.3,1)" }} />
    </div>
  );
}

// RAG legend used in the brief
function RagLegend({ compact }) {
  const items = [
    { s: window.STATUS.green,  t: "On / above target", r: "≥ 100%" },
    { s: window.STATUS.yellow, t: "Slightly behind",   r: "90–99%" },
    { s: window.STATUS.red,    t: "Behind",            r: "< 90%" },
  ];
  return (
    <div style={{ display: "flex", gap: compact ? 16 : 24, alignItems: "center", flexWrap: "wrap" }}>
      {items.map((it) => (
        <span key={it.r} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <StatusDot status={it.s} size={10} />
          <span style={{ fontSize: 13, color: "var(--gray-7)" }}>
            <b style={{ color: "var(--gray-8)", fontWeight: 600 }}>{it.r}</b>{compact ? "" : " · " + it.t}
          </span>
        </span>
      ))}
    </div>
  );
}

// Section eyebrow label
function Eyebrow({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--gray-5)" }}>
      {children}
    </div>
  );
}

Object.assign(window, { TrendArrow, DeltaChip, StatusDot, AttainmentPill, AttainmentBar, RagLegend, Eyebrow });
