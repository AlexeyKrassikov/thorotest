function CaseEditor({ test, currentUser, onTestPatch }) {
  const { t } = useI18n();
  const fields = ["title", "author", "description", "prerequisites", "priority", "type", "status", "folder_id", "tags", "custom_fields"];
  const [customDefs] = useCustomFieldDefs("test");
  const [draft, setDraft] = React.useState(test);
  const [tagsText, setTagsText] = React.useState((test.tags || []).join(", "));
  const [steps, setSteps] = React.useState([]);
  const [folders, setFolders] = React.useState([]);
  const [selected, setSelected] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [conflict, setConflict] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const list = React.useRef(null);
  const baseline = React.useRef(test);
  const baseSteps = React.useRef([]);
  const live = React.useRef({ draft, steps });
  const saving = React.useRef(false);
  const changeVersion = React.useRef(0);
  const queued = React.useRef(false);
  const editable = window.can(currentUser, "write");
  const path = "/tests/" + encodeURIComponent(test.id);
  live.current = { draft, steps };
  function decorate(rows) { return rows.map(s => ({ ...s, _key: String(s.id || crypto.randomUUID()) })); }
  async function load() {
    const data = await workspaceRequest(path);
    const rows = await workspaceRequest(path + "/steps");
    baseline.current = data; baseSteps.current = rows;
    setDraft(data); setTagsText((data.tags || []).join(", ")); setSteps(decorate(rows)); setDirty(false); setError(""); setConflict(false); setSelected([]); setLoaded(true);
    onTestPatch(data);
  }
  React.useEffect(() => {
    load().catch(e => setError(e.message));
    workspaceRequest("/folders?project_id=" + encodeURIComponent(test.project_id)).then(rows => {
      const flatten = list => list.flatMap(f => [f, ...flatten(f.children || [])]);
      setFolders(flatten(rows));
    }).catch(e => setError(e.message));
  }, [test.id]);
  React.useEffect(() => {
    const handler = e => { if (dirty || busy) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    window.TH_EDITOR_DIRTY = dirty || busy;
    return () => { window.removeEventListener("beforeunload", handler); window.TH_EDITOR_DIRTY = false; };
  }, [dirty, busy]);
  const cleanSteps = rows => rows.map(s => ({ ...(s.id ? { id: s.id } : {}), action: s.action, expected_result: s.expected_result || "" }));
  async function save(override) {
    if (!editable || !loaded || conflict) return;
    if (saving.current) { queued.current = true; return; }
    const snapshot = { ...live.current, ...override };
    const version = changeVersion.current;
    if (snapshot.steps.some(s => !s.action.trim())) { setError(t("editor.emptyAction")); return; }
    saving.current = true; setBusy(true); setError("");
    try {
      const patch = {};
      fields.forEach(field => { if (JSON.stringify(snapshot.draft[field]) !== JSON.stringify(baseline.current[field])) patch[field] = snapshot.draft[field]; });
      let data = baseline.current;
      if (Object.keys(patch).length) {
        data = await workspaceRequest(path, "PATCH", { ...patch, revision: data.revision });
        baseline.current = data;
      }
      const next = cleanSteps(snapshot.steps);
      if (JSON.stringify(next) !== JSON.stringify(cleanSteps(baseSteps.current))) {
        const response = await fetch("/api" + path + "/steps", { method: "PATCH", headers: window.authHeaders({ "X-Test-Revision": String(data.revision) }), body: JSON.stringify(next) });
        if (!response.ok) {
          if (response.status === 409) setConflict(true);
          const result = await response.json();
          throw new Error(typeof result.detail === "string" ? result.detail : t("api.requestFailed"));
        }
        const rows = await response.json();
        baseSteps.current = rows;
        const ids = new Map(rows.map((s, i) => [snapshot.steps[i]._key, s.id]));
        setSteps(current => current.map(s => ({ ...s, id: ids.get(s._key) || s.id })));
        data = { ...data, revision: Number(response.headers.get("X-Test-Revision")) };
        baseline.current = data;
      }
      setDraft(current => ({ ...current, revision: data.revision, updated_at: data.updated_at }));
      onTestPatch(data); setDirty(changeVersion.current !== version); setSaved(changeVersion.current === version);
    } catch (e) {
      setError(e.message);
      if (e.status === 409) setConflict(true);
      setDirty(true);
      queued.current = false;
    } finally {
      saving.current = false; setBusy(false);
      if (queued.current) { queued.current = false; setTimeout(() => save(), 0); }
    }
  }
  function edit(field, value) { ++changeVersion.current; setDraft(d => ({ ...d, [field]: value })); setDirty(true); setSaved(false); }
  function editStep(index, field, value) { ++changeVersion.current; setSteps(rows => rows.map((s, i) => i === index ? { ...s, [field]: value } : s)); setDirty(true); setSaved(false); }
  function move(from, to) {
    if (saving.current || to < 0 || to >= live.current.steps.length) return;
    const rows = [...live.current.steps]; rows.splice(to, 0, rows.splice(from, 1)[0]);
    setSteps(rows); setDirty(true); save({ steps: rows });
  }
  React.useEffect(() => {
    if (!loaded || !editable || !list.current) return;
    const sortable = new Sortable(list.current, { handle: ".step-drag", animation: 150, forceFallback: true, fallbackOnBody: true, disabled: busy || conflict,
      onEnd: event => {
        // Restore DOM order before React reconciles its keyed children.
        const parent = event.from;
        const item = event.item;
        parent.removeChild(item); parent.insertBefore(item, parent.children[event.oldIndex] || null);
        move(event.oldIndex, event.newIndex);
      } });
    return () => sortable.destroy();
  }, [loaded, editable, busy, conflict, steps]);
  function input(field, multiline = false, options) {
    const value = field === "tags" ? tagsText : (draft[field] || "");
    const props = { className: "input", "aria-label": t("editor." + field), value,
      disabled: !editable, onChange: e => {
        if (field === "tags") setTagsText(e.target.value);
        edit(field, field === "tags" ? e.target.value.split(",").map(s => s.trim()).filter(Boolean) : e.target.value);
      },
      onBlur: () => save(), onKeyDown: e => { if (!multiline && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } } };
    return <label className="editor-field"><span>{t("editor." + field)}</span>{options ? <select {...props}>{options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select> : multiline ? <textarea {...props} rows={5} /> : <input {...props} />}</label>;
  }
  return <div className="case-editor">
    <div className="editor-save-state" role="status">{busy ? t("editor.saving") : dirty ? t("editor.unsaved") : saved ? t("editor.saved") : ""}</div>
    {error && <div className="editor-error" role="alert">{conflict ? t("editor.conflict") : error}
      {!conflict && <button className="btn" disabled={busy} onClick={() => save()}>{t("editor.retry")}</button>}
      <button className="btn" disabled={busy} onClick={() => { if (confirm(t("editor.reloadConfirm"))) load().catch(e => setError(e.message)); }}>{t("editor.reload")}</button>
    </div>}
    {loaded && <>
      <div className="editor-metadata">
        {input("title")}{input("author")}
        {input("folder_id", false, [["", t("cases.library.none")], ...folders.map(f => [f.id, f.name])])}
        {input("priority", false, ["low", "med", "high"].map(v => [v, t("cases.library." + (v === "med" ? "medium" : v) + "Priority")]))}
        {input("type", false, ["manual", "automated"].map(v => [v, t("cases.library." + v)]))}
        {input("status", false, ["pending", "pass", "fail", "skip", "blocked"].map(v => [v, window.TH_I18N.t("status." + v)]))}
        {input("tags")}
      </div>
      <div className="editor-text-columns">{input("description", true)}{input("prerequisites", true)}</div>
      {customDefs.length > 0 && <fieldset disabled={!editable} onBlur={() => save()}>
        <legend>{t("cases.detail.customFields")}</legend>
        <CustomFieldsInputs defs={customDefs} values={draft.custom_fields || {}} onChange={value => edit("custom_fields", value)} />
      </fieldset>}
      <section className="editor-steps">
        <div className="editor-step-toolbar"><h2>{t("editor.steps")} <span className="dim">{steps.length}</span></h2>
          {editable && <>
            <label><input type="checkbox" aria-label={t("editor.selectAll")} checked={steps.length > 0 && selected.length === steps.length} onChange={e => setSelected(e.target.checked ? steps.map(s => s._key) : [])} /></label>
            <button className="btn" disabled={busy || !selected.length} onClick={() => setConfirmDelete(true)}><Icon name="x" />{t("editor.deleteSelected")}</button>
            <button className="btn" disabled={busy || conflict} onClick={() => { setSteps(rows => [...rows, { _key: crypto.randomUUID(), action: "", expected_result: "" }]); setDirty(true); }}><Icon name="plus" />{t("editor.addStep")}</button>
          </>}
        </div>
        <div ref={list}>{steps.map((step, i) => <div className="editor-step" key={step._key} data-step-id={step.id || "new"}>
          <div className="step-tools">
            <span className="mono">{i + 1}</span>
            {editable && <>
              <input type="checkbox" aria-label={t("editor.selectStep") + " " + (i + 1)} checked={selected.includes(step._key)} onChange={e => setSelected(ids => e.target.checked ? [...ids, step._key] : ids.filter(id => id !== step._key))} />
              <button className="btn icon step-drag" disabled={busy || conflict} title={t("editor.dragStep")} aria-label={t("editor.dragStep")}><Icon name="menu" /></button>
              <button className="btn icon" disabled={busy || conflict || i === 0} title={t("editor.moveUp")} onClick={() => move(i, i - 1)}><span style={{display:"flex", transform:"rotate(-90deg)"}}><Icon name="chev" /></span></button>
              <button className="btn icon" disabled={busy || conflict || i === steps.length - 1} title={t("editor.moveDown")} onClick={() => move(i, i + 1)}><span style={{display:"flex", transform:"rotate(90deg)"}}><Icon name="chev" /></span></button>
            </>}
          </div>
          <label className="editor-field"><span>{t("editor.action")}</span><textarea className="input" aria-label={t("editor.action") + " " + (i + 1)} value={step.action} rows={2} disabled={!editable} onChange={e => editStep(i, "action", e.target.value)} onBlur={() => save()} /></label>
          <label className="editor-field"><span>{t("editor.expected")}</span><textarea className="input" aria-label={t("editor.expected") + " " + (i + 1)} value={step.expected_result || ""} rows={2} disabled={!editable} onChange={e => editStep(i, "expected_result", e.target.value)} onBlur={() => save()} /></label>
        </div>)}</div>
        {!steps.length && <p className="dim">{t("editor.noSteps")}</p>}
      </section>
    </>}
    {confirmDelete && <ConfirmDialog title={t("editor.deleteSelected")} body={t("editor.deleteStepsConfirm")} onCancel={() => setConfirmDelete(false)} onConfirm={() => {
      const rows = steps.filter(s => !selected.includes(s._key)); setSteps(rows); setSelected([]); setConfirmDelete(false); setDirty(true); save({ steps: rows });
    }} />}
  </div>;
}
window.CaseEditor = CaseEditor;

function AppearanceSettings({ currentUser, onProfileUpdate }) {
  const { t } = useI18n();
  const defaults = { textSize: 14, scale: 100, density: "compact" };
  const [value, setValue] = React.useState({ ...defaults, ...currentUser.appearance });
  React.useEffect(() => { setValue({ ...defaults, ...currentUser.appearance }); }, [currentUser.appearance]);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function save(next) {
    setBusy(true); setError("");
    try { const user = await workspaceRequest("/me", "PUT", { appearance: next }); setValue(next); onProfileUpdate(user); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="appearance-settings"><h2>{t("editor.appearance")}</h2>
    {[ ["textSize", [14, 16, 18]], ["scale", [100, 110, 125]] ].map(([key, choices]) => <label className="editor-field" key={key}>
      <span>{t("editor." + key)}: {value[key]}{key === "scale" ? "%" : "px"}</span>
      <input aria-label={t("editor." + key)} type="range" min="0" max="2" step="1" disabled={busy} value={choices.indexOf(value[key])} onChange={e => save({ ...value, [key]: choices[Number(e.target.value)] })} />
    </label>)}
    <label className="editor-field"><span>{t("editor.density")}</span><select className="input" aria-label={t("editor.density")} disabled={busy} value={value.density} onChange={e => save({ ...value, density: e.target.value })}>{["compact", "comfortable"].map(v => <option key={v} value={v}>{t("editor." + v)}</option>)}</select></label>
    <button className="btn" disabled={busy} onClick={() => save(defaults)}>{t("editor.reset")}</button>
    {error && <p role="alert">{error}</p>}
  </section>;
}
window.AppearanceSettings = AppearanceSettings;
