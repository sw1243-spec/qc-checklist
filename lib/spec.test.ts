import { describe, it, expect } from "vitest";
import { findSpec, isItemOutOfRange, correctedStatus, type SpecLike } from "./spec";

const spec = (p: Partial<SpecLike>): SpecLike => ({
  lineId: null, modelId: null, partNumberId: null, minVal: null, maxVal: null, label: null, ...p,
});

describe("findSpec — 우선순위", () => {
  const pnSpec    = spec({ partNumberId: 5, minVal: 1, maxVal: 2 });
  const lineModel = spec({ lineId: 1, modelId: 2, minVal: 10, maxVal: 20 });
  const lineOnly  = spec({ lineId: 1, minVal: 30, maxVal: 40 });
  const modelOnly = spec({ modelId: 2, minVal: 50, maxVal: 60 });
  const global    = spec({ minVal: 70, maxVal: 80 });
  const all = [global, modelOnly, lineOnly, lineModel, pnSpec];

  it("PN 스펙이 최우선", () => {
    expect(findSpec(all, { lineId: 1, modelId: 2, partNumberId: 5 })).toBe(pnSpec);
  });
  it("PN 없으면 line+model", () => {
    expect(findSpec(all, { lineId: 1, modelId: 2, partNumberId: null })).toBe(lineModel);
  });
  it("line만 매칭", () => {
    expect(findSpec(all, { lineId: 1, modelId: 99, partNumberId: null })).toBe(lineOnly);
  });
  it("model만 매칭", () => {
    expect(findSpec(all, { lineId: 99, modelId: 2, partNumberId: null })).toBe(modelOnly);
  });
  it("아무것도 안 맞으면 전체공통", () => {
    expect(findSpec(all, { lineId: 99, modelId: 99, partNumberId: null })).toBe(global);
  });
  it("스펙 없으면 null", () => {
    expect(findSpec([], { lineId: 1, modelId: 2, partNumberId: 5 })).toBeNull();
  });
});

describe("isItemOutOfRange — number", () => {
  const s = spec({ minVal: 104.8, maxVal: 105.2 });
  it("범위 안은 통과", () => expect(isItemOutOfRange("number", "105.0", s)).toBe(false));
  it("하한 경계 통과", () => expect(isItemOutOfRange("number", "104.8", s)).toBe(false));
  it("상한 경계 통과", () => expect(isItemOutOfRange("number", "105.2", s)).toBe(false));
  it("하한 미만 OOR", () => expect(isItemOutOfRange("number", "104.7", s)).toBe(true));
  it("상한 초과 OOR", () => expect(isItemOutOfRange("number", "155", s)).toBe(true));
  it("빈값 통과", () => expect(isItemOutOfRange("number", "", s)).toBe(false));
  it("N/A 통과", () => expect(isItemOutOfRange("number", "N/A", s)).toBe(false));
  it("숫자 아니면 통과", () => expect(isItemOutOfRange("number", "abc", s)).toBe(false));
  it("스펙 없으면 통과", () => expect(isItemOutOfRange("number", "9999", null)).toBe(false));
  it("max만 있는 스펙", () => {
    expect(isItemOutOfRange("number", "3", spec({ maxVal: 2.5 }))).toBe(true);
    expect(isItemOutOfRange("number", "2", spec({ maxVal: 2.5 }))).toBe(false);
  });
});

describe("isItemOutOfRange — ok_ng", () => {
  it("NG는 OOR", () => expect(isItemOutOfRange("ok_ng", "NG", null)).toBe(true));
  it("OK는 통과", () => expect(isItemOutOfRange("ok_ng", "OK", null)).toBe(false));
  it("빈값 통과", () => expect(isItemOutOfRange("ok_ng", "", null)).toBe(false));
});

describe("correctedStatus", () => {
  const s = spec({ minVal: 104.8, maxVal: 105.2 });
  it("재측정값 없으면 unknown", () => expect(correctedStatus("number", s, "")).toBe("unknown"));
  it("범위 안 재측정은 pass", () => expect(correctedStatus("number", s, "105.0")).toBe("pass"));
  it("범위 밖 재측정은 fail", () => expect(correctedStatus("number", s, "200")).toBe("fail"));
  it("ok_ng OK는 pass", () => expect(correctedStatus("ok_ng", null, "OK")).toBe("pass"));
  it("ok_ng NG는 fail", () => expect(correctedStatus("ok_ng", null, "NG")).toBe("fail"));
});
