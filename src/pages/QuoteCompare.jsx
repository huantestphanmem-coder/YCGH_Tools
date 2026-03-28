import { useState, useRef } from "react";

// ── Parse 1 file báo giá → array of row objects ──────────────
function parseQuote(arrayBuffer) {
  if (!window.XLSX) throw new Error("Thư viện XLSX chưa tải");
  const wb = window.XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // Tìm hàng header chứa "Model" ở cột B (index 1)
  let hdrIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    if (String(raw[i][1] || "").trim().toLowerCase() === "model") {
      hdrIdx = i;
      break;
    }
  }
  if (hdrIdx === -1) throw new Error("Không tìm thấy hàng header «Model» trong file");

  const toNum = (v) => {
    const n = parseFloat(String(v).replace(/\./g, "").replace(/,/g, "."));
    return isNaN(n) ? 0 : n;
  };

  const rows = [];
  for (let i = hdrIdx + 3; i < raw.length; i++) {
    const r = raw[i];
    const model = String(r[1] || "").trim();
    if (!model) continue;
    // Dừng ở summary rows
    const low = model.toLowerCase();
    if (
      low.includes("tổng") || low.includes("vat") ||
      low.includes("sub-total") || low.includes("grand") ||
      low.includes("total")
    ) break;

    rows.push({
      model,
      moTa:   String(r[2] || "").trim(),
      brand:  String(r[3] || "").trim(),
      origin: String(r[4] || "").trim(),
      unit:   String(r[5] || "").trim(),
      qty:    toNum(r[6]),
      uprice: toNum(r[7]),
      total:  toNum(r[8]),
    });
  }
  return rows;
}

// ── So sánh 2 arrays → diff results ──────────────────────────
const NUM_FIELDS   = ["qty", "uprice", "total"];
const ALL_FIELDS   = ["moTa", "brand", "origin", "unit", "qty", "uprice", "total"];

