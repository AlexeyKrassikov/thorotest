// ThoroTest — Import view

const { useState, useRef, useCallback } = React;

const FORMATS = [
  { id: "csv", label: "CSV", sub: "import.formats.csv" },
  { id: "xlsx", label: "Excel (.xlsx)", sub: "import.formats.xlsx" },
  { id: "testrail_xml", label: "TestRail XML", sub: "import.formats.testrailXml" },
  { id: "testlink_xml", label: "TestLink XML", sub: "import.formats.testlinkXml" },
  { id: "junit_xml", label: "JUnit XML", sub: "import.formats.junitXml" },
  { id: "json", label: "JSON", sub: "import.formats.json" },
  { id: "zephyr", label: "Zephyr Scale", sub: "import.formats.zephyr" },
  { id: "xray", label: "Xray", sub: "import.formats.xray" },
  { id: "qtest", label: "qTest", sub: "import.formats.qtest" },
];

const CONFLICT_OPTIONS = [
  { id: "skip", label: "import.conflicts.skip", sub: "import.conflicts.skipHint" },
  { id: "overwrite", label: "import.conflicts.overwrite", sub: "import.conflicts.overwriteHint" },
  { id: "rename", label: "import.conflicts.rename", sub: "import.conflicts.renameHint" },
];

const CANONICAL_FIELDS = [
  { id: "title", label: "import.fields.title" },
  { id: "folder_path", label: "import.fields.folder" },
  { id: "type", label: "import.fields.type" },
  { id: "priority", label: "import.fields.priority" },
  { id: "status", label: "import.fields.status" },
  { id: "owner", label: "import.fields.owner" },
  { id: "tags", label: "import.fields.tags" },
  { id: "source_id", label: "import.fields.sourceId" },
];

/* ── helpers ──────────────────────────────────────────────── */

function Badge({ label, color }) {
  const { t } = useI18n();
  const colors = {
    pass: "var(--green, #22c55e)",
    fail: "var(--red, #ef4444)",
    critical: "#ef4444",
    high: "#f97316",
    med: "#6366f1",
    low: "#6b7280",
  };
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 7px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      background: (colors[label?.toLowerCase()] || colors[color] || "#6366f1") + "22",
      color: colors[label?.toLowerCase()] || colors[color] || "#6366f1",
    }}>{({ pass: t("import.badges.pass"), fail: t("import.badges.fail"), critical: t("import.badges.critical"), high: t("import.badges.high"), med: t("import.badges.medium"), low: t("import.badges.low") })[String(label || "").toLowerCase()] || label}</span>
  );
}

/* ── DropZone ─────────────────────────────────────────────── */

