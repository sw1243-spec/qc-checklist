import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
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
      correctiveAction: true,
      values: {
        include: { item: { include: { specRanges: true } } },
        orderBy: [{ item: { sortOrder: "asc" } }, { partNo: "asc" }],
      },
    },
  });
  if (!submission) notFound();

  const sampleLabels  = submission.template.sampleLabels.split(",");
  const shift         = submission.values[0]?.shift ?? 1;
  const vals          = submission.values.filter((v) => v.shift === shift);
  const partNumberId  = submission.partNumberId ?? undefined;

  type SpecLike = { partNumberId: number | null; lineId: number | null; modelId: number | null; label: string | null; minVal: number | null; maxVal: number | null };
  function getSpec(item: { specRanges: SpecLike[] }): SpecLike | null {
    const sr = item.specRanges;
    return (
      (partNumberId ? sr.find((s) => s.partNumberId === partNumberId) : null) ??
      sr.find((s) => !s.partNumberId && s.lineId === submission!.lineId && s.modelId === submission!.modelId) ??
      sr.find((s) => !s.partNumberId && s.lineId === submission!.lineId && s.modelId === null) ??
      sr.find((s) => !s.partNumberId && s.lineId === null && s.modelId === submission!.modelId) ??
      sr.find((s) => !s.partNumberId && s.lineId === null && s.modelId === null) ??
      null
    );
  }
  function getSpecLabel(item: { specRanges: SpecLike[]; inputType: string }): string {
    const spec = getSpec(item);
    if (!spec) return item.inputType === "ok_ng" ? "OK / Not OK" : "—";
    const hasRange = spec.minVal !== null || spec.maxVal !== null;
    if (hasRange) {
      const sep = spec.minVal !== null && spec.maxVal !== null ? " ~ " : "";
      const unit = (item as { unit?: string | null }).unit;
      const range = `${spec.minVal ?? ""}${sep}${spec.maxVal ?? ""}${unit ? ` ${unit}` : ""}`;
      return spec.label ? `${range}  ·  ${spec.label}` : range;
    }
    if (spec.label) return spec.label;
    return item.inputType === "ok_ng" ? "OK / Not OK" : "—";
  }
  // 재측정값 합격 판정
  function correctedStatus(inputType: string, spec: SpecLike | null, text: string | null): "pass" | "fail" | null {
    if (!text) return null;
    if (inputType === "ok_ng") return text.trim().toUpperCase() === "OK" ? "pass" : "fail";
    const num = parseFloat(text);
    if (isNaN(num)) return null;
    if (spec?.minVal != null && num < spec.minVal) return "fail";
    if (spec?.maxVal != null && num > spec.maxVal) return "fail";
    return "pass";
  }

  const getVal = (itemId: number, partNo: number) =>
    vals.find((v) => v.itemId === itemId && v.partNo === partNo)?.valueText ?? "";
  const isOor = (itemId: number, partNo: number) =>
    vals.find((v) => v.itemId === itemId && v.partNo === partNo)?.isOutOfRange ?? false;
  const getCorrected = (itemId: number, partNo: number) =>
    vals.find((v) => v.itemId === itemId && v.partNo === partNo)?.correctedText ?? "";

  const items    = [...new Map(vals.map((v) => [v.itemId, v.item])).values()].sort((a, b) => a.no - b.no);
  const sections = [...new Set(items.map((i) => i.section))];

  const leVal  = shift === 1 ? submission.shift1LE : shift === 2 ? submission.shift2LE : (submission.shift3LE ?? null);
  const qcVal  = shift === 1 ? submission.shift1QC : shift === 2 ? submission.shift2QC : (submission.shift3QC ?? null);
  const svVal  = shift === 1 ? submission.shift1SV : shift === 2 ? submission.shift2SV : (submission.shift3SV ?? null);
  const dateStr = submission.date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  const printedAt = new Date().toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const ca = submission.correctiveAction;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* 프린트 페이지에서 ambient glow 숨김 */
        .ambient-glow { display: none !important; }

        @page {
          size: 17in 11in landscape;
          margin: 0.45in 0.5in;
        }

        html, body {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: 9pt;
          color: #111111;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media screen {
          body { background: #f2f2f7; padding: 20px 12px 80px; }
          .page {
            max-width: 16in;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            border: 1px solid #e6e6e6;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05), 0 16px 48px rgba(0,0,0,0.06);
            padding: 0.5in 0.55in 0.45in;
            overflow-x: auto;
          }
          .print-btn {
            position: fixed; bottom: 20px; right: 16px;
            display: inline-flex; align-items: center; gap: 7px;
            background: #111111; color: #fff;
            border: none; border-radius: 9999px;
            padding: 11px 22px;
            font-family: inherit; font-size: 13px; font-weight: 600;
            cursor: pointer; text-decoration: none; z-index: 100;
            transition: opacity 0.18s ease;
          }
          .print-btn:hover { opacity: 0.82; }
        }

        @media screen and (max-width: 768px) {
          body { padding: 12px 0 80px; }
          .page {
            border-radius: 12px;
            padding: 16px 12px;
            font-size: 8pt;
          }
          table { min-width: 600px; }
        }

        @media print {
          html, body { background: #fff; }
          .page { padding: 0; }
          .no-print { display: none !important; }
        }

        /* ── Document header ── */
        .doc-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 10px;
          border-bottom: 2px solid #111111;
          margin-bottom: 0;
        }
        .doc-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .doc-logo img {
          height: 36px;
          width: auto;
        }
        .doc-logo-text {
          font-size: 8pt;
          font-weight: 700;
          color: #111111;
          letter-spacing: 0.04em;
          line-height: 1.2;
        }
        .doc-logo-text .sub {
          font-size: 6.5pt;
          font-weight: 500;
          color: #6B6B6B;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .doc-title {
          font-size: 14pt;
          font-weight: 700;
          letter-spacing: -0.025em;
          color: #111111;
          text-align: center;
          flex: 1;
        }
        .doc-version {
          font-size: 8.5pt;
          font-weight: 500;
          color: #6B6B6B;
          letter-spacing: 0.01em;
          text-align: right;
          min-width: 80px;
        }

        /* ── Meta info: horizontal document-style rows ── */
        .meta-row {
          display: grid;
          border-bottom: 1px solid #e6e6e6;
        }
        .meta-row.cols-6 { grid-template-columns: repeat(6, 1fr); }
        .meta-row.cols-2 { grid-template-columns: 1fr 1fr; }
        .meta-row.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
        .meta-cell {
          padding: 7px 12px;
          border-right: 1px solid #e6e6e6;
        }
        .meta-cell:last-child { border-right: none; }
        .meta-cell.span2 { grid-column: span 2; }
        .meta-cell.span3 { grid-column: span 3; }
        .meta-lbl {
          font-size: 6.5pt;
          font-weight: 600;
          color: #9B9B98;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 2px;
        }
        .meta-val {
          font-size: 9pt;
          font-weight: 500;
          color: #111111;
        }
        .meta-val.empty { color: #C7C7C5; font-style: italic; font-weight: 400; }

        /* ── Table ── */
        .table-wrap {
          border: 1px solid #e6e6e6;
          border-top: none;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        thead tr { background: #111111; }
        thead th {
          padding: 7px 10px;
          font-size: 7pt;
          font-weight: 600;
          color: rgba(255,255,255,0.8);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-right: 1px solid rgba(255,255,255,0.07);
          text-align: center;
          white-space: nowrap;
        }
        thead th.th-left { text-align: left; }
        thead th:last-child { border-right: none; }

        /* Section rows */
        tr.sec-row td {
          background: #f2f2f7;
          color: #6B6B6B;
          font-size: 7pt;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 5px 12px;
          border-bottom: 1px solid #e6e6e6;
        }

        /* Data rows */
        tbody tr { border-bottom: 1px solid #e6e6e6; }
        tbody tr:last-child { border-bottom: none; }
        tbody tr.even { background: #FAFAF9; }
        tbody tr.odd  { background: #ffffff; }

        tbody td {
          padding: 7px 10px;
          font-size: 8.5pt;
          color: #111111;
          border-right: 1px solid #e6e6e6;
          vertical-align: middle;
        }
        tbody td:last-child { border-right: none; }

        td.td-no {
          text-align: center;
          font-size: 7.5pt;
          font-weight: 500;
          color: #9B9B98;
          width: 28px;
        }
        td.td-op {
          text-align: center;
          font-size: 7.5pt;
          font-weight: 700;
          color: #0088ff;
          font-family: monospace;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        td.td-item { font-weight: 500; line-height: 1.35; }
        td.td-item .unit { font-size: 6.5pt; color: #9B9B98; margin-left: 3px; }
        td.td-spec { text-align: center; font-size: 7.5pt; color: #6B6B6B; }
        td.td-method { text-align: center; font-size: 7pt; color: #9B9B98; }
        td.td-val {
          text-align: center; font-size: 9pt; font-weight: 400;
          min-width: 56px; color: #111111;
        }
        td.td-val.oor {
          color: #ff3b30; font-weight: 700;
          background: rgba(186,26,26,0.04);
        }
        td.td-val .empty-dash { color: #C7C7C5; font-weight: 300; }

        /* ── Footer ── */
        .doc-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid #e6e6e6;
        }
        .doc-footer-warn {
          font-size: 7.5pt; font-weight: 600; color: #ff3b30;
          display: flex; align-items: center; gap: 5px;
        }
        .doc-footer-info {
          font-size: 7pt; color: #C7C7C5; letter-spacing: 0.01em;
        }
      `}</style>

      {/* 버튼 영역 */}
      <div className="no-print" style={{ position: "fixed", top: "16px", left: "16px", right: "16px", display: "flex", justifyContent: "space-between", zIndex: 100 }}>
        <a href={`/submission/${submission.id}`} style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "8px 16px", borderRadius: "9999px",
          background: "rgba(0,0,0,0.06)", color: "#444",
          textDecoration: "none", fontSize: "13px", fontWeight: "500",
        }}>
          ← Back
        </a>
        <a className="print-btn" href="javascript:window.print()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print / Save PDF
        </a>
      </div>

      <div className="page">

        {/* Title row with logo */}
        <div className="doc-title-row">
          <div className="doc-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="Hansae Mobility" />
            <div className="doc-logo-text">
              HANSAE MOBILITY
              <div className="sub">USA Pontiac</div>
            </div>
          </div>
          <span className="doc-title">{submission.template.name}</span>
          <span className="doc-version">{submission.template.version}</span>
        </div>

        {/* Meta: company / line / model / date / shift */}
        <div className="meta-row cols-6">
          <div className="meta-cell">
            <div className="meta-lbl">Company</div>
            <div className="meta-val">{submission.companyName ?? submission.line.company.name}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-lbl">Line</div>
            <div className="meta-val">{submission.lineName ?? submission.line.code}</div>
          </div>
          <div className="meta-cell span2">
            <div className="meta-lbl">Model / Part #</div>
            <div className="meta-val">
              {submission.modelName ?? submission.model?.name ?? "-"}
              {submission.partNumberBuild && (
                <span style={{ fontWeight: 400, color: "rgba(60,60,67,0.6)", marginLeft: "6px" }}>
                  {submission.partNumberBuild}
                </span>
              )}
            </div>
          </div>
          <div className="meta-cell">
            <div className="meta-lbl">Date</div>
            <div className="meta-val">{dateStr}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-lbl">Shift</div>
            <div className="meta-val">Shift {shift}</div>
          </div>
        </div>

        {/* Signatures */}
        <div className="meta-row cols-3" style={{ marginBottom: "0" }}>
          <div className="meta-cell">
            <div className="meta-lbl">Line Leader Sign</div>
            <div className={`meta-val${leVal ? "" : " empty"}`}>{leVal || "—"}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-lbl">QC Inspector Sign</div>
            <div className={`meta-val${qcVal ? "" : " empty"}`}>{qcVal || "—"}</div>
          </div>
          <div className="meta-cell">
            <div className="meta-lbl">QC Supervisor Sign</div>
            <div className={`meta-val${svVal ? "" : " empty"}`}>{svVal || "—"}</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "26px" }}>No.</th>
                <th style={{ width: "56px" }}>OP</th>
                <th className="th-left" style={{ width: "27%" }}>Measuring Item</th>
                <th style={{ width: "14%" }}>Specification</th>
                <th style={{ width: "10%" }}>Method</th>
                {sampleLabels.map((label, i) => (
                  <th key={label}>
                    {label}
                    {i === sampleLabels.length - 1 && (
                      <div style={{ fontSize: "6pt", fontWeight: 500, textTransform: "none", letterSpacing: "0.02em", marginTop: "1px", opacity: 0.7 }}>
                        (Change Over)
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => {
                const sectionItems = items.filter((item) => item.section === section);
                return (
                  <>
                    <tr key={`sec-${section}`} className="sec-row">
                      <td colSpan={5 + sampleLabels.length}>{section}</td>
                    </tr>
                    {sectionItems.map((item, idx) => (
                      <tr key={item.id} className={idx % 2 === 0 ? "odd" : "even"}>
                        <td className="td-no">{item.no}</td>
                        <td className="td-op">{item.opNo ?? "—"}</td>
                        <td className="td-item">
                          {item.characteristic}
                          {item.unit && <span className="unit">({item.unit})</span>}
                        </td>
                        <td className="td-spec">{getSpecLabel(item)}</td>
                        <td className="td-method">{item.method ?? "—"}</td>
                        {sampleLabels.map((_, si) => {
                          const partNo = si + 1;
                          const v   = getVal(item.id, partNo);
                          const oor = isOor(item.id, partNo);
                          const corrected = getCorrected(item.id, partNo);
                          const cstatus = corrected ? correctedStatus(item.inputType, getSpec(item), corrected) : null;
                          return (
                            <td key={partNo} className={`td-val${oor && !corrected ? " oor" : ""}`}>
                              {oor && corrected ? (
                                <span style={{ display: "inline-flex", alignItems: "baseline", gap: "4px", justifyContent: "center" }}>
                                  <span style={{ textDecoration: "line-through", opacity: 0.5 }}>{v}</span>
                                  <span style={{ fontWeight: 700, color: cstatus === "fail" ? "#C0241A" : "#1A7A37" }}>
                                    {corrected}{cstatus === "fail" ? " ✕" : cstatus === "pass" ? " ✓" : ""}
                                  </span>
                                </span>
                              ) : (
                                v || <span className="empty-dash">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Corrective Action (if any) */}
        {ca && (ca.action || ca.resolvedBy) && (
          <div style={{
            marginTop: "10px",
            border: "1px solid #e6e6e6",
            borderTop: "2px solid #34C759",
            background: "#FAFAF9",
          }}>
            <div style={{
              padding: "4px 12px",
              background: "#34C759",
              color: "#fff",
              fontSize: "7pt", fontWeight: "700",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              Corrective Action
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", borderTop: "1px solid #e6e6e6" }}>
              <div style={{ padding: "7px 12px", borderRight: "1px solid #e6e6e6" }}>
                <div style={{ fontSize: "6.5pt", fontWeight: "600", color: "#9B9B98", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Action Taken</div>
                <div style={{ fontSize: "8.5pt", color: "#111" }}>{ca.action || "—"}</div>
              </div>
              <div style={{ padding: "7px 12px" }}>
                <div style={{ fontSize: "6.5pt", fontWeight: "600", color: "#9B9B98", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "2px" }}>Resolved By</div>
                <div style={{ fontSize: "8.5pt", color: "#111" }}>{ca.resolvedBy || "—"}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="doc-footer">
          <div>
            {submission.hasOutOfRange && !ca && (
              <div className="doc-footer-warn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Out-of-range values detected — report to Maintenance / Production Supervisor
              </div>
            )}
          </div>
          <div className="doc-footer-info">
            {submission.template.code} · {submission.template.version} · #{submission.id} · {dateStr}
            <span style={{ marginLeft: "10px", opacity: 0.7 }}>Printed: {printedAt}</span>
          </div>
        </div>

      </div>
    </>
  );
}
