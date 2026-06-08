import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { getBranding } from "@/lib/config";
import { changeAppPasswordAction, changeAdminPasswordAction, saveBrandingAction } from "@/app/actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");
  const { error, success } = await searchParams;
  const branding = getBranding();

  return (
    <div style={{ maxWidth: "540px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>Settings</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "32px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>Security</p>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          Settings
        </h1>
      </div>

      {/* 피드백 메시지 */}
      {error === "match" && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "10px" }}>
          <p style={{ fontSize: "13px", color: "var(--danger)" }}>New password and confirmation do not match.</p>
        </div>
      )}
      {error === "wrong" && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "10px" }}>
          <p style={{ fontSize: "13px", color: "var(--danger)" }}>Current password is incorrect.</p>
        </div>
      )}
      {success === "app" && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)", borderRadius: "10px" }}>
          <p style={{ fontSize: "13px", color: "var(--success, #34C759)" }}>App password updated successfully.</p>
        </div>
      )}
      {success === "admin" && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)", borderRadius: "10px" }}>
          <p style={{ fontSize: "13px", color: "var(--success, #34C759)" }}>Admin password updated successfully.</p>
        </div>
      )}

      {success === "branding" && (
        <div style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)", borderRadius: "10px" }}>
          <p style={{ fontSize: "13px", color: "var(--success, #34C759)" }}>Branding updated.</p>
        </div>
      )}

      {/* 브랜딩 문구 */}
      <p className="ios-section-label">Branding</p>
      <form action={saveBrandingAction} className="liquid-glass fade-up" style={{ padding: "24px 20px", marginBottom: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Brand Label (top line)</label>
          <input type="text" name="brandLabel" defaultValue={branding.brandLabel} placeholder="Hansae Mobility" className="apple-input" />
        </div>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>App Title</label>
          <input type="text" name="appTitle" defaultValue={branding.appTitle} placeholder="QC Check Sheet" className="apple-input" />
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "6px" }}>Shown on home, login, and the browser tab.</p>
        </div>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Home Subtitle</label>
          <input type="text" name="homeSubtitle" defaultValue={branding.homeSubtitle} placeholder="Select a customer to continue." className="apple-input" />
        </div>
        <button type="submit" className="btn-primary" style={{ marginTop: "4px" }}>
          Save Branding
        </button>
      </form>

      {/* App 비밀번호 변경 */}
      <p className="ios-section-label">App Password</p>
      <form action={changeAppPasswordAction} className="liquid-glass fade-up" style={{ padding: "24px 20px", marginBottom: "24px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Current Password</label>
          <input type="password" name="current" required placeholder="Current app password" className="apple-input" />
        </div>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>New Password</label>
          <input type="password" name="next" required placeholder="New password" className="apple-input" />
        </div>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Confirm New Password</label>
          <input type="password" name="confirm" required placeholder="Confirm new password" className="apple-input" />
        </div>
        <button type="submit" className="btn-primary" style={{ marginTop: "4px" }}>
          Update App Password
        </button>
      </form>

      {/* Admin 비밀번호 변경 */}
      <p className="ios-section-label">Admin Password</p>
      <form action={changeAdminPasswordAction} className="liquid-glass fade-up" style={{ padding: "24px 20px", marginBottom: "32px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Current Password</label>
          <input type="password" name="current" required placeholder="Current admin password" className="apple-input" />
        </div>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>New Password</label>
          <input type="password" name="next" required placeholder="New password" className="apple-input" />
        </div>
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Confirm New Password</label>
          <input type="password" name="confirm" required placeholder="Confirm new password" className="apple-input" />
        </div>
        <button type="submit" className="btn-primary" style={{ marginTop: "4px" }}>
          Update Admin Password
        </button>
      </form>

      <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>← Back</Link>
    </div>
  );
}
