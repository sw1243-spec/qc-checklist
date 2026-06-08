"use client";

import { useState, useTransition } from "react";
import { toggleChartTemplate, setChartMetric, autoDetectChartMetrics } from "@/app/admin/actions";

type Item = { id: number; no: number; section: string; characteristic: string; unit: string | null };
type Template = { id: number; code: string; name: string; items: Item[] };
type MetricCfg = { metric: string; unit: string | null };

const METRIC_OPTIONS = [
  { value: "", label: "Exclude" },
  { value: "ib", label: "IB Diameter" },
  { value: "ob", label: "OB Diameter" },
  { value: "weight", label: "Weight" },
];

// 측정값별 기본 단위
function defaultUnit(metric: string) {
  return metric === "weight" ? "g" : metric ? "mm" : "";
}

export default function ChartConfigManager({
  templates,
  includedIds,
  metrics,
}: {
  templates: Template[];
  includedIds: number[];
  metrics: Record<number, MetricCfg>;
}) {
  const [included, setIncluded] = useState<Set<number>>(new Set(includedIds));
  const [cfg, setCfg] = useState<Record<number, MetricCfg>>(metrics);
  const [showExcluded, setShowExcluded] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggleShowExcluded(templateId: number) {
    setShowExcluded((s) => {
      const n = new Set(s);
      if (n.has(templateId)) n.delete(templateId);
      else n.add(templateId);
      return n;
    });
  }

  function toggle(templateId: number, checked: boolean) {
    setIncluded((s) => {
      const n = new Set(s);
      if (checked) n.add(templateId);
      else n.delete(templateId);
      return n;
    });
    startTransition(() => { toggleChartTemplate(templateId, checked); });
  }

  function changeMetric(itemId: number, metric: string) {
    const unit = cfg[itemId]?.unit ?? defaultUnit(metric);
    setCfg((c) => ({ ...c, [itemId]: { metric, unit } }));
    startTransition(() => { setChartMetric(itemId, metric || null, unit ?? ""); });
  }

  function changeUnit(itemId: number, unit: string) {
    const metric = cfg[itemId]?.metric ?? "";
    setCfg((c) => ({ ...c, [itemId]: { metric, unit } }));
    if (metric) startTransition(() => { setChartMetric(itemId, metric, unit); });
  }

  function autoDetect() {
    startTransition(async () => {
      await autoDetectChartMetrics();
      // 서버에서 채운 값을 반영하기 위해 새로고침
      location.reload();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* 자동 추측 버튼 */}
      <div className="liquid-glass fade-up" style={{ padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-1)" }}>Auto-detect from item names</div>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
            Guesses IB / OB / Weight for included sheets. You can adjust afterwards.
          </div>
        </div>
        <button onClick={autoDetect} disabled={pending} className="btn-primary" style={{ whiteSpace: "nowrap", opacity: pending ? 0.6 : 1 }}>
          {pending ? "Working…" : "Auto-detect"}
        </button>
      </div>

      {templates.length === 0 && (
        <div className="liquid-glass" style={{ padding: "18px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-3)" }}>No check sheets found.</p>
        </div>
      )}

      {templates.map((t) => {
        const isIncluded = included.has(t.id);
        return (
          <div key={t.id} className="liquid-glass fade-up" style={{ overflow: "hidden" }}>
            {/* 체크시트 헤더 + 포함 토글 */}
            <label style={{
              display: "flex", alignItems: "center", gap: "12px", cursor: "pointer",
              padding: "16px 18px", borderBottom: isIncluded ? "1px solid var(--border-inner)" : "none",
            }}>
              <input
                type="checkbox"
                checked={isIncluded}
                onChange={(e) => toggle(t.id, e.target.checked)}
                style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--accent)" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>{t.name}</div>
                <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                  <span style={{ fontFamily: "monospace" }}>{t.code}</span> · {t.items.length} numeric item{t.items.length !== 1 ? "s" : ""}
                </div>
              </div>
              <span style={{ fontSize: "12px", color: isIncluded ? "var(--accent)" : "var(--text-3)", fontWeight: "600" }}>
                {isIncluded ? "Included" : "Off"}
              </span>
            </label>

            {/* 항목별 측정값 지정 */}
            {isIncluded && (() => {
              if (t.items.length === 0) {
                return <div style={{ padding: "14px 18px", fontSize: "13px", color: "var(--text-3)" }}>No numeric items in this sheet.</div>;
              }
              // 지정된 항목 / 제외(미지정) 항목 분리
              const tracked = t.items.filter((it) => (cfg[it.id]?.metric ?? "") !== "");
              const excluded = t.items.filter((it) => (cfg[it.id]?.metric ?? "") === "");
              const expanded = showExcluded.has(t.id);
              const visible = expanded ? t.items : tracked;

              const itemRow = (it: Item) => {
                const c = cfg[it.id] ?? { metric: "", unit: it.unit ?? "" };
                return (
                  <div key={it.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 130px 80px", gap: "10px", alignItems: "center",
                    padding: "10px 18px", borderBottom: "1px solid var(--border-inner)",
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "13px", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {it.characteristic}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{it.section}</div>
                    </div>
                    <select
                      value={c.metric}
                      onChange={(e) => changeMetric(it.id, e.target.value)}
                      className="apple-input"
                      style={{ fontSize: "13px", padding: "6px 8px", fontFamily: "inherit" }}
                    >
                      {METRIC_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      value={c.unit ?? ""}
                      onChange={(e) => changeUnit(it.id, e.target.value)}
                      disabled={!c.metric}
                      placeholder="—"
                      className="apple-input"
                      style={{ fontSize: "13px", padding: "6px 8px", opacity: c.metric ? 1 : 0.5 }}
                    />
                  </div>
                );
              };

              return (
                <div>
                  {/* 헤더 */}
                  {visible.length > 0 && (
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 130px 80px", gap: "10px",
                      padding: "8px 18px", background: "var(--panel)", borderBottom: "1px solid var(--border-inner)",
                    }}>
                      {["Item", "Metric", "Unit"].map((h) => (
                        <div key={h} style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</div>
                      ))}
                    </div>
                  )}

                  {visible.length === 0 && (
                    <div style={{ padding: "14px 18px", fontSize: "13px", color: "var(--text-3)" }}>No items tracked yet.</div>
                  )}

                  {visible.map(itemRow)}

                  {/* 제외 항목 펼치기/접기 */}
                  {excluded.length > 0 && (
                    <button
                      onClick={() => toggleShowExcluded(t.id)}
                      style={{
                        width: "100%", padding: "10px 18px", textAlign: "left",
                        background: "transparent", border: "none", cursor: "pointer",
                        fontSize: "12px", fontWeight: "600", color: "var(--accent)", fontFamily: "inherit",
                      }}
                    >
                      {expanded ? "− Hide other items" : `+ Add item (${excluded.length} hidden)`}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}
