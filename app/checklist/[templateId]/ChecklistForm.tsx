"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitChecklist } from "@/app/actions";

type SpecRange = {
  lineId: number | null;
  modelId: number | null;
  partNumberId: number | null;
  minVal: number | null;
  maxVal: number | null;
  label: string | null;
};

type CheckItem = {
  id: number;
  section: string;
  opNo: string | null;
  no: number;
  characteristic: string;
  method: string | null;
  sample: string | null;
  inputType: string;
  unit: string | null;
  nullable: boolean;
  department: string | null;
  specRanges: SpecRange[];
};

type Props = {
  templateId: number;
  lineId: number;
  lineCode: string;
  modelId: number;
  modelName: string;
  partNumberId?: number;
  partNumberCode?: string;
  partNumberLabel?: string;
  templateName: string;
  note?: string;
  items: CheckItem[];
  shift: number;
  sampleCount: number;
  sampleLabels: string[];
  autoPartNo: boolean;
  defaultDate: string;
  leNames: string[];
  qcNames: string[];
  svNames: string[];
};

type ValueKey = `${number}-${number}-${number}`;

function getSpec(item: CheckItem, lineId: number, modelId: number, partNumberId?: number): SpecRange | null {
  return (
    // partNumber-specific spec (highest priority)
    (partNumberId ? item.specRanges.find((s) => s.partNumberId === partNumberId) : null) ??
    // line + model
    item.specRanges.find((s) => s.lineId === lineId && s.modelId === modelId && !s.partNumberId) ??
    // line only
    item.specRanges.find((s) => s.lineId === lineId && s.modelId === null && !s.partNumberId) ??
    // model only
    item.specRanges.find((s) => s.lineId === null && s.modelId === modelId && !s.partNumberId) ??
    // global
    item.specRanges.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId) ??
    null
  );
}

function isOutOfRange(value: string, spec: SpecRange | null): boolean {
  if (!spec || value === "" || value === "N/A" || value === "OK" || value === "NG") return false;
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  if (spec.minVal !== null && num < spec.minVal) return true;
  if (spec.maxVal !== null && num > spec.maxVal) return true;
  return false;
}

/* F-pattern: OP col + item col + spec + samples */
const grid = (n: number) =>
  `52px minmax(160px, 3fr) 120px ${Array(n).fill("minmax(68px, 1fr)").join(" ")}`;

const COL = "1px solid rgba(0,0,0,0.12)";
const ROW = "1px solid rgba(0,0,0,0.08)";

