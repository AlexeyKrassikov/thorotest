// Requirements view — features/stories/epics with test coverage

function CoverageBar({ coverage }) {
  const { t } = useI18n();
  const c = coverage || { linked: 0, passed: 0, failed: 0, untested: 0, pass_rate: 0 };
  if (!c.linked) {
    return <span className="mono dim" style={{fontSize:11}}>{t("cases.requirements.noTests")}</span>;
  }
  const pct = n => `${(n / c.linked) * 100}%`;
  return (
    <div style={{display:"flex", alignItems:"center", gap:8, minWidth:180}}>
      <div style={{flex:1, height:8, borderRadius:4, overflow:"hidden", display:"flex", background:"var(--bg-3)"}}>
        {c.passed > 0 && <div style={{width:pct(c.passed), background:"var(--pass)"}} />}
        {c.failed > 0 && <div style={{width:pct(c.failed), background:"var(--fail)"}} />}
        {c.untested > 0 && <div style={{width:pct(c.untested), background:"var(--text-dim)"}} />}
      </div>
      <span className="mono" style={{fontSize:11, color: c.failed ? "var(--fail)" : c.untested ? "var(--warn)" : "var(--pass)", minWidth:34, textAlign:"right"}}>
        {Math.round(c.pass_rate * 100)}%
      </span>
    </div>
  );
}

