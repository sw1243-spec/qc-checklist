import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linkTemplateToModel, unlinkTemplateFromModel } from "@/app/actions";

export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");
  const { id } = await params;
  const mid = Number(id);
  if (!Number.isFinite(mid)) notFound();

  const [model, allTemplates] = await Promise.all([
    prisma.model.findUnique({
      where: { id: mid },
      include: {
        line: { include: { company: true } },
        templateLinks: { include: { template: true } },
      },
    }),
    prisma.checksheetTemplate.findMany({ orderBy: { code: "asc" } }),
  ]);

  if (!model) notFound();

  const linkedIds = new Set(model.templateLinks.map((l) => l.templateId));
  const unlinkedTemplates = allTemplates.filter((t) => !linkedIds.has(t.id));

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      {/* Breadcrumb */}
      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <Link href="/SWJ/companies">Customers</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-2)" }}>{model.line.company.name} · Line {model.line.code}</span>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>{model.name}</span>
      </div>

      {/* Title */}
      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>
          {model.line.company.name} · Line {model.line.code}
        </p>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          {model.name}
        </h1>
      </div>

      {/* 연결된 템플릿 */}
      <p className="ios-section-label">Linked Templates</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "24px" }}>
        {model.templateLinks.length === 0 && (
          <div className="liquid-glass" style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "14px", color: "var(--text-3)", fontStyle: "italic" }}>No templates linked yet</p>
          </div>
        )}
        {model.templateLinks.map(({ template }, i) => (
          <div key={template.id} className="liquid-glass fade-up" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", animationDelay: `${0.04 + i * 0.03}s`,
          }}>
            <div>
              <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>{template.name}</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                {template.code} · {template.version}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {/* 편집 링크 */}
              <Link
                href={`/SWJ/templates/${template.id}`}
                style={{
                  fontSize: "12px", fontWeight: "600", padding: "6px 14px",
                  background: "var(--accent)", color: "#fff",
                  borderRadius: "8px", textDecoration: "none",
                }}
              >
                Edit
              </Link>
              {/* 연결 해제 */}
              <form action={unlinkTemplateFromModel}>
                <input type="hidden" name="modelId"    value={model.id} />
                <input type="hidden" name="templateId" value={template.id} />
                <button type="submit" style={{
                  fontSize: "12px", fontWeight: "500", padding: "6px 10px",
                  background: "rgba(255,59,48,0.08)", color: "var(--danger)",
                  border: "1px solid rgba(255,59,48,0.18)", borderRadius: "8px",
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  Unlink
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>

      {/* 템플릿 연결 */}
      {unlinkedTemplates.length > 0 && (
        <>
          <p className="ios-section-label">Link a Template</p>
          <div className="liquid-glass fade-up" style={{ padding: "20px 24px" }}>
            <form action={linkTemplateToModel} style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <input type="hidden" name="modelId" value={model.id} />
              <select name="templateId" required style={{
                flex: 1, minWidth: "180px",
                padding: "9px 12px", fontSize: "14px", fontFamily: "inherit",
                color: "var(--text-1)", background: "var(--panel)",
                border: "1px solid var(--border)", borderRadius: "8px", outline: "none",
              }}>
                <option value="">Select template…</option>
                {unlinkedTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                ))}
              </select>
              <button type="submit" style={{
                padding: "9px 18px", fontSize: "13px", fontWeight: "600",
                fontFamily: "inherit", color: "#fff",
                background: "var(--accent)", border: "none",
                borderRadius: "8px", cursor: "pointer",
              }}>
                Link
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
