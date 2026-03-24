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

  // Find product table header row (row with "STT" in column A)
  let tableStart = 13; // fallback
  for (let ri = 0; ri < raw.length; ri++) {
    const cell = String((raw[ri] || [])[0] || "").trim().toUpperCase();
    if (cell === "STT") {
      tableStart = ri + 1;
      break;
    }
  }

  // Extract product rows — stop at first non-product row after table begins
  const prods = [];
  let foundFirstProduct = false;
  for (let ri = tableStart; ri < raw.length; ri++) {
    const row = raw[ri] || [];

    // Skip fully empty rows
    if (row.every(c => c == null)) continue;

    const stt = row[0];

    // Take only first line of multi-line cells
    const cv = (col) => {
      const v = row[col];
      return v == null ? "" : String(v).split("\n")[0].trim();
    };

    const m = cv(1); // Mã hàng hóa (col B)
    const desc = cv(2); // Tên thiết bị (col C)

    // Non-integer STT → end of product table
    if (typeof stt !== "number" || !Number.isInteger(stt) || stt < 1 || stt > 999) {
      if (foundFirstProduct) break;
      continue;
    }

    // Skip notes/disclaimers: rows that have an STT integer but missing mã or tên
    if (!m || !desc) continue;

    // Skip subtotal / summary rows
    if ((m + desc).toLowerCase().includes("tổng")) continue;

    foundFirstProduct = true;
    prods.push({
      stt,
      m,
      d: desc,     // Tên thiết bị   — col C (index 2)
      br: cv(3),   // Nhà sản xuất   — col D (index 3)
      or: cv(4),   // Xuất xứ        — col E (index 4)
      u: cv(5),    // Đơn vị         — col F (index 5)
      q: row[6] ?? "",  // Số lượng  — col G (index 6)
    });
  }

  return { ...data, prods };
}
