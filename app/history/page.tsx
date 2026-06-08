import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string;
    line?: string;
    oor?: string;
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
  const toDate = sp.to ? new Date(sp.to) : new Date();
  toDate.setHours(23, 59, 59, 999);
  const fromDate = sp.from ? new Date(sp.from) : (() => {
    const d = new Date(toDate);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const companies = await prisma.company.findMany({
    orderBy: { code: "asc" },
    include: { lines: { orderBy: { code: "asc" } } },
  });

  // 선택된 회사의 라인 목록
  const selectedCompany = companies.find((c) => c.code === sp.company);
  const lines = selectedCompany?.lines ?? [];

  const unhandled = sp.oor === "unhandled";
  const q = (sp.q ?? "").trim();

  const where = {
    date: { gte: fromDate, lte: toDate },
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
        template: { select: { code: true, name: true } },
        correctiveAction: { select: { id: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const toStr = (d: Date) => d.toISOString().slice(0, 10);

  // query string builder
  function buildQuery(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = {
      ...(sp.company && { company: sp.company }),
      ...(sp.line && { line: sp.line }),
      ...(sp.oor !== undefined && { oor: sp.oor }),
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
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

      {/* 리스트 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {submissions.length === 0 && (
          <div className="liquid-glass" style={{ padding: "32px", textAlign: "center" }}>
            <p style={{ fontSize: "14px", color: "var(--text-3)" }}>No records found.</p>
          </div>
        )}
        {submissions.map((s, i) => {
          const companyName = s.companyName ?? s.line.company.name;
          const lineName    = s.lineName    ?? s.line.code;
          const modelName   = s.modelName   ?? s.model?.name ?? "-";
          const dateStr = new Date(s.date).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
          return (
            <Link
              key={s.id}
              href={`/submission/${s.id}`}
              className="liquid-glass"
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", textDecoration: "none",
                animationDelay: `${i * 0.02}s`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>
                    {companyName} · Line {lineName}
                  </span>
                  {s.hasOutOfRange && (
                    s.correctiveAction ? (
                      <span style={{
                        fontSize: "10px", fontWeight: "700", padding: "2px 7px",
                        background: "rgba(52,199,89,0.10)", color: "#34C759",
                        border: "1px solid rgba(52,199,89,0.25)", borderRadius: "999px",
                      }}>OOR ✓</span>
                    ) : (
                      <span style={{
                        fontSize: "10px", fontWeight: "700", padding: "2px 7px",
                        background: "rgba(255,59,48,0.10)", color: "var(--danger)",
                        border: "1px solid rgba(255,59,48,0.20)", borderRadius: "999px",
                      }}>OOR !</span>
                    )
                  )}
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-3)" }}>
                  {modelName}
                  {s.partNumberBuild && <span style={{ marginLeft: "6px", opacity: 0.7 }}>· {s.partNumberBuild}</span>}
                  <span style={{ marginLeft: "8px" }}>{dateStr}</span>
                </div>
              </div>
              <svg width="8" height="13" viewBox="0 0 8 13" fill="none" style={{ flexShrink: 0, marginLeft: "12px" }}>
                <path d="M1 1l6 5.5L1 12" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
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
