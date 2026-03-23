import InfoGrid from "./InfoGrid";
import ProductTable from "./ProductTable";
import ActionBar from "./ActionBar";

export default function PreviewCard({ ext, loading, progress, message, done, onGenerate, onReset }) {
  return (
    <div className="card span2">
      <div className="ch"><b>③</b> Xem trước & Tạo file YCGH</div>

      {!ext ? (
        <div className="empty">
          <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
          <p style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 3 }}>Chưa có dữ liệu</p>
          <p style={{ fontSize: 11 }}>
            Upload AH-NOTIFIER rồi nhấn <strong style={{ color: "#3b82f6" }}>Đọc & phân tích file</strong>
          </p>
        </div>
      ) : (
        <>
          <InfoGrid ext={ext} />
          <ProductTable prods={ext.prods} />
          <ActionBar
            loading={loading}
            progress={progress}
            message={message}
            done={done}
            onGenerate={onGenerate}
            onReset={onReset}
          />
        </>
      )}
    </div>
  );
}
