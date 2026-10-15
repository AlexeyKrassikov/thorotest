// ThoroTest — Docs & API view

const DOC_SECTIONS = [
  { id: "quickstart", label: "docs.sections.quickstart", icon: "branch" },
  { id: "rest", label: "docs.sections.rest", icon: "doc" },
  { id: "cli", label: "docs.sections.cli", icon: "play" },
  { id: "sdks", label: "docs.sections.sdks", icon: "filter" },
  { id: "webhooks", label: "docs.sections.webhooks", icon: "plug" },
  { id: "about", label: "docs.sections.about", icon: "clock" },
];

const METHOD_STYLE = {
  get:    { color: "var(--info)",  bg: "var(--info-soft)"  },
  post:   { color: "var(--pass)",  bg: "var(--pass-soft)"  },
  patch:  { color: "var(--warn)",  bg: "var(--warn-soft)"  },
  delete: { color: "var(--fail)",  bg: "var(--fail-soft)"  },
  put:    { color: "var(--warn)",  bg: "var(--warn-soft)"  },
};

function MethodBadge({ method }) {
  const s = METHOD_STYLE[method.toLowerCase()] || { color: "var(--text-muted)", bg: "var(--surface)" };
  return (
    <span style={{
      display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
      color: s.color, background: s.bg, padding: "2px 7px", borderRadius: 4,
      textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 50, textAlign: "center",
    }}>
      {method.toUpperCase()}
    </span>
  );
}

function useCopy() {
  const [copied, setCopied] = React.useState(null);
  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  return [copied, copy];
}

function CodeBlock({ children }) {
  return (
    <pre className="code" style={{ marginTop: 8, marginBottom: 0 }}>
      {children}
    </pre>
  );
}

/* ── schema resolver ──────────────────────────────────── */

function resolveRef(ref, schemas) {
  if (!ref) return null;
  const name = ref.replace("#/components/schemas/", "");
  return schemas[name] || null;
}

function resolveSchema(schema, schemas, depth = 0) {
  if (!schema || depth > 3) return null;
  if (schema.$ref) return resolveSchema(resolveRef(schema.$ref, schemas), schemas, depth + 1);
  if (schema.allOf) return resolveSchema(schema.allOf[0], schemas, depth + 1);
  return schema;
}

function localizeApiText(lang, catalog, text) {
  return window.TH_LOCALES[lang]?.docs?.[catalog]?.[text] || text;
}

function localizeApiDescription(lang, op) {
  return window.TH_LOCALES[lang]?.docs?.apiDescriptions?.[op.operationId] || op.description;
}

