const FIELDS = [
  { key: "dc",  label: "Địa chỉ giao hàng",  placeholder: "Địa điểm nhận thiết bị..." },
  { key: "nr",  label: "Người nhận hàng",     placeholder: "Họ tên người nhận..." },
  { key: "ct",  label: "Chứng từ kèm theo",   placeholder: "VD: CO, CQ, Packing list..." },
  { key: "mst", label: "MST (nếu chưa có)",   placeholder: "Mã số thuế..." },
  { key: "gc",  label: "Lưu ý / Ghi chú",     placeholder: "Nội dung lưu ý..." },
];

export default function SupplementaryForm({ values, onChange }) {
  return (
    <div className="card">
      <div className="ch"><b>②</b> Thông tin bổ sung</div>
      {FIELDS.map(({ key, label, placeholder }) => (
        <div className="fld" key={key}>
          <label>{label}</label>
          <input
            value={values[key]}
            onChange={(e) => onChange(key, e.target.value)}
            placeholder={placeholder}
          />
        </div>
      ))}
    </div>
  );
}
