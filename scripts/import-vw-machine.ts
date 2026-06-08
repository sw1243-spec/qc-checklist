// VW Machine Check Sheet 임포트 (19-020 Rev S → Atlas / Taos+Tiguan 2개 분리)
// 사용: npx tsx scripts/import-vw-machine.ts           (dry-run, 저장 안 함)
//       npx tsx scripts/import-vw-machine.ts --commit  (실제 저장)
//
// 원본 엑셀(좌측 Machine Check 영역만 사용, 우측 VW ERROR PROOF 영역은 제외):
//   .../VW/Line A/Taos, Tiguan & Atlas Machine Check Sheet/19-020_Rev S_..._ Atlas.xlsx
//   .../VW/Line A/Taos, Tiguan & Atlas Machine Check Sheet/19-020_Rev S_..._ Taos and Tiguan.xlsx
//
// 기존 19-020(Rev R, id=1) 템플릿 + 빈 제출 1건은 삭제 후 신규 2개 생성("삭제 후 신규").
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

const SAMPLE_COUNT = 2;
const SAMPLE_LABELS = "Part #1,Part #2";

// 섹션명(엑셀 헤더 그대로, 영문). 화면에서는 섹션 알파벳순 정렬됨.
const S_MACHINE = "MACHINE CHECK";
const S_GREASE = "GREASE WEIGHT";
const S_SEALANT = "SEALANT WEIGHT";
const S_TRACE = "GREASE TRACEABILITY";

interface ItemDef {
  section: string;
  no: number;
  opNo?: string;
  characteristic: string;
  method?: string;
  inputType: "number" | "ok_ng" | "text";
  unit?: string;
  specMin?: number;
  specLabel?: string;
}

// Pincer 압력 공통 스펙
const pincer = (no: number, opNo: string | undefined): ItemDef => ({
  section: S_MACHINE, no, opNo, characteristic: "Check Pincer Pressure",
  method: "By Visual", inputType: "number", unit: "bar", specMin: 5, specLabel: "Min 5 bar (0.5 MPa)",
});
const jaw = (no: number, opNo: string): ItemDef => ({
  section: S_MACHINE, no, opNo, characteristic: "Air Pincer Jaw Check",
  method: "By Visual", inputType: "ok_ng",
});
const grease = (no: number, opNo: string, characteristic: string): ItemDef => ({
  section: S_GREASE, no, opNo, characteristic, method: "Electronic Scale", inputType: "number", unit: "g",
});
const trace = (no: number, lot: string): ItemDef => ({
  section: S_TRACE, no, characteristic: lot, inputType: "text",
});

// ─── Atlas (19-020 Atlas 시트) — 15개 ──────────────────────────
const ATLAS: ItemDef[] = [
  jaw(1, "#10"),
  pincer(2, "#10"),
  jaw(3, "#40"),
  pincer(4, "#40"),
  { section: S_MACHINE, no: 5, opNo: "#55", characteristic: "Grease nozzle wiping", method: "By Visual", inputType: "ok_ng" },
  jaw(6, "#60"),
  pincer(7, "#60"),
  grease(1, "#30-1", "CV SUB Grease Amount"),
  grease(2, "#40", "OB Boot Grease Amount"),
  grease(3, "#40", "IB Boot Grease Amount"),
  grease(4, "#50-1", "VSJ HSG Grease Amount"),
  grease(5, "#55", "CG SUB Grease Amount"),
  trace(1, "Klueber HE71-281"),
  trace(2, "Castrol 2LN 584 LO"),
  trace(3, "Fuchs LX-CVH2"),
];

