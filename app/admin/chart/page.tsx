import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ChartConfigManager from "./ChartConfigManager";

export default async function AdminChartPage() {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  // 모든 체크시트 + 숫자 항목, 그리고 현재 차트 설정 로드
  const [templates, chartTemplates, chartMetrics] = await Promise.all([
    prisma.checksheetTemplate.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        items: {
          where: { inputType: "number" },
          orderBy: { no: "asc" },
          select: { id: true, no: true, section: true, characteristic: true, unit: true },
        },
      },
    }),
    prisma.chartTemplate.findMany({ select: { templateId: true } }),
    prisma.chartMetric.findMany({ select: { itemId: true, metric: true, unit: true } }),
  ]);

  const includedIds = chartTemplates.map((t) => t.templateId);
  const metrics: Record<number, { metric: string; unit: string | null }> = {};
  for (const m of chartMetrics) metrics[m.itemId] = { metric: m.metric, unit: m.unit };

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>Trend Chart</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>Configuration</p>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          Trend Chart
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "6px" }}>
          Choose which check sheets feed the Trend Chart, then tag each numeric item as IB / OB / Weight.
        </p>
      </div>

      <ChartConfigManager templates={templates} includedIds={includedIds} metrics={metrics} />

      <div style={{ marginTop: "32px" }}>
        <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>← Back</Link>
      </div>
    </div>
  );
}