function DropZone({ onFile }) {
  const { t } = useI18n();
  const [drag, setDrag] = useState(false);
  const inputRef = useRef();

  const handle = (file) => {
    if (file) onFile(file);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files[0]);
  }, []);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current.click()}
      style={{
        border: `2px dashed ${drag ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        padding: "40px 20px",
        textAlign: "center",
        cursor: "pointer",
        background: drag ? "var(--accent-bg, rgba(99,102,241,0.06))" : "transparent",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 28, marginBottom: 8 }}>⬆</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t("import.dropzone.prompt")}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {t("import.dropzone.acceptedFiles")}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xml,.json"
        style={{ display: "none" }}
        onChange={e => handle(e.target.files[0])}
      />
    </div>
  );
}

/* ── ColumnMapper ─────────────────────────────────────────── */

function ColumnMapper({ headers, mapping, onChange }) {
  const { t } = useI18n();
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>{t("import.columnMapping.title")}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
        {t("import.columnMapping.hint")}
      </div>
      <table className="table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            <th>{t("import.columnMapping.targetField")}</th>
            <th>{t("import.columnMapping.sourceColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {CANONICAL_FIELDS.map(f => (
            <tr key={f.id}>
              <td style={{ color: "var(--text-muted)", width: 160 }}>{t(f.label)}</td>
              <td>
                <select
                  value={mapping[f.id] || ""}
                  onChange={e => onChange({ ...mapping, [f.id]: e.target.value || undefined })}
                  style={{
                    background: "var(--surface)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    padding: "3px 8px",
                    fontSize: 12,
                    width: "100%",
                  }}
                >
                  <option value="">{t("import.columnMapping.ignore")}</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── PreviewPanel ─────────────────────────────────────────── */

function PreviewPanel({ preview }) {
  const { t } = useI18n();
  if (!preview) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-h">
        <div className="card-title">{t("import.preview.title")}</div>
        {preview.format && <span className="chip active">{(() => { const key = `import.formatNames.${preview.format}`; const label = t(key); return label === key ? preview.format : label; })()}</span>}
      </div>

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {[
          { label: t("import.fields.tests"), value: preview.tests },
          { label: t("import.fields.folders"), value: preview.folders },
          { label: t("import.fields.runs"), value: preview.runs },
          { label: t("import.fields.defects"), value: preview.defects },
        ].map(m => (
          <div key={m.label} style={{
            background: "var(--surface-raised, var(--surface))",
            borderRadius: 8,
            padding: "12px 16px",
            border: "1px solid var(--border)",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{m.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.label}</div>
          </div>
        ))}
      </div>

      {preview.warnings?.length > 0 && (
        <div style={{
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 12,
          fontSize: 12,
          color: "#f59e0b",
        }}>
          {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {preview.sample_tests?.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
            {t("import.preview.sample", { count: preview.sample_tests.length })}
          </div>
          <table className="table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th>{t("import.fields.title")}</th>
                <th>{t("import.fields.folder")}</th>
                <th>{t("import.fields.type")}</th>
                <th>{t("import.fields.priority")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample_tests.map((t, i) => (
                <tr key={i}>
                  <td>{t.title}</td>
                  <td style={{ color: "var(--text-muted)" }}>{t.folder_path || "—"}</td>
                  <td>{t.type}</td>
                  <td><Badge label={t.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── ResultPanel ─────────────────────────────────────────── */

function ResultPanel({ result, onReset }) {
  const { t } = useI18n();
  return (
    <div className="card fade-in" style={{ textAlign: "center", padding: 32 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t("import.result.complete")}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
        {t(result.imported.skipped > 0 ? "import.result.summaryWithSkipped" : "import.result.summary", result.imported)}
      </div>
      {result.warnings?.length > 0 && (
        <div style={{
          background: "rgba(245,158,11,0.1)",
          border: "1px solid rgba(245,158,11,0.3)",
          borderRadius: 6,
          padding: "8px 12px",
          marginBottom: 16,
          fontSize: 12,
          color: "#f59e0b",
          textAlign: "left",
        }}>
          {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}
      <button className="btn btn-primary" onClick={onReset}>{t("import.result.anotherFile")}</button>
    </div>
  );
}

/* ── Main Import view ─────────────────────────────────────── */

function Import() {
  const { t } = useI18n();
  const [file, setFile] = useState(null);
  const [detectedFmt, setDetectedFmt] = useState(null);
  const [format, setFormat] = useState(null);
  const [csvMeta, setCsvMeta] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [conflict, setConflict] = useState("skip");
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const effectiveFmt = format || detectedFmt;
  // Spreadsheet formats share the column-mapping UI.
  const isTabular = effectiveFmt === "csv" || effectiveFmt === "xlsx";

  const handleFile = async (f) => {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    setCsvMeta(null);
    setColumnMapping({});

    const fd = new FormData();
    fd.append("file", f);
    try {
      const headers = window.authHeaders();
      delete headers["Content-Type"];
      const res = await fetch("/api/import/detect", { method: "POST", body: fd, headers });
      const data = await res.json();
      setDetectedFmt(data.format);
      setFormat(null);
      if (data.csv_meta) {
        setCsvMeta(data.csv_meta);
        setColumnMapping(data.csv_meta.mapping || {});
      }
    } catch (e) {
      setError(t("import.errors.detectFailed"));
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setPreviewLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    if (effectiveFmt) fd.append("format", effectiveFmt);
    if (Object.keys(columnMapping).length) {
      fd.append("column_mapping", JSON.stringify(columnMapping));
    }
    try {
      const headers = window.authHeaders();
      delete headers["Content-Type"];
      const res = await fetch("/api/import/preview", { method: "POST", body: fd, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || t("import.errors.previewFailed"));
      setPreview(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    if (effectiveFmt) fd.append("format", effectiveFmt);
    if (Object.keys(columnMapping).length) {
      fd.append("column_mapping", JSON.stringify(columnMapping));
    }
    fd.append("conflict", conflict);
    try {
      const headers = window.authHeaders();
      delete headers["Content-Type"];
      const res = await fetch("/api/import/execute", { method: "POST", body: fd, headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || t("import.errors.importFailed"));
      setResult(data);
      if (window.TH_API) await window.TH_API.init();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null); setDetectedFmt(null); setFormat(null);
    setCsvMeta(null); setColumnMapping({}); setPreview(null);
    setResult(null); setError(null);
  };

  if (result) {
    return (
      <div className="page fade-in" style={{ maxWidth: 680 }}>
        <div className="page-h" style={{ marginBottom: 20 }}>
          <div>
            <h1 className="page-title">{t("import.title")}</h1>
            <div className="page-sub">{t("import.subtitle")}</div>
          </div>
        </div>
        <ResultPanel result={result} onReset={reset} />
      </div>
    );
  }

  return (
    <div className="page fade-in" style={{ maxWidth: 780 }}>
      <div className="page-h" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">{t("import.title")}</h1>
          <div className="page-sub">{t("import.subtitle")}</div>
        </div>
      </div>

      {/* Step 1: Upload */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h">
          <div className="card-title">{t("import.stepUpload")}</div>
          {file && (
            <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={reset}>
              {t("import.changeFile")}
            </button>
          )}
        </div>
        {!file
          ? <DropZone onFile={handleFile} />
          : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
              <Icon name="doc" style={{ color: "var(--accent)" }} />
              <span style={{ fontWeight: 500 }}>{file.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                {t("import.fileSize", { size: (file.size / 1024).toFixed(1) })}
              </span>
              {detectedFmt && <Badge label={detectedFmt} color="med" />}
            </div>
          )
        }
      </div>

      {/* Step 2: Format */}
      {file && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>{t("import.stepFormat")}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {FORMATS.map(f => {
              const active = effectiveFmt === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => { setFormat(f.id); setPreview(null); }}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    background: active ? "rgba(99,102,241,0.1)" : "var(--surface)",
                    cursor: "pointer",
                    color: "var(--text)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{f.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(f.sub)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Column mapping (CSV only) */}
      {file && isTabular && csvMeta && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>{t("import.stepMapping")}</div>
          <ColumnMapper
            headers={csvMeta.headers}
            mapping={columnMapping}
            onChange={m => { setColumnMapping(m); setPreview(null); }}
          />
        </div>
      )}

      {/* Step 4: Conflict strategy */}
      {file && effectiveFmt && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>
            {t("import.duplicateHandling", { step: isTabular && csvMeta ? 4 : 3 })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CONFLICT_OPTIONS.map(o => (
              <label key={o.id} style={{
                display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                padding: "8px 12px",
                borderRadius: 7,
                border: `1px solid ${conflict === o.id ? "var(--accent)" : "var(--border)"}`,
                background: conflict === o.id ? "rgba(99,102,241,0.08)" : "transparent",
              }}>
                <input
                  type="radio"
                  name="conflict"
                  value={o.id}
                  checked={conflict === o.id}
                  onChange={() => setConflict(o.id)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{t(o.label)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(o.sub)}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Preview + Import actions */}
      {file && effectiveFmt && (
        <>
          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 6,
              padding: "8px 12px",
              marginBottom: 12,
              fontSize: 13,
              color: "#ef4444",
            }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              className="btn"
              onClick={handlePreview}
              disabled={previewLoading}
            >
              {previewLoading ? t("import.loadingPreview") : t("import.preview.title")}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? t("import.importing") : t("import.title")}
            </button>
          </div>
        </>
      )}

      <PreviewPanel preview={preview} />
    </div>
  );
}

window.Import = Import;
