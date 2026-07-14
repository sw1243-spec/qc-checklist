import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// 데모용 익명 시드 데이터입니다.
// 실제 사업 데이터(고객사·파트넘버·공차)는 저장소에 포함하지 않습니다.
// 여기서는 스키마와 주요 기능(회사→라인→모델→템플릿→점검항목→규격/
// 파트넘버별 스펙)을 그대로 시연하기 위한 가상의 값만 사용합니다.
// ─────────────────────────────────────────────────────────────

async function upsertTemplateByCode(
  code: string,
  update: Prisma.ChecksheetTemplateUpdateInput,
  create: Prisma.ChecksheetTemplateCreateInput,
) {
  const existing = await prisma.checksheetTemplate.findFirst({
    where: { code },
    orderBy: { id: "asc" },
  });
  if (!existing) return prisma.checksheetTemplate.create({ data: create });
  return prisma.checksheetTemplate.update({ where: { id: existing.id }, data: update });
}

async function main() {
  // ── 회사 (가상 고객사) ─────────────────────────────────
  const custA = await prisma.company.upsert({
    where: { code: "CUST_A" },
    update: {},
    create: { code: "CUST_A", name: "Customer A" },
  });
  const custB = await prisma.company.upsert({
    where: { code: "CUST_B" },
    update: {},
    create: { code: "CUST_B", name: "Customer B" },
  });

  // ── 라인 ───────────────────────────────────────────────
  const aLines: Record<string, { id: number }> = {};
  for (const code of ["A", "B", "C"]) {
    aLines[code] = await prisma.line.upsert({
      where: { companyId_code: { companyId: custA.id, code } },
      update: {},
      create: { companyId: custA.id, code },
    });
  }
  const bLines: Record<string, { id: number }> = {};
  for (const code of ["1", "2"]) {
    bLines[code] = await prisma.line.upsert({
      where: { companyId_code: { companyId: custB.id, code } },
      update: {},
      create: { companyId: custB.id, code },
    });
  }

  // ── 모델 ───────────────────────────────────────────────
  const aModelNames = ["Model X1", "Model X2", "Model X3"];
  const aModels: Record<string, { id: number }> = {};
  for (const linecode of ["A", "B", "C"]) {
    for (const name of aModelNames) {
      const line = aLines[linecode];
      const existing = await prisma.model.findFirst({ where: { lineId: line.id, name } });
      aModels[`${linecode}-${name}`] =
        existing ?? (await prisma.model.create({ data: { lineId: line.id, name } }));
    }
  }
  const bModels: Record<string, { id: number }> = {};
  for (const lc of ["1", "2"]) {
    const line = bLines[lc];
    const name = "Assembly Y";
    const existing = await prisma.model.findFirst({ where: { lineId: line.id, name } });
    bModels[`${lc}-Y`] = existing ?? (await prisma.model.create({ data: { lineId: line.id, name } }));
  }

  // ── Customer A: 머신 점검 템플릿 (number / ok_ng 혼합) ──────
  const aTemplate = await upsertTemplateByCode(
    "DOC-100",
    { sampleCount: 2, sampleLabels: "P#1,P#2" },
    {
      code: "DOC-100",
      name: "Customer A Machine Check Sheet",
      version: "Rev A",
      sampleCount: 2,
      sampleLabels: "P#1,P#2",
    },
  );

  for (const [, model] of Object.entries(aModels)) {
    const existing = await prisma.templateModel.findUnique({
      where: { templateId_modelId: { templateId: aTemplate.id, modelId: model.id } },
    });
    if (!existing) {
      await prisma.templateModel.create({ data: { templateId: aTemplate.id, modelId: model.id } });
    }
  }

  // 재시드 안전을 위해 기존 항목 정리
  const aItemIds = await prisma.checkItem.findMany({ where: { templateId: aTemplate.id }, select: { id: true } });
  await prisma.checkValue.deleteMany({ where: { itemId: { in: aItemIds.map((i) => i.id) } } });
  await prisma.specRange.deleteMany({ where: { item: { templateId: aTemplate.id } } });
  await prisma.checkItem.deleteMany({ where: { templateId: aTemplate.id } });

  const a1 = await prisma.checkItem.create({
    data: {
      templateId: aTemplate.id, section: "MACHINE CHECK", opNo: "OP #10", no: 1,
      characteristic: "Clamp Pressure", method: "Read controller value",
      sample: "1ea/Shift", inputType: "number", unit: "bar", nullable: false,
    },
  });
  await prisma.specRange.create({ data: { itemId: a1.id, minVal: 5, label: "Min 5 bar" } });

  await prisma.checkItem.create({
    data: {
      templateId: aTemplate.id, section: "MACHINE CHECK", opNo: "OP #10", no: 2,
      characteristic: "Jaw Condition", method: "Visual",
      sample: "1ea/Shift", inputType: "ok_ng", nullable: false,
    },
  });

  const a3 = await prisma.checkItem.create({
    data: {
      templateId: aTemplate.id, section: "ASSEMBLY", opNo: "#30", no: 3,
      characteristic: "Grease Amount", method: "Electronic Scale",
      sample: "1ea/Shift", inputType: "number", unit: "g", nullable: false,
    },
  });
  for (const linecode of ["A", "B", "C"]) {
    const model = aModels[`${linecode}-Model X1`];
    await prisma.specRange.create({
      data: { itemId: a3.id, modelId: model.id, minVal: 85, maxVal: 95, label: "85~95 g (Model X1)" },
    });
  }

  const a4 = await prisma.checkItem.create({
    data: {
      templateId: aTemplate.id, section: "ERROR PROOF", opNo: "30-1", no: 4,
      characteristic: "Height Check", method: "Setting Master",
      sample: "1ea/Shift", inputType: "number", unit: "mm", nullable: false,
    },
  });
  await prisma.specRange.create({ data: { itemId: a4.id, lineId: aLines["A"].id, minVal: 104.8, maxVal: 105.2, label: "Line A: 104.8~105.2 mm" } });
  await prisma.specRange.create({ data: { itemId: a4.id, lineId: aLines["C"].id, minVal: 107.1, maxVal: 107.5, label: "Line C: 107.1~107.5 mm" } });

  // ── Customer B: PC 점검 템플릿 (파트넘버별 스펙) ───────────
  const bTemplate = await upsertTemplateByCode(
    "DOC-200",
    { sampleCount: 3, sampleLabels: "1st,Mid,Last" },
    {
      code: "DOC-200",
      name: "Customer B PC Check Sheet",
      version: "Rev A",
      sampleCount: 3,
      sampleLabels: "1st,Mid,Last",
    },
  );
  for (const key of ["1-Y", "2-Y"]) {
    const ex = await prisma.templateModel.findUnique({
      where: { templateId_modelId: { templateId: bTemplate.id, modelId: bModels[key].id } },
    });
    if (!ex) await prisma.templateModel.create({ data: { templateId: bTemplate.id, modelId: bModels[key].id } });
  }
  {
    const ids = await prisma.checkItem.findMany({ where: { templateId: bTemplate.id }, select: { id: true } });
    await prisma.checkValue.deleteMany({ where: { itemId: { in: ids.map((i) => i.id) } } });
    await prisma.specRange.deleteMany({ where: { item: { templateId: bTemplate.id } } });
    await prisma.specRange.deleteMany({ where: { partNumber: { templateId: bTemplate.id } } });
    await prisma.partNumber.deleteMany({ where: { templateId: bTemplate.id } });
    await prisma.checkItem.deleteMany({ where: { templateId: bTemplate.id } });
  }

  await prisma.checkItem.create({ data: { templateId: bTemplate.id, section: "WEIGHT", no: 1, characteristic: "Total Weight", method: "Scale", sample: "1st/Mid/Last", inputType: "number", unit: "g", nullable: false } });
  const b2 = await prisma.checkItem.create({ data: { templateId: bTemplate.id, section: "OUTBOARD", no: 2, characteristic: "Outboard Diameter", method: "Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: b2.id, minVal: 101.9, maxVal: 102.5, label: "Ø101.9~102.5 mm" } });
  await prisma.checkItem.create({ data: { templateId: bTemplate.id, section: "OUTBOARD", no: 3, characteristic: "External Thread", method: "GO Gauge Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: bTemplate.id, section: "APPEARANCE", no: 4, characteristic: "Label / Paint Condition", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: bTemplate.id, section: "APPEARANCE", no: 5, characteristic: "Note", method: "Free text", sample: "1st/Mid/Last", inputType: "text", nullable: true } });

  // 파트넘버별 무게 스펙 (가상 코드)
  async function addPN(modelKeys: string[], code: string, label: string | null, weight: { min: number; max: number; label: string } | null) {
    for (const key of modelKeys) {
      const model = bModels[key];
      if (!model) continue;
      const pn = await prisma.partNumber.upsert({
        where: { modelId_code: { modelId: model.id, code } },
        update: { templateId: bTemplate.id, label: label ?? undefined },
        create: { modelId: model.id, templateId: bTemplate.id, code, label: label ?? undefined },
      });
      if (weight) {
        const wItem = await prisma.checkItem.findFirst({ where: { templateId: bTemplate.id, no: 1 } });
        if (wItem) {
          const ex = await prisma.specRange.findFirst({ where: { itemId: wItem.id, partNumberId: pn.id } });
          if (!ex) await prisma.specRange.create({ data: { itemId: wItem.id, partNumberId: pn.id, minVal: weight.min, maxVal: weight.max, label: weight.label } });
        }
      }
    }
  }
  const bKeys = ["1-Y", "2-Y"];
  await addPN(bKeys, "PN-B-001", null, { min: 7350, max: 7650, label: "7,500g ±2% (PN-B-001)" });
  await addPN(bKeys, "PN-B-002", null, { min: 8200, max: 8540, label: "8,370g ±2% (PN-B-002)" });
  await addPN(bKeys, "PN-B-003", "Reference", null);

  console.log("Seed 완료 (익명 데모 데이터)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
