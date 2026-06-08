"use client";

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from "recharts";

type TrendPoint = { date: string; total: number; oor: number };
type LinePoint  = { line: string; total: number; oor: number; rate: number; passRate: number };

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "13px" }}
          labelStyle={{ color: "var(--text-2)", marginBottom: "4px" }}
        />
        <Line type="monotone" dataKey="total" stroke="var(--text-3)" strokeWidth={1.5} dot={false} name="Total" />
        <Line type="monotone" dataKey="oor"   stroke="#FF3B30"        strokeWidth={2}   dot={{ r: 3, fill: "#FF3B30" }} name="OOR" />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LineBarChart({ data }: { data: LinePoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="line" width={116} tick={{ fontSize: 12, fill: "var(--text-1)" }} tickLine={false} axisLine={false} interval={0} />
        <Tooltip
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "13px" }}
          formatter={(value, name) => [value, name === "oor" ? "OOR" : "Total"]}
        />
        <Bar dataKey="total" fill="rgba(217,119,87,0.15)" radius={[0, 4, 4, 0]} name="total" barSize={14} />
        <Bar dataKey="oor"   fill="#FF3B30"               radius={[0, 4, 4, 0]} name="oor"   barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ pass, oor }: { pass: number; oor: number }) {
  const total = pass + oor;
  if (total === 0) return <EmptyChart />;
  const data = [
    { name: "Pass", value: pass },
    { name: "OOR",  value: oor  },
  ];
  const COLORS = ["#34C759", "#FF3B30"];
  const pct = Math.round((pass / total) * 100);

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={78} dataKey="value" paddingAngle={2} startAngle={90} endAngle={-270}>
            {data.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
          </Pie>
          <Tooltip
            contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "13px" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "var(--text-2)" }} />
        </PieChart>
      </ResponsiveContainer>
      {/* 중앙 텍스트 */}
      <div style={{ position: "absolute", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: "22px", fontWeight: "700", color: pct >= 90 ? "#34C759" : "#FF3B30" }}>{pct}%</div>
        <div style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Pass</div>
      </div>
    </div>
  );
}

export function PassRateChart({ data }: { data: LinePoint[] }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--text-3)" }} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="line" width={116} tick={{ fontSize: 12, fill: "var(--text-1)" }} tickLine={false} axisLine={false} interval={0} />
        <Tooltip
          contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "13px" }}
          formatter={(value) => [`${value}%`, "Pass Rate"]}
        />
        <Bar dataKey="passRate" radius={[0, 4, 4, 0]} barSize={14}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.passRate >= 90 ? "#34C759" : entry.passRate >= 70 ? "#F59E0B" : "#FF3B30"} />
          ))}
          <LabelList dataKey="passRate" position="right" formatter={(v: unknown) => `${v}%`} style={{ fontSize: "11px", fill: "var(--text-2)", fontWeight: "600" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontSize: "13px", color: "var(--text-3)" }}>No data for this period</p>
    </div>
  );
}
