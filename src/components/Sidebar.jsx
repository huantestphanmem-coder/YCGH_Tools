const NAV = [
  {
    id: "ycgh",
    icon: "📋",
    label: "Yêu cầu giao hàng",
    sub: "AH-Notifier → YCGH",
  },
  {
    id: "products",
    icon: "🏷️",
    label: "Quản lý mã hàng",
    sub: "CRUD · Import · Export",
  },
  {
    id: "quote",
    icon: "💰",
    label: "Tạo báo giá",
    sub: "Chọn mã · Tính tổng",
  },
];

export default function Sidebar({ page, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-section">Chức năng</div>
      <nav>
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`sni${page === item.id ? " sni-active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sni-icon">{item.icon}</span>
            <span className="sni-body">
              <span className="sni-label">{item.label}</span>
              <span className="sni-sub">{item.sub}</span>
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
