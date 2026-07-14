import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasAnyProductionPending } from "@/lib/submissionDepartmentStatus";

const PAGE_SIZE = 20;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string;
    line?: string;
    oor?: string;
    shift?: string;
    from?: string;
    to?: string;
    page?: string;
    q?: string;
  }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const oor = sp.oor === "1" ? true : sp.oor === "0" ? false : undefined;

  // 날짜 범위 기본값: 이번 달 1일 ~ 오늘
  // "YYYY-MM-DD"를 그냥 new Date()에 넣으면 UTC 자정으로 파싱돼 타임존 어긋남 →
  // 'T00:00:00'을 붙여 로컬 자정으로 파싱 (submission.date 저장 기준과 일치)
  const toDate = sp.to ? new Date(sp.to + "T00:00:00") : new Date();
  toDate.setHours(23, 59, 59, 999);
  const fromDate = sp.from ? new Date(sp.from + "T00:00:00") : (() => {
    const d = new Date(toDate);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const [companies, activeShifts] = await Promise.all([
    prisma.company.findMany({
      orderBy: { code: "asc" },
      include: { lines: { orderBy: { code: "asc" } } },
    }),
    prisma.shiftConfig.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);

  // 선택된 회사의 라인 목록
  const selectedCompany = companies.find((c) => c.code === sp.company);
  const lines = selectedCompany?.lines ?? [];

  const unhandled = sp.oor === "unhandled";
  const q = (sp.q ?? "").trim();

  const shiftFilter =
    sp.shift === "1" ? { OR: [{ AND: [{ shift1LE: { not: null } }, { shift1LE: { not: "" } }] }, { AND: [{ shift1QC: { not: null } }, { shift1QC: { not: "" } }] }] } :
    sp.shift === "2" ? { OR: [{ AND: [{ shift2LE: { not: null } }, { shift2LE: { not: "" } }] }, { AND: [{ shift2QC: { not: null } }, { shift2QC: { not: "" } }] }] } :
    sp.shift === "3" ? { OR: [{ AND: [{ shift3LE: { not: null } }, { shift3LE: { not: "" } }] }, { AND: [{ shift3QC: { not: null } }, { shift3QC: { not: "" } }] }] } :
    {};

  const where = {
    date: { gte: fromDate, lte: toDate },
    ...shiftFilter,
    ...(sp.line ? { lineId: Number(sp.line) } : sp.company ? { line: { company: { code: sp.company } } } : {}),
    ...(unhandled
      ? { hasOutOfRange: true, correctiveAction: null }
      : oor !== undefined
      ? { hasOutOfRange: oor }
      : {}),
    ...(q
      ? {
          OR: [
            { modelName:       { contains: q } },
            { lineName:        { contains: q } },
            { companyName:     { contains: q } },
            { partNumberBuild: { contains: q } },
            { templateCode:    { contains: q } },
            { templateName:    { contains: q } },
            { model:    { name: { contains: q } } },
            { line:     { code: { contains: q } } },
            { template: { OR: [{ code: { contains: q } }, { name: { contains: q } }] } },
          ],
        }
      : {}),
  };

  const [total, submissions] = await Promise.all([
    prisma.submission.count({ where }),
    prisma.submission.findMany({
      where,
      include: {
        line: { include: { company: true } },
        model: true,
        template: { select: { code: true, name: true, items: { where: { department: "PROD" }, select: { id: true }, take: 1 } } },
        correctiveAction: { select: { id: true } },
      },
      orderBy: [{ date: "desc" }, { partNumberBuild: "asc" }, { modelName: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 제출 건에 채워진 시프트 판정 (한 제출이 1·2교대를 같이 담을 수 있음)
  type Sub = (typeof submissions)[number];
  const subShifts = (s: Sub): number[] => {
    const arr: number[] = [];
    if ((s.shift1LE ?? "").trim() || (s.shift1QC ?? "").trim()) arr.push(1);
    if ((s.shift2LE ?? "").trim() || (s.shift2QC ?? "").trim()) arr.push(2);
    if ((s.shift3LE ?? "").trim() || (s.shift3QC ?? "").trim()) arr.push(3);
    if (arr.length === 0 && s.shift != null) arr.push(s.shift);
    return arr;
  };

  // 같은 날 + 같은 PN(라인·모델 포함) 제출 건을 그룹으로 묶기
  const groups: { key: string; date: Date; company: string; line: string; model: string; pn: string; shifts: Set<number>; items: Sub[] }[] = [];
  for (const s of submissions) {
    const company = s.companyName ?? s.line.company.name;
    const line    = s.lineName    ?? s.line.code;
    const model   = s.modelName   ?? s.model?.name ?? "-";
    const pn      = s.partNumberBuild || "—";
    const dateStr = new Date(s.date).toISOString().slice(0, 10);
    const key = `${dateStr}|${company}|${line}|${model}|${pn}`;
    const last = groups[groups.length - 1];
    const shifts = subShifts(s);
    if (last && last.key === key) {
      last.items.push(s);
      shifts.forEach((sh) => last.shifts.add(sh));
    } else {
      groups.push({ key, date: s.date, company, line, model, pn, shifts: new Set(shifts), items: [s] });
    }
  }

  const toStr = (d: Date) => d.toISOString().slice(0, 10);

  // query string builder
  function buildQuery(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = {
      ...(sp.company && { company: sp.company }),
      ...(sp.line && { line: sp.line }),
      ...(sp.oor !== undefined && { oor: sp.oor }),
      ...(sp.shift && { shift: sp.shift }),
      ...(q && { q }),
      from: toStr(fromDate),
      to: toStr(toDate),
      page: String(page),
    };
    const merged = { ...base, ...overrides };
    return "?" + Object.entries(merged)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
      .join("&");
  }

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      {/* 헤더 */}
      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <Link href="/" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Home</Link>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "16px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
              History
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
              {total} record{total !== 1 ? "s" : ""}
            </p>
          </div>
          {/* Export 버튼 — 현재 필터 그대로 */}
          {(() => {
            const exportParams = new URLSearchParams();
            exportParams.set("from", toStr(fromDate));
            exportParams.set("to",   toStr(toDate));
            if (sp.company) exportParams.set("company", sp.company);
            if (sp.line)    exportParams.set("line",    sp.line);
            if (sp.oor === "1") exportParams.set("oor", "1");
            return (
              <a
                href={`/api/export-bulk?${exportParams.toString()}`}
                style={{
                  fontSize: "13px", fontWeight: "600", padding: "9px 16px",
                  background: "var(--panel)", border: "1px solid var(--border)",
                  borderRadius: "10px", textDecoration: "none", color: "var(--text-1)",
                  display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export Excel
              </a>
            );
          })()}
        </div>
      </div>

      {/* 필터 */}
      <form method="GET" className="liquid-glass fade-up" style={{ padding: "20px", marginBottom: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* Search bar */}
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Search</label>
          <div style={{ position: "relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Model, Part No., Template, Line..."
              className="apple-input"
              style={{ fontSize: "14px", paddingLeft: "36px" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>From</label>
            <input type="date" name="from" defaultValue={toStr(fromDate)} className="apple-input" style={{ fontSize: "14px" }} />
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>To</label>
            <input type="date" name="to" defaultValue={toStr(toDate)} className="apple-input" style={{ fontSize: "14px" }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "10px" }}>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Company</label>
            <select name="company" defaultValue={sp.company ?? ""} className="apple-input" style={{ fontSize: "14px" }}>
              <option value="">All</option>
              {companies.map((c) => (
                <option key={c.id} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Line</label>
            <select name="line" defaultValue={sp.line ?? ""} className="apple-input" style={{ fontSize: "14px" }}>
              <option value="">All</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>Line {l.code}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Shift</label>
            <select name="shift" defaultValue={sp.shift ?? ""} className="apple-input" style={{ fontSize: "14px" }}>
              <option value="">All</option>
              {activeShifts.map((s) => (
                <option key={s.order} value={String(s.order)}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>OOR</label>
            <select name="oor" defaultValue={sp.oor ?? ""} className="apple-input" style={{ fontSize: "14px" }}>
              <option value="">All</option>
              <option value="1">OOR</option>
              <option value="0">Pass</option>
              <option value="unhandled">⚠️ OOR Unresolved</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button type="submit" className="btn-primary" style={{ flex: 1 }}>Search</button>
          <Link href="/history" className="btn-secondary" style={{ flex: 1, fontSize: "14px", padding: "11px", textAlign: "center" }}>
            Reset
          </Link>
        </div>
      </form>

      {/* 리스트 — 같은 날 + 같은 PN 그룹으로 묶음 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {groups.length === 0 && (
          <div className="liquid-glass" style={{ padding: "32px", textAlign: "center" }}>
            <p style={{ fontSize: "14px", color: "var(--text-3)" }}>No records found.</p>
          </div>
        )}
        {groups.map((g, gi) => {
          const dateStr = new Date(g.date).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
          return (
            <div
              key={g.key}
              className="liquid-glass fade-up"
              style={{ padding: "14px 16px", animationDelay: `${gi * 0.03}s` }}
            >
              {/* 그룹 헤더 */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-1)" }}>
                  {g.company} · Line {g.line}
                  <span style={{ fontWeight: "500", color: "var(--text-2)", marginLeft: "8px" }}>{g.model}</span>
                  {g.pn !== "—" && (
                    <span style={{
                      fontSize: "11px", fontWeight: "600", marginLeft: "8px", padding: "2px 8px",
                      background: "var(--panel)", border: "1px solid var(--border)",
                      borderRadius: "999px", color: "var(--text-2)",
                    }}>{g.pn}</span>
                  )}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-3)", fontWeight: "500" }}>{dateStr}</span>
              </div>

              {/* 그룹 내 제출 건 (체크시트별) */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {g.items.map((s) => {
                  const tplName = s.template?.name ?? s.templateName ?? s.templateCode ?? "Check Sheet";
                  const productionPending = (s.template?.items.length ?? 0) > 0 && hasAnyProductionPending(s);
                  return (
                    <Link
                      key={s.id}
                      href={`/submission/${s.id}`}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "9px 12px", textDecoration: "none",
                        background: "var(--card)", border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flexWrap: "wrap" }}>
                        <span style={{ fontSize: "13px", fontWeight: "500", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tplName}
                        </span>
                        {subShifts(s).map((sh) => (
                          <span key={sh} style={{
                            fontSize: "9px", fontWeight: "700", padding: "2px 6px", flexShrink: 0,
                            background: "rgba(48,84,150,0.10)", color: "#305496",
                            border: "1px solid rgba(48,84,150,0.20)", borderRadius: "999px",
                          }}>Shift {sh}</span>
                        ))}
                        {s.hasOutOfRange && (
                          s.correctiveAction ? (
                            <span style={{
                              fontSize: "9px", fontWeight: "700", padding: "2px 6px", flexShrink: 0,
                              background: "rgba(52,199,89,0.10)", color: "#34C759",
                              border: "1px solid rgba(52,199,89,0.25)", borderRadius: "999px",
                            }}>OOR ✓</span>
                          ) : (
                            <span style={{
                              fontSize: "9px", fontWeight: "700", padding: "2px 6px", flexShrink: 0,
                              background: "rgba(255,59,48,0.10)", color: "var(--danger)",
                              border: "1px solid rgba(255,59,48,0.20)", borderRadius: "999px",
                            }}>OOR !</span>
                          )
                        )}
                        {productionPending && (
                          <span style={{
                            fontSize: "9px", fontWeight: "700", padding: "2px 6px", flexShrink: 0,
                            background: "rgba(255,158,66,0.12)", color: "#B85F00",
                            border: "1px solid rgba(255,158,66,0.28)", borderRadius: "999px",
                          }}>Production 대기</span>
                        )}
                      </span>
                      <svg width="7" height="12" viewBox="0 0 8 13" fill="none" style={{ flexShrink: 0, marginLeft: "10px" }}>
                        <path d="M1 1l6 5.5L1 12" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "24px" }}>
          {page > 1 && (
            <Link href={buildQuery({ page: String(page - 1) })} style={{
              padding: "8px 16px", fontSize: "13px", fontWeight: "500",
              background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: "8px", textDecoration: "none", color: "var(--text-1)",
            }}>← Prev</Link>
          )}
          <span style={{ fontSize: "13px", color: "var(--text-3)" }}>{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildQuery({ page: String(page + 1) })} style={{
              padding: "8px 16px", fontSize: "13px", fontWeight: "500",
              background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: "8px", textDecoration: "none", color: "var(--text-1)",
            }}>Next →</Link>
          )}
        </div>
      )}

    </div>
  );
}
