// ChangeHistory — reusable per-record audit trail (who / when / what changed).
//
// Renders the field-level change log for one record. Backed by
// GET /api/history/{entityType}/{entityId} (see backend/routers/history.py).
// Shared across Test / Requirement / Defect detail views.
//
// Usage: <ChangeHistory entityType="test" entityId={test.id} />
function ChangeHistory({ entityType, entityId }) {
  const { t, lang } = useI18n();
  const relativeFormatter = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!entityId) return;
    setLoading(true);
    setError(null);
    TH_API.getRecordHistory(entityType, entityId)
      .then(data => { setRows(data); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [entityType, entityId]);

  function relativeTime(isoStr) {
    try {
      const diff = Date.now() - new Date(isoStr).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return t("workspace.history.justNow");
      if (mins < 60) return lang === "en" ? `${mins}m ago` : relativeFormatter.format(-mins, "minute");
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return lang === "en" ? `${hrs}h ago` : relativeFormatter.format(-hrs, "hour");
      return lang === "en" ? `${Math.floor(hrs / 24)}d ago` : relativeFormatter.format(-Math.floor(hrs / 24), "day");
    } catch { return ""; }
  }

  function absTime(isoStr) {
    try { return new Date(isoStr).toLocaleString(lang); } catch { return isoStr; }
  }

  function fmtVal(v) {
    if (v === null || v === undefined || v === "") return <span style={{opacity:0.4}}>—</span>;
    if (typeof v === "boolean") return v ? t("workspace.history.true") : t("workspace.history.false");
    if (Array.isArray(v)) return <ol>{v.map((step, i) => <li key={i}><div>{step.action}</div><div>{step.expected_result}</div></li>)}</ol>;
    return String(v);
  }

  const verb = { created: "created", updated: "updated", deleted: "deleted" };
  const dot = { created: "var(--pass, #22c55e)", updated: "var(--accent, #6366f1)", deleted: "var(--fail, #ef4444)" };

  if (loading) return <div style={{padding:"18px 22px", fontSize:12.5, opacity:0.6}}>{t("workspace.history.loading")}</div>;
  if (error) return <div style={{padding:"18px 22px", fontSize:12.5, color:"var(--fail)"}}>{t("workspace.history.error")}</div>;
  if (!rows.length) return <div style={{padding:"18px 22px", fontSize:12.5, opacity:0.6}}>{t("workspace.history.empty")}</div>;

  return (
    <div style={{padding:"18px 22px 32px"}}>
      <div style={{display:"flex", flexDirection:"column", gap:14}}>
        {rows.map(r => (
          <div key={r.id} style={{display:"flex", gap:12}}>
            <div style={{flexShrink:0, marginTop:5, width:8, height:8, borderRadius:"50%", background:dot[r.action] || "var(--accent)"}} />
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:12.5, lineHeight:1.5}}>
                <strong>{r.actor_name}</strong> {verb[r.action] ? t(`workspace.history.${verb[r.action]}`) : r.action} {t("workspace.history.record")}
                <span title={absTime(r.created_at)} style={{opacity:0.55, marginLeft:6}}>· {relativeTime(r.created_at)}</span>
              </div>
              {r.changes && r.changes.length > 0 && (
                <div style={{marginTop:6, display:"flex", flexDirection:"column", gap:4}}>
                  {r.changes.map((c, i) => (
                    <div key={i} style={{fontSize:12, display:"flex", flexWrap:"wrap", gap:6, alignItems:"baseline"}}>
                      <span style={{fontWeight:500, opacity:0.75, minWidth:90}}>{["author", "description", "prerequisites", "steps", "title", "folder_id", "project_id", "priority", "type", "status", "tags"].includes(c.field) ? t("editor." + c.field) : c.field}</span>
                      <span style={{textDecoration:"line-through", opacity:0.6}}>{fmtVal(c.old)}</span>
                      <span style={{opacity:0.5}}>→</span>
                      <span style={{color:"var(--accent, #6366f1)"}}>{fmtVal(c.new)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.ChangeHistory = ChangeHistory;
