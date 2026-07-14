// 스펙 매칭 / OOR(범위 이탈) 판정 — 순수 로직.
// submitChecklist, ChecklistForm, submission/print 페이지에서 공통으로 쓰는 규칙의 단일 출처.

export type SpecLike = {
  lineId: number | null;
  modelId: number | null;
  partNumberId: number | null;
  minVal: number | null;
  maxVal: number | null;
  label: string | null;
};

export type SpecContext = {
  lineId: number | null;
  modelId: number | null;
  partNumberId: number | null;
};

// 우선순위: PN > (line+model) > (line만) > (model만) > 전체공통
export function findSpec(specs: SpecLike[], ctx: SpecContext): SpecLike | null {
  const { lineId, modelId, partNumberId } = ctx;
  return (
    (partNumberId ? specs.find((s) => s.partNumberId === partNumberId) : null) ??
    specs.find((s) => s.lineId === lineId && s.modelId === modelId && !s.partNumberId) ??
    specs.find((s) => s.lineId === lineId && s.modelId === null && !s.partNumberId) ??
    specs.find((s) => s.lineId === null && s.modelId === modelId && !s.partNumberId) ??
    specs.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId) ??
    null
  );
}

// 항목 값이 스펙을 벗어났는지. ok_ng는 NG가 OOR, number는 범위 밖이 OOR.
// 빈값/N/A/스펙없음/숫자아님은 OOR 아님 (통과로 간주).
export function isItemOutOfRange(inputType: string, value: string, spec: SpecLike | null): boolean {
  if (inputType === "ok_ng") return value === "NG";
  if (inputType !== "number" || value === "N/A" || value === "") return false;
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  if (!spec) return false;
  if (spec.minVal !== null && num < spec.minVal) return true;
  if (spec.maxVal !== null && num > spec.maxVal) return true;
  return false;
}

// 재측정값(corrected)이 스펙에 맞는지. text 없으면 unknown.
export function correctedStatus(
  inputType: string,
  spec: SpecLike | null,
  text: string | null,
): "pass" | "fail" | "unknown" {
  if (!text) return "unknown";
  if (inputType === "ok_ng") return text.trim().toUpperCase() === "OK" ? "pass" : "fail";
  if (!spec || (spec.minVal === null && spec.maxVal === null)) return "unknown";
  return isItemOutOfRange("number", text, spec) ? "fail" : "pass";
}
