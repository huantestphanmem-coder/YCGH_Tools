import { unzipSync, zipSync } from "fflate";
import { YCGH_B64 } from "../assets/ycghTemplate";

const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ENC = new TextEncoder();
const DEC = new TextDecoder();

function buildDateStr() {
  const t = new Date();
  return `Hà Nội, ngày ${String(t.getDate()).padStart(2,"0")} tháng ${String(t.getMonth()+1).padStart(2,"0")} năm ${t.getFullYear()}`;
}

function escXml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Set value of an existing empty cell (keeps its s= style attribute intact) */
function setCellValue(xml, cellRef, value) {
  if (value === null || value === undefined || value === "") return xml;
  const v = escXml(value);
  // Replace self-closing: <c r="D10" s="69"/>
  xml = xml.replace(
    new RegExp(`<c r="${cellRef}"( s="\\d+")/>`, "g"),
    (_, sAttr) => `<c r="${cellRef}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${v}</t></is></c>`
  );
  // Replace existing value: <c r="A21" s="35"><v>1</v></c>
  xml = xml.replace(
    new RegExp(`<c r="${cellRef}"( s="\\d+")(?:[^>]*)>.*?</c>`, "gs"),
    (_, sAttr) => `<c r="${cellRef}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${v}</t></is></c>`
  );
  return xml;
}

/** Duplicate row 22 template XML with a new row number and cell values */
function makeProductRow(rowNum, p) {
  // Row 22 style template (s attributes preserved):
  // A=s35(STT), B=s40(Mã), C=s56(Tên), D=s56(Tên cont), E=s41(NSX), F=s41(XuXu), G=s42(ĐV), H=s39(SL), I=s36(GC)
  const r = rowNum;
  const stt = p.stt != null ? `<v>${p.stt}</v>` : "";
  const sttVal = typeof p.stt === "number"
    ? `<c r="A${r}" s="35">${stt}</c>`
    : `<c r="A${r}" s="35" t="inlineStr"><is><t>${escXml(p.stt)}</t></is></c>`;

  const mk = (col, s, val) => val
    ? `<c r="${col}${r}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${escXml(val)}</t></is></c>`
    : `<c r="${col}${r}" s="${s}"/>`;

  return `<row r="${r}" spans="1:9" s="1" customFormat="1" ht="71.25" customHeight="1" x14ac:dyDescent="0.2">`
    + sttVal
    + mk("B", 40, p.m)
    + mk("C", 56, p.d)
    + `<c r="D${r}" s="56"/>`
    + mk("E", 41, p.br)
    + mk("F", 41, p.or)
    + mk("G", 42, p.u)
    + mk("H", 39, p.q)
    + `<c r="I${r}" s="36"/>`
    + `</row>`;
}

/** Shift row number and all cell column refs in a row XML block */
function shiftRow(rowXml, delta) {
  // Update <row r="N" ...>
  rowXml = rowXml.replace(/(<row[^>]* r=")(\d+)(")/g, (_, a, n, b) => `${a}${+n + delta}${b}`);
  // Update <c r="XN" ...> column letter + row number
  rowXml = rowXml.replace(/(<c[^>]* r=")([A-Z]+)(\d+)(")/g, (_, a, col, n, b) => `${a}${col}${+n + delta}${b}`);
  return rowXml;
}

/** Shift row numbers in mergeCells for rows >= fromRow */
function shiftMergeCells(mergeXml, fromRow, delta) {
  return mergeXml.replace(/ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g, (_, c1, r1, c2, r2) => {
    const nr1 = +r1 >= fromRow ? +r1 + delta : +r1;
    const nr2 = +r2 >= fromRow ? +r2 + delta : +r2;
    return `ref="${c1}${nr1}:${c2}${nr2}"`;
  });
}

/**
 * Generate YCGH Excel by doing XML surgery on the template zip.
 * Styles, colors, logo — ALL preserved from original template.
 */
