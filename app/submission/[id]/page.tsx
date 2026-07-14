import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { submitCorrectiveAction } from "@/app/actions";
import PhotoUploader from "./PhotoUploader";
import CorrectedValueInput from "./CorrectedValueInput";

// ── 스펙 해석/판정 (ChecklistForm 과 동일 규칙) ──
type Spec = { lineId: number | null; modelId: number | null; partNumberId: number | null; minVal: number | null; maxVal: number | null; label: string | null };

function getSpec(specRanges: Spec[], lineId: number | null, modelId: number | null, partNumberId: number | null): Spec | null {
  return (
    (partNumberId ? specRanges.find((s) => s.partNumberId === partNumberId) : null) ??
    specRanges.find((s) => s.lineId === lineId && s.modelId === modelId && !s.partNumberId) ??
    specRanges.find((s) => s.lineId === lineId && s.modelId === null && !s.partNumberId) ??
    specRanges.find((s) => s.lineId === null && s.modelId === modelId && !s.partNumberId) ??
    specRanges.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId) ??
    null
  );
}

function isOOR(value: string | null, spec: Spec | null): boolean {
  if (!spec || !value || value === "N/A" || value === "OK" || value === "NG") return false;
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  if (spec.minVal !== null && num < spec.minVal) return true;
  if (spec.maxVal !== null && num > spec.maxVal) return true;
  return false;
}

// 화면 표시용 스펙 텍스트
function specText(spec: Spec | null, inputType: string, unit: string | null): string {
  if (!spec) return inputType === "ok_ng" ? "OK / NG" : "";
  const hasRange = spec.minVal !== null || spec.maxVal !== null;
  if (hasRange) {
    const sep = spec.minVal !== null && spec.maxVal !== null ? " ~ " : "";
    const range = `${spec.minVal ?? ""}${sep}${spec.maxVal ?? ""}${unit ? ` ${unit}` : ""}`;
    // 범위 + (마스터 게이지 코드 등 라벨이 따로 있으면 함께)
    return spec.label ? `${range}  ·  ${spec.label}` : range;
  }
  if (spec.label) return spec.label; // 범위 없는 항목(그리스 등)은 라벨만
  return inputType === "ok_ng" ? "OK / NG" : "";
}

