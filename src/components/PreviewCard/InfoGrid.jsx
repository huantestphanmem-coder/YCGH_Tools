export default function InfoGrid({ ext }) {
  const fields = [
    { l: "Số Báo giá",   v: ext?.a, c: "" },
    { l: "Khách hàng",   v: ext?.e, c: "w2" },
    { l: "Dự án",        v: ext?.b, c: "" },
    { l: "Địa chỉ",      v: ext?.f, c: "w3" },
    { l: "Điện thoại",   v: ext?.c, c: "" },
    { l: "Đại diện bởi", v: ext?.h, c: "" },
    { l: "MST",          v: "",     c: "" },
    { l: "TG Giao hàng", v: ext?.i, c: "w2" },
  ];

  return (
    <div className="igrid">
      {fields.map((f, i) => (
        <div key={i} className={"ib " + f.c}>
          <div className="il">{f.l}</div>
          <div className={"iv" + (f.v ? "" : " mt")}>{f.v || "(chưa có)"}</div>
        </div>
      ))}
    </div>
  );
}
