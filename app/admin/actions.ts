"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// 템플릿 표시 순서 저장 (드래그 정렬). ids = 새 순서대로의 템플릿 id 배열
export async function reorderTemplates(ids: number[]) {
  await requireAdmin();
  await prisma.$transaction(
    ids.map((id, i) => prisma.checksheetTemplate.update({ where: { id }, data: { sortOrder: i } }))
  );
  revalidatePath("/admin/templates");
}

// ── Template Create ───────────────────────────────────────

export async function createTemplate(formData: FormData) {
  await requireAdmin();
  const code         = (formData.get("code")         as string).trim();
  const name         = (formData.get("name")         as string).trim();
  const version      = (formData.get("version")      as string).trim();
  const sampleCount  = Number(formData.get("sampleCount"))  || 2;
  const sampleLabels = (formData.get("sampleLabels") as string).trim() || "P#1,P#2";

  if (!code || !name || !version) return;

  const created = await prisma.checksheetTemplate.create({
    data: { code, name, version, sampleCount, sampleLabels },
  });

  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${created.id}`);
}

// ── Template Update ──────────────────────────────────────

export async function updateTemplate(templateId: number, data: {
  code: string;
  name: string;
  version: string;
  sampleCount: number;
  sampleLabels: string;
  note: string;
}) {
  await requireAdmin();
  await prisma.checksheetTemplate.update({
    where: { id: templateId },
    data: {
      code:         data.code.trim(),
      name:         data.name.trim(),
      version:      data.version.trim(),
      sampleCount:  data.sampleCount,
      sampleLabels: data.sampleLabels.trim(),
      note:         data.note.trim() || null,
    },
  });
  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath("/admin/templates");
}

// ── Check Items ──────────────────────────────────────────

export async function createCheckItem(templateId: number, data: {
  section: string;
  no: number;
  characteristic: string;
  method: string;
  inputType: string;
  unit: string;
  nullable: boolean;
  opNo: string;
  department?: string;
}) {
  await requireAdmin();
  await prisma.checkItem.create({
    data: {
      templateId,
      section: data.section.trim(),
      no: data.no,
      characteristic: data.characteristic.trim(),
      method: data.method.trim() || null,
      inputType: data.inputType,
      unit: data.unit.trim() || null,
      nullable: data.nullable,
      opNo: data.opNo.trim() || null,
      department: data.department || null,
    },
  });
  revalidatePath(`/admin/templates/${templateId}`);
}

export async function updateCheckItem(itemId: number, templateId: number, data: {
  section: string;
  no: number;
  characteristic: string;
  method: string;
  inputType: string;
  unit: string;
  nullable: boolean;
  opNo: string;
  department?: string;
}) {
  await requireAdmin();
  await prisma.checkItem.update({
    where: { id: itemId },
    data: {
      section: data.section.trim(),
      no: data.no,
      characteristic: data.characteristic.trim(),
      method: data.method.trim() || null,
      inputType: data.inputType,
      unit: data.unit.trim() || null,
      nullable: data.nullable,
      opNo: data.opNo.trim() || null,
      department: data.department || null,
    },
  });
  revalidatePath(`/admin/templates/${templateId}`);
}

// 같은 섹션 안에서 항목 순서 이동 (인접 항목과 no 값 교환)
export async function moveCheckItem(itemId: number, templateId: number, direction: "up" | "down") {
  await requireAdmin();
  const item = await prisma.checkItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  // 같은 템플릿·같은 섹션의 형제 항목들을 표시 순서대로
  const siblings = await prisma.checkItem.findMany({
    where: { templateId, section: item.section },
    orderBy: { no: "asc" },
    select: { id: true, no: true },
  });

  const idx = siblings.findIndex((s) => s.id === itemId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return; // 경계면 무시

  const a = siblings[idx];
  const b = siblings[swapIdx];

  // no 값이 같으면 교환이 무의미 → 섹션 전체를 1..N 으로 재정렬 후 교환
  if (a.no === b.no) {
    let n = 1;
    for (const s of siblings) {
      await prisma.checkItem.update({ where: { id: s.id }, data: { no: n++ } });
    }
    const fresh = await prisma.checkItem.findMany({
      where: { templateId, section: item.section },
      orderBy: { no: "asc" },
      select: { id: true, no: true },
    });
    const fa = fresh[idx], fb = fresh[swapIdx];
    await prisma.$transaction([
      prisma.checkItem.update({ where: { id: fa.id }, data: { no: fb.no } }),
      prisma.checkItem.update({ where: { id: fb.id }, data: { no: fa.no } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.checkItem.update({ where: { id: a.id }, data: { no: b.no } }),
      prisma.checkItem.update({ where: { id: b.id }, data: { no: a.no } }),
    ]);
  }

  revalidatePath(`/admin/templates/${templateId}`);
}

export async function deleteCheckItem(itemId: number, templateId: number) {
  await requireAdmin();
  await prisma.specRange.deleteMany({ where: { itemId } });
  await prisma.checkValue.deleteMany({ where: { itemId } });
  await prisma.checkItem.delete({ where: { id: itemId } });
  revalidatePath(`/admin/templates/${templateId}`);
}

// ── Spec Ranges ──────────────────────────────────────────

export async function upsertSpecRange(itemId: number, templateId: number, data: {
  id?: number;
  label: string;
  minVal: string;
  maxVal: string;
  lineId: string;
  modelId: string;
  partNumberId: string;
  applyAllLines?: boolean; // 파트넘버 스펙을 같은 PN의 모든 라인 사본에 함께 적용
}) {
  await requireAdmin();
  const payload = {
    itemId,
    label: data.label.trim() || null,
    minVal: data.minVal !== "" ? parseFloat(data.minVal) : null,
    maxVal: data.maxVal !== "" ? parseFloat(data.maxVal) : null,
    lineId: data.lineId !== "" ? parseInt(data.lineId) : null,
    modelId: data.modelId !== "" ? parseInt(data.modelId) : null,
    partNumberId: data.partNumberId !== "" ? parseInt(data.partNumberId) : null,
  };

  // 가드레일 #1: number 항목은 min/max 중 최소 하나는 있어야 함 (없으면 판정 불가)
  const item = await prisma.checkItem.findUnique({ where: { id: itemId } });
  if (item?.inputType === "number" && payload.minVal === null && payload.maxVal === null) {
    return { error: "Number items require at least one of Min or Max (without a range, pass/fail cannot be judged)." };
  }

  // 같은 항목 + 같은 적용 범위(라인/모델/파트넘버)에 스펙이 이미 있으면 중복 차단
  const dup = await prisma.specRange.findFirst({
    where: {
      itemId,
      lineId: payload.lineId,
      modelId: payload.modelId,
      partNumberId: payload.partNumberId,
      ...(data.id ? { id: { not: data.id } } : {}),
    },
  });
  if (dup) {
    return { error: "A spec range for this exact scope (line/model/part number) already exists. Edit the existing one instead." };
  }

  if (data.id) {
    await prisma.specRange.update({ where: { id: data.id }, data: payload });
  } else {
    await prisma.specRange.create({ data: payload });
  }

  // 가드레일 #2: "모든 라인 적용" — 같은 회사 안의 동일 모델명·동일 PN코드를 가진
  // 다른 라인 사본들에도 같은 스펙을 생성 (라인 누락 방지). 신규 생성 시에만 동작.
  if (!data.id && data.applyAllLines && payload.partNumberId) {
    const src = await prisma.partNumber.findUnique({
      where: { id: payload.partNumberId },
      include: { model: { include: { line: true } } },
    });
    if (src) {
      const siblings = await prisma.partNumber.findMany({
        where: {
          id: { not: src.id },
          code: src.code,
          model: { name: src.model.name, line: { companyId: src.model.line.companyId } },
        },
      });
      for (const sib of siblings) {
        const exists = await prisma.specRange.findFirst({ where: { itemId, partNumberId: sib.id } });
        if (!exists) {
          await prisma.specRange.create({ data: { ...payload, partNumberId: sib.id } });
        }
      }
    }
  }
  revalidatePath(`/admin/templates/${templateId}`);
}

export async function deleteSpecRange(specId: number, templateId: number) {
  await requireAdmin();
  await prisma.specRange.delete({ where: { id: specId } });
  revalidatePath(`/admin/templates/${templateId}`);
}

// 같은 회사·모델·코드를 가진 모든 라인 사본의 partNumber id (자기 포함)
async function siblingPartNumberIds(partNumberId: number): Promise<number[]> {
  const src = await prisma.partNumber.findUnique({
    where: { id: partNumberId },
    include: { model: { include: { line: true } } },
  });
  if (!src) return [partNumberId];
  const sibs = await prisma.partNumber.findMany({
    where: { code: src.code, model: { name: src.model.name, line: { companyId: src.model.line.companyId } } },
    select: { id: true },
  });
  return sibs.length ? sibs.map((s) => s.id) : [partNumberId];
}

// 논리적 파트넘버(코드) 단위 스펙 설정 — 모든 라인 사본에 동일하게 적용.
// partNumberId === null 이면 전체(global) 스펙.
export async function upsertSpecRangeGroup(itemId: number, templateId: number, data: {
  partNumberId: number | null;
  minVal: string;
  maxVal: string;
  label: string;
}) {
  await requireAdmin();
  const minVal = data.minVal !== "" ? parseFloat(data.minVal) : null;
  const maxVal = data.maxVal !== "" ? parseFloat(data.maxVal) : null;
  const label = data.label.trim() || null;

  const item = await prisma.checkItem.findUnique({ where: { id: itemId } });
  if (item?.inputType === "number" && minVal === null && maxVal === null) {
    return { error: "Number items require at least one of Min or Max (without a range, pass/fail cannot be judged)." };
  }

  if (data.partNumberId === null) {
    // 전체(global) 스펙: 기존 1개 갱신, 없으면 생성
    const existing = await prisma.specRange.findFirst({ where: { itemId, partNumberId: null, lineId: null, modelId: null } });
    if (existing) await prisma.specRange.update({ where: { id: existing.id }, data: { minVal, maxVal, label } });
    else await prisma.specRange.create({ data: { itemId, minVal, maxVal, label } });
  } else {
    // 파트넘버 스펙: 모든 라인 사본에 동일하게 (기존 제거 후 재생성)
    // deleteMany + createMany 를 트랜잭션으로 묶어 중간 실패 시 스펙 유실 방지
    const ids = await siblingPartNumberIds(data.partNumberId);
    await prisma.$transaction([
      prisma.specRange.deleteMany({ where: { itemId, partNumberId: { in: ids } } }),
      prisma.specRange.createMany({ data: ids.map((pid) => ({ itemId, partNumberId: pid, minVal, maxVal, label })) }),
    ]);
  }
  revalidatePath(`/admin/templates/${templateId}`);
}

// 논리적 파트넘버(코드) 단위 스펙 삭제 — 모든 라인 사본 제거. partNumberId === null 이면 global 삭제.
export async function deleteSpecRangeGroup(itemId: number, templateId: number, partNumberId: number | null) {
  await requireAdmin();
  if (partNumberId === null) {
    await prisma.specRange.deleteMany({ where: { itemId, partNumberId: null, lineId: null, modelId: null } });
  } else {
    const ids = await siblingPartNumberIds(partNumberId);
    await prisma.specRange.deleteMany({ where: { itemId, partNumberId: { in: ids } } });
  }
  revalidatePath(`/admin/templates/${templateId}`);
}

// ── Trend Chart 설정 ─────────────────────────────────────

// 체크시트를 Trend Chart 에 포함/제외
export async function toggleChartTemplate(templateId: number, included: boolean) {
  await requireAdmin();
  if (included) {
    await prisma.chartTemplate.upsert({
      where: { templateId },
      update: {},
      create: { templateId },
    });
  } else {
    await prisma.chartTemplate.deleteMany({ where: { templateId } });
  }
  revalidatePath("/admin/chart");
}

// 항목별 측정값 종류/단위 지정. metric=null 이면 차트에서 제외
export async function setChartMetric(itemId: number, metric: string | null, unit: string) {
  await requireAdmin();
  if (!metric) {
    await prisma.chartMetric.deleteMany({ where: { itemId } });
  } else {
    const cleanUnit = unit.trim() || null;
    await prisma.chartMetric.upsert({
      where: { itemId },
      update: { metric, unit: cleanUnit },
      create: { itemId, metric, unit: cleanUnit },
    });
  }
  revalidatePath("/admin/chart");
}

// 항목 이름으로 IB/OB/Weight 자동 추측 후 채워넣기 (초기 세팅 편의용)
export async function autoDetectChartMetrics() {
  await requireAdmin();
  const included = await prisma.chartTemplate.findMany({ select: { templateId: true } });
  const templateIds = included.map((t) => t.templateId);
  if (templateIds.length === 0) return;

  const items = await prisma.checkItem.findMany({
    where: { templateId: { in: templateIds }, inputType: "number" },
    select: { id: true, section: true, characteristic: true, unit: true },
  });

  for (const it of items) {
    const hay = `${it.section} ${it.characteristic}`.toLowerCase();
    const isSwaging = hay.includes("swag");
    let metric: string | null = null;
    let unit = it.unit ?? "";
    if (isSwaging && (hay.includes("inboard") || hay.includes("(ib)") || hay.includes("ib "))) {
      metric = "ib"; unit = it.unit ?? "mm";
    } else if (isSwaging && (hay.includes("outboard") || hay.includes("(ob)") || hay.includes("ob "))) {
      metric = "ob"; unit = it.unit ?? "mm";
    } else if (hay.includes("weight")) {
      metric = "weight"; unit = it.unit ?? "g";
    }
    if (metric) {
      await prisma.chartMetric.upsert({
        where: { itemId: it.id },
        update: { metric, unit: unit || null },
        create: { itemId: it.id, metric, unit: unit || null },
      });
    }
  }
  revalidatePath("/admin/chart");
}

// ── Workers ──────────────────────────────────────────────

export async function createWorker(formData: FormData) {
  await requireAdmin();
  const name   = (formData.get("name")   as string).trim();
  const role   = (formData.get("role")   as string).trim();
  const lineId = formData.get("lineId") ? Number(formData.get("lineId")) : null;
  const shift  = formData.get("shift") ? Number(formData.get("shift")) : null;
  if (!name || !role) return;
  await prisma.worker.create({ data: { name, role, lineId, shift } });
  revalidatePath("/admin/workers");
}

export async function deleteWorker(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!id) return;
  await prisma.worker.delete({ where: { id } });
  revalidatePath("/admin/workers");
}
