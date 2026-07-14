import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linkTemplateToModel, unlinkTemplateFromModel, linkTemplateToPartNumber, unlinkTemplateFromPartNumber } from "@/app/actions";
import TemplatePicker from "./TemplatePicker";

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
        partNumbers: {
          include: { templateLinks: { include: { template: true } } },
        },
      },
    }),
    prisma.checksheetTemplate.findMany({ orderBy: { code: "asc" } }),
  ]);

  if (!model) notFound();

  const modelLinkedIds = new Set(model.templateLinks.map((l) => l.templateId));

  // 모델 레벨에 없는 PN 레벨 링크 존재 여부
  const hasPnOnlyLinks = model.partNumbers.some((pn) =>
    pn.templateLinks.some((tl) => !modelLinkedIds.has(tl.templateId))
  );

  // 아직 어디에도 안 걸린 템플릿 (모델 레벨 추가용 드롭다운)
  const allPnLinkedIds = new Set(model.partNumbers.flatMap((pn) => pn.templateLinks.map((tl) => tl.templateId)));
  const allLinkedIds = new Set([...modelLinkedIds, ...allPnLinkedIds]);
  const unlinkedTemplates = allTemplates.filter((t) => !allLinkedIds.has(t.id));

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

      {/* 모델 레벨 링크 */}
      <p className="ios-section-label">Linked Templates</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "24px" }}>
        {model.templateLinks.length === 0 && !hasPnOnlyLinks && (
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

      {/* 모델 레벨 연결 추가 */}
      {unlinkedTemplates.length > 0 && (
        <>
          <p className="ios-section-label">Link a Template (Model-level)</p>
          <div className="liquid-glass fade-up" style={{ padding: "20px 24px", marginBottom: "28px" }}>
            <form action={linkTemplateToModel} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input type="hidden" name="modelId" value={model.id} />
              <TemplatePicker templates={unlinkedTemplates} />
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

      {/* PN 레벨 연결 */}
      {model.partNumbers.length > 0 && (
        <>
          <p className="ios-section-label">
            Link a Template (Part Number-level)
            <span style={{ fontSize: "11px", fontWeight: "400", color: "var(--text-3)", marginLeft: "8px" }}>
              visible only on selected PN
            </span>
          </p>
          <div className="liquid-glass fade-up" style={{ padding: "20px 24px" }}>
            <form action={linkTemplateToPartNumber} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* 템플릿 선택 */}
              <TemplatePicker templates={allTemplates} />

              {/* PN 다중 선택 (체크박스) */}
              <div>
                <div className="label-caps" style={{ fontSize: "10px", marginBottom: "8px" }}>
                  Apply to part numbers
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {model.partNumbers.map((pn) => (
                    <label key={pn.id} style={{
                      display: "inline-flex", alignItems: "center", gap: "6px",
                      padding: "6px 12px", fontSize: "13px",
                      background: "var(--panel)", border: "1px solid var(--border)",
                      borderRadius: "999px", cursor: "pointer", userSelect: "none",
                    }}>
                      <input type="checkbox" name="partNumberId" value={pn.id} style={{ cursor: "pointer" }} />
                      {pn.code}
                    </label>
                  ))}
                </div>
              </div>

              <button type="submit" style={{
                alignSelf: "flex-start",
                padding: "9px 22px", fontSize: "13px", fontWeight: "600",
                fontFamily: "inherit", color: "#fff",
                background: "var(--accent)", border: "none",
                borderRadius: "8px", cursor: "pointer",
              }}>
                Link
              </button>
            </form>
          </div>

          {/* PN별 현재 링크 현황 — 모델 레벨 중복 제외, PN별로 묶음 */}
          {hasPnOnlyLinks && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
              {model.partNumbers.map((pn) => {
                const pnOnlyTpls = pn.templateLinks.filter((tl) => !modelLinkedIds.has(tl.templateId));
                if (pnOnlyTpls.length === 0) return null;
                return (
                  <div key={pn.id} className="liquid-glass" style={{ padding: "14px 20px", border: "1px dashed var(--border)" }}>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-3)", marginBottom: "10px", letterSpacing: "0.05em" }}>
                      PN: {pn.code}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {pnOnlyTpls.map(({ template }) => (
                        <div key={template.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div>
                            <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-2)" }}>{template.name}</span>
                            <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "8px" }}>{template.code}</span>
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {/* 모델 레벨로 승격 */}
                            <form action={linkTemplateToModel}>
                              <input type="hidden" name="modelId"    value={model.id} />
                              <input type="hidden" name="templateId" value={template.id} />
                              <button type="submit" style={{
                                fontSize: "12px", fontWeight: "600", padding: "5px 10px",
                                background: "var(--accent)", color: "#fff",
                                border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit",
                              }}>↑ Model-level</button>
                            </form>
                            {/* PN 링크 제거 */}
                            <form action={unlinkTemplateFromPartNumber}>
                              <input type="hidden" name="partNumberId" value={pn.id} />
                              <input type="hidden" name="templateId"   value={template.id} />
                              <button type="submit" style={{
                                fontSize: "12px", fontWeight: "500", padding: "5px 10px",
                                background: "rgba(255,59,48,0.08)", color: "var(--danger)",
                                border: "1px solid rgba(255,59,48,0.18)", borderRadius: "8px",
                                cursor: "pointer", fontFamily: "inherit",
                              }}>Remove</button>
                            </form>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