// ─── Taos & Tiguan (19-020_Taos_Tiguan 시트) — 18개 ────────────
const TT: ItemDef[] = [
  jaw(1, "#10"),
  pincer(2, "#10"),
  jaw(3, "#40"),
  pincer(4, "#40"),
  { section: S_MACHINE, no: 5, opNo: "#55", characteristic: "Grease nozzle wiping", method: "By Visual", inputType: "ok_ng" },
  jaw(6, "#60"),
  pincer(7, "#60"),
  grease(1, "#20-1", "CG SUB ASM Grease Amount"),
  grease(2, "#30-1", "CV SUB ASM Grease Amount"),
  grease(3, "#40", "OB Boot Grease Amount"),
  grease(4, "#40", "IB Boot Grease Amount"),
  grease(5, "#50-1", "VSJ HSG Grease Amount"),
  grease(6, "#55", "CG SUB Grease Amount"),
  { section: S_SEALANT, no: 1, opNo: "#50", characteristic: "Sealant amount check", method: "Electronic Scale", inputType: "number", unit: "g" },
  trace(1, "Klueber HE71-281"),
  trace(2, "Castrol H1TLF"),
  trace(3, "Castrol 2LN 584/L0"),
  trace(4, "Fuchs LX-CVH2"),
];

const TEMPLATES = [
  { code: "19-020-ATLAS", name: "VW Atlas Machine Check Sheet", version: "Rev S", items: ATLAS, modelIds: [1, 4, 7] },
  { code: "19-020-TT", name: "VW Taos & Tiguan Machine Check Sheet", version: "Rev S", items: TT, modelIds: [2, 5, 8, 3, 6, 9] },
];

function printItems(items: ItemDef[]) {
  for (const it of items) {
    const spec = it.specMin != null ? `[min ${it.specMin}${it.unit ? " " + it.unit : ""}]`
      : it.unit ? `(${it.unit})` : "";
    console.log(`  [${it.section.padEnd(20)}] #${String(it.no).padStart(2)} ${(it.opNo ?? "").padEnd(7)} ${it.inputType.padEnd(7)} ${it.characteristic.slice(0, 36).padEnd(36)} ${spec}`);
  }
}

// 기존 19-020(Rev R) 삭제: 제출 자식행 → 제출 → 항목 → 템플릿
async function deleteOld() {
  const old = await prisma.checksheetTemplate.findUnique({ where: { code: "19-020" } });
  if (!old) { console.log("기존 19-020 없음 — 삭제 생략"); return; }
  console.log(`기존 19-020 [id=${old.id}] 삭제 중...`);

  const subs = await prisma.submission.findMany({ where: { templateId: old.id }, select: { id: true } });
  for (const s of subs) {
    await prisma.submissionLog.deleteMany({ where: { submissionId: s.id } });
    const ca = await prisma.correctiveAction.findUnique({ where: { submissionId: s.id } });
    if (ca) {
      await prisma.attachment.deleteMany({ where: { correctiveActionId: ca.id } });
      await prisma.correctiveAction.delete({ where: { id: ca.id } });
    }
    await prisma.checkValue.deleteMany({ where: { submissionId: s.id } });
  }
  await prisma.submission.deleteMany({ where: { templateId: old.id } });

  const itemIds = (await prisma.checkItem.findMany({ where: { templateId: old.id }, select: { id: true } })).map(i => i.id);
  if (itemIds.length) {
    await prisma.specRange.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.checkValue.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.chartMetric.deleteMany({ where: { itemId: { in: itemIds } } });
    await prisma.checkItem.deleteMany({ where: { templateId: old.id } });
  }
  await prisma.partNumberTemplate.deleteMany({ where: { templateId: old.id } });
  await prisma.templateModel.deleteMany({ where: { templateId: old.id } });
  await prisma.chartTemplate.deleteMany({ where: { templateId: old.id } });
  // 구버전 단일 템플릿 FK(deprecated) 해제
  await prisma.partNumber.updateMany({ where: { templateId: old.id }, data: { templateId: null } });
  await prisma.checksheetTemplate.delete({ where: { id: old.id } });
  console.log(`  ✓ 제출 ${subs.length}건 + 항목 ${itemIds.length}개 + 템플릿 삭제`);
}