// 재측정값(corrected)이 스펙에 맞는지 판정
function correctedStatus(inputType: string, spec: Spec | null, text: string | null): "pass" | "fail" | "unknown" {
  if (!text) return "unknown";
  if (inputType === "ok_ng") return text.trim().toUpperCase() === "OK" ? "pass" : "fail";
  if (!spec || (spec.minVal === null && spec.maxVal === null)) return "unknown";
  return isOOR(text, spec) ? "fail" : "pass";
}

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) redirect("/login");
  const { id } = await params;
  const sid = Number(id);
  if (!Number.isFinite(sid)) notFound();

  const submission = await prisma.submission.findUnique({
    where: { id: sid },
    include: {
      template: true,
      line: { include: { company: true } },
      model: true,
      correctiveAction: { include: { photos: { orderBy: { createdAt: "asc" } } } },
      logs: { orderBy: { editedAt: "desc" } },
      values: {
        include: { item: { include: { specRanges: true } } },
        orderBy: [{ item: { sortOrder: "asc" } }, { shift: "asc" }, { partNo: "asc" }],
      },
    },
  });
  if (!submission) notFound();

  // 같은 날 + 같은 PN 그리스 교체 이력 (있을 때만)
  const greaseLogs = submission.partNumberId
    ? await prisma.greaseLog.findMany({
        where: {
          partNumberId: submission.partNumberId,
          date: {
            gte: (() => { const d = new Date(submission.date); d.setHours(0, 0, 0, 0); return d; })(),
            lt:  (() => { const d = new Date(submission.date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d; })(),
          },
        },
        orderBy: { changedAt: "asc" },
      })
    : [];
  const greaseOut = greaseLogs.filter((g) => g.side === "outboard");
  const greaseIn  = greaseLogs.filter((g) => g.side === "inboard");

  const sampleLabels = submission.template.sampleLabels.split(",");
  const shifts = [...new Set(submission.values.map((v) => v.shift))].sort();
  const partNos = [...new Set(submission.values.map((v) => v.partNo))].sort();

  // 마감이 지난 shift에만 Edit 버튼 표시
  const shiftConfigs = await prisma.shiftConfig.findMany({ where: { order: { in: shifts } } });
  const now = new Date();
  const subDateStr = new Date(submission.date).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const closedShifts = shifts.filter((sh) => {
    const cfg = shiftConfigs.find((c) => c.order === sh);
    if (!cfg) return subDateStr < todayStr; // ShiftConfig 없으면 날짜만 비교
    if (subDateStr < todayStr) return true; // 제출일이 오늘 이전이면 무조건 닫힘
    // 제출일 = 오늘: 마감 시각이 지났는지 확인
    const deadline = new Date(`${subDateStr}T00:00:00`);
    deadline.setHours(cfg.endHour, cfg.endMinute, 59, 999);
    return now > deadline;
  });

  const editLinks = closedShifts.map((sh) => {
    const params = new URLSearchParams({
      lineId: String(submission.lineId),
      modelId: String(submission.modelId ?? ""),
      shift: String(sh),
      submissionId: String(submission.id),
    });
    if (submission.partNumberId) params.set("partNumberId", String(submission.partNumberId));
    return { shift: sh, url: `/checklist/${submission.templateId}?${params.toString()}` };
  });

  const shiftMeta: Record<number, { le: string | null; qc: string | null }> = {
    1: { le: submission.shift1LE, qc: submission.shift1QC },
    2: { le: submission.shift2LE, qc: submission.shift2QC },
    3: { le: submission.shift3LE ?? null, qc: submission.shift3QC ?? null },
  };

  // OOR 항목만 추출
  const oorItems = submission.values.filter((v) => v.isOutOfRange);
  // 재측정 폼용: 항목별 스펙 텍스트 첨부
  const oorForm = oorItems.map((v) => {
    const spec = getSpec(v.item.specRanges, submission.lineId, submission.modelId, submission.partNumberId);
    return {
      id: v.id, itemId: v.itemId, shift: v.shift, partNo: v.partNo,
      valueText: v.valueText, correctedText: v.correctedText,
      specLabel: specText(spec, v.item.inputType, v.item.unit),
      minVal: spec?.minVal ?? null, maxVal: spec?.maxVal ?? null,
      item: { no: v.item.no, opNo: v.item.opNo, characteristic: v.item.characteristic, inputType: v.item.inputType },
    };
  });
  // 모든 OOR 항목이 스펙에 맞는 재측정값을 가질 때만 "Resolved"
  const allResolved = oorItems.length > 0 && oorItems.every((v) => {
    const spec = getSpec(v.item.specRanges, submission.lineId, submission.modelId, submission.partNumberId);
    return correctedStatus(v.item.inputType, spec, v.correctedText) === "pass";
  });

  const GRID = `60px minmax(160px, 3fr) ${partNos.map(() => "minmax(52px, 1fr)").join(" ")}`;
  const COL = "1px solid var(--border)";
  const ROW = "1px solid var(--border)";

  const ca = submission.correctiveAction;

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1 }}>

      {/* ── Summary header ─────────────────────────── */}
      <div className="liquid-glass fade-up" style={{ padding: "32px", marginBottom: "24px" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px" }}>
          <div>
            <p className="label-caps" style={{ marginBottom: "10px" }}>
              Submission #{submission.id}
            </p>
            <h1 style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-0.022em", color: "var(--text-1)", lineHeight: "1.2" }}>
              {submission.templateName ?? submission.template.name}
            </h1>
            <p style={{ fontSize: "13px", color: "var(--text-2)", marginTop: "5px" }}>
              {submission.date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>

          <div style={{ paddingTop: "2px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
            {editLinks.map(({ shift: sh, url }) => (
              <Link key={sh} href={url} style={{
                fontSize: "12px", fontWeight: "600", padding: "5px 12px",
                background: "var(--panel)", border: "1px solid var(--border)",
                borderRadius: "8px", textDecoration: "none", color: "var(--text-2)",
                display: "flex", alignItems: "center", gap: "5px",
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Edit Shift {sh}
              </Link>
            ))}
            {submission.hasOutOfRange ? (
              <span className="status-pill warn">
                <span className="status-dot warn" />
                Out-of-Range
              </span>
            ) : (
              <span className="status-pill ok">
                <span className="status-dot ok" />
                All Pass
              </span>
            )}
            {submission.hasOutOfRange && ca && allResolved && (
              <span style={{
                fontSize: "10px", fontWeight: "600", padding: "3px 8px",
                background: "rgba(52,199,89,0.10)", color: "#34C759",
                border: "1px solid rgba(52,199,89,0.25)", borderRadius: "999px",
              }}>
                ✓ Resolved
              </span>
            )}
            {submission.hasOutOfRange && ca && !allResolved && (
              <span style={{
                fontSize: "10px", fontWeight: "600", padding: "3px 8px",
                background: "rgba(255,159,10,0.12)", color: "#b26b00",
                border: "1px solid rgba(255,159,10,0.3)", borderRadius: "999px",
              }}>
                Action recorded · spec not met
              </span>
            )}
          </div>
        </div>

        <div className="meta-grid-2col">
          {[
            { label: "Company",  value: submission.companyName  ?? submission.line.company.name },
            { label: "Line",     value: submission.lineName     ?? submission.line.code },
            { label: "Model",    value: submission.modelName    ?? submission.model?.name ?? "-" },
            ...(submission.partNumberBuild ? [{ label: "Part No.", value: submission.partNumberBuild }] : []),
          ].map(({ label, value }) => (
            <div key={label} style={{
              padding: "11px 14px",
              background: "var(--panel)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
            }}>
              <div className="label-caps" style={{ marginBottom: "4px", fontSize: "10px" }}>{label}</div>
              <div style={{ fontSize: "15px", fontWeight: "500", color: "var(--text-1)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── OOR 항목 요약 ────────────────────────────── */}
      {submission.hasOutOfRange && (
        <div className="fade-up" style={{
          background: "rgba(255,59,48,0.05)",
          border: "1px solid rgba(255,59,48,0.18)",
          borderRadius: "14px",
          padding: "20px",
          marginBottom: "24px",
        }}>
          <p style={{ fontSize: "12px", fontWeight: "700", color: "var(--danger)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "12px" }}>
            Out-of-Range Items ({oorItems.length})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[...new Map(oorItems.map((v) => [v.itemId, v])).values()].map((v) => {
              const spec = getSpec(v.item.specRanges, submission.lineId, submission.modelId, submission.partNumberId);
              const specTxt = specText(spec, v.item.inputType, v.item.unit);
              const st = correctedStatus(v.item.inputType, spec, v.correctedText);
              return (
              <div key={v.itemId} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{
                  fontSize: "10px", fontWeight: "700", padding: "2px 7px",
                  background: "rgba(255,59,48,0.10)", color: "var(--danger)",
                  border: "1px solid rgba(255,59,48,0.20)", borderRadius: "999px",
                  whiteSpace: "nowrap",
                }}>
                  {v.item.opNo ?? `#${v.item.no}`}
                </span>
                <span style={{ fontSize: "14px", color: "var(--text-1)" }}>{v.item.characteristic}</span>
                {specTxt && <span style={{ fontSize: "11px", color: "var(--text-3)" }}>(spec: {specTxt})</span>}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    fontSize: "13px", fontWeight: "700", color: "var(--danger)",
                    textDecoration: v.correctedText ? "line-through" : "none",
                    opacity: v.correctedText ? 0.6 : 1,
                  }}>
                    {v.valueText}
                  </span>
                  {v.correctedText && (
                    <>
                      <span style={{ fontSize: "11px", color: "var(--text-3)" }}>→</span>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: st === "fail" ? "var(--danger)" : "#34C759" }}>
                        {v.correctedText}{st === "fail" ? " ✕ still OOR" : st === "pass" ? " ✓" : ""}
                      </span>
                    </>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Shift blocks ──────────────────────────────── */}
      {shifts.map((shift) => {
        const shiftVals = submission.values.filter((v) => v.shift === shift);
        const sections = [...new Set(shiftVals.map((v) => v.item.section))];
        const sm = shiftMeta[shift];

        return (
          <div key={shift}>
            <div className="shift-divider fade-up">Shift {shift}</div>

            {(sm.le || sm.qc) && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                {sm.le && (
                  <div style={{ flex: 1, padding: "10px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px" }}>
                    <div className="label-caps" style={{ marginBottom: "4px", fontSize: "10px" }}>Line Leader</div>
                    <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-1)" }}>{sm.le}</div>
                  </div>
                )}
                {sm.qc && (
                  <div style={{ flex: 1, padding: "10px 14px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "12px" }}>
                    <div className="label-caps" style={{ marginBottom: "4px", fontSize: "10px" }}>QC Inspector</div>
                    <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-1)" }}>{sm.qc}</div>
                  </div>
                )}
              </div>
            )}

            {sections.map((section, si) => {
              const itemIds = [...new Set(shiftVals.filter((v) => v.item.section === section).map((v) => v.itemId))];
              return (
                <div key={section} className="fade-up" style={{ marginBottom: "4px", animationDelay: `${0.06 + si * 0.04}s` }}>
                  <div className="ios-section-label">{section}</div>
                  <div className="section-card">
                  <div className="table-scroll">
                    <div style={{ display: "grid", gridTemplateColumns: GRID, background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ padding: "9px 8px", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", borderRight: COL, textAlign: "center" }}>
                        OP
                      </div>
                      <div style={{ padding: "9px 16px", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase", borderRight: COL }}>
                        Measuring Item
                      </div>
                      {partNos.map((pn, pi) => (
                        <div key={pn} style={{
                          padding: "9px 6px", fontSize: "11px", fontWeight: "600",
                          color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase",
                          textAlign: "center", borderRight: pi < partNos.length - 1 ? COL : "none",
                          lineHeight: "1.4",
                        }}>
                          {sampleLabels[pn - 1] ?? `#${pn}`}
                          {pi === partNos.length - 1 && (
                            <div style={{ fontSize: "9px", fontWeight: "500", letterSpacing: "0.05em", color: "var(--text-3)", textTransform: "none", marginTop: "2px" }}>
                              (Change Over)
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {itemIds.map((itemId, idx) => {
                      const itemVals = shiftVals.filter((v) => v.itemId === itemId);
                      const item = itemVals[0].item;
                      const isLast = idx === itemIds.length - 1;
                      const spec = getSpec(item.specRanges, submission.lineId, submission.modelId, submission.partNumberId);
                      const specTxt = specText(spec, item.inputType, item.unit);
                      return (
                        <div key={itemId} style={{
                          display: "grid", gridTemplateColumns: GRID,
                          borderBottom: isLast ? "none" : ROW,
                          background: idx % 2 === 0 ? "var(--card)" : "var(--bg)",
                        }}>
                          <div style={{ padding: "12px 8px", borderRight: COL, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "2px" }}>
                            <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "monospace", fontWeight: "700" }}>
                              #{item.no}
                            </span>
                            {item.opNo && (
                              <span style={{ fontSize: "10px", fontWeight: "700", color: "var(--accent)", fontFamily: "monospace", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                                {item.opNo}
                              </span>
                            )}
                          </div>
                          <div style={{ padding: "12px 16px", borderRight: COL }}>
                            <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-1)", lineHeight: "1.35" }}>
                              {item.characteristic}
                            </div>
                            {item.unit && <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px" }}>({item.unit})</div>}
                            {specTxt && (
                              <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "3px" }}>
                                Spec: <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{specTxt}</span>
                              </div>
                            )}
                          </div>
                          {partNos.map((pn, pi) => {
                            const v = itemVals.find((x) => x.partNo === pn);
                            return (
                              <div key={pn} style={{
                                padding: "10px 6px",
                                borderRight: pi < partNos.length - 1 ? COL : "none",
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px",
                                background: v?.isOutOfRange && !v?.correctedText ? "rgba(186,26,26,0.04)" : "transparent",
                              }}>
                                <span style={{
                                  fontSize: "14px",
                                  fontWeight: v?.isOutOfRange ? "700" : "400",
                                  color: v?.isOutOfRange ? "var(--danger)" : "var(--text-1)",
                                  textDecoration: v?.isOutOfRange && v?.correctedText ? "line-through" : "none",
                                  opacity: v?.isOutOfRange && v?.correctedText ? 0.6 : 1,
                                }}>
                                  {v?.valueText || <span style={{ color: "var(--text-3)", fontWeight: "300" }}>—</span>}
                                </span>
                                {v?.correctedText && (() => {
                                  const st = correctedStatus(item.inputType, spec, v.correctedText);
                                  const fail = st === "fail";
                                  return (
                                    <span style={{ fontSize: "13px", fontWeight: "700", color: fail ? "var(--danger)" : "#34C759" }}>
                                      {v.correctedText}{fail ? " ✕" : st === "pass" ? " ✓" : ""}
                                    </span>
                                  );
                                })()}
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
          </div>
        );
      })}

      {/* ── Grease Change Timeline ───────────────────── */}
      {greaseLogs.length > 0 && (
        <div className="fade-up" style={{ marginTop: "32px" }}>
          <p className="ios-section-label">Grease Change Log</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {([["Outboard", greaseOut], ["Inboard", greaseIn]] as const).map(([title, list]) => (
              <div key={title} className="liquid-glass" style={{ padding: "16px 18px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-2)", marginBottom: "12px" }}>{title}</div>
                {list.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "var(--text-3)", fontStyle: "italic" }}>No records</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {list.map((g, i) => (
                      <div key={g.id} style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--accent)", fontFamily: "monospace", flexShrink: 0 }}>
                          {new Date(g.changedAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </span>
                        <span style={{ fontSize: "13px", color: "var(--text-1)" }}>
                          {g.batchCode}
                          {g.operator && <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "6px" }}>· {g.operator}</span>}
                          {i === 0 && <span style={{ fontSize: "10px", color: "var(--text-3)", marginLeft: "6px" }}>(start)</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Photos ───────────────────────────────────── */}
      {submission.hasOutOfRange && (
        <div className="fade-up" style={{ marginTop: "32px" }}>
          <div className="liquid-glass" style={{ padding: "20px 24px" }}>
            <PhotoUploader
              submissionId={submission.id}
              photos={ca?.photos.map((p) => ({ id: p.id, filename: p.filename, originalName: p.originalName, caption: p.caption })) ?? []}
            />
          </div>
        </div>
      )}

      {/* ── Corrective Action ────────────────────────── */}
      {submission.hasOutOfRange && (
        <div className="fade-up" style={{ marginTop: "32px" }}>
          <p className="ios-section-label">Corrective Action</p>

          {ca ? (
            <div className="liquid-glass" style={{ padding: "24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <Row label="Action Taken" value={ca.action ?? "-"} />
                <Row label="Resolved By" value={ca.resolvedBy ?? "-"} />
                <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>
                  Recorded: {ca.createdAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                </div>
              </div>
              <details style={{ marginTop: "16px" }}>
                <summary style={{ fontSize: "13px", color: "var(--text-3)", cursor: "pointer" }}>Edit</summary>
                <CaForm submissionId={submission.id} defaultAction={ca.action ?? ""} defaultResolvedBy={ca.resolvedBy ?? ""} oorValues={oorForm} />
              </details>
            </div>
          ) : (
            <div className="liquid-glass" style={{ padding: "24px" }}>
              <p style={{ fontSize: "13px", color: "var(--danger)", marginBottom: "16px" }}>
                ⚠️ No corrective action has been recorded yet.
              </p>
              <CaForm submissionId={submission.id} defaultAction="" defaultResolvedBy="" oorValues={oorForm} />
            </div>
          )}
        </div>
      )}

      {/* ── Edit History ────────────────────────────── */}
      {submission.logs.length > 0 && (
        <div className="fade-up" style={{ marginTop: "32px" }}>
          <p className="ios-section-label">Edit History</p>
          <div className="liquid-glass" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "4px" }}>
              Created: {submission.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </div>
            {submission.logs.map((log) => (
              <div key={log.id} style={{ fontSize: "12px", color: "var(--text-2)", display: "flex", gap: "8px" }}>
                <span style={{ color: "var(--accent)", fontWeight: "600" }}>Shift {log.shift} re-submitted</span>
                <span style={{ color: "var(--text-3)" }}>
                  {log.editedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────── */}
      <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "24px" }}>
        <a href={`/print/${submission.id}`} className="btn-primary" style={{ gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2v5a2 2 0 01-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print / Save PDF
        </a>
        <Link href="/history" className="btn-secondary">← History</Link>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-caps" style={{ marginBottom: "4px", fontSize: "10px" }}>{label}</div>
      <div style={{ fontSize: "15px", color: "var(--text-1)", whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

type OorValue = { id: number; itemId: number; shift: number; partNo: number; valueText: string | null; correctedText: string | null; specLabel: string; minVal: number | null; maxVal: number | null; item: { no: number; opNo: string | null; characteristic: string; inputType: string } };

function CaForm({ submissionId, defaultAction, defaultResolvedBy, oorValues }: {
  submissionId: number;
  defaultAction: string;
  defaultResolvedBy: string;
  oorValues: OorValue[];
}) {
  return (
    <form action={submitCorrectiveAction} style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
      <input type="hidden" name="submissionId" value={submissionId} />
      <div>
        <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Action Taken</label>
        <textarea name="action" defaultValue={defaultAction} rows={2} placeholder="Describe the corrective action taken" className="apple-input" style={{ resize: "vertical", fontFamily: "inherit" }} />
      </div>
      <div>
        <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Resolved By</label>
        <input type="text" name="resolvedBy" defaultValue={defaultResolvedBy} placeholder="Name" className="apple-input" />
      </div>

      {/* OOR 항목별 재측정값 */}
      {oorValues.length > 0 && (
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "8px" }}>Corrected Values (re-measured)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {oorValues.map((v) => (
              <div key={v.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto",
                alignItems: "center", gap: "10px",
                padding: "10px 12px",
                background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px",
              }}>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "2px" }}>
                    #{v.item.no}{v.item.opNo ? ` · ${v.item.opNo}` : ""} — Shift {v.shift} / P#{v.partNo}
                    {v.specLabel ? <span style={{ marginLeft: "6px" }}>· spec: <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{v.specLabel}</span></span> : null}
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-1)", fontWeight: "500" }}>
                    {v.item.characteristic}
                    <span style={{ marginLeft: "8px", fontSize: "12px", fontWeight: "700", color: "var(--danger)" }}>
                      {v.valueText}
                    </span>
                  </div>
                </div>
                <CorrectedValueInput
                  id={v.id}
                  inputType={v.item.inputType}
                  minVal={v.minVal}
                  maxVal={v.maxVal}
                  defaultValue={v.correctedText ?? ""}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button type="submit" className="btn-primary">Save</button>
    </form>
  );
}
