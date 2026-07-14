import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { DEVICE_DEPARTMENT_COOKIE, DEVICE_NAME_COOKIE, deviceDepartmentLabel, parseDeviceDepartment } from "@/lib/device";
import { setDeviceSettingsAction } from "./actions";

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const { success, error } = await searchParams;
  const cookieStore = await cookies();
  const currentDevice = cookieStore.get(DEVICE_NAME_COOKIE)?.value ?? "";
  const currentDepartment = parseDeviceDepartment(cookieStore.get(DEVICE_DEPARTMENT_COOKIE)?.value);

  return (
    <div className="page-wrap">
      <div style={{ width: "100%", maxWidth: "400px" }}>

        <div className="fade-up" style={{ marginBottom: "24px" }}>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: "5px",
            color: "var(--accent)", textDecoration: "none",
            fontSize: "15px", fontWeight: "400", letterSpacing: "-0.2px",
          }}>
            <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
              <path d="M7.5 1.5L1.5 7.5L7.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Home
          </Link>
        </div>

        <div className="fade-up" style={{ marginBottom: "24px" }}>
          <p className="label-caps" style={{ marginBottom: "10px" }}>This Device</p>
          <h1 style={{ fontSize: "30px", fontWeight: "700", letterSpacing: "-0.028em", color: "var(--text-1)", lineHeight: "1.1" }}>
            Device Name
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "8px", letterSpacing: "-0.2px" }}>
            Set this tablet&apos;s name and work department. The check sheet will lock to that department on this device.
          </p>
          {currentDepartment && (
            <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "8px", letterSpacing: "-0.2px" }}>
              Current department: <span style={{ color: "var(--text-1)", fontWeight: 700 }}>{deviceDepartmentLabel(currentDepartment)}</span>
            </p>
          )}
        </div>

        {success === "1" && (
          <div className="fade-up" style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(52,199,89,0.08)", border: "1px solid rgba(52,199,89,0.2)", borderRadius: "10px" }}>
            <p style={{ fontSize: "13px", color: "var(--success, #34C759)" }}>Saved on this device.</p>
          </div>
        )}
        {error === "pw" && (
          <div className="fade-up" style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "10px" }}>
            <p style={{ fontSize: "13px", color: "var(--danger)" }}>Admin password is incorrect.</p>
          </div>
        )}
        {error === "dept" && (
          <div className="fade-up" style={{ marginBottom: "16px", padding: "12px 16px", background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)", borderRadius: "10px" }}>
            <p style={{ fontSize: "13px", color: "var(--danger)" }}>Select Quality or Production for this tablet.</p>
          </div>
        )}

        <form action={setDeviceSettingsAction} className="liquid-glass fade-up" style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Device Name</label>
            <input type="text" name="deviceName" defaultValue={currentDevice} placeholder="e.g. Line 2 Tablet" className="apple-input" autoFocus />
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Department</label>
            <select name="deviceDepartment" defaultValue={currentDepartment ?? ""} required className="apple-input">
              <option value="" disabled>Select department</option>
              <option value="QC">Quality</option>
              <option value="PROD">Production</option>
            </select>
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Admin Password</label>
            <input type="password" name="adminPw" required placeholder="Required to change" className="apple-input" />
          </div>
          <button type="submit" className="btn-primary" style={{ marginTop: "4px" }}>
            Save
          </button>
        </form>

      </div>
    </div>
  );
}