function compareQuotes(rowsA, rowsB) {
  const mapA = new Map(rowsA.map(r => [r.model, r]));
  const mapB = new Map(rowsB.map(r => [r.model, r]));
  const allModels = [...new Set([...mapA.keys(), ...mapB.keys()])];

  return allModels.map(model => {
    const a = mapA.get(model);
    const b = mapB.get(model);
    if (!a) return { model, status: "added",   rowA: null, rowB: b, diffs: {} };
    if (!b) return { model, status: "removed", rowA: a, rowB: null, diffs: {} };

    const diffs = {};
    for (const key of ALL_FIELDS) {
      const va = NUM_FIELDS.includes(key) ? a[key] : String(a[key] ?? "").trim();
      const vb = NUM_FIELDS.includes(key) ? b[key] : String(b[key] ?? "").trim();
      if (String(va) !== String(vb)) diffs[key] = { from: va, to: vb };
    }
    return {
      model,
      status: Object.keys(diffs).length ? "changed" : "same",
      rowA: a, rowB: b, diffs,
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────
const fmt = (v) => {
  const n = parseFloat(String(v));
  return isNaN(n) ? String(v ?? "") : n.toLocaleString("vi-VN");
};

const STATUS_META = {
  same:    { icon: "=",  label: "Giống nhau",  cls: "cmp-row-same"    },
  changed: { icon: "≠",  label: "Thay đổi",    cls: "cmp-row-changed" },
  added:   { icon: "+",  label: "Thêm mới",    cls: "cmp-row-added"   },
  removed: { icon: "−",  label: "Bị xóa",      cls: "cmp-row-removed" },
};

const FILTERS = [
  { key: "diff",    label: "Chỉ khác biệt" },
  { key: "all",     label: "Tất cả" },
  { key: "changed", label: "Thay đổi" },
  { key: "added",   label: "Thêm mới" },
  { key: "removed", label: "Bị xóa" },
  { key: "same",    label: "Giống nhau" },
];

// ── Upload zone component ─────────────────────────────────────
function DropZone({ label, name, fileRef, onFile }) {
  const [dragging, setDragging] = useState(false);
  const handle = (f) => { if (f && /\.xlsx?$/i.test(f.name)) onFile(f); };

  return (
    <div
      className={`cmp-drop${name ? " cmp-drop-filled" : ""}${dragging ? " cmp-drop-drag" : ""}`}
      onClick={() => fileRef.current.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={e => handle(e.target.files[0])}
      />
      <span className="cmp-drop-icon">{name ? "📄" : "📂"}</span>
      <span className="cmp-drop-lbl">{label}</span>
      <span className="cmp-drop-name">{name || "Kéo thả hoặc nhấn để chọn .xlsx"}</span>
      {name && <span className="cmp-drop-change">Đổi file</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function QuoteCompare() {
  const refA = useRef();
  const refB = useRef();
  const [nameA, setNameA] = useState("");
  const [nameB, setNameB] = useState("");
  const [bufA,  setBufA]  = useState(null);
  const [bufB,  setBufB]  = useState(null);
  const [diffs, setDiffs] = useState(null);
  const [filter, setFilter] = useState("diff");
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  const loadFile = (file, setName, setBuf) => {
    setName(file.name);
    const reader = new FileReader();
    reader.onload = e => setBuf(e.target.result);
    reader.readAsArrayBuffer(file);
    setDiffs(null);
  };

  const handleCompare = () => {
    setErr(""); setLoading(true);
    try {
      if (!bufA || !bufB) throw new Error("Vui lòng chọn đủ 2 file");
      const rowsA = parseQuote(bufA);
      const rowsB = parseQuote(bufB);
      if (!rowsA.length && !rowsB.length) throw new Error("Cả 2 file đều không có dữ liệu sản phẩm");
      setDiffs(compareQuotes(rowsA, rowsB));
      setFilter("diff");
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  const summary = diffs ? {
    same:    diffs.filter(d => d.status === "same").length,
    changed: diffs.filter(d => d.status === "changed").length,
    added:   diffs.filter(d => d.status === "added").length,
    removed: diffs.filter(d => d.status === "removed").length,
  } : null;

  const displayed = diffs
    ? filter === "all"  ? diffs
    : filter === "diff" ? diffs.filter(d => d.status !== "same")
    : diffs.filter(d => d.status === filter)
    : [];

  const hasDiff = summary && (summary.changed + summary.added + summary.removed) > 0;

  // Render một cell — nếu là changed cell thì hiển thị from → to
  const renderCell = (d, field) => {
    const isNum = NUM_FIELDS.includes(field);
    if (d.status === "removed") {
      const v = d.rowA[field];
      return isNum ? fmt(v) : v;
    }
    if (d.status !== "changed" || !d.diffs[field]) {
      const v = (d.rowB || d.rowA)[field];
      return isNum ? fmt(v) : v;
    }
    const { from, to } = d.diffs[field];
    return (
      <span className="cmp-diff-cell">
        <span className="cmp-from">{isNum ? fmt(from) : from}</span>
        <span className="cmp-arrow">→</span>
        <span className="cmp-to">{isNum ? fmt(to) : to}</span>
      </span>
    );
  };

  return (
    <div className="cmp">
      <div className="cmp-header">
        <h2 className="cmp-title">So sánh báo giá</h2>
        <p className="cmp-sub">Tải 2 file báo giá cùng template để tìm điểm khác biệt</p>
      </div>

      {/* ── Upload zones ── */}
      <div className="cmp-uploads">
        <DropZone label="File A — Bản gốc" name={nameA} fileRef={refA}
          onFile={f => loadFile(f, setNameA, setBufA)} />
        <div className="cmp-vs">VS</div>
        <DropZone label="File B — Bản mới" name={nameB} fileRef={refB}
          onFile={f => loadFile(f, setNameB, setBufB)} />
      </div>

      {err && <div className="cmp-err">{err}</div>}

      <div className="cmp-actions">
        <button
          className="btn bgh"
          style={{ padding: "9px 28px" }}
          onClick={handleCompare}
          disabled={!bufA || !bufB || loading}
        >
          {loading ? "Đang so sánh…" : "🔍 So sánh"}
        </button>
        {diffs && (
          <button className="cmp-reset" onClick={() => {
            setDiffs(null); setNameA(""); setNameB("");
            setBufA(null); setBufB(null); setErr("");
          }}>✕ Làm mới</button>
        )}
      </div>

      {/* ── Results ── */}
      {diffs && (
        <div className="cmp-result">

          {/* Summary badges */}
          <div className="cmp-summary">
            {hasDiff ? (
              <>
                {summary.changed > 0 && (
                  <div className="cmp-stat cmp-stat-changed">
                    <span className="cmp-stat-num">{summary.changed}</span>
                    <span className="cmp-stat-lbl">dòng thay đổi</span>
                  </div>
                )}
                {summary.added > 0 && (
                  <div className="cmp-stat cmp-stat-added">
                    <span className="cmp-stat-num">{summary.added}</span>
                    <span className="cmp-stat-lbl">dòng thêm mới</span>
                  </div>
                )}
                {summary.removed > 0 && (
                  <div className="cmp-stat cmp-stat-removed">
                    <span className="cmp-stat-num">{summary.removed}</span>
                    <span className="cmp-stat-lbl">dòng bị xóa</span>
                  </div>
                )}
                <div className="cmp-stat cmp-stat-same">
                  <span className="cmp-stat-num">{summary.same}</span>
                  <span className="cmp-stat-lbl">dòng giống nhau</span>
                </div>
              </>
            ) : (
              <div className="cmp-identical">✅ Hai file hoàn toàn giống nhau</div>
            )}
          </div>

          {/* Filter tabs */}
          <div className="cmp-filters">
            {FILTERS.map(f => {
              const cnt = f.key === "all"  ? diffs.length
                        : f.key === "diff" ? (summary.changed + summary.added + summary.removed)
                        : summary[f.key] ?? 0;
              return (
                <button
                  key={f.key}
                  className={`cmp-ftab${filter === f.key ? " active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label} <span className="cmp-ftab-cnt">{cnt}</span>
                </button>
              );
            })}
          </div>

          {/* Diff table */}
          <div className="cmp-table-wrap">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th className="cmp-th-st" title="Trạng thái"></th>
                  <th>Model</th>
                  <th className="cmp-th-desc">Mô tả</th>
                  <th>Brand</th>
                  <th>Origin</th>
                  <th>Unit</th>
                  <th className="cmp-th-num">S.Lượng</th>
                  <th className="cmp-th-num">Đơn giá</th>
                  <th className="cmp-th-num">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {displayed.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="cmp-empty">Không có dòng nào phù hợp bộ lọc</td>
                  </tr>
                ) : displayed.map((d, i) => {
                  const m = STATUS_META[d.status];
                  return (
                    <tr key={i} className={`cmp-row ${m.cls}`}>
                      <td className="cmp-td-st">
                        <span className={`cmp-badge cmp-badge-${d.status}`} title={m.label}>
                          {m.icon}
                        </span>
                      </td>
                      <td className="cmp-td-model">{d.model}</td>
                      <td className="cmp-td-desc">{renderCell(d, "moTa")}</td>
                      <td>{renderCell(d, "brand")}</td>
                      <td>{renderCell(d, "origin")}</td>
                      <td>{renderCell(d, "unit")}</td>
                      <td className="cmp-td-num">{renderCell(d, "qty")}</td>
                      <td className="cmp-td-num">{renderCell(d, "uprice")}</td>
                      <td className="cmp-td-num">{renderCell(d, "total")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
