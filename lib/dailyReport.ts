import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { readConfig } from "@/lib/config";

export async function generateDailyReportEmail(targetDate?: Date): Promise<{ subject: string; html: string }> {
  // targetDate 미지정 시 오늘 기준 — 시프트 종료 시각에 호출하면 그 시점까지의 오늘 제출분이 포함됨
  const d = targetDate ?? new Date();
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end   = new Date(d); end.setHours(23, 59, 59, 999);

  const dateStr = start.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const [total, oorCount, unresolved, submissions, byLine] = await Promise.all([
    prisma.submission.count({ where: { date: { gte: start, lte: end } } }),
    prisma.submission.count({ where: { date: { gte: start, lte: end }, hasOutOfRange: true } }),
    prisma.submission.count({ where: { date: { gte: start, lte: end }, hasOutOfRange: true, correctiveAction: null } }),
    prisma.submission.findMany({
      where: { date: { gte: start, lte: end }, hasOutOfRange: true },
      include: { line: { include: { company: true } }, model: true, correctiveAction: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.submission.groupBy({
      by: ["lineId"],
      where: { date: { gte: start, lte: end } },
      _count: { id: true },
    }),
  ]);

  const passRate = total > 0 ? Math.round(((total - oorCount) / total) * 100) : 100;
  const lineIds = byLine.map((b) => b.lineId);
  const lines = await prisma.line.findMany({ where: { id: { in: lineIds } }, include: { company: true } });
  const lineOorStats = await prisma.submission.groupBy({
    by: ["lineId"],
    where: { date: { gte: start, lte: end }, hasOutOfRange: true },
    _count: { id: true },
  });

  const lineRows = byLine
    .map((b) => {
      const line = lines.find((l) => l.id === b.lineId);
      const oor = lineOorStats.find((o) => o.lineId === b.lineId)?._count.id ?? 0;
      return { name: line ? `${line.company.code} · ${line.code}` : "Unknown", total: b._count.id, oor };
    })
    .sort((a, b) => b.oor - a.oor);

  // 색상 변수
  const passColor = passRate >= 95 ? "#34C759" : passRate >= 85 ? "#F59E0B" : "#FF3B30";

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>QC Daily Report — ${dateStr}</title></head>
<body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#111;line-height:1.5">
  <div style="max-width:640px;margin:0 auto;padding:24px 16px">

    <div style="background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">
      <div style="font-size:11px;font-weight:600;color:#9b9b98;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px">QC Daily Report</div>
      <h1 style="margin:0 0 6px;font-size:24px;font-weight:700;letter-spacing:-0.5px">${dateStr}</h1>
      <p style="margin:0;font-size:14px;color:#6b6b6b">HANSAE MOBILITY · USA Pontiac</p>
    </div>

    <!-- Summary cards -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px">
      <tr>
        <td width="25%" style="padding:0 4px 0 0">
          <div style="background:#fff;border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:700">${total}</div>
            <div style="font-size:10px;font-weight:600;color:#9b9b98;letter-spacing:0.06em;text-transform:uppercase;margin-top:4px">Total</div>
          </div>
        </td>
        <td width="25%" style="padding:0 4px">
          <div style="background:#fff;border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:${passColor}">${passRate}%</div>
            <div style="font-size:10px;font-weight:600;color:#9b9b98;letter-spacing:0.06em;text-transform:uppercase;margin-top:4px">Pass Rate</div>
          </div>
        </td>
        <td width="25%" style="padding:0 4px">
          <div style="background:#fff;border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:${oorCount > 0 ? "#F59E0B" : "#111"}">${oorCount}</div>
            <div style="font-size:10px;font-weight:600;color:#9b9b98;letter-spacing:0.06em;text-transform:uppercase;margin-top:4px">OOR</div>
          </div>
        </td>
        <td width="25%" style="padding:0 0 0 4px">
          <div style="background:#fff;border-radius:12px;padding:16px;text-align:center">
            <div style="font-size:22px;font-weight:700;color:${unresolved > 0 ? "#FF3B30" : "#111"}">${unresolved}</div>
            <div style="font-size:10px;font-weight:600;color:#9b9b98;letter-spacing:0.06em;text-transform:uppercase;margin-top:4px">Unresolved</div>
          </div>
        </td>
      </tr>
    </table>

    ${lineRows.length > 0 ? `
    <div style="background:#fff;border-radius:14px;padding:20px;margin-top:16px">
      <div style="font-size:12px;font-weight:700;color:#9b9b98;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px">Performance by Line</div>
      <table cellpadding="6" cellspacing="0" border="0" width="100%" style="font-size:13px">
        <thead>
          <tr style="border-bottom:1px solid #e6e6e6">
            <th align="left" style="font-weight:600;color:#6b6b6b;font-size:11px;letter-spacing:0.06em;text-transform:uppercase">Line</th>
            <th align="right" style="font-weight:600;color:#6b6b6b;font-size:11px;letter-spacing:0.06em;text-transform:uppercase">Total</th>
            <th align="right" style="font-weight:600;color:#6b6b6b;font-size:11px;letter-spacing:0.06em;text-transform:uppercase">OOR</th>
            <th align="right" style="font-weight:600;color:#6b6b6b;font-size:11px;letter-spacing:0.06em;text-transform:uppercase">Pass %</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows.map((r) => {
            const lineRate = r.total > 0 ? Math.round(((r.total - r.oor) / r.total) * 100) : 100;
            return `<tr style="border-bottom:1px solid #f0f0f0"><td style="font-weight:600">${r.name}</td><td align="right">${r.total}</td><td align="right" style="color:${r.oor > 0 ? "#FF3B30" : "#9b9b98"};font-weight:${r.oor > 0 ? "700" : "400"}">${r.oor || "—"}</td><td align="right" style="font-weight:700;color:${lineRate >= 95 ? "#34C759" : lineRate >= 85 ? "#F59E0B" : "#FF3B30"}">${lineRate}%</td></tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>` : ""}

    ${submissions.length > 0 ? `
    <div style="background:#fff;border-radius:14px;padding:20px;margin-top:16px">
      <div style="font-size:12px;font-weight:700;color:#FF3B30;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px">⚠️ OOR Submissions (${submissions.length})</div>
      ${submissions.map((s) => {
        const time = s.createdAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        return `<div style="padding:10px 0;border-bottom:1px solid #f0f0f0">
          <div style="font-size:14px;font-weight:600">${s.companyName ?? s.line.company.name} · Line ${s.lineName ?? s.line.code} — ${s.modelName ?? s.model?.name ?? "-"}</div>
          <div style="font-size:12px;color:#9b9b98;margin-top:2px">${time}${s.correctiveAction ? " · ✅ Resolved" : " · ⚠️ Unresolved"}</div>
        </div>`;
      }).join("")}
    </div>` : `<div style="background:#fff;border-radius:14px;padding:20px;margin-top:16px;text-align:center;color:#34C759"><strong>✅ No OOR today</strong></div>`}

    <div style="margin-top:24px;text-align:center;font-size:11px;color:#9b9b98">
      Automated report from QC Check Sheet System<br>Generated ${new Date().toLocaleString()}
    </div>

  </div>
</body></html>`;

  const subject = `QC Daily Report — ${dateStr}${oorCount > 0 ? ` (${oorCount} OOR)` : " (All Pass)"}`;

  return { subject, html };
}

export async function sendDailyReport(targetDate?: Date): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = readConfig();
    if (!cfg.emailEnabled) return { ok: false, error: "Email is disabled" };
    if (!cfg.emailTo) return { ok: false, error: "No recipient configured" };

    const { subject, html } = await generateDailyReportEmail(targetDate);
    return await sendMail({ to: cfg.emailTo, subject, html });
  } catch (e) {
    // DB 조회/메일 생성 중 예외도 항상 {ok,error}로 반환 (cron 엔드포인트 500 방지)
    return { ok: false, error: e instanceof Error ? e.message : "Failed to generate/send daily report" };
  }
}
