import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import TemplateList from "./TemplateList";

export default async function TemplatesPage() {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  const templates = await prisma.checksheetTemplate.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>Templates</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "28px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <p className="label-caps" style={{ marginBottom: "10px" }}>Manage</p>
          <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
            Templates
          </h1>
        </div>
        <Link href="/SWJ/templates/new" style={{
          fontSize: "13px", fontWeight: "600", padding: "9px 16px",
          background: "var(--accent)", color: "#fff",
          borderRadius: "10px", textDecoration: "none",
          whiteSpace: "nowrap",
        }}>
          + New Template
        </Link>
      </div>

      <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "10px" }}>
        Drag the handle to reorder. This order is used on the worker check-sheet selection too.
      </p>
      <TemplateList initial={templates.map((t) => ({ id: t.id, name: t.name, version: t.version, code: t.code, items: t._count.items }))} />

      <div style={{ marginTop: "28px" }}>
        <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>← Back</Link>
      </div>
    </div>
  );
}
