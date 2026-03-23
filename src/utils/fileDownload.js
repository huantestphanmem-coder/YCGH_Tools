/**
 * Decodes a base64 string and triggers a browser download.
 *
 * @param {string} b64 - Base64-encoded file content
 * @param {string} filename - Downloaded file name
 * @param {string} mimeType - MIME type of the file
 */
export function downloadBase64File(b64, filename, mimeType) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);

  const blob = new Blob([out], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
