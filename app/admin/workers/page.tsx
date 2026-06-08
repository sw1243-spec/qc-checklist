import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import WorkerManager from "./WorkerManager";

export default async function WorkersPage() {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  const [workers, companies] = await Promise.all([
    prisma.worker.findMany({
      include: { line: { include: { company: true } } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.company.findMany({
      orderBy: { code: "asc" },
      include: { lines: { orderBy: { code: "asc" } } },
    }),
  ]);

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>
      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>Workers</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>Manage</p>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          Workers
        </h1>
      </div>

      <WorkerManager workers={workers} companies={companies} />
    </div>
  );
}
