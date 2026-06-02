/* Board chrome shared by every direction so each artboard is a self-contained,
   slide-ready unit. Exports BoardFrame + insight helpers to window. */

// Pull the headline metrics for the narrative.
function getInsights() {
  const byKey = {};
  window.flatRows().forEach((r) => (byKey[r.key] = r));
  const primary = byKey[window.REPORT.primaryKey];
  const primaryAtt = window.attainment(primary);
  // worst-pacing leaf
  let worst = null;
  window.flatRows().forEach((r) => {
    if (r.children) return;
    const a = window.attainment(r);
    if (a == null) return;
    if (!worst || a < worst.att) worst = { row: r, att: a };
  });
  return { byKey, primary, primaryAtt, worst };
}

function HeadlineDot({ att }) {
  const s = window.statusFor(att);
  return <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.fill, display: "inline-block", flexShrink: 0 }} />;
}

function BoardFrame({ kicker, title, takeaway, children, accent }) {
  const r = window.REPORT;
  const elapsed = Math.round((r.dayOfMonth / r.daysInMonth) * 100);
  return (
    <div style={{
      background: "var(--white)", border: "1px solid var(--gray-2)", borderRadius: "var(--radius-400)",
      boxShadow: "var(--shadow-100)", padding: "32px 36px 28px", fontFamily: "var(--font-sans)",
      color: "var(--gray-9)", boxSizing: "border-box", width: "100%", height: "100%",
      display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: accent || "var(--primary-500)", marginBottom: 6 }}>
            {kicker}
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 27, fontWeight: 700, lineHeight: 1.1, color: "var(--gray-9)", letterSpacing: "-0.01em" }}>
            {title}
          </h2>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 600, color: "var(--gray-9)" }}>{r.period}</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: "var(--gray-6)", fontWeight: 500 }}>Day {r.dayOfMonth} of {r.daysInMonth}</span>
            <span style={{ width: 64, height: 5, background: "var(--gray-2)", borderRadius: 999, overflow: "hidden", display: "inline-block" }}>
              <span style={{ display: "block", height: "100%", width: elapsed + "%", background: "var(--gray-5)", borderRadius: 999 }} />
            </span>
          </div>
        </div>
      </div>

      {/* takeaway */}
      {takeaway && (
        <div style={{ marginTop: 18, marginBottom: 22, paddingBottom: 0 }}>{takeaway}</div>
      )}

      {/* body */}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>

      {/* footer legend */}
      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--gray-2)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20 }}>
        <window.RagLegend />
        <div style={{ fontSize: 12, color: "var(--gray-5)" }}>Attainment = Forecast ÷ Target</div>
      </div>
    </div>
  );
}

// A standard one-line takeaway block: status dot + bold headline + supporting line.
function Takeaway({ att, headline, support }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", background: "var(--gray-05)", border: "1px solid var(--gray-2)", borderRadius: "var(--radius-300)", padding: "16px 18px" }}>
      <span style={{ marginTop: 3 }}><HeadlineDot att={att} /></span>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--gray-9)", lineHeight: 1.3 }}>{headline}</div>
        <div style={{ fontSize: 14, color: "var(--gray-7)", marginTop: 3, lineHeight: 1.45 }}>{support}</div>
      </div>
    </div>
  );
}

Object.assign(window, { BoardFrame, Takeaway, getInsights, HeadlineDot });
