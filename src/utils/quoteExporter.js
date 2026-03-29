/**
 * quoteExporter.js
 * Xuất báo giá vào template AH-NOTIFIER (được nhúng sẵn).
 * Dùng XML surgery (fflate) để giữ nguyên style/logo/màu sắc.
 *
 * Cấu trúc template:
 *   - Header: rows 55–57 (A-G merged dọc, H55:I55 merged ngang)
 *   - Dữ liệu bắt đầu từ row 58 (template có sẵn 2 dòng mẫu: 58, 59)
 *   - Sub-Total  : row 60, nhãn ở B60, giá trị ở G60 (merge G:I)
 *   - VAT        : row 61, nhãn ở B61, giá trị ở G61
 *   - Grand Total: row 62, nhãn ở B62, giá trị ở G62
 *   - Cột dữ liệu: A=STT, B=Model, C=Mô tả, D=Brand, E=Origin, F=Unit, G=Qty, H=Đơn giá, I=Thành tiền
 */
import { unzipSync, zipSync } from "fflate";
import { QUOTE_TEMPLATE_B64 } from "../assets/quoteTemplate.js";

const DEC = new TextDecoder();
const ENC = new TextEncoder();

// ── Hằng số cấu trúc template ────────────────────────────────
const HDR_LAST_ROW  = 57;  // hàng header cuối cùng
const DATA_START    = 58;  // hàng dữ liệu đầu tiên
const OLD_DATA_CNT  = 2;   // số dòng mẫu trong template
const SUBTOTAL_ROW  = 60;  // hàng Sub-Total
const VAT_ROW_TPL   = 61;  // hàng VAT
const GRAND_ROW     = 62;  // hàng Grand Total
const START_COL     = 1;   // cột A
const TOTAL_COL     = 9;   // cột I = Thành tiền (dùng cho data row)
const SUM_VAL_COL   = 7;   // cột G = ô giá trị summary (merge G:I)

// ── Helpers ───────────────────────────────────────────────────

/** Số cột (1‑based) → chữ cột Excel (1=A, 27=AA …) */
function colLetter(n) {
  let r = "";
  while (n > 0) {
    r = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + r;
    n = Math.floor((n - 1) / 26);
  }
  return r;
}

/** Escape XML special chars */
function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Dịch chuyển số hàng của row XML */
function shiftRow(rowXml, delta) {
  rowXml = rowXml.replace(/(<row[^>]* r=")(\d+)(")/g, (_, a, n, b) => `${a}${+n + delta}${b}`);
  rowXml = rowXml.replace(/(<c[^>]* r=")([A-Z]+)(\d+)(")/g, (_, a, col, n, b) => `${a}${col}${+n + delta}${b}`);
  return rowXml;
}

/** Dịch chuyển mergeCells với hàng > fromRow */
function shiftMerges(mergeXml, fromRow, delta) {
  return mergeXml.replace(/ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g, (_, c1, r1, c2, r2) => {
    const nr1 = +r1 > fromRow ? +r1 + delta : +r1;
    const nr2 = +r2 > fromRow ? +r2 + delta : +r2;
    return `ref="${c1}${nr1}:${c2}${nr2}"`;
  });
}

