// Pipelines, Insights, Integrations, Landing — remaining views

function Pipelines({ currentUser }) {
  const { t, lang } = useI18n();
  const { data: D, loading, error } = useInitialData();
  const [rows, setRows] = React.useState(null);
  const canManage = window.can && window.can(currentUser, "manage");

  // Seed the table from initial-data on first load.
  React.useEffect(() => { if (D?.pipelines) setRows(D.pipelines); }, [D]);

  // While a dispatch is still running, poll so it flips to pass/fail live
  // (a "Run CI" writes a running row that finishes a bit later).
  const anyRunning = (rows || []).some(p => p.status === "running");
  React.useEffect(() => {
    if (!anyRunning || !canManage) return;
    let inFlight = false;   // reconcile hits the CI provider — don't stack calls
    const id = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        // Re-query the provider for stuck 'running' rows and refresh in one round-trip.
        const { pipelines } = await TH_API.reconcilePipelines();
        if (pipelines) setRows(pipelines);
      } catch {}
      finally { inFlight = false; }
    }, 5000);
    return () => clearInterval(id);
  }, [anyRunning, canManage]);

  async function del(id, name, e) {
    e.stopPropagation();   // don't also open the run URL
    if (!window.confirm(t("misc.pipelines.removeConfirm", { name }))) return;
    try {
      await TH_API.deletePipeline(id);
      setRows(rs => (rs || []).filter(p => p.id !== id));
    } catch (err) {
      window.alert(err.message);
    }
  }

  // Row expansion → individual test cases of the imported run.
  const [expanded, setExpanded] = React.useState(null);   // pipeline id or null
  const [cases, setCases] = React.useState({});           // id → { loading, error, items }

  async function toggleExpand(p, e) {
    e.stopPropagation();   // don't also open the run URL
    if (expanded === p.id) { setExpanded(null); return; }
    setExpanded(p.id);
    if (!cases[p.id]) {
      setCases(c => ({ ...c, [p.id]: { loading: true } }));
      try {
        const items = await TH_API.pipelineCases(p.id);
        setCases(c => ({ ...c, [p.id]: { items } }));
      } catch (err) {
        setCases(c => ({ ...c, [p.id]: { error: err.message } }));
      }
    }
  }

  if (loading) return (
    <div className="page fade-in">
      <div className="empty">{t("misc.common.loading")}</div>
    </div>
  );

  if (!D) return (
    <div className="page fade-in">
      <div className="empty">{t("misc.pipelines.loadError", { error: error ? `: ${error}` : "" })}</div>
    </div>
  );

  const list = rows || D.pipelines;
  const formatWhen = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };

  return (
    <div className="page fade-in">
      <div className="page-h">
        <div>
          <h1 className="page-title">{t("misc.pipelines.title")}</h1>
          <div className="page-sub">{t("misc.pipelines.subtitle")}</div>
        </div>
        {anyRunning && <div className="card-sub" style={{alignSelf:"center"}}>● {t("misc.pipelines.liveRefreshing")}</div>}
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div className="card-h">
          <div>
            <div className="card-title">{t("misc.pipelines.recentRuns")}</div>
            <div className="card-sub">{t("misc.pipelines.recentRunsSubtitle")}</div>
          </div>
        </div>
        {list.length === 0 ? (
          <div className="empty" style={{padding:"48px 18px", textAlign:"center"}}>
            <div style={{fontSize:13, marginBottom:6}}>{t("misc.pipelines.empty")}</div>
            <div className="mono dim" style={{fontSize:11}}>
              {t("misc.pipelines.emptyHint")}
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{width:36}}></th>
                <th>{t("misc.pipelines.workflow")}</th>
                <th style={{width:100}}>{t("misc.pipelines.status")}</th>
                <th style={{width:100}}>{t("misc.pipelines.duration")}</th>
                <th style={{width:120}}>{t("misc.pipelines.commit")}</th>
                <th style={{width:100}}>{t("misc.pipelines.branch")}</th>
                <th style={{width:120}}>{t("misc.pipelines.author")}</th>
                <th style={{width:100}}>{t("misc.pipelines.when")}</th>
                <th style={{width:40}}></th>
              </tr>
            </thead>
            <tbody>
              {list.map(p => {
                const isOpen = expanded === p.id;
                const cs = cases[p.id];
                return (
                <React.Fragment key={p.id}>
                <tr
                    style={p.url ? {cursor:"pointer"} : undefined}
                    title={p.url ? t("misc.pipelines.openRun") : undefined}
                    onClick={p.url ? () => window.open(p.url, "_blank", "noopener,noreferrer") : undefined}>
                  <td>
                    {p.run_id ? (
                      <button className="btn ghost icon sm"
                              title={isOpen ? t("misc.pipelines.collapse") : t("misc.pipelines.showCases")}
                              onClick={e => toggleExpand(p, e)}
                              style={{transform: isOpen ? "rotate(90deg)" : "none", transition:"transform .12s"}}>
                        <Icon name="chev" />
                      </button>
                    ) : (
                      <span style={{display:"inline-flex", width:18, height:18}}>
                        {p.platform === "github" ? I.github : p.platform === "gitlab" ? I.gitlab : I.jenkins}
                      </span>
                    )}
                  </td>
                  <td>{p.name}{p.url && <span className="dim" style={{marginLeft:6, fontSize:11}}>↗</span>}</td>
                  <td><StatusBadge s={p.status} /></td>
                  <td className="mono dim">{p.duration}</td>
                  <td className="mono" style={{color:"var(--accent)"}}>{p.commit}</td>
                  <td className="mono dim">{p.branch}</td>
                  <td className="mono dim">{p.author}</td>
                  <td className="mono dim">{formatWhen(p.when)}</td>
                  <td>
                    <button className="btn ghost icon sm" title={t("misc.pipelines.removeFromList")}
                            style={{color:"var(--fail)"}}
                            onClick={e => del(p.id, p.name, e)}>
                      <Icon name="x" />
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="pipeline-cases-row">
                    <td></td>
                    <td colSpan={8} style={{padding:0}}>
                      {cs?.loading && <div className="dim" style={{padding:"8px 4px", fontSize:12}}>{t("misc.pipelines.loadingCases")}</div>}
                      {cs?.error && <div style={{padding:"8px 4px", fontSize:12, color:"var(--fail)"}}>{cs.error}</div>}
                      {cs?.items && cs.items.length === 0 && (
                        <div className="dim" style={{padding:"8px 4px", fontSize:12}}>{t("misc.pipelines.noCases")}</div>
                      )}
                      {cs?.items && cs.items.length > 0 && (
                        <table className="table" style={{margin:"2px 0 6px", background:"var(--bg-2)"}}>
                          <tbody>
                            {cs.items.map(c => (
                              <tr key={c.id}>
                                <td className="mono dim" style={{width:120}}>{c.test_id}</td>
                                <td>{c.title}</td>
                                <td style={{width:100}}><StatusBadge s={c.status} /></td>
                                <td className="mono dim" style={{width:90}}>{c.duration || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Insights() {
  const { t } = useI18n();
  const [ins, setIns] = React.useState(null);
  const [insLoading, setInsLoading] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/insights', { headers: window.authHeaders() })
      .then(r => r.json())
      .then(data => { setIns(data); setInsLoading(false); })
      .catch(() => setInsLoading(false));
  }, []);

  const totalTests = ins ? String(ins.total_tests) : "—";
  const automationRate = ins ? `${ins.automation_rate}%` : "—";
  const folderCoverage = ins ? ins.folder_coverage : null;

  return (
    <div className="page fade-in">
      <div className="page-h">
        <div>
          <h1 className="page-title">{t("misc.insights.title")}</h1>
          <div className="page-sub">{t("misc.insights.subtitle")}</div>
        </div>
      </div>

      <div className="grid grid-4" style={{marginBottom:14}}>
        <Metric label={t("misc.insights.testCases")} value={insLoading ? "…" : totalTests} />
        <Metric label={t("misc.insights.automationRate")} value={insLoading ? "…" : automationRate} />
        <Metric label={t("misc.insights.passRate")} value={insLoading ? "…" : (ins && ins.pass_rate != null ? `${ins.pass_rate}%` : "—")} />
        <Metric label={t("misc.insights.openDefects")} value={insLoading ? "…" : (ins && ins.open_defects != null ? String(ins.open_defects) : "—")} />
      </div>

      <div className="grid grid-2" style={{marginBottom:14}}>
        <div className="card">
          <div className="card-h"><div className="card-title">{t("misc.insights.coverageByArea")}</div></div>
          <div className="card-b" style={{display:"flex", flexDirection:"column", gap:10}}>
            {folderCoverage && folderCoverage.length > 0 ? (
              folderCoverage.map((f, i) => (
                <CoverageRow key={i} label={f.name} value={f.value} mapped={f.mapped} warn={f.value < 60} />
              ))
            ) : (
              <div className="mono dim" style={{fontSize:11.5, padding:"8px 0"}}>
                {insLoading ? t("misc.common.loading") : t("misc.insights.noCoverage")}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div className="card-title">{t("misc.insights.flakyTests")}</div><div className="card-sub">{t("misc.insights.flakyThreshold")}</div></div>
          <table className="table">
            <tbody>
              {ins && ins.top_flaky && ins.top_flaky.length > 0 ? (
                ins.top_flaky.map(r => (
                  <tr key={r.id}>
                    <td className="mono" style={{width:80}}>{r.id}</td>
                    <td style={{fontSize:12}}>{r.title}</td>
                    <td className="mono" style={{color:"var(--fail)", width:50, textAlign:"right"}}>{r.fail_rate}%</td>
                    <td className="mono dim" style={{width:60, textAlign:"right"}}>{t("misc.insights.runCount", { count: r.total_runs })}</td>
                  </tr>
                ))
              ) : insLoading ? (
                <tr><td colSpan={4} style={{textAlign:"center", color:"var(--text-dim)", fontSize:12}}>{t("misc.common.loading")}</td></tr>
              ) : (
                <tr><td colSpan={4} style={{textAlign:"center", color:"var(--text-dim)", fontSize:12}}>{t("misc.insights.noFlakyTests")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-h"><div className="card-title">{t("misc.insights.manualVsAutomated")}</div><div className="card-sub">{t("misc.insights.libraryShare")}</div></div>
          <div className="card-b">
            <div className="bar" style={{height:10}}>
              <span className="seg-pass" style={{width:`${ins ? ins.automation_rate : 0}%`}} />
              <span style={{background:"var(--info)", width:`${100 - (ins ? ins.automation_rate : 0)}%`}} />
            </div>
            <div style={{display:"flex", justifyContent:"space-between", marginTop:8, fontSize:11}}>
              <span className="mono"><span style={{color:"var(--accent)"}}>●</span> {t("misc.insights.automatedPercent", { count: ins ? ins.automation_rate : 0 })}</span>
              <span className="mono"><span style={{color:"var(--info)"}}>●</span> {t("misc.insights.manualPercent", { count: 100 - (ins ? ins.automation_rate : 0) })}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h"><div className="card-title">{t("misc.insights.defectsBySeverity")}</div></div>
          <div className="card-b" style={{display:"flex", flexDirection:"column", gap:10}}>
            {insLoading ? (
              <div className="mono dim" style={{fontSize:11.5}}>{t("misc.common.loading")}</div>
            ) : ins && ins.open_defects > 0 ? (
              <>
                <CoverageRow label={t("misc.insights.critical")} value={Math.round((ins.open_critical || 0) / ins.open_defects * 100)} mapped={`${ins.open_critical || 0}/${ins.open_defects}`} warn />
                <CoverageRow label={t("misc.insights.high")} value={Math.round((ins.open_high || 0) / ins.open_defects * 100)} mapped={`${ins.open_high || 0}/${ins.open_defects}`} warn />
              </>
            ) : (
              <div className="mono dim" style={{fontSize:11.5, padding:"8px 0"}}>{t("misc.insights.noOpenDefects")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CoverageRow({label, value, mapped, warn}) {
  return (
    <div>
      <div style={{display:"flex", justifyContent:"space-between", marginBottom:4, fontSize:12}}>
        <span>{label}</span>
        <span className="mono dim" style={{fontSize:11}}>{mapped} <b style={{color: warn ? "var(--warn)" : "var(--text)"}}>{value}%</b></span>
      </div>
      <div className="bar">
        <span style={{width:`${value}%`, background: warn ? "var(--warn)" : "var(--accent)"}} />
      </div>
    </div>
  );
}

window.Pipelines = Pipelines;
window.Insights = Insights;
