// Stellantis SOP 템플릿 임포트 + 파트넘버 연결
// 사용: npx tsx scripts/import-sop-templates.ts           (dry-run)
//       npx tsx scripts/import-sop-templates.ts --commit  (실제 저장)
import "dotenv/config";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import path from "path";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const BASE = "C:/Users/jin.sewoon/Desktop/project for qc check list/Stellantis";

interface ItemDef {
  section: string;
  no: number;
  opNo?: string;
  characteristic: string;
  method?: string;
  inputType: "number" | "ok_ng" | "text";
  specLabel?: string;
  specMin?: number;
  specMax?: number;
}

// ─── 셀 텍스트 추출 ───────────────────────────────────────────
function cell(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (!v) return "";
  let s: string;
  if (typeof v === "object" && "richText" in v)
    s = (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  else s = String(v);
  // 개행/중복 공백 정리
  return s.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

function rowShift(row: ExcelJS.Row): "1" | "2" | null {
  for (let c = 1; c <= 15; c++) {
    const t = cell(row, c);
    if (/1\s*Shift/i.test(t)) return "1";
    if (/2\s*Shift/i.test(t)) return "2";
  }
  return null;
}

// ─── Spec 파싱: "95g~105g" "70-80g" "Max 2.0" "Min 5 Bar" 등 ─
function parseSpec(raw: string): { min?: number; max?: number; label: string } {
  const label = raw.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  // 복합 스펙 (콜론으로 파트별 구분, 예: "VSJ : 85g~95g KPJ : 95g~105g") → label 만
  const gRanges = label.match(/[\d.]+\s*g\s*[~\-–]\s*[\d.]+\s*g/gi) ?? [];
  if (label.includes(":") || gRanges.length > 1) return { label };

  // "70-80g" or "95g~105g" or "58-75g"
  const range = label.match(/([\d.]+)\s*g?\s*[~\-–]\s*([\d.]+)\s*g/i);
  if (range) return { min: parseFloat(range[1]), max: parseFloat(range[2]), label };
  // ".10005 / .09995" Kg scale check
  const kgRange = label.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  if (kgRange) {
    const a = parseFloat(kgRange[1]);
    const b = parseFloat(kgRange[2]);
    return { min: Math.min(a, b), max: Math.max(a, b), label };
  }
  // "Min 5 Bar" or "Min. 0.5 Mpa"
  const minOnly = label.match(/Min\.?\s*([\d.]+)/i);
  if (minOnly) return { min: parseFloat(minOnly[1]), label };
  // "Max 2.0"
  const maxOnly = label.match(/Max\.?\s*([\d.]+)/i);
  if (maxOnly) return { max: parseFloat(maxOnly[1]), label };
  return { label };
}

// ─── Excel 파싱 ──────────────────────────────────────────────
async function parseSOPFile(
  filePath: string,
  charCol: number,
  specCol: number
): Promise<ItemDef[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  const items: ItemDef[] = [];
  let greaseStarted = false;
  let errorProofStarted = false;
  let greaseSeq = 0;
  let errorProofSeq = 0;

  // 중복 행(같은 항목의 추가 행) 스킵용
  const seenGrease = new Set<string>();

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const colA = cell(row, 1);
    if (!colA) continue;

    // Footer
    if (/Confirm Audit|Record actual/i.test(colA)) break;

    // Error Proof 헤더 행 감지
    if (/^OP\s*#/i.test(colA) && /Feature|Method|Requirement/i.test(cell(row, 2))) {
      errorProofStarted = true;
      continue;
    }

    // Grease 섹션 시작 감지 (col A 가 숫자)
    if (!greaseStarted && /^\d+$/.test(colA)) {
      greaseStarted = true;
    }

    const shift = rowShift(row);
    if (shift !== "1") continue; // 2-Shift 행 및 헤더 스킵

    // ── Error Proof ──────────────────────────────────────
    if (errorProofStarted && /^OP\s*#\d/i.test(colA)) {
      const opNo = colA;
      const characteristic = cell(row, 2);
      const method = cell(row, 3);
      const specRaw = cell(row, 4);
      const indicator = cell(row, 6);
      const inputType: ItemDef["inputType"] = /Check Mark/i.test(indicator) ? "ok_ng" : "number";
      const specParsed = parseSpec(specRaw);

      errorProofSeq++;
      items.push({
        section: "ERROR PROOF",
        no: errorProofSeq,
        opNo,
        characteristic,
        method: method || undefined,
        inputType,
        specLabel: specParsed.label || undefined,
        specMin: specParsed.min,
        specMax: specParsed.max,
      });
      continue;
    }

    if (!greaseStarted || errorProofStarted) continue;

    // ── Grease Quality ────────────────────────────────────
    if (!/^\d+$/.test(colA)) continue;

    let characteristic = cell(row, charCol);
    const specRaw = cell(row, specCol);
    const opNoRaw = cell(row, 3);
    const opNo = /^OP\s*#/i.test(opNoRaw) ? opNoRaw : undefined;
    const indicator = cell(row, 6);

    // Scale 체크 항목 (OP# 없고 characteristic 이 빈 경우 등)
    if (!characteristic) characteristic = specRaw;

    // Grease Traceability: CXD 그룹당 1개 (Lot Number 텍스트 입력)
    // "Traceability" 단어가 파일에 따라 col2/3/4 중 어디든 있을 수 있어 전체 스캔
    const traceHay = `${cell(row, 2)} ${cell(row, 3)} ${cell(row, 4)} ${cell(row, 5)}`;
    const isTrace = /Traceability/i.test(traceHay);
    if (isTrace) {
      const greaseName = traceHay.match(/CXD\s*\d+/i)?.[0].replace(/\s+/g, "") ?? "Grease";
      const key = `trace-${greaseName}`;
      if (seenGrease.has(key)) continue;
      seenGrease.add(key);
      greaseSeq++;
      items.push({
        section: "GREASE QUALITY",
        no: greaseSeq,
        opNo,
        characteristic: `Grease Traceability – ${greaseName} Lot Number`,
        inputType: "text",
      });
      continue;
    }

    // 일반 Grease 항목 (중복 스킵)
    const key = `${colA}-${characteristic}`;
    if (seenGrease.has(key)) continue;
    seenGrease.add(key);

    const specParsed = parseSpec(specRaw);
    const inputType: ItemDef["inputType"] = /Check Mark/i.test(indicator) ? "ok_ng" : "number";

    greaseSeq++;
    items.push({
      section: "GREASE QUALITY",
      no: greaseSeq,
      opNo,
      characteristic,
      inputType,
      specLabel: specParsed.label || undefined,
      specMin: specParsed.min,
      specMax: specParsed.max,
    });
  }

  return items;
}

// ─── 템플릿 정의 ─────────────────────────────────────────────
const TEMPLATES = [
  {
    code: "19-055",
    name: "RU Front Start of Production Check Sheet",
    version: "Rev D",
    sampleCount: 1,
    sampleLabels: "SOP",
    file: path.join(
      BASE,
      "Line 1- RU FRONT/RU FRONT Start of Production Check Sheet",
      "19-055_Rev D_RU BASE, PHEV, AWD_FRONT VSJ-1ST-PC-GREASE-QUALITY_Check Sheet 05.15.2026.xlsx"
    ),
    charCol: 4,
    specCol: 2,
    dailyCodes: ["20-053"], // RU ALL MODELS (Line 1, 2)
  },
  {
    code: "20-042",
    name: "WL / RHO / RU Rear Start of Production Check Sheet",
    version: "Rev I",
    sampleCount: 1,
    sampleLabels: "SOP",
    file: path.join(
      BASE,
      "Line 5- WL, RHO, RU REAR/WL, RHO, RU REAR Start of Production Check Sheet",
      "20-042_Rev I_WL_RHO_RU RR_1ST_PC_Grease Quality Daily Check Sheet 05.15.2026.xlsx"
    ),
    charCol: 2,
    specCol: 4,
    dailyCodes: ["20-052"], // WL/RHO/RU Rear (Line 5, 6)
  },
  {
    code: "21-013",
    name: "DT / DS / WS Start of Production Check Sheet",
    version: "Rev D",
    sampleCount: 1,
    sampleLabels: "SOP",
    file: path.join(
      BASE,
      "Line 3- DT DS WS/DT,DS,WS Start of Production Check Sheet",
      "21-013_Rev D_DT_DS_WS_1st_pc_Grease_quality CKSHT 05.15.2026.xlsx"
    ),
    charCol: 2,
    specCol: 4,
    dailyCodes: ["21-011"], // DT/DS/WS (Line 2, 3, 4)
  },
];

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log(COMMIT ? "🚀 COMMIT MODE" : "🔍 DRY RUN (--commit 없으면 저장 안 함)\n");

  for (const tpl of TEMPLATES) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`${tpl.code} – ${tpl.name}`);

    const items = await parseSOPFile(tpl.file, tpl.charCol, tpl.specCol);
    console.log(`\n총 ${items.length}개 항목:`);
    items.forEach((it) =>
      console.log(
        `  [${it.section.padEnd(14)}] #${String(it.no).padStart(2)} ${(it.opNo ?? "       ").padEnd(10)} ${it.characteristic.slice(0, 40).padEnd(40)} ${it.inputType}${it.specMin != null || it.specMax != null ? ` [${it.specMin ?? ""}~${it.specMax ?? ""}]` : it.specLabel ? ` label: ${it.specLabel.slice(0, 25)}` : ""}`
      )
    );

    // Daily 템플릿 코드 → ID 조회
    const dailyTemplates = await prisma.checksheetTemplate.findMany({
      where: { code: { in: tpl.dailyCodes } },
      select: { id: true, code: true },
    });
    if (dailyTemplates.length !== tpl.dailyCodes.length) {
      console.log(`  ⚠️ Daily 템플릿 코드 일부 못 찾음. 기대=${tpl.dailyCodes.join(",")} 발견=${dailyTemplates.map((d) => d.code).join(",")}`);
    }
    const dailyIds = dailyTemplates.map((d) => d.id);

    // 연결될 파트넘버를 라인별로 미리 집계 (검증용)
    const targetPns = await prisma.partNumber.findMany({
      where: { templateLinks: { some: { templateId: { in: dailyIds } } } },
      include: { model: { include: { line: { include: { company: true } } } } },
    });
    const byLine = new Map<string, number>();
    for (const pn of targetPns) {
      const lk = `${pn.model.line.company.code} Line ${pn.model.line.code}`;
      byLine.set(lk, (byLine.get(lk) ?? 0) + 1);
    }
    console.log(`\n  연결 대상 파트넘버 ${targetPns.length}개 (Daily ${tpl.dailyCodes.join(",")} 기준):`);
    [...byLine.entries()].sort().forEach(([line, n]) => console.log(`    ${line}: ${n}개`));

    if (!COMMIT) continue;

    // 템플릿 생성/업데이트
    let template = await prisma.checksheetTemplate.findUnique({ where: { code: tpl.code } });
    if (!template) {
      template = await prisma.checksheetTemplate.create({
        data: { code: tpl.code, name: tpl.name, version: tpl.version, sampleCount: tpl.sampleCount, sampleLabels: tpl.sampleLabels },
      });
      console.log(`\n✓ 템플릿 생성 [${template.id}]`);
    } else {
      await prisma.checksheetTemplate.update({
        where: { id: template.id },
        data: { name: tpl.name, version: tpl.version, sampleCount: tpl.sampleCount, sampleLabels: tpl.sampleLabels },
      });
      console.log(`\n✓ 템플릿 업데이트 [${template.id}]`);
    }

    // 기존 항목 삭제 후 재생성 (SpecRange가 CheckItem을 FK로 참조하므로 먼저 삭제)
    const existingItems = await prisma.checkItem.findMany({
      where: { templateId: template.id },
      select: { id: true },
    });
    if (existingItems.length) {
      const ids = existingItems.map((i) => i.id);
      await prisma.specRange.deleteMany({ where: { itemId: { in: ids } } });
      await prisma.checkValue.deleteMany({ where: { itemId: { in: ids } } });
      const del = await prisma.checkItem.deleteMany({ where: { templateId: template.id } });
      console.log(`  ${del.count}개 기존 항목 삭제`);
    }

    for (const item of items) {
      const created = await prisma.checkItem.create({
        data: {
          templateId: template.id,
          section: item.section,
          no: item.no,
          opNo: item.opNo ?? null,
          characteristic: item.characteristic,
          method: item.method ?? null,
          inputType: item.inputType,
          nullable: item.inputType === "text",
        },
      });

      // SpecRange 생성 (전체 공통 스펙)
      if (item.specMin != null || item.specMax != null || item.specLabel) {
        await prisma.specRange.create({
          data: {
            itemId: created.id,
            minVal: item.specMin ?? null,
            maxVal: item.specMax ?? null,
            label: item.specLabel ?? null,
          },
        });
      }
    }
    console.log(`  ✓ ${items.length}개 항목 생성`);

    // 파트넘버 연결 (위에서 집계한 targetPns 사용)
    let linked = 0, skipped = 0;
    for (const pn of targetPns) {
      const ex = await prisma.partNumberTemplate.findUnique({
        where: { partNumberId_templateId: { partNumberId: pn.id, templateId: template.id } },
      });
      if (ex) { skipped++; continue; }
      await prisma.partNumberTemplate.create({ data: { partNumberId: pn.id, templateId: template.id } });
      linked++;
    }
    console.log(`  ✓ 파트넘버 ${linked}개 연결 (${skipped}개 이미 존재)`);
  }

  console.log("\n✅ 완료");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
