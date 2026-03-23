/**
 * Parses an AH-NOTIFIER Excel file buffer using the XLSX library.
 * Extracts quotation header fields and product list.
 *
 * @param {ArrayBuffer} buf - File buffer from FileReader
 * @returns {{ data: object, prods: array }} Extracted data
 * @throws {Error} If parsing fails
 */
export function parseXlsxBuffer(buf) {
  const X = window.XLSX;
  if (!X) throw new Error("Thư viện XLSX chưa được tải.");

  const wb = X.read(new Uint8Array(buf), { type: "array", raw: true, cellText: false });
  const raw = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: true,
  });

  // Helper: safely get cell value as trimmed string
  const g = (r, c) => {
    const v = (raw[r] || [])[c];
    return v == null ? "" : String(v).trim();
  };

  // Extract header fields (row indices are 0-based)
  const data = {
    a: g(8, 2),   // Số báo giá
    b: g(9, 2),   // Dự án
    c: g(9, 6),   // Điện thoại
    e: g(10, 2),  // Khách hàng
    f: g(11, 2),  // Địa chỉ
    h: g(12, 2),  // Đại diện
  };

  // Parse delivery time (may be multi-line or prefixed)
  let tg = g(27, 1);
  if (tg.includes("Thời gian giao hàng:")) {
    tg = tg.split("Thời gian giao hàng:")[1].split("\n")[0].trim();
  } else if (tg.includes("\n")) {
    tg = tg.split("\n")[0].trim();
  }
  data.i = tg;

  // Extract product rows
  const prods = [];
  for (let ri = 0; ri < raw.length; ri++) {
    const row = raw[ri];
    if (!row) continue;

    const stt = row[0];
    if (typeof stt !== "number" || !Number.isInteger(stt) || stt < 1 || stt > 999) continue;

    // Take only first line of multi-line cells
    const cv = (col) => {
      const v = row[col];
      return v == null ? "" : String(v).split("\n")[0].trim();
    };

    const m = cv(1);
    const desc = cv(2);

    // Skip total rows and empty rows
    if ((m + desc).toLowerCase().includes("tổng") || (!m && !desc)) continue;

    prods.push({
      stt,
      m,
      d: desc,
      br: cv(3),   // Brand / Nhà sản xuất
      or: cv(4),   // Origin / Xuất xứ
      u: cv(5),    // Unit / Đơn vị
      q: row[6] ?? "",  // Quantity / Số lượng
    });
  }

  return { ...data, prods };
}
