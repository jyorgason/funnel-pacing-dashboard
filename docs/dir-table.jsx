/* DIRECTION 1 — Refined executive table.
   Nested funnel, attainment as the colored anchor column, conversions shown
   as connector rows, M/M & Y/Y demoted to quiet trend context. */

// Small indicator shown when a value was overridden via the Pipeline Overrides sheet.
function OverrideMarker({ m }) {
  const ovr = (m._ovr || {}).forecast || {};
  const parts = [
    ovr.note && `"${ovr.note}"`,
    ovr.by   && `by ${ovr.by}`,
    ovr.at   && ovr.at,
  ].filter(Boolean);
  const tooltip = parts.length ? `Overridden · ${parts.join(" · ")}` : "Value overridden via Pipeline Overrides sheet";
  return (
    <span
      title={tooltip}
      style={{
        width: 7, height: 7, borderRadius: "50%",
        background: "var(--accent-poppy-yellow)",
        display: "inline-block", flexShrink: 0,
        cursor: "help", marginLeft: 5, verticalAlign: "middle",
      }}
    />
  );
}

function TableHeaderRow({ cols }) {
  const cell = (txt, align) => (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--gray-5)", textAlign: align }}>{txt}</div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 16, padding: "0 16px 10px", borderBottom: "1px solid var(--gray-3)" }}>
      {cell("Funnel stage", "left")}
      {cell("Target", "right")}
      {cell("Forecast", "right")}
      {cell("Attainment", "left")}
      {cell("M/M", "right")}
      {cell("Y/Y", "right")}
    </div>
  );
}

function VolumeRow({ m, cols }) {
  const att = window.attainment(m);
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 16, padding: "14px 16px", borderBottom: "1px solid var(--gray-2)" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600, color: "var(--gray-9)" }}>{m.label}</div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 15, color: "var(--gray-6)" }}>{window.fmt.targetValue(m)}</div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 17, fontWeight: 700, color: "var(--gray-9)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {window.fmt.value(m)}{m.overridden && <OverrideMarker m={m} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <window.AttainmentPill att={att} />
        <window.AttainmentBar att={att} height={6} />
      </div>
      <div style={{ textAlign: "right" }}><window.DeltaChip value={m.mom} /></div>
      <div style={{ textAlign: "right" }}><window.DeltaChip value={m.yoy} /></div>
    </div>
  );
}

function ChildRow({ m, cols, last }) {
  const att = window.attainment(m);
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 16, padding: "10px 16px", borderBottom: "1px solid var(--gray-2)", background: "color-mix(in srgb, var(--gray-05) 60%, #fff)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 8 }}>
        <span style={{ width: 14, height: 14, borderLeft: "1.5px solid var(--gray-3)", borderBottom: "1.5px solid var(--gray-3)", borderBottomLeftRadius: 4, marginTop: -8, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-7)" }}>{m.label}</span>
      </div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 14, color: "var(--gray-5)" }}>{window.fmt.targetValue(m)}</div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: "var(--gray-8)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {window.fmt.value(m)}{m.overridden && <OverrideMarker m={m} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <window.AttainmentPill att={att} />
        <div style={{ flex: 1 }}><window.AttainmentBar att={att} height={5} /></div>
      </div>
      <div style={{ textAlign: "right" }}><window.DeltaChip value={m.mom} /></div>
      <div style={{ textAlign: "right" }}><window.DeltaChip value={m.yoy} /></div>
    </div>
  );
}

function ConversionRow({ m, cols }) {
  const att = window.attainment(m);
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 16, padding: "9px 16px", borderBottom: "1px solid var(--gray-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--gray-5)", textTransform: "uppercase", border: "1px solid var(--gray-3)", borderRadius: "var(--radius-full)", padding: "2px 8px" }}>Rate</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-7)" }}>{m.label}</span>
      </div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 14, color: "var(--gray-5)" }}>{window.fmt.targetValue(m)}</div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, color: "var(--gray-8)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        {window.fmt.value(m)}{m.overridden && <OverrideMarker m={m} />}
      </div>
      <div><window.AttainmentPill att={att} /></div>
      <div style={{ textAlign: "right" }}><window.DeltaChip value={m.mom} /></div>
      <div style={{ textAlign: "right" }}><window.DeltaChip value={m.yoy} /></div>
    </div>
  );
}

function DirTable() {
  const cols = "minmax(230px,1.5fr) 110px 120px minmax(150px,1fr) 96px 96px";
  const ins = window.getInsights();
  const takeaway = (
    <window.Takeaway
      att={ins.primaryAtt}
      headline={`Pipeline is pacing behind plan — SAOs forecast to ${window.fmt.pct(ins.primaryAtt)} of target.`}
      support={`Traffic (98%) and website conversion are healthy. The shortfall is MQL volume — deepest in ${ins.worst.row.label} at ${window.fmt.pct(ins.worst.att)}, dragging the whole funnel down.`}
    />
  );
  return (
    <window.BoardFrame kicker="Demand-gen funnel · pacing to target" title="Are we pacing to hit target?" takeaway={takeaway}>
      <div style={{ marginTop: 4 }}>
        <TableHeaderRow cols={cols} />
        {window.REPORT.metrics.map((m) => {
          if (m.role === "conversion") return <ConversionRow key={m.key} m={m} cols={cols} />;
          return (
            <React.Fragment key={m.key}>
              <VolumeRow m={m} cols={cols} />
              {(m.children || []).map((c, i) => (
                <ChildRow key={c.key} m={c} cols={cols} last={i === m.children.length - 1} />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </window.BoardFrame>
  );
}

Object.assign(window, { DirTable, TableHeaderRow, VolumeRow, ChildRow, ConversionRow });
