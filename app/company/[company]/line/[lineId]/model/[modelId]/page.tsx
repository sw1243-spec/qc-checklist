import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function PartNumberPage({
  params,
}: {
  params: Promise<{ company: string; lineId: string; modelId: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const { company, lineId, modelId } = await params;
  if (!Number.isFinite(Number(modelId))) notFound();

  const model = await prisma.model.findUnique({
    where: { id: Number(modelId) },
    include: {
      line: { include: { company: true } },
      partNumbers: {
        include: { template: true },
        orderBy: { code: "asc" },
      },
    },
  });
  if (!model || model.line.company.code !== company || model.line.id !== Number(lineId)) notFound();

  // 파트넘버가 없으면 기존 템플릿 플로우로 (Stellantis 등)
  if (model.partNumbers.length === 0) {
    const tmplLink = await prisma.templateModel.findFirst({ where: { modelId: model.id } });
    if (!tmplLink) notFound();
    redirect(`/checklist/${tmplLink.templateId}?lineId=${lineId}&modelId=${modelId}`);
  }

  const base = `/company/${company}/line/${lineId}/model/${modelId}/partnumber`;

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "420px" }}>

        <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}`}>{model.line.company.name}</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}/line/${lineId}`}>Line {model.line.code}</Link>
          <span className="breadcrumb-sep">›</span>
          <span style={{ color: "var(--text-1)", fontWeight: "500" }}>{model.name}</span>
        </div>

        <div className="fade-up" style={{ marginBottom: "28px" }}>
          <p className="label-caps" style={{ marginBottom: "12px" }}>Select</p>
          <h1 style={{ fontSize: "30px", fontWeight: "700", letterSpacing: "-0.028em", color: "var(--text-1)", lineHeight: "1.1" }}>
            Part Number
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "8px" }}>
            {model.partNumbers.length} part number{model.partNumbers.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="fade-up fade-up-1" style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "28px" }}>
          {model.partNumbers.map((pn, i) => (
            <Link
              key={pn.id}
              href={`${base}/${pn.id}`}
              className="liquid-glass"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 22px",
                animationDelay: `${0.04 + i * 0.025}s`,
              }}
            >
              <div>
                <div style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-0.01em", color: "var(--text-1)" }}>
                  {pn.code}
                </div>
                {pn.label && (
                  <div className="label-caps" style={{ marginTop: "3px", fontSize: "10px", color: "var(--text-3)" }}>
                    {pn.label.replace(pn.code, "").replace(/[()]/g, "").trim()}
                  </div>
                )}
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          ))}
        </div>

        <div className="fade-up fade-up-2">
          <Link href={`/company/${company}/line/${lineId}`} style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>
            ← Back
          </Link>
        </div>
      </div>
    </div>
  );
}
