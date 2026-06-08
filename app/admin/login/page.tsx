import { adminLoginAction } from "@/app/actions";
import { isAdminAuthenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
import LockoutCountdown from "@/app/login/LockoutCountdown";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; remaining?: string; attempts?: string }>;
}) {
  if (await isAdminAuthenticated()) redirect("/SWJ");
  const { error, remaining, attempts } = await searchParams;
  const isLocked = error === "locked";
  const remainingSec = remaining ? Number(remaining) : 0;
  const attemptsNum = attempts ? Number(attempts) : 0;

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "340px" }}>
        <div className="fade-up liquid-glass" style={{ padding: "40px 32px", borderRadius: "28px" }}>

          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <div style={{
              width: "52px", height: "52px", margin: "0 auto 16px",
              background: "rgba(217,119,87,0.10)",
              border: "1px solid rgba(217,119,87,0.25)",
              borderRadius: "16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <h1 style={{ fontSize: "20px", fontWeight: "700", letterSpacing: "-0.02em", color: "var(--text-1)" }}>
              Admin Access
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
              Enter admin password
            </p>
          </div>

          <form action={adminLoginAction} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              type="password" name="password"
              placeholder="Admin password"
              autoFocus
              disabled={isLocked}
              className="apple-input"
              style={{ opacity: isLocked ? 0.5 : 1 }}
            />
            {error === "1" && (
              <p style={{ fontSize: "13px", color: "var(--danger)", textAlign: "center" }}>
                Incorrect admin password.{attemptsNum > 0 && ` (${attemptsNum}/5 attempts)`}
              </p>
            )}
            {isLocked && remainingSec > 0 && (
              <LockoutCountdown seconds={remainingSec} />
            )}
            <button type="submit" disabled={isLocked} className="btn-primary" style={{ marginTop: "4px", opacity: isLocked ? 0.6 : 1, cursor: isLocked ? "not-allowed" : "pointer" }}>
              {isLocked ? "Locked" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
