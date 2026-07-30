import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ComposedChart, Scatter, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, ReferenceLine, Tooltip,
} from "recharts";

/* ---------------------------------------------------------------------
   TOKENS — "die Ohm" Corporate Design
--------------------------------------------------------------------- */
const OHM_RED = "#C72426";
const OHM_BLUE = "#16283D";
const INK = OHM_BLUE;
const BG = "#F4F4F3";
const PANEL = "#FFFFFF";
const PANEL_BORDER = "#E0DEDC";
const GRAY = "#6B6B6B";
const CHART_BG = "#FFFFFF";
const CHART_GRID = "#E5E3E1";
const PALE = "#EAF1F6";
const SANS = "'Inter', 'IBM Plex Sans', ui-sans-serif, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const H_L = 267; // feste Trägheitskonstante (Flüssigkeits-Holdup je Stufe), nicht einstellbar

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeGaussian(rng) {
  return function () {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

function fmtTime(s) {
  if (!isFinite(s)) return "—";
  if (s < 60) return `${s.toFixed(1)} s`;
  if (s < 3600) return `${(s / 60).toFixed(2)} min`;
  return `${(s / 3600).toFixed(2)} h`;
}
function hexToRgb(hex) {
  const m = hex.replace("#", "");
  return { r: parseInt(m.substring(0, 2), 16), g: parseInt(m.substring(2, 4), 16), b: parseInt(m.substring(4, 6), 16) };
}
function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}
/* Kremser-Gleichung (Absorption, x_ein = 0): y_aus/y_ein = (A-1)/(A^(N+1)-1), A = L/(m*G) */
function kremserYOut(yIn, L, G, m, N) {
  const A = L / (m * G);
  if (Math.abs(A - 1) < 1e-6) return yIn / (N + 1);
  return (yIn * (A - 1)) / (Math.pow(A, N + 1) - 1);
}
const logToPos = (val, min, max) => (100 * Math.log(val / min)) / Math.log(max / min);
const posToLog = (pos, min, max) => min * Math.pow(max / min, pos / 100);

/* ---------------------------------------------------------------------
   CONTROL WIDGETS
--------------------------------------------------------------------- */
function Field({ label, value, locked, children }) {
  return (
    <div className="mb-3" style={{ opacity: locked ? 0.5 : 1 }}>
      <div className="flex items-baseline justify-between mb-1">
        <span style={{ fontFamily: SANS, fontSize: 11, letterSpacing: "0.02em", color: GRAY, fontWeight: 500 }}>
          {label}{locked ? " 🔒" : ""}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: INK, fontWeight: 700 }}>{value}</span>
      </div>
      {children}
    </div>
  );
}
function LinearSlider({ min, max, step, value, onChange, disabled }) {
  return <input className="ohm-slider" type="range" min={min} max={max} step={step} value={value} disabled={disabled}
    onChange={(e) => onChange(parseFloat(e.target.value))} />;
}
function LogSlider({ min, max, value, onChange, disabled }) {
  const pos = logToPos(value, min, max);
  return <input className="ohm-slider" type="range" min={0} max={100} step={0.1} value={pos} disabled={disabled}
    onChange={(e) => onChange(posToLog(parseFloat(e.target.value), min, max))} />;
}
function PanelBox({ title, children }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${PANEL_BORDER}`, borderRadius: 8, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 12.5, letterSpacing: "0.03em", color: INK, textTransform: "uppercase", marginBottom: 10, paddingBottom: 8, borderBottom: `2px solid ${OHM_RED}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------
   SÄULEN-ANIMATION
--------------------------------------------------------------------- */
function ColumnGraphic({ xArr, xMaxRef, yOut, yIn, running }) {
  const colX = 45, colY = 20, colW = 90, colH = 240;
  const N = xArr.length;
  const stageH = colH / N;
  const PIPE = "#B9B7B4";

  return (
    <svg viewBox="0 0 220 320" style={{ width: "100%", height: "100%" }}>
      {/* Gaszulauf unten */}
      <line x1={colX + colW / 2} y1={300} x2={colX + colW / 2} y2={colY + colH} stroke={PIPE} strokeWidth={8} />
      <polygon points={`${colX + colW / 2 - 5},${colY + colH + 6} ${colX + colW / 2 + 5},${colY + colH + 6} ${colX + colW / 2},${colY + colH - 4}`} fill={OHM_RED} opacity={running ? 1 : 0.3} />
      {/* Flüssigkeitszulauf oben */}
      <line x1={colX + colW / 2} y1={0} x2={colX + colW / 2} y2={colY} stroke={PIPE} strokeWidth={8} />
      <polygon points={`${colX + colW / 2 - 5},${colY - 6} ${colX + colW / 2 + 5},${colY - 6} ${colX + colW / 2},${colY + 4}`} fill={OHM_BLUE} opacity={running ? 1 : 0.3} />

      {/* Stufen */}
      {xArr.map((xv, i) => {
        const frac = xMaxRef > 0 ? Math.max(0, Math.min(1, xv / xMaxRef)) : 0;
        const color = lerpColor(PALE, OHM_BLUE, frac);
        const y = colY + colH - (i + 1) * stageH;
        return (
          <g key={i}>
            <rect x={colX} y={y} width={colW} height={stageH} fill={color} stroke="#fff" strokeWidth={1} />
            <text x={colX + colW - 6} y={y + stageH / 2 + 3} textAnchor="end" fontFamily={MONO} fontSize="8" fill={frac > 0.55 ? "#fff" : INK} opacity={0.85}>
              {i + 1}
            </text>
          </g>
        );
      })}
      <rect x={colX} y={colY} width={colW} height={colH} fill="none" stroke={PIPE} strokeWidth={3} rx="3" />

      {/* Gasablauf oben (Abluft) */}
      <line x1={colX + colW / 2} y1={colY} x2={colX + colW / 2} y2={0} stroke={PIPE} strokeWidth={8} />
      <polygon points={`${colX + colW / 2 - 5},${colY - 20} ${colX + colW / 2 + 5},${colY - 20} ${colX + colW / 2},${colY - 30}`} fill={OHM_RED} opacity={running ? 1 : 0.3} />
      <text x={colX + colW / 2} y={12} textAnchor="middle" fontFamily={SANS} fontWeight="700" fontSize="11" fill={OHM_RED}>
        Abluft: {yOut.toFixed(2)} %
      </text>

      {/* Flüssigkeitsablauf unten (Sumpf) */}
      <line x1={colX + colW / 2} y1={colY + colH} x2={colX + colW / 2} y2={300} stroke={PIPE} strokeWidth={8} />
      <text x={colX + colW / 2} y={314} textAnchor="middle" fontFamily={SANS} fontWeight="700" fontSize="11" fill={OHM_BLUE}>
        Rohgas: {yIn.toFixed(2)} %
      </text>
    </svg>
  );
}

/* ---------------------------------------------------------------------
   MAIN APP
--------------------------------------------------------------------- */
export default function AbsorptionColumn() {
  const [N, setN] = useState(6);
  const [G, setG] = useState(100);       // Luftvolumenstrom in m3/h
  const [L, setL] = useState(10);        // Wasservolumenstrom in m3/h
  const [Qco2, setQco2] = useState(5);   // CO2-Volumenstrom in m3/h
  const [m, setM] = useState(0.3);       // Verteilungskoeffizient (dimensionslos)
  const [noisePct, setNoisePct] = useState(3);
  const [sampleInterval, setSampleInterval] = useState(8);
  const [speed, setSpeed] = useState(1);
  const [eulerRatio, setEulerRatio] = useState(0.1);
  const [running, setRunning] = useState(false);
  const [locked, setLocked] = useState(false); // Anzahl Trennstufen gesperrt nach Start
  const [, setTick] = useState(0);

  const paramsRef = useRef({});
  paramsRef.current = { N, G, L, Qco2, m, noisePct, sampleInterval, speed, eulerRatio };

  const elapsedRef = useRef(0);
  const xArrRef = useRef(new Array(N).fill(0));
  const noisyRef = useRef([]);
  const lastSampleRef = useRef(0);
  const gaussRef = useRef(makeGaussian(mulberry32(Date.now() % 1e6)));
  const windowWidthRef = useRef(60);
  const unstableRef = useRef(false);

  const estimateWindow = useCallback((p) => {
    const rate = (p.L + p.G * p.m) / H_L;
    const tau = rate > 0 ? 1 / rate : 30;
    return Math.min(600, Math.max(20, 8 * p.N * tau));
  }, []);

  const initRun = useCallback(() => {
    const p = paramsRef.current;
    elapsedRef.current = 0;
    xArrRef.current = new Array(p.N).fill(0);
    noisyRef.current = [];
    lastSampleRef.current = 0;
    gaussRef.current = makeGaussian(mulberry32(Date.now() % 1e6));
    windowWidthRef.current = estimateWindow(p);
    unstableRef.current = false;
    setTick((t) => t + 1);
  }, [estimateWindow]);

  useEffect(() => { initRun(); }, []); // eslint-disable-line
  useEffect(() => { if (!locked) initRun(); }, [N]); // eslint-disable-line

  useEffect(() => {
    if (!running) return;
    let raf, last = performance.now(), frame = 0;
    const step = (now) => {
      const dtReal = Math.min(now - last, 100) / 1000;
      last = now;
      const p = paramsRef.current;
      const dtSim = dtReal * p.speed;
      elapsedRef.current += dtSim;
      const t = elapsedRef.current;

      const rate = (p.L + p.G * p.m) / H_L;
      const subDt = p.eulerRatio / rate;
      const steps = Math.min(3000, Math.max(1, Math.round(dtSim / subDt)));
      const actualSub = dtSim / steps;
      const yIn = (p.Qco2 / (p.Qco2 + p.G)) * 100;

      let x = xArrRef.current.slice();
      for (let s = 0; s < steps; s++) {
        const nx = new Array(p.N);
        for (let j = 0; j < p.N; j++) {
          const xAbove = j === p.N - 1 ? 0 : x[j + 1];       // frisches Wasser oben
          const yBelow = j === 0 ? yIn : p.m * x[j - 1];     // Rohgas unten
          const dx = (p.L * xAbove + p.G * yBelow - (p.L + p.G * p.m) * x[j]) / H_L;
          nx[j] = x[j] + dx * actualSub;
        }
        x = nx;
      }
      xArrRef.current = x;
      unstableRef.current = subDt * rate > 2;

      const yOut = p.m * x[p.N - 1];
      if (t - lastSampleRef.current >= p.sampleInterval) {
        const noiseAbs = (p.noisePct / 100) * yIn;
        const measured = Math.max(0, yOut + noiseAbs * gaussRef.current());
        const arr = noisyRef.current;
        arr.push({ t, measured, model: yOut });
        const minKeep = t - windowWidthRef.current * 1.5;
        while (arr.length > 2 && arr[0].t < minKeep) arr.shift();
        lastSampleRef.current = t;
      }

      windowWidthRef.current = Math.max(windowWidthRef.current, estimateWindow(p));
      frame++;
      if (frame % 3 === 0) setTick((x2) => x2 + 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, estimateWindow]);

  const handlePlayPause = () => {
    if (!running) setLocked(true);
    setRunning((r) => !r);
  };
  const handleReset = () => { setRunning(false); setLocked(false); initRun(); };

  const exportCSV = () => {
    const csvNum = (x) => (x === null || x === undefined || Number.isNaN(x) ? "" : x.toFixed(5).replace(".", ","));
    const p = paramsRef.current;
    const meta = [
      `# Absorptions-Monitor Messexport`,
      `# N=${p.N}; Luft_G=${p.G} m3/h; Wasser_L=${p.L} m3/h; CO2_Q=${p.Qco2} m3/h; m=${p.m}`,
      `# Messrauschen=${p.noisePct}%; Messintervall=${p.sampleInterval}s`,
      `# y_ein=${yIn.toFixed(4)}%; Kremser_y_aus=${yEq.toFixed(5)}%`,
      `# Zeitpunkt: ${new Date().toLocaleString("de-DE")}`,
      ``,
      `Zeit_s;CO2_Abluft_gemessen_Prozent;CO2_Abluft_Modell_Prozent`,
      ...noisyRef.current.map((pt) => `${csvNum(pt.t)};${csvNum(pt.measured)};${csvNum(pt.model)}`),
      ``,
      `Stufenprofil_aktuell (1=unten/Sumpf ... N=oben/Abluft)`,
      `Stufe;CO2_in_Wasser_Prozent`,
      ...xArrRef.current.map((xv, i) => `${i + 1};${csvNum(xv)}`),
    ];
    const csvContent = "\uFEFF" + meta.join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `absorption_messdaten_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const elapsed = elapsedRef.current;
  const ww = windowWidthRef.current;
  const xDomain = elapsed <= ww ? [0, ww] : [elapsed - ww, elapsed];
  const yIn = (Qco2 / (Qco2 + G)) * 100;
  const yOutNow = m * xArrRef.current[N - 1];
  const xSumpf = xArrRef.current[0];
  const yEq = kremserYOut(yIn, L, G, m, N);
  const xMaxRef = Math.max(0.001, yIn / 100 / m);
  let yMaxObserved = yOutNow;
  noisyRef.current.forEach((pt) => {
    if (pt.t >= xDomain[0]) {
      if (pt.measured > yMaxObserved) yMaxObserved = pt.measured;
      if (pt.model > yMaxObserved) yMaxObserved = pt.model;
    }
  });
  const yMax = Math.max(0.02, yMaxObserved * 1.35, yEq * 1.1);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    const row = payload.find((p) => p.dataKey === "measured");
    return (
      <div style={{ background: PANEL, border: `1px solid ${PANEL_BORDER}`, borderRadius: 4, padding: "6px 10px", fontFamily: MONO, fontSize: 11, color: INK, boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
        <div style={{ opacity: 0.6, marginBottom: 4 }}>t = {fmtTime(label)}</div>
        {row && <div style={{ color: OHM_RED, fontWeight: 700 }}>Messung = {row.value?.toFixed(4)} %</div>}
      </div>
    );
  };

  return (
    <div className="w-full min-h-screen flex justify-center p-3 md:p-6" style={{ background: BG }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        input.ohm-slider { -webkit-appearance:none; appearance:none; width:100%; height:4px; border-radius:2px; background-color:#DEDCDA; cursor:pointer; }
        input.ohm-slider::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%;
          background: ${OHM_RED}; border:2px solid #fff; box-shadow:0 0 0 1px ${PANEL_BORDER}, 0 1px 3px rgba(0,0,0,.25); cursor:pointer; }
        input.ohm-slider::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background: ${OHM_RED}; border:2px solid #fff; cursor:pointer; }
        input.ohm-slider::-moz-range-track { background:#DEDCDA; height:4px; border-radius:2px; }
        input.ohm-slider:disabled::-webkit-slider-thumb { background: #B9B7B4; }
        input.ohm-slider:disabled::-moz-range-thumb { background: #B9B7B4; }
        input.ohm-slider:disabled { cursor: not-allowed; }
        .led { animation: pulseGlow 1.1s ease-in-out infinite; }
        @keyframes pulseGlow { 0%,100%{opacity:1} 50%{opacity:.35} }
        @media (prefers-reduced-motion: reduce) { .led { animation: none; } }
        .ohm-btn:active { transform: translateY(1px); }
      `}</style>

      <div className="w-full flex flex-col gap-4" style={{ maxWidth: 1360, fontFamily: SANS }}>
        {/* HEADER */}
        <div className="flex items-end justify-between flex-wrap gap-3 pb-3" style={{ borderBottom: `3px solid ${OHM_RED}` }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 13, color: "#fff", background: OHM_RED, padding: "2px 8px", borderRadius: 3, letterSpacing: "0.04em" }}>
                die Ohm
              </span>
              <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: "clamp(24px,3.4vw,34px)", color: INK, letterSpacing: "-0.01em", lineHeight: 1 }}>
                ABSORPTIONS·MONITOR
              </h1>
            </div>
            <p style={{ fontFamily: SANS, fontSize: 12, color: GRAY, marginTop: 6 }}>
              Fakultät Angewandte Chemie · CO₂-Absorption Luft/Wasser · live integriert mit Systemträgheit
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="led" style={{ width: 10, height: 10, borderRadius: "50%",
              background: running ? "#2E9E4F" : OHM_RED, boxShadow: `0 0 6px ${running ? "#2E9E4F" : OHM_RED}` }} />
            <span style={{ fontFamily: SANS, fontSize: 12, color: INK, fontWeight: 600 }}>{running ? "Läuft" : "Angehalten"}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT CONTROLS */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <PanelBox title="Kolonne">
              <Field label="Anzahl Trennstufen N" value={`${N}`} locked={locked}>
                <LinearSlider min={2} max={10} step={1} value={N} onChange={setN} disabled={locked} />
              </Field>
              <div style={{ fontFamily: SANS, fontSize: 11, color: GRAY }}>
                {locked
                  ? "Trennstufenzahl für diesen Lauf gesperrt — erst nach 'Neuer Lauf' änderbar."
                  : "Nur vor dem Start änderbar."}
              </div>
            </PanelBox>

            <PanelBox title="Ströme (live änderbar)">
              <Field label="Luftvolumenstrom G" value={`${G.toFixed(0)} m³/h`}>
                <LinearSlider min={20} max={300} step={5} value={G} onChange={setG} />
              </Field>
              <Field label="Wasservolumenstrom L" value={`${L.toFixed(1)} m³/h`}>
                <LinearSlider min={1} max={50} step={0.5} value={L} onChange={setL} />
              </Field>
              <Field label="CO₂-Volumenstrom" value={`${Qco2.toFixed(2)} m³/h`}>
                <LogSlider min={0.2} max={30} value={Qco2} onChange={setQco2} />
              </Field>
              <div style={{ fontFamily: SANS, fontSize: 11, color: GRAY }}>
                y_ein = CO₂/(CO₂+Luft) = {yIn.toFixed(2)} % — Rohgas-Zusammensetzung.
              </div>
            </PanelBox>

            <PanelBox title="Gleichgewicht">
              <Field label="Verteilungskoeffizient m (dimensionslos)" value={m.toFixed(2)}>
                <LogSlider min={0.05} max={2} value={m} onChange={setM} />
              </Field>
              <div style={{ fontFamily: SANS, fontSize: 11, color: GRAY }}>
                y* = m·x, beide in % (vereinfachtes Henry-Gesetz). Kleiner m = bessere Löslichkeit.
              </div>
            </PanelBox>

            <PanelBox title="Messung">
              <Field label="Messrauschen (σ)" value={`± ${noisePct.toFixed(1)} % (rel. y_ein)`}>
                <LinearSlider min={0} max={15} step={0.5} value={noisePct} onChange={setNoisePct} />
              </Field>
              <Field label="Messintervall" value={fmtTime(sampleInterval)}>
                <LogSlider min={1} max={60} value={sampleInterval} onChange={setSampleInterval} />
              </Field>
            </PanelBox>

            <PanelBox title="Zeitraffer &amp; Integration">
              <Field label="Beschleunigung" value={`× ${speed.toFixed(0)}`}>
                <LogSlider min={1} max={2000} value={speed} onChange={setSpeed} />
              </Field>
              <Field label="Schrittweite (Rate·Δt)" value={eulerRatio.toFixed(2)}>
                <LogSlider min={0.01} max={2.5} value={eulerRatio} onChange={setEulerRatio} />
              </Field>
              <div style={{ fontFamily: SANS, fontSize: 11, color: unstableRef.current ? OHM_RED : GRAY, fontWeight: unstableRef.current ? 700 : 400 }}>
                {unstableRef.current ? "⚠ Schrittweite zu groß — numerisch instabil." : "Kleiner = genauer/stabiler."}
              </div>
            </PanelBox>
          </div>

          {/* CENTER: COLUMN ANIMATION */}
          <div className="lg:col-span-4 flex flex-col gap-3">
            <div style={{ position: "relative", background: PANEL, border: `1px solid ${PANEL_BORDER}`, borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)", padding: 8, height: 420 }}>
              <ColumnGraphic xArr={xArrRef.current} xMaxRef={xMaxRef} yOut={yOutNow} yIn={yIn} running={running} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handlePlayPause} className="ohm-btn" style={{ fontFamily: SANS, fontWeight: 700, fontSize: 13, letterSpacing: "0.02em",
                background: running ? "#fff" : OHM_RED, color: running ? OHM_RED : "#fff", border: `2px solid ${OHM_RED}`, borderRadius: 5, padding: "9px 20px" }}>
                {running ? "⏸ PAUSE" : "▶ START"}
              </button>
              <button onClick={handleReset} className="ohm-btn" style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, background: "#fff", border: `1px solid ${PANEL_BORDER}`, borderRadius: 5, padding: "9px 16px", color: INK }}>
                ↺ Neuer Lauf
              </button>
              <button onClick={exportCSV} className="ohm-btn" style={{ fontFamily: SANS, fontSize: 12, fontWeight: 600, background: "#fff", border: `1px solid ${PANEL_BORDER}`, borderRadius: 5, padding: "9px 16px", color: INK }}>
                ⤓ CSV exportieren
              </button>
            </div>
          </div>

          {/* RIGHT: CHART + READOUTS */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div style={{ position: "relative", background: CHART_BG, border: `1px solid ${PANEL_BORDER}`, borderRadius: 8,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)", padding: "10px 6px 4px 0" }}>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <ComposedChart margin={{ top: 10, right: 18, bottom: 22, left: 28 }}>
                    <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 4" />
                    <XAxis dataKey="t" type="number" domain={xDomain} allowDataOverflow
                      tickFormatter={(v) => fmtTime(v)} stroke={GRAY} tick={{ fontFamily: MONO, fontSize: 11, fill: GRAY }}
                      label={{ value: "Zeit", position: "insideBottom", offset: -14, fill: GRAY, fontSize: 12, fontFamily: SANS, fontWeight: 600 }} />
                    <YAxis type="number" domain={[0, yMax]} allowDataOverflow stroke={GRAY} tick={{ fontFamily: MONO, fontSize: 11, fill: GRAY }}
                      width={64}
                      label={{ value: "CO₂ in Abluft (%)", angle: -90, position: "insideLeft", offset: 12, fill: INK, fontSize: 12.5, fontFamily: SANS, fontWeight: 600 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Scatter data={noisyRef.current} dataKey="measured" fill={OHM_RED} fillOpacity={0.85} isAnimationActive={false} shape="circle" r={3} name="Messung" />
                    <ReferenceLine y={yEq} stroke={OHM_BLUE} strokeDasharray="5 4" strokeOpacity={0.7} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 11, color: GRAY, paddingLeft: 4 }}>
              Blau gestrichelt = Kremser-Gleichgewichtswert (stationär, live nachgerechnet). Y-Achse skaliert automatisch auf den beobachteten Bereich.
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <PanelBox title="Uhr">
                <div style={{ fontFamily: MONO, fontSize: 16, color: INK, fontWeight: 700 }}>{fmtTime(elapsed)}</div>
              </PanelBox>
              <PanelBox title="Abluft (Ist)">
                <div style={{ fontFamily: MONO, fontSize: 16, color: OHM_RED, fontWeight: 700 }}>{yOutNow.toFixed(3)} %</div>
              </PanelBox>
              <PanelBox title="Abluft (Kremser)">
                <div style={{ fontFamily: MONO, fontSize: 16, color: OHM_BLUE, fontWeight: 700 }}>{yEq.toFixed(3)} %</div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: GRAY }}>stationärer Zielwert</div>
              </PanelBox>
              <PanelBox title="Sumpf (Wasser)">
                <div style={{ fontFamily: MONO, fontSize: 16, color: INK, fontWeight: 700 }}>{xSumpf.toFixed(3)}</div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: GRAY }}>% CO₂ im Wasser</div>
              </PanelBox>
            </div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${PANEL_BORDER}`, paddingTop: 10, display: "flex", flexWrap: "wrap", gap: "6px 22px" }}>
          <span style={{ fontFamily: SANS, fontSize: 11, color: GRAY }}>Modell: H_L·dxⱼ/dt = L·x_(j+1) + G·y_(j−1) − (L+G·m)·xⱼ, live Euler-integriert (Kaskade von N Stufen)</span>
          <span style={{ fontFamily: SANS, fontSize: 11, color: GRAY }}>Stationär: Kremser-Gleichung, A = L/(m·G)</span>
          <span style={{ fontFamily: SANS, fontSize: 11, color: GRAY }}>Trägheit entsteht durch Flüssigkeits-Holdup je Stufe — Änderungen brauchen N Stufenzeiten, um durchzuwandern</span>
        </div>
      </div>
    </div>
  );
}
