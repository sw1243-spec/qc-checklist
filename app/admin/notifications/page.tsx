import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdminAuthenticated } from "@/lib/auth";
import { readConfig } from "@/lib/config";
import {
  saveSlackSettingsAction, testSlackAction,
  saveEmailSettingsAction, testEmailAction, sendDailyReportNowAction,
} from "./actions";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  if (!(await isAdminAuthenticated())) redirect("/SWJ/login");
  const sp = await searchParams;
  const config = readConfig();

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto", padding: "36px 16px 64px", position: "relative", zIndex: 1 }}>
      <div className="fade-up" style={{ marginBottom: "28px" }}>
        <Link href="/SWJ" style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>← Admin</Link>
        <h1 style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.025em", color: "var(--text-1)", marginTop: "16px" }}>
          Notifications
        </h1>
        <p style={{ fontSize: "14px", color: "var(--text-2)", marginTop: "4px" }}>
          Configure real-time alerts for OOR events
        </p>
      </div>

      {/* Feedback messages */}
      {sp.success === "slack" && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.25)", borderRadius: "10px", fontSize: "13px", color: "#34C759" }}>
          ✅ Slack settings saved.
        </div>
      )}
      {sp.success === "test" && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.25)", borderRadius: "10px", fontSize: "13px", color: "#34C759" }}>
          ✅ Test message sent — check your Slack channel.
        </div>
      )}
      {sp.success === "email" && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.25)", borderRadius: "10px", fontSize: "13px", color: "#34C759" }}>
          ✅ Email settings saved.
        </div>
      )}
      {sp.success === "emailtest" && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.25)", borderRadius: "10px", fontSize: "13px", color: "#34C759" }}>
          ✅ Test email sent — check your inbox.
        </div>
      )}
      {sp.success === "dailysent" && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "rgba(52,199,89,0.10)", border: "1px solid rgba(52,199,89,0.25)", borderRadius: "10px", fontSize: "13px", color: "#34C759" }}>
          ✅ Daily report sent.
        </div>
      )}
      {sp.error && (
        <div style={{ padding: "10px 14px", marginBottom: "16px", background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.25)", borderRadius: "10px", fontSize: "13px", color: "var(--danger)" }}>
          ❌ {sp.error}
        </div>
      )}

      {/* Slack Section */}
      <p className="ios-section-label">Slack — Real-time OOR Alerts</p>
      <div className="liquid-glass fade-up" style={{ padding: "24px", marginBottom: "24px" }}>
        <form action={saveSlackSettingsAction} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Incoming Webhook URL</label>
            <input
              type="text"
              name="slackWebhookUrl"
              defaultValue={config.slackWebhookUrl ?? ""}
              placeholder="https://hooks.slack.com/services/T.../B.../..."
              className="apple-input"
              style={{ fontFamily: "monospace", fontSize: "12px" }}
            />
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px", lineHeight: 1.5 }}>
              💡 In your Slack workspace, add the <strong>Incoming Webhooks</strong> app → choose a channel → copy the URL<br />
              Guide: <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>api.slack.com/messaging/webhooks</a>
            </p>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              name="slackEnabled"
              defaultChecked={!!config.slackEnabled}
              style={{ width: "18px", height: "18px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "14px", color: "var(--text-1)" }}>Enable Slack notifications</span>
          </label>

          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save</button>
          </div>
        </form>

        {/* Test button (separate form) */}
        {config.slackWebhookUrl && (
          <form action={testSlackAction} style={{ marginTop: "10px" }}>
            <button type="submit" className="btn-secondary" style={{ width: "100%", fontSize: "13px" }}>
              📤 Send test message
            </button>
          </form>
        )}
      </div>

      {/* Email Section */}
      <p className="ios-section-label">Email — Daily Report</p>
      <div className="liquid-glass fade-up" style={{ padding: "24px", marginBottom: "24px" }}>
        <form action={saveEmailSettingsAction} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px" }}>
            <div>
              <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>SMTP Host</label>
              <input type="text" name="emailSmtpHost" defaultValue={config.emailSmtpHost ?? ""}
                placeholder="smtp.gmail.com" className="apple-input" style={{ fontSize: "13px" }} />
            </div>
            <div>
              <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Port</label>
              <input type="number" name="emailSmtpPort" defaultValue={config.emailSmtpPort ?? 587}
                className="apple-input" style={{ fontSize: "13px" }} />
            </div>
          </div>

          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>SMTP User (Gmail address)</label>
            <input type="text" name="emailSmtpUser" defaultValue={config.emailSmtpUser ?? ""}
              placeholder="your-account@gmail.com" className="apple-input" style={{ fontSize: "13px" }} />
          </div>

          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>
              SMTP Password {config.emailSmtpPass ? <span style={{ color: "var(--text-3)", fontSize: "10px", marginLeft: "6px" }}>(saved — leave empty to keep)</span> : ""}
            </label>
            <input type="password" name="emailSmtpPass" placeholder={config.emailSmtpPass ? "•••• (already set)" : "Gmail App Password (16 chars)"}
              className="apple-input" style={{ fontSize: "13px", fontFamily: "monospace" }} />
            <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>
              💡 For Gmail, don&apos;t use your normal password. Turn on 2-Step Verification → create an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>App Password</a> → enter the 16 characters. For a company mail server, use the SMTP info from your IT team.
            </p>
          </div>

          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>From (sender display) <span style={{ color: "var(--text-3)" }}>optional</span></label>
            <input type="text" name="emailFrom" defaultValue={config.emailFrom ?? ""}
              placeholder='"QC System" <your-account@gmail.com>' className="apple-input" style={{ fontSize: "13px" }} />
          </div>

          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>To (recipients — separate multiple with commas)</label>
            <input type="text" name="emailTo" defaultValue={config.emailTo ?? ""}
              placeholder="manager@hansae.com, qc@hansae.com" className="apple-input" style={{ fontSize: "13px" }} />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
            <input type="checkbox" name="emailEnabled" defaultChecked={!!config.emailEnabled}
              style={{ width: "18px", height: "18px", cursor: "pointer" }} />
            <span style={{ fontSize: "14px", color: "var(--text-1)" }}>Enable email notifications</span>
          </label>

          <button type="submit" className="btn-primary">Save</button>
        </form>

        {config.emailSmtpHost && config.emailSmtpUser && (
          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <form action={testEmailAction} style={{ flex: 1 }}>
              <button type="submit" className="btn-secondary" style={{ width: "100%", fontSize: "13px" }}>
                📤 Send test email
              </button>
            </form>
            <form action={sendDailyReportNowAction} style={{ flex: 1 }}>
              <button type="submit" className="btn-secondary" style={{ width: "100%", fontSize: "13px" }}>
                📊 Send daily report now
              </button>
            </form>
          </div>
        )}

        <div style={{ marginTop: "16px", padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "11px", color: "var(--text-3)", lineHeight: 1.6 }}>
          📅 <strong>Automatic sending:</strong> To send yesterday&apos;s report every morning, call the <code>/api/cron/daily-report</code> endpoint from Windows Task Scheduler. (see separate guide)
        </div>
      </div>
    </div>
  );
}
