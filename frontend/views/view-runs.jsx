// Runs & plans view, plus Run detail (live execution)

function Runs({ onOpenRun, currentUser }) {
  const { t } = useI18n();
  const { data: D, loading, error } = useInitialData();
  const [tab, setTab] = useState("active");
  const [showNewRun, setShowNewRun] = React.useState(false);
  const [showNewPlan, setShowNewPlan] = React.useState(false);
  const [plans, setPlans] = React.useState([]);

  const loadPlans = React.useCallback(() => {
    window.TH_API.listPlans().then(setPlans).catch(() => setPlans([]));
  }, []);
  React.useEffect(() => { loadPlans(); }, [loadPlans]);

  if (loading) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim">{t("execution.runs.loading")}</span>
    </div>
  );

  if (!D) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim">{t("execution.runs.loadError", { error: error ? `: ${error}` : "" })}</span>
    </div>
  );

  const activeCount = D.runs.filter(r => r.status === "running").length;

  return (
    <div style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div className="page-h" style={{padding:"18px 22px 0", marginBottom:14}}>
        <div>
          <h1 className="page-title">{t("execution.runs.title")}</h1>
          <div className="page-sub">{t("execution.runs.subtitle")}</div>
        </div>
        <div className="actions">
          {window.can && window.can(currentUser, "write") && (
            <button className="btn" onClick={() => setShowNewPlan(true)}><Icon name="plus" /> {t("execution.runs.newPlan")}</button>
          )}
          {window.can && window.can(currentUser, "write") && (
            <button className="btn accent" onClick={() => setShowNewRun(true)}><Icon name="play" /> {t("execution.runs.startRun")}</button>
          )}
        </div>
      </div>

      <div className="tabs" style={{paddingLeft:22}}>
        <div className={"tab" + (tab === "active" ? " active" : "")} onClick={() => setTab("active")}>{t("execution.runs.active")} <span className="count">{activeCount}</span></div>
        <div className={"tab" + (tab === "history" ? " active" : "")} onClick={() => setTab("history")}>{t("execution.runs.history")} <span className="count">{D.runs.length}</span></div>
        <div className={"tab" + (tab === "plans" ? " active" : "") } onClick={() => setTab("plans")}>{t("execution.runs.testPlans")} <span className="count">{plans.length}</span></div>
      </div>

      <div style={{overflowY:"auto", flex:1, padding:"14px 22px 32px"}}>
        {tab === "plans"
          ? <PlansList plans={plans} onReload={loadPlans} onOpenRun={onOpenRun} currentUser={currentUser} onNewPlan={() => setShowNewPlan(true)} />
          : <RunsList runs={D.runs} onOpenRun={onOpenRun} active={tab === "active"} />}
      </div>

      {showNewRun && window.can && window.can(currentUser, "write") && (
        <NewRunModal
          onClose={() => setShowNewRun(false)}
          onCreated={(id) => { setShowNewRun(false); onOpenRun(id); }}
        />
      )}

      {showNewPlan && window.can && window.can(currentUser, "write") && (
        <NewPlanModal
          onClose={() => setShowNewPlan(false)}
          onCreated={() => { setShowNewPlan(false); setTab("plans"); loadPlans(); }}
        />
      )}
    </div>
  );
}

