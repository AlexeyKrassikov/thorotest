async function workspaceRequest(path, method = "GET", data, headers = {}) {
  const response = await fetch("/api" + path, { method, headers: { ...window.authHeaders(), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(typeof result.detail === "string" ? result.detail : window.TH_I18N.t("api.requestFailed"));
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
window.workspaceRequest = workspaceRequest;

function ProjectSelector({ currentUser, onReady, onChanging }) {
  const { t } = useI18n();
  const [projects, setProjects] = React.useState([]);
  const [selected, setSelected] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const serial = React.useRef(0);
  async function choose(project) {
    if (window.TH_EDITOR_DIRTY && !confirm(t("editor.leaveConfirm"))) return;
    const version = ++serial.current;
    setBusy(true); setError(""); onChanging();
    window.TH_PROJECT = project || null;
    setSelected(project?.id || "");
    try {
      localStorage.setItem("th_project_" + currentUser.id, project?.id || "");
    } catch (_) {}
    try {
      if (project) await window.TH_API.init();
      else window.TH_DATA = { tests: [], folders: [], runs: [], defects: [], pipelines: [], activity: [] };
      if (serial.current === version) onReady();
    } catch (e) { if (serial.current === version) setError(e.message); }
    finally { if (serial.current === version) setBusy(false); }
  }
  React.useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const data = await workspaceRequest("/projects");
        if (!live) return;
        setProjects(data);
        let saved = "";
        try { saved = localStorage.getItem("th_project_" + currentUser.id); } catch (_) {}
        await choose(data.find(p => p.id === saved) || data[0]);
      } catch (e) { if (live) setError(e.message); }
    };
    load();
    window.addEventListener("projects-changed", load);
    return () => { live = false; ++serial.current; window.removeEventListener("projects-changed", load); };
  }, [currentUser.id]);
  return <div className="project-bar">
    <label>{t("editor.project")} <select className="input" aria-label={t("editor.project")} value={selected} disabled={busy} onChange={e => choose(projects.find(p => p.id === e.target.value))}>
      <option value="">{t("editor.chooseProject")}</option>
      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <a className="btn ghost" href="#/settings">{t("editor.manageProjects")}</a>
    {error && <span role="alert">{error}</span>}
  </div>;
}
window.ProjectSelector = ProjectSelector;

function UserTable({ users, renderRole, renderStatus, renderActions }) {
  const { t } = useI18n();
  return <div className="user-table-scroll"><table className="user-table">
    <thead><tr>
      <th>{t("common.name")}</th><th>{t("login.email")}</th><th>{t("workspace.admin.username")}</th>
      <th>{t("admin.role")}</th>{renderStatus && <th>{t("workspace.security.status")}</th>}<th>{t("workspace.admin.actions")}</th>
    </tr></thead>
    <tbody>{users.map(user => <tr key={user.id}>
      <td>{user.display_name || "—"}</td><td>{user.email || "—"}</td><td>{user.username}</td>
      <td>{renderRole(user)}</td>{renderStatus && <td>{renderStatus(user)}</td>}<td>{renderActions(user)}</td>
    </tr>)}</tbody>
  </table></div>;
}
window.UserTable = UserTable;

function ProjectMembers({ projectId }) {
  const { t } = useI18n();
  const [members, setMembers] = React.useState([]);
  const [candidates, setCandidates] = React.useState([]);
  const [selected, setSelected] = React.useState("");
  const [role, setRole] = React.useState("viewer");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const base = "/projects/" + encodeURIComponent(projectId);
  async function load() { setMembers(await workspaceRequest(base + "/members")); }
  React.useEffect(() => { setLoading(true); load().catch(e => setError(e.message)).finally(() => setLoading(false)); workspaceRequest(base + "/candidates").then(setCandidates).catch(e => setError(e.message)); }, [projectId]);
  async function change(id, next) {
    setBusy(true); setError("");
    try {
      await workspaceRequest(base + "/members/" + id, next ? "PUT" : "DELETE", next ? { role: next } : undefined);
      await load();
      setSelected("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const roles = ["owner", "editor", "viewer"];
  return <section className="project-members"><h3>{t("editor.collaborators")}</h3>
    {loading ? <p role="status">{t("common.loading")}</p> : members.length ? <UserTable users={members.map(m => ({ ...m, id: m.user_id }))}
      renderRole={member => <select className="input" aria-label={member.username} value={member.role} disabled={busy} onChange={e => change(member.user_id, e.target.value)}>{roles.map(r => <option key={r} value={r}>{t("editor." + r)}</option>)}</select>}
      renderActions={member => <button className="btn icon" title={t("editor.removeMember")} disabled={busy} onClick={() => { if (confirm(t("editor.removeMemberConfirm"))) change(member.user_id, null); }}><Icon name="x" /></button>}
    /> : <p className="dim">{t("editor.noMembers")}</p>}
    <div className="member-row">
      <select className="input" aria-label={t("editor.collaborator")} value={selected} onChange={e => setSelected(e.target.value)}><option value="">{t("editor.collaborator")}</option>{candidates.filter(u => !members.some(m => m.user_id === u.id)).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}</select>
      <select className="input" aria-label={t("editor.role")} value={role} onChange={e => setRole(e.target.value)}>{roles.map(r => <option key={r} value={r}>{t("editor." + r)}</option>)}</select>
      <button className="btn icon" title={t("editor.addMember")} disabled={busy || !selected} onClick={() => change(selected, role)}><Icon name="plus" /></button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
window.ProjectMembers = ProjectMembers;
