import { useState } from "react";
import "./styles/app.css";

import { useXlsxLoader } from "./hooks/useXlsxLoader";
import { parseXlsxBuffer } from "./utils/fileParser";
import { generateYCGH } from "./utils/apiGenerator";

import Header from "./components/Header";
import StepsIndicator from "./components/StepsIndicator";
import FileUploadCard from "./components/FileUploadCard";
import SupplementaryForm from "./components/SupplementaryForm";
import PreviewCard from "./components/PreviewCard";

const EMPTY_FORM = { dc: "", nr: "", ct: "", mst: "", gc: "" };

export default function App() {
  const { xlsxOK, xlsxError } = useXlsxLoader();

  // File state
  const [buf, setBuf]     = useState(null);
  const [fname, setFname] = useState("");
  const [fsize, setFsize] = useState(0);

  // Step & extracted data
  const [step, setStep] = useState(1);
  const [ext, setExt]   = useState(null);

  // Supplementary form
  const [ex, setEx] = useState(EMPTY_FORM);

  // Read (Step 1) status
  const [rl, setRl]     = useState(false);
  const [rp, setRp]     = useState(0);
  const [rmsg, setRmsg] = useState(null);

  // Generate (Step 3) status
  const [gl, setGl]     = useState(false);
  const [gp, setGp]     = useState(0);
  const [gmsg, setGmsg] = useState(null);
  const [done, setDone] = useState(false);

  // ── Handlers ──────────────────────────────────────────────

  const handleFile = (f) => {
    if (!/\.xlsx?$/i.test(f.name)) {
      setRmsg({ t: "err", m: "❌ Chọn file .xlsx" });
      return;
    }
    const r = new FileReader();
    r.onload = (e) => {
      setBuf(e.target.result);
      setFname(f.name);
      setFsize(f.size);
      setRmsg(null);
    };
    r.readAsArrayBuffer(f);
  };

  const handleClear = () => {
    setBuf(null); setFname(""); setFsize(0);
    setExt(null); setRmsg(null);
    setDone(false); setGmsg(null);
    setStep(1);
  };

  const handleRead = () => {
    if (!buf || !window.XLSX) return;
    setRl(true); setRp(15);
    try {
      const data = parseXlsxBuffer(buf);
      setExt(data);
      setRmsg({ t: "ok", m: `✅ Đọc thành công — ${data.prods.length} thiết bị` });
      setStep(2); setRp(100);
      setTimeout(() => setRp(0), 500);
    } catch (e) {
      setRmsg({ t: "err", m: "❌ " + e.message });
    }
    setRl(false);
  };

  const handleGenerate = () => {
    if (!ext) return;
    setGl(true); setGp(5); setDone(false); setGmsg(null);
    try {
      generateYCGH(ext, ex, (p) => setGp(p));
      setTimeout(() => setGp(0), 500);
      setDone(true); setStep(3);
    } catch (e) {
      setGmsg({ t: "err", m: "❌ " + e.message });
      setGp(0);
    }
    setGl(false);
  };

  const handleReset = () => {
    handleClear();
    setEx(EMPTY_FORM);
  };

  const handleFormChange = (key, value) => {
    setEx((prev) => ({ ...prev, [key]: value }));
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="app">
      <Header />
      <div className="wrap">
        <StepsIndicator currentStep={step} />

        {!xlsxOK && (
          <div className="info">
            <span className="spin" />
            {xlsxError || "Đang tải thư viện đọc Excel..."}
          </div>
        )}

        <div className="g2">
          <FileUploadCard
            xlsxOK={xlsxOK}
            buf={buf}
            fname={fname}
            fsize={fsize}
            loading={rl}
            progress={rp}
            message={rmsg}
            onFile={handleFile}
            onRead={handleRead}
            onClear={handleClear}
          />

          <SupplementaryForm
            values={ex}
            onChange={handleFormChange}
          />

          <PreviewCard
            ext={ext}
            loading={gl}
            progress={gp}
            message={gmsg}
            done={done}
            onGenerate={handleGenerate}
            onReset={handleReset}
          />
        </div>
      </div>
    </div>
  );
}
