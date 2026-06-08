import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  const [companyCount, lineCount, modelCount, templateCount, auditCount] = await Promise.all([
    prisma.company.count(),
    prisma.line.count(),
    prisma.model.count(),
    prisma.checksheetTemplate.count(),
    prisma.auditLog.count(),
  ]);

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      <div style={{ marginBottom: "32px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>Admin</p>
        <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          Management
        </h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <Link href="/SWJ/structure" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Structure</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              Full tree · rename / add / delete / link
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        <Link href="/SWJ/templates" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Templates</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              {templateCount} templates
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        <Link href="/SWJ/companies" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Customers & Lines</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              {companyCount} companies · {lineCount} lines · {modelCount} models
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        <Link href="/SWJ/chart" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Trend Chart</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              Pick sheets &amp; tag IB / OB / Weight items
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        <Link href="/SWJ/workers" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Workers</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              Line Leaders &amp; QC Inspectors
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        <Link href="/SWJ/notifications" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Notifications</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              Slack &amp; Email alerts
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        <Link href="/SWJ/audit" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Audit Log</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              {auditCount} events recorded
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>

        <Link href="/SWJ/settings" className="liquid-glass" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px", textDecoration: "none",
        }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>Settings</div>
            <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
              Change app &amp; admin passwords
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </Link>
      </div>

      <div style={{ marginTop: "32px" }}>
        <Link href="/" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>← Home</Link>
      </div>
    </div>
  );
}