function RunsList({runs, onOpenRun, active}) {
  const { t } = useI18n();
  const rows = active ? runs.filter(r => r.status === "running") : runs;

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th style={{width:90}}>{t("execution.runs.run")}</th>
            <th>{t("execution.runs.plan")}</th>
            <th style={{width:220}}>{t("execution.runs.progress")}</th>
            <th style={{width:120}}>{t("execution.runs.result")}</th>
            <th style={{width:90}}>{t("execution.runs.env")}</th>
            <th style={{width:140}}>{t("execution.runs.branch")}</th>
            <th style={{width:80}}>{t("execution.runs.owner")}</th>
            <th style={{width:90}}>{t("execution.runs.started")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} style={{cursor:"pointer"}} onClick={() => onOpenRun(r.id)}>
              <td className="mono">{r.id}</td>
              <td>
                <div>{r.name}</div>
                {r.owner && <div className="mono dim" style={{fontSize:10.5}}>{r.owner}</div>}
              </td>
              <td>
                <ProgressBar run={r} />
                <div className="mono dim" style={{fontSize:10.5, marginTop:3}}>
                  {t("execution.runs.failCount", { passed: r.passed, total: r.total, failed: r.failed, blocked: r.blocked })}
                </div>
              </td>
              <td><StatusBadge s={r.status} /></td>
              <td><span className="tag">{r.env}</span></td>
              <td className="mono dim">{r.branch}</td>
              <td className="mono dim">{r.owner}</td>
              <td className="mono dim">{r.started}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlansList({ plans, onReload, onOpenRun, currentUser, onNewPlan }) {
  const { t } = useI18n();
  const [busy, setBusy] = React.useState(null);   // plan id currently running/deleting
  const canWrite = window.can && window.can(currentUser, "write");

  const runPlan = async (p) => {
    setBusy(p.id);
    try {
      const run = await window.TH_API.runPlan(p.id);
      onOpenRun(run.id);
    } catch (e) {
      alert(e.message);
      setBusy(null);
    }
  };

  const deletePlan = async (p) => {
    if (!window.confirm(t("execution.runs.deletePlanConfirm", { name: p.name }))) return;
    setBusy(p.id);
    try {
      await window.TH_API.deletePlan(p.id);
      onReload();
    } catch (e) {
      alert(e.message);
    }
    setBusy(null);
  };

  if (!plans.length) {
    return (
      <div className="empty" style={{padding:"48px 18px", textAlign:"center"}}>
        <div style={{fontSize:13, marginBottom:6}}>{t("execution.runs.noPlans")}</div>
        <div className="mono dim" style={{fontSize:11, marginBottom:16}}>
          {t("execution.runs.reusablePlan")}
        </div>
        {canWrite && <button className="btn accent" onClick={onNewPlan}><Icon name="plus" /> {t("execution.runs.newPlan")}</button>}
      </div>
    );
  }

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th style={{width:110}}>{t("execution.runs.id")}</th>
            <th>{t("execution.runs.name")}</th>
            <th style={{width:70}}>{t("execution.runs.tests")}</th>
            <th style={{width:100}}>{t("execution.runs.env")}</th>
            <th style={{width:90}}>{t("execution.runs.owner")}</th>
            <th>{t("execution.runs.schedule")}</th>
            <th style={{width:150}}></th>
          </tr>
        </thead>
        <tbody>
          {plans.map(p => (
            <tr key={p.id}>
              <td className="mono">{p.id}</td>
              <td>{p.name}</td>
              <td className="mono">{(p.test_ids || []).length}</td>
              <td>{p.env ? <span className="tag">{p.env}</span> : <span className="mono dim">—</span>}</td>
              <td className="mono dim">{p.owner || "—"}</td>
              <td className="mono dim">{p.schedule || t("execution.runs.manual")}</td>
              <td style={{textAlign:"right", whiteSpace:"nowrap"}}>
                {canWrite && (
                  <>
                    <button
                      className="btn sm accent"
                      disabled={busy === p.id || !(p.test_ids || []).length}
                      onClick={() => runPlan(p)}
                    >
                      <Icon name="play" /> {busy === p.id ? "…" : t("execution.runs.runAction")}
                    </button>
                    <button
                      className="btn sm ghost icon"
                      style={{marginLeft:6}}
                      disabled={busy === p.id}
                      onClick={() => deletePlan(p)}
                      title={t("execution.runs.deletePlan")}
                    >
                      <Icon name="x" />
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunDetail({ runId, onBack, currentUser }) {
  const { t } = useI18n();
  const [liveRun, setLiveRun] = React.useState(null);
  const [cases, setCases] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [stepResult, setStepResult] = useState({});
  const [runDefects, setRunDefects] = useState([]);
  const [showFileDefect, setShowFileDefect] = useState(false);
  const [stepData, setStepData] = React.useState([]);   // [{test_step: {action, expected_result}, ...StepResultOut}]
  const [stepResults, setStepResults] = React.useState([]);   // StepResultOut[] from API
  const [testSteps, setTestSteps] = React.useState([]);       // TestStepOut[] for action text
  const [attachments, setAttachments] = React.useState([]);
  const [markingStep, setMarkingStep] = React.useState(false);
  const [users, setUsers] = React.useState([]);
  const [retesting, setRetesting] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  // Escape closes the menu; the backdrop below only handles the mouse.
  useEscapeKey(exportOpen, () => setExportOpen(false));
  const [exporting, setExporting] = React.useState(false);
  const [caseNote, setCaseNote] = React.useState("");
  const [marking, setMarking] = React.useState(false);

  // Load users list for assignment dropdown
  React.useEffect(() => {
    if (!window.can || !window.can(currentUser, "manage")) return;
    fetch("/api/users", { headers: window.authHeaders() })
      .then(r => r.json())
      .then(setUsers)
      .catch(() => {});
  }, [currentUser]);

  // Load run + cases from API
  React.useEffect(() => {
    const id = runId || "R-1287";
    setLoading(true);
    fetch(`/api/runs/${id}`, { headers: window.authHeaders() })
      .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then(data => {
        setLiveRun(data);
        const apiCases = data.cases || [];
        setCases(apiCases);
        const firstActive = apiCases.findIndex(c => c.status === "running" || c.status === "pending");
        setActiveIdx(firstActive >= 0 ? firstActive : 0);
        setLoading(false);
      })
      .catch(() => {
        const D = window.TH_DATA;
        const fallback = D?.runs.find(r => r.id === id) || D?.runs[0];
        if (fallback) {
          setLiveRun(fallback);
          setCases([]);
        }
        setLoading(false);
      });
  }, [runId]);

  // Load defects for this run
  React.useEffect(() => {
    if (!runId) return;
    TH_API.getRunDefects(runId)
      .then(setRunDefects)
      .catch(() => {});
  }, [runId]);

  // Load step definitions and step results for active case
  React.useEffect(() => {
    const c = cases[activeIdx];
    if (!c || !c.test_id) return;
    setStepResults([]);
    setTestSteps([]);
    // Load test step definitions (action text)
    TH_API.getTestSteps(c.test_id)
      .then(setTestSteps)
      .catch(() => {});
    // Load step results for this run case
    if (c.id && liveRun?.id) {
      TH_API.getStepResults(liveRun.id, c.id)
        .then(setStepResults)
        .catch(() => {});
      // Load attachments for run case
      TH_API.getAttachments("run_case", String(c.id))
        .then(setAttachments)
        .catch(() => {});
    }
  }, [activeIdx, cases, liveRun?.id]);

  // WebSocket — live run updates
  React.useEffect(() => {
    if (!liveRun || liveRun.status !== "running" || !window.TH_API) return;
    let ws;
    let cancelled = false;
    window.TH_API.connectRunWS(liveRun.id).then(socket => {
      if (cancelled) { socket.close(); return; }
      ws = socket;
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.event === "step") {
          setLiveRun(prev => ({
            ...prev,
            progress: msg.progress,
            passed: msg.passed,
            failed: msg.failed,
            blocked: msg.blocked,
          }));
          setCases(prev => prev.map(c =>
            c.test_id === msg.testId ? { ...c, status: msg.status } : c
          ));
        } else if (msg.event === "complete") {
          setLiveRun(prev => ({ ...prev, status: msg.status, progress: 100,
            passed: msg.passed, failed: msg.failed, blocked: msg.blocked }));
        } else if (msg.event === "state") {
          setLiveRun(prev => ({ ...prev, ...msg }));
        }
      };
    }).catch(() => {});
    return () => { cancelled = true; if (ws) ws.close(); };
  }, [liveRun?.id, liveRun?.status]);

  // Recompute run counters/status/progress locally from the case list, so the
  // UI reacts instantly to a manual mark (the server broadcasts the same values
  // over the WebSocket to any other viewer).
  const recomputeRun = (arr) => {
    const total = (liveRun && liveRun.total) || arr.length;
    const passed = arr.filter(c => c.status === "pass").length;
    const failed = arr.filter(c => c.status === "fail").length;
    const blocked = arr.filter(c => c.status === "blocked" || c.status === "skip").length;
    const done = arr.filter(c => c.status !== "pending").length;
    const complete = total > 0 && done >= total;
    return {
      passed, failed, blocked,
      progress: complete ? 100 : (total ? Math.round(done / total * 100) : 0),
      status: complete ? (failed > 0 ? "fail" : "pass") : "running",
    };
  };

  const markCase = async (status) => {
    const c = cases[activeIdx];
    if (!c || marking) return;
    setMarking(true);
    try {
      await window.TH_API.markCase(liveRun.id, c.id, status, caseNote.trim() || null);
    } catch (e) {
      alert(e.message);
      setMarking(false);
      return;
    }
    const nextCases = cases.map(x => x.id === c.id ? { ...x, status } : x);
    setCases(nextCases);
    setLiveRun(prev => ({ ...prev, ...recomputeRun(nextCases) }));
    setCaseNote("");
    const after = nextCases.findIndex((x, i) => i > activeIdx && x.status === "pending");
    const anyPending = after >= 0 ? after : nextCases.findIndex(x => x.status === "pending");
    if (anyPending >= 0) setActiveIdx(anyPending);
    setMarking(false);
  };

  // Keyboard shortcuts: P = pass, F = fail (only when a case is selected and the
  // user is not typing into a field).
  React.useEffect(() => {
    if (!window.can || !window.can(currentUser, "write")) return;
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "p") { e.preventDefault(); markCase("pass"); }
      else if (k === "f") { e.preventDefault(); markCase("fail"); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cases, activeIdx, caseNote, marking, currentUser]);

  const handlePause = async () => {
    try {
      await window.TH_API.updateRunStatus(liveRun.id, "paused");
      setLiveRun(prev => ({ ...prev, status: "paused" }));
    } catch (_) {}
  };

  const handleAbort = async () => {
    if (!confirm(t("execution.runs.abortConfirm"))) return;
    try {
      await window.TH_API.updateRunStatus(liveRun.id, "aborted");
      setLiveRun(prev => ({ ...prev, status: "aborted" }));
    } catch (_) {}
  };

  const handleRetest = async () => {
    if (retesting) return;
    setRetesting(true);
    try {
      const newRun = await window.TH_API.retestRun(liveRun.id);
      window.location.hash = `#/runs/${newRun.id}`;
    } catch(e) {
      setRetesting(false);
    }
  };

  const handleExport = async (fmt) => {
    setExportOpen(false);
    setExporting(true);
    try {
      if (fmt === "csv") await window.TH_API.exportRunCSV(liveRun.id);
      else await window.TH_API.exportRunPDF(liveRun.id);
    } catch (_) {}
    setExporting(false);
  };

  const markStep = async (stepResult, newStatus) => {
    const c = cases[activeIdx];
    if (!c || !liveRun) return;
    setMarkingStep(true);
    try {
      const updated = await TH_API.updateStepResult(
        liveRun.id, c.id, stepResult.test_step_id,
        { status: newStatus, actual_result: stepResult.actual_result || null }
      );
      setStepResults(prev => prev.map(sr =>
        sr.test_step_id === updated.test_step_id ? updated : sr
      ));
      // Auto-advance to next pending step after marking
      if (newStatus === "pass" || newStatus === "fail") {
        const currentStepIdx = stepResults.findIndex(sr => sr.test_step_id === stepResult.test_step_id);
        const nextPending = stepResults.findIndex((sr, i) => i > currentStepIdx && sr.status === "pending");
        // (No UI advance needed — tester sees all steps highlighted by status)
      }
    } catch (e) {}
    setMarkingStep(false);
  };

  React.useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (!stepResults.length) return;
      const firstPending = stepResults.find(sr => sr.status === "pending");
      if (!firstPending) return;
      if (e.key === "p" || e.key === "P") markStep(firstPending, "pass");
      if (e.key === "f" || e.key === "F") markStep(firstPending, "fail");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepResults, activeIdx]);

  if (loading) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim">{t("execution.runs.loadingRun")}</span>
    </div>
  );

  if (!liveRun) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim">{t("execution.runs.runNotFound")}</span>
    </div>
  );

  const run = liveRun;
  const current = cases[activeIdx] || cases[0];
  const passCount = cases.filter(c => c.status === "pass").length;
  const failCount = cases.filter(c => c.status === "fail" || c.status === "blocked").length;

  return (
    <div style={{display:"grid", gridTemplateColumns:"320px 1fr 360px", height:"100%", overflow:"hidden"}}>
      {/* Left — queue */}
      <div style={{borderRight:"1px solid var(--border)", background:"var(--bg-2)", display:"flex", flexDirection:"column", overflow:"hidden"}}>
        <div style={{padding:"14px 14px 10px", borderBottom:"1px solid var(--border)"}}>
          <div style={{display:"flex", alignItems:"center", gap:8, fontSize:11.5, color:"var(--text-dim)", marginBottom:6}}>
            <button className="btn ghost sm" onClick={onBack} style={{padding:"2px 6px"}}>{t("execution.runs.backRuns")}</button>
            <span className="mono">{run.id}</span>
            <StatusBadge s={run.status} />
          </div>
          <div style={{fontSize:14, fontWeight:600, lineHeight:1.3}}>{run.name}</div>
          {run.source_run_id && (
            <div style={{fontSize:11, color:"var(--text-dim)", marginTop:2}}>
              {t("execution.runs.retestOf")} <a href={`#/runs/${run.source_run_id}`}
                style={{color:"var(--accent)", textDecoration:"none"}}
                onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.hash = `#/runs/${run.source_run_id}`; }}>
                {run.source_run_id}
              </a>
            </div>
          )}
          <div className="mono dim" style={{fontSize:11, marginTop:4}}>{run.branch} · {run.env}</div>
          <ProgressBar run={run} />
          <div style={{display:"flex", justifyContent:"space-between", marginTop:6, fontSize:10.5}} className="mono">
            <span style={{color:"var(--pass)"}}>✓ {passCount}</span>
            <span style={{color:"var(--fail)"}}>× {failCount}</span>
            <span className="dim">○ {cases.length - passCount - failCount}</span>
          </div>
          {window.can && window.can(currentUser, "write") && (run.status === "fail" || run.status === "completed") && failCount > 0 && (
            <button
              className="btn sm accent"
              style={{marginTop:6, width:"100%"}}
              onClick={handleRetest}
              disabled={retesting}
            >
              {retesting ? t("execution.runs.creatingRetest") : t("execution.runs.retestFailed", { count: failCount })}
            </button>
          )}
          <div style={{position:"relative", marginTop:6}}>
            <button
              className="btn sm"
              onClick={() => setExportOpen(o => !o)}
              disabled={exporting}
              style={{width:"100%"}}
            >
              {exporting ? t("execution.runs.exporting") : t("execution.runs.export")}
            </button>
            {exportOpen && (
              <>
                <div
                  aria-hidden="true"
                  style={{position:"fixed", inset:0, zIndex:99}}
                  onClick={() => setExportOpen(false)}
                />
                <div style={{
                  position:"absolute", top:"100%", left:0, zIndex:100,
                  background:"var(--bg-2)", border:"1px solid var(--border)",
                  borderRadius:"var(--radius)", minWidth:120, marginTop:4,
                  boxShadow:"0 4px 12px rgba(0,0,0,0.3)", overflow:"hidden"
                }}>
                  <div
                    style={{padding:"8px 12px", cursor:"pointer", fontSize:12}}
                    onClick={() => handleExport("csv")}
                  >CSV</div>
                  <div
                    style={{padding:"8px 12px", cursor:"pointer", fontSize:12}}
                    onClick={() => handleExport("pdf")}
                  >PDF</div>
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{overflowY:"auto", flex:1, padding:"6px 0"}}>
          {cases.length === 0 && (
            <div className="empty" style={{padding:"20px 14px", fontSize:12}}>{t("execution.runs.noCases")}</div>
          )}
          {cases.map((c, i) => (
            <div
              key={c.id}
              onClick={() => setActiveIdx(i)}
              style={{
                display:"grid",
                gridTemplateColumns: (window.can && window.can(currentUser, "manage"))
                  ? "20px 1fr 50px 90px" : "20px 1fr 50px",
                gap:8,
                alignItems:"center",
                padding:"7px 14px",
                cursor:"pointer",
                background: i === activeIdx ? "var(--surface-2)" : "transparent",
                borderLeft: i === activeIdx ? "2px solid var(--accent)" : "2px solid transparent",
                fontSize:12,
              }}
            >
              <div style={{
                width:16, height:16, borderRadius:"50%",
                display:"grid", placeItems:"center",
                background:
                  c.status === "pass" ? "var(--pass-soft)" :
                  c.status === "fail" ? "var(--fail-soft)" :
                  c.status === "running" ? "var(--accent-soft)" : "var(--surface-2)",
                color:
                  c.status === "pass" ? "var(--pass)" :
                  c.status === "fail" ? "var(--fail)" :
                  c.status === "running" ? "var(--accent)" : "var(--text-dim)",
                fontSize:9,
                fontFamily:"var(--font-mono)"
              }}>
                {c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : c.status === "running" ? "▶" : i+1}
              </div>
              <div style={{minWidth:0}}>
                <div style={{fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{c.title || c.test_id}</div>
                <div className="mono dim" style={{fontSize:10}}>{c.test_id}</div>
              </div>
              <div className="mono dim" style={{fontSize:10, textAlign:"right"}}>{c.duration || "—"}</div>
              {window.can && window.can(currentUser, "manage") && (
                <select
                  className="input"
                  style={{fontSize:10.5, padding:"1px 4px", width:90}}
                  value={c.assigned_to || ""}
                  onChange={e => {
                    e.stopPropagation();
                    const val = e.target.value || null;
                    window.TH_API.assignCase(liveRun.id, c.id, val)
                      .then(updated => {
                        setCases(prev => prev.map(x => x.id === c.id ? {...x, assigned_to: updated.assigned_to} : x));
                      })
                      .catch(() => {});
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <option value="">{t("execution.runs.unassigned")}</option>
                  {users.map(u => (
                    <option key={u.id} value={u.username}>{u.display_name || u.username}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
        {window.can && window.can(currentUser, "write") && (
          <div style={{padding:"10px 14px", borderTop:"1px solid var(--border)", display:"flex", gap:6}}>
            <button className="btn sm" style={{flex:1}} onClick={handlePause} disabled={run.status !== "running"}>{t("execution.runs.pause")}</button>
            <button className="btn sm" style={{flex:1, color:"var(--fail)"}} onClick={handleAbort} disabled={run.status === "aborted"}>{t("execution.runs.abort")}</button>
          </div>
        )}
      </div>

      {/* Middle — current test */}
      <div style={{display:"flex", flexDirection:"column", overflow:"hidden"}}>
        {current ? (
          <>
            <div style={{padding:"18px 22px 12px", borderBottom:"1px solid var(--border)"}}>
              <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:6}}>
                <span className="mono dim" style={{fontSize:11}}>{t("execution.runs.caseOf", { current: activeIdx + 1, total: cases.length })}</span>
                <StatusBadge s={current.status} />
                <div className="spacer" />
                {window.can && window.can(currentUser, "write") && (
                  <>
                    <button className="btn sm" disabled={marking} onClick={() => markCase("skip")}>{t("execution.runs.skip")}</button>
                    <button className="btn sm" style={{color:"var(--warn)"}} disabled={marking} onClick={() => markCase("blocked")}>{t("execution.runs.block")}</button>
                  </>
                )}
              </div>
              <h2 style={{fontSize:18, fontWeight:600, margin:"0 0 4px", letterSpacing:"-0.01em"}}>{current.title || current.test_id}</h2>
              <div style={{fontSize:11.5, color:"var(--text-muted)"}}>
                <span className="mono">{current.test_id}</span>
              </div>
            </div>

            <div style={{flex:1, overflowY:"auto"}}>
              <div className="card" style={{margin:"14px 22px", borderRadius:"var(--radius-lg)"}}>
                <div className="card-h">
                  <div className="card-title">{t("execution.runs.steps")}</div>
                  <div className="spacer" />
                  {testSteps.length > 0 && (
                    <div className="mono dim" style={{fontSize:11}}>
                      {t("execution.runs.done", { done: stepResults.filter(sr => sr.status !== "pending").length, total: testSteps.length })}
                    </div>
                  )}
                </div>
                {testSteps.length === 0 ? (
                  <div className="mono dim" style={{padding:"14px", fontSize:12}}>
                    {t("execution.runs.noSteps")}
                  </div>
                ) : (
                  <div>
                    {testSteps.map((ts, idx) => {
                      const sr = stepResults.find(r => r.test_step_id === ts.id);
                      const status = sr ? sr.status : "pending";
                      const isPass = status === "pass";
                      const isFail = status === "fail";
                      const isPending = status === "pending";
                      return (
                        <div key={ts.id} className={"step" + (isPending && idx === stepResults.filter(r => r.status !== "pending").length ? " active" : isPass ? " pass" : isFail ? " fail" : "")}>
                          <div className="step-num">
                            {isPass ? "✓" : isFail ? "✕" : idx + 1}
                          </div>
                          <div className="step-text">
                            <div>{ts.action}</div>
                            {ts.expected_result && (
                              <div className="expected">→ {ts.expected_result}</div>
                            )}
                            {sr && sr.actual_result && (
                              <div style={{fontSize:11, color:"var(--text-muted)", marginTop:4}}>
                                {t("execution.runs.actual")} {sr.actual_result}
                              </div>
                            )}
                          </div>
                          <div className="step-actions" style={{display:"flex", gap:4}}>
                            {isPending && window.can && window.can(currentUser, "write") && (
                              <>
                                <button
                                  className="btn ghost sm"
                                  style={{color:"var(--pass)", fontSize:11}}
                                  disabled={markingStep}
                                  onClick={() => markStep(sr || { test_step_id: ts.id, actual_result: null }, "pass")}
                                  title={t("execution.runs.passStepTitle")}
                                >P</button>
                                <button
                                  className="btn ghost sm"
                                  style={{color:"var(--fail)", fontSize:11}}
                                  disabled={markingStep}
                                  onClick={() => markStep(sr || { test_step_id: ts.id, actual_result: null }, "fail")}
                                  title={t("execution.runs.failStepTitle")}
                                >F</button>
                              </>
                            )}
                            {!isPending && (
                              <StatusBadge s={status} />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{padding:"0 22px 22px"}}>
                <div className="card">
                  <div className="card-h">
                    <div className="card-title">{t("execution.runs.evidence")}</div>
                    <div className="card-sub">{t("execution.runs.evidenceSubtitle")}</div>
                  </div>
                  <div style={{padding:14}}>
                    <FileDropZone
                      entityType="run_case"
                      entityId={current?.id ? String(current.id) : ""}
                      onUploaded={(att) => setAttachments(prev => [...prev, att])}
                    />
                    {attachments.length > 0 && (
                      <div style={{display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10, marginTop:12}}>
                        {attachments.map(att => (
                          <AttachmentCard
                            key={att.id}
                            att={att}
                            onDelete={(id) => setAttachments(prev => prev.filter(a => a.id !== id))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {window.can && window.can(currentUser, "write") && (
              <div style={{padding:"12px 22px", borderTop:"1px solid var(--border)", display:"flex", gap:8, background:"var(--bg-2)"}}>
                <textarea className="textarea" placeholder={t("execution.runs.caseNote")} value={caseNote} onChange={e => setCaseNote(e.target.value)} style={{flex:1, minHeight:38, padding:"8px 10px"}}></textarea>
                <div style={{display:"flex", flexDirection:"column", gap:6}}>
                  <button className="btn sm" style={{background:"var(--fail-soft)", color:"var(--fail)", borderColor:"oklch(from var(--fail) l c h / 0.3)"}} disabled={marking} onClick={() => markCase("fail")}>{t("execution.runs.markFail")} <span className="kbd">F</span></button>
                  <button className="btn sm" style={{background:"var(--pass-soft)", color:"var(--pass)", borderColor:"oklch(from var(--pass) l c h / 0.3)"}} disabled={marking} onClick={() => markCase("pass")}>{t("execution.runs.markPass")} <span className="kbd">P</span></button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
            <span className="mono dim">{t("execution.runs.selectCase")}</span>
          </div>
        )}
      </div>

      {/* Right — context */}
      <div style={{borderLeft:"1px solid var(--border)", background:"var(--bg-2)", overflowY:"auto"}}>
        <div style={{padding:14, borderBottom:"1px solid var(--border)"}}>
          <div className="card-title" style={{marginBottom:8}}>{t("execution.runs.environment")}</div>
          <div style={{display:"flex", flexDirection:"column", gap:6, fontSize:11.5}}>
            <Detail label={t("execution.runs.envLabel")} value={run.env ? <span className="tag">{run.env}</span> : <span className="mono dim">—</span>} />
            <Detail label={t("execution.runs.branch")} value={<span className="mono">{run.branch || "—"}</span>} />
            <Detail label={t("execution.runs.owner")} value={<span className="mono">{run.owner || "—"}</span>} />
          </div>
        </div>

        <div style={{padding:14, borderBottom:"1px solid var(--border)"}}>
          <div style={{display:"flex", alignItems:"center", marginBottom:8}}>
            <div className="card-title">{t("execution.runs.linkedDefects")}</div>
            {runDefects.length > 0 && <span className="count" style={{marginLeft:6}}>{runDefects.length}</span>}
            <div className="spacer" />
            {window.can && window.can(currentUser, "write") && (
              <button className="btn ghost sm" style={{fontSize:10.5}} onClick={() => setShowFileDefect(true)} title={t("execution.runs.fileDefect")} aria-label={t("execution.runs.fileDefect")}><Icon name="plus" /></button>
            )}
          </div>
          {runDefects.length === 0 ? (
            <div className="empty" style={{padding:"8px 0", textAlign:"left", fontSize:11.5}}>{t("execution.runs.noRunDefects")}</div>
          ) : (
            <div style={{display:"flex", flexDirection:"column", gap:4}}>
              {runDefects.map(d => {
                const color = d.status === "open" ? "var(--fail)" : d.status === "in_progress" ? "var(--warn)" : "var(--pass)";
                const sevClass = d.severity === "critical" || d.severity === "high" ? "priority-high" : d.severity === "med" ? "priority-med" : "priority-low";
                return (
                  <div key={d.id} style={{display:"flex", alignItems:"center", gap:6, fontSize:11.5}}>
                    <span className="mono" style={{color, minWidth:72}}>{d.id}</span>
                    <span style={{flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{d.title}</span>
                    <span className={"tag " + sevClass} style={{fontSize:10}}>{({ critical: "critical", high: "high", med: "med", low: "low" })[d.severity] ? t(`execution.defects.severityValue${({ critical: "Critical", high: "High", med: "Med", low: "Low" })[d.severity]}`) : d.severity}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showFileDefect && (
          <RunDefectModal
            runId={liveRun?.id}
            onClose={() => setShowFileDefect(false)}
            onCreated={(d) => { setRunDefects(prev => [...prev, d]); setShowFileDefect(false); }}
          />
        )}

        <div style={{padding:14}}>
          <div className="card-title" style={{marginBottom:8}}>{t("execution.runs.timeline")}</div>
          <div style={{display:"flex", flexDirection:"column", gap:6, fontSize:11.5}}>
            <TimelineItem time="" text={t("execution.runs.caseStarted", { id: current?.test_id || "—" })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepRunner({num, text, active, pass, fail}) {
  const { t } = useI18n();
  return (
    <div className={"step" + (active ? " active" : pass ? " pass" : fail ? " fail" : "")}>
      <div className="step-num">{pass ? "✓" : fail ? "✕" : num}</div>
      <div className="step-text">{text}</div>
      <div className="step-actions">
        {active && <span className="status info">{t("execution.overview.statusRunning")}</span>}
      </div>
    </div>
  );
}

function Evidence({label, sub}) {
  const { t } = useI18n();
  return (
    <div style={{border:"1px solid var(--border)", borderRadius:"var(--radius)", overflow:"hidden", background:"var(--bg-2)"}}>
      <div style={{height:80, background:"repeating-linear-gradient(45deg, var(--surface-2) 0 8px, var(--surface-3) 8px 16px)", display:"grid", placeItems:"center"}}>
        <span className="mono dim" style={{fontSize:10}}>{t("execution.runs.screenshot")}</span>
      </div>
      <div style={{padding:"6px 8px"}}>
        <div className="mono" style={{fontSize:11}}>{label}</div>
        <div className="mono dim" style={{fontSize:10}}>{sub}</div>
      </div>
    </div>
  );
}

function TimelineItem({time, text, warn}) {
  return (
    <div style={{display:"flex", gap:8, alignItems:"baseline"}}>
      <span className="mono dim" style={{fontSize:10, width:54, flexShrink:0}}>{time}</span>
      <span style={{color: warn ? "var(--fail)" : "var(--text-muted)"}}>{text}</span>
    </div>
  );
}

function NewPlanModal({ onClose, onCreated }) {
  const { t } = useI18n();
  const [tests, setTests] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [name, setName] = React.useState("");
  const [env, setEnv] = React.useState("staging");
  const [schedule, setSchedule] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/tests", { headers: window.authHeaders() })
      .then(r => r.json())
      .then(data => setTests(data))
      .catch(() => { if (window.TH_DATA) setTests(window.TH_DATA.tests || []); });
  }, []);

  const filtered = tests.filter(t =>
    !search ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSel = (id) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id));
  const someSelected = filtered.some(t => selected.has(t.id));
  const toggleAll = () => {
    setSelected(s => {
      const n = new Set(s);
      if (filtered.every(t => n.has(t.id))) filtered.forEach(t => n.delete(t.id));
      else filtered.forEach(t => n.add(t.id));
      return n;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { setError(t("execution.runs.planNameRequired")); return; }
    setSaving(true);
    setError(null);
    try {
      await window.TH_API.createPlan({
        name: name.trim(),
        env,
        schedule: (schedule ?? "Manual").trim() || "Manual",
        test_ids: [...selected],
      });
      onCreated();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const overlayStyle = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const panelStyle = {
    background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8,
    width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"center", padding:"16px 18px 14px", borderBottom:"1px solid var(--border)"}}>
          <div>
            <div style={{fontSize:14, fontWeight:600}}>{t("execution.runs.newTestPlan")}</div>
            <div style={{fontSize:11, color:"var(--text-dim)", marginTop:2}}>{t(selected.size === 1 ? "execution.runs.selectedTestsOne" : "execution.runs.selectedTests", { count: selected.size })}</div>
          </div>
          <button className="btn ghost icon sm" style={{marginLeft:"auto"}} onClick={onClose} aria-label={t("execution.overview.close")}><Icon name="x" /></button>
        </div>

        <div style={{padding:"14px 18px", display:"flex", flexDirection:"column", gap:12, borderBottom:"1px solid var(--border)"}}>
          <div>
            <div style={{fontSize:11, fontWeight:500, color:"var(--text-dim)", marginBottom:5}}>{t("execution.runs.planName")}</div>
            <input className="input" style={{width:"100%", boxSizing:"border-box"}} value={name}
              onChange={e => setName(e.target.value)} placeholder={t("execution.runs.planNamePlaceholder")} autoFocus />
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
            <div>
              <div style={{fontSize:11, fontWeight:500, color:"var(--text-dim)", marginBottom:5}}>{t("execution.runs.environmentLabel")}</div>
              <select className="input" value={env} onChange={e => setEnv(e.target.value)} style={{width:"100%"}}>
                <option value="staging">{t("execution.runs.environmentStaging")}</option>
                <option value="preview">{t("execution.runs.environmentPreview")}</option>
                <option value="local">{t("execution.runs.environmentLocal")}</option>
                <option value="production">{t("execution.runs.environmentProduction")}</option>
              </select>
            </div>
            <div>
              <div style={{fontSize:11, fontWeight:500, color:"var(--text-dim)", marginBottom:5}}>{t("execution.runs.scheduleLabel")}</div>
              <input className="input" style={{width:"100%", boxSizing:"border-box"}} value={schedule ?? t("execution.runs.manual")}
              onChange={e => setSchedule(e.target.value)} placeholder={t("execution.runs.schedulePlaceholder")} />
            </div>
          </div>
        </div>

        <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)"}}>
          <input className="input" style={{width:"100%", boxSizing:"border-box"}}
            placeholder={t("execution.runs.searchTests")} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filtered.length > 0 && (
          <label style={{display:"grid", gridTemplateColumns:"20px 1fr", gap:10, alignItems:"center",
            padding:"8px 18px", cursor:"pointer", fontSize:11.5, fontWeight:600, color:"var(--text-dim)",
            borderBottom:"1px solid var(--border)"}}>
            <input type="checkbox" checked={allSelected}
              ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
              onChange={toggleAll} />
            <span>{t(allSelected ? "execution.runs.deselectAll" : "execution.runs.selectAll")}{search ? t("execution.runs.matching") : ""} ({filtered.length})</span>
          </label>
        )}
        <div style={{overflowY:"auto", flex:1}}>
          {filtered.length === 0 && <div className="empty" style={{padding:"24px 18px", fontSize:12}}>{t("execution.runs.noMatchingTests")}</div>}
          {filtered.map(t => (
            <label key={t.id} style={{
              display:"grid", gridTemplateColumns:"20px 1fr auto", gap:10, alignItems:"center",
              padding:"8px 18px", cursor:"pointer", fontSize:12.5,
              background: selected.has(t.id) ? "var(--surface-2)" : "transparent",
            }}>
              <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} />
              <div>
                <div style={{fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{t.title}</div>
                <div className="mono dim" style={{fontSize:10.5}}>{t.id}{t.folder ? ` · ${t.folder}` : ""}</div>
              </div>
              <StatusBadge s={t.status} />
            </label>
          ))}
        </div>

        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:"1px solid var(--border)"}}>
          {error ? <span className="mono" style={{fontSize:11, color:"var(--danger)"}}>{error}</span> : <span className="mono dim" style={{fontSize:11}}>{t("execution.runs.selectedCount", { count: selected.size })}</span>}
          <div style={{display:"flex", alignItems:"center", gap:10}}>
            <button className="btn ghost" onClick={onClose}>{t("execution.runs.cancel")}</button>
            <button className="btn accent" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? t("execution.runs.saving") : t("execution.runs.createPlan")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewRunModal({ onClose, onCreated }) {
  const { t } = useI18n();
  const [step, setStep] = React.useState(1);
  const [tests, setTests] = React.useState([]);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState(new Set());
  const [name, setName] = React.useState("");
  const [env, setEnv] = React.useState("staging");
  const [branch, setBranch] = React.useState("main");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/tests", { headers: window.authHeaders() })
      .then(r => r.json())
      .then(data => setTests(data))
      .catch(() => { if (window.TH_DATA) setTests(window.TH_DATA.tests || []); });
  }, []);

  const filtered = tests.filter(t =>
    !search ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.id.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSel = (id) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const allSelected = filtered.length > 0 && filtered.every(t => selected.has(t.id));
  const someSelected = filtered.some(t => selected.has(t.id));
  const toggleAll = () => {
    setSelected(s => {
      const n = new Set(s);
      if (filtered.every(t => n.has(t.id))) filtered.forEach(t => n.delete(t.id));
      else filtered.forEach(t => n.add(t.id));
      return n;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError(t("execution.runs.runNameRequired")); return; }
    setCreating(true);
    setError(null);
    const runId = "R-" + Math.floor(1000 + Math.random() * 9000);
    try {
      const run = await window.TH_API.createRun({
        id: runId,
        name: name.trim(),
        status: "running",
        env,
        branch,
        test_ids: [...selected],
      });
      onCreated(run.id);
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  };

  const overlayStyle = {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const panelStyle = {
    background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8,
    width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden",
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{display:"flex", alignItems:"center", padding:"16px 18px 14px", borderBottom:"1px solid var(--border)"}}>
          <div>
            <div style={{fontSize:14, fontWeight:600}}>{step === 1 ? t("execution.runs.selectTests") : t("execution.runs.configureRun")}</div>
            <div style={{fontSize:11, color:"var(--text-dim)", marginTop:2}}>
              {step === 1 ? t("execution.runs.selectedCount", { count: selected.size }) : t(selected.size === 1 ? "execution.runs.willRunTest" : "execution.runs.willRunTests", { count: selected.size })}
            </div>
          </div>
          <button className="btn ghost icon sm" style={{marginLeft:"auto"}} onClick={onClose} aria-label={t("execution.overview.close")}><Icon name="x" /></button>
        </div>

        {step === 1 ? (
          <>
            <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)"}}>
              <input
                className="input"
                style={{width:"100%", boxSizing:"border-box"}}
                placeholder={t("execution.runs.searchByTitle")}
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            {filtered.length > 0 && (
              <label style={{display:"grid", gridTemplateColumns:"20px 1fr", gap:10, alignItems:"center",
                padding:"8px 18px", cursor:"pointer", fontSize:11.5, fontWeight:600, color:"var(--text-dim)",
                borderBottom:"1px solid var(--border)"}}>
                <input type="checkbox" checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                  onChange={toggleAll} />
                <span>{t(allSelected ? "execution.runs.deselectAll" : "execution.runs.selectAll")}{search ? t("execution.runs.matching") : ""} ({filtered.length})</span>
              </label>
            )}
            <div style={{overflowY:"auto", flex:1}}>
              {filtered.length === 0 && (
                <div className="empty" style={{padding:"24px 18px", fontSize:12}}>{t("execution.runs.noMatchingTests")}</div>
              )}
              {filtered.map(t => (
                <label
                  key={t.id}
                  style={{
                    display:"grid", gridTemplateColumns:"20px 1fr auto",
                    gap:10, alignItems:"center",
                    padding:"8px 18px", cursor:"pointer", fontSize:12.5,
                    background: selected.has(t.id) ? "var(--surface-2)" : "transparent",
                  }}
                >
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSel(t.id)} />
                  <div>
                    <div style={{fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{t.title}</div>
                    <div className="mono dim" style={{fontSize:10.5}}>{t.id}{t.folder ? ` · ${t.folder}` : ""}</div>
                  </div>
                  <StatusBadge s={t.status} />
                </label>
              ))}
            </div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:"1px solid var(--border)"}}>
              <button className="btn ghost" onClick={onClose}>{t("execution.runs.cancel")}</button>
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <span className="mono dim" style={{fontSize:11}}>{t("execution.runs.selectedCount", { count: selected.size })}</span>
                <button className="btn accent" onClick={() => setStep(2)} disabled={selected.size === 0}>
                  {t("execution.runs.configure")}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{padding:"18px", display:"flex", flexDirection:"column", gap:14, overflowY:"auto", flex:1}}>
              <div>
                <div style={{fontSize:11, fontWeight:500, color:"var(--text-dim)", marginBottom:5}}>{t("execution.runs.runName")}</div>
                <input
                  className="input"
                  style={{width:"100%", boxSizing:"border-box"}}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t("execution.runs.runNamePlaceholder")}
                  autoFocus
                />
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
                <div>
                  <div style={{fontSize:11, fontWeight:500, color:"var(--text-dim)", marginBottom:5}}>{t("execution.runs.environmentLabel")}</div>
                  <select className="input" value={env} onChange={e => setEnv(e.target.value)} style={{width:"100%"}}>
                    <option value="staging">{t("execution.runs.environmentStaging")}</option>
                    <option value="preview">{t("execution.runs.environmentPreview")}</option>
                    <option value="local">{t("execution.runs.environmentLocal")}</option>
                    <option value="production">{t("execution.runs.environmentProduction")}</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11, fontWeight:500, color:"var(--text-dim)", marginBottom:5}}>{t("execution.runs.branchLabel")}</div>
                  <input
                    className="input"
                    style={{width:"100%", boxSizing:"border-box"}}
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    placeholder="main"
                  />
                </div>
              </div>
              {error && <div style={{color:"var(--fail)", fontSize:12}}>{error}</div>}
            </div>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 18px", borderTop:"1px solid var(--border)"}}>
              <button className="btn ghost" onClick={() => setStep(1)}>{t("execution.runs.back")}</button>
              <button className="btn accent" onClick={handleCreate} disabled={creating || !name.trim()}>
                {creating ? t("execution.runs.creating") : t("execution.runs.createStart")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RunDefectModal({ runId, onClose, onCreated }) {
  const { t } = useI18n();
  const modal = useModal(onClose);
  const [form, setForm] = useState({ title: "", severity: "med", description: "" });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const d = await TH_API.createDefect({
        title: form.title.trim(),
        severity: form.severity,
        description: form.description.trim() || null,
        run_id: runId,
      });
      onCreated(d);
    } catch (e) {}
    setSaving(false);
  };

  return (
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center"}} {...modal.overlayProps}>
      <div style={{background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, padding:24, width:440}} {...modal.dialogProps}>
        <h2 style={{fontSize:15, fontWeight:600, margin:"0 0 16px"}}>{t("execution.runs.fileDefectFor", { id: runId })}</h2>
        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <div>
            <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.runs.titleLabel")}</label>
            <input className="input" style={{width:"100%", boxSizing:"border-box"}} value={form.title} placeholder={t("execution.runs.describeBug")} onChange={e => setForm(f => ({...f, title: e.target.value}))} autoFocus />
          </div>
          <div>
            <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.runs.descriptionOptional")}</label>
            <textarea className="textarea" style={{width:"100%", boxSizing:"border-box", minHeight:56}} value={form.description} placeholder={t("execution.runs.reproSteps")} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
          </div>
          <div>
            <label style={{fontSize:11, color:"var(--text-dim)", textTransform:"uppercase", letterSpacing:"0.06em", display:"block", marginBottom:4}}>{t("execution.runs.severity")}</label>
            <select className="input" value={form.severity} onChange={e => setForm(f => ({...f, severity: e.target.value}))}>
              <option value="critical">{t("execution.runs.critical")}</option>
              <option value="high">{t("execution.runs.high")}</option>
              <option value="med">{t("execution.runs.medium")}</option>
              <option value="low">{t("execution.runs.low")}</option>
            </select>
          </div>
        </div>
        <div style={{display:"flex", gap:8, justifyContent:"flex-end", marginTop:20}}>
          <button className="btn" onClick={onClose}>{t("execution.runs.cancel")}</button>
          <button className="btn accent" onClick={handleCreate} disabled={saving || !form.title.trim()}>
            {saving ? t("execution.runs.filing") : t("execution.runs.fileDefect")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FileDropZone({ entityType, entityId, onUploaded }) {
  const { t } = useI18n();
  const [dragging, setDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const handleFiles = async (files) => {
    if (!files.length || !entityId) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const att = await TH_API.uploadAttachment(entityType, entityId, file);
        onUploaded(att);
      }
    } catch (e) {
      setError(t("execution.runs.uploadFailed", { error: e.message }));
    }
    setUploading(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
          borderRadius: "var(--radius)",
          padding: 16,
          textAlign: "center",
          fontSize: 12,
          color: "var(--text-dim)",
          transition: "border-color .15s",
        }}
      >
        {uploading ? t("execution.runs.uploading") : (
          <>
        {t("execution.runs.dropFiles")} {" "}
            <label style={{ color: "var(--accent)", cursor: "pointer" }}>
              {t("execution.runs.browse")}
              <input
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={e => handleFiles(e.target.files)}
              />
            </label>
          </>
        )}
      </div>
      {error && <div style={{color:"var(--fail)", fontSize:11, marginTop:4}}>{error}</div>}
    </div>
  );
}

function AttachmentCard({ att, onDelete }) {
  const { t } = useI18n();
  const isImage = att.mime_type && att.mime_type.startsWith("image/");
  const handleDelete = async () => {
    try {
      await TH_API.deleteAttachment(att.id);
      onDelete(att.id);
    } catch (e) {}
  };
  return (
    <div style={{border:"1px solid var(--border)", borderRadius:"var(--radius)", overflow:"hidden", background:"var(--bg-2)"}}>
      {isImage ? (
        <img
          src={`/api/attachments/${att.id}`}
          alt={att.filename}
          style={{width:"100%", height:80, objectFit:"cover", display:"block"}}
          onError={e => { e.target.style.display="none"; }}
        />
      ) : (
        <div style={{height:80, background:"var(--surface-2)", display:"grid", placeItems:"center"}}>
          <span className="mono dim" style={{fontSize:10}}>
            {att.mime_type || "file"}
          </span>
        </div>
      )}
      <div style={{padding:"6px 8px", display:"flex", alignItems:"center", gap:4}}>
        <a
          href={`/api/attachments/${att.id}`}
          target="_blank"
          className="mono"
          style={{fontSize:11, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:"var(--text)"}}
        >{att.filename}</a>
        <button
          className="btn ghost icon sm"
          style={{color:"var(--fail)", padding:"1px 4px", fontSize:10}}
          onClick={handleDelete}
          title={t("execution.runs.deleteAttachment")}
        >×</button>
      </div>
    </div>
  );
}

window.RunDetail = RunDetail;
window.Runs = Runs;
