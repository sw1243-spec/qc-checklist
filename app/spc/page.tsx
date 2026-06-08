import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function SpcPage() {
  if (!(await isAuthenticated())) redirect("/login");

  // 모든 파트넘버 + 관련 정보
  const partNumbers = await prisma.partNumber.findMany({
    include: {
      template: { select: { id: true, code: true, name: true } },
      model: {
        include: {
          line: { include: { company: true } },
        },
      },
      _count: { select: { submissions: true } },
    },
    orderBy: [
      { model: { line: { company: { code: "asc" } } } },
      { model: { line: { code: "asc" } } },
      { model: { name: "asc" } },
      { code: "asc" },
    ],
  });

  // 파트넘버별 OOR 합계
  const oorByPn = await prisma.checkValue.groupBy({
    by: ["submissionId"],
    where: { isOutOfRange: true },
    _count: { id: true },
  });
  // submissionId → partNumberId 매핑
  const submissions = await prisma.submission.findMany({
    where: { id: { in: oorByPn.map((o) => o.submissionId) } },
    select: { id: true, partNumberId: true },
  });
  const subToPn = new Map(submissions.map((s) => [s.id, s.partNumberId]));
  const oorByPnId = new Map<number, number>();
  oorByPn.forEach((o) => {
    const pnId = subToPn.get(o.submissionId);
    if (pnId) oorByPnId.set(pnId, (oorByPnId.get(pnId) ?? 0) + o._count.id);
  });

  // 회사 → 라인 단위로 그룹
  const grouped = new Map<string, typeof partNumbers>();
  partNumbers.forEach((pn) => {
    const key = `${pn.model.line.company.code} · Line ${pn.model.line.code}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(pn);
  });

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>
      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <Link href="/dashboard" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Dashboard</Link>
        <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)", marginTop: "16px" }}>
          SPC Analysis
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
          Select a Part Number to view process capability of all its measurements.
        </p>
      </div>

      {partNumbers.length === 0 && (
        <div className="liquid-glass" style={{ padding: "32px", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "var(--text-3)" }}>No Part Numbers registered.</p>
        </div>
      )}

      {Array.from(grouped.entries()).map(([groupName, pns]) => (
        <div key={groupName} style={{ marginBottom: "24px" }}>
          <p className="ios-section-label">{groupName}</p>
          <div className="liquid-glass" style={{ overflow: "hidden" }}>
            {pns.map((pn, i) => {
              const oorCount = oorByPnId.get(pn.id) ?? 0;
              return (
                <Link
                  key={pn.id}
                  href={`/spc/pn/${pn.id}`}
                  style={{
                    display: "grid", gridTemplateColumns: "1fr auto auto auto auto",
                    alignItems: "center", gap: "12px",
                    padding: "13px 18px", textDecoration: "none",
                    borderBottom: i < pns.length - 1 ? "1px solid var(--border-inner)" : "none",
                    background: i % 2 === 0 ? "var(--card)" : "var(--bg)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-1)", fontFamily: "monospace" }}>
                      {pn.code}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "2px" }}>
                      {pn.model.name}{pn.template ? ` · ${pn.template.name}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                    {pn._count.submissions} sub
                  </span>
                  {oorCount > 0 ? (
                    <span style={{
                      fontSize: "10px", fontWeight: "700", padding: "2px 7px",
                      background: "rgba(255,59,48,0.10)", color: "var(--danger)",
                      border: "1px solid rgba(255,59,48,0.20)", borderRadius: "999px",
                    }}>{oorCount} OOR</span>
                  ) : (
                    <span style={{
                      fontSize: "10px", fontWeight: "700", padding: "2px 7px",
                      background: "rgba(52,199,89,0.10)", color: "#34C759",
                      border: "1px solid rgba(52,199,89,0.20)", borderRadius: "999px",
                    }}>OK</span>
                  )}
                  <span />
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