function SchemaFields({ schema, schemas, depth = 0 }) {
  const { t } = useI18n();
  const resolved = resolveSchema(schema, schemas);
  if (!resolved) return null;

  if (resolved.type === "array") {
    return (
      <div>
        <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{t("docs.rest.arrayOf")}</span>
        <div style={{ marginLeft: 12 }}>
          <SchemaFields schema={resolved.items} schemas={schemas} depth={depth + 1} />
        </div>
      </div>
    );
  }

  if (resolved.properties) {
    const required = resolved.required || [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(resolved.properties).map(([name, prop]) => {
          const resolvedProp = resolveSchema(prop, schemas);
          const type = resolvedProp?.type || (resolvedProp?.allOf ? "object" : prop.$ref ? "object" : "any");
          const isReq = required.includes(name);
          return (
            <div key={name} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5 }}>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)", minWidth: 120 }}>{name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--info)" }}>{type}</span>
              {isReq && <span style={{ fontSize: 10, color: "var(--fail)", fontFamily: "var(--font-mono)" }}>{t("docs.rest.required")}</span>}
              {resolvedProp?.description && (
                <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{resolvedProp.description}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const type = resolved.type || "any";
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--info)" }}>{type}</span>;
}

/* ── endpoint card ────────────────────────────────────── */

function EndpointCard({ method, path, op, schemas }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = React.useState(false);

  const params = op.parameters || [];
  const pathParams  = params.filter(p => p.in === "path");
  const queryParams = params.filter(p => p.in === "query");
  const bodySchema  = op.requestBody?.content?.["application/json"]?.schema;
  const resp200     = op.responses?.["200"]?.content?.["application/json"]?.schema
                   || op.responses?.["201"]?.content?.["application/json"]?.schema;

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 8, marginBottom: 6, overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", background: open ? "var(--surface)" : "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <MethodBadge method={method} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--text)", flex: 1 }}>{path}</span>
        {op.summary && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 8 }}>{localizeApiText(lang, "apiSummaries", op.summary)}</span>
        )}
        <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 14 }}>
          {op.description && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>{localizeApiDescription(lang, op)}</p>
          )}

          {pathParams.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{t("docs.rest.pathParams")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pathParams.map(p => (
                  <div key={p.name} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5 }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)", minWidth: 120 }}>{p.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--info)" }}>{p.schema?.type || "string"}</span>
                    {p.required && <span style={{ fontSize: 10, color: "var(--fail)", fontFamily: "var(--font-mono)" }}>{t("docs.rest.required")}</span>}
                    {p.description && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{p.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {queryParams.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{t("docs.rest.queryParams")}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {queryParams.map(p => (
                  <div key={p.name} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11.5 }}>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text)", minWidth: 120 }}>{p.name}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--info)" }}>{p.schema?.type || "string"}</span>
                    {p.required && <span style={{ fontSize: 10, color: "var(--fail)", fontFamily: "var(--font-mono)" }}>{t("docs.rest.required")}</span>}
                    {p.description && <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{p.description}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {bodySchema && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{t("docs.rest.requestBody")}</div>
              <SchemaFields schema={bodySchema} schemas={schemas} />
            </div>
          )}

          {resp200 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{t("docs.rest.response")}</div>
              <SchemaFields schema={resp200} schemas={schemas} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── REST API section ─────────────────────────────────── */

function RestApiSection() {
  const { t } = useI18n();
  const [spec, setSpec]   = React.useState(null);
  const [err, setErr]     = React.useState(null);
  const [group, setGroup] = React.useState(null);

  React.useEffect(() => {
    fetch("/openapi.json", { headers: window.authHeaders() })
      .then(r => r.json())
      .then(data => {
        setSpec(data);
        // default to first group
        const groups = buildGroups(data);
        if (groups.length) setGroup(groups[0].tag);
      })
      .catch(() => setErr(true));
  }, []);

  if (err)  return <div style={{ color: "var(--fail)", fontSize: 13 }}>{t("docs.rest.loadError")}</div>;
  if (!spec) return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("docs.rest.loading")}</div>;

  const schemas = spec.components?.schemas || {};
  const groups  = buildGroups(spec);
  const current = groups.find(g => g.tag === group) || groups[0];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div className="page-title" style={{ fontSize: 18 }}>REST API</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
          {t("docs.rest.baseUrl")}: <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>http://localhost:8000/api</code>
          &nbsp;·&nbsp; {t("docs.rest.auth")}: <code style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>Authorization: Bearer &lt;token&gt;</code>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {groups.map(g => (
          <button
            key={g.tag}
            className={"tab" + (g.tag === (current?.tag) ? " active" : "")}
            onClick={() => setGroup(g.tag)}
            style={{ border: "none", background: "transparent", cursor: "pointer", textTransform: "capitalize" }}
          >
            {g.tag}
            <span className="count">{g.endpoints.length}</span>
          </button>
        ))}
      </div>

      {current && (
        <div>
          {current.endpoints.map(({ method, path, op }) => (
            <EndpointCard key={method + path} method={method} path={path} op={op} schemas={schemas} />
          ))}
        </div>
      )}
    </div>
  );
}

function buildGroups(spec) {
  const map = {};
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(methods)) {
      if (!["get","post","patch","put","delete"].includes(method)) continue;
      const tag = (op.tags?.[0] || "other").toLowerCase();
      if (!map[tag]) map[tag] = [];
      map[tag].push({ method, path, op });
    }
  }
  const TAG_ORDER = ["tests","runs","defects","requirements","folders","auth","projects","categories","activity","pipelines"];
  const sorted = [...TAG_ORDER.filter(t => map[t]), ...Object.keys(map).filter(t => !TAG_ORDER.includes(t))];
  return sorted.map(tag => ({ tag, endpoints: map[tag] }));
}

/* ── Quickstart section ───────────────────────────────── */

