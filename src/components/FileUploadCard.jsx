import { useRef, useState } from "react";

export default function FileUploadCard({ xlsxOK, buf, fname, fsize, loading, progress, message, onFile, onRead, onClear }) {
  const fref = useRef();
  const [drag, setDrag] = useState(false);

  const handleFile = (f) => {
    if (f) onFile(f);
  };

  return (
    <div className="card">
      <div className="ch"><b>①</b> Chọn file Báo Giá</div>

      <div
        className={"dz" + (drag ? " drag" : "")}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
      >
        <input
          ref={fref}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div style={{ fontSize: 28, marginBottom: 6 }}>📂</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>Kéo thả hoặc click chọn file</div>
        <div style={{ fontSize: 10.5, color: "#7a8bb0" }}>File AH-NOTIFIER.xlsx</div>
      </div>

      {buf && (
        <div className="fbadge">
          <span>✅</span>
          <div>
            <div className="fbn">{fname}</div>
            <div className="fbs">{(fsize / 1024).toFixed(1)} KB</div>
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
