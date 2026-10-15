function PasskeySettings() {
  const { t } = useI18n();
  const [keys, setKeys] = React.useState([]);
  const [devices, setDevices] = React.useState([]);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [confirmed, setConfirmed] = React.useState(false);
  const api = window.TH_API;
  async function load() {
    setKeys(await api.securityRequest("/me/passkeys"));
    setDevices(await api.securityRequest("/me/trusted-devices"));
  }
  React.useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function run(action) {
    setBusy(true); setError(null);
    try { await action(); await load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function add() {
    const start = await api.securityRequest("/me/passkeys/register/options", "POST", {});
    const credential = await window.TH_PASSKEYS.ceremony(start.options, true);
    const result = await api.securityRequest("/me/passkeys/register/verify", "POST", {
      challenge_id: start.challenge_id, credential, name: name.trim() || t("workspace.security.thisBrowser"),
    });
    setName(""); setCodes(result.recovery_codes || []);
  }
  async function confirmPasskey() {
    const start = await api.securityRequest("/me/security/passkey/options", "POST", {});
    const credential = await window.TH_PASSKEYS.ceremony(start.options, false);
    await api.securityRequest("/me/security/passkey/verify", "POST", { challenge_id: start.challenge_id, credential });
    setConfirmed(true);
  }
  return <section style={{ marginTop: 28, maxWidth: 700 }}>
    <h3 style={{ fontSize: 16 }}>{t("workspace.security.passkeys")}</h3>
    {error && <p role="alert" style={{ color: "var(--fail)" }}>{error}</p>}
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
      <input className="input" style={{ minWidth: 0, flex: "1 1 160px" }} value={name} maxLength={100}
        aria-label={t("workspace.security.keyName")} placeholder={t("workspace.security.keyName")}
        onChange={e => setName(e.target.value)} />
      <button className="btn" disabled={busy} onClick={() => run(add)}>{t("workspace.security.addPasskey")}</button>
    </div>
    {keys.map(key => <div key={key.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ flex: 1, overflowWrap: "anywhere" }}>{key.name}</span>
      <button className="btn" disabled={busy} onClick={() => {
        if (confirm(t("workspace.security.deleteKey"))) run(() => api.securityRequest("/me/passkeys/" + key.id, "DELETE"));
      }}>{t("common.delete")}</button>
    </div>)}
    <h3 style={{ fontSize: 16, marginTop: 24 }}>{t("workspace.security.confirmIdentity")}</h3>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {keys.length > 0 && <button className="btn" disabled={busy} onClick={() => run(confirmPasskey)}>{t("workspace.security.usePasskey")}</button>}
      <input className="input" style={{ minWidth: 0, width: 160 }} value={code} maxLength={6} inputMode="numeric"
        aria-label={t("login.code")} placeholder={t("login.code")} onChange={e => setCode(e.target.value)} />
      <button className="btn" disabled={busy || !code} onClick={() => run(async () => {
        await api.securityRequest("/me/security/totp", "POST", { code }); setCode(""); setConfirmed(true);
      })}>{t("login.verify")}</button>
    </div>
    {confirmed && <p role="status">{t("workspace.security.confirmed")}</p>}
    {keys.length > 0 && <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => run(async () => {
      const result = await api.securityRequest("/me/security/recovery-codes", "POST", {}); setCodes(result.recovery_codes);
    })}>{t("workspace.settings.regenerateRecoveryCodes")}</button>}
    {codes.length > 0 && <div role="dialog" aria-label={t("workspace.settings.regenerateRecoveryCodes")} style={{ marginTop: 16 }}>
      <pre style={{ whiteSpace: "pre-wrap" }}>{codes.join("\n")}</pre>
      <button className="btn" onClick={() => setCodes([])}>{t("workspace.settings.done")}</button>
    </div>}
    <h3 style={{ fontSize: 16, marginTop: 24 }}>{t("workspace.security.devices")}</h3>
    {devices.length === 0 && <p>{t("workspace.security.noDevices")}</p>}
    {devices.map(device => <div key={device.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ flex: "1 1 160px", overflowWrap: "anywhere" }}>{device.name}<br />
        <small>{t("workspace.security.expires", { date: new Date(device.expires_at * 1000).toLocaleDateString() })}</small></span>
      <button className="btn" disabled={busy} onClick={() => run(() => api.securityRequest("/me/trusted-devices/" + device.id, "DELETE"))}>{t("workspace.security.revoke")}</button>
    </div>)}
    {devices.length > 0 && <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={() => run(() => api.securityRequest("/me/trusted-devices", "DELETE"))}>{t("workspace.security.revokeAll")}</button>}
  </section>;
}
window.PasskeySettings = PasskeySettings;
