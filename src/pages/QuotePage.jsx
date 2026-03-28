import { useState, useEffect, useRef, useMemo } from "react";
import { apiFetch, API_READY } from "../utils/sheetApi";
import { generateQuoteFromTemplate } from "../utils/quoteExporter";

// ── Helpers ───────────────────────────────────────────────────
let _uid = 0;
const uid  = () => String(++_uid);
const newSlot = () => ({ id: uid(), product: null, query: "" });
const newLine = () => ({ id: uid(), slots: [newSlot()], donVi: "", soLuong: 1 });

function parseN(s) {
  if (typeof s === "number") return s;
  // hỗ trợ cả định dạng VN (1.234.567) và EN (1,234,567)
  const str = String(s || 0).trim();
  const clean = str.replace(/\./g, "").replace(",", ".");
  return parseFloat(clean) || 0;
}

function fmt(n) {
  return Math.round(n || 0).toLocaleString("vi-VN");
}

// ── Main component ────────────────────────────────────────────
export default function QuotePage() {
  const [products, setProducts]       = useState([]);
  const [loadingProd, setLoadingProd] = useState(false);
  const [tyGia, setTyGia]             = useState("1");
  const [vat, setVat]                 = useState("8");
  const [lines, setLines]             = useState([newLine()]);
  const [msg, setMsg]                 = useState(null);
  const [collapsed, setCollapsed]     = useState(new Set()); // lineId → collapsed

  const importRef = useRef();

  // Load danh sách mã hàng từ Google Sheets
  useEffect(() => {
    if (!API_READY) return;
    setLoadingProd(true);
    apiFetch()
      .then((data) => setProducts(data))
      .catch(() => {})
      .finally(() => setLoadingProd(false));
  }, []);

  // ── Line operations ─────────────────────────────────────────
  const addLine = () => setLines((p) => [...p, newLine()]);

  const removeLine = (lineId) =>
    setLines((p) => p.filter((l) => l.id !== lineId));

  const updLine = (lineId, fn) =>
    setLines((p) => p.map((l) => (l.id === lineId ? fn(l) : l)));

  const addSlot = (lineId) =>
    updLine(lineId, (l) => ({ ...l, slots: [...l.slots, newSlot()] }));

  const removeSlot = (lineId, slotId) =>
    updLine(lineId, (l) => ({ ...l, slots: l.slots.filter((s) => s.id !== slotId) }));

  const patchSlot = (lineId, slotId, patch) =>
    updLine(lineId, (l) => ({
      ...l,
      slots: l.slots.map((s) => (s.id === slotId ? { ...s, ...patch } : s)),
    }));

  const setField = (lineId, field, val) =>
    updLine(lineId, (l) => ({ ...l, [field]: val }));

  const flash = (t, m) => { setMsg({ t, m }); setTimeout(() => setMsg(null), 5000); };

  const toggleCollapse = (lineId) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(lineId) ? next.delete(lineId) : next.add(lineId);
      return next;
    });

  const allCollapsed = lines.length > 0 && lines.every(l => collapsed.has(l.id));
  const toggleAll = () =>
    setCollapsed(allCollapsed ? new Set() : new Set(lines.map(l => l.id)));

  // ── Import Excel → tự động tra mã hàng ───────────────────────
  const handleImport = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!window.XLSX) { flash("err", "Thư viện XLSX chưa tải, thử lại"); return; }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb   = window.XLSX.read(ev.target.result, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const data = window.XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (!data.length) { flash("err", "File trống"); return; }

        const keys    = Object.keys(data[0]);
        const findCol = (...aliases) =>
          keys.find(k => aliases.some(a => k.toLowerCase().trim() === a.toLowerCase()));

        const maHangCol  = findCol("mã hàng", "ma hang", "model", "code", "product code", "mã");
        const soLuongCol = findCol("số lượng", "so luong", "qty", "quantity", "sl", "s.lượng");
        const donViCol   = findCol("đơn vị", "don vi", "unit", "dv", "đ.vị");
        const nhomCol    = findCol("nhóm", "nhom", "group", "line", "tổ hợp");

        if (!maHangCol) { flash("err", "Không tìm thấy cột «Mã hàng» trong file"); return; }

        // Nhóm các hàng cùng nhóm thành 1 dòng báo giá
        // Nếu 1 ô "Mã hàng" chứa dấu "+" thì tách thành nhiều slot (giống thao tác thủ công)
        const groups = {};
        const order  = [];
        data.forEach((row, idx) => {
          const raw = String(row[maHangCol] || "").trim();
          if (!raw) return;
          const codes = raw.split("+").map(s => s.trim()).filter(Boolean);
          const gk = nhomCol ? String(row[nhomCol] || idx) : String(idx);
          if (!groups[gk]) { groups[gk] = { codes: [], sl: "1", dv: "" }; order.push(gk); }
          codes.forEach(c => groups[gk].codes.push(c));
          if (soLuongCol && !groups[gk].slSet) { groups[gk].sl = String(row[soLuongCol] || 1); groups[gk].slSet = true; }
          if (donViCol  && !groups[gk].dvSet)  { groups[gk].dv = String(row[donViCol]   || ""); groups[gk].dvSet = true; }
        });

        let matched = 0;
        const notFound = [];

        const newLines = order.map(gk => {
          const g     = groups[gk];
          const slots = g.codes.map(code => {
            const prod = products.find(p => p.maHang.toLowerCase().trim() === code.toLowerCase().trim());
            if (prod) matched++;
            else      notFound.push(code);
            return { id: uid(), product: prod || null, query: code };
          });
          return { id: uid(), slots, donVi: g.dv, soLuong: g.sl };
        });

        if (!newLines.length) { flash("err", "Không có dữ liệu hợp lệ"); return; }

        // Giữ lại dòng cũ đã có sản phẩm, thêm dòng mới
        setLines(prev => [
          ...prev.filter(l => l.slots.some(s => s.product)),
          ...newLines,
        ]);

        const nfMsg = notFound.length
          ? ` — ${notFound.length} mã không khớp: ${notFound.slice(0, 3).join(", ")}${notFound.length > 3 ? "…" : ""}`
          : "";
        flash("ok", `✅ Import ${newLines.length} dòng · ${matched} mã khớp${nfMsg}`);
      } catch (err) {
        flash("err", "Lỗi đọc file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(f);
    e.target.value = "";
  };

  // ── Xuất Excel ────────────────────────────────────────────────
  const handleExport = () => {
    const hasData = computed.some(c => c.model);
    if (!hasData) { flash("err", "Chưa có dữ liệu để xuất"); return; }
    try {
      const buf  = generateQuoteFromTemplate({ lines, computed, subTotal, vatAmount, grandTotal, vat });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `bao-gia-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      flash("ok", "✅ Đã xuất Excel theo mẫu AH-NOTIFIER");
    } catch (err) {
      flash("err", "❌ Lỗi xuất file: " + err.message);
    }
  };

  // ── Computed values ──────────────────────────────────────────
  const rate   = useMemo(() => parseN(tyGia) || 1, [tyGia]);
  const vatPct = useMemo(() => parseN(vat), [vat]);

  const computed = useMemo(() =>
    lines.map((line) => {
      const prods      = line.slots.map((s) => s.product).filter(Boolean);
      const model      = prods.map((p) => p.maHang).join(" + ");
      const moTa       = prods.map((p) => p.moTa).join("\n");
      const nhanHang   = [...new Set(prods.map((p) => p.nhanHang).filter(Boolean))].join(", ");
      const xuatXu     = [...new Set(prods.map((p) => p.xuatXu).filter(Boolean))].join(", ");
      const basePrice  = prods.reduce((s, p) => s + parseN(p.gia2), 0);
      const donGia     = basePrice * rate;
      const soLuong    = parseN(line.soLuong);
      const thanhTien  = donGia * soLuong;
      return { model, moTa, nhanHang, xuatXu, donGia, soLuong, thanhTien };
    }),
  [lines, rate]);

  const subTotal   = computed.reduce((s, c) => s + c.thanhTien, 0);
  const vatAmount  = subTotal * vatPct / 100;
  const grandTotal = subTotal + vatAmount;

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="qb">
      {/* hidden inputs */}
      <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleImport} />

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="qb-head">
        <div>
          <h2 className="pm-title">Tạo báo giá</h2>
          <p className="pm-sub">
            {lines.length} dòng ·{" "}
            {loadingProd ? "đang tải mã hàng..." : `${products.length} mã hàng`}
          </p>
        </div>
        <div className="qb-settings">
          <div className="fld" style={{ margin: 0 }}>
            <label>Tỷ giá (×&nbsp;Giá&nbsp;ĐL mức 2)</label>
            <input
              className="qb-num-in"
              value={tyGia}
              onChange={(e) => setTyGia(e.target.value)}
              placeholder="VD: 27000 hoặc 1"
            />
          </div>
          <div className="fld" style={{ margin: 0 }}>
            <label>VAT (%)</label>
            <input
              className="qb-num-in"
              style={{ width: 70 }}
              value={vat}
              onChange={(e) => setVat(e.target.value)}
              placeholder="8"
            />
          </div>
          <button
            className="btn bgh pm-btn"
            style={{ alignSelf: "flex-end" }}
            onClick={() => importRef.current?.click()}
            title="Import danh sách mã hàng từ file Excel"
          >
            ⬆ Import báo giá
          </button>
        </div>
      </div>

      {msg && <div className={`al ${msg.t}`} style={{ marginBottom: 10 }}>{msg.m}</div>}

      {!API_READY && (
        <div className="al err" style={{ marginBottom: 12 }}>
          ⚠ Chưa kết nối Google Sheets — danh sách mã hàng trống.
        </div>
      )}

      {/* ── Hướng dẫn import ──────────────────────────────── */}
      <div className="qb-import-hint">
        <strong>Import Excel:</strong> File cần có cột <code>Mã hàng</code> (bắt buộc) ·
        tuỳ chọn: <code>Số lượng</code> · <code>Đơn vị</code> ·
        <code>Nhóm</code> (cùng số nhóm → gộp thành 1 dòng dùng dấu +)
      </div>

      {/* ── Line builder ───────────────────────────────────── */}
      {/* ── Lines toolbar ──────────────────────────────────── */}
      {lines.length > 1 && (
        <div className="qb-lines-bar">
          <button className="qb-collapse-all" onClick={toggleAll}>
            {allCollapsed ? "▶ Mở tất cả" : "▼ Thu gọn tất cả"}
          </button>
        </div>
      )}

      <div className="qb-lines">
        {lines.map((line, idx) => {
          const c        = computed[idx];
          const isCollapsed = collapsed.has(line.id);
          const modelStr = line.slots.map(s => s.query || s.product?.maHang || "").filter(Boolean).join(" + ") || "—";

          return (
            <div key={line.id} className={`qb-line${isCollapsed ? " qb-line-collapsed" : ""}`}>
              {/* Line header — always visible */}
              <div className="qb-line-top" onClick={() => toggleCollapse(line.id)} style={{ cursor: "pointer" }}>
                <div className="qb-line-top-left">
                  <span className="qb-collapse-chevron">{isCollapsed ? "▶" : "▼"}</span>
                  <span className="qb-line-lbl">Dòng {idx + 1}</span>
                  {isCollapsed && (
                    <span className="qb-line-summary">
                      <span className="qb-sum-model">{modelStr}</span>
                      {c.model && (
                        <>
                          <span className="qb-sum-sep">·</span>
                          <span>SL: {line.soLuong}</span>
                          {line.donVi && <span className="qb-sum-sep">{line.donVi}</span>}
                          <span className="qb-sum-sep">·</span>
                          <span className="qb-sum-tt">{fmt(c.thanhTien)}</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
                {lines.length > 1 && (
                  <button
                    className="pm-ico del"
                    onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}
                    title="Xóa dòng"
                  >✕</button>
                )}
              </div>

              {/* Body — hidden when collapsed */}
              {!isCollapsed && (
                <>
                  {/* Code slots */}
                  <div className="qb-slots">
                    {line.slots.map((slot, si) => (
                      <div key={slot.id} className="qb-slot">
                        {si > 0 && <span className="qb-plus">+</span>}
                        <SearchSelect
                          products={products}
                          value={slot.product}
                          query={slot.query}
                          onQuery={(q) => patchSlot(line.id, slot.id, { query: q, product: null })}
                          onChange={(p) =>
                            patchSlot(line.id, slot.id, {
                              product: p,
                              query: p ? p.maHang : "",
                            })
                          }
                        />
                        {line.slots.length > 1 && (
                          <button
                            className="pm-ico del"
                            onClick={() => removeSlot(line.id, slot.id)}
                            title="Bỏ mã này"
                          >✕</button>
                        )}
                      </div>
                    ))}
                    <button
                      className="qb-add-slot"
                      onClick={() => addSlot(line.id)}
                      title="Cộng thêm mã hàng"
                    >+</button>
                  </div>

                  {/* Fields + computed */}
                  <div className="qb-fields">
                    <div className="fld" style={{ margin: 0 }}>
                      <label>Đơn vị</label>
                      <input
                        className="qb-field-in"
                        value={line.donVi}
                        onChange={(e) => setField(line.id, "donVi", e.target.value)}
                        placeholder="Bộ, Chiếc..."
                      />
                    </div>
                    <div className="fld" style={{ margin: 0 }}>
                      <label>Số lượng</label>
                      <input
                        className="qb-field-in"
                        type="number"
                        min="0"
                        value={line.soLuong}
                        onChange={(e) => setField(line.id, "soLuong", e.target.value)}
                      />
                    </div>
                    <div className="qb-calc">
                      <span className="qb-calc-lbl">Đơn giá</span>
                      <span className="qb-calc-val">{fmt(c.donGia)}</span>
                    </div>
                    <div className="qb-calc">
                      <span className="qb-calc-lbl">Thành tiền</span>
                      <span className="qb-calc-val hi">{fmt(c.thanhTien)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="btn bgh"
        style={{ marginBottom: 28, width: "auto", padding: "8px 20px" }}
        onClick={addLine}
      >
        + Thêm dòng mới
      </button>

      {/* ── Preview table ───────────────────────────────────── */}
      <div className="qprev-wrap">
        <div className="qprev-title">
          <span>Bảng báo giá</span>
          <div className="qprev-actions">
            <button
              className="qprev-btn qprev-btn-green"
              onClick={handleExport}
              title="Xuất Excel theo mẫu AH-NOTIFIER"
            >
              ⬇ Xuất Excel
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="qtbl">
            <thead>
              <tr>
                <th className="qt-th qt-stt" rowSpan={2}>No.<br /><em>STT</em></th>
                <th className="qt-th qt-model" rowSpan={2}>Model</th>
                <th className="qt-th qt-desc" rowSpan={2}>Description<br /><em>Mô tả</em></th>
                <th className="qt-th" rowSpan={2}>Brand<br /><em>Nhãn Hàng</em></th>
                <th className="qt-th" rowSpan={2}>Origin<br /><em>Xuất xứ</em></th>
                <th className="qt-th qt-center" rowSpan={2}>Unit<br /><em>Đ.Vị</em></th>
                <th className="qt-th qt-center" rowSpan={2}>Qty<br /><em>S.Lượng</em></th>
                <th className="qt-th qt-r" colSpan={2}>Amount / <em>Tổng số</em></th>
              </tr>
              <tr>
                <th className="qt-th qt-r">U.Price<br /><em>Đơn giá</em></th>
                <th className="qt-th qt-r">Total<br /><em>Thành tiền</em></th>
              </tr>
            </thead>
            <tbody>
              {computed.map((c, i) => {
                if (!c.model) return null;
                return (
                  <tr key={lines[i].id} className="qt-row">
                    <td className="qt-stt">{i + 1}</td>
                    <td className="qt-model-cell">{c.model}</td>
                    <td className="qt-desc-cell">{c.moTa}</td>
                    <td>{c.nhanHang}</td>
                    <td>{c.xuatXu}</td>
                    <td className="qt-center">{lines[i].donVi}</td>
                    <td className="qt-center">{c.soLuong || ""}</td>
                    <td className="qt-r qt-num">{c.donGia ? fmt(c.donGia) : ""}</td>
                    <td className="qt-r qt-num">{c.thanhTien ? fmt(c.thanhTien) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="qt-sub">
                <td colSpan={8} className="qt-sum-lbl">
                  Tổng thành tiền / <em>Sub-Total</em>
                </td>
                <td className="qt-r qt-num">{fmt(subTotal)}</td>
              </tr>
              <tr className="qt-sub">
                <td colSpan={8} className="qt-sum-lbl">
                  VAT - {vat || 0}%
                </td>
                <td className="qt-r qt-num">{fmt(vatAmount)}</td>
              </tr>
              <tr className="qt-grand">
                <td colSpan={8} className="qt-sum-lbl">
                  Thành tiền sau thuế / <em>Grand total</em>
                </td>
                <td className="qt-r qt-num">{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Searchable dropdown ───────────────────────────────────────
function SearchSelect({ products, value, query, onQuery, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.maHang.toLowerCase().includes(q) ||
            p.moTa.toLowerCase().includes(q)
        )
      : products;
    return list.slice(0, 30);
  }, [products, query]);

  return (
    <div className="ss-wrap" ref={ref}>
      <input
        className={`ss-in${value ? " ss-filled" : ""}`}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Tìm mã hàng..."
      />
      {value && (
        <button
          className="ss-clr"
          onMouseDown={(e) => {
            e.preventDefault();
            onChange(null);
            onQuery("");
          }}
        >×</button>
      )}
      {open && filtered.length > 0 && (
        <div className="ss-list">
          {filtered.map((p) => (
            <div
              key={p._row}
              className={`ss-item${value?._row === p._row ? " ss-on" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(p);
                setOpen(false);
              }}
            >
              <span className="ss-code">{p.maHang}</span>
              <span className="ss-desc">{p.moTa}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
