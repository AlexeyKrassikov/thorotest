// Library view — test case management

// Flatten the folder tree to a flat list at any depth (imported spec folders
// nest several levels deep). Used for the folder tree, the active-folder title
// lookup, and the bulk "move to folder" picker.
function flattenFolders(list) {
  const out = [];
  (list || []).forEach(f => {
    out.push(f);
    if (f.children) out.push(...flattenFolders(f.children));
  });
  return out;
}

function formatLibraryDate(value, lang) {
  if (!value) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US");
}

// One folder row, rendered recursively so nested subfolders (any depth) are
// navigable — the old tree only rendered the top two levels.
function FolderRow({ node, depth, openFolders, toggleFolder, selectFolder, activeFolder, favoritedIds, toggleFavorite }) {
  const { t } = useI18n();
  const hasChildren = node.children && node.children.length > 0;
  const open = !!openFolders[node.id];
  return (
    <React.Fragment>
      <div
        className={"tree-row" + (activeFolder === node.id ? " active" : "")}
        style={{paddingLeft: 8 + depth * 16}}
        onClick={() => { if (hasChildren) toggleFolder(node.id); selectFolder(node.id); }}
      >
        <span className={"caret" + (open ? " open" : "")}>{hasChildren ? <Icon name="chev" /> : null}</span>
        <span style={{color: depth === 0 ? "var(--warn)" : "var(--text-dim)", fontSize: depth === 0 ? undefined : 10}}>{depth === 0 ? "▣" : "—"}</span>
        <span>{node.name}</span>
        <span className="count">{node.count}</span>
        <span
          title={favoritedIds.has(node.id) ? t("cases.library.removeFavorite") : t("cases.library.addFavorite")}
          style={{marginLeft:"auto", cursor:"pointer", color: favoritedIds.has(node.id) ? "var(--warn)" : "var(--text-dim)", fontSize:12, lineHeight:1}}
          onClick={(e) => toggleFavorite(e, node.id)}
        >{favoritedIds.has(node.id) ? "★" : "☆"}</span>
      </div>
      {open && hasChildren && node.children.map(c => (
        <FolderRow
          key={c.id}
          node={c}
          depth={depth + 1}
          openFolders={openFolders}
          toggleFolder={toggleFolder}
          selectFolder={selectFolder}
          activeFolder={activeFolder}
          favoritedIds={favoritedIds}
          toggleFavorite={toggleFavorite}
        />
      ))}
    </React.Fragment>
  );
}

