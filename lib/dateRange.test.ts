import { describe, it, expect } from "vitest";
import { parseLocalDay, dayBounds, parseSubmissionDateInput } from "./dateRange";

describe("parseLocalDay — 로컬 자정 파싱 (history 날짜 버그 회귀 방지)", () => {
  it("YYYY-MM-DD를 로컬 자정으로 파싱한다", () => {
    const d = parseLocalDay("2026-06-14");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // 0-based (June)
    expect(d.getDate()).toBe(14);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it("UTC 자정 파싱과 달리 날짜가 밀리지 않는다", () => {
    // new Date("2026-06-14")는 UTC 자정 → 음수 오프셋(미국)에서 getDate()가 13으로 밀릴 수 있다.
    // parseLocalDay는 항상 그 날짜의 로컬 자정이어야 한다.
    expect(parseLocalDay("2026-06-14").getDate()).toBe(14);
    expect(parseLocalDay("2026-01-01").getDate()).toBe(1);
    expect(parseLocalDay("2026-12-31").getDate()).toBe(31);
  });
});

describe("dayBounds — 하루 경계", () => {
  it("start는 00:00:00.000, end는 23:59:59.999", () => {
    const { start, end } = dayBounds(parseLocalDay("2026-06-14"));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
    expect(start.getDate()).toBe(14);
    expect(end.getDate()).toBe(14);
  });

  it("같은 날 from=to 검색이 그 날 로컬 자정 저장 데이터를 포함한다", () => {
    // 제출은 로컬 자정으로 저장됨. from=to=같은 날이면 [start, end] 안에 그 자정이 들어와야 한다.
    const stored = parseLocalDay("2026-06-14"); // 로컬 자정 저장값
    const { start, end } = dayBounds(parseLocalDay("2026-06-14"));
    expect(stored.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(stored.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});

describe("parseSubmissionDateInput — 제출 저장 날짜", () => {
  it("HTML date input 값을 로컬 날짜 그대로 저장한다", () => {
    const d = parseSubmissionDateInput("2026-06-16");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(0);
  });
});
