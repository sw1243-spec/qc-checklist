// Stellantis Error Proof Check Sheet 임포트 (21-014 DT/DS/WS, 19-015 RU Front)
// 사용: npx tsx scripts/import-error-proof.ts           (dry-run, 저장 안 함)
//       npx tsx scripts/import-error-proof.ts --commit  (실제 저장)
//
// 주의: 엑셀에 숨김(hidden) 시트가 섞여 있어도 "보이는 시트 1개"만 읽는다.
import "dotenv/config";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const BASE =
  "C:/Users/jin.sewoon/Desktop/project for qc check list/Stellantis/Line 2- RU FRONT, DT DS WS/RU FRONT, DT.DS.WS  Error Proof Check Sheet";

interface ItemDef {
  no: number;
  opNo?: string;
  characteristic: string;
  inputType: "number" | "ok_ng" | "text";
  specLabel?: string;
  specMin?: number;
  specMax?: number;
  unit?: string;
}

// ─── 공통 헬퍼 ──────────────────────────────────────────────
function norm(v: unknown): string {
  if (v == null) return "";
  return String(v).replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
}

// 보이는 시트(숨김 아님)의 첫 행렬을 2차원 배열로 반환
function readVisibleRows(file: string): string[][] {
  const wb = XLSX.readFile(file);
  const meta = wb.Workbook?.Sheets;
  let name = wb.SheetNames[0];
  for (let i = 0; i < wb.SheetNames.length; i++) {
    if ((meta?.[i]?.Hidden ?? 0) === 0) { name = wb.SheetNames[i]; break; }
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
  return rows.map((r) => (r as unknown[]).map(norm));
}

// "172.06 ~ 172.46 mm" → {min,max,unit}
function parseRange(s: string): { min?: number; max?: number; unit?: string } {
  const m = s.match(/([\d.]+)\s*~\s*([\d.]+)\s*(mm|kg|g)?/i);
  if (!m) return {};
  return { min: parseFloat(m[1]), max: parseFloat(m[2]), unit: m[3] ? m[3].toLowerCase() : undefined };
}

const STOP = /Confirm Audit|Record actual/i;

// OP No 표기: 숫자로 시작하면 "#" 접두, 아니면 원문 그대로(예: "Vision Check")
function fmtOp(raw?: string): string | undefined {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  if (/^#/.test(s)) return s;
  return /^\d/.test(s) ? `#${s}` : s;
}

// ─── 21-014 (DT/DS/WS) "Check Sheet" 파서 ──────────────────
// 열: [0]No [1]Master [2]OP [3]Characteristic [5]Freq [6]Spec [7]Responsible
function parse21014(rows: string[][]): ItemDef[] {
  const out: ItemDef[] = [];
  let seq = 0;
  for (const c of rows) {
    if (STOP.test(c.join(" "))) break;
    if (!/^\d+$/.test(c[0] ?? "")) continue; // 항목 첫 행(No가 숫자)만
    const opNo = fmtOp(c[2]);
    const char = c[3] ?? "";
    const spec = c[6] ?? "";
    if (!char) continue;

    // OB/IB 동시 측정 → 2개로 분리
    const ib = spec.match(/\(IB\)\s*spec:\s*([\d.]+)\s*~\s*([\d.]+)\s*(mm|kg|g)?/i);
    const ob = spec.match(/\(OB\)\s*spec:\s*([\d.]+)\s*~\s*([\d.]+)\s*(mm|kg|g)?/i);
    if (ib && ob) {
      out.push({ no: ++seq, opNo, characteristic: `${char} (OB)`, inputType: "number",
        specMin: parseFloat(ob[1]), specMax: parseFloat(ob[2]), unit: (ob[3] ?? "mm").toLowerCase(), specLabel: `OB ${ob[1]}~${ob[2]} mm` });
      out.push({ no: ++seq, opNo, characteristic: `${char} (IB)`, inputType: "number",
        specMin: parseFloat(ib[1]), specMax: parseFloat(ib[2]), unit: (ib[3] ?? "mm").toLowerCase(), specLabel: `IB ${ib[1]}~${ib[2]} mm` });
      continue;
    }

    if (/OK\s*\/\s*NG/i.test(spec) || !/\d/.test(spec)) {
      out.push({ no: ++seq, opNo, characteristic: char, inputType: "ok_ng" });
    } else {
      const r = parseRange(spec);
      out.push({ no: ++seq, opNo, characteristic: char, inputType: "number",
        specMin: r.min, specMax: r.max, unit: r.unit, specLabel: spec.replace(/^Setting Master\s*:?\s*/i, "").trim() || undefined });
    }
  }
  return out;
}

// ─── 19-015 (RU Front) "RU_AWD_FR ..." 파서 ────────────────
// 열: [1]No [2]Master [3]OP [4]Items [6]Freq.  (이후 행에 O.B/I.B 보조값)
function parse19015(rows: string[][]): ItemDef[] {
  const out: ItemDef[] = [];
  let seq = 0;
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    if (STOP.test(c.join(" "))) break;
    if (!/^\d+$/.test(c[1] ?? "")) continue; // 항목 첫 행(col2 No가 숫자)
    const opNo = fmtOp(c[3]);
    const char = c[4] ?? "";
    if (!char || /^Record Part/i.test(char)) continue;

    // Weight (측정)
    if (/Weight Confirmation/i.test(char)) {
      const r = char.match(/\(([\d.]+)\s*g\s*[-~]\s*([\d.]+)\s*g\)/i);
      out.push({ no: ++seq, opNo, characteristic: "Part Weight Confirmation", inputType: "number",
        specMin: r ? parseFloat(r[1]) : undefined, specMax: r ? parseFloat(r[2]) : undefined, unit: "g",
        specLabel: r ? `${r[1]}~${r[2]} g` : undefined });
      continue;
    }

    // LVDT (측정) → OB/IB 2개. 보조행에서 O.B/I.B 값 수집
    if (/LVDT/i.test(char)) {
      const look = `${rows[i + 1]?.[4] ?? ""} ${rows[i + 2]?.[4] ?? ""} ${rows[i + 3]?.[4] ?? ""}`;
      const obv = look.match(/O\.?B\s*:?\s*([\d.]+)\s*mm/i)?.[1];
      const ibv = look.match(/I\.?B\s*:?\s*([\d.]+)\s*mm/i)?.[1];
      out.push({ no: ++seq, opNo, characteristic: "LVDT Swaging Dia. (OB)", inputType: "number", unit: "mm",
        specLabel: obv ? `OB ${obv} mm` : undefined });
      out.push({ no: ++seq, opNo, characteristic: "LVDT Swaging Dia. (IB)", inputType: "number", unit: "mm",
        specLabel: ibv ? `IB ${ibv} mm` : undefined });
      continue;
    }

    out.push({ no: ++seq, opNo, characteristic: char, inputType: "ok_ng" });
  }
  return out;
}

// ─── 템플릿 정의 ─────────────────────────────────────────────
const TEMPLATES = [
  {
    code: "21-014",
    name: "DT / DS / WS Error Proof Check Sheet",
    version: "Rev D",
    file: `${BASE}/21-014_Rev D_DT_DS_WS_ERRORPROOF-CHKSHT 03.10.2026 Internal Use Only.xlsx`,
    parse: parse21014,
    dailyCodes: ["21-011"], // DT/DS/WS (Line 2,3,4)
  },
  {
    code: "19-015",
    name: "RU Front Error Proof Check Sheet",
    version: "Rev C",
    file: `${BASE}/19-015_Rev C_RU BASE, PHEV, AWD_FRONT_Error Proof Check Sheet 11.04.2025.xls`,
    parse: parse19015,
    dailyCodes: ["20-053"], // RU ALL (Line 1,2)
  },
];

const SECTION = "ERROR PROOF";
const SAMPLE_COUNT = 2;
const SAMPLE_LABELS = "1st,2nd";

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log(COMMIT ? "🚀 COMMIT MODE\n" : "🔍 DRY RUN (--commit 없으면 저장 안 함)\n");

  for (const tpl of TEMPLATES) {
    console.log("=".repeat(64));
    console.log(`${tpl.code} ${tpl.version} – ${tpl.name}`);

    const rows = readVisibleRows(tpl.file);
    const items = tpl.parse(rows);
    console.log(`\n총 ${items.length}개 항목:`);
    for (const it of items) {
      const spec = it.specMin != null || it.specMax != null
        ? `[${it.specMin ?? ""}~${it.specMax ?? ""}${it.unit ? " " + it.unit : ""}]`
        : it.specLabel ? `label:${it.specLabel}` : "";
      console.log(`  #${String(it.no).padStart(2)} ${(it.opNo ?? "").padEnd(8)} ${it.inputType.padEnd(7)} ${it.characteristic.slice(0, 44).padEnd(44)} ${spec}`);
    }

    // 연결 대상 파트넘버 집계 (Daily 코드 기준)
    const dailyTemplates = await prisma.checksheetTemplate.findMany({
      where: { code: { in: tpl.dailyCodes } }, select: { id: true, code: true },
    });
    const dailyIds = dailyTemplates.map((d) => d.id);
    const targetPns = await prisma.partNumber.findMany({
      where: { templateLinks: { some: { templateId: { in: dailyIds } } } },
      include: { model: { include: { line: { include: { company: true } } } } },
    });
    const byLine = new Map<string, number>();
    for (const pn of targetPns) {
      const k = `${pn.model.line.company.code} Line ${pn.model.line.code}`;
      byLine.set(k, (byLine.get(k) ?? 0) + 1);
    }
    console.log(`\n  연결 대상 파트넘버 ${targetPns.length}개 (Daily ${tpl.dailyCodes.join(",")}):`);
    [...byLine.entries()].sort().forEach(([k, n]) => console.log(`    ${k}: ${n}개`));

    if (!COMMIT) { console.log(""); continue; }

    // 템플릿 upsert
    let template = await prisma.checksheetTemplate.findUnique({ where: { code: tpl.code } });
    if (!template) {
      template = await prisma.checksheetTemplate.create({
        data: { code: tpl.code, name: tpl.name, version: tpl.version, sampleCount: SAMPLE_COUNT, sampleLabels: SAMPLE_LABELS },
      });
      console.log(`\n✓ 템플릿 생성 [${template.id}]`);
    } else {
      await prisma.checksheetTemplate.update({
        where: { id: template.id },
        data: { name: tpl.name, version: tpl.version, sampleCount: SAMPLE_COUNT, sampleLabels: SAMPLE_LABELS },
      });
      console.log(`\n✓ 템플릿 업데이트 [${template.id}]`);
    }

    // 기존 항목 정리 후 재생성
    const existing = await prisma.checkItem.findMany({ where: { templateId: template.id }, select: { id: true } });
    if (existing.length) {
      const ids = existing.map((i) => i.id);
      await prisma.specRange.deleteMany({ where: { itemId: { in: ids } } });
      await prisma.checkValue.deleteMany({ where: { itemId: { in: ids } } });
      await prisma.chartMetric.deleteMany({ where: { itemId: { in: ids } } });
      const del = await prisma.checkItem.deleteMany({ where: { templateId: template.id } });
      console.log(`  ${del.count}개 기존 항목 삭제`);
    }

    for (const item of items) {
      const created = await prisma.checkItem.create({
        data: {
          templateId: template.id,
          section: SECTION,
          no: item.no,
          opNo: item.opNo ?? null,
          characteristic: item.characteristic,
          method: null,
          inputType: item.inputType,
          unit: item.unit ?? null,
          nullable: item.inputType === "text",
        },
      });
      if (item.specMin != null || item.specMax != null || item.specLabel) {
        await prisma.specRange.create({
          data: { itemId: created.id, minVal: item.specMin ?? null, maxVal: item.specMax ?? null, label: item.specLabel ?? null },
        });
      }
    }
    console.log(`  ✓ ${items.length}개 항목 생성`);

    // 파트넘버 연결
    let linked = 0, skipped = 0;
    for (const pn of targetPns) {
      const ex = await prisma.partNumberTemplate.findUnique({
        where: { partNumberId_templateId: { partNumberId: pn.id, templateId: template.id } },
      });
      if (ex) { skipped++; continue; }
      await prisma.partNumberTemplate.create({ data: { partNumberId: pn.id, templateId: template.id } });
      linked++;
    }
    console.log(`  ✓ 파트넘버 ${linked}개 연결 (${skipped}개 이미 존재)\n`);
  }

  console.log("✅ 완료");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
