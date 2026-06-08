import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { sendDailyReport } from "@/lib/dailyReport";

// 스케줄러용 일일 리포트 발송 엔드포인트
// 인증: Authorization: Bearer <CRON_TOKEN> 헤더 (URL query 사용 시 로그에 토큰 노출 위험)
// Windows 작업 스케줄러에서 매일 아침 8시에 호출:
//   curl -s -H "Authorization: Bearer YOUR_TOKEN" "https://your-server/api/cron/daily-report"

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_TOKEN;

  // CRON_TOKEN 미설정 시 호출 거부
  if (!expected) {
    return NextResponse.json({ ok: false, error: "CRON_TOKEN not configured" }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  // timing-safe 비교로 토큰 길이 유추 공격 방지
  const a = Buffer.from(token.padEnd(expected.length));
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b) && token === expected;

  if (!valid) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const result = await sendDailyReport();
  if (result.ok) {
    return NextResponse.json({ ok: true, sentAt: new Date().toISOString() });
  } else {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
}
