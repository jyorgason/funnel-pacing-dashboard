/* PRODUCTION DASHBOARD — "Are we pacing to hit target?"
   Direction 1 (refined executive table) with an auto-drafted, human-editable
   executive summary. Edits persist per-period; reset reverts to the draft. */

// Build the auto-draft from live data. This is the rules-based first draft;
// the human can override it (and Reset restores this).
function draftSummary() {
  const ins = window.getInsights();
  const headline = `Pipeline is pacing behind plan — SAOs forecast to ${window.fmt.pct(ins.primaryAtt)} of target.`;
  const support = `Traffic (${window.fmt.pct(window.attainment(ins.byKey.visits))}) and website conversion are healthy. The shortfall is MQL volume — deepest in ${ins.worst.row.label} at ${window.fmt.pct(ins.worst.att)}, dragging the whole funnel down.`;
  return { headline, support, att: ins.primaryAtt };
}

function EditableSummary({ period }) {
  const draft = React.useMemo(draftSummary, []);
  const key = "pacing-summary:" + period;
  const hiddenKey = "pacing-summary-hidden:" + period;
  const hRef = React.useRef(null);
  const sRef = React.useRef(null);
  const [edited, setEdited] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  // hydrate from storage (or draft) once after mount
  React.useEffect(() => {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { saved = null; }
    if (hRef.current) hRef.current.innerText = (saved && saved.headline) || draft.headline;
    if (sRef.current) sRef.current.innerText = (saved && saved.support) || draft.support;
    setEdited(!!saved);
    setHidden(localStorage.getItem(hiddenKey) === "1");
  }, [key]);

  const save = () => {
    const data = { headline: hRef.current.innerText.trim(), support: sRef.current.innerText.trim(), ts: Date.now() };
    // treat as "edited" only if it actually differs from the auto-draft
    const isEdited = data.headline !== draft.headline || data.support !== draft.support;
    if (isEdited) { localStorage.setItem(key, JSON.stringify(data)); setEdited(true); }
    else { localStorage.removeItem(key); setEdited(false); }
  };
  const reset = () => {
    hRef.current.innerText = draft.headline;
    sRef.current.innerText = draft.support;
    localStorage.removeItem(key);
    setEdited(false);
  };
  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    if (next) localStorage.setItem(hiddenKey, "1"); else localStorage.removeItem(hiddenKey);
  };

  const s = window.statusFor(draft.att);
  const btnBase = { cursor: "pointer", border: "1px solid var(--gray-3)", background: "var(--white)", color: "var(--gray-7)", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: "var(--radius-full)", fontFamily: "var(--font-sans)" };

  return (
    <div
      className="es-callout"
      style={hidden
        ? { position: "relative", height: 8, borderRadius: "var(--radius-300)" }
        : { position: "relative", display: "flex", gap: 14, alignItems: "flex-start", background: "var(--gray-05)", border: "1px solid var(--gray-2)", borderRadius: "var(--radius-300)", padding: "16px 18px" }}
    >
      {/* content — hidden via display:none so refs stay mounted and text survives toggle */}
      <span style={{ display: hidden ? "none" : "inline-block", marginTop: 4, width: 12, height: 12, borderRadius: "50%", background: s.fill, flexShrink: 0 }} />
      <div style={{ display: hidden ? "none" : undefined, flex: 1, minWidth: 0, paddingRight: 150 }}>
        <div
          ref={hRef} className="es-edit" contentEditable suppressContentEditableWarning spellCheck={false}
          onInput={save} onBlur={save}
          style={{ fontSize: 17, fontWeight: 700, color: "var(--gray-9)", lineHeight: 1.3 }}
        />
        <div
          ref={sRef} className="es-edit" contentEditable suppressContentEditableWarning spellCheck={false}
          onInput={save} onBlur={save}
          style={{ fontSize: 14, color: "var(--gray-7)", marginTop: 4, lineHeight: 1.45 }}
        />
      </div>

      {/* hover-only controls — stays out of clean screenshots */}
      <div className="es-tools" style={{ position: "absolute", top: hidden ? -8 : 12, right: 14, display: "flex", alignItems: "center", gap: 10 }}>
        {!hidden && (
          <>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
              textTransform: "uppercase", padding: "3px 9px", borderRadius: "var(--radius-full)",
              background: edited ? "var(--primary-100)" : "var(--white)", color: edited ? "var(--primary-900)" : "var(--gray-5)",
              border: "1px solid " + (edited ? "var(--primary-300)" : "var(--gray-3)"),
            }}>
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M8.5 1.2 10.8 3.5 4 10.3 1.2 11l.7-2.8 6.6-7Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
              {edited ? "Edited" : "Auto-drafted · click to edit"}
            </span>
            {edited && <button onClick={reset} style={btnBase}>Reset to auto-draft</button>}
          </>
        )}
        <button onClick={toggleHidden} style={btnBase}>{hidden ? "Show summary" : "Hide"}</button>
      </div>
    </div>
  );
}

function PacingDashboard() {
  const cols = "minmax(230px,1.5fr) 110px 120px minmax(150px,1fr) 96px 96px";
  return (
    <window.BoardFrame
      kicker="Demand-gen funnel · pacing to target"
      title="Are we pacing to hit target?"
      takeaway={<EditableSummary period={window.REPORT.period} />}
    >
      <div style={{ marginTop: 4 }}>
        <window.TableHeaderRow cols={cols} />
        {window.REPORT.metrics.map((m) => {
          if (m.role === "conversion") return <window.ConversionRow key={m.key} m={m} cols={cols} />;
          return (
            <React.Fragment key={m.key}>
              <window.VolumeRow m={m} cols={cols} />
              {(m.children || []).map((c, i) => (
                <window.ChildRow key={c.key} m={c} cols={cols} last={i === m.children.length - 1} />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </window.BoardFrame>
  );
}

Object.assign(window, { PacingDashboard, EditableSummary, draftSummary });
