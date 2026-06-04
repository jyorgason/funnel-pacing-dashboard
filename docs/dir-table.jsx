/* DIRECTION 1 — Refined executive table.
   Nested funnel, attainment as the colored anchor column, conversions shown
   as connector rows, M/M & Y/Y update live from editable target / forecast. */

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

// Reads/writes localStorage overrides for a single metric's target + forecast.
// Returns current values, setters, and overridden flags.
function useMetricOverride(key, autoForecast, autoTarget) {
  const storageKey = "cell-override:" + window.REPORT.period + ":" + key;
  const [forecast, setForecastState] = React.useState(autoForecast);
  const [target,   setTargetState]   = React.useState(autoTarget);

  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved) {
        if (saved.forecast != null) setForecastState(saved.forecast);
        if (saved.target   != null) setTargetState(saved.target);
      }
    } catch(e) {}
  }, [storageKey]);

  const persist = (f, t) => {
    if (f === autoForecast && t === autoTarget) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify({ forecast: f, target: t }));
  };

  const setForecast    = (v) => { setForecastState(v); persist(v, target); };
  const setTarget      = (v) => { setTargetState(v);   persist(forecast, v); };
  const revertForecast = () => { setForecastState(autoForecast); persist(autoForecast, target); };
  const revertTarget   = () => { setTargetState(autoTarget);     persist(forecast, autoTarget); };

  return {
    forecast, target, setForecast, setTarget, revertForecast, revertTarget,
    forecastOverridden: forecast !== autoForecast,
    targetOverridden:   target   !== autoTarget,
  };
}

// Inline editable numeric cell.
// Hover shows cursor:text affordance; click opens an input.
// Blue dot next to value when overridden from auto; click dot to revert.
function EditableCell({ value, kind, autoValue, onCommit, onRevert, fontSize, fontWeight, color }) {
  const [active, setActive] = React.useState(false);

  const rawStr = kind === "rate" ? value.toFixed(2) : String(Math.round(value));

  const commit = (el) => {
    const v = parseFloat((el.value || "").replace(/[,%\s]/g, ""));
    if (!isNaN(v) && v >= 0) onCommit(v);
    setActive(false);
  };

  if (active) {
    return (
      <input
        autoFocus
        defaultValue={rawStr}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target)}
        onKeyDown={(e) => {
          if (e.key === "Enter")  { e.preventDefault(); commit(e.target); }
          if (e.key === "Escape") setActive(false);
        }}
        style={{
          width: "100%", textAlign: "right", border: "none",
          outline: "2px solid var(--primary-300)", borderRadius: 4,
          padding: "1px 4px", background: "var(--white)",
          fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums",
          fontSize: fontSize || 15, fontWeight: fontWeight || 400,
          color: color || "var(--gray-9)",
        }}
      />
    );
  }

  const isOverridden = value !== autoValue;
  const formatted = kind === "rate" ? window.fmt.rate(value) : window.fmt.count(value);

  return (
    <span
      className="cell-editable"
      onClick={() => setActive(true)}
      title="Click to edit"
      style={{ cursor: "text", display: "inline-flex", alignItems: "center", gap: 3,
               fontSize, fontWeight, color }}
    >
      {formatted}
      <span
        className="cell-revert"
        title={isOverridden ? "Revert to auto" : ""}
        onClick={isOverridden ? (e) => { e.stopPropagation(); onRevert(); } : (e) => e.stopPropagation()}
        style={{
          fontSize: 12, lineHeight: 1, userSelect: "none",
          color: isOverridden ? "var(--primary-500)" : "var(--gray-3)",
          cursor: isOverridden ? "pointer" : "default",
        }}
      >↺</span>
    </span>
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
  const ovr = useMetricOverride(m.key, m.forecast, m.target);
  const att = window.attainment({ forecast: ovr.forecast, target: ovr.target });
  const mom = m.prior_month ? (ovr.forecast - m.prior_month) / m.prior_month * 100 : null;
  const yoy = m.prior_year  ? (ovr.forecast - m.prior_year)  / m.prior_year  * 100 : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 16, padding: "14px 16px", borderBottom: "1px solid var(--gray-2)" }}>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 600, color: "var(--gray-9)" }}>{m.label}</div>
      <div style={{ textAlign: "right" }}>
        <EditableCell value={ovr.target} kind={m.kind} autoValue={m.target}
          onCommit={ovr.setTarget} onRevert={ovr.revertTarget}
          fontSize={15} fontWeight={400} color="var(--gray-6)" />
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <EditableCell value={ovr.forecast} kind={m.kind} autoValue={m.forecast}
          onCommit={ovr.setForecast} onRevert={ovr.revertForecast}
          fontSize={17} fontWeight={700} color="var(--gray-9)" />
        {m.overridden && <OverrideMarker m={m} />}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <window.AttainmentPill att={att} />
        <window.AttainmentBar att={att} height={6} />
      </div>
      <div style={{ textAlign: "right" }}>{mom != null ? <window.DeltaChip value={mom} /> : <span style={{ color: "var(--gray-4)", fontSize: 13 }}>—</span>}</div>
      <div style={{ textAlign: "right" }}>{yoy != null ? <window.DeltaChip value={yoy} /> : <span style={{ color: "var(--gray-4)", fontSize: 13 }}>—</span>}</div>
    </div>
  );
}

