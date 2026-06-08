import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  SUBMIT: "#34C759",
  EDIT_SUBMISSION: "#F59E0B",
  CORRECTIVE_ACTION: "var(--accent)",
  CREATE: "#34C759",
  DELETE: "#FF3B30",
  LOGIN: "var(--text-3)",
  LOGIN_FAIL: "#FF3B30",
  LOGOUT: "var(--text-3)",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; entityType?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));

  const where = {
    ...(sp.action ? { action: sp.action } : {}),
    ...(sp.entityType ? { entityType: sp.entityType } : {}),
  };

  const [total, logs, distinctActions, distinctTypes] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
    prisma.auditLog.findMany({
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>

      <div className="fade-up" style={{ marginBottom: "28px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Admin</Link>
          <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)", marginTop: "16px" }}>
            Audit Log
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
            {total} event{total !== 1 ? "s" : ""}
          </p>
        </div>
        {(() => {
          const exportParams = new URLSearchParams();
          if (sp.action) exportParams.set("action", sp.action);
          if (sp.entityType) exportParams.set("entityType", sp.entityType);
          return (
            <a
              href={`/api/export-audit?${exportParams.toString()}`}
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

      {/* 필터 */}
      <form method="GET" className="liquid-glass fade-up" style={{ padding: "16px", marginBottom: "20px", display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: "10px" }}>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Action</label>
          <select name="action" defaultValue={sp.action ?? ""} className="apple-input" style={{ fontSize: "13px" }}>
            <option value="">All</option>
            {distinctActions.map((a) => <option key={a.action} value={a.action}>{a.action}</option>)}
          </select>
        </div>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Entity Type</label>
          <select name="entityType" defaultValue={sp.entityType ?? ""} className="apple-input" style={{ fontSize: "13px" }}>
            <option value="">All</option>
            {distinctTypes.map((t) => <option key={t.entityType} value={t.entityType}>{t.entityType}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-primary" style={{ alignSelf: "end", padding: "10px 18px", fontSize: "13px" }}>Filter</button>
        <Link href="/SWJ/audit" className="btn-secondary" style={{ alignSelf: "end", padding: "10px 18px", fontSize: "13px", textAlign: "center" }}>Reset</Link>
      </form>

      {/* 로그 목록 */}
      <div className="liquid-glass fade-up" style={{ overflow: "hidden" }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: "150px 130px 110px 70px 1fr",
          gap: "12px", padding: "10px 18px",
          background: "var(--panel)", borderBottom: "1px solid var(--border)",
        }}>
          {["Time", "Action", "Entity", "Actor", "Detail"].map((h, i) => (
            <div key={i} style={{ fontSize: "10px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</div>
          ))}
        </div>

        {logs.length === 0 && (
          <div style={{ padding: "24px", textAlign: "center", fontSize: "14px", color: "var(--text-3)" }}>
            No audit logs.
          </div>
        )}

        {logs.map((log, i) => (
          <div key={log.id} style={{
            display: "grid", gridTemplateColumns: "150px 130px 110px 70px 1fr",
            gap: "12px", padding: "10px 18px", alignItems: "center",
            borderBottom: i < logs.length - 1 ? "1px solid var(--border-inner)" : "none",
            background: i % 2 === 0 ? "var(--card)" : "var(--bg)",
            fontSize: "12px",
          }}>
            <div style={{ color: "var(--text-3)", fontFamily: "monospace", fontSize: "11px" }}>
              {log.createdAt.toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div style={{
              fontWeight: "700", fontSize: "11px",
              color: ACTION_COLORS[log.action] ?? "var(--text-2)",
            }}>
              {log.action}
            </div>
            <div style={{ color: "var(--text-1)" }}>
              {log.entityType}{log.entityId ? ` #${log.entityId}` : ""}
            </div>
            <div style={{ color: "var(--text-2)", fontSize: "11px" }}>
              {log.actor ?? "-"}
            </div>
            <div style={{
              color: "var(--text-3)", fontSize: "11px",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              fontFamily: "monospace",
            }}>
              {log.detail ?? "—"}
            </div>
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", marginTop: "24px" }}>
          {page > 1 && (
            <Link href={`?page=${page - 1}${sp.action ? `&action=${sp.action}` : ""}${sp.entityType ? `&entityType=${sp.entityType}` : ""}`} style={{
              padding: "8px 16px", fontSize: "13px", fontWeight: "500",
              background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: "8px", textDecoration: "none", color: "var(--text-1)",
            }}>← Prev</Link>
          )}
          <span style={{ fontSize: "13px", color: "var(--text-3)" }}>{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={`?page=${page + 1}${sp.action ? `&action=${sp.action}` : ""}${sp.entityType ? `&entityType=${sp.entityType}` : ""}`} style={{
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