function Library({ onNav, onOpenTest, currentUser }) {
  const { t, lang } = useI18n();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: D, loading, error } = useInitialData(refreshKey);
  const [openFolders, setOpenFolders] = useState({ auth: true, checkout: true });
  const [activeFolder, setActiveFolder] = useState(null);
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [filterStatusOpen, setFilterStatusOpen] = useState(false);
  const [filterTypeOpen, setFilterTypeOpen] = useState(false);
  const [filterTagOpen, setFilterTagOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tests, setTests] = useState(null);
  const [testsLoading, setTestsLoading] = useState(true);
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(new Set());
  const [showNewTest, setShowNewTest] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkFolderOpen, setBulkFolderOpen] = useState(false);

  // Escape closes any open dropdown — the click-catching backdrop below only
  // dismisses on a mouse click.
  useEscapeKey(filterStatusOpen, () => setFilterStatusOpen(false));
  useEscapeKey(filterTypeOpen, () => setFilterTypeOpen(false));
  useEscapeKey(filterTagOpen, () => setFilterTagOpen(false));
  useEscapeKey(bulkStatusOpen, () => setBulkStatusOpen(false));
  useEscapeKey(bulkFolderOpen, () => setBulkFolderOpen(false));
  const [exportingCSV, setExportingCSV] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const refresh = () => { setRefreshKey(k => k + 1); setSelected(new Set()); };

  useEffect(() => {
    window.TH_API.getFavorites().then(data => setFavoritedIds(new Set(data.map(f => f.folder_id)))).catch(() => {});
  }, []);

  const toggleFavorite = async (e, folderId) => {
    e.stopPropagation();
    try {
      if (favoritedIds.has(folderId)) {
        await window.TH_API.removeFavorite(folderId);
        setFavoritedIds(s => { const n = new Set(s); n.delete(folderId); return n; });
      } else {
        await window.TH_API.addFavorite(folderId);
        setFavoritedIds(s => new Set([...s, folderId]));
      }
      window.dispatchEvent(new CustomEvent("favorites-changed"));
    } catch {}
  };

  useEffect(() => {
    const tid = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(tid);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeFolder) params.set("folder_id", activeFolder);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (filterType !== "all") params.set("type", filterType);
    if (filterTag !== "all") params.set("tag", filterTag);
    setTestsLoading(true);
    fetch(`/api/tests?${params}`, { headers: window.authHeaders() })
      .then(r => r.json())
      .then(data => {
        setTests(data.map(t => ({ ...t, folder: t.folder_id, lastRun: t.last_run_at, updated: t.updated_at })));
        setTestsLoading(false);
      })
      .catch(() => setTestsLoading(false));
  }, [activeFolder, debouncedSearch, filterStatus, filterType, filterTag, refreshKey]);

  const selectFolder = (id) => {
    window.__currentFolderId = id;  // expose for AIAssistant cross-view navigation
    setActiveFolder(id);
  };

  const toggleFolder = (id) => setOpenFolders(s => ({...s, [id]: !s[id]}));

  const allFolderIds = useMemo(() => {
    if (!D) return [];
    return flattenFolders(D.folders).map(f => f.id);
  }, [D]);

  const allTags = useMemo(() => {
    const s = new Set();
    (D?.tests || []).forEach(t => (t.tags || []).forEach(tg => s.add(tg)));
    return [...s].sort();
  }, [D]);

  const filtered = tests ?? [];

  const toggleSel = (id) => {
    setSelected(s => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const handleDeleteRow = async (t, e) => {
    e.stopPropagation();
    setDeleteTarget(t);
  };

  const confirmDelete = async () => {
    try {
      await fetch(`/api/tests/${deleteTarget.id}`, { method: "DELETE", headers: { ...window.authHeaders() } });
    } catch (e) {}
    setDeleteTarget(null);
    refresh();
  };

  const handleBulkDelete = async () => {
    try {
      await fetch("/api/tests/bulk", {
        method: "POST",
        headers: { ...window.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", ids: [...selected] }),
      });
    } catch (e) {}
    setBulkDeleteConfirm(false);
    refresh();
  };

  const handleBulkStatus = async (status) => {
    try {
      await fetch("/api/tests/bulk", {
        method: "POST",
        headers: { ...window.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", ids: [...selected], payload: { status } }),
      });
    } catch (e) {}
    setBulkStatusOpen(false);
    refresh();
  };

  const handleBulkFolder = async (folder_id) => {
    try {
      await fetch("/api/tests/bulk", {
        method: "POST",
        headers: { ...window.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", ids: [...selected], payload: { folder_id } }),
      });
    } catch (e) {}
    setBulkFolderOpen(false);
    refresh();
  };

  if (loading && !D) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim">{t("cases.library.loading")}</span>
    </div>
  );

  if (!D) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim">{t("cases.library.loadError", { error: error ? `: ${error}` : "" })}</span>
    </div>
  );

  const totalCount = D.tests.length;
  const allFoldersList = flattenFolders(D.folders);

  return (
    <div className="library-layout" style={{display:"grid", gridTemplateColumns:"260px 1fr", height:"100%", overflow:"hidden"}}>
      {/* Tree sidebar */}
      <div className="library-folders" style={{borderRight:"1px solid var(--border)", display:"flex", flexDirection:"column", background:"var(--bg-2)", overflow:"hidden"}}>
        <div style={{padding:"12px 12px 6px", display:"flex", alignItems:"center", gap:8, borderBottom:"1px solid var(--border)"}}>
          <div style={{fontSize:12, fontWeight:600}}>{t("cases.library.folders")}</div>
          <div className="card-sub" style={{fontSize:10.5}}>{t("cases.library.testsCount", { count: totalCount })}</div>
          {window.can && window.can(currentUser, "write") && (
            <button className="btn ghost icon" style={{marginLeft:"auto"}} onClick={() => setShowNewTest(true)} aria-label={t("cases.library.newTest")}><Icon name="plus" /></button>
          )}
        </div>
        <div className="tree" style={{padding:"8px 8px", overflowY:"auto", flex:1}}>
          <div className={"tree-row" + (activeFolder === null ? " active" : "")} {...clickable(() => selectFolder(null))}>
            <span className="caret"></span>
            <Icon name="grid" />
            <span>{t("cases.library.allTests")}</span>
            <span className="count">{totalCount}</span>
          </div>
          {D.folders.map(f => (
            <FolderRow
              key={f.id}
              node={f}
              depth={0}
              openFolders={openFolders}
              toggleFolder={toggleFolder}
              selectFolder={selectFolder}
              activeFolder={activeFolder}
              favoritedIds={favoritedIds}
              toggleFavorite={toggleFavorite}
            />
          ))}
        </div>
        <div style={{padding:"10px 12px", borderTop:"1px solid var(--border)", fontSize:11, color:"var(--text-dim)"}}>
          <div className="mono" style={{fontSize:10.5}}>{t("cases.library.syncedFromGit")}</div>
          <div style={{display:"flex", alignItems:"center", gap:6, marginTop:4}}>
            <span className="status pass" style={{padding:"1px 5px"}}>{t("cases.library.upToDate")}</span>
            <span className="mono dim">main · a3c9f1d</span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="library-content" style={{display:"flex", flexDirection:"column", overflow:"hidden"}}>
        {/* Toolbar */}
        <div className="toolbar">
          <div style={{fontSize:14, fontWeight:600, marginRight:8}}>
            {activeFolder ? (allFoldersList.find(f=>f.id===activeFolder)?.name || activeFolder) : t("cases.library.allTests")}
          </div>
          <div className="card-sub">{testsLoading ? "…" : t("cases.library.testsCount", { count: filtered.length })}</div>
          <div className="spacer" />

          <input
            className="input"
            style={{height:28, fontSize:12, padding:"2px 8px", width:180}}
            placeholder={t("cases.library.search")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div style={{position:"relative"}}>
            <div className={"chip" + (filterStatus !== "all" ? " active" : "")} {...clickable(() => { setFilterStatusOpen(o => !o); setFilterTypeOpen(false); })}>
              <Icon name="filter" />
              {t("cases.library.status")}: <b style={{marginLeft:2, color:"var(--text)"}}>{filterStatus === "all" ? t("cases.library.allValue") : t(`cases.library.${filterStatus}Value`)}</b>
            </div>
            {filterStatusOpen && (
              <>
                <div aria-hidden="true" style={{position:"fixed", inset:0, zIndex:99}} onClick={() => setFilterStatusOpen(false)} />
                <div style={{position:"absolute", top:"100%", right:0, zIndex:100, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", minWidth:130, marginTop:4, boxShadow:"0 4px 12px rgba(0,0,0,0.3)", overflow:"hidden"}}>
                  {["all","pass","fail","warn","skip","pending"].map(st => (
                    <div key={st} style={{padding:"7px 12px", cursor:"pointer", background: st === filterStatus ? "var(--accent-soft)" : "transparent", fontSize:12}}
                      onClick={() => { setFilterStatus(st); setFilterStatusOpen(false); }}>
                      {st === "all" ? t("cases.library.allStatuses") : <StatusBadge s={st} />}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{position:"relative"}}>
            <div className={"chip" + (filterType !== "all" ? " active" : "")} {...clickable(() => { setFilterTypeOpen(o => !o); setFilterStatusOpen(false); })}>
              {t("cases.library.type")}: <b style={{color:"var(--text)", marginLeft:2}}>{t(`cases.library.${filterType}Value`)}</b>
            </div>
            {filterTypeOpen && (
              <>
                <div aria-hidden="true" style={{position:"fixed", inset:0, zIndex:99}} onClick={() => setFilterTypeOpen(false)} />
                <div style={{position:"absolute", top:"100%", right:0, zIndex:100, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", minWidth:130, marginTop:4, boxShadow:"0 4px 12px rgba(0,0,0,0.3)", overflow:"hidden"}}>
                  {[["all", t("cases.library.allTypes")], ["manual", t("cases.library.manual")], ["automated", t("cases.library.automated")]].map(([v,label]) => (
                    <div key={v} style={{padding:"7px 12px", cursor:"pointer", background: v === filterType ? "var(--accent-soft)" : "transparent", fontSize:12}}
                      onClick={() => { setFilterType(v); setFilterTypeOpen(false); }}>
                      {label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{position:"relative"}}>
            <div className={"chip" + (filterTag !== "all" ? " active" : "")} {...clickable(() => { setFilterTagOpen(o => !o); setFilterStatusOpen(false); setFilterTypeOpen(false); })}>
              {t("cases.library.tag")}: <b style={{color:"var(--text)", marginLeft:2}}>{filterTag === "all" ? t("cases.library.allValue") : filterTag}</b>
            </div>
            {filterTagOpen && (
              <>
                <div aria-hidden="true" style={{position:"fixed", inset:0, zIndex:99}} onClick={() => setFilterTagOpen(false)} />
                <div style={{position:"absolute", top:"100%", right:0, zIndex:100, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", minWidth:130, maxHeight:280, overflowY:"auto", marginTop:4, boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>
                  {["all", ...allTags].map(tg => (
                    <div key={tg} style={{padding:"7px 12px", cursor:"pointer", background: tg === filterTag ? "var(--accent-soft)" : "transparent", fontSize:12}}
                      onClick={() => { setFilterTag(tg); setFilterTagOpen(false); }}>
                      {tg === "all" ? t("cases.library.allTags") : tg}
                    </div>
                  ))}
                  {allTags.length === 0 && <div style={{padding:"7px 12px", fontSize:12, color:"var(--text-muted)"}}>{t("cases.library.noTags")}</div>}
                </div>
              </>
            )}
          </div>

          <div className="chip">{t("cases.library.owner")}: <b style={{color:"var(--text)", marginLeft:2}}>{t("cases.library.any")}</b></div>

          <button className="btn sm" style={{marginLeft:8, background:"var(--purple)", borderColor:"var(--purple)", color:"oklch(0.16 0 0)", display:"flex", alignItems:"center", gap:5}}
            onClick={() => setAiOpen(true)} title={activeFolder ? t("cases.library.suggestFolder") : t("cases.library.suggestPickFolder")}>
            <Icon name="sparkle" /> {t("cases.library.ai")}
          </button>

          <div style={{display:"flex", border:"1px solid var(--border)", borderRadius:"var(--radius)", overflow:"hidden", marginLeft:8}}>
            <button className={"btn ghost icon"} style={{background: view==="list" ? "var(--surface-2)" : "transparent", borderRadius:0}} onClick={() => setView("list")} aria-label={t("cases.library.listView")} title={t("cases.library.listView")}><Icon name="list" /></button>
            <button className={"btn ghost icon"} style={{background: view==="grid" ? "var(--surface-2)" : "transparent", borderRadius:0, borderLeft:"1px solid var(--border)"}} onClick={() => setView("grid")} aria-label={t("cases.library.gridView")} title={t("cases.library.gridView")}><Icon name="grid" /></button>
          </div>

          {window.can && window.can(currentUser, "write") && (
            <button className="btn accent sm" onClick={() => setShowNewTest(true)}><Icon name="plus" /> {t("cases.library.newTest")}</button>
          )}
          <button
            className="btn sm"
            onClick={async () => {
              setExportingCSV(true);
              try { await window.TH_API.exportTestsCSV(activeFolder); } catch (_) {}
              setExportingCSV(false);
            }}
            disabled={exportingCSV}
            style={{marginLeft: 6}}
          >
            {exportingCSV ? t("cases.library.exporting") : t("cases.library.exportCsv")}
          </button>
        </div>

        {/* Bulk actions toolbar */}
        {selected.size > 0 && (
          <div style={{padding:"6px 22px", background:"var(--accent-soft)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, fontSize:12, position:"relative"}}>
            <b className="mono">{t("cases.library.selected", { count: selected.size })}</b>
            {window.can && window.can(currentUser, "write") && (
              <div style={{position:"relative"}}>
                <button className="btn sm" onClick={() => { setBulkFolderOpen(o => !o); setBulkStatusOpen(false); }}>{t("cases.library.moveFolder")}</button>
                {bulkFolderOpen && (
                  <>
                    <div aria-hidden="true" style={{position:"fixed", inset:0, zIndex:99}} onClick={() => setBulkFolderOpen(false)} />
                    <div style={{position:"absolute", top:"100%", left:0, zIndex:100, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", minWidth:180, marginTop:4, boxShadow:"0 4px 12px rgba(0,0,0,0.3)", overflow:"hidden"}}>
                      {allFoldersList.map(f => (
                        <div key={f.id} style={{padding:"8px 14px", cursor:"pointer", fontSize:12}} onClick={() => handleBulkFolder(f.id)}>{f.name}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {window.can && window.can(currentUser, "write") && (
              <div style={{position:"relative"}}>
                <button className="btn sm" onClick={() => { setBulkStatusOpen(o => !o); setBulkFolderOpen(false); }}>{t("cases.library.setStatus")}</button>
                {bulkStatusOpen && (
                  <>
                    <div aria-hidden="true" style={{position:"fixed", inset:0, zIndex:99}} onClick={() => setBulkStatusOpen(false)} />
                    <div style={{position:"absolute", top:"100%", left:0, zIndex:100, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:"var(--radius)", minWidth:120, marginTop:4, boxShadow:"0 4px 12px rgba(0,0,0,0.3)", overflow:"hidden"}}>
                      {["pass","fail","warn","skip","pending"].map(st => (
                        <div key={st} style={{padding:"7px 12px", cursor:"pointer"}} onClick={() => handleBulkStatus(st)}>
                          <StatusBadge s={st} />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {window.can && window.can(currentUser, "delete") && (
              <button className="btn sm" style={{color:"var(--fail)"}} onClick={() => setBulkDeleteConfirm(true)}>{t("cases.library.delete")}</button>
            )}
            <button className="btn ghost sm" style={{marginLeft:"auto"}} onClick={() => setSelected(new Set())}>{t("cases.library.clear")}</button>
          </div>
        )}

        {/* List */}
        <div style={{overflowY:"auto", flex:1}}>
          {view === "list" ? (
            <table className="table library-table">
              <thead>
                <tr>
                  <th style={{width:28}}></th>
                  <th style={{width:80}}>{t("cases.library.id")}</th>
                  <th>{t("cases.library.title")}</th>
                  <th style={{width:90}}>{t("cases.library.type")}</th>
                  <th style={{width:100}}>{t("cases.library.status")}</th>
                  <th style={{width:80}}>{t("cases.library.priority")}</th>
                  <th style={{width:100}}>{t("cases.library.tags")}</th>
                  <th style={{width:60}}>{t("cases.library.owner")}</th>
                  <th style={{width:80}}>{t("cases.library.lastRun")}</th>
                  <th style={{width:80}}>{t("cases.library.duration")}</th>
                  <th style={{width:36}}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className={selected.has(t.id) ? "selected" : ""} style={{cursor:"pointer"}} onClick={() => onOpenTest(t.id)}>
                    <td onClick={(e) => { e.stopPropagation(); toggleSel(t.id); }}>
                      <input type="checkbox" checked={selected.has(t.id)} readOnly />
                    </td>
                    <td className="mono">{t.id}</td>
                    <td>
                      <div style={{display:"flex", alignItems:"center", gap:8}}>
                        <span>{t.title}</span>
                      </div>
                    </td>
                    <td>
                      {t.auto
                        ? <span className="tag" style={{color:"var(--info)", borderColor:"oklch(from var(--info) l c h / 0.3)"}}>{window.TH_I18N.t("cases.library.auto")} · {t.runner}</span>
                        : <span className="tag">{window.TH_I18N.t("cases.detail.manual")}</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <StatusSelect s={t.status} testId={t.id} onChanged={refresh} />
                    </td>
                    <td><span className={"tag priority-" + (t.priority === "high" ? "high" : t.priority === "med" ? "med" : "low")}>{window.TH_I18N.t(t.priority === "high" ? "cases.library.highPriority" : t.priority === "med" ? "cases.library.mediumPriority" : "cases.library.lowPriority")}</span></td>
                    <td>
                      <div style={{display:"flex", gap:3, flexWrap:"wrap"}}>
                        {t.tags.slice(0,2).map(tg => <span key={tg} className="tag">{tg}</span>)}
                      </div>
                    </td>
                    <td className="mono dim">{t.owner}</td>
                    <td className="mono dim">{formatLibraryDate(t.lastRun, lang)}</td>
                    <td className="mono dim">{t.duration}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {window.can && window.can(currentUser, "delete") && (
                        <button className="btn ghost icon sm" style={{opacity:0.5}} title={window.TH_I18N.t("cases.library.deleteTest")} onClick={(e) => handleDeleteRow(t, e)}>
                          <Icon name="x" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{padding:14, display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))", gap:12}}>
              {filtered.map(t => (
                <div key={t.id} className="card" style={{padding:14, cursor:"pointer", position:"relative"}} {...clickable(() => onOpenTest(t.id))}>
                  <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
                    <span className="mono dim" style={{fontSize:10.5}}>{t.id}</span>
                    <div style={{marginLeft:"auto"}} onClick={(e) => e.stopPropagation()}>
                      <StatusSelect s={t.status} testId={t.id} onChanged={refresh} />
                    </div>
                    {window.can && window.can(currentUser, "delete") && (
                      <button className="btn ghost icon sm" style={{opacity:0.5}} onClick={(e) => handleDeleteRow(t, e)} aria-label={window.TH_I18N.t("cases.library.deleteTest")} title={window.TH_I18N.t("cases.library.deleteTest")}>
                        <Icon name="x" />
                      </button>
                    )}
                  </div>
                  <div style={{fontSize:13, fontWeight:500, lineHeight:1.4, marginBottom:10}}>{t.title}</div>
                  <div style={{display:"flex", alignItems:"center", gap:6, fontSize:11}}>
                    {t.auto ? <span className="tag" style={{color:"var(--info)"}}>{window.TH_I18N.t("cases.library.auto")}</span> : <span className="tag">{window.TH_I18N.t("cases.detail.manual")}</span>}
                    <span className={"tag priority-" + (t.priority === "high" ? "high" : t.priority === "med" ? "med" : "low")}>{window.TH_I18N.t(t.priority === "high" ? "cases.library.highPriority" : t.priority === "med" ? "cases.library.mediumPriority" : "cases.library.lowPriority")}</span>
                    <span className="dim mono" style={{marginLeft:"auto", fontSize:10.5}}>{formatLibraryDate(t.lastRun, lang)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {testsLoading && tests === null ? (
            <div className="empty">{t("cases.library.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="empty">{t("cases.library.noMatch")}</div>
          ) : null}
        </div>
      </div>

      {/* New test modal */}
      {showNewTest && (
        <NewTestModal
          currentUser={currentUser}
          folders={allFoldersList}
          defaultFolderId={activeFolder}
          onClose={() => setShowNewTest(false)}
          onCreate={refresh}
        />
      )}

      {/* AI assistant drawer — scoped to the active folder (falls back to a
          picker when viewing "All tests"). Refresh on close so new drafts show. */}
      {aiOpen && (
        <>
          <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:200}}
            onClick={() => { setAiOpen(false); refresh(); }} />
          <div style={{position:"fixed", top:0, right:0, bottom:0, width:400, maxWidth:"92vw", zIndex:201,
            background:"var(--bg-2)", borderLeft:"1px solid var(--border)", padding:16, overflowY:"auto",
            boxShadow:"-8px 0 24px rgba(0,0,0,0.3)"}}>
            <AiSuggestBox D={D} folderId={activeFolder || undefined} onClose={() => { setAiOpen(false); refresh(); }} />
          </div>
        </>
      )}

      {/* Delete single confirm */}
      {deleteTarget && (
        <ConfirmDialog
          title={t("cases.library.deletingOneTitle", { id: deleteTarget.id })}
          body={t("cases.library.deletingOneBody", { title: deleteTarget.title })}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Bulk delete confirm */}
      {bulkDeleteConfirm && (
        <ConfirmDialog
          title={t(selected.size === 1 ? "cases.library.deletingOneTestTitle" : "cases.library.deletingManyTestsTitle", { count: selected.size })}
          body={t("cases.library.deletingManyBody")}
          onConfirm={handleBulkDelete}
          onCancel={() => setBulkDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

function NewTestModal({ folders, defaultFolderId, onClose, onCreate, currentUser }) {
  const { t } = useI18n();
  const [autoId, setAutoId] = useState(false);
  const [form, setForm] = useState({
    id: "", title: "", folder_id: defaultFolderId || "", type: "manual", priority: "med", author: currentUser?.username || "", tags: ""
  });
  const [folderOptions, setFolderOptions] = useState(folders);
  const [folderName, setFolderName] = useState("");
  const [customFields, setCustomFields] = useState({});
  const [cfDefs] = useCustomFieldDefs("test");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const modal = useModal(onClose, { labelledBy: "new-test-title" });

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim()) { setErr(t("cases.library.titleRequired")); return; }
    if (!autoId && !form.id.trim()) { setErr(t("cases.library.idRequired")); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        project_id: window.TH_PROJECT?.id,
        id: autoId ? null : form.id.trim(),
        auto_id: autoId,
        title: form.title.trim(),
        folder_id: form.folder_id || null,
        type: form.type,
        priority: form.priority,
        author: form.author.trim(),
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        auto: form.type === "automated",
        status: "pending",
        custom_fields: customFields,
      };
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { ...window.authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || t("cases.library.createFailed"));
      }
      onCreate();
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...modal.overlayProps}>
      <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:480, maxWidth:"calc(100vw - 32px)", maxHeight:"80vh", overflowY:"auto"}} {...modal.dialogProps}>
        <div style={{display:"flex", alignItems:"center", marginBottom:20}}>
          <h2 id="new-test-title" style={{fontSize:15, fontWeight:600, margin:0}}>{t("cases.library.suggestTitle")}</h2>
          <button className="btn ghost icon sm" style={{marginLeft:"auto"}} onClick={onClose} aria-label={t("cases.library.close")}><Icon name="x" /></button>
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:14}}>
          <label style={{display:"flex", alignItems:"center", gap:8, fontSize:13}}>
            <input type="checkbox" checked={autoId} disabled={saving} onChange={e => { setAutoId(e.target.checked); setErr(null); }} />
            {t("cases.library.autoId")}
          </label>
          <FormField label={t(autoId ? "cases.library.id" : "cases.library.idRequiredLabel")} hint={autoId ? null : t("cases.library.egId")}>
            <input id="new-test-id" className="input" value={autoId ? "" : form.id} disabled={autoId || saving} onChange={e => setF("id", e.target.value)} placeholder={autoId ? "TC-…" : "TC-2400"} />
          </FormField>
          <FormField label={t("cases.library.titleRequiredLabel")}>
            <input className="input" value={form.title} onChange={e => setF("title", e.target.value)} placeholder={t("cases.library.titlePlaceholder")} />
          </FormField>
          <FormField label={t("cases.library.folder")}>
            <select className="input" value={form.folder_id} onChange={e => setF("folder_id", e.target.value)}>
              <option value="">{t("cases.library.none")}</option>
              {folderOptions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <div className="member-row" style={{marginTop:8}}>
              <input className="input" aria-label={t("editor.newFolder")} placeholder={t("editor.newFolder")} value={folderName} onChange={e => setFolderName(e.target.value)} />
              <button className="btn icon" title={t("editor.createFolder")} disabled={saving || !folderName.trim()} onClick={async () => {
                setSaving(true); setErr(null);
                try {
                  const folder = await workspaceRequest("/folders", "POST", { id: "folder-" + crypto.randomUUID(), name: folderName.trim(), project_id: window.TH_PROJECT?.id });
                  setFolderOptions(list => [...list, folder]); setF("folder_id", folder.id); setFolderName("");
                } catch (e) { setErr(e.message); } finally { setSaving(false); }
              }}><Icon name="plus" /></button>
            </div>
          </FormField>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <FormField label={t("cases.library.type")}>
              <select className="input" value={form.type} onChange={e => setF("type", e.target.value)}>
                <option value="manual">{t("cases.library.manual")}</option>
                <option value="automated">{t("cases.library.automated")}</option>
              </select>
            </FormField>
            <FormField label={t("cases.library.priority")}>
              <select className="input" value={form.priority} onChange={e => setF("priority", e.target.value)}>
                <option value="high">{t("cases.requirements.high")}</option>
                <option value="med">{t("cases.requirements.medium")}</option>
                <option value="low">{t("cases.requirements.low")}</option>
              </select>
            </FormField>
          </div>
          <FormField label={t("editor.author")}>
            <input className="input" aria-label={t("editor.author")} value={form.author} onChange={e => setF("author", e.target.value)} />
          </FormField>
          <FormField label={t("cases.library.tags")} hint={t("cases.library.tagsHint")}>
            <input className="input" value={form.tags} onChange={e => setF("tags", e.target.value)} placeholder={t("cases.library.tagsPlaceholder")} />
          </FormField>
          <CustomFieldsInputs defs={cfDefs} values={customFields} onChange={setCustomFields} />
        </div>

        {err && <div style={{color:"var(--fail)", fontSize:12, marginTop:12}}>{err}</div>}

        <div style={{display:"flex", gap:8, marginTop:20, justifyContent:"flex-end"}}>
          <button className="btn" onClick={onClose}>{t("cases.library.cancel")}</button>
          <button className="btn accent" onClick={submit} disabled={saving || (!autoId && !form.id.trim()) || !form.title.trim()}>
            {saving ? t("cases.library.creating") : t("cases.library.createTest")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, hint, children }) {
  return (
    <div>
      <div style={{fontSize:11, fontWeight:500, color:"var(--text-dim)", marginBottom:5, display:"flex", gap:6, alignItems:"baseline"}}>
        {label}
        {hint && <span style={{fontWeight:400, color:"var(--text-muted)"}}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ConfirmDialog({ title, body, onConfirm, onCancel }) {
  const { t } = useI18n();
  const modal = useModal(onCancel);
  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...modal.overlayProps}>
      <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:400}} {...modal.dialogProps}>
        <h2 style={{fontSize:15, fontWeight:600, margin:"0 0 10px"}}>{title}</h2>
        <p style={{fontSize:12.5, color:"var(--text-muted)", margin:"0 0 20px", lineHeight:1.5}}>{body}</p>
        <div style={{display:"flex", gap:8, justifyContent:"flex-end"}}>
          <button className="btn" onClick={onCancel}>{t("cases.library.cancel")}</button>
          <button className="btn" style={{background:"var(--fail)", color:"white", border:"none"}} onClick={onConfirm}>{t("cases.library.delete")}</button>
        </div>
      </div>
    </div>
  );
}

window.Library = Library;
window.ConfirmDialog = ConfirmDialog;
