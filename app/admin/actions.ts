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

// ── Template Delete ──────────────────────────────────────

export async function deleteTemplate(templateId: number) {
  await requireAdmin();
  // 제출 기록이 있으면 삭제 차단
  const subCount = await prisma.submission.count({ where: { templateId } });
  if (subCount > 0) {
    return { error: `제출 기록 ${subCount}건이 있어 삭제할 수 없습니다.` };
  }
  // 연결 데이터 정리 후 삭제
  await prisma.templateModel.deleteMany({ where: { templateId } });
  await prisma.partNumberTemplate.deleteMany({ where: { templateId } });
  await prisma.chartTemplate.deleteMany({ where: { templateId } });
  const items = await prisma.checkItem.findMany({ where: { templateId }, select: { id: true } });
  const itemIds = items.map((i) => i.id);
  if (itemIds.length) {
    await prisma.specRange.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.chartMetric.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.checkItem.deleteMany({ where: { templateId } });
  }
  await prisma.checksheetTemplate.delete({ where: { id: templateId } });
  revalidatePath("/admin/templates");
  revalidatePath("/company", "layout");
}

// 템플릿 복제 — 항목/스펙/차트 설정까지 통째로 복사 (모델/PN 링크는 복사 안 함)
export async function duplicateTemplate(templateId: number) {
  await requireAdmin();
  const src = await prisma.checksheetTemplate.findUnique({
    where: { id: templateId },
    include: {
      items: { include: { specRanges: true, chartMetric: true } },
      chartTemplate: true,
    },
  });
  if (!src) return { error: "템플릿을 찾을 수 없습니다." };

  const newCode = `${src.code}-copy`;

  const maxOrder = await prisma.checksheetTemplate.aggregate({ _max: { sortOrder: true } });

  const created = await prisma.checksheetTemplate.create({
    data: {
      code: newCode,
      name: `${src.name} (Copy)`,
      version: src.version,
      sampleCount: src.sampleCount,
      sampleLabels: src.sampleLabels,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      note: src.note,
    },
  });

  // 항목 + 스펙 + 차트메트릭 복사
  for (const item of src.items) {
    const newItem = await prisma.checkItem.create({
      data: {
        templateId: created.id,
        section: item.section,
        opNo: item.opNo,
        no: item.no,
        characteristic: item.characteristic,
        method: item.method,
        sample: item.sample,
        inputType: item.inputType,
        unit: item.unit,
        nullable: item.nullable,
        department: item.department,
        sortOrder: item.sortOrder,
      },
    });
    if (item.specRanges.length) {
      await prisma.specRange.createMany({
        data: item.specRanges.map((s) => ({
          itemId: newItem.id,
          lineId: s.lineId,
          modelId: s.modelId,
          partNumberId: s.partNumberId,
          minVal: s.minVal,
          maxVal: s.maxVal,
          label: s.label,
        })),
      });
    }
    if (item.chartMetric) {
      await prisma.chartMetric.create({
        data: { itemId: newItem.id, metric: item.chartMetric.metric, unit: item.chartMetric.unit },
      });
    }
  }

  // 차트 템플릿 설정 복사
  if (src.chartTemplate) {
    await prisma.chartTemplate.create({ data: { templateId: created.id } });
  }

  revalidatePath("/admin/templates");
  return { ok: true, newId: created.id };
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
  responsible: string;
}) {
  await requireAdmin();
  await prisma.checksheetTemplate.update({
    where: { id: templateId },
    data: {
      code: data.code.trim(),
      name:         data.name.trim(),
      version:      data.version.trim(),
      sampleCount:  data.sampleCount,
      sampleLabels: data.sampleLabels.trim(),
      note:         data.note.trim() || null,
      responsible:  data.responsible.trim() || null,
    },
  });
  revalidatePath(`/admin/templates/${templateId}`);
  revalidatePath("/admin/templates");
  revalidatePath("/company", "layout");
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
  // 새 항목은 템플릿 내 현재 최대 sortOrder + 1 (항상 맨 끝에 추가)
  const maxRow = await prisma.checkItem.aggregate({ where: { templateId }, _max: { sortOrder: true } });
  const nextOrder = (maxRow._max.sortOrder ?? -1) + 1;
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
      sortOrder: nextOrder,
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

export async function updateCheckItemNote(itemId: number, templateId: number, note: string) {
  await requireAdmin();
  await prisma.checkItem.update({
    where: { id: itemId },
    data: { note: note.trim() || null },
  });
  revalidatePath(`/admin/templates/${templateId}`);
}

// ↑/↓ 이동: 같은 섹션 안에서만 (sortOrder 기준)
export async function moveCheckItem(itemId: number, templateId: number, direction: "up" | "down") {
  await requireAdmin();
  const item = await prisma.checkItem.findUnique({ where: { id: itemId }, select: { section: true } });
  if (!item) return;

  let siblings = await prisma.checkItem.findMany({
    where: { templateId, section: item.section },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, sortOrder: true },
  });

  // sortOrder 중복이면 0..N-1 정규화
  const hasDup = new Set(siblings.map((i) => i.sortOrder)).size !== siblings.length;
  if (hasDup) {
    await prisma.$transaction(
      siblings.map((s, i) => prisma.checkItem.update({ where: { id: s.id }, data: { sortOrder: i } }))
    );
    siblings = await prisma.checkItem.findMany({
      where: { templateId, section: item.section },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { id: true, sortOrder: true },
    });
  }

  const idx = siblings.findIndex((i) => i.id === itemId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= siblings.length) return;

  const a = siblings[idx];
  const b = siblings[swapIdx];
  await prisma.$transaction([
    prisma.checkItem.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    prisma.checkItem.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);
  revalidatePath(`/admin/templates/${templateId}`);
}

// 드래그 앤 드롭: 같은 섹션 안에서 itemId 를 targetId 위치로 이동
export async function reorderCheckItemTo(itemId: number, targetId: number, templateId: number) {
  await requireAdmin();
  if (itemId === targetId) return;

  const [src, dst] = await Promise.all([
    prisma.checkItem.findUnique({ where: { id: itemId },   select: { section: true } }),
    prisma.checkItem.findUnique({ where: { id: targetId }, select: { section: true } }),
  ]);
  // 다른 섹션이면 무시
  if (!src || !dst || src.section !== dst.section) return;

  const siblings = await prisma.checkItem.findMany({
    where: { templateId, section: src.section },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  const fromIdx = siblings.findIndex((i) => i.id === itemId);
  const toIdx   = siblings.findIndex((i) => i.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return;

  const reordered = [...siblings];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);

  await prisma.$transaction(
    reordered.map((s, i) => prisma.checkItem.update({ where: { id: s.id }, data: { sortOrder: i } }))
  );
  revalidatePath(`/admin/templates/${templateId}`);
}

export async function moveCheckSection(templateId: number, section: string, direction: "up" | "down") {
  await requireAdmin();
  const sectionName = section.trim();
  if (!sectionName) return;

  const items = await prisma.checkItem.findMany({
    where: { templateId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, section: true },
  });

  const sections: string[] = [];
  for (const item of items) {
    if (!sections.includes(item.section)) sections.push(item.section);
  }

  const idx = sections.findIndex((s) => s === sectionName);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= sections.length) return;

  const reorderedSections = [...sections];
  const movedSection = reorderedSections[idx];
  if (movedSection === undefined) return;
  reorderedSections.splice(idx, 1);
  reorderedSections.splice(swapIdx, 0, movedSection);

  const reorderedItems = reorderedSections.flatMap((name) => items.filter((item) => item.section === name));
  await prisma.$transaction(
    reorderedItems.map((item, i) => prisma.checkItem.update({ where: { id: item.id }, data: { sortOrder: i } }))
  );
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

// 스펙 추가/수정 — 한 항목에 스펙 여러 개 가능(IB/OB 등). 파트넘버 지정 시 모든 라인 사본에 적용.
// oldIds 가 있으면 그 스펙들을 교체(수정), 비어있으면 신규 추가. partNumberId === null 이면 전체(global).
export async function saveSpecGroup(itemId: number, templateId: number, data: {
  oldIds: number[];
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

  // 적용 대상 partNumber id 목록 (전체면 [null], 파트넘버면 모든 라인 사본)
  const targetIds: (number | null)[] = data.partNumberId !== null
    ? await siblingPartNumberIds(data.partNumberId)
    : [null];

  // 수정이면 기존 스펙 제거 후 재생성을 트랜잭션으로 (원자성)
  await prisma.$transaction([
    ...(data.oldIds.length ? [prisma.specRange.deleteMany({ where: { id: { in: data.oldIds } } })] : []),
    prisma.specRange.createMany({ data: targetIds.map((pid) => ({ itemId, partNumberId: pid, minVal, maxVal, label })) }),
  ]);
  revalidatePath(`/admin/templates/${templateId}`);
}

// 스펙 삭제 — 주어진 스펙 id들(한 그룹의 라인 사본 전부)을 제거.
export async function deleteSpecRangeByIds(ids: number[], templateId: number) {
  await requireAdmin();
  if (ids.length) await prisma.specRange.deleteMany({ where: { id: { in: ids } } });
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

// ── Shift Config ──────────────────────────────────────────
// 시프트는 고정 3개(1st/2nd/3rd)이므로 추가/삭제 없이 수정만 지원

export async function updateShiftConfig(formData: FormData) {
  await requireAdmin();
  const id          = Number(formData.get("id"));
  const name        = (formData.get("name") as string).trim();
  const startHour   = Number(formData.get("startHour"));
  const startMinute = Number(formData.get("startMinute"));
  const endHour     = Number(formData.get("endHour"));
  const endMinute   = Number(formData.get("endMinute"));
  const isActive    = formData.get("isActive") === "true";
  if (!id || !name) return;
  await prisma.shiftConfig.update({ where: { id }, data: { name, startHour, startMinute, endHour, endMinute, isActive } });
  revalidatePath("/SWJ/shifts");
}