/** Tạo XML cho 1 dòng dữ liệu (dùng inlineStr để không cần sửa sharedStrings) */
function buildDataRow(rowNum, items) {
  const cells = items.map((item, i) => {
    const ref = colLetter(START_COL + i) + rowNum;
    if (item.isNum) {
      const v = (item.v === "" || item.v == null) ? 0 : item.v;
      return `<c r="${ref}"><v>${v}</v></c>`;
    }
    const val = escXml(String(item.v ?? "")).replace(/\n/g, "&#10;");
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${val}</t></is></c>`;
  }).join("");
  const endCol = START_COL + items.length - 1;
  return `<row r="${rowNum}" spans="${START_COL}:${endCol}">${cells}</row>`;
}

/** Cập nhật ô giá trị trong 1 summary row (cột G, style giữ nguyên) */
function updateSummaryCell(rowXml, colRef, newVal) {
  // Tìm cell tại cột SUM_VAL_COL (G)
  const cellRe = new RegExp(`(<c r="${colRef}"[^>]*>)[\\s\\S]*?</c>`);
  const m = rowXml.match(cellRe);
  if (m) {
    // Giữ thẻ mở (kể cả style s="..."), bỏ formula, ghi value tĩnh
    const openTag = m[1].replace(/\s*t="[^"]*"/, ""); // bỏ type
    return rowXml.replace(cellRe, `${openTag}<v>${newVal}</v></c>`);
  }
  // Không tìm thấy → chèn mới trước </row>
  return rowXml.replace("</row>", `<c r="${colRef}"><v>${newVal}</v></c></row>`);
}

// ── Base64 → Uint8Array ───────────────────────────────────────
function b64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// ── Main export ───────────────────────────────────────────────

/**
 * Điền dữ liệu báo giá vào template nhúng sẵn, trả về ArrayBuffer.
 * @param {{ lines, computed, subTotal, vatAmount, grandTotal, vat }} opts
 */
export function generateQuoteFromTemplate({ lines, computed, subTotal, vatAmount, grandTotal, vat }) {
  // 1. Giải nén template nhúng
  const files = unzipSync(b64ToBytes(QUOTE_TEMPLATE_B64));
  const SHEET = "xl/worksheets/sheet1.xml";
  if (!files[SHEET]) throw new Error("Template bị hỏng – không tìm thấy sheet1.xml");

  let sheetXml = DEC.decode(files[SHEET]);

  // 2. Tách tất cả <row> từ sheetXml
  const rowMap = new Map(); // rowNum → xml
  const rowOrder = [];      // thứ tự gặp
  const rowRe = /(<row\s(?:[^>]*?)(?:\/>|>[\s\S]*?<\/row>))/g;
  let m;
  while ((m = rowRe.exec(sheetXml))) {
    const numM = m[1].match(/\br="(\d+)"/);
    if (numM) {
      const n = parseInt(numM[1]);
      rowMap.set(n, m[1]);
      rowOrder.push(n);
    }
  }

  // 3. Xây dựng dòng dữ liệu mới
  const dataLines = computed
    .map((c, i) => ({ c, line: lines[i] }))
    .filter(({ c }) => c.model);

  const newDataRows = dataLines.map(({ c, line }, i) =>
    buildDataRow(DATA_START + i, [
      { v: i + 1,                           isNum: true  },
      { v: c.model,                          isNum: false },
      { v: c.moTa,                           isNum: false },
      { v: c.nhanHang,                       isNum: false },
      { v: c.xuatXu,                         isNum: false },
      { v: line.donVi,                       isNum: false },
      { v: parseFloat(line.soLuong) || 0,    isNum: true  },
      { v: c.donGia,                          isNum: true  },
      { v: c.thanhTien,                      isNum: true  },
    ])
  );

  // 4. Tính delta để dịch chuyển các hàng tổng
  const delta = dataLines.length - OLD_DATA_CNT;

  // 5. Các hàng trước và gồm header (≤ HDR_LAST_ROW)
  const beforeRows = rowOrder
    .filter(n => n <= HDR_LAST_ROW)
    .map(n => rowMap.get(n));

  // 6. Xử lý summary rows (dịch số hàng + cập nhật giá trị tĩnh)
  const summaryRowNums = [SUBTOTAL_ROW, VAT_ROW_TPL, GRAND_ROW];
  // Tất cả row ≥ SUBTOTAL_ROW (kể cả chú thích, footer bên dưới)
  const afterRows = rowOrder
    .filter(n => n >= SUBTOTAL_ROW)
    .map(n => {
      let xml = rowMap.get(n);
      const newRowNum = n + delta;

      // Dịch số hàng nếu cần
      if (delta !== 0) xml = shiftRow(xml, delta);

      // Cập nhật giá trị tĩnh cho 3 hàng tổng
      const origRowNum = n; // trước khi shift
      const colRef = colLetter(SUM_VAL_COL) + newRowNum;
      if (origRowNum === SUBTOTAL_ROW) {
        xml = updateSummaryCell(xml, colRef, subTotal);
      } else if (origRowNum === VAT_ROW_TPL) {
        xml = updateSummaryCell(xml, colRef, vatAmount);
        // Cập nhật nhãn VAT% (thay sharedString bằng inlineStr)
        xml = xml.replace(
          /<c r="B\d+"[^>]*t="s"[^>]*>[\s\S]*?<\/c>/,
          `<c r="B${newRowNum}" s="77" t="inlineStr"><is><t xml:space="preserve">VAT - ${vat || 0}%</t></is></c>`
        );
      } else if (origRowNum === GRAND_ROW) {
        xml = updateSummaryCell(xml, colRef, grandTotal);
      }
      return xml;
    });

  // 7. Ghép lại sheetData
  const allRows = [...beforeRows, ...newDataRows, ...afterRows];
  const newSheetData = `<sheetData>${allRows.join("")}</sheetData>`;

  // 8. Cập nhật dimension + mergeCells
  const lastRowNum = (rowOrder[rowOrder.length - 1] ?? GRAND_ROW) + delta;
  let finalXml = sheetXml
    .replace(/<sheetData>[\s\S]*?<\/sheetData>/, newSheetData)
    .replace(/<dimension ref="[^"]*"/, `<dimension ref="A1:${colLetter(TOTAL_COL)}${lastRowNum}"`);

  if (delta !== 0) {
    finalXml = shiftMerges(finalXml, HDR_LAST_ROW, delta);
  }

  files[SHEET] = ENC.encode(finalXml);

  // 9. Xóa calcChain (để Excel tự tính lại) để tránh lỗi repair
  delete files["xl/calcChain.xml"];

  return zipSync(files, { level: 6 }).buffer;
}

// ── Basic export (fallback không cần template) ────────────────

/** Xuất báo giá ra Excel đơn giản bằng SheetJS (không style) */
export function generateQuoteBasic(lines, computed, subTotal, vatAmount, grandTotal, vat) {
  if (!window.XLSX) throw new Error("Thư viện XLSX chưa tải");

  const enc  = (r, c) => window.XLSX.utils.encode_cell({ r, c });
  const ws   = {};
  let row = 0;

  const hdrs = [
    "No.\nSTT", "Model", "Description / Mô tả", "Brand / Nhãn Hàng",
    "Origin / Xuất xứ", "Unit / Đ.Vị", "Qty / S.Lượng",
    "U.Price / Đơn giá", "Total / Thành tiền",
  ];
  hdrs.forEach((h, c) => { ws[enc(row, c)] = { v: h, t: "s" }; });
  row++;

  computed.forEach((c, i) => {
    if (!c.model) return;
    const rowData = [
      i + 1, c.model, c.moTa, c.nhanHang, c.xuatXu,
      lines[i].donVi, parseFloat(lines[i].soLuong) || 0,
      Math.round(c.donGia), Math.round(c.thanhTien),
    ];
    rowData.forEach((val, col) => {
      ws[enc(row, col)] = typeof val === "number"
        ? { v: val, t: "n", z: "#,##0" }
        : { v: val, t: "s" };
    });
    row++;
  });

  [
    [`Tổng thành tiền / Sub-Total`, Math.round(subTotal)],
    [`VAT - ${vat || 0}%`,          Math.round(vatAmount)],
    [`Thành tiền sau thuế / Grand total`, Math.round(grandTotal)],
  ].forEach(([label, val]) => {
    ws[enc(row, 7)] = { v: label, t: "s" };
    ws[enc(row, 8)] = { v: val,   t: "n", z: "#,##0" };
    row++;
  });

  ws["!ref"]  = `A1:I${row}`;
  ws["!cols"] = [
    { wch: 5 }, { wch: 22 }, { wch: 42 }, { wch: 14 }, { wch: 10 },
    { wch: 8 }, { wch: 8  }, { wch: 18 }, { wch: 18  },
  ];

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Báo giá");
  const date = new Date().toISOString().slice(0, 10);
  window.XLSX.writeFile(wb, `bao-gia-${date}.xlsx`);
}