export default function ChecklistForm({
  templateId, lineId, lineCode, modelId, modelName,
  partNumberId, partNumberCode, partNumberLabel,
  templateName, note, items, shift, sampleCount, sampleLabels, autoPartNo, defaultDate,
  leNames, qcNames, svNames,
}: Props) {
  const router = useRouter();
  const partNos = Array.from({ length: sampleCount }, (_, i) => i + 1);
  const [isPending, setIsPending] = useState(false);

  // 부서별 입력 분담: 부서가 지정된 항목이 하나라도 있으면 Quality/Production 토글 표시
  const hasDepartments = items.some((i) => i.department === "QC" || i.department === "PROD");
  const [dept, setDept] = useState<"QC" | "PROD">("QC");
  // 잠금: 부서 토글이 켜져 있고 + 항목에 부서가 지정됐고 + 현재 선택 부서와 다르면 잠금
  const isItemLocked = (item: CheckItem) =>
    hasDepartments && !!item.department && item.department !== dept;

  const [date, setDate] = useState(defaultDate);
  const [meta, setMeta] = useState({
    shift1LE: "", shift2LE: "", shift1QC: "", shift2QC: "", shift1SV: "", shift2SV: "",
    partNumberBuild: partNumberLabel ?? partNumberCode ?? "",
  });
  const [values, setValues] = useState<Record<ValueKey, string>>({});
  const [modalType, setModalType] = useState<"oor" | "empty" | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<(() => void) | null>(null);

  const setValue = (itemId: number, s: number, partNo: number, val: string) =>
    setValues((prev) => ({ ...prev, [`${itemId}-${s}-${partNo}`]: val }));
  const getValue = (itemId: number, s: number, partNo: number): string =>
    values[`${itemId}-${s}-${partNo}` as ValueKey] ?? "";

  // 섹션은 no 순서로 처음 등장한 순서대로 (DB 쿼리가 no asc 정렬)
  const sections = [...new Set(items.map((i) => i.section))];

  // 컬럼(1st/Mid/Last) 단위 검증:
  //  - 컬럼 전체가 빈칸이면 "이번엔 안 함"으로 통과
  //  - 필수 항목이 하나라도 채워진 컬럼은 그 컬럼의 필수 항목 전부 채워야 함
  //  - 모든 컬럼이 빈칸이면 빈 시트이므로 경고
  const requiredItems = items.filter((item) => !item.nullable);

  // 해당 컬럼(partNo)에 필수 항목 값이 하나라도 있으면 "사용중" 컬럼
  function isColumnStarted(pn: number) {
    return requiredItems.some((item) => getValue(item.id, shift, pn).trim() !== "");
  }

  function hasEmpty() {
    const startedCols = partNos.filter((pn) => isColumnStarted(pn));
    // 시작된 컬럼이 하나도 없음 → 빈 시트
    if (startedCols.length === 0) return true;
    // 시작된 컬럼 안에 빈 필수 항목이 있으면 경고
    return startedCols.some((pn) =>
      requiredItems.some((item) => getValue(item.id, shift, pn).trim() === "")
    );
  }
  function hasOutOfRangeAny() {
    return items.some((item) => {
      if (item.inputType !== "number") return false;
      const spec = getSpec(item, lineId, modelId, partNumberId);
      return partNos.some((pn) => isOutOfRange(getValue(item.id, shift, pn), spec));
    });
  }
  function buildVals() {
    return items.flatMap((item) =>
      partNos.map((partNo) => ({ itemId: item.id, shift, partNo, valueText: getValue(item.id, shift, partNo) }))
    );
  }
  async function doSubmit() {
    setIsPending(true);
    try {
      const resolvedMeta = {
        ...(autoPartNo ? { ...meta, partNumberBuild: modelName } : meta),
        partNumberId,
      };
      const result = await submitChecklist(templateId, lineId, modelId, date, shift, resolvedMeta, buildVals());
      if (result.ok) {
        router.push(`/submission/${result.submissionId}`);
      } else {
        alert("Save failed: " + result.error);
        setIsPending(false);
      }
    } catch {
      alert("An error occurred. Please try again.");
      setIsPending(false);
    }
  }
  function handleSubmit() {
    const empty = hasEmpty();
    // 빈칸이 있으면 저장 차단 (확인 후 진행 불가)
    if (empty) { setModalType("empty"); return; }
    // OOR만 있으면 기존대로 확인 후 저장 가능
    if (hasOutOfRangeAny()) { setPendingSubmit(() => doSubmit); setModalType("oor"); return; }
    doSubmit();
  }

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "36px 16px 60px", position: "relative" }}>

      {/* 뒤로가기 */}
      <button
        type="button"
        onClick={() => router.back()}
        className="fade-up"
        style={{
          display: "inline-flex", alignItems: "center", gap: "5px",
          background: "none", border: "none", cursor: "pointer",
          color: "var(--accent)", fontSize: "15px", fontWeight: "400",
          letterSpacing: "-0.2px", fontFamily: "inherit",
          padding: 0, marginBottom: "16px",
        }}
      >
        <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
          <path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>

      {/* ── Header card ────────────────────────────── */}
      <div className="liquid-glass fade-up" style={{ padding: "32px", marginBottom: "20px" }}>

        {/* Label + title */}
        <div style={{ marginBottom: "24px" }}>
          {/* 카테고리 레이블: 템플릿 이름에 "start of production" 포함 시 Production Validation,
              그 외(1st MID PC, Error Proof 등)는 Quality Validation.
              새 카테고리 추가 시 여기 조건 추가할 것. */}
          <p className="label-caps" style={{ marginBottom: "10px" }}>
            {templateName.toLowerCase().includes("start of production") ? "Production Validation" : "Quality Validation"}
          </p>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-0.022em", color: "var(--text-1)", lineHeight: "1.2" }}>
              {templateName}
            </h1>
            {/* Shift pill */}
            <span style={{
              flexShrink: 0, marginTop: "2px",
              padding: "4px 14px",
              background: "rgba(0,136,255,0.10)",
              border: "1px solid rgba(0,136,255,0.20)",
              borderRadius: "9999px",
              fontSize: "12px", fontWeight: "700",
              color: "var(--accent)",
              letterSpacing: "0.04em",
              textTransform: "uppercase" as const,
            }}>
              {shift === 1 ? "1st Shift" : "2nd Shift"}
            </span>
          </div>

          {/* 부서별 입력 토글 (부서 지정 항목이 있을 때만) */}
          {hasDepartments && (
            <div style={{ marginTop: "16px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "8px" }}>
                Select your department — only your assigned items are editable.
              </p>
              <div style={{ display: "inline-flex", gap: "4px", background: "var(--panel)", padding: "4px", borderRadius: "9999px" }}>
                {([["QC", "Quality"], ["PROD", "Production"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setDept(v)}
                    style={{
                      fontSize: "13px", fontWeight: 600, padding: "7px 18px",
                      borderRadius: "9999px", border: "none", cursor: "pointer", fontFamily: "inherit",
                      background: dept === v ? "var(--accent)" : "transparent",
                      color: dept === v ? "#fff" : "var(--text-2)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Meta fields — Auralis panel-fill inputs */}
        <div className="meta-grid-2col">
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="apple-input" />
          </Field>
          <Field label="Line">
            <div className="apple-input" style={{ fontWeight: "600", cursor: "default" }}>{lineCode}</div>
          </Field>
          <Field label="Model">
            <div className="apple-input" style={{ fontWeight: "600", cursor: "default" }}>{modelName}</div>
          </Field>
          {(!autoPartNo || !!partNumberId) && (
            <Field label="Part Number Build">
              <input
                value={meta.partNumberBuild}
                onChange={(e) => setMeta((m) => ({ ...m, partNumberBuild: e.target.value }))}
                className="apple-input"
                placeholder="e.g. 3QF407271K"
                readOnly={!!partNumberId}
                style={partNumberId ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
              />
            </Field>
          )}
          {/* datalist for autocomplete */}
          <datalist id="dl-le">{leNames.map((n) => <option key={n} value={n} />)}</datalist>
          <datalist id="dl-qc">{qcNames.map((n) => <option key={n} value={n} />)}</datalist>
          <datalist id="dl-sv">{svNames.map((n) => <option key={n} value={n} />)}</datalist>

          {shift === 1 ? (
            <>
              <Field label="1st Shift — Line Leader">
                <input value={meta.shift1LE} onChange={(e) => setMeta((m) => ({ ...m, shift1LE: e.target.value }))} className="apple-input" placeholder="Name" list="dl-le" />
              </Field>
              <Field label="1st Shift — QC Inspector">
                <input value={meta.shift1QC} onChange={(e) => setMeta((m) => ({ ...m, shift1QC: e.target.value }))} className="apple-input" placeholder="Name" list="dl-qc" />
              </Field>
              <Field label="1st Shift — QC Supervisor">
                <input value={meta.shift1SV} onChange={(e) => setMeta((m) => ({ ...m, shift1SV: e.target.value }))} className="apple-input" placeholder="Name" list="dl-sv" />
              </Field>
            </>
          ) : (
            <>
              <Field label="2nd Shift — Line Leader">
                <input value={meta.shift2LE} onChange={(e) => setMeta((m) => ({ ...m, shift2LE: e.target.value }))} className="apple-input" placeholder="Name" list="dl-le" />
              </Field>
              <Field label="2nd Shift — QC Inspector">
                <input value={meta.shift2QC} onChange={(e) => setMeta((m) => ({ ...m, shift2QC: e.target.value }))} className="apple-input" placeholder="Name" list="dl-qc" />
              </Field>
              <Field label="2nd Shift — QC Supervisor">
                <input value={meta.shift2SV} onChange={(e) => setMeta((m) => ({ ...m, shift2SV: e.target.value }))} className="apple-input" placeholder="Name" list="dl-sv" />
              </Field>
            </>
          )}

          {/* 관리자 주의사항 노트 (오른쪽 하단 빈 칸) */}
          {note && (
            <div>
              <div className="apple-label" style={{ marginBottom: "6px" }}>Note</div>
              <div style={{
                background: "rgba(255,159,10,0.10)", border: "1px solid rgba(255,159,10,0.35)",
                borderRadius: "12px", padding: "12px 14px",
                fontSize: "13px", lineHeight: "1.5", color: "var(--text-1)",
                whiteSpace: "pre-wrap",
              }}>
                {note}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Section tables ──────────────────────────── */}
      {sections.map((section, si) => {
        const sectionItems = items.filter((i) => i.section === section);
        const g = grid(sampleCount);

        return (
          <div key={section} className="fade-up" style={{ marginBottom: "4px", animationDelay: `${0.08 + si * 0.05}s` }}>

            <div className="ios-section-label">{section}</div>

            <div className="section-card">
            <div className="table-scroll">
              {/* Column headers — Auralis label-caps on panel bg */}
              <div style={{ display: "grid", gridTemplateColumns: g, background: "var(--panel)", borderBottom: `1px solid var(--border)` }}>
                {[
                  { label: "OP", align: "center" as const },
                  { label: "Measuring Item", align: "left" as const },
                  { label: "Spec", align: "center" as const },
                  ...sampleLabels.map((l, i) => ({ label: l, align: "center" as const, isLast: i === sampleLabels.length - 1 })),
                ].map((col, ci) => (
                  <div key={ci} style={{
                    padding: "9px 8px",
                    fontSize: "10px", fontWeight: "700",
                    color: "var(--text-3)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    textAlign: col.align,
                    borderRight: ci < sampleCount + 2 ? COL : "none",
                    lineHeight: "1.3",
                    whiteSpace: "nowrap",
                  }}>
                    {col.label}
                    {"isLast" in col && col.isLast && (
                      <div style={{ fontSize: "9px", fontWeight: "500", letterSpacing: "0.05em", color: "var(--text-3)", textTransform: "none", marginTop: "2px" }}>
                        (Change Over)
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Data rows */}
              {sectionItems.map((item, idx) => {
                const spec = getSpec(item, lineId, modelId, partNumberId);
                const hasOor = partNos.some((pn) => isOutOfRange(getValue(item.id, shift, pn), spec));
                const isLast = idx === sectionItems.length - 1;
                const locked = isItemLocked(item);

                return (
                  <div
                    key={item.id}
                    style={{
                      display: "grid", gridTemplateColumns: g,
                      borderBottom: isLast ? "none" : ROW,
                      background: hasOor
                        ? "rgba(255,59,48,0.025)"
                        : idx % 2 === 0 ? "var(--card)" : "var(--bg)",
                      opacity: locked ? 0.45 : 1,
                    }}
                  >
                    {/* OP column */}
                    <div style={{
                      padding: "13px 8px", borderRight: COL,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px",
                    }}>
                      <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "monospace", fontWeight: "700" }}>
                        #{item.no}
                      </span>
                      {item.opNo && (
                        <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--accent)", fontFamily: "monospace", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                          {item.opNo}
                        </span>
                      )}
                    </div>

                    {/* Item name */}
                    <div style={{ padding: "13px 16px", borderRight: COL }}>
                      <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-1)", lineHeight: "1.35", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {item.characteristic}
                        {item.department === "QC" && <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "999px", background: "rgba(125,155,118,0.18)", color: "#5a7a52" }}>Quality</span>}
                        {item.department === "PROD" && <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "999px", background: "rgba(107,140,174,0.18)", color: "#4a6a8e" }}>Production</span>}
                      </div>
                      {item.unit && (
                        <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                          ({item.unit})
                        </div>
                      )}
                    </div>

                    {/* Spec */}
                    <div style={{
                      padding: "13px 8px", borderRight: COL,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", color: "var(--text-2)", textAlign: "center",
                      lineHeight: "1.4", wordBreak: "break-word",
                    }}>
                      {spec?.label
                        ?? (spec && (spec.minVal !== null || spec.maxVal !== null)
                          ? `${spec.minVal ?? ""}${spec.minVal !== null && spec.maxVal !== null ? " ~ " : ""}${spec.maxVal ?? ""}${item.unit ? ` ${item.unit}` : ""}`
                          : item.inputType === "ok_ng" ? "OK / NG" : "—")}
                    </div>

                    {/* Inputs */}
                    {partNos.map((pn, pi) => {
                      const v = getValue(item.id, shift, pn);
                      const oor = isOutOfRange(v, spec);
                      return (
                        <div key={pn} style={{
                          padding: "7px 6px",
                          borderRight: pi < partNos.length - 1 ? COL : "none",
                          display: "flex", alignItems: "center",
                          background: "transparent",
                        }}>
                          <ItemInput
                            inputType={item.inputType}
                            nullable={item.nullable}
                            value={v}
                            outOfRange={oor}
                            disabled={locked}
                            onChange={(val) => setValue(item.id, shift, pn, val)}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        );
      })}

      {/* ── Submit — 하단 sticky ─ */}
      <div style={{
        position: "sticky", bottom: 0,
        padding: "12px 0 max(16px, env(safe-area-inset-bottom))",
        background: "linear-gradient(to top, var(--bg) 60%, transparent)",
        zIndex: 50,
      }}>
      <button onClick={handleSubmit} disabled={isPending} className="btn-primary" style={{ boxShadow: "0 4px 20px rgba(108,126,196,0.3)" }}>
        {isPending ? (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin 1s linear infinite" }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            Saving...
          </span>
        ) : "Submit"}
      </button>
      </div>

      {/* ── Modal ──────────────────────────────────── */}
      {modalType && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(17,17,17,0.45)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px",
        }}>
          <div className="liquid-glass" style={{ maxWidth: "360px", width: "100%", padding: "40px 32px", textAlign: "center" }}>
            {/* Auralis: small accent indicator instead of big icon */}
            <div style={{
              width: "40px", height: "40px", margin: "0 auto 20px",
              background: "rgba(255,59,48,0.08)",
              border: "1px solid rgba(255,59,48,0.16)",
              borderRadius: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <div className="status-dot" style={{
                background: "var(--danger)",
                width: "10px", height: "10px",
              }} />
            </div>

            {modalType === "oor" ? (
              <>
                <h2 style={{ fontSize: "17px", fontWeight: "700", letterSpacing: "-0.02em", color: "var(--text-1)", marginBottom: "10px" }}>
                  Out-of-Range Value
                </h2>
                <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: "1.65", marginBottom: "8px" }}>
                  One or more values are out of the allowed range.
                </p>
                <p style={{ fontSize: "13px", fontWeight: "600", color: "var(--danger)", lineHeight: "1.55", marginBottom: "32px" }}>
                  Report to Maintenance or Production Supervisor immediately.
                </p>
              </>
            ) : (
              <>
                <h2 style={{ fontSize: "17px", fontWeight: "700", letterSpacing: "-0.02em", color: "var(--text-1)", marginBottom: "10px" }}>
                  Empty Fields
                </h2>
                <p style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: "1.65", marginBottom: "32px" }}>
                  Please fill in all required fields before saving.
                </p>
              </>
            )}

            <div style={{ display: "flex", gap: "8px" }}>
              {modalType === "empty" ? (
                // 빈칸 차단: 닫기만 가능, 저장 불가
                <button onClick={() => setModalType(null)} className="btn-primary" style={{ fontSize: "14px", padding: "12px 16px", flex: 1 }}>
                  OK
                </button>
              ) : (
                <>
                  <button onClick={() => setModalType(null)} className="btn-secondary" style={{ fontSize: "14px", padding: "12px 16px", flex: 1 }}>
                    Edit Again
                  </button>
                  <button
                    onClick={() => { setModalType(null); pendingSubmit?.(); }}
                    className="btn-danger"
                    style={{ fontSize: "14px", padding: "12px 16px", flex: 1 }}
                  >
                    Save
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="apple-label">{label}</label>
      {children}
    </div>
  );
}

function ItemInput({ inputType, nullable, value, outOfRange, onChange, disabled }: {
  inputType: string; nullable: boolean; value: string; outOfRange: boolean; onChange: (v: string) => void; disabled?: boolean;
}) {
  const filled = value.trim() !== "" && value !== "N/A";
  const inRange = filled && !outOfRange && inputType === "number";
  const isOK    = filled && !outOfRange && inputType === "ok_ng" && value === "OK";
  const isNG    = filled && inputType === "ok_ng" && value === "NG";

  const base: React.CSSProperties = {
    width: "100%", padding: "8px 5px",
    fontSize: "13px", fontFamily: "inherit", textAlign: "center",
    border: outOfRange || isNG
      ? "1.5px solid rgba(255,59,48,0.4)"
      : inRange || isOK
      ? "1.5px solid rgba(52,199,89,0.4)"
      : "1px solid var(--border)",
    borderRadius: "8px", outline: "none",
    background: outOfRange || isNG
      ? "rgba(255,59,48,0.04)"
      : inRange || isOK
      ? "rgba(52,199,89,0.04)"
      : "var(--card)",
    color: outOfRange || isNG
      ? "var(--danger)"
      : inRange || isOK
      ? "var(--success)"
      : "var(--text-1)",
    fontWeight: (outOfRange || inRange || isOK || isNG) ? "600" : "400",
    transition: "border-color 0.15s ease, background 0.15s ease",
    WebkitAppearance: "none",
    ...(disabled ? { opacity: 0.4, background: "var(--panel)", cursor: "not-allowed" } : {}),
  };
  if (inputType === "ok_ng") {
    return (
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} style={{ ...base, cursor: disabled ? "not-allowed" : "pointer" }}>
        <option value="">—</option>
        <option value="OK">OK</option>
        <option value="NG">NG</option>
        {nullable && <option value="N/A">N/A</option>}
      </select>
    );
  }
  return (
    <input
      type="text" inputMode="decimal" disabled={disabled}
      value={value} onChange={(e) => onChange(e.target.value)}
      style={base} placeholder={nullable ? "N/A" : ""}
    />
  );
}
