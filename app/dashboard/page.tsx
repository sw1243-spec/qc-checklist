import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TrendChart, PassRateChart, DonutChart } from "./DashboardCharts";
import PeriodSelector from "./PeriodSelector";

function ymLabel(ym: string) {
  if (ym === "all") return "All";
  if (/^\d{4}$/.test(ym)) return ym; // 연도 전체 (e.g. "2026")
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string; ym?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const sp = await searchParams;

  // 이전 호환: months 파라미터도 지원, 우선 ym 사용
  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ym = sp.ym ?? "all";

  // 날짜 범위 계산 (all / 연도 / 년-월)
  const isYear = /^\d{4}$/.test(ym);
  let dateFilter: { gte?: Date; lt?: Date } = {};
  if (ym !== "all") {
    if (isYear) {
      const y = Number(ym);
      dateFilter = { gte: new Date(y, 0, 1, 0, 0, 0, 0), lt: new Date(y + 1, 0, 1, 0, 0, 0, 0) };
    } else {
      const [y, m] = ym.split("-").map(Number);
      dateFilter = { gte: new Date(y, m - 1, 1, 0, 0, 0, 0), lt: new Date(y, m, 1, 0, 0, 0, 0) };
    }
  }

  // 드롭다운 옵션: All → 연도 → 해당 연도의 월 (내림차순)
  const allSubs = await prisma.submission.findMany({ select: { date: true } });
  const ymSet = new Set<string>();
  ymSet.add(currentYm); // 현재 달은 항상 포함
  allSubs.forEach((s) => {
    const d = new Date(s.date);
    ymSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  const years = Array.from(new Set(Array.from(ymSet).map((m) => m.slice(0, 4)))).sort().reverse();
  const yearMonths: string[] = ["all"];
  for (const y of years) {
    yearMonths.push(y); // 연도 전체
    const months = Array.from(ymSet).filter((m) => m.startsWith(`${y}-`)).sort().reverse();
    yearMonths.push(...months);
  }

  const [
    totalCount,
    oorCount,
    unresolvedCount,
    lineStats,
    lineOorStats,
    recentOor,
    rawTrend,
    topOorItems,
    lastSubmissions,
    shiftOorRaw,
    resolvedCa,
  ] = await Promise.all([
    // 전체 제출 수
    prisma.submission.count({ where: { date: dateFilter } }),

    // OOR 제출 수
    prisma.submission.count({ where: { date: dateFilter, hasOutOfRange: true } }),

    // 미처리 OOR
    prisma.submission.count({
      where: { date: dateFilter, hasOutOfRange: true, correctiveAction: null },
    }),

    // 라인별 통계 (total)
    prisma.submission.groupBy({
      by: ["lineId"],
      where: { date: dateFilter },
      _count: { id: true },
    }),

    // 라인별 OOR 수
    prisma.submission.groupBy({
      by: ["lineId"],
      where: { date: dateFilter, hasOutOfRange: true },
      _count: { id: true },
    }),

    // 최근 미처리 OOR 5건
    prisma.submission.findMany({
      where: { date: dateFilter, hasOutOfRange: true, correctiveAction: null },
      include: { line: { include: { company: true } }, model: true },
      orderBy: { date: "desc" },
      take: 5,
    }),

    // 트렌드용 날짜별 raw 데이터
    prisma.submission.findMany({
      where: { date: dateFilter },
      select: { date: true, hasOutOfRange: true },
      orderBy: { date: "asc" },
    }),

    // OOR 많은 항목 Top 7
    prisma.checkValue.groupBy({
      by: ["itemId"],
      where: {
        isOutOfRange: true,
        submission: { date: dateFilter },
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 7,
    }),

    // 라인별 마지막 제출일
    prisma.submission.groupBy({
      by: ["lineId"],
      where: { date: dateFilter },
      _max: { date: true },
    }),

    // Shift별 OOR/Total 집계용 raw 데이터
    prisma.checkValue.groupBy({
      by: ["shift", "isOutOfRange"],
      where: {
        submission: { date: dateFilter },
      },
      _count: { id: true },
    }),

    // Resolution time 계산용: OOR이 있고 시정조치 등록된 submission들
    prisma.submission.findMany({
      where: {
        date: dateFilter,
        hasOutOfRange: true,
        correctiveAction: { isNot: null },
      },
      select: {
        createdAt: true,
        correctiveAction: { select: { createdAt: true } },
      },
    }),
  ]);

  // 라인 정보 조회
  const lineIds = lineStats.map((s) => s.lineId);
  const lines = await prisma.line.findMany({
    where: { id: { in: lineIds } },
    include: { company: true },
  });

  // Top OOR 항목 이름 조회
  const oorItemIds = topOorItems.map((i) => i.itemId);
  const oorItemDetails = await prisma.checkItem.findMany({
    where: { id: { in: oorItemIds } },
    select: { id: true, no: true, opNo: true, characteristic: true },
  });

  // 전체 라인 목록 (제출 없는 라인 포함)
  const allLines = await prisma.line.findMany({ include: { company: true }, orderBy: [{ company: { code: "asc" } }, { code: "asc" }] });

  const passRate = totalCount > 0 ? Math.round(((totalCount - oorCount) / totalCount) * 100) : 100;

  const lineRows = lineStats
    .map((s) => {
      const line = lines.find((l) => l.id === s.lineId);
      const total = s._count.id;
      const oor = lineOorStats.find((o) => o.lineId === s.lineId)?._count.id ?? 0;
      return { line, total, oor, rate: total > 0 ? Math.round((oor / total) * 100) : 0 };
    })
    .sort((a, b) => b.oor - a.oor);

  // 트렌드: 특정 달 → 일별, All/연도 → 월별
  const aggregateByMonth = ym === "all" || isYear;
  const trendMap = new Map<string, { total: number; oor: number }>();
  rawTrend.forEach((s) => {
    const d = new Date(s.date);
    const key = aggregateByMonth
      ? d.toLocaleDateString("en-US", { year: "2-digit", month: "short" }) // "May '26"
      : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const prev = trendMap.get(key) ?? { total: 0, oor: 0 };
    trendMap.set(key, { total: prev.total + 1, oor: prev.oor + (s.hasOutOfRange ? 1 : 0) });
  });
  const trendData = Array.from(trendMap.entries()).map(([date, v]) => ({ date, ...v }));

  // 라인 바 차트 데이터
  const lineBarData = lineRows.map((r) => ({
    line: r.line ? `${r.line.company.code} · ${r.line.code}` : "Unknown",
    total: r.total,
    oor: r.oor,
    rate: r.rate,
    passRate: r.total > 0 ? Math.round(((r.total - r.oor) / r.total) * 100) : 100,
  }));

  // Top OOR 항목 데이터
  const topOorData = topOorItems.map((i) => {
    const detail = oorItemDetails.find((d) => d.id === i.itemId);
    return {
      label: detail ? `#${detail.no} ${detail.characteristic}` : `Item ${i.itemId}`,
      count: i._count.id,
    };
  });

  // 라인별 마지막 제출일 맵
  const lastSubmitMap = new Map(lastSubmissions.map((s) => [s.lineId, s._max.date]));

  // Shift별 OOR/Total 집계
  type ShiftData = { shift: number; total: number; oor: number; oorRate: number };
  const shiftMap = new Map<number, { total: number; oor: number }>();
  shiftOorRaw.forEach((row) => {
    const prev = shiftMap.get(row.shift) ?? { total: 0, oor: 0 };
    prev.total += row._count.id;
    if (row.isOutOfRange) prev.oor += row._count.id;
    shiftMap.set(row.shift, prev);
  });
  const shiftData: ShiftData[] = Array.from(shiftMap.entries())
    .map(([shift, v]) => ({
      shift,
      total: v.total,
      oor: v.oor,
      oorRate: v.total > 0 ? Math.round((v.oor / v.total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.shift - b.shift);

  // Resolution time (평균 시간, 분 단위)
  const resolutionMs = resolvedCa
    .map((s) => {
      if (!s.correctiveAction) return null;
      return s.correctiveAction.createdAt.getTime() - s.createdAt.getTime();
    })
    .filter((v): v is number => v !== null && v > 0);

  const avgResolutionMs = resolutionMs.length > 0
    ? resolutionMs.reduce((a, b) => a + b, 0) / resolutionMs.length
    : null;
  const medianResolutionMs = resolutionMs.length > 0
    ? (() => {
        const sorted = [...resolutionMs].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      })()
    : null;

  function formatDuration(ms: number | null): string {
    if (ms === null) return "—";
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const hrs = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    if (hrs < 24) return `${hrs}h ${min}m`;
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h`;
  }

  const resolvedCount = resolvedCa.length;
  const resolutionRate = oorCount > 0 ? Math.round((resolvedCount / oorCount) * 100) : 100;

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>

      {/* Header */}
      <div className="fade-up" style={{ marginBottom: "28px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <Link href="/" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Home</Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px" }}>
            <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
              Dashboard
            </h1>
            <Link href="/spc" style={{
              fontSize: "12px", fontWeight: "600", padding: "5px 12px",
              background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: "8px", color: "var(--accent)", textDecoration: "none",
            }}>
              SPC Analysis →
            </Link>
            <Link href="/production" style={{
              fontSize: "12px", fontWeight: "600", padding: "5px 12px",
              background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: "8px", color: "var(--accent)", textDecoration: "none",
            }}>
              Trend Chart →
            </Link>
          </div>
        </div>
        {/* Period dropdown */}
        <PeriodSelector
          current={ym}
          options={yearMonths.map((v) => ({ value: v, label: ymLabel(v) }))}
        />
      </div>

      {/* Stats row */}
      <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "24px" }}>
        <StatCard label="Total" value={String(totalCount)} />
        <StatCard label="Pass Rate" value={`${passRate}%`} accent={passRate < 90 ? "danger" : "ok"} />
        <StatCard label="OOR" value={String(oorCount)} accent={oorCount > 0 ? "warn" : undefined} />
        <StatCard label="Unresolved" value={String(unresolvedCount)} accent={unresolvedCount > 0 ? "danger" : undefined} />
      </div>

      {/* Charts row */}
      <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
        {/* Donut + OOR by Shift + Resolution KPIs */}
        <div className="liquid-glass" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <p style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Pass / OOR Ratio</p>
            <DonutChart pass={totalCount - oorCount} oor={oorCount} />
          </div>

          <div style={{ borderTop: "1px solid var(--border-inner)", paddingTop: "14px" }}>
            <p style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>OOR by Shift</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {shiftData.length === 0 ? (
                <p style={{ fontSize: "13px", color: "var(--text-3)" }}>No data</p>
              ) : shiftData.map((s) => (
                <div key={s.shift}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-1)" }}>
                      Shift {s.shift}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                      {s.oor} / {s.total}
                      <span style={{ marginLeft: "8px", fontWeight: "700", color: s.oorRate === 0 ? "#34C759" : s.oorRate > 10 ? "var(--danger)" : "#F59E0B" }}>
                        {s.oorRate}%
                      </span>
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "var(--panel)", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.max(s.oorRate, s.oor > 0 ? 4 : 0)}%`,
                      background: s.oorRate === 0 ? "#34C759" : s.oorRate > 10 ? "var(--danger)" : "#F59E0B",
                      borderRadius: "99px",
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-inner)", paddingTop: "14px" }}>
            <p style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>OOR Resolution</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: resolutionRate === 100 ? "#34C759" : resolutionRate >= 80 ? "var(--text-1)" : "#F59E0B" }}>
                  {oorCount > 0 ? `${resolutionRate}%` : "—"}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", marginTop: "2px" }}>
                  Resolved Rate
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "2px" }}>
                  {resolvedCount} / {oorCount}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-1)" }}>
                  {formatDuration(avgResolutionMs)}
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.05em", textTransform: "uppercase", marginTop: "2px" }}>
                  Avg Resolution
                </div>
                <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "2px" }}>
                  Median: {formatDuration(medianResolutionMs)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="liquid-glass" style={{ padding: "20px" }}>
          <p style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "14px" }}>Pass Rate by Line</p>
          <PassRateChart data={lineBarData} />
        </div>
      </div>

      {/* Trend */}
      <p className="ios-section-label">Trend</p>
      <div className="liquid-glass fade-up" style={{ padding: "20px", marginBottom: "24px" }}>
        <TrendChart data={trendData} />
      </div>

      {/* Performance by Line (table) */}
      <p className="ios-section-label">Performance by Line</p>
      <div className="liquid-glass fade-up" style={{ marginBottom: "24px", overflow: "hidden" }}>
        {lineRows.length === 0 && (
          <div style={{ padding: "20px", fontSize: "14px", color: "var(--text-3)" }}>No data</div>
        )}
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: "110px 1fr 52px 52px 52px",
          gap: "10px", padding: "8px 20px",
          background: "var(--panel)", borderBottom: "1px solid var(--border)",
        }}>
          {["Line", "", "Total", "OOR", "Pass"].map((h, i) => (
            <div key={i} style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: i >= 2 ? "right" : "left" }}>{h}</div>
          ))}
        </div>
        {lineRows.map((row, i) => (
          <div key={row.line?.id ?? i} style={{
            display: "grid", gridTemplateColumns: "110px 1fr 52px 52px 52px",
            alignItems: "center", gap: "10px",
            padding: "12px 20px",
            borderBottom: i < lineRows.length - 1 ? "1px solid var(--border-inner)" : "none",
            background: i % 2 === 0 ? "var(--card)" : "var(--bg)",
          }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-1)" }}>
              {row.line ? `${row.line.company.code} · ${row.line.code}` : "Unknown"}
            </div>
            {/* Pass rate bar */}
            <div style={{ position: "relative", height: "6px", background: "var(--panel)", borderRadius: "99px", overflow: "hidden" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${row.total > 0 ? Math.round(((row.total - row.oor) / row.total) * 100) : 100}%`,
                background: row.oor === 0 ? "#34C759" : row.oor / row.total > 0.2 ? "var(--danger)" : "var(--accent)",
                borderRadius: "99px", transition: "width 0.4s ease",
              }} />
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-3)", textAlign: "right" }}>{row.total}</div>
            <div style={{ fontSize: "12px", fontWeight: "700", textAlign: "right", color: row.oor > 0 ? "var(--danger)" : "var(--text-3)" }}>
              {row.oor > 0 ? row.oor : "—"}
            </div>
            <div style={{ fontSize: "12px", fontWeight: "700", textAlign: "right", color: row.oor === 0 ? "#34C759" : row.rate > 20 ? "var(--danger)" : "var(--text-1)" }}>
              {row.total > 0 ? `${Math.round(((row.total - row.oor) / row.total) * 100)}%` : "—"}
            </div>
          </div>
        ))}
      </div>

      {/* Top OOR Items */}
      {topOorData.length > 0 && (
        <>
          <p className="ios-section-label">Top OOR Items</p>
          <div className="liquid-glass fade-up" style={{ marginBottom: "24px", overflow: "hidden" }}>
            {topOorData.map((item, i) => {
              const maxCount = topOorData[0].count;
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "1fr 100px 36px",
                  alignItems: "center", gap: "12px",
                  padding: "11px 20px",
                  borderBottom: i < topOorData.length - 1 ? "1px solid var(--border-inner)" : "none",
                  background: i % 2 === 0 ? "var(--card)" : "var(--bg)",
                }}>
                  <div style={{ fontSize: "13px", fontWeight: "500", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </div>
                  <div style={{ position: "relative", height: "5px", background: "var(--panel)", borderRadius: "99px", overflow: "hidden" }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: `${Math.round((item.count / maxCount) * 100)}%`,
                      background: i === 0 ? "var(--danger)" : "rgba(255,59,48,0.5)",
                      borderRadius: "99px",
                    }} />
                  </div>
                  <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--danger)", textAlign: "right" }}>
                    {item.count}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Last Submission by Line */}
      <p className="ios-section-label">Last Submission by Line</p>
      <div className="liquid-glass fade-up" style={{ marginBottom: "24px", overflow: "hidden" }}>
        {allLines.map((line, i) => {
          const lastDate = lastSubmitMap.get(line.id);
          const daysSince = lastDate
            ? Math.floor((now.getTime() - new Date(lastDate).getTime()) / 86400000)
            : null;
          const isStale = daysSince === null || daysSince > 1;
          return (
            <div key={line.id} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "11px 20px",
              borderBottom: i < allLines.length - 1 ? "1px solid var(--border-inner)" : "none",
              background: i % 2 === 0 ? "var(--card)" : "var(--bg)",
            }}>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-1)" }}>
                {line.company.code} · Line {line.code}
              </div>
              <div style={{ fontSize: "12px", fontWeight: "600", color: isStale ? "var(--danger)" : "#34C759" }}>
                {lastDate
                  ? daysSince === 0
                    ? "Today"
                    : daysSince === 1
                    ? "Yesterday"
                    : `${daysSince}d ago`
                  : "No record"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent unresolved OOR */}
      {recentOor.length > 0 && (
        <>
          <p className="ios-section-label">Unresolved OOR</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {recentOor.map((s, i) => {
              const companyName = s.companyName ?? s.line.company.name;
              const lineName    = s.lineName    ?? s.line.code;
              const modelName   = s.modelName   ?? s.model?.name ?? "-";
              const dateStr = new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <Link key={s.id} href={`/submission/${s.id}`} className="liquid-glass" style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", textDecoration: "none",
                  animationDelay: `${i * 0.03}s`,
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>
                        {companyName} · Line {lineName}
                      </span>
                      <span style={{
                        fontSize: "10px", fontWeight: "700", padding: "2px 7px",
                        background: "rgba(255,59,48,0.10)", color: "var(--danger)",
                        border: "1px solid rgba(255,59,48,0.20)", borderRadius: "999px",
                      }}>OOR !</span>
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
                      {modelName} · {dateStr}
                    </div>
                  </div>
                  <svg width="8" height="13" viewBox="0 0 8 13" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1 1l6 5.5L1 12" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </Link>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "ok" | "warn" | "danger" }) {
  const color = accent === "danger" ? "var(--danger)" : accent === "warn" ? "#F59E0B" : accent === "ok" ? "#34C759" : "var(--text-1)";
  return (
    <div className="liquid-glass" style={{ padding: "16px", textAlign: "center" }}>
      <div style={{ fontSize: "22px", fontWeight: "700", color, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}
