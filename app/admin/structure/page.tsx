import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import StructureView from "./StructureView";

export default async function StructurePage() {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      lines: {
        orderBy: { code: "asc" },
        include: {
          models: {
            orderBy: { name: "asc" },
            include: {
              templateLinks: { include: { template: true } },
              partNumbers: {
                orderBy: { code: "asc" },
                include: { templateLinks: { include: { template: true } } },
              },
            },
          },
        },
      },
    },
  });

  // 클라이언트로 넘길 직렬화 가능한 트리 데이터 (templates 포함 — 다이어그램 표시용)
  const tree = companies.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    lines: c.lines.map((l) => ({
      id: l.id,
      code: l.code,
      models: l.models.map((m) => ({
        id: m.id,
        name: m.name,
        templates: m.templateLinks.map((tl) => ({ id: tl.template.id, code: tl.template.code, name: tl.template.name })),
        partNumbers: m.partNumbers.map((pn) => ({
          id: pn.id,
          code: pn.code,
          label: pn.label ?? "",
          templates: pn.templateLinks.map((tl) => ({ id: tl.template.id, code: tl.template.code, name: tl.template.name })),
        })),
      })),
    })),
  }));

  return (
    <div style={{ maxWidth: "820px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>Structure</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "24px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>Architecture</p>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          Structure
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "8px" }}>
          Company → Line → Model → Part Number → Template. Click any name to rename.
        </p>
      </div>

      <StructureView tree={tree} />

      <div style={{ marginTop: "32px" }}>
        <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>← Back</Link>
      </div>
    </div>
  );
}
