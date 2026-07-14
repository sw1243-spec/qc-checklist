import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function CheckSheetSelectPage({
  params,
}: {
  params: Promise<{ company: string; lineId: string; modelId: string; partNumberId: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const { company, lineId, modelId, partNumberId } = await params;
  if (!Number.isFinite(Number(partNumberId))) notFound();

  const partNumber = await prisma.partNumber.findUnique({
    where: { id: Number(partNumberId) },
    include: {
      model: {
        include: {
          line: { include: { company: true } },
          templateLinks: { include: { template: true } }, // 모델 레벨 링크
        },
      },
      templateLinks: { include: { template: true } }, // 파트넘버 레벨 링크
      template: true, // legacy fallback
    },
  });
  if (
    !partNumber ||
    partNumber.model.line.company.code !== company ||
    partNumber.model.line.id !== Number(lineId) ||
    partNumber.modelId !== Number(modelId)
  ) notFound();

  // 모델 레벨 링크 + 파트넘버 레벨 링크 합치기 (중복 제거)
  const seen = new Set<number>();
  const merged: typeof partNumber.templateLinks[0]["template"][] = [];
  for (const tl of [
    ...partNumber.model.templateLinks,
    ...partNumber.templateLinks,
  ]) {
    if (!seen.has(tl.template.id)) {
      seen.add(tl.template.id);
      merged.push(tl.template);
    }
  }

  let templates = merged.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  // 아무 링크도 없으면 legacy templateId fallback
  if (templates.length === 0 && partNumber.template) {
    templates = [partNumber.template];
  }

  if (templates.length === 0) notFound();

  // 체크시트가 1개뿐이면 바로 shift 선택으로 점프
  if (templates.length === 1) {
    redirect(`/company/${company}/line/${lineId}/model/${modelId}/partnumber/${partNumberId}/template/${templates[0].id}`);
  }

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "420px" }}>

        <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}`}>{partNumber.model.line.company.name}</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}/line/${lineId}`}>Line {partNumber.model.line.code}</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}/line/${lineId}/model/${modelId}`}>{partNumber.model.name}</Link>
          <span className="breadcrumb-sep">›</span>
          <span style={{ color: "var(--text-1)", fontWeight: "500" }}>{partNumber.code}</span>
        </div>

        <div className="fade-up" style={{ marginBottom: "28px" }}>
          <p className="label-caps" style={{ marginBottom: "12px" }}>Select</p>
          <h1 style={{ fontSize: "30px", fontWeight: "700", letterSpacing: "-0.028em", color: "var(--text-1)", lineHeight: "1.1" }}>
            Check Sheet
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "8px" }}>
            {templates.length} check sheet{templates.length !== 1 ? "s" : ""} available
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "28px" }}>
          {templates.map((t, i) => (
            <Link
              key={t.id}
              href={`/company/${company}/line/${lineId}/model/${modelId}/partnumber/${partNumberId}/template/${t.id}`}
              className="liquid-glass"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 22px", textDecoration: "none",
                animationDelay: `${0.04 + i * 0.025}s`,
              }}
            >
              <div>
                <div style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-0.01em", color: "var(--text-1)" }}>
                  {t.name}
                </div>
                <div style={{ marginTop: "5px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span className="label-caps" style={{ fontSize: "10px", color: "var(--text-3)" }}>{t.code} · {t.version}</span>
                  {t.responsible && t.responsible.split(",").filter(Boolean).map((p) => {
                    const isQC = p === "QC";
                    return (
                      <span key={p} style={{
                        fontSize: "9px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px",
                        background: isQC ? "rgba(125,155,118,0.18)" : "rgba(107,140,174,0.18)",
                        color: isQC ? "#5a7a52" : "#4a6a8e",
                      }}>{isQC ? "Quality" : "Production"}</span>
                    );
                  })}
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          ))}
        </div>

        <Link
          href={`/company/${company}/line/${lineId}/model/${modelId}`}
          style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}
        >
          ← Back
        </Link>
      </div>
    </div>
  );
}
