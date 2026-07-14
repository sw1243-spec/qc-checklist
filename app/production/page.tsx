import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import PeriodSelector from "../dashboard/PeriodSelector";
import ProductionView, { type MetricPoint } from "./ProductionView";

type Metric = "ib" | "ob" | "weight";

function ymLabel(ym: string) {
  if (ym === "all") return "All";
  if (/^\d{4}$/.test(ym)) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const sp = await searchParams;

  // ── 차트 설정 (관리자 페이지 /SWJ/chart 에서 지정) ──
  // 하드코딩 대신 ChartTemplate(포함 체크시트) + ChartMetric(항목별 측정값/단위) 사용
  const chartTemplates = await prisma.chartTemplate.findMany({ select: { templateId: true } });
  const dailyTemplateIds = chartTemplates.map((t) => t.templateId);

  // 포함된 체크시트에 속한 항목의 측정값 지정만 사용
  const chartMetrics = dailyTemplateIds.length === 0 ? [] : await prisma.chartMetric.findMany({
    where: { item: { templateId: { in: dailyTemplateIds } } },
    select: { itemId: true, metric: true, unit: true },
  });

  // itemId → metric 매핑 (관리자 지정값 그대로)
  const itemMetric = new Map<number, Metric>();
  const unitByMetric: Record<Metric, string> = { ib: "mm", ob: "mm", weight: "g" };
  for (const cm of chartMetrics) {
    if (cm.metric !== "ib" && cm.metric !== "ob" && cm.metric !== "weight") continue;
    const metric = cm.metric as Metric;
    itemMetric.set(cm.itemId, metric);
    if (cm.unit) unitByMetric[metric] = cm.unit;
  }
  const metricItemIds = [...itemMetric.keys()];

  // ── 기간(년-월) 옵션 ──
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ym = sp.ym ?? "all";

  const isYear = /^\d{4}$/.test(ym);
  let dateFilter: { gte?: Date; lt?: Date } = {};
  if (ym !== "all") {
    if (isYear) {
      const y = Number(ym);
      dateFilter = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    } else {
      const [y, m] = ym.split("-").map(Number);
      dateFilter = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }
  }

  const dailySubs = await prisma.submission.findMany({
    where: { templateId: { in: dailyTemplateIds } },
    select: { date: true },
  });
  const ymSet = new Set<string>();
  ymSet.add(currentYm);
  dailySubs.forEach((s) => {
    const d = new Date(s.date);
    ymSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  const years = Array.from(new Set(Array.from(ymSet).map((m) => m.slice(0, 4)))).sort().reverse();
  const yearMonths: string[] = ["all"];
  for (const y of years) {
    yearMonths.push(y);
    yearMonths.push(...Array.from(ymSet).filter((m) => m.startsWith(`${y}-`)).sort().reverse());
  }

  // ── Spec 범위 (메트릭 항목 전체) ──
  const specRanges = await prisma.specRange.findMany({
    where: { itemId: { in: metricItemIds } },
    select: { itemId: true, lineId: true, modelId: true, partNumberId: true, minVal: true, maxVal: true, label: true },
  });

  function resolveSpec(itemId: number, lineId: number, modelId: number | null, pnId: number) {
    const c = specRanges.filter((s) => s.itemId === itemId);
    return (
      c.find((s) => s.partNumberId === pnId) ??
      c.find((s) => s.lineId === lineId && s.modelId === modelId && !s.partNumberId) ??
      c.find((s) => s.lineId === lineId && s.modelId === null && !s.partNumberId) ??
      c.find((s) => s.lineId === null && s.modelId === modelId && !s.partNumberId) ??
      c.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId) ??
      c[0] ?? null
    );
  }

  // ── 측정값 조회 ──
  const values = metricItemIds.length === 0 ? [] : await prisma.checkValue.findMany({
    where: {
      itemId: { in: metricItemIds },
      valueText: { not: null },
      submission: { date: dateFilter, templateId: { in: dailyTemplateIds } },
    },
    select: {
      itemId: true, shift: true, partNo: true, valueText: true, isOutOfRange: true,
      submission: {
        select: {
          date: true,
          partNumberId: true,
          partNumber: {
            select: {
              code: true,
              modelId: true,
              model: { select: { name: true, lineId: true, line: { select: { code: true } } } },
            },
          },
        },
      },
    },
  });

  // sampleLabels: 모두 "1st,Mid,Last" 이므로 partNo→라벨 고정 매핑
  const sampleName = (partNo: number) => (partNo === 1 ? "1st" : partNo === 2 ? "Mid" : "Last");

  const points: MetricPoint[] = [];
  for (const v of values) {
    const metric = itemMetric.get(v.itemId);
    const pn = v.submission.partNumber;
    if (!metric || !pn) continue;
    const num = parseFloat(v.valueText ?? "");
    if (isNaN(num)) continue;

    const spec = resolveSpec(v.itemId, pn.model.lineId, pn.modelId, v.submission.partNumberId!);
    const min = spec?.minVal ?? null;
    const max = spec?.maxVal ?? null;
    const d = new Date(v.submission.date);
    const dateISO = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    points.push({
      metric,
      dateISO,
      pnCode: pn.code,
      model: pn.model.name,
      lineCode: pn.model.line.code,
      sample: sampleName(v.partNo),
      partNo: v.partNo,
      shift: v.shift,
      value: num,
      oor: v.isOutOfRange,
      specMin: min,
      specMax: max,
      specLabel: spec?.label ?? null,
    });
  }

  return (
    <div style={{ maxWidth: "920px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>
      <div className="fade-up" style={{ marginBottom: "24px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <Link href="/dashboard" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Dashboard</Link>
          <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)", marginTop: "16px" }}>
            QC Daily Check Sheet Trend Chart
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
            Daily — Swaging Diameter &amp; Weight trends (1st · Mid · Last)
          </p>
        </div>
        <PeriodSelector
          current={ym}
          options={yearMonths.map((v) => ({ value: v, label: ymLabel(v) }))}
        />
      </div>

      <ProductionView points={points} units={unitByMetric} />
    </div>
  );
}
