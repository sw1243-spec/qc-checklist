import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ShiftManager from "./ShiftManager";

export default async function AdminShiftsPage() {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  const shifts = await prisma.shiftConfig.findMany({ orderBy: { order: "asc" } });

  return (
    <div style={{ maxWidth: "540px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>Shifts</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "32px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>Configuration</p>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          Shift Settings
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "8px" }}>
          After a shift's deadline, the checklist form resets for that shift.
        </p>
      </div>

      <ShiftManager shifts={shifts} />

      <div style={{ marginTop: "32px" }}>
        <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--text-3)", textDecoration: "none" }}>← Back</Link>
      </div>
    </div>
  );
}