async function main() {
  console.log(COMMIT ? "🚀 COMMIT MODE\n" : "🔍 DRY RUN (--commit 없으면 저장 안 함)\n");

  for (const tpl of TEMPLATES) {
    console.log("=".repeat(70));
    console.log(`${tpl.code} ${tpl.version} – ${tpl.name}  (${tpl.items.length}개 항목)`);
    printItems(tpl.items);
    const pns = await prisma.partNumber.findMany({
      where: { modelId: { in: tpl.modelIds } },
      include: { model: { include: { line: { include: { company: true } } } } },
    });
    const byLine = new Map<string, number>();
    for (const pn of pns) {
      const k = `${pn.model.line.company.name} Line ${pn.model.line.code} (${pn.model.name})`;
      byLine.set(k, (byLine.get(k) ?? 0) + 1);
    }
    console.log(`\n  연결 대상 파트넘버 ${pns.length}개:`);
    [...byLine.entries()].sort().forEach(([k, n]) => console.log(`    ${k}: ${n}개`));
    console.log("");
  }

  if (!COMMIT) { console.log("DRY RUN 종료 (저장 안 함)"); await prisma.$disconnect(); return; }

  await deleteOld();

  for (const tpl of TEMPLATES) {
    console.log("=".repeat(70));
    let template = await prisma.checksheetTemplate.findUnique({ where: { code: tpl.code } });
    if (!template) {
      template = await prisma.checksheetTemplate.create({
        data: { code: tpl.code, name: tpl.name, version: tpl.version, sampleCount: SAMPLE_COUNT, sampleLabels: SAMPLE_LABELS },
      });
      console.log(`✓ 템플릿 생성 [${template.id}] ${tpl.code}`);
    } else {
      await prisma.checksheetTemplate.update({
        where: { id: template.id },
        data: { name: tpl.name, version: tpl.version, sampleCount: SAMPLE_COUNT, sampleLabels: SAMPLE_LABELS },
      });
      const ids = (await prisma.checkItem.findMany({ where: { templateId: template.id }, select: { id: true } })).map(i => i.id);
      if (ids.length) {
        await prisma.specRange.deleteMany({ where: { itemId: { in: ids } } });
        await prisma.checkValue.deleteMany({ where: { itemId: { in: ids } } });
        await prisma.chartMetric.deleteMany({ where: { itemId: { in: ids } } });
        await prisma.checkItem.deleteMany({ where: { templateId: template.id } });
      }
      console.log(`✓ 템플릿 업데이트 [${template.id}] ${tpl.code} (기존 항목 ${ids.length}개 삭제)`);
    }

    for (const item of tpl.items) {
      const created = await prisma.checkItem.create({
        data: {
          templateId: template.id,
          section: item.section,
          no: item.no,
          opNo: item.opNo ?? null,
          characteristic: item.characteristic,
          method: item.method ?? null,
          inputType: item.inputType,
          unit: item.unit ?? null,
          nullable: item.inputType === "text",
        },
      });
      if (item.specMin != null || item.specLabel) {
        await prisma.specRange.create({
          data: { itemId: created.id, minVal: item.specMin ?? null, maxVal: null, label: item.specLabel ?? null },
        });
      }
    }
    console.log(`  ✓ ${tpl.items.length}개 항목 생성`);

    const pns = await prisma.partNumber.findMany({ where: { modelId: { in: tpl.modelIds } }, select: { id: true } });
    let linked = 0;
    for (const pn of pns) {
      const ex = await prisma.partNumberTemplate.findUnique({
        where: { partNumberId_templateId: { partNumberId: pn.id, templateId: template.id } },
      });
      if (ex) continue;
      await prisma.partNumberTemplate.create({ data: { partNumberId: pn.id, templateId: template.id } });
      linked++;
    }
    console.log(`  ✓ 파트넘버 ${linked}개 연결`);

    // 모델↔템플릿 링크(TemplateModel): 모델 선택 화면에서 "사용 가능" 게이트로 쓰임.
    // 이게 없으면 Line 페이지에서 모델이 "No template"으로 비활성화된다.
    let mLinked = 0;
    for (const modelId of tpl.modelIds) {
      await prisma.templateModel.upsert({
        where: { templateId_modelId: { templateId: template.id, modelId } },
        create: { templateId: template.id, modelId },
        update: {},
      });
      mLinked++;
    }
    console.log(`  ✓ 모델 링크 ${mLinked}개 (TemplateModel)\n`);
  }

  console.log("✅ 완료");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
