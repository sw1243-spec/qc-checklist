"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { submitChecklist } from "@/app/actions";
import type { DeviceDepartment } from "@/lib/device";

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
  referenceImage: string | null;
  note: string | null;
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
  lockedDepartment?: DeviceDepartment;
  initialValues?: Record<string, string>;
  initialMeta?: {
    shift1LE: string; shift2LE: string; shift1QC: string; shift2QC: string;
    shift1SV: string; shift2SV: string;
    shift3LE: string; shift3QC: string; shift3SV: string;
    partNumberBuild: string;
  } | null;
  shiftName?: string;
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
  `40px 60px minmax(150px, 2.6fr) minmax(96px, 1.2fr) 120px ${Array(n).fill("minmax(68px, 1fr)").join(" ")}`;

const COL = "1px solid rgba(0,0,0,0.12)";
const ROW = "1px solid rgba(0,0,0,0.08)";

export default function ChecklistForm({
  templateId, lineId, lineCode, modelId, modelName,
  partNumberId, partNumberCode, partNumberLabel,
  templateName, note, items, shift, sampleCount, sampleLabels, autoPartNo, defaultDate,
  leNames, qcNames, svNames, lockedDepartment,
  initialValues, initialMeta, shiftName,
}: Props) {
  const router = useRouter();
  const partNos = Array.from({ length: sampleCount }, (_, i) => i + 1);
  const [isPending, setIsPending] = useState(false);

  // 부서별 입력 분담: 부서가 지정된 항목이 하나라도 있으면 Quality/Production 토글 표시
  const hasDepartments = items.some((i) => i.department === "QC" || i.department === "PROD");
  const [dept, setDept] = useState<DeviceDepartment>(lockedDepartment ?? "QC");
  // 잠금 규칙 (부서 토글이 켜진 경우):
  //  - 부서 지정 항목: 현재 선택 부서와 다르면 잠금
  //  - 공통 항목(부서 미지정): Quality(QC) 담당으로 귀속 → Production 모드에선 잠금
  //    (한 부서가 책임지게 해야 부서별 제출이 서로 안 덮어씀)
  const isItemLocked = (item: CheckItem) => {
    if (!hasDepartments) return false;
    if (!item.department) return dept === "PROD";
    return item.department !== dept;
  };

  const [date, setDate] = useState(defaultDate);
  // 이어 작성: 오늘 기존 제출값이 있으면 미리 채움 (1st 후 Mid·Last 추가용)
  const [meta, setMeta] = useState(initialMeta ?? {
    shift1LE: "", shift2LE: "", shift1QC: "", shift2QC: "", shift1SV: "", shift2SV: "",
    shift3LE: "", shift3QC: "", shift3SV: "",
    partNumberBuild: partNumberLabel ?? partNumberCode ?? "",
  });
  const [values, setValues] = useState<Record<ValueKey, string>>(
    (initialValues as Record<ValueKey, string> | undefined) ?? {},
  );
  const [modalType, setModalType] = useState<"oor" | "empty" | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<(() => void) | null>(null);
  const [imgModal, setImgModal] = useState<number | null>(null); // 참조 사진 모달 (itemId)

  const setValue = (itemId: number, s: number, partNo: number, val: string) =>
    setValues((prev) => ({ ...prev, [`${itemId}-${s}-${partNo}`]: val }));
  const getValue = (itemId: number, s: number, partNo: number): string =>
    values[`${itemId}-${s}-${partNo}` as ValueKey] ?? "";

  // ── 작성 내용 자동 백업 (네트워크 끊김·새로고침·앱 종료 대비) ──
  const draftKey = `qc_draft_v1_${templateId}_${lineId}_${modelId}_${partNumberId ?? "none"}_${shift}`;
  const restored = useRef(false);
  // 복원 (마운트 1회, 12시간 이내 초안만)
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const d = JSON.parse(raw);
          if (d.savedAt && Date.now() - d.savedAt < 12 * 3600 * 1000) {
            if (d.values) setValues(d.values);
            if (d.meta) setMeta((m) => ({ ...m, ...d.meta }));
            if (d.date) setDate(d.date);
          } else {
            localStorage.removeItem(draftKey); // 오래된 초안 폐기
          }
        }
      } catch { /* ignore */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [draftKey]);
  // 변경 시 자동 저장
  useEffect(() => {
    if (!restored.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ values, meta, date, savedAt: Date.now() }));
    } catch { /* storage full/unavailable */ }
  }, [values, meta, date, draftKey]);
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* */ } };

  // 섹션은 no 순서로 처음 등장한 순서대로 (DB 쿼리가 no asc 정렬)
  const sections = [...new Set(items.map((i) => i.section))];

  // 컬럼(1st/Mid/Last) 단위 검증:
  //  - 컬럼 전체가 빈칸이면 "이번엔 안 함"으로 통과
  //  - 필수 항목이 하나라도 채워진 컬럼은 그 컬럼의 필수 항목 전부 채워야 함
  //  - 모든 컬럼이 빈칸이면 빈 시트이므로 경고
  // 현재 부서에서 입력 가능한(잠기지 않은) 필수 항목만 — 다른 부서 항목 빈칸으로 제출이 막히지 않게
  const requiredItems = items.filter((item) => !item.nullable && !isItemLocked(item));

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
      if (isItemLocked(item)) return false; // 다른 부서 항목은 이번 제출 대상 아님
      if (item.inputType !== "number") return false;
      const spec = getSpec(item, lineId, modelId, partNumberId);
      return partNos.some((pn) => isOutOfRange(getValue(item.id, shift, pn), spec));
    });
  }
  // 이번 제출에 보낼 값 — 부서 분담 시 현재 부서 항목만 (다른 부서 값은 서버에서 보존됨)
  function buildVals() {
    const target = hasDepartments ? items.filter((i) => !isItemLocked(i)) : items;
    return target.flatMap((item) =>
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
        clearDraft(); // 제출 성공 → 로컬 초안 삭제
        router.push(`/submission/${result.submissionId}`);
      } else {
        alert("Save failed: " + result.error);
        setIsPending(false);
      }
    } catch {
      // 네트워크/서버 오류 — 작성 내용은 이 기기에 보관됨 (새로고침해도 복원)
      alert("Network error. Your entries are saved on this device — check your connection and press Submit again.");
      setIsPending(false);
    }
  }
  function handleSubmit() {
    const le = shift === 1 ? meta.shift1LE : shift === 2 ? meta.shift2LE : meta.shift3LE;
    const qc = shift === 1 ? meta.shift1QC : shift === 2 ? meta.shift2QC : meta.shift3QC;
    const sv = shift === 1 ? meta.shift1SV : shift === 2 ? meta.shift2SV : meta.shift3SV;
    if (hasDepartments) {
      // 부서 분담: 제출하는 부서 담당만 필수 (Quality→QC 검사자, Production→라인리더)
      if (dept === "QC" && !qc.trim()) { alert("Please select the QC Inspector before submitting."); return; }
      if (dept === "PROD" && !le.trim()) { alert("Please select the Line Leader before submitting."); return; }
    } else {
      // 부서 분담 없음: 3명 모두 필수
      if (!le.trim() || !qc.trim() || !sv.trim()) {
        alert("Please select the Line Leader, QC Inspector, and QC Supervisor before submitting.");
        return;
      }
    }
    // 부서 제출 확인 — 다른 부서를 실수로 채워 제출하는 것 방지
    if (hasDepartments) {
      const deptName = dept === "QC" ? "Quality" : "Production";
      if (!confirm(`Submit the ${deptName} items for this check sheet?`)) return;
    }
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
              {shiftName ?? (shift === 1 ? "1st Shift" : shift === 2 ? "2nd Shift" : "3rd Shift")}
            </span>
          </div>

          {/* 부서별 입력 토글 (부서 지정 항목이 있을 때만) */}
          {hasDepartments && lockedDepartment && (
            <div style={{ marginTop: "16px", display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "9999px", background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text-2)", fontSize: "12px", fontWeight: 700 }}>
              This tablet is locked to {lockedDepartment === "QC" ? "Quality" : "Production"}
            </div>
          )}
          {hasDepartments && !lockedDepartment && (
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
          {/* shift에 맞는 작업자 필드 — 시프트 이름은 shiftName prop */}
          {(() => {
            const label = shiftName ?? (shift === 1 ? "1st Shift" : shift === 2 ? "2nd Shift" : "3rd Shift");
            const leKey = shift === 1 ? "shift1LE" : shift === 2 ? "shift2LE" : "shift3LE";
            const qcKey = shift === 1 ? "shift1QC" : shift === 2 ? "shift2QC" : "shift3QC";
            const svKey = shift === 1 ? "shift1SV" : shift === 2 ? "shift2SV" : "shift3SV";
            return (
              <>
                <Field label={`${label} — Line Leader`}>
                  <WorkerSelect names={leNames} value={meta[leKey as keyof typeof meta] as string} onChange={(v) => setMeta((m) => ({ ...m, [leKey]: v }))} />
                </Field>
                <Field label={`${label} — QC Inspector`}>
                  <WorkerSelect names={qcNames} value={meta[qcKey as keyof typeof meta] as string} onChange={(v) => setMeta((m) => ({ ...m, [qcKey]: v }))} />
                </Field>
                <Field label={`${label} — QC Supervisor`}>
                  <WorkerSelect names={svNames} value={meta[svKey as keyof typeof meta] as string} onChange={(v) => setMeta((m) => ({ ...m, [svKey]: v }))} />
                </Field>
              </>
            );
          })()}

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
                  { label: "No.", align: "center" as const },
                  { label: "Op#", align: "center" as const },
                  { label: "Measuring Item", align: "left" as const },
                  { label: "Method", align: "left" as const },
                  { label: "Spec", align: "center" as const },
                  ...sampleLabels.map((l, i) => ({ label: l, align: "center" as const, isLast: i === sampleLabels.length - 1 })),
                ].map((col, ci) => (
                  <div key={ci} style={{
                    padding: "9px 8px",
                    fontSize: "10px", fontWeight: "700",
                    color: "var(--text-3)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    textAlign: col.align,
                    borderRight: ci < sampleCount + 4 ? COL : "none",
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
                    {/* No. */}
                    <div style={{
                      padding: "13px 8px", borderRight: COL,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "monospace", fontWeight: "700" }}>
                        {item.no}
                      </span>
                    </div>

                    {/* Op# */}
                    <div style={{
                      padding: "13px 8px", borderRight: COL,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {item.opNo
                        ? <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--accent)", fontFamily: "monospace", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{item.opNo}</span>
                        : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </div>

                    {/* Item name */}
                    <div style={{ padding: "13px 16px", borderRight: COL }}>
                      <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-1)", lineHeight: "1.35", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {item.characteristic}
                        {item.department === "QC" && <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "999px", background: "rgba(125,155,118,0.18)", color: "#5a7a52" }}>Quality</span>}
                        {item.department === "PROD" && <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "999px", background: "rgba(107,140,174,0.18)", color: "#4a6a8e" }}>Production</span>}
                        {item.referenceImage && (
                          <button
                            type="button"
                            onClick={() => setImgModal(item.id)}
                            title="View reference photo"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: "3px",
                              fontSize: "10px", fontWeight: 600, padding: "2px 8px",
                              borderRadius: "999px", cursor: "pointer",
                              background: "rgba(0,113,227,0.10)", color: "#0071e3",
                              border: "1px solid rgba(0,113,227,0.25)", fontFamily: "inherit",
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>
                            </svg>
                            Photo
                          </button>
                        )}
                      </div>
                      {item.unit && (
                        <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                          ({item.unit})
                        </div>
                      )}
                      {item.note && (
                        <div style={{
                          fontSize: "11px", color: "#b26b00",
                          background: "rgba(255,159,10,0.08)",
                          border: "1px solid rgba(255,159,10,0.22)",
                          borderRadius: "5px", padding: "4px 8px", marginTop: "6px",
                          lineHeight: 1.4, whiteSpace: "pre-wrap",
                        }}>
                          ⚠ {item.note}
                        </div>
                      )}
                    </div>

                    {/* Method */}
                    <div style={{
                      padding: "13px 10px", borderRight: COL,
                      display: "flex", alignItems: "center",
                      fontSize: "12px", color: "var(--text-2)", lineHeight: "1.35",
                      wordBreak: "break-word",
                    }}>
                      {item.method || <span style={{ color: "var(--text-3)" }}>—</span>}
                    </div>

                    {/* Spec */}
                    <div style={{
                      padding: "13px 8px", borderRight: COL,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "11px", color: "var(--text-2)", textAlign: "center",
                      lineHeight: "1.4", wordBreak: "break-word",
                    }}>
                      {(() => {
                        if (!spec) return item.inputType === "ok_ng" ? "OK / NG" : "—";
                        const hasRange = spec.minVal !== null || spec.maxVal !== null;
                        if (hasRange) {
                          const sep = spec.minVal !== null && spec.maxVal !== null ? " ~ " : "";
                          const range = `${spec.minVal ?? ""}${sep}${spec.maxVal ?? ""}${item.unit ? ` ${item.unit}` : ""}`;
                          return spec.label ? `${range}  ·  ${spec.label}` : range;
                        }
                        if (spec.label) return spec.label;
                        return item.inputType === "ok_ng" ? "OK / NG" : "—";
                      })()}
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

      {/* ── 참조 사진 모달 ──────────────────────────── */}
      {imgModal !== null && (
        <div
          onClick={() => setImgModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: "24px", cursor: "zoom-out",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/reference/${imgModal}`}
            alt="Reference"
            style={{ maxWidth: "96%", maxHeight: "92%", objectFit: "contain", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
          />
        </div>
      )}

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

// 등록된 작업자만 고르는 드롭다운 (자유 입력 방지)
// 기존 자유입력 값이 목록에 없으면 그 값도 보존해서 표시
function WorkerSelect({ names, value, onChange }: { names: string[]; value: string; onChange: (v: string) => void }) {
  const opts = value && !names.includes(value) ? [value, ...names] : names;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="apple-input"
      style={{ cursor: "pointer" }}
    >
      <option value="">— Select —</option>
      {opts.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
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
  const isText = inputType === "text";
  return (
    <input
      type="text" inputMode={isText ? "text" : "decimal"} disabled={disabled}
      value={value} onChange={(e) => onChange(e.target.value)}
      style={isText ? { ...base, textAlign: "left", fontSize: "12px" } : base}
      placeholder={nullable ? "N/A" : ""}
    />
  );
}
