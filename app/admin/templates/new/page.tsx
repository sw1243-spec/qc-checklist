import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { createTemplate } from "@/app/admin/actions";

export default async function NewTemplatePage() {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");

  return (
    <div style={{ maxWidth: "540px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1, minHeight: "100dvh" }}>

      <div className="breadcrumb fade-up" style={{ marginBottom: "24px" }}>
        <Link href="/SWJ">Admin</Link>
        <span className="breadcrumb-sep">›</span>
        <Link href="/SWJ/templates">Templates</Link>
        <span className="breadcrumb-sep">›</span>
        <span style={{ color: "var(--text-1)", fontWeight: "500" }}>New</span>
      </div>

      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <p className="label-caps" style={{ marginBottom: "10px" }}>Create</p>
        <h1 style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)" }}>
          New Template
        </h1>
      </div>

      <form action={createTemplate} className="liquid-glass fade-up" style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>

        <Field label="Template Code" hint="e.g. 19-020">
          <input name="code" required placeholder="19-020" className="apple-input" />
        </Field>

        <Field label="Name" hint="Full document title">
          <input name="name" required placeholder="CV Joint Check Sheet" className="apple-input" />
        </Field>

        <Field label="Version" hint="e.g. Rev R">
          <input name="version" required placeholder="Rev R" className="apple-input" />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <Field label="Sample Count" hint="Number of samples">
            <input name="sampleCount" type="number" min="1" max="20" defaultValue="2" className="apple-input" />
          </Field>
          <Field label="Sample Labels" hint="Comma separated">
            <input name="sampleLabels" placeholder="P#1,P#2" defaultValue="P#1,P#2" className="apple-input" />
          </Field>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
          <Link href="/SWJ/templates" className="btn-secondary" style={{ flex: 1, fontSize: "15px", padding: "13px" }}>
            Cancel
          </Link>
          <button type="submit" className="btn-primary" style={{ flex: 2, fontSize: "15px" }}>
            Create & Edit Items →
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <label className="apple-label">{label}</label>
        {hint && <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