function ChildRow({ m, cols, last }) {
  const ovr = useMetricOverride(m.key, m.forecast, m.target);
  const att = window.attainment({ forecast: ovr.forecast, target: ovr.target });
  const mom = m.prior_month ? (ovr.forecast - m.prior_month) / m.prior_month * 100 : null;
  const yoy = m.prior_year  ? (ovr.forecast - m.prior_year)  / m.prior_year  * 100 : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 16, padding: "10px 16px", borderBottom: "1px solid var(--gray-2)", background: "color-mix(in srgb, var(--gray-05) 60%, #fff)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingLeft: 8 }}>
        <span style={{ width: 14, height: 14, borderLeft: "1.5px solid var(--gray-3)", borderBottom: "1.5px solid var(--gray-3)", borderBottomLeftRadius: 4, marginTop: -8, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--gray-7)" }}>{m.label}</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <EditableCell value={ovr.target} kind={m.kind} autoValue={m.target}
          onCommit={ovr.setTarget} onRevert={ovr.revertTarget}
          fontSize={14} fontWeight={400} color="var(--gray-5)" />
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <EditableCell value={ovr.forecast} kind={m.kind} autoValue={m.forecast}
          onCommit={ovr.setForecast} onRevert={ovr.revertForecast}
          fontSize={15} fontWeight={600} color="var(--gray-8)" />
        {m.overridden && <OverrideMarker m={m} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <window.AttainmentPill att={att} />
        <div style={{ flex: 1 }}><window.AttainmentBar att={att} height={5} /></div>
      </div>
      <div style={{ textAlign: "right" }}>{mom != null ? <window.DeltaChip value={mom} /> : <span style={{ color: "var(--gray-4)", fontSize: 13 }}>—</span>}</div>
      <div style={{ textAlign: "right" }}>{yoy != null ? <window.DeltaChip value={yoy} /> : <span style={{ color: "var(--gray-4)", fontSize: 13 }}>—</span>}</div>
    </div>
  );
}

function ConversionRow({ m, cols }) {
  const ovr = useMetricOverride(m.key, m.forecast, m.target);
  const att = window.attainment({ forecast: ovr.forecast, target: ovr.target });
  const mom = m.prior_month ? (ovr.forecast - m.prior_month) / m.prior_month * 100 : null;
  const yoy = m.prior_year  ? (ovr.forecast - m.prior_year)  / m.prior_year  * 100 : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, alignItems: "center", gap: 16, padding: "9px 16px", borderBottom: "1px solid var(--gray-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--gray-5)", textTransform: "uppercase", border: "1px solid var(--gray-3)", borderRadius: "var(--radius-full)", padding: "2px 8px" }}>Rate</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--gray-7)" }}>{m.label}</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <EditableCell value={ovr.target} kind={m.kind} autoValue={m.target}
          onCommit={ovr.setTarget} onRevert={ovr.revertTarget}
          fontSize={14} fontWeight={400} color="var(--gray-5)" />
      </div>
      <div style={{ textAlign: "right", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <EditableCell value={ovr.forecast} kind={m.kind} autoValue={m.forecast}
          onCommit={ovr.setForecast} onRevert={ovr.revertForecast}
          fontSize={15} fontWeight={600} color="var(--gray-8)" />
        {m.overridden && <OverrideMarker m={m} />}
      </div>
      <div><window.AttainmentPill att={att} /></div>
      <div style={{ textAlign: "right" }}>{mom != null ? <window.DeltaChip value={mom} /> : <span style={{ color: "var(--gray-4)", fontSize: 13 }}>—</span>}</div>
      <div style={{ textAlign: "right" }}>{yoy != null ? <window.DeltaChip value={yoy} /> : <span style={{ color: "var(--gray-4)", fontSize: 13 }}>—</span>}</div>
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
