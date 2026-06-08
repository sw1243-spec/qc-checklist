import { redirect } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { getBranding } from "@/lib/config";
import { logoutAction } from "@/app/actions";
import { prisma } from "@/lib/db";

export default async function HomePage() {
  if (!(await isAuthenticated())) redirect("/login");

  const branding = getBranding();
  const [unresolvedOorCount, companies] = await Promise.all([
    prisma.submission.count({ where: { hasOutOfRange: true, correctiveAction: null } }),
    prisma.company.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "380px" }}>

        {/* Large Title */}
        <div className="fade-up" style={{ marginBottom: "32px" }}>
          <p className="label-caps" style={{ marginBottom: "12px" }}>{branding.brandLabel}</p>
          <h1 style={{
            fontSize: "34px", fontWeight: "700",
            letterSpacing: "0.4px", lineHeight: "1.1",
            color: "var(--text-1)", marginBottom: "10px",
          }}>
            {branding.appTitle}
          </h1>
          <p style={{ fontSize: "15px", color: "var(--text-2)", letterSpacing: "-0.2px" }}>
            {branding.homeSubtitle}
          </p>
        </div>

        {/* OOR Alert Banner */}
        {unresolvedOorCount > 0 && (
          <Link
            href="/history?oor=unhandled"
            className="fade-up"
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", marginBottom: "20px",
              background: "rgba(255,59,48,0.08)",
              border: "1px solid rgba(255,59,48,0.25)",
              borderRadius: "14px",
              textDecoration: "none",
              animationDelay: "0.05s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                width: "32px", height: "32px", borderRadius: "50%",
                background: "rgba(255,59,48,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--danger)", letterSpacing: "-0.01em" }}>
                  {unresolvedOorCount} Unresolved OOR
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>
                  Click to view and take action
                </div>
              </div>
            </div>
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
              <path d="M1 1l6 5.5L1 12" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
        )}

        {/* Inset Grouped List */}
        <div className="fade-up fade-up-1 liquid-glass" style={{
          borderRadius: "16px", overflow: "hidden",
          marginBottom: "32px",
        }}>
          {companies.map((c, i) => (
            <Link key={c.code} href={`/company/${c.code}`} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "15px 16px",
              background: "transparent",
              textDecoration: "none",
              borderBottom: i < companies.length - 1 ? "1px solid rgba(255,255,255,0.25)" : "none",
              transition: "opacity 0.15s ease",
            }}>
              <div style={{ fontSize: "17px", fontWeight: "600", letterSpacing: "-0.3px", color: "var(--text-1)" }}>
                {c.name}
              </div>
              <svg width="8" height="13" viewBox="0 0 8 13" fill="none">
                <path d="M1 1l6 5.5L1 12" stroke="var(--text-3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ))}
        </div>

        {/* History + Sign out */}
        <div className="fade-up fade-up-2" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            <Link href="/dashboard" style={{ fontSize: "15px", color: "var(--accent)", textDecoration: "none", letterSpacing: "-0.2px" }}>
              Dashboard
            </Link>
            <Link href="/production" style={{ fontSize: "15px", color: "var(--accent)", textDecoration: "none", letterSpacing: "-0.2px" }}>
              Charts
            </Link>
            <Link href="/history" style={{ fontSize: "15px", color: "var(--accent)", textDecoration: "none", letterSpacing: "-0.2px" }}>
              History
            </Link>
          </div>
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            <Link href="/device" style={{ fontSize: "15px", color: "var(--text-3)", textDecoration: "none", letterSpacing: "-0.2px" }}>
              Device
            </Link>
            <form action={logoutAction}>
              <button type="submit" style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "15px", color: "var(--text-3)", fontFamily: "inherit",
                letterSpacing: "-0.2px", padding: 0,
              }}>
                Sign out
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
