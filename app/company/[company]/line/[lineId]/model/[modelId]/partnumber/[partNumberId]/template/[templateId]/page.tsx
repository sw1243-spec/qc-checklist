import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ company: string; lineId: string; modelId: string; partNumberId: string; templateId: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const { company, lineId, modelId, partNumberId, templateId } = await params;
  if (!Number.isFinite(Number(partNumberId)) || !Number.isFinite(Number(templateId))) notFound();

  const [partNumber, template, shifts] = await Promise.all([
    prisma.partNumber.findUnique({
      where: { id: Number(partNumberId) },
      include: {
        model: { include: { line: { include: { company: true } } } },
      },
    }),
    prisma.checksheetTemplate.findUnique({ where: { id: Number(templateId) } }),
    prisma.shiftConfig.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);
  if (
    !partNumber ||
    !template ||
    partNumber.model.line.company.code !== company ||
    partNumber.model.line.id !== Number(lineId) ||
    partNumber.modelId !== Number(modelId)
  ) notFound();

  const base = `/checklist/${templateId}?lineId=${lineId}&modelId=${modelId}&partNumberId=${partNumberId}`;

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "380px" }}>

        <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}`}>{partNumber.model.line.company.name}</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}/line/${lineId}`}>Line {partNumber.model.line.code}</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}/line/${lineId}/model/${modelId}`}>{partNumber.model.name}</Link>
          <span className="breadcrumb-sep">›</span>
          <Link href={`/company/${company}/line/${lineId}/model/${modelId}/partnumber/${partNumberId}`}>{partNumber.code}</Link>
          <span className="breadcrumb-sep">›</span>
          <span style={{ color: "var(--text-1)", fontWeight: "500", fontSize: "12px" }}>{template.name}</span>
        </div>

        <div className="fade-up" style={{ marginBottom: "28px" }}>
          <p className="label-caps" style={{ marginBottom: "12px" }}>Select</p>
          <h1 style={{ fontSize: "30px", fontWeight: "700", letterSpacing: "-0.028em", color: "var(--text-1)", lineHeight: "1.1" }}>
            Shift
          </h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "28px" }}>
          {(shifts.length > 0 ? shifts : [{ order: 1, name: "1st Shift" }, { order: 2, name: "2nd Shift" }]).map((shift, i) => (
            <Link
              key={shift.order}
              href={`${base}&shift=${shift.order}`}
              className={`liquid-glass fade-up fade-up-${i + 1}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 22px",
              }}
            >
              <div>
                <div style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-0.01em", color: "var(--text-1)" }}>
                  {shift.name}
                </div>
              </div>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          ))}
        </div>

        <div className="fade-up fade-up-3">
          <Link
            href={`/company/${company}/line/${lineId}/model/${modelId}/partnumber/${partNumberId}`}
            style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}
          >
            ← Back
          </Link>
        </div>
      </div>
    </div>
  );
}
