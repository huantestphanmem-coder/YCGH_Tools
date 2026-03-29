import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { API_READY, apiFetch, apiPost } from "../utils/sheetApi";

/** Parse chuỗi giá ở nhiều định dạng về số JS */
const parsePrice = (v) => {
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  if (s.includes(",") && s.includes(".")) {
    // Cả hai dấu: dấu nào xuất hiện sau cùng là dấu thập phân
    return s.lastIndexOf(",") > s.lastIndexOf(".")
      ? parseFloat(s.replace(/\./g, "").replace(",", "."))  // vi: 2.976,04
      : parseFloat(s.replace(/,/g, ""));                     // en: 2,976.04
  }
  if (s.includes(",") && !s.includes(".")) {
    // Chỉ có dấu phẩy: nếu phần sau dấu phẩy cuối đúng 3 chữ số → hàng nghìn
    const tail = s.split(",").pop();
    return tail.length === 3 ? parseFloat(s.replace(/,/g, "")) : parseFloat(s.replace(",", "."));
  }
  if (s.includes(".") && !s.includes(",")) {
    // Chỉ có dấu chấm: nếu TẤT CẢ phần sau dấu chấm đều đúng 3 chữ số → hàng nghìn
    const parts = s.split(".");
    return parts.slice(1).every(p => p.length === 3)
      ? parseFloat(s.replace(/\./g, ""))  // 297.604 → 297604
      : parseFloat(s);                     // 2976.04 → 2976.04
  }
  return parseFloat(s);
};

const fmtNum = (v) => {
  if (v === "" || v == null) return "";
  const n = parsePrice(v);
  if (isNaN(n)) return String(v ?? "");
  return n.toLocaleString("en-US");
};

const EMPTY = {
  maHang: "",
  moTa: "",
  nhanHang: "",
  xuatXu: "",
  xuatXuDayDu: "",
  gia1: "",
  gia2: "",
  tienTe: "",
};

const HEADERS = [
  "STT",
  "Mã hàng",
  "Mô tả của hãng",
  "Nhãn hàng",
  "Xuất xứ",
  "Xuất xứ đầy đủ",
  "Giá bán đại lý (mức 1)",
  "Giá bán đại lý (mức 2)",
  "Tiền tệ",
];