function Requirements({ currentUser }) {
  const { t } = useI18n();
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCovered, setFilterCovered] = useState("all");
  const [editing, setEditing] = useState(null); // requirement object or {} for new
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const deleteModal = useModal(() => setDeleteConfirmId(null), { open: !!deleteConfirmId });

  const canWrite = !currentUser || ["admin", "manager", "tester"].includes(currentUser.role);
  const canDelete = !currentUser || currentUser.role === "admin";

  const load = () => {
    setLoading(true);
    TH_API.getRequirements({ status: filterStatus, type: filterType, covered: filterCovered, search })
      .then(data => { setRequirements(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filterStatus, filterType, filterCovered]);

  const handleSearch = (e) => { if (e.key === "Enter") load(); };

  const handleDelete = async (id) => {
    try {
      await TH_API.deleteRequirement(id);
      setRequirements(prev => prev.filter(r => r.id !== id));
    } catch (e) {}
    setDeleteConfirmId(null);
  };

  const onSaved = (r, isNew) => {
    setRequirements(prev => isNew ? [r, ...prev] : prev.map(x => x.id === r.id ? r : x));
    setEditing(null);
  };

  const total = requirements.length;
  const uncovered = requirements.filter(r => r.coverage.linked === 0).length;
  const atRisk = requirements.filter(r => r.coverage.failed > 0).length;

  const typeTag = t => t === "epic" ? "priority-high" : t === "story" ? "priority-med" : "priority-low";
  const statusColor = s => {
    if (s === "active") return "var(--pass)";
    if (s === "draft") return "var(--warn)";
    if (s === "deprecated") return "var(--text-dim)";
    return "var(--text-muted)";
  };

  return (
    <div style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div className="page-h" style={{padding:"18px 22px 0", marginBottom:14}}>
        <div>
          <h1 className="page-title">{t("cases.requirements.title")}</h1>
          <div className="page-sub">{t("cases.requirements.subtitle")}</div>
        </div>
        {canWrite && (
          <div className="actions">
            <button className="btn accent" onClick={() => setEditing({})}><Icon name="plus" /> {t("cases.requirements.newRequirement")}</button>
          </div>
        )}
      </div>

      {/* Summary chips */}
      <div style={{display:"flex", gap:8, padding:"0 22px 14px"}}>
        {[
          { label: t("cases.requirements.total"), count: total, color: "var(--text)", covered: "all" },
          { label: t("cases.requirements.uncovered"), count: uncovered, color: "var(--warn)", covered: "false" },
          { label: t("cases.requirements.atRisk"), count: atRisk, color: "var(--fail)", covered: "all", risk: true },
        ].map(c => (
          <button
            key={c.label}
            className={"btn sm" + (filterCovered === c.covered && !c.risk && c.covered !== "all" ? " accent" : "")}
            style={{gap:6}}
            onClick={() => { if (!c.risk) setFilterCovered(filterCovered === c.covered ? "all" : c.covered); }}
          >
            <span style={{color:c.color, fontWeight:700}}>{c.count}</span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{display:"flex", gap:8, padding:"0 22px 10px", alignItems:"center"}}>
        <input className="input" style={{width:220}} placeholder={t("cases.requirements.search")} value={search} onChange={e => setSearch(e.target.value)} onKeyDown={handleSearch} />
        <select className="input" style={{width:120}} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">{t("cases.requirements.allTypes")}</option>
          <option value="epic">{t("cases.requirements.epic")}</option>
          <option value="story">{t("cases.requirements.story")}</option>
          <option value="feature">{t("cases.requirements.feature")}</option>
        </select>
        <select className="input" style={{width:120}} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">{t("cases.requirements.allStatuses")}</option>
          <option value="active">{t("cases.requirements.active")}</option>
          <option value="draft">{t("cases.requirements.draft")}</option>
          <option value="done">{t("cases.requirements.done")}</option>
          <option value="deprecated">{t("cases.requirements.deprecated")}</option>
        </select>
        <select className="input" style={{width:130}} value={filterCovered} onChange={e => setFilterCovered(e.target.value)}>
          <option value="all">{t("cases.requirements.anyCoverage")}</option>
          <option value="true">{t("cases.requirements.covered")}</option>
          <option value="false">{t("cases.requirements.uncovered")}</option>
        </select>
        {(search || filterType !== "all" || filterStatus !== "all" || filterCovered !== "all") && (
          <button className="btn sm ghost" onClick={() => { setSearch(""); setFilterType("all"); setFilterStatus("all"); setFilterCovered("all"); }}>{t("cases.requirements.clear")}</button>
        )}
        <div className="spacer" />
        <span className="mono dim" style={{fontSize:11}}>{t(requirements.length === 1 ? "cases.requirements.requirementCountOne" : "cases.requirements.requirementCount", { count: requirements.length })}</span>
      </div>

      {/* Table */}
      <div style={{flex:1, overflowY:"auto", padding:"0 22px 32px"}}>
        <div className="card" style={{padding:0}}>
          {loading ? (
            <div className="mono dim" style={{padding:"32px", textAlign:"center"}}>{t("cases.requirements.loading")}</div>
          ) : requirements.length === 0 ? (
            <div className="mono dim" style={{padding:"32px", textAlign:"center"}}>{t("cases.requirements.empty")}</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th style={{width:90}}>{t("cases.requirements.id")}</th>
                  <th>{t("cases.requirements.titleLabel")}</th>
                  <th style={{width:80}}>{t("cases.requirements.type")}</th>
                  <th style={{width:90}}>{t("cases.requirements.status")}</th>
                  <th style={{width:200}}>{t("cases.requirements.coverage")}</th>
                  <th style={{width:70}}>{t("cases.requirements.tests")}</th>
                  <th style={{width:64}}></th>
                </tr>
              </thead>
              <tbody>
                {requirements.map(r => (
                  <tr key={r.id} style={r.status === "deprecated" ? {opacity:0.5} : {}}>
                    <td className="mono" style={{fontSize:11.5}}>
                      {r.id}
                      {r.external_key && (
                        <a href={r.external_url || "#"} target="_blank" rel="noreferrer" title={t("cases.requirements.viewTracker")} style={{display:"block", fontSize:10, color:"var(--accent)", textDecoration:"none"}}>
                          {r.external_key}
                        </a>
                      )}
                    </td>
                    <td>
                      <div style={{fontWeight:500}}>{r.title}</div>
                      {r.description && (
                        <div style={{fontSize:11, color:"var(--text-muted)", marginTop:2, lineHeight:1.4, maxWidth:480, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{r.description}</div>
                      )}
                      {r.owner && <div style={{fontSize:10.5, color:"var(--text-dim)", marginTop:2}}>{t("cases.requirements.owner")} {r.owner}</div>}
                    </td>
                    <td><span className={"tag " + typeTag(r.type)}>{t(`cases.requirements.${r.type}Value`)}</span></td>
                    <td><span style={{fontSize:11.5, color:statusColor(r.status)}}>{t(`cases.requirements.${r.status}Value`)}</span></td>
                    <td><CoverageBar coverage={r.coverage} /></td>
                    <td className="mono dim" style={{fontSize:11}}>{r.coverage.linked}</td>
                    <td>
                      <div style={{display:"flex", gap:2}}>
                        {canWrite && <button className="btn ghost sm" style={{padding:"2px 6px"}} onClick={() => setEditing(r)} title={t("cases.requirements.edit")}><Icon name="settings" /></button>}
                        {canDelete && <button className="btn ghost sm" style={{color:"var(--fail)", padding:"2px 6px"}} onClick={() => setDeleteConfirmId(r.id)} title={t("cases.requirements.delete")}><Icon name="x" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <RequirementModal
          requirement={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {deleteConfirmId && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...deleteModal.overlayProps}>
          <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:360}} {...deleteModal.dialogProps}>
            <h2 style={{fontSize:15, fontWeight:600, margin:"0 0 10px"}}>{t("cases.requirements.deleteTitle", { id: deleteConfirmId })}</h2>
            <p style={{fontSize:12.5, color:"var(--text-muted)", margin:"0 0 20px"}}>{t("cases.requirements.deleteBody")}</p>
            <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
              <button className="btn" onClick={() => setDeleteConfirmId(null)}>{t("cases.requirements.cancel")}</button>
              <button className="btn" style={{background:"var(--fail)", color:"white", border:"none"}} onClick={() => handleDelete(deleteConfirmId)}>{t("cases.requirements.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TestPicker({ selected, onChange }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  const runSearch = async (q) => {
    if (!q.trim()) { setResults([]); return; }
    try {
      const data = await TH_API.listTests({ search: q, limit: 20 });
      setResults(data);
    } catch (e) { setResults([]); }
  };

  const add = (id) => { if (!selected.includes(id)) onChange([...selected, id]); setQuery(""); setResults([]); setOpen(false); };
  const remove = (id) => onChange(selected.filter(x => x !== id));

  return (
    <div>
      <div style={{display:"flex", flexWrap:"wrap", gap:6, marginBottom:6}}>
        {selected.map(id => (
          <span key={id} className="tag" style={{display:"inline-flex", alignItems:"center", gap:4}}>
            <span className="mono" style={{fontSize:11}}>{id}</span>
            <button className="btn ghost sm" style={{padding:0, width:16, height:16, lineHeight:1}} onClick={() => remove(id)} title={t("cases.requirements.unlink")}><Icon name="x" /></button>
          </span>
        ))}
        {selected.length === 0 && <span className="mono dim" style={{fontSize:11}}>{t("cases.requirements.noTestsLinked")}</span>}
      </div>
      <div style={{position:"relative"}}>
        <input
          className="input"
          style={{width:"100%", boxSizing:"border-box"}}
          placeholder={t("cases.requirements.searchTests")}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); runSearch(e.target.value); }}
          onFocus={() => setOpen(true)}
        />
        {open && results.length > 0 && (
          <div style={{position:"absolute", top:"100%", left:0, right:0, zIndex:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:6, marginTop:2, maxHeight:200, overflowY:"auto"}}>
            {results.map(t => (
              <div key={t.id} className="nav-item" style={{padding:"6px 10px", cursor:"pointer", display:"flex", gap:8, alignItems:"center"}} {...clickable(() => add(t.id))}>
                <span className="mono" style={{fontSize:11, color:"var(--text-dim)"}}>{t.id}</span>
                <span style={{fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{t.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RequirementModal({ requirement, onClose, onSaved }) {
  const { t } = useI18n();
  const modal = useModal(onClose);
  const isNew = !requirement;
  const [form, setForm] = useState({
    title: requirement?.title || "",
    type: requirement?.type || "feature",
    status: requirement?.status || "active",
    priority: requirement?.priority || "med",
    owner: requirement?.owner || "",
    description: requirement?.description || "",
    test_ids: requirement?.test_ids || [],
  });
  const [customFields, setCustomFields] = useState(requirement?.custom_fields || {});
  const [cfDefs] = useCustomFieldDefs("requirement");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        title: form.title.trim(),
        type: form.type,
        status: form.status,
        priority: form.priority,
        owner: form.owner.trim() || null,
        description: form.description.trim() || null,
        test_ids: form.test_ids,
        custom_fields: customFields,
      };
      const r = isNew
        ? await TH_API.createRequirement(payload)
        : await TH_API.updateRequirement(requirement.id, payload);
      onSaved(r, isNew);
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  const L = { fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4 };

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...modal.overlayProps}>
      <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:520, maxHeight:"85vh", overflowY:"auto"}} {...modal.dialogProps}>
        <h2 style={{fontSize:15, fontWeight:600, margin:"0 0 16px"}}>{isNew ? t("cases.requirements.newTitle") : t("cases.requirements.editTitle", { id: requirement.id })}</h2>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div>
            <label style={L}>{t("cases.requirements.titleLabel")}</label>
            <input className="input" style={{width:"100%", boxSizing:"border-box"}} value={form.title} placeholder={t("cases.requirements.titlePlaceholder")} onChange={e => setForm(f => ({...f, title: e.target.value}))} autoFocus />
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10}}>
            <div>
              <label style={L}>{t("cases.requirements.type")}</label>
              <select className="input" value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                <option value="epic">{t("cases.requirements.epic")}</option>
                <option value="story">{t("cases.requirements.story")}</option>
                <option value="feature">{t("cases.requirements.feature")}</option>
              </select>
            </div>
            <div>
              <label style={L}>{t("cases.requirements.status")}</label>
              <select className="input" value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                <option value="active">{t("cases.requirements.active")}</option>
                <option value="draft">{t("cases.requirements.draft")}</option>
                <option value="done">{t("cases.requirements.done")}</option>
                <option value="deprecated">{t("cases.requirements.deprecated")}</option>
              </select>
            </div>
            <div>
              <label style={L}>{t("cases.library.priority")}</label>
              <select className="input" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                <option value="critical">{t("cases.requirements.critical")}</option>
                <option value="high">{t("cases.requirements.high")}</option>
                <option value="med">{t("cases.requirements.medium")}</option>
                <option value="low">{t("cases.requirements.low")}</option>
              </select>
            </div>
          </div>
          <div>
            <label style={L}>{t("cases.requirements.ownerOptional")}</label>
            <input className="input" style={{width:"100%", boxSizing:"border-box"}} value={form.owner} placeholder={t("cases.library.emailPlaceholder")} onChange={e => setForm(f => ({...f, owner: e.target.value}))} />
          </div>
          <div>
            <label style={L}>{t("cases.requirements.descriptionOptional")}</label>
            <textarea className="textarea" style={{width:"100%", boxSizing:"border-box", minHeight:60}} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <CustomFieldsInputs defs={cfDefs} values={customFields} onChange={setCustomFields} />
          <div>
            <label style={L}>{t("cases.requirements.linkedTests")}</label>
            <TestPicker selected={form.test_ids} onChange={ids => setForm(f => ({...f, test_ids: ids}))} />
          </div>
        </div>
        {err && <div style={{color:"var(--fail)", fontSize:12, marginTop:10}}>{err}</div>}
        {!isNew && (
          <div style={{marginTop:18, borderTop:"1px solid var(--border)", paddingTop:6}}>
            <label style={L}>{t("cases.requirements.changeHistory")}</label>
            <div style={{marginLeft:-22, marginRight:-22}}>
              <ChangeHistory entityType="requirement" entityId={requirement.id} />
            </div>
          </div>
        )}
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:20}}>
          <button className="btn" onClick={onClose}>{t("cases.requirements.cancel")}</button>
          <button className="btn accent" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? t("cases.requirements.saving") : (isNew ? t("cases.requirements.create") : t("cases.requirements.save"))}
          </button>
        </div>
      </div>
    </div>
  );
}

window.Requirements = Requirements;
window.CoverageBar = CoverageBar;
