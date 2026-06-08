"use server";

import { redirect } from "next/navigation";
import { updateNotificationSettings } from "@/lib/config";
import { sendSlackTestMessage } from "@/lib/notify";
import { sendTestEmail } from "@/lib/email";
import { sendDailyReport } from "@/lib/dailyReport";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";

export async function saveSlackSettingsAction(formData: FormData) {
  await requireAdmin();
  const slackWebhookUrl = (formData.get("slackWebhookUrl") as string ?? "").trim();
  const slackEnabled = formData.get("slackEnabled") === "on";

  updateNotificationSettings({
    slackWebhookUrl: slackWebhookUrl || undefined,
    slackEnabled,
  });
  await logAudit({
    action: "UPDATE_NOTIFICATION",
    entityType: "Settings",
    detail: { slackEnabled, hasUrl: !!slackWebhookUrl },
  });

  redirect("/SWJ/notifications?success=slack");
}

export async function testSlackAction() {
  await requireAdmin();
  const result = await sendSlackTestMessage();
  if (result.ok) {
    redirect("/SWJ/notifications?success=test");
  } else {
    redirect(`/SWJ/notifications?error=${encodeURIComponent(result.error ?? "Unknown")}`);
  }
}

export async function saveEmailSettingsAction(formData: FormData) {
  await requireAdmin();
  const host = (formData.get("emailSmtpHost") as string ?? "").trim();
  const port = Number(formData.get("emailSmtpPort"));
  const user = (formData.get("emailSmtpUser") as string ?? "").trim();
  const passInput = (formData.get("emailSmtpPass") as string ?? "").trim();
  const from = (formData.get("emailFrom") as string ?? "").trim();
  const to = (formData.get("emailTo") as string ?? "").trim();
  const enabled = formData.get("emailEnabled") === "on";

  // 비밀번호가 비어있으면 기존 값 유지 (별표로 표시했을 가능성)
  const patch: Parameters<typeof updateNotificationSettings>[0] = {
    emailSmtpHost: host || undefined,
    emailSmtpPort: port || undefined,
    emailSmtpUser: user || undefined,
    emailFrom: from || undefined,
    emailTo: to || undefined,
    emailEnabled: enabled,
  };
  if (passInput) patch.emailSmtpPass = passInput;

  updateNotificationSettings(patch);
  await logAudit({
    action: "UPDATE_NOTIFICATION",
    entityType: "Settings",
    detail: { emailEnabled: enabled, host, user, to },
  });

  redirect("/SWJ/notifications?success=email");
}

export async function testEmailAction() {
  await requireAdmin();
  const result = await sendTestEmail();
  if (result.ok) {
    redirect("/SWJ/notifications?success=emailtest");
  } else {
    redirect(`/SWJ/notifications?error=${encodeURIComponent(result.error ?? "Unknown")}`);
  }
}

export async function sendDailyReportNowAction() {
  await requireAdmin();
  const result = await sendDailyReport();
  if (result.ok) {
    redirect("/SWJ/notifications?success=dailysent");
  } else {
    redirect(`/SWJ/notifications?error=${encodeURIComponent(result.error ?? "Unknown")}`);
  }
}
