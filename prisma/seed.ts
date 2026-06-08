import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ── 회사 ──────────────────────────────────────────────
  const vw = await prisma.company.upsert({
    where: { code: "VW" },
    update: {},
    create: { code: "VW", name: "VW" },
  });
  const stellantis = await prisma.company.upsert({
    where: { code: "STELLANTIS" },
    update: {},
    create: { code: "STELLANTIS", name: "Stellantis" },
  });

  // ── VW 라인 A, B, C ───────────────────────────────────
  const vwLines: Record<string, { id: number }> = {};
  for (const code of ["A", "B", "C"]) {
    const line = await prisma.line.upsert({
      where: { companyId_code: { companyId: vw.id, code } },
      update: {},
      create: { companyId: vw.id, code },
    });
    vwLines[code] = line;
  }

  // ── Stellantis 라인 1~6 ───────────────────────────────
  const stLines: Record<string, { id: number }> = {};
  for (const code of ["1", "2", "3", "4", "5", "6"]) {
    const line = await prisma.line.upsert({
      where: { companyId_code: { companyId: stellantis.id, code } },
      update: {},
      create: { companyId: stellantis.id, code },
    });
    stLines[code] = line;
  }

  // ── VW 모델 ───────────────────────────────────────────
  const modelNames = ["Atlas", "Taos", "Tiguan"];
  const vwModels: Record<string, { id: number }> = {};
  for (const linecode of ["A", "B", "C"]) {
    const line = vwLines[linecode];
    for (const name of modelNames) {
      const existing = await prisma.model.findFirst({ where: { lineId: line.id, name } });
      const model = existing ?? await prisma.model.create({ data: { lineId: line.id, name } });
      vwModels[`${linecode}-${name}`] = model;
    }
  }

  // ── 구 Stellantis 모델 정리 (파트번호를 모델명으로 쓰던 구조) ──────────
  const oldPnNames = ["68494387AB","68494386AB","68472845AB","68472848AB","68264543AB"];
  for (const name of oldPnNames) {
    const old = await prisma.model.findFirst({ where: { lineId: stLines["1"].id, name } });
    if (old) {
      await prisma.templateModel.deleteMany({ where: { modelId: old.id } });
      await prisma.specRange.deleteMany({ where: { modelId: old.id } });
      await prisma.submission.deleteMany({ where: { modelId: old.id } });
      await prisma.model.delete({ where: { id: old.id } });
    }
  }

  // ── Stellantis 모델 (라인별) ──────────────────────────
  const stModels: Record<string, { id: number }> = {};

  // RU FRONT: Lines 1, 2
  for (const lc of ["1","2"]) {
    const ex = await prisma.model.findFirst({ where: { lineId: stLines[lc].id, name: "RU FRONT" } });
    stModels[`${lc}-RU`] = ex ?? await prisma.model.create({ data: { lineId: stLines[lc].id, name: "RU FRONT" } });
  }
  // DT / DS / WS: Lines 2, 3, 4
  for (const lc of ["2","3","4"]) {
    const ex = await prisma.model.findFirst({ where: { lineId: stLines[lc].id, name: "DT / DS / WS" } });
    stModels[`${lc}-DT`] = ex ?? await prisma.model.create({ data: { lineId: stLines[lc].id, name: "DT / DS / WS" } });
  }
  // WL / RHO / RU Rear: Lines 5, 6
  for (const lc of ["5","6"]) {
    const ex = await prisma.model.findFirst({ where: { lineId: stLines[lc].id, name: "WL / RHO / RU Rear" } });
    stModels[`${lc}-WL`] = ex ?? await prisma.model.create({ data: { lineId: stLines[lc].id, name: "WL / RHO / RU Rear" } });
  }

  // ── VW 19-020 템플릿 ──────────────────────────────────
  const vwTemplate = await prisma.checksheetTemplate.upsert({
    where: { code: "19-020" },
    update: { sampleCount: 2, sampleLabels: "P#1,P#2" },
    create: {
      code: "19-020",
      name: "VW Atlas/Taos/Tiguan Machine Check Sheet",
      version: "Rev R",
      sampleCount: 2,
      sampleLabels: "P#1,P#2",
    },
  });

  for (const [, model] of Object.entries(vwModels)) {
    const existing = await prisma.templateModel.findUnique({
      where: { templateId_modelId: { templateId: vwTemplate.id, modelId: model.id } },
    });
    if (!existing) {
      await prisma.templateModel.create({ data: { templateId: vwTemplate.id, modelId: model.id } });
    }
  }

  const vwItemIds = await prisma.checkItem.findMany({ where: { templateId: vwTemplate.id }, select: { id: true } });
  await prisma.checkValue.deleteMany({ where: { itemId: { in: vwItemIds.map(i => i.id) } } });
  await prisma.specRange.deleteMany({ where: { item: { templateId: vwTemplate.id } } });
  await prisma.checkItem.deleteMany({ where: { templateId: vwTemplate.id } });

  const item1 = await prisma.checkItem.create({
    data: {
      templateId: vwTemplate.id, section: "MACHINE CHECK", opNo: "OP #10", no: 1,
      characteristic: "Check Pincer Pressure", method: "Check Press Controller value",
      sample: "1ea/Shift", inputType: "number", unit: "bar", nullable: false,
    },
  });
  await prisma.specRange.create({ data: { itemId: item1.id, minVal: 5, label: "Min 5 bar (0.5 MPa)" } });

  await prisma.checkItem.create({
    data: {
      templateId: vwTemplate.id, section: "MACHINE CHECK", opNo: "OP #10", no: 2,
      characteristic: "Air Pincer Jaw Check", method: "By Visual",
      sample: "1ea/Shift", inputType: "ok_ng", nullable: false,
    },
  });

  const item3 = await prisma.checkItem.create({
    data: {
      templateId: vwTemplate.id, section: "MACHINE CHECK", opNo: "#30-1", no: 3,
      characteristic: "CV SUB / Grease Amount (OB Joint)", method: "Electronic Scale",
      sample: "1ea/Shift", inputType: "number", unit: "g", nullable: false,
    },
  });
  for (const linecode of ["A", "B", "C"]) {
    const atlasModel = vwModels[`${linecode}-Atlas`];
    await prisma.specRange.create({
      data: { itemId: item3.id, modelId: atlasModel.id, minVal: 85, maxVal: 95, label: "85~95 g (Atlas)" },
    });
  }

  const item4 = await prisma.checkItem.create({
    data: {
      templateId: vwTemplate.id, section: "ERROR PROOF", opNo: "30-1", no: 4,
      characteristic: "CV Height Check", method: "Setting Master",
      sample: "1ea/Shift", inputType: "number", unit: "mm", nullable: false,
    },
  });
  await prisma.specRange.create({ data: { itemId: item4.id, lineId: vwLines["A"].id, minVal: 104.8, maxVal: 105.2, label: "Line A/B: 104.8~105.2 mm" } });
  await prisma.specRange.create({ data: { itemId: item4.id, lineId: vwLines["B"].id, minVal: 104.8, maxVal: 105.2, label: "Line A/B: 104.8~105.2 mm" } });
  await prisma.specRange.create({ data: { itemId: item4.id, lineId: vwLines["C"].id, minVal: 107.1, maxVal: 107.5, label: "Line C: 107.1~107.5 mm" } });

  const item5 = await prisma.checkItem.create({
    data: {
      templateId: vwTemplate.id, section: "ERROR PROOF", opNo: "30-1", no: 5,
      characteristic: "Master Setting Check / Weight", method: "Setting Master",
      sample: "1ea/Shift", inputType: "number", unit: "kg", nullable: false,
    },
  });
  await prisma.specRange.create({ data: { itemId: item5.id, minVal: 1.995, maxVal: 2.005, label: "1.995~2.005 kg" } });

  const item6 = await prisma.checkItem.create({
    data: {
      templateId: vwTemplate.id, section: "ERROR PROOF", opNo: "70", no: 6,
      characteristic: "Halfshaft Total Weight Check", method: "Setting Master",
      sample: "1ea/Shift", inputType: "number", unit: "kg", nullable: false,
    },
  });
  await prisma.specRange.create({ data: { itemId: item6.id, minVal: 4.98, maxVal: 5.02, label: "4.98~5.02 kg" } });

  // ── Stellantis 20-053 템플릿 (RU FRONT – Lines 1, 2) ─────────────
  const stTemplate = await prisma.checksheetTemplate.upsert({
    where: { code: "20-053" },
    update: { sampleCount: 3, sampleLabels: "1st,Mid,Last" },
    create: {
      code: "20-053",
      name: "RU ALL MODELS 1st MID PC Check Sheet",
      version: "Rev G",
      sampleCount: 3, sampleLabels: "1st,Mid,Last",
    },
  });
  for (const key of ["1-RU","2-RU"]) {
    const ex = await prisma.templateModel.findUnique({ where: { templateId_modelId: { templateId: stTemplate.id, modelId: stModels[key].id } } });
    if (!ex) await prisma.templateModel.create({ data: { templateId: stTemplate.id, modelId: stModels[key].id } });
  }
  {
    const ids = await prisma.checkItem.findMany({ where: { templateId: stTemplate.id }, select: { id: true } });
    await prisma.checkValue.deleteMany({ where: { itemId: { in: ids.map(i => i.id) } } });
    await prisma.specRange.deleteMany({ where: { item: { templateId: stTemplate.id } } });
    await prisma.specRange.deleteMany({ where: { partNumber: { templateId: stTemplate.id } } });
    await prisma.partNumber.deleteMany({ where: { templateId: stTemplate.id } });
    await prisma.checkItem.deleteMany({ where: { templateId: stTemplate.id } });
  }
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "WEIGHT", no: 1, characteristic: "Total Halfshaft Weight in Grams (RH Halfshaft without IDS)", method: "Scale", sample: "1st/Mid/Last", inputType: "number", unit: "g", nullable: false } });
  const st20053_2 = await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "OUTBOARD", no: 2, characteristic: "Outboard Swaging Diameter (Large Clamp)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: st20053_2.id, minVal: 101.9, maxVal: 102.5, label: "Ø101.9~102.5 mm" } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "OUTBOARD", no: 3, characteristic: "CV Joint External Thread (M22 × 1.50)", method: "GO Gauge Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "OUTBOARD", no: 4, characteristic: "CV Joint External Spine", method: "GO Gauge Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  const st20053_5 = await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "OUTBOARD", no: 5, characteristic: "Ear Gap, Small Clamp (OB)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: st20053_5.id, maxVal: 2.0, label: "Max 2.0 mm" } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "OUTBOARD", no: 6, characteristic: "CV Washer", method: "Visual", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  const st20053_7 = await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "INBOARD", no: 7, characteristic: "Inboard Swaging Diameter (Large Clamp)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: st20053_7.id, minVal: 94.8, maxVal: 95.4, label: "Ø94.8~95.4 mm" } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "INBOARD", no: 8, characteristic: "VSJ Retaining Ring", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "INBOARD", no: 9, characteristic: "VSJ O-ring (LH)", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  const st20053_10 = await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "INBOARD", no: 10, characteristic: "Ear Gap, Small Clamp (IB)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: st20053_10.id, maxVal: 2.0, label: "Max 2.0 mm" } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "APPEARANCE", no: 11, characteristic: "Label Position / INK Wipe / Label Damage", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "APPEARANCE", no: 12, characteristic: "Assembly Paint Condition", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: stTemplate.id, section: "APPEARANCE", no: 13, characteristic: "Assembly Grease NOT Present", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });

  // ── Stellantis 21-011 템플릿 (DT / DS / WS – Lines 2, 3, 4) ─────────
  {
    const old = await prisma.checksheetTemplate.findUnique({ where: { code: "21-011" } });
    if (old) {
      const ids = await prisma.checkItem.findMany({ where: { templateId: old.id }, select: { id: true } });
      await prisma.checkValue.deleteMany({ where: { itemId: { in: ids.map(i => i.id) } } });
      await prisma.specRange.deleteMany({ where: { item: { templateId: old.id } } });
      await prisma.specRange.deleteMany({ where: { partNumber: { templateId: old.id } } });
      await prisma.submission.deleteMany({ where: { templateId: old.id } });
      await prisma.partNumber.deleteMany({ where: { templateId: old.id } });
      await prisma.checkItem.deleteMany({ where: { templateId: old.id } });
      await prisma.templateModel.deleteMany({ where: { templateId: old.id } });
    }
  }
  const st21011 = await prisma.checksheetTemplate.upsert({
    where: { code: "21-011" },
    update: { sampleCount: 3, sampleLabels: "1st,Mid,Last" },
    create: { code: "21-011", name: "DT / DS / WS 1st MID PC Check Sheet", version: "Rev C", sampleCount: 3, sampleLabels: "1st,Mid,Last" },
  });
  for (const key of ["2-DT","3-DT","4-DT"]) {
    const ex = await prisma.templateModel.findUnique({ where: { templateId_modelId: { templateId: st21011.id, modelId: stModels[key].id } } });
    if (!ex) await prisma.templateModel.create({ data: { templateId: st21011.id, modelId: stModels[key].id } });
  }
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "WEIGHT", no: 1, characteristic: "Weight In Grams", method: "Scale", sample: "1st/Mid/Last", inputType: "number", unit: "g", nullable: false } });
  const dt2 = await prisma.checkItem.create({ data: { templateId: st21011.id, section: "OUTBOARD", no: 2, characteristic: "Outboard Swaging Diameter (Large Clamp)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: dt2.id, minVal: 113.05, maxVal: 113.65, label: "Ø113.05~113.65 mm" } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "OUTBOARD", no: 3, characteristic: "CV Joint External Thread (M24 × 2.0)", method: "GO Gauge Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "OUTBOARD", no: 4, characteristic: "CV Joint External Spine", method: "GO Gauge Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  const dt5 = await prisma.checkItem.create({ data: { templateId: st21011.id, section: "OUTBOARD", no: 5, characteristic: "Ear Gap, Small Clamp (OB)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: dt5.id, maxVal: 2.0, label: "Max 2.0 mm" } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "OUTBOARD", no: 6, characteristic: "CV Washer", method: "Visual", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "INBOARD", no: 7, characteristic: "Inboard Swaging Diameter (Large Clamp)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "INBOARD", no: 8, characteristic: "KPJ/VSJ Female Spline Grease Presence/Location", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  const dt9 = await prisma.checkItem.create({ data: { templateId: st21011.id, section: "INBOARD", no: 9, characteristic: "Ear Gap, Small Clamp (IB)", method: "Gauge / Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: dt9.id, maxVal: 2.0, label: "Max 2.0 mm" } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "APPEARANCE", no: 10, characteristic: "Label Position / INK Wipe / Label Damage", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "APPEARANCE", no: 11, characteristic: "Shipping Cap", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "APPEARANCE", no: 12, characteristic: "Assembly Paint Condition", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "APPEARANCE", no: 13, characteristic: "Assembly Grease NOT Present", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st21011.id, section: "APPEARANCE", no: 14, characteristic: "Identification Groove on Shaft", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });

  // ── Stellantis 20-052 템플릿 (WL / RHO / RU Rear – Lines 5, 6) ─────────
  {
    const old = await prisma.checksheetTemplate.findUnique({ where: { code: "20-052" } });
    if (old) {
      const ids = await prisma.checkItem.findMany({ where: { templateId: old.id }, select: { id: true } });
      await prisma.checkValue.deleteMany({ where: { itemId: { in: ids.map(i => i.id) } } });
      await prisma.specRange.deleteMany({ where: { item: { templateId: old.id } } });
      await prisma.specRange.deleteMany({ where: { partNumber: { templateId: old.id } } });
      await prisma.submission.deleteMany({ where: { templateId: old.id } });
      await prisma.partNumber.deleteMany({ where: { templateId: old.id } });
      await prisma.checkItem.deleteMany({ where: { templateId: old.id } });
      await prisma.templateModel.deleteMany({ where: { templateId: old.id } });
    }
  }
  const st20052 = await prisma.checksheetTemplate.upsert({
    where: { code: "20-052" },
    update: { sampleCount: 3, sampleLabels: "1st,Mid,Last" },
    create: { code: "20-052", name: "WL / RHO / RU Rear 1st MID PC Check Sheet", version: "Rev G", sampleCount: 3, sampleLabels: "1st,Mid,Last" },
  });
  for (const key of ["5-WL","6-WL"]) {
    const ex = await prisma.templateModel.findUnique({ where: { templateId_modelId: { templateId: st20052.id, modelId: stModels[key].id } } });
    if (!ex) await prisma.templateModel.create({ data: { templateId: st20052.id, modelId: stModels[key].id } });
  }
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "WEIGHT", no: 1, characteristic: "Weight In Grams", method: "Scale", sample: "1st/Mid/Last", inputType: "number", unit: "g", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "OUTBOARD", no: 2, characteristic: "Outboard Swaging Diameter (Large Clamp)", method: "Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "OUTBOARD", no: 3, characteristic: "CV Joint External Thread", method: "GO Gauge Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "OUTBOARD", no: 4, characteristic: "CV Joint External Spine", method: "GO Gauge Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  const wl5 = await prisma.checkItem.create({ data: { templateId: st20052.id, section: "OUTBOARD", no: 5, characteristic: "Ear Gap, Small Clamp (OB)", method: "Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: wl5.id, maxVal: 2.0, label: "Max 2.0 mm" } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "OUTBOARD", no: 6, characteristic: "CV Washer", method: "Visual", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "INBOARD", no: 7, characteristic: "Inboard Swaging Diameter (Large Clamp)", method: "Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "INBOARD", no: 8, characteristic: "VSJ Retaining Ring", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "INBOARD", no: 9, characteristic: "VSJ Dust Cover", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  const wl10 = await prisma.checkItem.create({ data: { templateId: st20052.id, section: "INBOARD", no: 10, characteristic: "Ear Gap, Small Clamp (IB)", method: "Digital Calipers", sample: "1st/Mid/Last", inputType: "number", unit: "mm", nullable: false } });
  await prisma.specRange.create({ data: { itemId: wl10.id, maxVal: 2.0, label: "Max 2.0 mm" } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "APPEARANCE", no: 11, characteristic: "Label Position / INK Wipe / Label Damage", method: "Alcohol Swipe", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "APPEARANCE", no: 12, characteristic: "IBJ Spline (RHO only)", method: "Counter Part (Stab Shaft)", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: true } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "APPEARANCE", no: 13, characteristic: "Assembly Paint Condition", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });
  await prisma.checkItem.create({ data: { templateId: st20052.id, section: "APPEARANCE", no: 14, characteristic: "Assembly Grease NOT Present", method: "Visual Check", sample: "1st/Mid/Last", inputType: "ok_ng", nullable: false } });

  // ── Stellantis 파트넘버 헬퍼 ───────────────────────────
  async function addStPN(
    modelKeys: string[],
    tId: number,
    code: string,
    label: string | null,
    weightSpec: { min?: number; max?: number; label: string } | null,
    obSpec?: { min: number; max: number; label: string } | null,
    ibSpec?: { min: number; max: number; label: string } | null,
  ) {
    for (const key of modelKeys) {
      const model = stModels[key];
      if (!model) continue;
      const pn = await prisma.partNumber.upsert({
        where: { modelId_code: { modelId: model.id, code } },
        update: { templateId: tId, label: label ?? undefined },
        create: { modelId: model.id, templateId: tId, code, label: label ?? undefined },
      });
      const wItem = await prisma.checkItem.findFirst({ where: { templateId: tId, no: 1 } });
      const obItem = await prisma.checkItem.findFirst({ where: { templateId: tId, no: 2 } });
      const ibItem = await prisma.checkItem.findFirst({ where: { templateId: tId, no: 7 } });
      if (weightSpec && wItem) {
        const ex = await prisma.specRange.findFirst({ where: { itemId: wItem.id, partNumberId: pn.id } });
        if (!ex) await prisma.specRange.create({ data: { itemId: wItem.id, partNumberId: pn.id, minVal: weightSpec.min, maxVal: weightSpec.max, label: weightSpec.label } });
      }
      if (obSpec && obItem) {
        const ex = await prisma.specRange.findFirst({ where: { itemId: obItem.id, partNumberId: pn.id } });
        if (!ex) await prisma.specRange.create({ data: { itemId: obItem.id, partNumberId: pn.id, minVal: obSpec.min, maxVal: obSpec.max, label: obSpec.label } });
      }
      if (ibSpec && ibItem) {
        const ex = await prisma.specRange.findFirst({ where: { itemId: ibItem.id, partNumberId: pn.id } });
        if (!ex) await prisma.specRange.create({ data: { itemId: ibItem.id, partNumberId: pn.id, minVal: ibSpec.min, maxVal: ibSpec.max, label: ibSpec.label } });
      }
    }
  }

  // ── RU FRONT 파트넘버 (Lines 1, 2) ───────────────────────
  const ruKeys = ["1-RU","2-RU"];
  await addStPN(ruKeys, stTemplate.id, "68494387AB", null, { min: 7350, max: 7650, label: "7,500g ±2% (68494387AB)" });
  await addStPN(ruKeys, stTemplate.id, "68494386AB", null, null); // Reference
  await addStPN(ruKeys, stTemplate.id, "68472845AB", null, { min: 8200, max: 8540, label: "8,370g ±2% (68472845AB)" });
  await addStPN(ruKeys, stTemplate.id, "68472848AB", null, { min: 9830, max: 10230, label: "10,030g ±2% (68472848AB)" });
  await addStPN(ruKeys, stTemplate.id, "68264543AB", null, { min: 7724, max: 8036, label: "7,880g ±2% (68264543AB)" });

  // ── DT / DS / WS 파트넘버 (Lines 2, 3, 4) ────────────────
  const dtKeys = ["2-DT","3-DT","4-DT"];
  const ibVSJ = { min: 102.50, max: 103.10, label: "VSJ Ø102.50~103.10 mm" };
  const ibKPJ = { min: 101.10, max: 101.60, label: "KPJ Ø101.10~101.60 mm" };
  await addStPN(dtKeys, st21011.id, "52123702AC", "52123702AC (DS Interim VSJ)", null, null, ibVSJ);
  await addStPN(dtKeys, st21011.id, "68537123AA", "68537123AA (DS Unpaint)", { min: 8712, max: 9068, label: "8,890g ±2% (68537123AA)" }, null, ibVSJ);
  await addStPN(dtKeys, st21011.id, "68537124AA", "68537124AA (DS)", { min: 8712, max: 9068, label: "8,890g ±2% (68537124AA)" }, null, ibVSJ);
  await addStPN(dtKeys, st21011.id, "68259567AA", "68259567AA (DT Interim VSJ / KPJ)", null, null, ibVSJ);
  await addStPN(dtKeys, st21011.id, "68537122AA", "68537122AA (WS / DT)", { min: 8673, max: 9027, label: "8,850g ±2% (68537122AA)" }, null, ibVSJ);
  await addStPN(dtKeys, st21011.id, "68028398AC", "68028398AC (DS KPJ)", null, null, ibKPJ);

  // ── WL / RHO / RU Rear 파트넘버 (Lines 5, 6) ─────────────
  const wlKeys = ["5-WL","6-WL"];
  const ob08_09 = { min: 97.80,  max: 98.40,  label: "WL 08AC/09AC Ø97.80~98.40 mm"   };
  const ob10_13 = { min: 103.80, max: 104.40, label: "WL 10AB~13AB Ø103.80~104.40 mm" };
  const ob37_40 = { min: 113.80, max: 114.40, label: "WL 37AA~40AB Ø113.80~114.40 mm" };
  const obRHO   = { min: 116.00, max: 116.60, label: "RHO Ø116.00~116.60 mm"           };
  const obRURR  = { min: 90.60,  max: 91.40,  label: "RU RR Ø90.60~91.40 mm"           };
  const ib08_09 = { min: 93.30,  max: 93.90,  label: "WL 08AC/09AC Ø93.3~93.9 mm"     };
  const ib10_13 = { min: 99.30,  max: 99.90,  label: "WL 10AB~13AB Ø99.3~99.9 mm"     };
  const ib37_40 = { min: 103.80, max: 104.40, label: "WL 37AA~40AB Ø103.8~104.4 mm"   };
  const ibRHO   = { min: 114.00, max: 114.60, label: "RHO Ø114.00~114.60 mm"           };
  const ibRURR  = { min: 93.10,  max: 93.90,  label: "RU RR Ø93.1~93.9 mm"            };
  await addStPN(wlKeys, st20052.id, "68380008AC", null, { min: 7757, max: 8073, label: "7,915g ±2% (68380008AC)" }, ob08_09, ib08_09);
  await addStPN(wlKeys, st20052.id, "68380009AC", null, { min: 7787, max: 8105, label: "7,946g ±2% (68380009AC)" }, ob08_09, ib08_09);
  await addStPN(wlKeys, st20052.id, "68380010AB", null, { min: 8257, max: 8595, label: "8,426g ±2% (68380010AB)" }, ob10_13, ib10_13);
  await addStPN(wlKeys, st20052.id, "68380011AB", null, { min: 8329, max: 8669, label: "8,499g ±2% (68380011AB)" }, ob10_13, ib10_13);
  await addStPN(wlKeys, st20052.id, "68380012AB", null, { min: 9225, max: 9601, label: "9,413g ±2% (68380012AB)" }, ob10_13, ib10_13);
  await addStPN(wlKeys, st20052.id, "68380013AB", null, { min: 9285, max: 9665, label: "9,475g ±2% (68380013AB)" }, ob10_13, ib10_13);
  await addStPN(wlKeys, st20052.id, "68433737AA", null, { min: 11590, max: 12064, label: "11,827g ±2% (68433737AA)" }, ob37_40, ib37_40);
  await addStPN(wlKeys, st20052.id, "68433738AB", null, { min: 10622, max: 11056, label: "10,839g ±2% (68433738AB)" }, ob37_40, ib37_40);
  await addStPN(wlKeys, st20052.id, "68433739AA", null, { min: 10869, max: 11313, label: "11,091g ±2% (68433739AA)" }, ob37_40, ib37_40);
  await addStPN(wlKeys, st20052.id, "68433740AB", null, { min: 10808, max: 11250, label: "11,029g ±2% (68433740AB)" }, ob37_40, ib37_40);
  await addStPN(wlKeys, st20052.id, "68679812AA", null, { min: 11417, max: 11883, label: "11,650g ±2% (68679812AA)" }, obRHO, ibRHO);
  await addStPN(wlKeys, st20052.id, "68364544AA", null, { min: 7438, max: 7742, label: "7,590g ±2% (68364544AA)" }, obRURR, ibRURR);
  await addStPN(wlKeys, st20052.id, "68364545AA", null, { min: 6889, max: 7171, label: "7,030g ±2% (68364545AA)" }, obRURR, ibRURR);

  // ── VW 19-021 Daily Quality Check Sheet 템플릿들 ────────

  // 기존 19-021 계열 파트넘버/SpecRange/CheckItem 클리어
  for (const code of ["19-021-A","19-021-B","19-021-C","19-021-D","19-021-DAMPER"]) {
    const tmpl = await prisma.checksheetTemplate.findUnique({ where: { code } });
    if (tmpl) {
      const ids = await prisma.checkItem.findMany({ where: { templateId: tmpl.id }, select: { id: true } });
      await prisma.checkValue.deleteMany({ where: { itemId: { in: ids.map(i => i.id) } } });
      await prisma.specRange.deleteMany({ where: { item: { templateId: tmpl.id } } });
      await prisma.specRange.deleteMany({ where: { partNumber: { templateId: tmpl.id } } });
      await prisma.submission.deleteMany({ where: { templateId: tmpl.id } });
      await prisma.partNumber.deleteMany({ where: { templateId: tmpl.id } });
      await prisma.checkItem.deleteMany({ where: { templateId: tmpl.id } });
    }
  }

  // helper: upsert template
  async function upsertTemplate(code: string, name: string, labels = "1st,Mid,Last") {
    return prisma.checksheetTemplate.upsert({
      where: { code },
      update: { sampleCount: 3, sampleLabels: labels },
      create: { code, name, version: "Rev M", sampleCount: 3, sampleLabels: labels },
    });
  }

  // helper: common items (1–6, 9–10 for full types)
  async function createCommonItemsABC(tId: number) {
    // 1. Weight (spec per partNumber)
    const w = await prisma.checkItem.create({ data: { templateId: tId, section: "WEIGHT", no: 1, characteristic: "Weight", method: "Scale", inputType: "number", unit: "g", nullable: false } });
    // 2-4 outboard fixed
    await prisma.checkItem.create({ data: { templateId: tId, section: "OUTBOARD", no: 2, characteristic: "CV Joint Internal Thread", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await prisma.checkItem.create({ data: { templateId: tId, section: "OUTBOARD", no: 3, characteristic: "CV Joint External Spline", method: "Gauge Check", inputType: "ok_ng", nullable: false } });
    await prisma.checkItem.create({ data: { templateId: tId, section: "OUTBOARD", no: 4, characteristic: "CV Protection Cap", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    const eg5 = await prisma.checkItem.create({ data: { templateId: tId, section: "OUTBOARD", no: 5, characteristic: "Ear Gap, Large Clamp (OB)", method: "Gauge/Vernier Calipers", inputType: "number", unit: "mm", nullable: false } });
    const eg6 = await prisma.checkItem.create({ data: { templateId: tId, section: "OUTBOARD", no: 6, characteristic: "Ear Gap, Small Clamp (OB)", method: "Gauge/Vernier Calipers", inputType: "number", unit: "mm", nullable: false } });
    await prisma.specRange.create({ data: { itemId: eg5.id, maxVal: 2.5, label: "Max 2.5mm" } });
    await prisma.specRange.create({ data: { itemId: eg6.id, maxVal: 2.5, label: "Max 2.5mm" } });
    return w;
  }

  async function createIBEarGap(tId: number, startNo: number) {
    const eg9 = await prisma.checkItem.create({ data: { templateId: tId, section: "INBOARD", no: startNo, characteristic: "Ear Gap, Large Clamp (IB)", method: "Gauge/Vernier Calipers", inputType: "number", unit: "mm", nullable: false } });
    const eg10 = await prisma.checkItem.create({ data: { templateId: tId, section: "INBOARD", no: startNo + 1, characteristic: "Ear Gap, Small Clamp (IB)", method: "Gauge/Vernier Calipers", inputType: "number", unit: "mm", nullable: false } });
    await prisma.specRange.create({ data: { itemId: eg9.id, maxVal: 2.5, label: "Max 2.5mm" } });
    await prisma.specRange.create({ data: { itemId: eg10.id, maxVal: 2.5, label: "Max 2.5mm" } });
  }

  async function createLabelItems(tId: number, no: number, labelDistSpec: string) {
    const ld = await prisma.checkItem.create({ data: { templateId: tId, section: "BAR-SHAFT", no, characteristic: "Label distance from the CV Joint", method: "Vernier Calipers", inputType: "number", unit: "mm", nullable: false } });
    // "Max 120mm" → maxVal: 120, "Max 75mm" → maxVal: 75 파싱
    const maxMatch = labelDistSpec.match(/Max\s*([\d.]+)/i);
    const maxVal = maxMatch ? parseFloat(maxMatch[1]) : null;
    await prisma.specRange.create({ data: { itemId: ld.id, maxVal, label: labelDistSpec } });
    await prisma.checkItem.create({ data: { templateId: tId, section: "BAR-SHAFT", no: no + 1, characteristic: "Label Damage", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    return ld;
  }

  // ── Template A: O-Ring + Retaining Ring (most 271/272) ───
  const tA = await upsertTemplate("19-021-A", "VW Daily QC – O-Ring / Retaining Ring Type");
  {
    await createCommonItemsABC(tA.id);
    await prisma.checkItem.create({ data: { templateId: tA.id, section: "INBOARD", no: 7, characteristic: "O-Ring", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await prisma.checkItem.create({ data: { templateId: tA.id, section: "INBOARD", no: 8, characteristic: "Retaining Ring", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await createIBEarGap(tA.id, 9);
    await createLabelItems(tA.id, 11, "Max 120mm");
  }

  // ── Template B: Clamp Ear Position + Ball Retainer ────────
  const tB = await upsertTemplate("19-021-B", "VW Daily QC – Clamp Ear / Ball Retainer Type");
  {
    await createCommonItemsABC(tB.id);
    await prisma.checkItem.create({ data: { templateId: tB.id, section: "INBOARD", no: 7, characteristic: "Position of the Large Clamp Ear", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await prisma.checkItem.create({ data: { templateId: tB.id, section: "INBOARD", no: 8, characteristic: "Ball Retainer Cap Diameter", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await createIBEarGap(tB.id, 9);
    await createLabelItems(tB.id, 11, "Max 120mm");
  }

  // ── Template C: Atlas 203 – Protection Cap + Clamp Ear ────
  const tC = await upsertTemplate("19-021-C", "VW Daily QC – Protection Cap / Clamp Ear Type (Atlas 203)");
  {
    await createCommonItemsABC(tC.id);
    await prisma.checkItem.create({ data: { templateId: tC.id, section: "INBOARD", no: 7, characteristic: "Protection Cap", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await prisma.checkItem.create({ data: { templateId: tC.id, section: "INBOARD", no: 8, characteristic: "Position of the Large Clamp Ear", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await createIBEarGap(tC.id, 9);
    await createLabelItems(tC.id, 11, "Max 75mm");
  }

  // ── Template D: VSJ type (short – no O-Ring/Retaining Ring) ─
  const tD = await upsertTemplate("19-021-D", "VW Daily QC – VSJ Internal Spline Type");
  {
    await createCommonItemsABC(tD.id);
    await createIBEarGap(tD.id, 7);
    await prisma.checkItem.create({ data: { templateId: tD.id, section: "INBOARD", no: 9, characteristic: "VSJ (Female) Internal Spline", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    await createLabelItems(tD.id, 10, "Max 120mm");
  }

  // ── Template DAMPER ───────────────────────────────────────
  const tDamper = await upsertTemplate("19-021-DAMPER", "VW Daily QC – Damper Assembly", "1st,Mid,Last");
  {
    await prisma.checkItem.create({ data: { templateId: tDamper.id, section: "DAMPER", no: 1, characteristic: "Part No.", method: "Visual Check", inputType: "text", nullable: false } });
    await prisma.checkItem.create({ data: { templateId: tDamper.id, section: "DAMPER", no: 2, characteristic: "Damper Distance", method: "Visual Check", inputType: "ok_ng", nullable: false } });
    const ec = await prisma.checkItem.create({ data: { templateId: tDamper.id, section: "DAMPER", no: 3, characteristic: "Ear Gap, Clamp", method: "Gauge/Vernier Calipers", inputType: "number", unit: "mm", nullable: false } });
    await prisma.specRange.create({ data: { itemId: ec.id, maxVal: 2.5, label: "Max 2.5mm" } });
  }

  // ── Part Numbers + weight SpecRanges ─────────────────────
  async function addPN(
    modelKey: string,  // e.g. "A-Atlas"
    tId: number,
    code: string,
    label: string,
    weightSpec: { label: string; min?: number; max?: number } | null,
  ) {
    for (const lineCode of ["A","B","C"]) {
      const model = vwModels[`${lineCode}-${modelKey}`];
      if (!model) continue;
      const pn = await prisma.partNumber.upsert({
        where: { modelId_code: { modelId: model.id, code } },
        update: { templateId: tId, label },
        create: { modelId: model.id, templateId: tId, code, label },
      });
      if (weightSpec) {
        // weight item is no=1 in that template
        const wItem = await prisma.checkItem.findFirst({ where: { templateId: tId, no: 1 } });
        if (wItem) {
          const existing = await prisma.specRange.findFirst({ where: { itemId: wItem.id, partNumberId: pn.id } });
          if (!existing) {
            await prisma.specRange.create({ data: { itemId: wItem.id, partNumberId: pn.id, minVal: weightSpec.min, maxVal: weightSpec.max, label: weightSpec.label } });
          }
        }
      }
    }
  }

  // Atlas part numbers
  await addPN("Atlas", tC.id, "203.B",  "3QF.501.203.B",  { label: "6,070g – 6,300g", min: 6070, max: 6300 });
  await addPN("Atlas", tC.id, "204.B",  "3QF.501.204.B",  { label: "6,250g – 6,600g", min: 6250, max: 6600 });
  await addPN("Atlas", tA.id, "271.J",  "3QF.407.271.J",  { label: "8,500g – 9,000g", min: 8500, max: 9000 });
  await addPN("Atlas", tA.id, "271.K",  "3QF.407.271.K",  { label: "8,570g – 9,070g", min: 8570, max: 9070 });
  await addPN("Atlas", tA.id, "272.AC", "3QF.407.272.AC", { label: "11,500g – 12,000g", min: 11500, max: 12000 });
  await addPN("Atlas", tA.id, "272.AD", "3QF.407.272.AD", { label: "10,800g – 11,300g", min: 10800, max: 11300 });
  await addPN("Atlas", tA.id, "272.AF", "3QF.407.272.AF", { label: "10,800g – 11,300g", min: 10800, max: 11300 });
  await addPN("Atlas", tD.id, "272.AE", "3QF.407.272.AE", { label: "8,900g – 9,300g",   min: 8900,  max: 9300  });

  // Taos part numbers
  await addPN("Taos", tB.id, "203.D",  "5Q0.501.203.D",  { label: "5,180g", min: 5129, max: 5231 });
  await addPN("Taos", tB.id, "204.D",  "5Q0.501.204.D",  { label: "5,180g", min: 5129, max: 5231 });
  await addPN("Taos", tA.id, "271.DS", "5Q0.407.271.DS", { label: "6,780g", min: 6712, max: 6848 });
  await addPN("Taos", tB.id, "272.FL", "5Q0.407.272.FL", { label: "7,050g", min: 6979, max: 7121 });

  // Tiguan part numbers
  await addPN("Tiguan", tA.id, "271.N",  "5QN.407.271.N",  { label: "7,190g", min: 7118, max: 7262 });
  await addPN("Tiguan", tA.id, "271.R",  "5QN.407.271.R",  { label: "6,910g", min: 6841, max: 6979 });
  await addPN("Tiguan", tB.id, "271.S",  "5QN.407.271.S",  { label: "6,380g", min: 6316, max: 6444 });
  await addPN("Tiguan", tA.id, "271.T",  "5QN.407.271.T",  { label: "7,010g", min: 6940, max: 7080 });
  await addPN("Tiguan", tA.id, "272.AA", "5QN.407.272.AA", { label: "8,530g", min: 8445, max: 8615 });
  await addPN("Tiguan", tA.id, "272.AB", "5QN.407.272.AB", { label: "8,400g", min: 8316, max: 8484 });
  await addPN("Tiguan", tD.id, "272.AD", "5QN.407.272.AD", { label: "7,580g", min: 7504, max: 7656 });
  await addPN("Tiguan", tD.id, "272.AE", "5QN.407.272.AE", { label: "7,300g", min: 7227, max: 7373 });
  await addPN("Tiguan", tD.id, "272.AF", "5QN.407.272.AF", { label: "7,210g", min: 7138, max: 7282 });
  await addPN("Tiguan", tD.id, "272.AG", "5QN.407.272.AG", { label: "7,580g", min: 7504, max: 7656 });
  await addPN("Tiguan", tB.id, "272.AH", "5QN.407.272.AH", { label: "7,740g", min: 7662, max: 7818 });
  await addPN("Tiguan", tB.id, "272.AJ", "5QN.407.272.AJ", { label: "7,010g", min: 6940, max: 7080 });
  await addPN("Tiguan", tA.id, "272.S",  "5QN.407.272.S",  { label: "9,540g", min: 9445, max: 9635 });

  // Damper — link to Damper line (Line D or treat as separate model)
  // Damper line 생성
  const damperLine = await prisma.line.upsert({
    where: { companyId_code: { companyId: vw.id, code: "Damper" } },
    update: {},
    create: { companyId: vw.id, code: "Damper" },
  });
  const damperModel = await prisma.model.findFirst({ where: { lineId: damperLine.id, name: "Damper Assembly" } })
    ?? await prisma.model.create({ data: { lineId: damperLine.id, name: "Damper Assembly" } });
  // Link template to model (for fallback / non-partNumber flow)
  const existingDamperLink = await prisma.templateModel.findUnique({ where: { templateId_modelId: { templateId: tDamper.id, modelId: damperModel.id } } });
  if (!existingDamperLink) await prisma.templateModel.create({ data: { templateId: tDamper.id, modelId: damperModel.id } });

  console.log("Seed 완료");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
