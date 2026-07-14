import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasProductionPendingForShift } from "@/lib/submissionDepartmentStatus";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  green:  "#34C759",
  orange: "#FF9E42",
  red:    "#FF3B30",
  gray:   "#cfc6bd",
};

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; shift?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const sp = await searchParams;

  // 날짜/시프트 (기본: 오늘, 첫 번째 활성 시프트)
  const day = sp.date ? new Date(sp.date + "T00:00:00") : new Date();
  if (isNaN(day.getTime())) day.setTime(new Date().getTime());
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end   = new Date(day); end.setHours(23, 59, 59, 999);
  const dateStr = start.toISOString().slice(0, 10);

  const [companies, activeShifts] = await Promise.all([
    prisma.company.findMany({
      orderBy: { code: "asc" },
      include: { lines: { orderBy: { code: "asc" } } },
    }),
    prisma.shiftConfig.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);

  const defaultShiftOrder = activeShifts[0]?.order ?? 1;
  const shift = activeShifts.find((s) => String(s.order) === sp.shift)?.order ?? defaultShiftOrder;

  const shiftFilter =
    shift === 1 ? { OR: [{ AND: [{ shift1LE: { not: null } }, { shift1LE: { not: "" } }] }, { AND: [{ shift1QC: { not: null } }, { shift1QC: { not: "" } }] }] } :
    shift === 2 ? { OR: [{ AND: [{ shift2LE: { not: null } }, { shift2LE: { not: "" } }] }, { AND: [{ shift2QC: { not: null } }, { shift2QC: { not: "" } }] }] } :
                 { OR: [{ AND: [{ shift3LE: { not: null } }, { shift3LE: { not: "" } }] }, { AND: [{ shift3QC: { not: null } }, { shift3QC: { not: "" } }] }] };

  const subs = await prisma.submission.findMany({
    where: { date: { gte: start, lte: end }, partNumberId: { not: null }, ...shiftFilter },
    select: {
      lineId: true, partNumberId: true, templateId: true, hasOutOfRange: true,
      shift1LE: true, shift2LE: true, shift1QC: true, shift2QC: true,
      shift3LE: true, shift3QC: true,
      template: { select: { items: { where: { department: "PROD" }, select: { id: true }, take: 1 } } },
    },
  });

  // 운행 PN(제출된 PN)들의 필수 템플릿 조회
  const runningPnIds = [...new Set(subs.map((s) => s.partNumberId).filter((x): x is number => x !== null))];
  const pns = runningPnIds.length
    ? await prisma.partNumber.findMany({
        where: { id: { in: runningPnIds } },
        include: {
          template: true,
          templateLinks: { include: { template: true } },
          model: { include: { templateLinks: { include: { template: true } } } },
        },
      })
    : [];
  const pnMap = new Map(pns.map((p) => [p.id, p]));

  // PN별 필수 템플릿 (PN레벨 ∪ 모델레벨, legacy fallback)
  function requiredTemplates(pn: typeof pns[number]) {
    const m = new Map<number, { id: number; name: string; code: string }>();
    for (const tl of pn.templateLinks) m.set(tl.template.id, tl.template);
    for (const tl of pn.model.templateLinks) m.set(tl.template.id, tl.template);
    if (m.size === 0 && pn.template) m.set(pn.template.id, pn.template);
    return [...m.values()];
  }

  type SubmittedState = { hasOutOfRange: boolean; productionPending: boolean };
  const submittedByPn = new Map<number, Map<number, SubmittedState>>();
  const pnsByLine = new Map<number, Set<number>>();
  for (const s of subs) {
    if (s.partNumberId === null) continue;
    if (!submittedByPn.has(s.partNumberId)) submittedByPn.set(s.partNumberId, new Map());
    const tm = submittedByPn.get(s.partNumberId)!;
    const current = tm.get(s.templateId) ?? { hasOutOfRange: false, productionPending: false };
    const productionPending = s.template.items.length > 0 && hasProductionPendingForShift(s, shift);
    tm.set(s.templateId, {
      hasOutOfRange: current.hasOutOfRange || s.hasOutOfRange,
      productionPending: current.productionPending || productionPending,
    });
    if (!pnsByLine.has(s.lineId)) pnsByLine.set(s.lineId, new Set());
    pnsByLine.get(s.lineId)!.add(s.partNumberId);
  }

  type TplStatus = { name: string; code: string; status: "green" | "orange" | "red"; productionPending: boolean };
  function evalLine(lineId: number): { color: string; templates: TplStatus[] } {
    const pnSet = pnsByLine.get(lineId);
    if (!pnSet || pnSet.size === 0) return { color: "gray", templates: [] };

    const agg = new Map<number, { name: string; code: string; missing: boolean; oor: boolean; productionPending: boolean }>();
    for (const pnId of pnSet) {
      const pn = pnMap.get(pnId);
      if (!pn) continue;
      const submitted = submittedByPn.get(pnId) ?? new Map();
      for (const tpl of requiredTemplates(pn)) {
        if (!agg.has(tpl.id)) agg.set(tpl.id, { name: tpl.name, code: tpl.code, missing: false, oor: false, productionPending: false });
        const a = agg.get(tpl.id)!;
        if (!submitted.has(tpl.id)) a.missing = true;
        else {
          const state = submitted.get(tpl.id);
          if (state?.hasOutOfRange) a.oor = true;
          if (state?.productionPending) a.productionPending = true;
        }
      }
    }
    const templates: TplStatus[] = [...agg.values()]
      .sort((x, y) => x.code.localeCompare(y.code))
      .map((a) => ({ name: a.name, code: a.code, status: a.missing ? "red" : a.oor || a.productionPending ? "orange" : "green", productionPending: a.productionPending }));
    const anyRed    = templates.some((t) => t.status === "red");
    const anyOrange = templates.some((t) => t.status === "orange");
    const color = templates.length === 0 ? "gray" : anyRed ? "red" : anyOrange ? "orange" : "green";
    return { color, templates };
  }

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>
      {/* 헤더 */}
      <div className="fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Home</Link>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "16px", flexWrap: "wrap", gap: "12px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
            Periodic Checks Status
          </h1>
          <form method="GET" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="date" name="date" defaultValue={dateStr} className="apple-input" style={{ fontSize: "13px", padding: "8px 10px" }} />
            <select name="shift" defaultValue={String(shift)} className="apple-input" style={{ fontSize: "13px", padding: "8px 10px" }}>
              {activeShifts.map((s) => (
                <option key={s.order} value={String(s.order)}>{s.name}</option>
              ))}
            </select>
            <button type="submit" className="btn-primary" style={{ padding: "9px 16px", fontSize: "13px" }}>View</button>
          </form>
        </div>
      </div>

      {/* 범례 */}
      <div className="fade-up" style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-3)" }}>
        {[["green", "All submitted · pass"], ["orange", "OOR / Production pending"], ["red", "Missing check sheet"], ["gray", "Not running"]].map(([c, label]) => (
          <span key={c} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: COLORS[c], display: "inline-block" }} />
            {label}
          </span>
        ))}
      </div>

      {/* 회사별 라인 그리드 */}
      {companies.map((c) => (
        <div key={c.id} className="fade-up" style={{ marginBottom: "28px" }}>
          <p className="ios-section-label">{c.name}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            {c.lines.map((l) => {
              const { color, templates } = evalLine(l.id);
              return (
                <div key={l.id} className="liquid-glass" style={{ padding: "16px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-1)", marginBottom: "10px" }}>
                    Line {l.code}
                  </div>
                  {/* 원형 상태 */}
                  <div style={{
                    width: "56px", height: "56px", borderRadius: "50%", margin: "0 auto 12px",
                    background: COLORS[color],
                    boxShadow: color === "gray" ? "none" : `0 2px 10px ${COLORS[color]}55`,
                  }} />
                  {/* 체크시트 목록 */}
                  {templates.length === 0 ? (
                    <div style={{ fontSize: "11px", color: "var(--text-3)", fontStyle: "italic" }}>
                      {color === "gray" ? "Not running" : "—"}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", textAlign: "left" }}>
                      {templates.map((t) => (
                        <div key={t.code} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: COLORS[t.status], flexShrink: 0 }} />
                          <span style={{ fontSize: "10px", color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.name}>
                            {t.name}
                          </span>
                          {t.productionPending && (
                            <span style={{ fontSize: "9px", fontWeight: 700, padding: "1px 5px", borderRadius: "999px", background: "rgba(255,158,66,0.12)", color: "#B85F00", border: "1px solid rgba(255,158,66,0.28)", flexShrink: 0 }}>
                              Production 대기
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
