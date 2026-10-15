// ThoroTest — My Work view

const { useState, useEffect } = React;

function MyWork({ currentUser }) {
  const { t } = useI18n();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    window.TH_API.getMyCases()
      .then(data => {
        setGroups(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim">{t("execution.myWork.loading")}</span>
    </div>
  );

  if (error) return (
    <div style={{display:"flex", height:"100%", alignItems:"center", justifyContent:"center"}}>
      <span className="mono dim" style={{color:"var(--fail)"}}>{t("execution.myWork.loadError")}</span>
    </div>
  );

  const statusColor = s =>
    s === "pass" ? "var(--pass)" :
    s === "fail" ? "var(--fail)" :
    s === "running" ? "var(--accent)" :
    s === "blocked" ? "var(--warn)" : "var(--text-dim)";

  const statusLabel = s =>
    s === "pass" ? t("execution.myWork.pass") :
    s === "fail" ? t("execution.myWork.fail") :
    s === "running" ? t("execution.myWork.running") :
    s === "blocked" ? t("execution.myWork.blocked") : t("execution.myWork.pending");

  return (
    <div style={{padding:"24px 28px", maxWidth:900}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:20, fontWeight:700, margin:"0 0 4px"}}>{t("execution.myWork.title")}</h1>
        <p style={{fontSize:12.5, color:"var(--text-dim)", margin:0}}>
          {t("execution.myWork.subtitle")}
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="empty" style={{padding:"40px 0", fontSize:13, textAlign:"center", color:"var(--text-dim)"}}>
          {t("execution.myWork.empty")}
        </div>
      ) : (
        groups.map(group => (
          <div key={group.run.id} style={{marginBottom:28}}>
            <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
              <a
                href={`#/runs/${group.run.id}`}
                style={{fontSize:14, fontWeight:600, color:"var(--text)", textDecoration:"none"}}
                onClick={e => { e.preventDefault(); window.location.hash = `#/runs/${group.run.id}`; }}
              >
                {group.run.name}
              </a>
              <span className="mono dim" style={{fontSize:11}}>{group.run.id}</span>
              <span className="mono" style={{fontSize:10.5, color: statusColor(group.run.status), textTransform:"capitalize"}}>
                {t(`execution.myWork.runStatus${({ running: "Running", pass: "Pass", fail: "Fail", blocked: "Blocked", pending: "Pending", paused: "Paused", aborted: "Aborted", completed: "Completed" })[group.run.status] || "Pending"}`)}
              </span>
            </div>
            <div style={{border:"1px solid var(--border)", borderRadius:6, overflow:"hidden"}}>
              <div style={{
                display:"grid",
                gridTemplateColumns:"1fr 160px 90px",
                gap:0,
                padding:"6px 14px",
                background:"var(--bg-2)",
                fontSize:11,
                fontWeight:600,
                color:"var(--text-dim)",
                borderBottom:"1px solid var(--border)",
              }}>
                <div>{t("execution.myWork.caseTitle")}</div>
                <div>{t("execution.myWork.run")}</div>
                <div>{t("execution.myWork.status")}</div>
              </div>
              {group.cases.map(c => (
                <div key={c.id} style={{
                  display:"grid",
                  gridTemplateColumns:"1fr 160px 90px",
                  gap:0,
                  padding:"9px 14px",
                  fontSize:12.5,
                  borderBottom:"1px solid var(--border)",
                  background:"var(--bg)",
                }}>
                  <div style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                    {c.title || c.test_id}
                    <span className="mono dim" style={{fontSize:10.5, marginLeft:6}}>{c.test_id}</span>
                  </div>
                  <div style={{color:"var(--text-dim)", fontSize:11.5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>
                    {group.run.name}
                  </div>
                  <div style={{color: statusColor(c.status), fontSize:11.5}}>
                    {statusLabel(c.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

window.MyWork = MyWork;
