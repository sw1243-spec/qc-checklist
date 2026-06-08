"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart, Line, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from "recharts";

export type Metric = "ib" | "ob" | "weight";

export type MetricPoint = {
  metric: Metric;
  dateISO: string;
  pnCode: string;
  model: string;
  lineCode: string;
  sample: string;   // "1st" | "Mid" | "Last"
  partNo: number;   // 1 | 2 | 3
  shift: number;    // 1 | 2
  value: number;
  oor: boolean;
  specMin: number | null;
  specMax: number | null;
  specLabel: string | null;
};

const TABS: { key: Metric; label: string; short: string }[] = [
  { key: "ib",     label: "IB Swaging Diameter", short: "IB Swaging" },
  { key: "ob",     label: "OB Swaging Diameter", short: "OB Swaging" },
  { key: "weight", label: "Weight",              short: "Weight" },
];

const SAMPLE_COLORS: Record<string, string> = {
  "1st": "#0A84FF",
  "Mid": "#FF9F0A",
  "Last": "#5AC8FA",
};

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProductionView({
  points,
  units,
}: {
  points: MetricPoint[];
  units: Record<Metric, string>;
}) {
  const [tab, setTab] = useState<Metric>("ib");
  const [selGroup, setSelGroup] = useState<string>("");
  const [selLine, setSelLine] = useState<string>("all");

  const unit = units[tab];
  const metricPoints = useMemo(() => points.filter((p) => p.metric === tab), [points, tab]);

  // ── 그룹 목록 ──
  // IB/OB: 같은 스펙(min|max)끼리 묶음 / Weight: 파트넘버별
  const groups = useMemo(() => {
    const map = new Map<string, {
      key: string; label: string; sub: string;
      min: number | null; max: number | null;
      pnCodes: Set<string>; count: number;
    }>();
    for (const p of metricPoints) {
      const key = tab === "weight"
        ? p.pnCode
        : `${p.specMin ?? "?"}|${p.specMax ?? "?"}`;
      let g = map.get(key);
      if (!g) {
        const specTxt = p.specMin !== null || p.specMax !== null
          ? `${p.specMin ?? "—"} ~ ${p.specMax ?? "—"} ${unit}`
          : "No spec";
        g = {
          key,
          label: tab === "weight" ? p.pnCode : (p.specLabel ?? specTxt),
          sub: tab === "weight" ? `${p.model} · ${specTxt}` : "",
          min: p.specMin, max: p.specMax,
          pnCodes: new Set(), count: 0,
        };
        map.set(key, g);
      }
      g.pnCodes.add(p.pnCode);
      g.count++;
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [metricPoints, tab, unit]);

  const activeGroup = groups.find((g) => g.key === selGroup) ?? groups[0] ?? null;

  // ── 라인 옵션 (활성 그룹 내) ──
  const lineOptions = useMemo(() => {
    if (!activeGroup) return [];
    const set = new Set<string>();
    for (const p of metricPoints) {
      const key = tab === "weight" ? p.pnCode : `${p.specMin ?? "?"}|${p.specMax ?? "?"}`;
      if (key === activeGroup.key) set.add(p.lineCode);
    }
    return Array.from(set).sort();
  }, [metricPoints, activeGroup, tab]);

  const activeLine = lineOptions.includes(selLine) ? selLine : "all";

  // ── 필터된 측정값 (날짜→shift→partNo 순) ──
  const filtered = useMemo(() => {
    if (!activeGroup) return [];
    return metricPoints
      .filter((p) => {
        const key = tab === "weight" ? p.pnCode : `${p.specMin ?? "?"}|${p.specMax ?? "?"}`;
        return key === activeGroup.key && (activeLine === "all" || p.lineCode === activeLine);
      })
      .sort((a, b) =>
        a.dateISO.localeCompare(b.dateISO) || a.shift - b.shift || a.partNo - b.partNo
      );
  }, [metricPoints, activeGroup, activeLine, tab]);

  // ── 차트 데이터 ──
  const chartData = filtered.map((p, i) => ({
    x: i + 1,
    value: p.value,
    sample: p.sample,
    shift: p.shift,
    oor: p.oor,
    date: fmtDate(p.dateISO),
    pn: p.pnCode,
    line: p.lineCode,
  }));

  // ── 통계 ──
  const stats = useMemo(() => {
    const nums = filtered.map((p) => p.value);
    const n = nums.length;
    const oor = filtered.filter((p) => p.oor).length;
    const mean = n > 0 ? nums.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const stdev = Math.sqrt(variance);
    const min = activeGroup?.min ?? null;
    const max = activeGroup?.max ?? null;
    let cpk: number | null = null;
    if (stdev > 0) {
      if (min !== null && max !== null) cpk = Math.min((max - mean) / (3 * stdev), (mean - min) / (3 * stdev));
      else if (max !== null) cpk = (max - mean) / (3 * stdev);
      else if (min !== null) cpk = (mean - min) / (3 * stdev);
    }
    return { n, oor, mean, stdev, cpk, min, max,
      dataMin: n > 0 ? Math.min(...nums) : 0, dataMax: n > 0 ? Math.max(...nums) : 0 };
  }, [filtered, activeGroup]);

  // y축 자릿수
  const span = Math.max(stats.dataMax - stats.dataMin, (stats.max ?? 0) - (stats.min ?? 0), 0);
  const decimals = unit === "g" ? 0 : span < 1 ? 3 : span < 10 ? 2 : 1;
  const yf = (v: number) => v.toFixed(decimals);

  // y축 도메인 — 스펙 밴드까지 항상 보이도록 패딩
  const yAllVals = [
    ...chartData.map((d) => d.value),
    ...(stats.min !== null ? [stats.min] : []),
    ...(stats.max !== null ? [stats.max] : []),
  ];
  const yMin = yAllVals.length ? Math.min(...yAllVals) : 0;
  const yMax = yAllVals.length ? Math.max(...yAllVals) : 1;
  const yPad = (yMax - yMin) * 0.15 || Math.abs(yMax) * 0.02 || 1;
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad];

  // ── 개요(날짜별 묶음) ──
  const overview = useMemo(() => {
    const byDate = new Map<string, MetricPoint[]>();
    for (const p of filtered) {
      if (!byDate.has(p.dateISO)) byDate.set(p.dateISO, []);
      byDate.get(p.dateISO)!.push(p);
    }
    return Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateISO, pts]) => {
        // (line · pn · shift) 단위 소그룹 → 1st/Mid/Last
        const sub = new Map<string, { line: string; pn: string; shift: number; vals: Record<string, MetricPoint | undefined> }>();
        for (const p of pts) {
          const k = `${p.lineCode}|${p.pnCode}|${p.shift}`;
          let row = sub.get(k);
          if (!row) { row = { line: p.lineCode, pn: p.pnCode, shift: p.shift, vals: {} }; sub.set(k, row); }
          row.vals[p.sample] = p;
        }
        const rows = Array.from(sub.values()).sort((a, b) => a.line.localeCompare(b.line) || a.pn.localeCompare(b.pn) || a.shift - b.shift);
        return { dateISO, rows };
      });
  }, [filtered]);

  function changeTab(t: Metric) {
    setTab(t);
    setSelGroup("");
    setSelLine("all");
  }

  const groupSelectLabel = tab === "weight" ? "Part Number" : "Spec Group";

  return (
    <div>
      {/* 탭 */}
      <div className="fade-up" style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => changeTab(t.key)}
              style={{
                flex: 1, padding: "11px 10px", borderRadius: "11px", cursor: "pointer",
                fontSize: "13px", fontWeight: "700", fontFamily: "inherit",
                border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
                background: active ? "var(--accent)" : "var(--panel)",
                color: active ? "#fff" : "var(--text-2)",
                transition: "all 0.15s ease",
              }}
            >
              {t.short}
            </button>
          );
        })}
      </div>

      {/* 필터 */}
      <div className="fade-up" style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <label style={lblStyle}>{groupSelectLabel}</label>
          <select
            value={activeGroup?.key ?? ""}
            onChange={(e) => { setSelGroup(e.target.value); setSelLine("all"); }}
            className="apple-input"
            style={selStyle}
          >
            {groups.length === 0 && <option value="">No data</option>}
            {groups.map((g) => (
              <option key={g.key} value={g.key}>
                {g.label}{tab !== "weight" ? `  ·  ${g.pnCodes.size} PN` : ""}  ({g.count})
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "0 1 160px" }}>
          <label style={lblStyle}>Line</label>
          <select
            value={activeLine}
            onChange={(e) => setSelLine(e.target.value)}
            className="apple-input"
            style={selStyle}
          >
            <option value="all">All lines</option>
            {lineOptions.map((l) => <option key={l} value={l}>Line {l}</option>)}
          </select>
        </div>
      </div>

      {/* 활성 그룹 정보 */}
      {activeGroup && (
        <div className="fade-up" style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "12px" }}>
          {tab !== "weight" && activeGroup.pnCodes.size > 0 && (
            <span>Part numbers: <span style={{ color: "var(--text-2)", fontFamily: "monospace" }}>{Array.from(activeGroup.pnCodes).join(", ")}</span></span>
          )}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginBottom: "16px" }}>
        <Stat label="N" value={String(stats.n)} />
        <Stat label="Mean" value={stats.n > 0 ? yf(stats.mean) : "—"} />
        <Stat label="Spec" value={stats.min !== null || stats.max !== null ? `${stats.min !== null ? yf(stats.min) : "—"}~${stats.max !== null ? yf(stats.max) : "—"}` : "—"} small />
        <Stat label="OOR" value={String(stats.oor)} accent={stats.oor > 0 ? "danger" : "ok"} />
        <Stat label="Cpk" value={stats.cpk !== null ? stats.cpk.toFixed(2) : "—"}
          accent={stats.cpk === null ? undefined : stats.cpk >= 1.33 ? "ok" : stats.cpk >= 1.0 ? "warn" : "danger"} />
      </div>

      {/* 차트 */}
      <div className="liquid-glass fade-up" style={{ padding: "18px 14px 14px", marginBottom: "10px" }}>
        {chartData.length === 0 ? (
          <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ fontSize: "13px", color: "var(--text-3)" }}>No measurements for this selection.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 64, left: 0, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="x" type="number" domain={[1, chartData.length || 1]}
                allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-3)" }}
                tickLine={false} axisLine={false}
                label={{ value: "Production sequence (1st · Mid · Last)", position: "insideBottom", offset: -2, style: { fontSize: 10, fill: "var(--text-3)" } }}
              />
              <YAxis
                domain={yDomain} tickFormatter={yf} width={54}
                tick={{ fontSize: 10, fill: "var(--text-3)" }} tickLine={false} axisLine={false}
              />

              {/* 컨트롤 차트 존: 빨강(스펙 밖) · 노랑(경계) · 초록(중심) */}
              {stats.min !== null && stats.max !== null && (() => {
                const warn = (stats.max - stats.min) * 0.12; // 경계(노랑) 폭
                return (
                  <>
                    {/* 빨강: 스펙 밖 (위/아래) */}
                    <ReferenceArea y1={stats.max} y2={yDomain[1]} fill="#FF3B30" fillOpacity={0.12} stroke="none" />
                    <ReferenceArea y1={yDomain[0]} y2={stats.min} fill="#FF3B30" fillOpacity={0.12} stroke="none" />
                    {/* 노랑: 스펙 안쪽 경계 (위/아래) */}
                    <ReferenceArea y1={stats.max - warn} y2={stats.max} fill="#FFCC00" fillOpacity={0.18} stroke="none" />
                    <ReferenceArea y1={stats.min} y2={stats.min + warn} fill="#FFCC00" fillOpacity={0.18} stroke="none" />
                    {/* 초록: 중심 안정 구간 */}
                    <ReferenceArea y1={stats.min + warn} y2={stats.max - warn} fill="#34C759" fillOpacity={0.12} stroke="none" />
                  </>
                );
              })()}

              <Tooltip
                contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }}
                labelFormatter={(idx) => {
                  const p = chartData[Number(idx) - 1];
                  return p ? `${p.date} · ${p.sample} · S${p.shift}` : "";
                }}
                formatter={(value, _n, props) => {
                  const p = props.payload as { oor?: boolean; pn?: string; line?: string };
                  return [`${value}${unit}${p?.oor ? "  ⚠ OOR" : ""}`, `${p?.pn ?? ""} (L${p?.line ?? ""})`];
                }}
              />

              {stats.max !== null && <ReferenceLine y={stats.max} stroke="#FF3B30" strokeDasharray="4 4" label={{ value: `USL ${yf(stats.max)}`, fill: "#FF3B30", fontSize: 10, position: "right" }} />}
              {stats.min !== null && <ReferenceLine y={stats.min} stroke="#FF3B30" strokeDasharray="4 4" label={{ value: `LSL ${yf(stats.min)}`, fill: "#FF3B30", fontSize: 10, position: "right" }} />}
              {stats.n > 1 && <ReferenceLine y={stats.mean} stroke="#34C759" strokeWidth={1.5} label={{ value: `μ ${yf(stats.mean)}`, fill: "#34C759", fontSize: 10, position: "right" }} />}

              <Line type="linear" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={false} legendType="none"
                isAnimationActive animationDuration={900} animationEasing="ease-out" />
              <Scatter dataKey="value" shape={<SampleDot />}
                isAnimationActive animationBegin={300} animationDuration={700} animationEasing="ease-out" />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* 범례 */}
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap", marginTop: "8px", fontSize: "11px", color: "var(--text-2)" }}>
          {Object.entries(SAMPLE_COLORS).map(([s, c]) => (
            <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: c, display: "inline-block" }} /> {s}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#FF3B30", display: "inline-block" }} /> OOR
          </span>
        </div>
      </div>

      {/* 개요: 날짜별 묶음 */}
      <p className="ios-section-label" style={{ marginTop: "22px" }}>Overview by Date</p>
      <div className="liquid-glass fade-up" style={{ overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 70px 70px 70px",
          gap: "8px", padding: "9px 18px",
          background: "var(--panel)", borderBottom: "1px solid var(--border)",
        }}>
          {["Line · PN · Shift", "1st", "Mid", "Last"].map((h, i) => (
            <div key={i} style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.07em", textTransform: "uppercase", textAlign: i === 0 ? "left" : "right" }}>{h}</div>
          ))}
        </div>

        {overview.length === 0 && (
          <div style={{ padding: "18px", fontSize: "13px", color: "var(--text-3)" }}>No data.</div>
        )}

        {overview.map((day) => (
          <div key={day.dateISO}>
            {/* 날짜 sub-header */}
            <div style={{ padding: "7px 18px", background: "var(--bg)", borderBottom: "1px solid var(--border-inner)", borderTop: "1px solid var(--border-inner)" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-2)" }}>{fmtDate(day.dateISO)}</span>
              <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "8px" }}>{day.rows.length} set{day.rows.length !== 1 ? "s" : ""}</span>
            </div>
            {day.rows.map((row, ri) => (
              <div key={ri} style={{
                display: "grid", gridTemplateColumns: "1fr 70px 70px 70px",
                gap: "8px", padding: "9px 18px", alignItems: "center",
                borderBottom: "1px solid var(--border-inner)",
              }}>
                <div style={{ fontSize: "12px", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: "700" }}>L{row.line}</span>
                  <span style={{ fontFamily: "monospace", color: "var(--text-2)", marginLeft: "6px" }}>{row.pn}</span>
                  <span style={{ color: "var(--text-3)", marginLeft: "6px" }}>S{row.shift}</span>
                </div>
                {["1st", "Mid", "Last"].map((s) => {
                  const v = row.vals[s];
                  return (
                    <div key={s} style={{
                      fontSize: "12px", textAlign: "right", fontFamily: "monospace",
                      fontWeight: v?.oor ? "700" : "500",
                      color: v ? (v.oor ? "var(--danger)" : "var(--text-1)") : "var(--text-3)",
                    }}>
                      {v ? yf(v.value) : "—"}{v?.oor ? " ⚠" : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// 샘플별 색상 점 (OOR이면 빨강)
function SampleDot(props: { cx?: number; cy?: number; payload?: { sample?: string; oor?: boolean } }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return <g />;
  const oor = payload?.oor;
  const color = oor ? "#FF3B30" : (SAMPLE_COLORS[payload?.sample ?? ""] ?? "#0A84FF");
  return (
    <circle cx={cx} cy={cy} r={oor ? 5 : 4} fill={color} fillOpacity={0.9}
      stroke={oor ? "#FF3B30" : "var(--card)"} strokeWidth={oor ? 1.5 : 0.5} />
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent?: "ok" | "warn" | "danger"; small?: boolean }) {
  const color = accent === "danger" ? "var(--danger)" : accent === "warn" ? "#F59E0B" : accent === "ok" ? "#34C759" : "var(--text-1)";
  return (
    <div className="liquid-glass" style={{ padding: "12px 8px", textAlign: "center" }}>
      <div style={{ fontSize: small ? "13px" : "18px", fontWeight: "700", color, letterSpacing: "-0.02em", fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: "9px", color: "var(--text-3)", marginTop: "3px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

const lblStyle: React.CSSProperties = {
  display: "block", fontSize: "10px", fontWeight: "600", color: "var(--text-3)",
  letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "5px",
};
const selStyle: React.CSSProperties = {
  width: "100%", fontSize: "13px", padding: "8px 30px 8px 12px", cursor: "pointer",
};
