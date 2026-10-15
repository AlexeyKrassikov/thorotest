// ThoroTest API client — loads live data from backend, falls back to static data.js
(function () {
  const BASE = "";  // served from same origin

  const t = (key, params) => window.TH_I18N.t(key, params);

  function errorMessage(detail) {
    if (Array.isArray(detail)) return detail.map(item => item.msg || t("api.requestFailed")).join("; ");
    if (typeof detail !== "string") return t("api.requestFailed");
    // Admin endpoints historically read the JSON error body as text.
    try {
      const parsed = JSON.parse(detail);
      if (parsed && typeof parsed === "object" && "detail" in parsed) return errorMessage(parsed.detail);
    } catch (_) {}
    return detail;
  }

  // Apply the UI language to anonymous, multipart and authenticated requests.
  async function fetch(url, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("Accept-Language", window.TH_I18N.getLanguage());
    try {
      return await window.fetch(url, { ...options, headers });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error(errorMessage(t("api.networkFailed")));
    }
  }

  function getToken() { return localStorage.getItem("th_token"); }
  function setToken(t) { localStorage.setItem("th_token", t); }
  function clearToken() { localStorage.removeItem("th_token"); }

  function authHeaders(extra) {
    const h = { "Content-Type": "application/json", "Accept-Language": window.TH_I18N.getLanguage(), ...extra };
    const t = getToken();
    if (t) h["Authorization"] = `Bearer ${t}`;
    return h;
  }

  async function getWebSocketTicket() {
    const res = await fetch(BASE + "/api/auth/ws-ticket", {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(errorMessage(t("api.websocketFailed")));
    return (await res.json()).ticket;
  }

  async function loadInitialData() {
    const res = await fetch(BASE + "/api/initial-data", { headers: authHeaders() });
    if (!res.ok) throw new Error(errorMessage(t("api.unavailable")));
    return res.json();
  }

  // Exposed so views making raw fetch() calls can attach the bearer token
  // without each one re-reading localStorage. GET endpoints now require auth.
  window.authHeaders = authHeaders;

  window.TH_API = {
    setToken,
    authHeaders,

    async confirmOAuthLink(pendingToken, password) {
      const res = await fetch(BASE + "/api/auth/oauth/confirm-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pending_token: pendingToken, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(errorMessage(err.detail || t("api.linkFailed")));
      }
      const data = await res.json();
      if (data.status === "2fa_required") {
        return { __2fa_required: true, partialToken: data.partial_token };
      }
      setToken(data.access_token);
      return data.user;
    },

    async init() {
      try {
        const data = await loadInitialData();
        window.TH_DATA = data;
      } catch (e) {
        console.warn("[ThoroTest] API unavailable, using static data", e.message);
      }
    },

    async forgotPassword(email) {
      const res = await fetch(BASE + "/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(errorMessage(err.detail || t("api.requestFailed")));
      }
      return res.json();
    },

    async resetPassword(token, newPassword) {
      const res = await fetch(BASE + "/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(errorMessage(err.detail || t("api.resetFailed")));
      }
    },

    async login(email, password) {
      const res = await fetch(BASE + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(errorMessage(err.detail || t("api.loginFailed")));
      }
      const data = await res.json();
      if (data.status === "2fa_required") {
        return { __2fa_required: true, partialToken: data.partial_token };
      }
      setToken(data.access_token);
      return data.user;
    },

    async verify2FA(partialToken, code) {
      const res = await fetch(BASE + "/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partial_token: partialToken, code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const e = new Error(errorMessage(err.detail || t("api.invalidCode")));
        e.httpStatus = res.status;
        throw e;
      }
      const data = await res.json();
      setToken(data.access_token);
      return data.user;
    },

    async get2FASetup() {
      const res = await fetch(BASE + "/api/me/2fa/setup", { headers: authHeaders() });
      if (!res.ok) { throw new Error(errorMessage((await res.json().catch(() => ({}))).detail || t("api.requestFailed"))); }
      return res.json();
    },

    async enable2FA(pendingSecret, totpCode) {
      const res = await fetch(BASE + "/api/me/2fa/enable", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ pending_secret: pendingSecret, totp_code: totpCode }),
      });
      if (!res.ok) { throw new Error(errorMessage((await res.json().catch(() => ({}))).detail || t("api.requestFailed"))); }
      return res.json();
    },

    async disable2FA(totpCode) {
      const res = await fetch(BASE + "/api/me/2fa/disable", {
        method: "DELETE",
        headers: authHeaders(),
        body: JSON.stringify({ totp_code: totpCode }),
      });
      if (!res.ok) { throw new Error(errorMessage((await res.json().catch(() => ({}))).detail || t("api.requestFailed"))); }
    },

    async regenerate2FACodes(totpCode) {
      const res = await fetch(BASE + "/api/me/2fa/recovery-codes/regenerate", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ totp_code: totpCode }),
      });
      if (!res.ok) { throw new Error(errorMessage((await res.json().catch(() => ({}))).detail || t("api.requestFailed"))); }
      return res.json();
    },

    async get2FACount() {
      const res = await fetch(BASE + "/api/me/2fa/recovery-codes/count", { headers: authHeaders() });
      if (!res.ok) { throw new Error(errorMessage((await res.json().catch(() => ({}))).detail || t("api.requestFailed"))); }
      return res.json();
    },

    async logout() {
      // Capture auth headers before clearing so the audit logout event still
      // identifies the actor, then clear the token synchronously so callers
      // (and the UI) never observe a stale token after logout is invoked.
      const headers = authHeaders();
      clearToken();
      try {
        await fetch(BASE + "/api/auth/logout", {
          method: "POST",
          headers,
        });
      } catch (_) {
        // fire-and-forget — token already cleared regardless of server response
      }
    },

    async getCurrentUser() {
      const t = getToken();
      if (!t) return null;
      const res = await fetch(BASE + "/api/me", { headers: authHeaders() });
      if (!res.ok) { clearToken(); return null; }
      return res.json();
    },

    async getTest(id) {
      const res = await fetch(BASE + `/api/tests/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.testNotFound")));
      const t = await res.json();
      return { ...t, folder: t.folder_id, updated: t.updated_at, lastRun: t.last_run_at };
    },

    async updateTestStatus(id, status) {
      const res = await fetch(BASE + `/api/tests/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.updateFailed")));
      return res.json();
    },

    async createTest(payload) {
      const res = await fetch(BASE + "/api/tests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.createFailed")));
      return res.json();
    },

    async getRun(id) {
      const res = await fetch(BASE + `/api/runs/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.runNotFound")));
      return res.json();
    },

    async createRun(payload) {
      const res = await fetch(BASE + "/api/runs", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.createRunFailed")));
      return res.json();
    },

    async updateRunStatus(id, status) {
      const res = await fetch(BASE + `/api/runs/${id}/status?status=${encodeURIComponent(status)}`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.statusFailed")));
      return res.json();
    },

    async listPlans() {
      const res = await fetch(BASE + "/api/plans", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.plansFailed")));
      return res.json();
    },

    async createPlan(payload) {
      const res = await fetch(BASE + "/api/plans", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.createPlanFailed")));
      return res.json();
    },

    async runPlan(id) {
      const res = await fetch(BASE + `/api/plans/${id}/run`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage((await res.json().catch(() => ({}))).detail || t("api.runPlanFailed")));
      return res.json();
    },

    async deletePlan(id) {
      const res = await fetch(BASE + `/api/plans/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.deletePlanFailed")));
    },

    async deleteTest(id) {
      const res = await fetch(BASE + `/api/tests/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) throw new Error(errorMessage(t("api.deleteFailed")));
    },

    async bulkTests(action, ids, payload) {
      const res = await fetch(BASE + "/api/tests/bulk", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action, ids, payload }),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.bulkFailed")));
      return res.json();
    },

    async connectRunWS(runId) {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      // Browsers cannot attach Authorization headers to WS handshakes. Exchange
      // the session for a one-minute, WS-only ticket so the long-lived JWT never
      // appears in access logs or proxy request URLs.
      const ticket = await getWebSocketTicket();
      return new WebSocket(
        `${proto}://${location.host}/ws/runs/${runId}?ticket=${encodeURIComponent(ticket)}`
      );
    },

    async getTestHistory(id) {
      const res = await fetch(BASE + `/api/tests/${id}/history`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.historyFailed")));
      return res.json();
    },

    async getRuns() {
      const res = await fetch(BASE + "/api/runs", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.runsFailed")));
      return res.json();
    },

    // Per-record change history (who/when/what). entityType: test|requirement|defect
    async getRecordHistory(entityType, id) {
      const res = await fetch(BASE + `/api/history/${entityType}/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.historyFailed")));
      return res.json();
    },

    async getTestDefects(id) {
      const res = await fetch(BASE + `/api/tests/${id}/defects`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.defectsFailed")));
      return res.json();
    },

    async getDefects(filters = {}) {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.severity && filters.severity !== "all") params.set("severity", filters.severity);
      if (filters.test_id) params.set("test_id", filters.test_id);
      if (filters.search) params.set("search", filters.search);
      const qs = params.toString() ? `?${params}` : "";
      const res = await fetch(BASE + `/api/defects${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.defectsFailed")));
      return res.json();
    },

    async getDefect(id) {
      const res = await fetch(BASE + `/api/defects/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.defectNotFound")));
      return res.json();
    },

    async createDefect(payload) {
      const res = await fetch(BASE + "/api/defects", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.createDefectFailed")));
      return res.json();
    },

    async updateDefect(id, payload) {
      const res = await fetch(BASE + `/api/defects/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.updateDefectFailed")));
      return res.json();
    },

    async deleteDefect(id) {
      const res = await fetch(BASE + `/api/defects/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) throw new Error(errorMessage(t("api.deleteDefectFailed")));
    },

    async pushDefectToJira(id) {
      const res = await fetch(BASE + `/api/defects/${id}/push`, { method: "POST", headers: authHeaders() });
      if (!res.ok) {
        let msg = t("api.pushJiraFailed");
        try { msg = (await res.json()).detail || msg; } catch {}
        throw new Error(errorMessage(msg));
      }
      return res.json();
    },

    async pushTestToGit(id) {
      const res = await fetch(BASE + `/api/tests/${id}/push-to-git`, { method: "POST", headers: authHeaders() });
      if (!res.ok) {
        let msg = t("api.pushGitFailed");
        try { msg = (await res.json()).detail || msg; } catch {}
        throw new Error(errorMessage(msg));
      }
      return res.json();
    },

    async getRunDefects(runId) {
      const res = await fetch(BASE + `/api/runs/${runId}/defects`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.runDefectsFailed")));
      return res.json();
    },

    async getRequirements(filters = {}) {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.type && filters.type !== "all") params.set("type", filters.type);
      if (filters.covered !== undefined && filters.covered !== "all") params.set("covered", filters.covered);
      if (filters.search) params.set("search", filters.search);
      const qs = params.toString() ? `?${params}` : "";
      const res = await fetch(BASE + `/api/requirements${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.requirementsFailed")));
      return res.json();
    },

    async getRequirement(id) {
      const res = await fetch(BASE + `/api/requirements/${id}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.requirementNotFound")));
      return res.json();
    },

    async createRequirement(payload) {
      const res = await fetch(BASE + "/api/requirements", {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.createRequirementFailed")));
      return res.json();
    },

    async updateRequirement(id, payload) {
      const res = await fetch(BASE + `/api/requirements/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.updateRequirementFailed")));
      return res.json();
    },

    async deleteRequirement(id) {
      const res = await fetch(BASE + `/api/requirements/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) throw new Error(errorMessage(t("api.deleteRequirementFailed")));
    },

    async getTestRequirements(testId) {
      const res = await fetch(BASE + `/api/tests/${testId}/requirements`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.testRequirementsFailed")));
      return res.json();
    },

    async linkRequirementTest(reqId, testId) {
      const res = await fetch(BASE + `/api/requirements/${reqId}/tests/${testId}`, { method: "POST", headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.linkTestFailed")));
      return res.json();
    },

    async unlinkRequirementTest(reqId, testId) {
      const res = await fetch(BASE + `/api/requirements/${reqId}/tests/${testId}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.unlinkTestFailed")));
      return res.json();
    },

    async listTests(filters = {}) {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.limit) params.set("limit", filters.limit);
      const qs = params.toString() ? `?${params}` : "";
      const res = await fetch(BASE + `/api/tests${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.testsFailed")));
      return res.json();
    },

    async getTestComments(id) {
      const res = await fetch(BASE + `/api/tests/${id}/comments`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.commentsFailed")));
      return res.json();
    },

    async addComment(id, who, text) {
      const res = await fetch(BASE + `/api/tests/${id}/comments`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ who, text }),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.addCommentFailed")));
      return res.json();
    },

    async getUsers() {
      const res = await fetch(BASE + "/api/users", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.usersFailed")));
      return res.json();
    },

    async gql(query, variables = {}) {
      const res = await fetch(BASE + "/graphql", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ query, variables }),
      });
      const json = await res.json();
      if (json.errors) throw new Error(errorMessage(json.errors[0].message));
      return json.data;
    },

    async updateProfile(data) {
      const res = await fetch(BASE + "/api/me", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async changePassword(current_password, new_password) {
      const res = await fetch(BASE + "/api/me/password", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ current_password, new_password }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.passwordFailed"))); }
    },

    async getProjects() {
      const res = await fetch(BASE + "/api/projects", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.projectsFailed", { status: res.status })));
      return res.json();
    },

    async createProject(payload) {
      const res = await fetch(BASE + "/api/projects", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.createFailed"))); }
      return res.json();
    },

    async updateProject(id, payload) {
      const res = await fetch(BASE + `/api/projects/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async deleteProject(id) {
      const res = await fetch(BASE + `/api/projects/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.deleteFailed"))); }
    },

    async getCategories() {
      const res = await fetch(BASE + "/api/categories", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.categoriesFailed", { status: res.status })));
      return res.json();
    },

    async createCategory(payload) {
      const res = await fetch(BASE + "/api/categories", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.createFailed"))); }
      return res.json();
    },

    async updateCategory(id, payload) {
      const res = await fetch(BASE + `/api/categories/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async deleteCategory(id) {
      const res = await fetch(BASE + `/api/categories/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.deleteFailed"))); }
    },

    async getFolders() {
      const res = await fetch(BASE + "/api/folders", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.foldersFailed")));
      return res.json();
    },

    async createFolder(payload) {
      const res = await fetch(BASE + "/api/folders", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.createFailed"))); }
      return res.json();
    },

    async updateFolder(id, payload) {
      const res = await fetch(BASE + `/api/folders/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async deleteFolder(id) {
      const res = await fetch(BASE + `/api/folders/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.deleteFailed"))); }
    },

    async getIntegrations() {
      const res = await fetch(BASE + "/api/integrations", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.integrationsFailed")));
      return res.json();
    },

    async createIntegration(payload) {
      const res = await fetch(BASE + "/api/integrations", {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.createFailed"))); }
      return res.json();
    },

    async updateIntegration(id, payload) {
      const res = await fetch(BASE + `/api/integrations/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async deleteIntegration(id) {
      const res = await fetch(BASE + `/api/integrations/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.deleteFailed"))); }
    },

    async deletePipeline(id) {
      const res = await fetch(BASE + `/api/pipelines/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.deleteFailed"))); }
    },

    async pipelineCases(id) {
      const res = await fetch(BASE + `/api/pipelines/${id}/cases`, { headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.casesFailed"))); }
      return res.json();
    },

    async reconcilePipelines() {
      const res = await fetch(BASE + `/api/pipelines/reconcile`, { method: "POST", headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.reconcileFailed"))); }
      return res.json();   // { updated, pipelines }
    },

    async syncIntegration(id) {
      const res = await fetch(BASE + `/api/integrations/${id}/sync`, { method: "POST", headers: authHeaders() });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.syncFailed"))); }
      return res.json();
    },

    // Trigger the integration's GitHub Actions workflow; returns { job_id, … }.
    async ciRun(id, body) {
      const res = await fetch(BASE + `/api/integrations/${id}/ci/run`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body || {}),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.dispatchFailed"))); }
      return res.json();
    },

    async ciJobStatus(id, jobId) {
      const res = await fetch(BASE + `/api/integrations/${id}/ci/jobs/${jobId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.jobNotFound")));
      return res.json();
    },

    async getTokens() {
      const res = await fetch(BASE + "/api/tokens", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.tokensFailed")));
      return res.json();
    },

    async createToken(payload) {
      const res = await fetch(BASE + "/api/tokens", {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.createFailed"))); }
      return res.json();
    },

    async revokeToken(id) {
      const res = await fetch(BASE + `/api/tokens/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.revokeFailed"))); }
    },

    async getWebhooks() {
      const res = await fetch(BASE + "/api/webhooks", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.webhooksFailed")));
      return res.json();
    },

    async createWebhook(payload) {
      const res = await fetch(BASE + "/api/webhooks", {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.createFailed"))); }
      return res.json();
    },

    async updateWebhook(id, payload) {
      const res = await fetch(BASE + `/api/webhooks/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async deleteWebhook(id) {
      const res = await fetch(BASE + `/api/webhooks/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.deleteFailed"))); }
    },

    async testWebhook(id) {
      const res = await fetch(BASE + `/api/webhooks/${id}/test`, {
        method: "POST", headers: authHeaders(),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.testRequestFailed")));
      return res.json();
    },

    async getFavorites() {
      const res = await fetch(BASE + "/api/favorites", { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },

    async addFavorite(folderId) {
      const res = await fetch(BASE + "/api/favorites", {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ folder_id: folderId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.failed"))); }
      return res.json();
    },

    async removeFavorite(folderId) {
      const res = await fetch(BASE + `/api/favorites/${folderId}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.failed"))); }
    },

    async getTestSteps(testId) {
      const res = await fetch(BASE + `/api/tests/${testId}/steps`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.stepsFailed")));
      return res.json();
    },

    async replaceTestSteps(testId, steps) {
      // steps: [{action: string, expected_result: string|null}]
      const res = await fetch(BASE + `/api/tests/${testId}/steps`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(steps),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.stepsSaveFailed")));
      return res.json();
    },

    async getStepResults(runId, caseId) {
      const res = await fetch(BASE + `/api/runs/${runId}/cases/${caseId}/steps`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.stepResultsFailed")));
      return res.json();
    },

    async updateStepResult(runId, caseId, stepId, payload) {
      // payload: { status: string, actual_result?: string }
      const res = await fetch(BASE + `/api/runs/${runId}/cases/${caseId}/steps/${stepId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.stepResultUpdateFailed")));
      return res.json();
    },

    async getAttachments(entityType, entityId) {
      const params = new URLSearchParams({ entity_type: entityType, entity_id: String(entityId) });
      const res = await fetch(BASE + `/api/attachments?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.attachmentsFailed")));
      return res.json();
    },

    async uploadAttachment(entityType, entityId, file) {
      // IMPORTANT: Do NOT set Content-Type — browser must set multipart boundary automatically
      const fd = new FormData();
      fd.append("entity_type", entityType);
      fd.append("entity_id", String(entityId));
      fd.append("file", file);
      const token = localStorage.getItem("th_token");
      const res = await fetch(BASE + "/api/attachments", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) throw new Error(errorMessage(t("api.uploadFailed")));
      return res.json();
    },

    async deleteAttachment(attId) {
      const res = await fetch(BASE + `/api/attachments/${attId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error(errorMessage(t("api.deleteAttachmentFailed")));
    },

    async listAdminUsers() {
      const resp = await fetch(BASE + "/api/admin/users", { headers: authHeaders() });
      if (!resp.ok) throw new Error(errorMessage(await resp.text()));
      return resp.json();
    },

    async createAdminUser(payload) {
      const resp = await fetch(BASE + "/api/admin/users", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(errorMessage(await resp.text()));
      return resp.json();
    },

    async updateUserRole(userId, role) {
      const resp = await fetch(BASE + `/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!resp.ok) throw new Error(errorMessage(await resp.text()));
      return resp.json();
    },

    async deleteAdminUser(userId) {
      const resp = await fetch(BASE + `/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!resp.ok) throw new Error(errorMessage(await resp.text()));
    },

    async retestRun(runId) {
      const res = await fetch(BASE + `/api/runs/${runId}/retest`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.retestFailed")));
      return res.json();
    },

    async assignCase(runId, caseId, assignedTo) {
      const res = await fetch(BASE + `/api/runs/${runId}/cases/${caseId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ assigned_to: assignedTo }),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.assignFailed")));
      return res.json();
    },

    // Manual result marking. status: pass | fail | blocked | skip. The server
    // recomputes run counters and broadcasts the update over the run WebSocket.
    async markCase(runId, caseId, status, actualResult) {
      const body = { status };
      if (actualResult != null) body.actual_result = actualResult;
      const res = await fetch(BASE + `/api/runs/${runId}/cases/${caseId}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(errorMessage((await res.json().catch(() => ({}))).detail || t("api.markFailed")));
      return res.json();
    },

    async getMyCases() {
      const res = await fetch(BASE + "/api/runs/my-cases", { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.myCasesFailed")));
      return res.json();
    },

    async generateTests(payload) {
      const res = await fetch(BASE + "/api/ai/generate-tests", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.status === 429) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.rateLimited"))); }
      if (res.status === 503) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiNotConfigured"))); }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiFailed"))); }
      return res.json();
    },

    async suggestEdgeCases(payload) {
      const res = await fetch(BASE + "/api/ai/suggest-edge-cases", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.status === 429) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.rateLimited"))); }
      if (res.status === 503) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiNotConfigured"))); }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiFailed"))); }
      return res.json();
    },

    async analyzeFlaky(payload) {
      const res = await fetch(BASE + "/api/ai/analyze-flaky", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.status === 429) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.rateLimited"))); }
      if (res.status === 503) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiNotConfigured"))); }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiFailed"))); }
      return res.json();
    },

    async aiPrompt(payload) {
      const res = await fetch(BASE + "/api/ai/prompt", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.status === 429) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.rateLimited"))); }
      if (res.status === 503) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiNotConfigured"))); }
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.aiFailed"))); }
      return res.json();
    },

    async exportRunCSV(runId) {
      const res = await fetch(BASE + `/api/runs/${runId}/export?format=csv`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.exportFailed")));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `run-${runId}-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    async exportRunPDF(runId) {
      const res = await fetch(BASE + `/api/runs/${runId}/export?format=pdf`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.exportFailed")));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `run-${runId}-report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    async exportTestsCSV(folderId) {
      const params = new URLSearchParams({ format: "csv" });
      if (folderId) params.set("folder_id", folderId);
      const res = await fetch(BASE + `/api/tests/export?${params}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.exportFailed")));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tests-export.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    async getNotifications(limit = 20) {
      const res = await fetch(`${BASE}/api/notifications?limit=${limit}`, { headers: authHeaders() });
      if (!res.ok) return [];
      return res.json();
    },

    async markNotificationRead(id) {
      const res = await fetch(`${BASE}/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.markReadFailed")));
      return res.json();
    },

    async markAllNotificationsRead() {
      const res = await fetch(`${BASE}/api/notifications/mark-all-read`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.markAllReadFailed")));
      return res.json();
    },

    async deleteNotification(id) {
      const res = await fetch(`${BASE}/api/notifications/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error(errorMessage(t("api.deleteNotificationFailed")));
    },

    async getNotificationConfig() {
      const res = await fetch(`${BASE}/api/notifications/config`, { headers: authHeaders() });
      if (!res.ok) return {};
      return res.json();
    },

    async putNotificationConfig(payload) {
      const res = await fetch(`${BASE}/api/notifications/config`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(errorMessage(t("api.configFailed")));
      return res.json();
    },

    async connectNotifWS() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ticket = await getWebSocketTicket();
      return new WebSocket(`${proto}://${location.host}/ws/notifications?ticket=${encodeURIComponent(ticket)}`);
    },

    // Custom field definitions (admin-managed; values live on each record)
    async getCustomFields(entityType) {
      const qs = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : "";
      const res = await fetch(BASE + `/api/custom-fields${qs}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(errorMessage(t("api.customFieldsFailed")));
      return res.json();
    },

    async createCustomField(payload) {
      const res = await fetch(BASE + "/api/custom-fields", {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.createFailed"))); }
      return res.json();
    },

    async updateCustomField(id, payload) {
      const res = await fetch(BASE + `/api/custom-fields/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async deleteCustomField(id) {
      const res = await fetch(BASE + `/api/custom-fields/${id}`, { method: "DELETE", headers: authHeaders() });
      if (!res.ok && res.status !== 204) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.deleteFailed"))); }
    },

    async updateTest(id, payload) {
      const res = await fetch(BASE + `/api/tests/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(errorMessage(e.detail || t("api.updateFailed"))); }
      return res.json();
    },

    async getAuditLog({ start_date, end_date, page = 1, page_size = 50 } = {}) {
      const params = new URLSearchParams();
      if (start_date) params.set("start_date", start_date);
      if (end_date)   params.set("end_date", end_date);
      params.set("page", page);
      params.set("page_size", page_size);
      const res = await fetch(BASE + "/api/audit-log?" + params, { headers: authHeaders() });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(errorMessage(e.detail || t("api.auditLogFailed")));
      }
      return res.json();
    },
  };
})();
