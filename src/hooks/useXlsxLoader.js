import { useState, useEffect } from "react";

const XLSX_CDN = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";

/**
 * Loads the XLSX library from CDN if not already present on window.
 * Returns { xlsxOK, xlsxError }
 */
export function useXlsxLoader() {
  const [xlsxOK, setXlsxOK] = useState(!!window.XLSX);
  const [xlsxError, setXlsxError] = useState(null);

  useEffect(() => {
    if (window.XLSX) { setXlsxOK(true); return; }
    const s = document.createElement("script");
    s.src = XLSX_CDN;
    s.onload = () => setXlsxOK(true);
    s.onerror = () => setXlsxError("❌ Không tải được thư viện Excel.");
    document.head.appendChild(s);
  }, []);

  return { xlsxOK, xlsxError };
}
