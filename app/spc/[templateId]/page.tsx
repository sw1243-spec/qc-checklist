import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function SpcTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  if (!(await isAuthenticated())) redirect("/login");
  const { templateId } = await params;
  const tid = Number(templateId);
  if (!Number.isFinite(tid)) notFound();

  const template = await prisma.checksheetTemplate.findUnique({
    where: { id: tid },
    include: {
      items: {
        where: { inputType: "number" }, // SPC는 숫자형만
        orderBy: [{ section: "asc" }, { no: "asc" }],
        include: {
          _count: { select: { values: true } },
        },
      },
    },
  });
  if (!template) notFound();

  // 각 item별 OOR 건수
  const oorCounts = await prisma.checkValue.groupBy({
    by: ["itemId"],
    where: {
      itemId: { in: template.items.map((i) => i.id) },
      isOutOfRange: true,
    },
    _count: { id: true },
  });
  const oorMap = new Map(oorCounts.map((o) => [o.itemId, o._count.id]));

  // 섹션별 그룹
  const sections = [...new Set(template.items.map((i) => i.section))];

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>
      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <Link href="/spc" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← SPC</Link>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)", marginTop: "16px" }}>
          {template.name}
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
          {template.code} · {template.version}
        </p>
      </div>

      {sections.map((section) => {
        const sectionItems = template.items.filter((i) => i.section === section);
        return (
          <div key={section} style={{ marginBottom: "24px" }}>
            <p className="ios-section-label">{section}</p>
            <div className="liquid-glass" style={{ overflow: "hidden" }}>
              {sectionItems.map((item, i) => {
                const oorCount = oorMap.get(item.id) ?? 0;
                return (
                  <Link key={item.id} href={`/spc/${templateId}/${item.id}`} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto auto auto",
                    alignItems: "center", gap: "12px",
                    padding: "12px 18px", textDecoration: "none",
                    borderBottom: i < sectionItems.length - 1 ? "1px solid var(--border-inner)" : "none",
                    background: i % 2 === 0 ? "var(--card)" : "var(--bg)",
                  }}>
                    <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "monospace", fontWeight: "700" }}>
                      #{item.no}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: "500", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.characteristic}
                      </div>
                      {item.unit && (
                        <div style={{ fontSize: "11px", color: "var(--text-3)" }}>({item.unit})</div>
                      )}
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                      {item._count.values} pts
                    </span>
                    {oorCount > 0 && (
                      <span style={{
                        fontSize: "10px", fontWeight: "700", padding: "2px 7px",
                        background: "rgba(255,59,48,0.10)", color: "var(--danger)",
                        border: "1px solid rgba(255,59,48,0.20)", borderRadius: "999px",
                      }}>{oorCount} OOR</span>
                    )}
                    {oorCount === 0 && <span />}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </Link>
                );
              })}
              {sectionItems.length === 0 && (
                <div style={{ padding: "20px", fontSize: "13px", color: "var(--text-3)" }}>No numeric items</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