export function generateYCGH(ext, ex, onProgress = () => {}) {
  onProgress(8);

  // 1. Decode YCGH_B64 → raw bytes
  const b64Bin = atob(YCGH_B64);
  const xlsxBytes = new Uint8Array(b64Bin.length);
  for (let i = 0; i < b64Bin.length; i++) xlsxBytes[i] = b64Bin.charCodeAt(i);

  // 2. Unzip template
  const files = unzipSync(xlsxBytes);

  onProgress(18);

  // 3. Parse sheet XML
  let xml = DEC.decode(files["xl/worksheets/sheet1.xml"]);

  // Strip column J cells from template (template rows 21-22 include J, which is extra)
  xml = xml.replace(/<c r="J\d+"(?:\s[^>]*)?\s*\/>/g, "");
  xml = xml.replace(/<c r="J\d+"(?:\s[^>]*)?>[\s\S]*?<\/c>/g, "");
  // Update spans "1:10" → "1:9" for product rows in template
  xml = xml.replace(/(<row\b[^>]*\bspans=)"1:10"/g, '$1"1:9"');

  const prods = ext.prods;
  const n = prods.length;
  const PS = 21; // product start row
  const extraRows = Math.max(0, n - 2);

  onProgress(28);

  // ── 4. Fill header fields ─────────────────────────────────────────────
  // Date at top of document (C7:G7 merged)
  xml = setCellValue(xml, "C7", buildDateStr());
  // Header info table — verified by decoding template XML + sharedStrings:
  // R10: C10="Số Báo giá"         → D10:G10 merged
  // R11: C11="Khách hàng"         → D11:G11 merged
  // R12: C12="Địa chỉ"            → D12:G12 merged
  // R13: C13="Điện thoại"         → D13:G13 merged
  // R14: C14="Đại diện bởi"       → D14:G14 merged
  // R15: C15="MST"                → D15:G15 merged
  // R16: C16="Dự án"              → D16:G16 merged
  // R17: C17="Thời gian giao hàng"→ D17:G17 merged
  [
    ["D10", ext.a],   // Số Báo giá
    ["D11", ext.e],   // Khách hàng
    ["D12", ext.f],   // Địa chỉ
    ["D13", ext.c],   // Điện thoại
    ["D14", ext.h],   // Đại diện bởi
    ["D15", ex.mst],  // MST
    ["D16", ext.b],   // Dự án
    ["D17", ext.i],   // Thời gian giao hàng
  ].forEach(([ref, val]) => { xml = setCellValue(xml, ref, val); });

  onProgress(40);

  // ── 5. Fill product rows 21, 22 ───────────────────────────────────────
  for (let i = 0; i < Math.min(2, n); i++) {
    const p = prods[i];
    const r = PS + i;
    xml = setCellValue(xml, `A${r}`, p.stt);
    xml = setCellValue(xml, `B${r}`, p.m);
    xml = setCellValue(xml, `C${r}`, p.d);
    xml = setCellValue(xml, `E${r}`, p.br);
    xml = setCellValue(xml, `F${r}`, p.or);
    xml = setCellValue(xml, `G${r}`, p.u);
    xml = setCellValue(xml, `H${r}`, p.q);
  }

  onProgress(52);

  // ── 6. Insert extra rows + shift rows 23+ ─────────────────────────────
  if (extraRows > 0) {
    // Split sheetData into rows
    const sheetDataMatch = xml.match(/(<sheetData>)([\s\S]*?)(<\/sheetData>)/);
    const before = sheetDataMatch[1];
    const rowsXml = sheetDataMatch[2];
    const after = sheetDataMatch[3];

    // Split into individual row blocks
    const rowBlocks = rowsXml.match(/<row r="\d+"[\s\S]*?<\/row>/g) || [];

    const rows1to22 = rowBlocks.filter(rb => {
      const m = rb.match(/<row r="(\d+)"/); return m && +m[1] <= 22;
    });
    const rows23plus = rowBlocks.filter(rb => {
      const m = rb.match(/<row r="(\d+)"/); return m && +m[1] >= 23;
    });

    // Build extra product rows (products 3..n)
    const newProductRows = [];
    for (let i = 2; i < n; i++) {
      newProductRows.push(makeProductRow(PS + i, prods[i]));
    }

    // Shift original rows 23+
    const shiftedRows = rows23plus.map(rb => shiftRow(rb, extraRows));

    xml = xml.replace(
      /(<sheetData>)([\s\S]*?)(<\/sheetData>)/,
      before + rows1to22.join("") + newProductRows.join("") + shiftedRows.join("") + after
    );

    // Update mergeCells for rows >= 23
    xml = shiftMergeCells(xml, 23, extraRows);

    // Add merge cells for new product rows (C:D merge for Tên thiết bị)
    const newMerges = [];
    for (let i = 2; i < n; i++) {
      newMerges.push(`<mergeCell ref="C${PS+i}:D${PS+i}"/>`);
    }
    if (newMerges.length) {
      xml = xml.replace(/<mergeCell ref="C21:D21"\/>/, m => m + newMerges.join(""));
    }

    // Update mergeCells count
    const mergeCount = (xml.match(/<mergeCell ref=/g) || []).length;
    xml = xml.replace(/(<mergeCells count=")(\d+)(")/, `$1${mergeCount}$3`);

    // Update dimension ref (expand row count)
    xml = xml.replace(/<dimension ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/,
      (_, c1, r1, c2, r2) => `<dimension ref="${c1}${r1}:${c2}${+r2 + extraRows}"/>`);
  }

  onProgress(68);

  // ── 7. Fill supplementary form fields (rows shift with extra products)
  // Verified by decoding template XML + sharedStrings:
  // R23+sh: A23="Địa chỉ giao hàng:" → C23:I23 merged
  // R24+sh: A24="Người nhận:"         → C24
  // R25+sh: A25="Chứng Từ:"           → C25:E25 merged
  // R30+sh: A30="Lưu ý khác:"         → C30:G30 merged
  const sh = extraRows;
  if (ex.dc) xml = setCellValue(xml, `C${23+sh}`, ex.dc);
  if (ex.nr) xml = setCellValue(xml, `C${24+sh}`, ex.nr);
  if (ex.ct) xml = setCellValue(xml, `C${25+sh}`, ex.ct);
  if (ex.gc) xml = setCellValue(xml, `C${30+sh}`, ex.gc);

  onProgress(80);

  // ── 8. Clear broken named ranges in workbook.xml ──────────────────────
  let wbXml = DEC.decode(files["xl/workbook.xml"]);
  wbXml = wbXml.replace(/<definedNames>[\s\S]*?<\/definedNames>/, "");
  files["xl/workbook.xml"] = ENC.encode(wbXml);

  // ── 9. Update sheet1.xml in files ────────────────────────────────────
  files["xl/worksheets/sheet1.xml"] = ENC.encode(xml);

  onProgress(90);

  // ── 10. Rezip and download ────────────────────────────────────────────
  const outBytes = zipSync(files, { level: 6 });
  const blob = new Blob([outBytes], { type: EXCEL_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `YCGH_${(ext.a || "YCGH").replace(/[\/\\:*?"<>|]/g, "-")}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  onProgress(100);
}