function QuickstartSection() {
  const { t } = useI18n();
  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-title" style={{ fontSize: 18, marginBottom: 4 }}>{t("docs.quickstart.title")}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.6 }}>
        {t("docs.quickstart.subtitle")}
      </div>

      <DocStep n="1" title={t("docs.quickstart.startServer")}>
        <CodeBlock>{`cd thorotest
make dev          # builds the frontend and starts the app on :8000`}</CodeBlock>
      </DocStep>

      <DocStep n="2" title={t("docs.quickstart.signIn")}>
        <CodeBlock>{`# Accounts are invite-only: /api/auth/register returns 403 unless the
# instance sets ALLOW_OPEN_REGISTRATION=1. Admins create accounts under
# Configure ▸ Admin. On a fresh install, use the seeded admin — its
# password is printed once in the server log on first boot.

curl -X POST http://localhost:8000/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "admin@localhost", "password": "<from the first-boot log>"}'

# → { "access_token": "eyJ...", "token_type": "bearer" }
TOKEN="eyJ..."`}</CodeBlock>
      </DocStep>

      <DocStep n="3" title={t("docs.quickstart.createToken")}>
        <CodeBlock>{`# scope "read" restricts the token to GET/HEAD/OPTIONS; "write" grants
# your full role. Tokens expire after API_TOKEN_EXPIRE_DAYS (90 default).

curl -X POST http://localhost:8000/api/tokens \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "ci-nightly", "scope": "write"}'

# → { "token": "th_...", "expires_at": "..." }   shown once`}</CodeBlock>
      </DocStep>

      <DocStep n="4" title={t("docs.quickstart.listTests")}>
        <CodeBlock>{`curl http://localhost:8000/api/tests?limit=50&offset=0 \\
  -H "Authorization: Bearer $TOKEN"
# Pagination: limit/offset (max 1000/page); the X-Total-Count response
# header carries the total row count for the filtered query.`}</CodeBlock>
      </DocStep>

      <DocStep n="5" title={t("docs.quickstart.createTest")}>
        <CodeBlock>{`curl -X POST http://localhost:8000/api/tests \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Login flow",
    "type": "manual",
    "status": "draft",
    "priority": "high"
  }'`}</CodeBlock>
      </DocStep>

      <DocStep n="6" title={t("docs.quickstart.startRun")}>
        <CodeBlock>{`curl -X POST http://localhost:8000/api/runs \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Sprint 14 regression",
    "environment": "staging",
    "test_ids": ["TC-1001", "TC-1002"]
  }'`}</CodeBlock>
      </DocStep>

      <div style={{ marginTop: 28, padding: "14px 16px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--text)" }}>{t("docs.quickstart.pythonExample")}</strong>
        <CodeBlock>{`import httpx

BASE = "http://localhost:8000/api"

r = httpx.post(f"{BASE}/auth/login", json={"email": "alice@example.com", "password": "secret1"})
token = r.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

tests = httpx.get(f"{BASE}/tests", headers=headers).json()
print(f"{len(tests)} tests found")`}</CodeBlock>
      </div>
    </div>
  );
}

function DocStep({ n, title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{
          width: 22, height: 22, borderRadius: "50%", background: "var(--accent)",
          color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>{n}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ marginLeft: 32 }}>{children}</div>
    </div>
  );
}

/* ── CLI section ──────────────────────────────────────── */

