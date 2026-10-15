// Global defects view — list, filter, manage all defects

function Defects({ focusId }) {
  const { t, lang } = useI18n();
  const [defects, setDefects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(focusId || "");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editingDefect, setEditingDefect] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const deleteModal = useModal(() => setDeleteConfirmId(null), { open: !!deleteConfirmId });
  const [historyId, setHistoryId] = useState(null);
  const historyModal = useModal(() => setHistoryId(null), { open: !!historyId });
  const [runs, setRuns] = useState([]);
  const [cfDefs] = useCustomFieldDefs("defect");

  const load = () => {
    setLoading(true);
    TH_API.getDefects({ status: filterStatus, severity: filterSeverity, search })
      .then(data => { setDefects(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterStatus, filterSeverity]);

  // Opened from an activity link (BUG-…): pre-filter the list to that defect.
  useEffect(() => {
    if (!focusId) return;
    setSearch(focusId);
    setLoading(true);
    TH_API.getDefects({ status: filterStatus, severity: filterSeverity, search: focusId })
      .then(data => { setDefects(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [focusId]);

  useEffect(() => {
    TH_API.getRuns().then(setRuns).catch(() => {});
  }, []);

  const handleSearch = (e) => {
    if (e.key === "Enter") load();
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const updated = await TH_API.updateDefect(id, { status: newStatus });
      setDefects(prev => prev.map(d => d.id === id ? updated : d));
    } catch (e) {}
  };

  const handleDelete = async (id) => {
    try {
      await TH_API.deleteDefect(id);
      setDefects(prev => prev.filter(d => d.id !== id));
    } catch (e) {}
    setDeleteConfirmId(null);
  };

  const [pushingId, setPushingId] = useState(null);
  const [pushErr, setPushErr] = useState(null);
  const handlePush = async (id) => {
    setPushingId(id); setPushErr(null);
    try {
      const updated = await TH_API.pushDefectToJira(id);
      setDefects(prev => prev.map(d => d.id === id ? updated : d));
    } catch (e) { setPushErr({ id, msg: e.message }); }
    setPushingId(null);
  };

  const severityClass = s => s === "critical" || s === "high" ? "priority-high" : s === "med" ? "priority-med" : "priority-low";
  const statusColor = s => {
    if (s === "open") return "var(--fail)";
    if (s === "in_progress") return "var(--warn)";
    if (s === "resolved" || s === "closed") return "var(--pass)";
    return "var(--text-muted)";
  };

  const openCount = defects.filter(d => d.status === "open").length;
  const inProgressCount = defects.filter(d => d.status === "in_progress").length;
  const resolvedCount = defects.filter(d => d.status === "resolved" || d.status === "closed").length;

  return (
    <div style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div className="page-h" style={{padding:"18px 22px 0", marginBottom:14}}>
        <div>
          <h1 className="page-title">{t("execution.defects.title")}</h1>
          <div className="page-sub">{t("execution.defects.subtitle")}</div>
        </div>
        <div className="actions">
          <button className="btn accent" onClick={() => setShowCreate(true)}><Icon name="plus" /> {t("execution.defects.newDefect")}</button>
        </div>
      </div>

      {/* Summary chips */}
      <div style={{display:"flex", gap:8, padding:"0 22px 14px"}}>
        {[
          { labelKey: "open", count: openCount, color: "var(--fail)", status: "open" },
          { labelKey: "inProgress", count: inProgressCount, color: "var(--warn)", status: "in_progress" },
          { labelKey: "resolvedClosed", count: resolvedCount, color: "var(--pass)", status: "resolved" },
        ].map(c => (
          <button
            key={c.status}
            className={"btn sm" + (filterStatus === c.status ? " accent" : "")}
            style={{gap:6}}
            onClick={() => setFilterStatus(filterStatus === c.status ? "all" : c.status)}
          >
            <span style={{color:c.color, fontWeight:700}}>{c.count}</span>
            <span>{t(`execution.defects.${c.labelKey}`)}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex", gap:8, padding:"0 22px 10px", alignItems:"center"}}>
        <input
          className="input"
          style={{width:220}}
          placeholder={t("execution.defects.search")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearch}
        />
        <select className="input" style={{width:130}} value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
          <option value="all">{t("execution.defects.allSeverities")}</option>
          <option value="critical">{t("execution.defects.critical")}</option>
          <option value="high">{t("execution.defects.high")}</option>
          <option value="med">{t("execution.defects.medium")}</option>
          <option value="low">{t("execution.defects.low")}</option>
        </select>
        {(search || filterStatus !== "all" || filterSeverity !== "all") && (
          <button className="btn sm ghost" onClick={() => { setSearch(""); setFilterStatus("all"); setFilterSeverity("all"); }}>{t("execution.defects.clear")}</button>
        )}
        <div className="spacer" />
        <span className="mono dim" style={{fontSize:11}}>{t(defects.length === 1 ? "execution.defects.defectCountOne" : "execution.defects.defectCount", { count: defects.length })}</span>
      </div>

      {/* Table */}
      <div style={{flex:1, overflowY:"auto", padding:"0 22px 32px"}}>
        <div className="card" style={{padding:0}}>
          {loading ? (
            <div className="mono dim" style={{padding:"32px", textAlign:"center"}}>{t("execution.defects.loading")}</div>
          ) : defects.length === 0 ? (
            <div className="mono dim" style={{padding:"32px", textAlign:"center"}}>{t("execution.defects.noneFound")}</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{width:90}}>{t("execution.defects.id")}</th>
                  <th>{t("execution.defects.defectTitle")}</th>
                  <th style={{width:130}}>{t("execution.defects.status")}</th>
                  <th style={{width:90}}>{t("execution.defects.severity")}</th>
                  <th style={{width:90}}>{t("execution.defects.test")}</th>
                  <th style={{width:90}}>{t("execution.defects.run")}</th>
                  <th style={{width:110}}>{t("execution.defects.tracker")}</th>
                  <th style={{width:80}}>{t("execution.defects.filed")}</th>
                  <th style={{width:32}}></th>
                </tr>
              </thead>
              <tbody>
                {defects.map(d => (
                  <tr key={d.id} style={d.status === "closed" ? {opacity:0.5} : {}}>
                    <td className="mono" style={{fontSize:11.5}}>{d.id}</td>
                    <td>
                      <div style={{fontWeight:500}}>{d.title}</div>
                      {d.description && (
                        <div style={{fontSize:11, color:"var(--text-muted)", marginTop:2, lineHeight:1.4, maxWidth:480, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                          {d.description}
                        </div>
                      )}
                      {d.created_by && <div style={{fontSize:10.5, color:"var(--text-dim)", marginTop:2}}>{t("execution.defects.filedBy", { user: d.created_by })}</div>}
                      {cfDefs.length > 0 && d.custom_fields && Object.keys(d.custom_fields).length > 0 && (
                        <div style={{display:"flex", gap:4, flexWrap:"wrap", marginTop:3}}>
                          {cfDefs.filter(f => d.custom_fields[f.key] !== undefined && d.custom_fields[f.key] !== null && d.custom_fields[f.key] !== "").map(f => (
                            <span key={f.key} className="tag" style={{fontSize:10}}>
                              {f.label}: {f.field_type === "checkbox" ? (d.custom_fields[f.key] ? t("execution.defects.yes") : t("execution.defects.no")) : String(d.custom_fields[f.key])}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <select
                        className="input"
                        style={{fontSize:11, padding:"2px 6px", height:24, color:statusColor(d.status), background:"transparent", borderColor:"transparent", cursor:"pointer"}}
                        value={d.status}
                        onChange={e => handleStatusChange(d.id, e.target.value)}
                      >
                        <option value="open">{t("execution.overview.statusValueOpen")}</option>
                        <option value="in_progress">{t("execution.overview.statusValueInProgress")}</option>
                        <option value="resolved">{t("execution.overview.statusValueResolved")}</option>
                        <option value="closed">{t("execution.overview.statusValueClosed")}</option>
                      </select>
                    </td>
                    <td><span className={"tag " + severityClass(d.severity)}>{({ critical: "critical", high: "high", med: "med", low: "low" })[d.severity] ? t(`execution.defects.severityValue${({ critical: "Critical", high: "High", med: "Med", low: "Low" })[d.severity]}`) : d.severity}</span></td>
                    <td className="mono" style={{fontSize:11}}>{d.test_id || <span className="dim">—</span>}</td>
                    <td className="mono" style={{fontSize:11}}>{d.run_id || <span className="dim">—</span>}</td>
                    <td style={{fontSize:11}}>
                      {d.external_key ? (
                        <a href={d.external_url || "#"} target="_blank" rel="noreferrer" className="mono" style={{color:"var(--accent)", textDecoration:"none"}}>{d.external_key}</a>
                      ) : (
                        <>
                          <button className="btn ghost sm" style={{padding:"2px 6px"}} disabled={pushingId === d.id} onClick={() => handlePush(d.id)} title={t("execution.defects.createJira")}>
                            {pushingId === d.id ? t("execution.defects.pushing") : t("execution.defects.pushJira")}
                          </button>
                          {pushErr && pushErr.id === d.id && <div style={{fontSize:10, color:"var(--fail)", marginTop:2, maxWidth:100}}>{pushErr.msg}</div>}
                        </>
                      )}
                    </td>
                    <td className="dim" style={{fontSize:11}}>{d.created_at ? (lang === "ru" ? new Date(d.created_at).toLocaleDateString(lang) : d.created_at) : "—"}</td>
                    <td style={{whiteSpace:"nowrap"}}>
                      <button
                        className="btn ghost sm"
                        style={{padding:"2px 6px"}}
                        onClick={() => setEditingDefect(d)}
                        title={t("execution.defects.edit")}
                      ><Icon name="settings" /></button>
                      <button
                        className="btn ghost sm"
                        style={{padding:"2px 6px"}}
                        onClick={() => setHistoryId(d.id)}
                        title={t("execution.defects.changeHistory")}
                      ><Icon name="clock" /></button>
                      <button
                        className="btn ghost sm"
                        style={{color:"var(--fail)", padding:"2px 6px"}}
                        onClick={() => setDeleteConfirmId(d.id)}
                        title={t("execution.defects.delete")}
                      ><Icon name="x" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateDefectModal
          runs={runs}
          onClose={() => setShowCreate(false)}
          onCreated={(d) => { setDefects(prev => [d, ...prev]); setShowCreate(false); }}
        />
      )}

      {editingDefect && (
        <EditDefectModal
          defect={editingDefect}
          onClose={() => setEditingDefect(null)}
          onSaved={(d) => { setDefects(prev => prev.map(x => x.id === d.id ? d : x)); setEditingDefect(null); }}
        />
      )}

      {historyId && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...historyModal.overlayProps}>
          <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, width:520, maxHeight:"85vh", overflowY:"auto"}} {...historyModal.dialogProps}>
            <div style={{display:"flex", alignItems:"center", padding:"18px 22px 0"}}>
              <h2 style={{fontSize:15, fontWeight:600, margin:0}}>{t("execution.defects.changeHistory")} — {historyId}</h2>
              <div className="spacer" style={{flex:1}} />
              <button className="btn ghost sm" onClick={() => setHistoryId(null)} aria-label={t("execution.overview.close")} title={t("execution.overview.close")}><Icon name="x" /></button>
            </div>
            <ChangeHistory entityType="defect" entityId={historyId} />
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...deleteModal.overlayProps}>
          <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:360}} {...deleteModal.dialogProps}>
            <h2 style={{fontSize:15, fontWeight:600, margin:"0 0 10px"}}>{t("execution.defects.deleteConfirm", { id: deleteConfirmId })}</h2>
            <p style={{fontSize:12.5, color:"var(--text-muted)", margin:"0 0 20px"}}>{t("execution.defects.permanent")}</p>
            <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
              <button className="btn" onClick={() => setDeleteConfirmId(null)}>{t("execution.defects.cancel")}</button>
              <button className="btn" style={{background:"var(--fail)", color:"white", border:"none"}} onClick={() => handleDelete(deleteConfirmId)}>{t("execution.defects.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateDefectModal({ runs, onClose, onCreated }) {
  const { t } = useI18n();
  const modal = useModal(onClose);
  const [form, setForm] = useState({ title: "", severity: "med", run_id: "", test_id: "", description: "" });
  const [customFields, setCustomFields] = useState({});
  const [cfDefs] = useCustomFieldDefs("defect");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const d = await TH_API.createDefect({
        title: form.title.trim(),
        severity: form.severity,
        description: form.description.trim() || null,
        test_id: form.test_id.trim() || null,
        run_id: form.run_id || null,
        custom_fields: customFields,
      });
      onCreated(d);
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...modal.overlayProps}>
      <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:500}} {...modal.dialogProps}>
        <h2 style={{fontSize:15, fontWeight:600, margin:"0 0 16px"}}>{t("execution.defects.newDefectTitle")}</h2>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div>
            <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.defects.defectTitle")}</label>
            <input className="input" style={{width:"100%", boxSizing:"border-box"}} value={form.title} placeholder={t("execution.defects.describeBug")} onChange={e => setForm(f => ({...f, title: e.target.value}))} autoFocus />
          </div>
          <div>
            <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.defects.descriptionOptional")}</label>
            <textarea className="textarea" style={{width:"100%", boxSizing:"border-box", minHeight:60}} value={form.description} placeholder={t("execution.defects.reproRootCause")} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
            <div>
              <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.defects.severityLabel")}</label>
              <select className="input" value={form.severity} onChange={e => setForm(f => ({...f, severity: e.target.value}))}>
                <option value="critical">{t("execution.defects.critical")}</option>
                <option value="high">{t("execution.defects.high")}</option>
                <option value="med">{t("execution.defects.medium")}</option>
                <option value="low">{t("execution.defects.low")}</option>
              </select>
            </div>
            <div>
              <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.defects.linkedTestOptional")}</label>
              <input className="input" value={form.test_id} placeholder="TC-1045" onChange={e => setForm(f => ({...f, test_id: e.target.value}))} />
            </div>
          </div>
          <div>
            <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.defects.linkedRunOptional")}</label>
            <select className="input" value={form.run_id} onChange={e => setForm(f => ({...f, run_id: e.target.value}))}>
              <option value="">{t("execution.defects.none")}</option>
              {runs.map(r => <option key={r.id} value={r.id}>{r.id} · {r.name.slice(0,40)}</option>)}
            </select>
          </div>
          <CustomFieldsInputs defs={cfDefs} values={customFields} onChange={setCustomFields} />
        </div>
        {err && <div style={{color:"var(--fail)", fontSize:12, marginTop:10}}>{err}</div>}
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:20}}>
          <button className="btn" onClick={onClose}>{t("execution.defects.cancel")}</button>
          <button className="btn accent" onClick={handleCreate} disabled={saving || !form.title.trim()}>
            {saving ? t("execution.defects.creating") : t("execution.defects.create")}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditDefectModal({ defect, onClose, onSaved }) {
  const { t } = useI18n();
  const modal = useModal(onClose);
  const [form, setForm] = useState({
    title: defect.title || "",
    severity: defect.severity || "med",
    status: defect.status || "open",
    description: defect.description || "",
  });
  const [customFields, setCustomFields] = useState(defect.custom_fields || {});
  const [cfDefs] = useCustomFieldDefs("defect");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const d = await TH_API.updateDefect(defect.id, {
        title: form.title.trim(),
        severity: form.severity,
        status: form.status,
        description: form.description.trim() || null,
        custom_fields: customFields,
      });
      onSaved(d);
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  const L = { fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4 };

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...modal.overlayProps}>
      <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:500, maxHeight:"85vh", overflowY:"auto"}} {...modal.dialogProps}>
        <h2 style={{fontSize:15, fontWeight:600, margin:"0 0 16px"}}>{t("execution.defects.editTitle", { id: defect.id })}</h2>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div>
            <label style={L}>{t("execution.defects.defectTitle")}</label>
            <input className="input" style={{width:"100%", boxSizing:"border-box"}} value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} autoFocus />
          </div>
          <div>
            <label style={L}>{t("execution.defects.description")}</label>
            <textarea className="textarea" style={{width:"100%", boxSizing:"border-box", minHeight:60}} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
            <div>
              <label style={L}>{t("execution.defects.severityLabel")}</label>
              <select className="input" value={form.severity} onChange={e => setForm(f => ({...f, severity: e.target.value}))}>
                <option value="critical">{t("execution.defects.critical")}</option>
                <option value="high">{t("execution.defects.high")}</option>
                <option value="med">{t("execution.defects.medium")}</option>
                <option value="low">{t("execution.defects.low")}</option>
              </select>
            </div>
            <div>
              <label style={L}>{t("execution.defects.statusLabel")}</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                <option value="open">{t("execution.defects.statusOpen")}</option>
                <option value="in_progress">{t("execution.defects.statusInProgress")}</option>
                <option value="resolved">{t("execution.defects.statusResolved")}</option>
                <option value="closed">{t("execution.defects.statusClosed")}</option>
              </select>
            </div>
          </div>
          <CustomFieldsInputs defs={cfDefs} values={customFields} onChange={setCustomFields} />
        </div>
        {err && <div style={{color:"var(--fail)", fontSize:12, marginTop:10}}>{err}</div>}
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:20}}>
          <button className="btn" onClick={onClose}>{t("execution.defects.cancel")}</button>
          <button className="btn accent" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? t("execution.defects.saving") : t("execution.defects.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

window.Defects = Defects;
