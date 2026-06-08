import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function PartNumberSpcPage({
  params,
}: {
  params: Promise<{ partNumberId: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const { partNumberId } = await params;
  const pnId = Number(partNumberId);
  if (!Number.isFinite(pnId)) notFound();

  const partNumber = await prisma.partNumber.findUnique({
    where: { id: pnId },
    include: {
      model: { include: { line: { include: { company: true } } } },
      template: {
        include: {
          items: {
            where: { inputType: "number" },
            orderBy: [{ section: "asc" }, { no: "asc" }],
            include: { specRanges: true },
          },
        },
      },
    },
  });
  if (!partNumber || !partNumber.template) notFound();

  const tid = partNumber.templateId;
  const items = partNumber.template.items;

  // 이 파트넘버에 대한 모든 측정값
  const values = await prisma.checkValue.findMany({
    where: {
      itemId: { in: items.map((i) => i.id) },
      submission: { partNumberId: pnId },
      valueText: { not: null },
    },
    select: { itemId: true, valueText: true, isOutOfRange: true },
  });

  // 항목별 통계 계산
  const itemStats = items.map((item) => {
    const itemValues = values.filter((v) => v.itemId === item.id);
    const nums = itemValues
      .map((v) => parseFloat(v.valueText ?? ""))
      .filter((n) => !isNaN(n));
    const n = nums.length;
    const oorCount = itemValues.filter((v) => v.isOutOfRange).length;

    // Spec: partNumber 우선, 없으면 line/model/global fallback
    const spec =
      item.specRanges.find((s) => s.partNumberId === pnId) ??
      item.specRanges.find((s) => s.lineId === partNumber.model.lineId && s.modelId === partNumber.modelId && !s.partNumberId) ??
      item.specRanges.find((s) => s.lineId === partNumber.model.lineId && s.modelId === null && !s.partNumberId) ??
      item.specRanges.find((s) => s.lineId === null && s.modelId === partNumber.modelId && !s.partNumberId) ??
      item.specRanges.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId) ??
      item.specRanges[0];

    let usl = spec?.maxVal ?? null;
    let lsl = spec?.minVal ?? null;
    if (usl !== null && lsl !== null && lsl > usl) [usl, lsl] = [lsl, usl];

    const mean = n > 0 ? nums.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const stdev = Math.sqrt(variance);

    let cp: number | null = null, cpk: number | null = null;
    if (stdev > 0) {
      if (usl !== null && lsl !== null) {
        cp = Math.abs(usl - lsl) / (6 * stdev);
        cpk = Math.min((usl - mean) / (3 * stdev), (mean - lsl) / (3 * stdev));
      } else if (usl !== null) {
        cpk = (usl - mean) / (3 * stdev);
      } else if (lsl !== null) {
        cpk = (mean - lsl) / (3 * stdev);
      }
    }

    return { item, n, oorCount, cp, cpk, usl, lsl, mean };
  });

  const sections = [...new Set(items.map((i) => i.section))];

  function cpkColor(cpk: number | null) {
    if (cpk === null) return "var(--text-3)";
    if (cpk >= 1.33) return "#34C759";
    if (cpk >= 1.0) return "#F59E0B";
    return "var(--danger)";
  }
  function cpkLabel(cpk: number | null) {
    if (cpk === null) return "—";
    return cpk.toFixed(2);
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>
      <div className="fade-up" style={{ marginBottom: "20px" }}>
        <Link href="/spc" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← SPC</Link>
        <h1 style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-0.022em", color: "var(--text-1)", marginTop: "14px", fontFamily: "monospace" }}>
          {partNumber.code}
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
          {partNumber.model.line.company.code} · Line {partNumber.model.line.code} · {partNumber.model.name} · {partNumber.template.name}
        </p>
      </div>

      {/* Items list */}
      {sections.map((section) => {
        const sectionStats = itemStats.filter((s) => s.item.section === section);
        return (
          <div key={section} style={{ marginBottom: "20px" }}>
            <p className="ios-section-label">{section}</p>
            <div className="liquid-glass" style={{ overflow: "hidden" }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "26px 1fr 60px 70px 60px 60px 24px",
                gap: "10px", padding: "8px 18px",
                background: "var(--panel)", borderBottom: "1px solid var(--border)",
              }}>
                {["#", "Item", "n", "Spec", "Cp", "Cpk", ""].map((h, i) => (
                  <div key={i} style={{
                    fontSize: "10px", fontWeight: "600", color: "var(--text-3)",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    textAlign: i >= 2 ? "right" : "left",
                  }}>{h}</div>
                ))}
              </div>

              {sectionStats.map((s, i) => (
                <Link
                  key={s.item.id}
                  href={`/spc/${tid}/${s.item.id}?partNumberId=${pnId}`}
                  style={{
                    display: "grid", gridTemplateColumns: "26px 1fr 60px 70px 60px 60px 24px",
                    gap: "10px", padding: "11px 18px", textDecoration: "none",
                    alignItems: "center",
                    borderBottom: i < sectionStats.length - 1 ? "1px solid var(--border-inner)" : "none",
                    background: i % 2 === 0 ? "var(--card)" : "var(--bg)",
                  }}
                >
                  <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "monospace", fontWeight: "700" }}>
                    {s.item.no}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: "500", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.item.characteristic}
                    </div>
                    {s.item.unit && (
                      <div style={{ fontSize: "10px", color: "var(--text-3)" }}>({s.item.unit})</div>
                    )}
                  </div>
                  <span style={{ fontSize: "12px", color: s.n > 0 ? "var(--text-2)" : "var(--text-3)", textAlign: "right" }}>
                    {s.n}
                  </span>
                  <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "monospace", textAlign: "right" }}>
                    {s.lsl !== null || s.usl !== null
                      ? `${s.lsl !== null ? s.lsl.toFixed(2) : "—"}~${s.usl !== null ? s.usl.toFixed(2) : "—"}`
                      : "—"}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: "700", textAlign: "right", color: cpkColor(s.cp) }}>
                    {cpkLabel(s.cp)}
                  </span>
                  <span style={{ fontSize: "13px", fontWeight: "700", textAlign: "right", color: cpkColor(s.cpk) }}>
                    {cpkLabel(s.cpk)}
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {/* Cpk Legend */}
      <div className="fade-up" style={{ fontSize: "11px", color: "var(--text-3)", lineHeight: "1.7", padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", marginTop: "16px" }}>
        <strong style={{ color: "var(--text-2)" }}>Cpk Standard (IATF 16949):</strong>{" "}
        <span style={{ color: "#34C759", fontWeight: "700" }}>≥ 1.33 Capable</span>
        {" · "}
        <span style={{ color: "#F59E0B", fontWeight: "700" }}>≥ 1.00 Marginal</span>
        {" · "}
        <span style={{ color: "var(--danger)", fontWeight: "700" }}>&lt; 1.00 Not Capable</span>
      </div>
    </div>
  );
}