function CliSection() {
  const { t } = useI18n();
  const [copied, copy] = useCopy();
  const cmds = [
    { cmd: "thorotest status", desc: "docs.cli.statusDesc" },
    { cmd: "thorotest lint tests/", desc: "docs.cli.lintDesc" },
    { cmd: "thorotest sync tests/", desc: "docs.cli.syncDesc" },
    { cmd: "thorotest sync tests/ --dry-run", desc: "docs.cli.dryRunDesc" },
    { cmd: "thorotest token create --name ci", desc: "docs.cli.tokenDesc" },
    { cmd: "thorotest run [--env staging]", desc: "docs.cli.runDesc" },
    { cmd: "thorotest new test", desc: "docs.cli.newTestDesc" },
  ];

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div className="page-title" style={{ fontSize: 18 }}>CLI</div>
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px" }}>
          {t("docs.cli.beta")}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
        {t("docs.cli.introBeforePath")} <code style={{ fontFamily: "var(--font-mono)" }}>cli/</code>{t("docs.cli.introNpmPrefix")}<code style={{ fontFamily: "var(--font-mono)" }}>npm link</code> {t("docs.cli.introAfterNpm")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {cmds.map(c => (
          <button
            key={c.cmd}
            onClick={() => copy(c.cmd, c.cmd)}
            style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", textAlign: "left", width: "100%", transition: "background 0.1s" }}
            title={t("docs.copy.clickToCopy")}
          >
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", minWidth: 260, flex: 1 }}>{c.cmd}</code>
            <span style={{ fontSize: 12.5, color: "var(--text-muted)", flex: 1 }}>{t(c.desc)}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: copied === c.cmd ? "var(--pass)" : "var(--text-dim)", minWidth: 50, textAlign: "right" }}>
              {copied === c.cmd ? t("docs.copy.copied") : t("docs.copy.copy")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── SDKs section ─────────────────────────────────────── */

function SdksSection() {
  const { t } = useI18n();
  const sdks = [
    {
      lang: "TypeScript / JavaScript",
      install: "npm install @thorotest/sdk",
      snippet: `import { ThoroTest } from "@thorotest/sdk";

const th = new ThoroTest({ token: process.env.TH_TOKEN });

const tests = await th.tests.list({ status: "active" });
const run   = await th.runs.create({ name: "CI run", testIds: tests.map(t => t.id) });`,
    },
    {
      lang: "Python",
      install: "pip install thorotest",
      snippet: `from thorotest import ThoroTest

th = ThoroTest(token=os.environ["TH_TOKEN"])

tests = th.tests.list(status="active")
run   = th.runs.create(name="CI run", test_ids=[t.id for t in tests])`,
    },
    {
      lang: "Go",
      install: "go get github.com/thorotest/sdk-go",
      snippet: `client := thorotest.New(os.Getenv("TH_TOKEN"))

tests, _ := client.Tests.List(ctx, &thorotest.TestFilter{Status: "active"})
run, _   := client.Runs.Create(ctx, &thorotest.CreateRunInput{Name: "CI run"})`,
    },
  ];

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>SDKs</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {sdks.map(s => (
          <div key={s.lang} style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{s.lang}</span>
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-muted)" }}>{s.install}</code>
            </div>
            <CodeBlock>{s.snippet}</CodeBlock>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Webhooks section ─────────────────────────────────── */

function WebhooksSection() {
  const { t } = useI18n();
  const [copied, copy] = useCopy();
  const events = [
    { name: "run.created", desc: "docs.webhooks.runCreated" },
    { name: "run.completed", desc: "docs.webhooks.runCompleted" },
    { name: "test.created", desc: "docs.webhooks.testCreated" },
    { name: "test.updated", desc: "docs.webhooks.testUpdated" },
    { name: "defect.created", desc: "docs.webhooks.defectCreated" },
  ];

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-title" style={{ fontSize: 18, marginBottom: 4 }}>{t("docs.sections.webhooks")}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
        {t("docs.webhooks.introBeforeSignature")} <code style={{ fontFamily: "var(--font-mono)" }}>X-ThoroTest-Signature</code> {t("docs.webhooks.introAfterSignature")}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{t("docs.webhooks.events")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {events.map(e => (
            <button
              key={e.name}
              onClick={() => copy(e.name, e.name)}
              style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "7px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", textAlign: "left", width: "100%" }}
              title={t("docs.copy.clickToCopyEvent")}
            >
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--warn)", minWidth: 180 }}>{e.name}</code>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)", flex: 1 }}>{t(e.desc)}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: copied === e.name ? "var(--pass)" : "var(--text-dim)" }}>
                {copied === e.name ? t("docs.copy.copied") : t("docs.copy.copy")}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{t("docs.webhooks.payloadShape")}</div>
      <CodeBlock>{`{
  "event":   "run.completed",
  "ts":      "2025-05-26T14:03:00Z",
  "project": "my-project",
  "data": {
    "run_id": "R-0042",
    "status": "failed",
    "passed": 31,
    "failed": 4,
    "total":  35
  }
}`}</CodeBlock>
    </div>
  );
}

/* ── main Docs component ──────────────────────────────── */

/* ── About section ────────────────────────────────────── */

const RELEASE_GROUP_STYLE = {
  Added:      { color: "var(--pass)",  bg: "var(--pass-soft)" },
  Fixed:      { color: "var(--warn)",  bg: "var(--warn-soft)" },
  Changed:    { color: "var(--info)",  bg: "var(--info-soft)" },
  Removed:    { color: "var(--fail)",  bg: "var(--fail-soft)" },
  Security:   { color: "var(--fail)",  bg: "var(--fail-soft)" },
  Deprecated: { color: "var(--text-muted)", bg: "var(--surface)" },
};

function ReleaseCard({ release, isCurrent, defaultOpen }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = React.useState(defaultOpen);
  const unreleased = release.version === "Unreleased";
  const releaseDate = release.date && !Number.isNaN(new Date(release.date).getTime())
    ? new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(new Date(release.date)) : release.date;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
        aria-expanded={open}
      >
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
          {unreleased ? t("docs.about.unreleased") : `v${release.version}`}
        </span>
        {isCurrent && (
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "1px 6px" }}>
            {t("docs.about.current")}
          </span>
        )}
        {unreleased && (
          <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 6px" }}>
            {t("docs.about.inDevelopment")}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {releaseDate && <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{releaseDate}</span>}
        <Icon name="chev" className="" />
      </button>

      {open && (
        <div style={{ padding: "2px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          {release.notes && (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.55 }}>{release.notes}</div>
          )}
          {release.sections.map((s, si) => {
            const st = RELEASE_GROUP_STYLE[s.title] || { color: "var(--text-muted)", bg: "var(--surface)" };
            return (
              <div key={si}>
                {s.title && (
                  <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: st.color, background: st.bg, padding: "2px 7px", borderRadius: 4, marginBottom: 6 }}>
                    {s.title ? (() => { const key = `docs.about.releaseGroups.${s.title.toLowerCase()}`; const label = t(key); return label === key ? s.title : label; })() : s.title}
                  </span>
                )}
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
                  {s.items.map((it, ii) => (
                    <li key={ii} style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.55 }}>{it}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AboutSection() {
  const { t } = useI18n();
  const [data, setData] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/about", { headers: window.authHeaders() })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  if (err) return <div style={{ color: "var(--fail)", fontSize: 13 }}>{t("docs.about.loadError")}</div>;
  if (!data) return <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("docs.about.loading")}</div>;

  const releases = data.releases || [];

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-title" style={{ fontSize: 18, marginBottom: 4 }}>{t("docs.about.title")}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20, lineHeight: 1.6 }}>
        {t("docs.about.subtitle")}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "14px 16px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", marginBottom: 22 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("docs.about.version")}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>v{data.version}</span>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{t("docs.about.changelog")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {releases.length === 0 && (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{t("docs.about.noChangelog")}</div>
        )}
        {releases.map((rel) => (
          <ReleaseCard
            key={rel.version}
            release={rel}
            isCurrent={rel.version === data.version}
            defaultOpen={rel.version === data.version}
          />
        ))}
      </div>
    </div>
  );
}

function Docs() {
  const { t } = useI18n();
  const [section, setSection] = React.useState("quickstart");

  return (
    <div className="page fade-in" style={{ padding: 0, display: "flex", gap: 0, maxWidth: 1100, height: "100%" }}>
      {/* sidebar */}
      <div style={{
        width: 180, flexShrink: 0,
        borderRight: "1px solid var(--border)",
        padding: "20px 0",
        display: "flex", flexDirection: "column", gap: 2,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 16px", marginBottom: 6 }}>{t("docs.sections.title")}</div>
        {DOC_SECTIONS.map(s => (
          <button
            key={s.id}
            className={"nav-item" + (section === s.id ? " active" : "")}
            style={{ margin: "0 8px", borderRadius: 6, border: "none", background: section === s.id ? "var(--nav-active-bg, rgba(99,102,241,0.12))" : "transparent", color: section === s.id ? "var(--accent)" : "var(--text)", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13 }}
            onClick={() => setSection(s.id)}
            aria-current={section === s.id ? "page" : undefined}
          >
            <Icon name={s.icon} className="nav-icon" />
            {t(s.label)}
          </button>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, padding: "28px 36px", overflowY: "auto" }}>
        {section === "quickstart" && <QuickstartSection />}
        {section === "rest"       && <RestApiSection />}
        {section === "cli"        && <CliSection />}
        {section === "sdks"       && <SdksSection />}
        {section === "webhooks"   && <WebhooksSection />}
        {section === "about"      && <AboutSection />}
      </div>
    </div>
  );
}
window.Docs = Docs;
