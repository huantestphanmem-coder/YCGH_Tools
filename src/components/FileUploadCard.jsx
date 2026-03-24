import { useRef, useState } from "react";

// File types cho showOpenFilePicker (ẩn hoàn toàn file không phải Excel)
const EXCEL_PICKER_OPTS = {
  types: [
    {
      description: "Excel Files",
      accept: {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        "application/vnd.ms-excel": [".xls"],
        "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
        "application/vnd.ms-excel.sheet.binary.macroEnabled.12": [".xlsb"],
        "application/vnd.openxmlformats-officedocument.spreadsheetml.template": [".xltx"],
        "application/vnd.ms-excel.template.macroEnabled.12": [".xltm"],
      },
    },
  ],
  excludeAcceptAllOption: true, // ẩn option "Tất cả file"
  multiple: false,
};

export default function FileUploadCard({ xlsxOK, buf, fname, fsize, validated, loading, progress, message, onFile, onRead, onClear }) {
  const fref = useRef();
  const [drag, setDrag] = useState(false);

  const handleFile = (f) => {
    if (f) onFile(f);
  };

  // Dùng showOpenFilePicker nếu browser hỗ trợ (Chrome/Edge), không thì fallback
  const openFilePicker = async (e) => {
    e.stopPropagation();
    if (typeof window.showOpenFilePicker === "function") {
      try {
        const [fileHandle] = await window.showOpenFilePicker(EXCEL_PICKER_OPTS);
        const file = await fileHandle.getFile();
        handleFile(file);
      } catch (err) {
        // user đóng dialog — không làm gì
      }
    } else {
      // Fallback: kích hoạt input cũ
      fref.current?.click();
    }
  };

  return (
    <div className="card">
      <div className="ch"><b>①</b> Chọn file Báo Giá</div>

      <div
        className={"dz" + (drag ? " drag" : "")}
        onClick={openFilePicker}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
      >
        {/* Input ẩn — chỉ dùng khi browser không hỗ trợ showOpenFilePicker */}
        <input
          ref={fref}
          type="file"
          accept=".xlsx,.xls,.xlsm,.xlsb,.xltx,.xltm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,application/vnd.ms-excel.sheet.binary.macroEnabled.12,application/vnd.openxmlformats-officedocument.spreadsheetml.template,application/vnd.ms-excel.template.macroEnabled.12"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>Kéo thả hoặc click chọn file</div>
        <div style={{ fontSize: 10.5, color: "#7a8bb0" }}>File AH-NOTIFIER.xlsx</div>
      </div>

      {buf && (
        <div
          className="fbadge"
          style={validated
            ? {}
            : { background: "rgba(59,130,246,.09)", border: "1px solid rgba(59,130,246,.24)" }
          }
        >
          <span>{validated ? "✅" : "📄"}</span>
          <div>
            <div className="fbn" style={validated ? {} : { color: "#93c5fd" }}>{fname}</div>
            <div className="fbs">
              {(fsize / 1024).toFixed(1)} KB
              {!validated && (
                <span style={{ marginLeft: 6, color: "#60a5fa", fontStyle: "italic" }}>— chưa kiểm tra</span>
              )}
            </div>
          </div>
          <button className="fdel" onClick={() => { onClear(); if (fref.current) fref.current.value = ""; }}>✕</button>
        </div>
      )}

      {progress > 0 && progress < 100 && (
        <div className="pb"><div className="pbr" style={{ width: progress + "%" }} /></div>
      )}

      {message && <div className={"al " + message.t}>{message.m}</div>}

      <button className="btn bb" disabled={!buf || loading || !xlsxOK} onClick={onRead}>
        {loading ? <><span className="spin" /> Đang đọc...</> : "⚡ Đọc & phân tích file"}
      </button>
    </div>
  );
}
