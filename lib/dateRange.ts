// 날짜 범위 계산 — 순수 로직.
// "YYYY-MM-DD"를 new Date()에 그냥 넣으면 UTC 자정으로 파싱돼 타임존이 어긋난다.
// 제출(submission.date)은 로컬 자정으로 저장되므로, 조회 경계도 로컬 자정으로 맞춰야 한다.

// "YYYY-MM-DD" → 로컬 자정 Date
export function parseLocalDay(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00");
}

export function parseSubmissionDateInput(dateStr: string): Date {
  return parseLocalDay(dateStr);
}

// 하루의 시작(00:00:00.000)과 끝(23:59:59.999)
export function dayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end };
}
