"use client";

import { useState } from "react";

// 재측정값 입력 — 실시간 합격/불합격 색상 반응
// number: spec 범위 안 초록 / 밖 빨강 · ok_ng: OK 초록 / NG 빨강
export default function CorrectedValueInput({
  id, inputType, minVal, maxVal, defaultValue,
}: {
  id: number;
  inputType: string;
  minVal: number | null;
  maxVal: number | null;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);

  // 상태 판정: "pass" | "fail" | "neutral"
  function status(v: string): "pass" | "fail" | "neutral" {
    const t = v.trim();
    if (t === "") return "neutral";
    if (inputType === "ok_ng") return t.toUpperCase() === "OK" ? "pass" : "fail";
    const num = parseFloat(t);
    if (isNaN(num)) return "neutral";
    if (minVal !== null && num < minVal) return "fail";
    if (maxVal !== null && num > maxVal) return "fail";
    return "pass";
  }

  const st = status(value);
  const GREEN = "#34C759", RED = "var(--danger)";
  const color = st === "pass" ? GREEN : st === "fail" ? RED : "var(--text-3)";
  const tint = st === "pass" ? "rgba(52,199,89,0.06)" : st === "fail" ? "rgba(255,59,48,0.05)" : "var(--card)";
  const border = st === "pass" ? "rgba(52,199,89,0.45)" : st === "fail" ? "rgba(255,59,48,0.45)" : "var(--border)";

  // ok_ng: OK/NG 토글 버튼
  if (inputType === "ok_ng") {
    return (
      <div style={{ display: "flex", gap: "6px" }}>
        <input type="hidden" name={`correctedText_${id}`} value={value} />
        {(["OK", "NG"] as const).map((opt) => {
          const active = value.toUpperCase() === opt;
          const isOK = opt === "OK";
          return (
            <button
              key={opt}
              type="button"
              onClick={() => setValue(active ? "" : opt)}
              style={{
                minWidth: "52px", padding: "8px 12px", fontSize: "13px", fontWeight: "700",
                fontFamily: "inherit", cursor: "pointer", borderRadius: "8px",
                border: active
                  ? `1.5px solid ${isOK ? "rgba(52,199,89,0.5)" : "rgba(255,59,48,0.5)"}`
                  : "1px solid var(--border)",
                background: active
                  ? (isOK ? "rgba(52,199,89,0.10)" : "rgba(255,59,48,0.10)")
                  : "var(--card)",
                color: active ? (isOK ? GREEN : RED) : "var(--text-3)",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  }

  // number: 실시간 색 반응 입력
  return (
    <input
      type="text"
      inputMode="decimal"
      name={`correctedText_${id}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="New value"
      style={{
        width: "100px", padding: "7px 10px", fontSize: "13px", textAlign: "center",
        border: `1.5px solid ${border}`, borderRadius: "8px",
        background: tint, color, fontWeight: "600",
        fontFamily: "inherit", outline: "none",
        transition: "border-color 0.15s, background 0.15s, color 0.15s",
      }}
    />
  );
}
