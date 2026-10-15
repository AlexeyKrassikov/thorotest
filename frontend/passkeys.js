(function () {
  const decode = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const encode = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function credentialJSON(credential) {
    const r = credential.response;
    const response = { clientDataJSON: encode(r.clientDataJSON) };
    for (const key of ["attestationObject", "authenticatorData", "signature", "userHandle"]) {
      if (r[key]) response[key] = encode(r[key]);
    }
    if (r.getTransports) response.transports = r.getTransports();
    return { id: credential.id, rawId: encode(credential.rawId), type: credential.type,
      response, clientExtensionResults: credential.getClientExtensionResults() };
  }
  async function ceremony(options, register) {
    if (!window.PublicKeyCredential || !navigator.credentials || !window.isSecureContext) {
      throw new Error(window.TH_I18N.t("workspace.security.unsupported"));
    }
    const publicKey = { ...options, challenge: decode(options.challenge) };
    if (publicKey.user) publicKey.user = { ...publicKey.user, id: decode(publicKey.user.id) };
    for (const key of ["allowCredentials", "excludeCredentials"]) {
      if (publicKey[key]) publicKey[key] = publicKey[key].map(c => ({ ...c, id: decode(c.id) }));
    }
    try {
      const credential = await navigator.credentials[register ? "create" : "get"]({ publicKey });
      if (!credential) throw new Error();
      return credentialJSON(credential);
    } catch (_) {
      throw new Error(window.TH_I18N.t("workspace.security.cancelled"));
    }
  }
  window.TH_PASSKEYS = { ceremony };
})();
