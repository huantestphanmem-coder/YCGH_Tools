// ── Cấu hình Google Apps Script URL ──────────────────────────
export const SHEET_API_URL =
  "https://script.google.com/macros/s/AKfycbx7v_UKKZuLbI58shMKdvYdKdoUIh4l5SDgAQlF4Ytn70wCmpinl_31kixAp0vC3TcT/exec";

export const API_READY = SHEET_API_URL !== "PASTE_YOUR_APPS_SCRIPT_URL_HERE";

export async function apiFetch() {
  const res  = await fetch(SHEET_API_URL);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Lỗi không xác định");
  return data.data;
}

export async function apiPost(body) {
  const res  = await fetch(SHEET_API_URL, { method: "POST", body: JSON.stringify(body) });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Lỗi không xác định");
}
