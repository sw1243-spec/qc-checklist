import { readConfig } from "@/lib/config";

type OorAlertPayload = {
  submissionId: number;
  company: string;
  line: string;
  model: string;
  partNumber?: string;
  shift: number;
  templateName: string;
  oorItems: { name: string; value: string; spec?: string | null }[];
  baseUrl?: string;
};

// 비동기 fire-and-forget (응답 안 기다림)
export function sendSlackOorAlert(payload: OorAlertPayload): void {
  // Promise.catch로 에러 흡수 — 본 기능에 영향 주지 않도록
  doSendSlack(payload).catch((err) => {
    console.error("[Slack notify failed]", err);
  });
}

async function doSendSlack(payload: OorAlertPayload): Promise<void> {
  const config = readConfig();
  if (!config.slackEnabled || !config.slackWebhookUrl) return;

  const itemsList = payload.oorItems
    .map((it) => `• *${it.name}* — \`${it.value}\`${it.spec ? ` (spec: ${it.spec})` : ""}`)
    .join("\n");

  const url = payload.baseUrl
    ? `${payload.baseUrl}/submission/${payload.submissionId}`
    : `/submission/${payload.submissionId}`;
  // Slack 버튼은 절대 URL만 허용 — baseUrl 없으면 버튼 생략 (메시지 자체는 전송되도록)
  const isAbsoluteUrl = /^https?:\/\//i.test(url);

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🚨 Out-of-Range Detected", emoji: true },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Customer:*\n${payload.company}` },
        { type: "mrkdwn", text: `*Line:*\n${payload.line}` },
        { type: "mrkdwn", text: `*Model:*\n${payload.model}${payload.partNumber ? ` (${payload.partNumber})` : ""}` },
        { type: "mrkdwn", text: `*Shift:*\n${payload.shift}` },
      ],
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Template:* ${payload.templateName}` },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*OOR Items (${payload.oorItems.length}):*\n${itemsList}` },
    },
  ];
  if (isAbsoluteUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View Submission", emoji: true },
          url,
          style: "danger",
        },
      ],
    });
  }

  const body = {
    text: `🚨 OOR Alert — ${payload.company} ${payload.line} ${payload.model}`,
    blocks,
  };

  const res = await fetch(config.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook ${res.status}: ${await res.text()}`);
  }
}

// 테스트 메시지 (설정 페이지에서 사용)
export async function sendSlackTestMessage(): Promise<{ ok: boolean; error?: string }> {
  const config = readConfig();
  if (!config.slackWebhookUrl) {
    return { ok: false, error: "Webhook URL not set" };
  }
  try {
    const res = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "✅ QC Check Sheet — Slack notification test successful!",
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `${res.status}: ${await res.text()}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
