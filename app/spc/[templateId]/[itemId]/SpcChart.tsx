"use client";

import {
  ComposedChart, Line, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";

type Point = { idx: number; value: number; date: string; oor: boolean; label: string };

export default function SpcChart({
  data, usl, lsl, ucl, lcl, mean,
}: {
  data: Point[];
  usl: number | null;
  lsl: number | null;
  ucl: number | null;
  lcl: number | null;
  mean: number | null;
}) {
  // 차트용 데이터: 필요한 필드만, idx 제외
  const chartData = data.map((p, i) => ({
    x: i + 1,
    value: p.value,
    oor: p.oor,
    date: p.date,
    label: p.label,
  }));
  const oorData = chartData.filter((p) => p.oor);
  const okData = chartData.filter((p) => !p.oor);

  // y축 범위
  const allVals = [
    ...chartData.map((d) => d.value),
    ...(usl !== null ? [usl] : []),
    ...(lsl !== null ? [lsl] : []),
    ...(ucl !== null ? [ucl] : []),
    ...(lcl !== null ? [lcl] : []),
  ];
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const pad = (yMax - yMin) * 0.1 || Math.abs(yMin) * 0.05 || 1;

  // 적절한 소수점 자릿수 결정
  const range = yMax - yMin;
  const decimals = range < 1 ? 3 : range < 10 ? 2 : range < 100 ? 1 : 0;
  const yFormat = (v: number) => v.toFixed(decimals);

  // X축 ticks: 데이터 개수에 따라
  const xTicks = chartData.length <= 20
    ? chartData.map((d) => d.x)
    : undefined;

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 70, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="x"
          type="number"
          domain={[1, chartData.length || 1]}
          ticks={xTicks}
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "var(--text-3)" }}
          tickLine={false}
          axisLine={false}
          label={{ value: "Sample sequence", position: "insideBottom", offset: -2, style: { fontSize: 10, fill: "var(--text-3)" } }}
        />
        <YAxis
          domain={[yMin - pad, yMax + pad]}
          tickFormatter={yFormat}
          tick={{ fontSize: 11, fill: "var(--text-3)" }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }}
          labelFormatter={(idx) => {
            const p = chartData[Number(idx) - 1];
            return p ? `#${idx} · ${p.date}` : `#${idx}`;
          }}
          formatter={(value, _name, props) => {
            const p = props.payload as { label?: string; oor?: boolean };
            return [`${value}${p?.oor ? " ⚠️" : ""}`, p?.label ?? ""];
          }}
        />

        {/* Spec limits */}
        {usl !== null && <ReferenceLine y={usl} stroke="#FF3B30" strokeDasharray="4 4" label={{ value: `USL ${yFormat(usl)}`, fill: "#FF3B30", fontSize: 10, position: "right" }} />}
        {lsl !== null && <ReferenceLine y={lsl} stroke="#FF3B30" strokeDasharray="4 4" label={{ value: `LSL ${yFormat(lsl)}`, fill: "#FF3B30", fontSize: 10, position: "right" }} />}

        {/* Control limits */}
        {ucl !== null && <ReferenceLine y={ucl} stroke="#F59E0B" strokeDasharray="2 4" label={{ value: `UCL ${yFormat(ucl)}`, fill: "#F59E0B", fontSize: 10, position: "right" }} />}
        {lcl !== null && <ReferenceLine y={lcl} stroke="#F59E0B" strokeDasharray="2 4" label={{ value: `LCL ${yFormat(lcl)}`, fill: "#F59E0B", fontSize: 10, position: "right" }} />}

        {/* Mean */}
        {mean !== null && <ReferenceLine y={mean} stroke="#34C759" strokeWidth={1.5} label={{ value: `μ ${yFormat(mean)}`, fill: "#34C759", fontSize: 10, position: "right" }} />}

        {/* Connecting line */}
        <Line type="linear" dataKey="value" stroke="var(--text-3)" strokeWidth={1} dot={false} isAnimationActive={false} legendType="none" />

        {/* Points: OK */}
        <Scatter data={okData} dataKey="value" fill="var(--accent)" isAnimationActive={false} legendType="none" />
        {/* Points: OOR */}
        <Scatter data={oorData} dataKey="value" fill="#FF3B30" isAnimationActive={false} legendType="none" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
