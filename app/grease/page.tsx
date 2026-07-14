import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import GreaseChangeForm from "./GreaseChangeForm";

export const dynamic = "force-dynamic";

export default async function GreasePage() {
  if (!(await isAuthenticated())) redirect("/login");

  // 오늘(자정~내일) 범위
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [companies, logs, workers] = await Promise.all([
    prisma.company.findMany({
      orderBy: { code: "asc" },
      include: {
        lines: {
          orderBy: { code: "asc" },
          include: {
            models: {
              orderBy: { name: "asc" },
              include: { partNumbers: { orderBy: { code: "asc" }, select: { id: true, code: true } } },
            },
          },
        },
      },
    }),
    prisma.greaseLog.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      orderBy: { changedAt: "asc" },
    }),
    prisma.worker.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const workerNames = [...new Set(workers.map((w) => w.name))];

  // 클라이언트 직렬화
  const tree = companies.map((c) => ({
    id: c.id, code: c.code, name: c.name,
    lines: c.lines.map((l) => ({
      id: l.id, code: l.code,
      models: l.models.map((m) => ({
        id: m.id, name: m.name,
        partNumbers: m.partNumbers.map((p) => ({ id: p.id, code: p.code })),
      })),
    })),
  }));

  const todayLogs = logs.map((g) => ({
    id: g.id,
    lineId: g.lineId,
    modelId: g.modelId,
    partNumberId: g.partNumberId,
    companyName: g.companyName,
    lineName: g.lineName,
    modelName: g.modelName,
    partNumberCode: g.partNumberCode,
    side: g.side,
    batchCode: g.batchCode,
    operator: g.operator,
    changedAt: g.changedAt.toISOString(),
  }));

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>
      {/* 헤더 */}
      <div className="fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Home</Link>
        <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)", marginTop: "16px" }}>
          Grease Change
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
          Log a grease container change during the run. Time is recorded automatically.
        </p>
      </div>

      <GreaseChangeForm tree={tree} todayLogs={todayLogs} workerNames={workerNames} />
    </div>
  );
}
