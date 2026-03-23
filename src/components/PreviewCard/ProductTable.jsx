const HEADERS = ["STT", "Mã hàng", "Tên thiết bị", "Nhà SX", "Xuất xứ", "Đ.vị", "SL"];

export default function ProductTable({ prods }) {
  return (
    <>
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#3e4f72", marginBottom: 5 }}>
        📦 Danh sách thiết bị
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>{HEADERS.map((h) => <th key={h}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {prods.map((p, i) => (
              <tr key={i}>
                <td style={{ color: "#7a8bb0", fontWeight: 600 }}>{p.stt}</td>
                <td><span className="chip">{p.m || "—"}</span></td>
                <td>{p.d || "—"}</td>
                <td>{p.br || "—"}</td>
                <td>{p.or || "—"}</td>
                <td>{p.u || "—"}</td>
                <td><span className="qc">{String(p.q)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
