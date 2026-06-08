import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ModelPage({ params }: { params: Promise<{ company: string; lineId: string }> }) {
  if (!(await isAuthenticated())) redirect("/login");
  const { company, lineId: lineIdStr } = await params;

  const line = await prisma.line.findUnique({
    where: { id: Number(lineIdStr) },
    include: {
      company: true,
      models: {
        where: { name: { not: { contains: "(구)" } } },
        include: {
          templateLinks: { include: { template: true } },
          partNumbers: { include: { templateLinks: { include: { template: true } } } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!line || line.company.code !== company) notFound();

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "400px" }}>

        <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}`}>{line.company.name}</Link>
          <span className="breadcrumb-sep">›</span>
          <span style={{ color: "var(--text-1)", fontWeight: "500" }}>Line {line.code}</span>
        </div>

        <div className="fade-up" style={{ marginBottom: "24px" }}>
          <p className="label-caps" style={{ marginBottom: "12px" }}>Select</p>
          <h1 style={{ fontSize: "30px", fontWeight: "700", letterSpacing: "-0.028em", color: "var(--text-1)", lineHeight: "1.1" }}>
            Model
          </h1>
        </div>

        {/* Model list */}
        <div className="fade-up fade-up-1" style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "28px" }}>
          {line.models.map((model, i) => {
            // 진입 가능 판단: 모델 직접 연결 또는 파트넘버에 연결된 템플릿이 하나라도 있으면 활성
            const modelTemplate = model.templateLinks[0]?.template;
            const hasPnTemplate = model.partNumbers.some((pn) => pn.templateLinks.length > 0);
            const active = !!modelTemplate || hasPnTemplate;
            return (
              <Link
                key={model.id}
                href={active ? `/company/${company}/line/${line.id}/model/${model.id}` : "#"}
                className="liquid-glass"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "16px 22px",
                  opacity: active ? 1 : 0.4,
                  animationDelay: `${0.04 + i * 0.03}s`,
                }}
              >
                <div>
                  <div style={{ fontSize: "15px", fontWeight: "600", letterSpacing: "-0.016em", color: "var(--text-1)" }}>
                    {model.name}
                  </div>
                  {!active && (
                    <div className="label-caps" style={{ marginTop: "4px", fontSize: "11px", color: "var(--danger)" }}>
                      No template
                    </div>
                  )}
                </div>
                {active && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                )}
              </Link>
            );
          })}
        </div>

        <div className="fade-up fade-up-2">
          <Link href={`/company/${company}`} style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
            ← Back
          </Link>
        </div>
      </div>
    </div>
  );
}
