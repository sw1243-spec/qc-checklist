import Image from "next/image";
import Link from "next/link";
import { getBranding } from "@/lib/config";
import { loginAction } from "@/app/actions";
import LoginCard from "./LoginCard";
import ContactButton from "./ContactButton";
import LockoutCountdown from "./LockoutCountdown";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; remaining?: string; attempts?: string }> }) {
  const { error, remaining, attempts } = await searchParams;
  const branding = getBranding();
  const hasError = error === "1";
  const isLocked = error === "locked";
  const remainingSec = remaining ? Number(remaining) : 0;
  const attemptsNum = attempts ? Number(attempts) : 0;

  return (
    <>
    <ContactButton />
    <LoginCard>
      {/* 로고 */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div style={{ margin: "0 auto 18px", width: "72px", height: "72px" }}>
          <Image src="/logo.png" alt="Logo" width={72} height={72} style={{ objectFit: "contain" }} priority />
        </div>
        <h1 style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-0.02em", color: "var(--text-1)" }}>
          {branding.appTitle}
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-2)", marginTop: "5px" }}>
          Enter your password
        </p>
      </div>

      <form action={loginAction} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <input
          id="password"
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          disabled={isLocked}
          style={{
            width: "100%",
            padding: "14px 16px",
            fontSize: "17px",
            fontFamily: "inherit",
            color: "var(--text-1)",
            background: "rgba(255,255,255,0.58)",
            border: "1px solid rgba(255,255,255,0.72)",
            borderRadius: "14px",
            outline: "none",
            letterSpacing: "-0.3px",
            WebkitAppearance: "none" as const,
            opacity: isLocked ? 0.5 : 1,
          }}
        />
        {hasError && (
          <p style={{ fontSize: "14px", color: "var(--danger)", textAlign: "center" }}>
            Incorrect password.{attemptsNum > 0 && ` (${attemptsNum}/5 attempts)`}
          </p>
        )}
        {isLocked && remainingSec > 0 && (
          <LockoutCountdown seconds={remainingSec} />
        )}
        <button type="submit" disabled={isLocked} style={{
          width: "100%",
          padding: "15px",
          fontSize: "17px",
          fontWeight: "600",
          fontFamily: "inherit",
          letterSpacing: "-0.3px",
          color: "#ffffff",
          background: isLocked ? "var(--text-3)" : "var(--accent)",
          border: "none",
          borderRadius: "14px",
          cursor: isLocked ? "not-allowed" : "pointer",
          marginTop: "4px",
          transition: "opacity 0.15s ease, transform 0.12s ease",
          opacity: isLocked ? 0.6 : 1,
        }}>
          {isLocked ? "Locked" : "Sign In"}
        </button>
      </form>
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none", letterSpacing: "-0.2px" }}>
          Admin
        </Link>
      </div>
    </LoginCard>
    </>
  );
}
