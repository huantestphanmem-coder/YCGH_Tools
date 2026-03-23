export default function ActionBar({ loading, progress, message, done, onGenerate, onReset }) {
  return (
    <>
      <div className="sep" />
      <div className="ra">
        <button className="btn bg" disabled={loading} onClick={onGenerate}>
          {loading
            ? <><span className="spin" /> Đang tạo file...</>
            : "📥 Tạo & Tải file YCGH (.xlsx)"}
        </button>
        <button className="btn bgh" onClick={onReset}>🔄 Làm lại</button>
      </div>

      {progress > 0 && progress < 100 && (
        <div className="pb"><div className="pbr" style={{ width: progress + "%" }} /></div>
      )}

      {message && <div className={"al " + message.t}>{message.m}</div>}

      {done && (
        <div className="succ">
          <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
          <h3>File YCGH đã được tạo thành công!</h3>
          <p>Kiểm tra Downloads — đúng 100% form mẫu gốc</p>
        </div>
      )}
    </>
  );
}
