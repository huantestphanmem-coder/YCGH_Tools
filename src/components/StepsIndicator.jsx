const STEPS = [
  { label: "Import Báo Giá", sub: "Upload AH-NOTIFIER.xlsx" },
  { label: "Kiểm tra & Bổ sung", sub: "Xem trước thông tin" },
  { label: "Tạo & Tải YCGH", sub: "Download file Excel" },
];

export default function StepsIndicator({ currentStep }) {
  const cls = (n) =>
    n < currentStep ? "stp dn" : n === currentStep ? "stp on" : "stp";

  return (
    <div className="steps">
      {STEPS.map(({ label, sub }, i) => (
        <div key={i} className={cls(i + 1)}>
          <div className="sn">{i + 1 < currentStep ? "✓" : i + 1}</div>
          <div>
            <div className="sl">{label}</div>
            <div className="ss">{sub}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
