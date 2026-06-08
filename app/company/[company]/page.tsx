import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function LinePage({ params }: { params: Promise<{ company: string }> }) {
  if (!(await isAuthenticated())) redirect("/login");
  const { company: companyCode } = await params;

  const company = await prisma.company.findUnique({
    where: { code: companyCode },
    include: { lines: { orderBy: { code: "asc" } } },
  });
  if (!company) notFound();

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "380px" }}>

        {/* 뒤로가기 */}
        <div className="fade-up" style={{ marginBottom: "24px" }}>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            color: "var(--accent)", textDecoration: "none",
            fontSize: "15px", fontWeight: "400", letterSpacing: "-0.2px",
          }}>
            <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
              <path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Home
          </Link>
        </div>

        {/* Large Title */}
        <div className="fade-up" style={{ marginBottom: "28px" }}>
          <p className="label-caps" style={{ marginBottom: "10px" }}>{company.name}</p>
          <h1 style={{
            fontSize: "34px", fontWeight: "700",
            letterSpacing: "0.4px", lineHeight: "1.1",
            color: "var(--text-1)",
          }}>
            Line
          </h1>
          <p style={{ fontSize: "15px", color: "var(--text-2)", marginTop: "8px", letterSpacing: "-0.2px" }}>
            {company.lines.length} line{company.lines.length !== 1 ? "s" : ""} available
          </p>
        </div>

        {/* Inset Grouped Grid */}
        {(() => {
          const n = company.lines.length;
          const cols = n <= 3 ? n : 3;
          return (
            <div className="fade-up fade-up-1 liquid-glass" style={{
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              borderRadius: "16px", overflow: "hidden",
              marginBottom: "28px",
            }}>
              {company.lines.map((line, i) => {
                const col = i % cols;
                const totalRows = Math.ceil(n / cols);
                const row = Math.floor(i / cols);
                const isLastRow = row === totalRows - 1;
                const isLastInRow = col === cols - 1 || i === n - 1;
                return (
                  <Link key={line.id} href={`/company/${company.code}/line/${line.id}`} style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    padding: "20px 8px", aspectRatio: "1",
                    background: "transparent",
                    textDecoration: "none",
                    borderRight: !isLastInRow ? "1px solid rgba(255,255,255,0.25)" : "none",
                    borderBottom: !isLastRow ? "1px solid rgba(255,255,255,0.25)" : "none",
                    transition: "opacity 0.15s ease",
                  }}>
                    <div style={{
                      fontSize: line.code.length > 2 ? "15px" : "26px",
                      fontWeight: "700", letterSpacing: "-0.02em",
                      color: "var(--text-1)", textAlign: "center",
                    }}>
                      {line.code}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Line
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