export default function ProductCodeManager() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [filterXX, setFilterXX] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const importRef = useRef();

  const xxOptions = useMemo(
    () => [...new Set(rows.map((r) => r.xuatXu).filter(Boolean))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (x) =>
          x.maHang.toLowerCase().includes(q) ||
          x.moTa.toLowerCase().includes(q)
      );
    }
    if (filterXX) r = r.filter((x) => x.xuatXu === filterXX);
    return r;
  }, [rows, search, filterXX]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(currentPage, totalPages);
  const paged      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Reset về trang 1 khi thay đổi bộ lọc hoặc page size
  useEffect(() => { setCurrentPage(1); }, [search, filterXX, pageSize]);

  const flash = (t, m) => {
    setMsg({ t, m });
    setTimeout(() => setMsg(null), 4000);
  };

  // ── Load từ Google Sheets ────────────────────────────────
  const loadData = useCallback(async () => {
    if (!API_READY) return;
    setLoading(true);
    try {
      const data = await apiFetch();
      setRows(data);
    } catch (err) {
      flash("err", "❌ Không thể tải dữ liệu: " + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── CRUD ─────────────────────────────────────────────────
  const openAdd = () => setModal({ mode: "add", data: { ...EMPTY } });
  const openEdit = (row) =>
    setModal({ mode: "edit", data: { ...row }, _row: row._row });

  const saveModal = async (data) => {
    if (!data.maHang.trim()) {
      flash("err", "Mã hàng không được để trống");
      return;
    }
    setSyncing(true);
    try {
      if (modal.mode === "add") {
        if (API_READY) {
          await apiPost({ action: "create", payload: data });
          await loadData();
        } else {
          setRows((prev) => [...prev, { ...data, _row: Date.now() }]);
        }
        flash("ok", "✅ Đã thêm mã hàng");
      } else {
        if (API_READY) {
          await apiPost({ action: "update", row: modal._row, payload: data });
          await loadData();
        } else {
          setRows((prev) =>
            prev.map((r) => (r._row === modal._row ? { ...data, _row: modal._row } : r))
          );
        }
        flash("ok", "✅ Đã cập nhật");
      }
      setModal(null);
    } catch (err) {
      flash("err", "❌ Lỗi đồng bộ: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const deleteRow = async (row) => {
    setSyncing(true);
    try {
      if (API_READY) {
        await apiPost({ action: "delete", row: row._row });
        await loadData();
      } else {
        setRows((prev) => prev.filter((r) => r._row !== row._row));
      }
      flash("ok", "✅ Đã xóa");
    } catch (err) {
      flash("err", "❌ Lỗi xóa: " + err.message);
    } finally {
      setSyncing(false);
      setConfirmDel(null);
    }
  };

  // ── Import Excel ─────────────────────────────────────────
  const handleImport = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!window.XLSX) {
      flash("err", "Thư viện Excel chưa tải xong, thử lại");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = window.XLSX.read(ev.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (!data.length) {
          flash("err", "File trống hoặc không đúng định dạng");
          return;
        }
        const colMap = {
          maHang: ["mã hàng", "ma hang", "product code", "code", "mã"],
          moTa: ["mô tả của hãng", "mo ta cua hang", "mô tả", "description", "mo ta"],
          nhanHang: ["nhãn hàng", "nhan hang", "brand", "nhãn"],
          xuatXu: ["xuất xứ", "xuat xu", "origin", "country"],
          xuatXuDayDu: ["xuất xứ đầy đủ", "xuat xu day du", "full origin", "country full"],
          gia1: ["giá bán đại lý (mức 1)", "gia1", "price 1", "giá 1"],
          gia2: ["giá bán đại lý (mức 2)", "gia2", "price 2", "giá 2"],
          tienTe: ["tiền tệ", "tien te", "currency"],
        };
        const keys = Object.keys(data[0]);
        const findKey = (aliases) =>
          keys.find((k) => aliases.some((a) => k.toLowerCase().trim() === a));
        const mapped = Object.fromEntries(
          Object.entries(colMap).map(([f, aliases]) => [f, findKey(aliases)])
        );
        const newRows = data.map((row) => ({
          maHang: String(row[mapped.maHang] ?? ""),
          moTa: String(row[mapped.moTa] ?? ""),
          nhanHang: String(row[mapped.nhanHang] ?? ""),
          xuatXu: String(row[mapped.xuatXu] ?? ""),
          xuatXuDayDu: String(row[mapped.xuatXuDayDu] ?? ""),
          gia1: String(row[mapped.gia1] ?? ""),
          gia2: String(row[mapped.gia2] ?? ""),
          tienTe: String(row[mapped.tienTe] ?? ""),
        }));

        if (API_READY) {
          setSyncing(true);
          try {
            for (const r of newRows) {
              await apiPost({ action: "create", payload: r });
            }
            await loadData();
            flash("ok", `✅ Đã import ${newRows.length} mã hàng lên Google Sheets`);
          } catch (err) {
            flash("err", "❌ Lỗi import: " + err.message);
          } finally {
            setSyncing(false);
          }
        } else {
          setRows((prev) => [
            ...prev,
            ...newRows.map((r) => ({ ...r, _row: Date.now() + Math.random() })),
          ]);
          flash("ok", `✅ Đã import ${newRows.length} mã hàng`);
        }
      } catch (err) {
        flash("err", "Lỗi đọc file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = "";
  };

  // ── Export Excel ──────────────────────────────────────────
  const handleExport = () => {
    if (!window.XLSX) {
      flash("err", "Thư viện Excel chưa tải xong, thử lại");
      return;
    }
    if (!rows.length) return;
    const exportData = rows.map((r, i) => ({
      STT: i + 1,
      "Mã hàng": r.maHang,
      "Mô tả của hãng": r.moTa,
      "Nhãn hàng": r.nhanHang,
      "Xuất xứ": r.xuatXu,
      "Xuất xứ đầy đủ": r.xuatXuDayDu,
      "Giá bán đại lý (mức 1)": parsePrice(r.gia1),
      "Giá bán đại lý (mức 2)": parsePrice(r.gia2),
      "Tiền tệ": r.tienTe,
    }));
    const ws = window.XLSX.utils.json_to_sheet(exportData);
    // Áp dụng format số có dấu chấm ngăn cách hàng nghìn cho cột gia1, gia2
    const priceColLetters = ["G", "H"];
    const wsRange = window.XLSX.utils.decode_range(ws["!ref"]);
    for (let r = wsRange.s.r + 1; r <= wsRange.e.r; r++) {
      priceColLetters.forEach(col => {
        const addr = `${col}${r + 1}`;
        if (ws[addr] && ws[addr].t === "n") ws[addr].z = "#,##0.##";
      });
    }
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Mã hàng");
    window.XLSX.writeFile(wb, "quan-ly-ma-hang.xlsx");
    flash("ok", `✅ Đã xuất ${rows.length} mã hàng ra file Excel`);
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="pm">
      {/* Header */}
      <div className="pm-head">
        <div>
          <h2 className="pm-title">Quản lý mã hàng</h2>
          <p className="pm-sub">
            {API_READY
              ? `${rows.length} mã hàng · Google Sheets`
              : "⚠ Chưa kết nối Google Sheets"}
          </p>
        </div>
        <div className="pm-actions">
          {API_READY && (
            <button
              className="btn bgh pm-btn"
              onClick={loadData}
              disabled={loading || syncing}
              title="Tải lại từ Google Sheets"
            >
              {loading ? <span className="spin" /> : "↻"} Làm mới
            </button>
          )}
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleImport}
          />
          <button
            className="btn bgh pm-btn"
            onClick={() => importRef.current?.click()}
            disabled={syncing}
          >
            ⬆ Import Excel
          </button>
          <button
            className="btn bgh pm-btn"
            onClick={handleExport}
            disabled={!rows.length || syncing}
          >
            ⬇ Export Excel
          </button>
          <button className="btn bb pm-btn" onClick={openAdd} disabled={syncing}>
            + Thêm mới
          </button>
        </div>
      </div>

      {/* API chưa được cấu hình */}
      {!API_READY && (
        <div className="al err" style={{ marginBottom: 12 }}>
          ⚠ Chưa cấu hình URL Google Apps Script. Mở file{" "}
          <code>src/pages/ProductCodeManager.jsx</code> và thay{" "}
          <code>PASTE_YOUR_APPS_SCRIPT_URL_HERE</code> bằng URL thực.
          Dữ liệu hiện tại chỉ lưu tạm trong bộ nhớ.
        </div>
      )}

      {/* Syncing indicator */}
      {syncing && (
        <div className="info" style={{ marginBottom: 10 }}>
          <span className="spin" /> Đang đồng bộ Google Sheets...
        </div>
      )}

      {msg && <div className={`al ${msg.t}`} style={{ marginBottom: 10 }}>{msg.m}</div>}

      {/* Toolbar */}
      <div className="pm-toolbar">
        <div className="pm-search">
          <span className="pm-search-icon">🔍</span>
          <input
            className="pm-search-input"
            placeholder="Tìm theo mã hàng hoặc mô tả của hãng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="pm-clear" onClick={() => setSearch("")}>×</button>
          )}
        </div>
        <select
          className="pm-filter"
          value={filterXX}
          onChange={(e) => setFilterXX(e.target.value)}
        >
          <option value="">Tất cả xuất xứ</option>
          {xxOptions.map((xx) => (
            <option key={xx} value={xx}>{xx}</option>
          ))}
        </select>
        <select
          className="pm-filter"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          title="Số dòng mỗi trang"
        >
          {[50, 100, 200, 500].map((n) => (
            <option key={n} value={n}>{n} dòng/trang</option>
          ))}
        </select>
        {(search || filterXX) && (
          <span className="pm-count">{filtered.length}/{rows.length} kết quả</span>
        )}
      </div>

      {/* Table */}
      <div className="tw pm-tw">
        <table>
          <thead>
            <tr>
              {HEADERS.map((h) => <th key={h}>{h}</th>)}
              <th style={{ width: 76 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={HEADERS.length + 1} className="empty">
                  <span className="spin" style={{ marginRight: 8 }} />
                  Đang tải từ Google Sheets...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length + 1} className="empty">
                  {rows.length === 0
                    ? "Chưa có dữ liệu — nhấn «Thêm mới» hoặc «Import Excel»"
                    : "Không tìm thấy kết quả phù hợp"}
                </td>
              </tr>
            ) : (
              paged.map((row, i) => (
                <tr key={row._row}>
                  <td>{(safePage - 1) * pageSize + i + 1}</td>
                  <td><span className="chip">{row.maHang}</span></td>
                  <td className="pm-desc">{row.moTa}</td>
                  <td>{row.nhanHang}</td>
                  <td>
                    {row.xuatXu && (
                      <span className="pm-origin">{row.xuatXu}</span>
                    )}
                  </td>
                  <td>{row.xuatXuDayDu}</td>
                  <td className="pm-num">{fmtNum(row.gia1)}</td>
                  <td className="pm-num">{fmtNum(row.gia2)}</td>
                  <td>{row.tienTe && <span className="qc">{row.tienTe}</span>}</td>
                  <td>
                    <div className="pm-row-act">
                      <button
                        className="pm-ico edit"
                        onClick={() => openEdit(row)}
                        disabled={syncing}
                        title="Chỉnh sửa"
                      >✏</button>
                      <button
                        className="pm-ico del"
                        onClick={() => setConfirmDel(row)}
                        disabled={syncing}
                        title="Xóa"
                      >✕</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="pgn">
          <span className="pgn-info">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} / {filtered.length} mã hàng
          </span>
          <div className="pgn-btns">
            <button className="pgn-btn" onClick={() => setCurrentPage(1)}        disabled={safePage === 1}>«</button>
            <button className="pgn-btn" onClick={() => setCurrentPage((p) => p - 1)} disabled={safePage === 1}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === "…" ? (
                  <span key={`e${idx}`} className="pgn-ellipsis">…</span>
                ) : (
                  <button
                    key={p}
                    className={`pgn-btn${p === safePage ? " pgn-active" : ""}`}
                    onClick={() => setCurrentPage(p)}
                  >{p}</button>
                )
              )}
            <button className="pgn-btn" onClick={() => setCurrentPage((p) => p + 1)} disabled={safePage === totalPages}>›</button>
            <button className="pgn-btn" onClick={() => setCurrentPage(totalPages)}   disabled={safePage === totalPages}>»</button>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <EditModal
          modal={modal}
          syncing={syncing}
          onSave={saveModal}
          onClose={() => setModal(null)}
        />
      )}

      {/* Delete Confirm */}
      {confirmDel && (
        <div className="modal-overlay">
          <div className="modal-box modal-sm">
            <p className="modal-confirm-text">
              Xác nhận xóa mã hàng{" "}
              <span className="chip">{confirmDel.maHang}</span>?
              {API_READY && <><br /><span style={{ fontSize: 10, color: "#7a8bb0" }}>Dữ liệu sẽ bị xóa khỏi Google Sheets</span></>}
            </p>
            <div className="modal-footer">
              <button className="btn bgh" onClick={() => setConfirmDel(null)} disabled={syncing}>
                Hủy
              </button>
              <button
                className="btn"
                style={{ background: "#ef4444", color: "#fff" }}
                onClick={() => deleteRow(confirmDel)}
                disabled={syncing}
              >
                {syncing ? <span className="spin" /> : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Edit / Add Modal ──────────────────────────────────────────
function EditModal({ modal, syncing, onSave, onClose }) {
  const [form, setForm] = useState(modal.data);
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            {modal.mode === "add" ? "Thêm mã hàng mới" : "Chỉnh sửa mã hàng"}
          </span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="modal-grid">
            <MField label="Mã hàng *" value={form.maHang} onChange={(v) => set("maHang", v)} placeholder="VD: 1SL0200-0AE17" />
            <MField label="Nhãn hàng" value={form.nhanHang} onChange={(v) => set("nhanHang", v)} placeholder="VD: Siemens, ABB" />
            <MField label="Mô tả của hãng" value={form.moTa} onChange={(v) => set("moTa", v)} placeholder="Mô tả sản phẩm theo tài liệu hãng" full />
            <MField label="Xuất xứ" value={form.xuatXu} onChange={(v) => set("xuatXu", v)} placeholder="VD: DE, JP, CN" />
            <MField label="Xuất xứ đầy đủ" value={form.xuatXuDayDu} onChange={(v) => set("xuatXuDayDu", v)} placeholder="VD: Germany, Japan" />
            <MField label="Giá ĐL (mức 1)" value={form.gia1} onChange={(v) => set("gia1", v)} placeholder="VD: 1500000" />
            <MField label="Giá ĐL (mức 2)" value={form.gia2} onChange={(v) => set("gia2", v)} placeholder="VD: 1350000" />
            <MField label="Tiền tệ" value={form.tienTe} onChange={(v) => set("tienTe", v)} placeholder="VD: VND, EUR, USD" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn bgh" onClick={onClose} disabled={syncing}>Hủy</button>
          <button className="btn bb" onClick={() => onSave(form)} disabled={syncing}>
            {syncing ? <span className="spin" /> : modal.mode === "add" ? "Thêm mã hàng" : "Lưu thay đổi"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MField({ label, value, onChange, placeholder, full }) {
  return (
    <div className={`fld${full ? " mfull" : ""}`}>
      <label>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || ""}
      />
    </div>
  );
}
