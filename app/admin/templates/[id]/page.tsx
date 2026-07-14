import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TemplateEditor from "./TemplateEditor";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");
  const { id } = await params;

  if (!Number.isFinite(Number(id))) notFound();
  const [template, partNumbers] = await Promise.all([
    prisma.checksheetTemplate.findUnique({
      where: { id: Number(id) },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: { specRanges: true },
        },
      },
    }),
    prisma.partNumber.findMany({
      orderBy: { code: "asc" },
      include: { model: { include: { line: { include: { company: true } } } } },
    }),
  ]);

  if (!template) notFound();

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "36px 16px 80px" }}>

      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <Link href="/SWJ/templates">Templates</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>{template.code}</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>{template.code} · {template.version}</p>
        <h1 style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-0.022em", color: "var(--text-1)" }}>
          {template.name}
        </h1>
      </div>

      <TemplateEditor
        templateId={template.id}
        template={{ code: template.code, name: template.name, version: template.version, sampleCount: template.sampleCount, sampleLabels: template.sampleLabels, note: template.note ?? "", responsible: template.responsible ?? "" }}
        items={template.items}
        partNumbers={partNumbers.map(p => ({
          id: p.id,
          label: `${p.model.line.company.name} · ${p.model.name} ${p.code}`,
          groupKey: `${p.model.line.companyId}|${p.model.name}|${p.code}`,
        }))}
      />
    </div>
  );
}
