// storage/config-export.json → 새 DB에 config 데이터 삽입
// ID를 원본 그대로 유지 (IDENTITY_INSERT ON) → 링크(FK) 자동 보존
//
// 사용:
//   1. .env의 DATABASE_URL을 새 DB로 변경
//   2. npx prisma migrate deploy   (QC 테이블 생성)
//   3. npx tsx scripts/import-config.ts           (dry-run, 저장 안 함)
//   4. npx tsx scripts/import-config.ts --commit  (실제 저장)
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const SRC = path.join(process.cwd(), "storage", "config-export.json");

function fmt(n: number, label: string) {
  console.log(`  ${COMMIT ? "✓" : "[dry]"} ${label}: ${n}`);
}

// IDENTITY_INSERT를 켜고 INSERT 후 끄는 헬퍼
async function insertWithIdentity(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  if (!COMMIT) { fmt(rows.length, table); return; }

  await prisma.$executeRawUnsafe(`SET IDENTITY_INSERT [dbo].[${table}] ON`);
  try {
    for (const row of rows) {
      const cols = Object.keys(row).map((c) => `[${c}]`).join(", ");
      const vals = Object.values(row).map((v) => {
        if (v === null || v === undefined) return "NULL";
        if (typeof v === "boolean") return v ? "1" : "0";
        if (typeof v === "number") return String(v);
        if (v instanceof Date) return `'${v.toISOString()}'`;
        // string — escape single quotes
        return `'${String(v).replace(/'/g, "''")}'`;
      }).join(", ");
      await prisma.$executeRawUnsafe(
        `INSERT INTO [dbo].[${table}] (${cols}) VALUES (${vals})`
      );
    }
    fmt(rows.length, table);
  } finally {
    await prisma.$executeRawUnsafe(`SET IDENTITY_INSERT [dbo].[${table}] OFF`);
  }
}

// IDENTITY 없는 복합 PK 테이블 (단순 INSERT)
async function insertPlain(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  if (!COMMIT) { fmt(rows.length, table); return; }

  for (const row of rows) {
    const cols = Object.keys(row).map((c) => `[${c}]`).join(", ");
    const vals = Object.values(row).map((v) => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "boolean") return v ? "1" : "0";
      if (typeof v === "number") return String(v);
      if (v instanceof Date) return `'${v.toISOString()}'`;
      return `'${String(v).replace(/'/g, "''")}'`;
    }).join(", ");
    await prisma.$executeRawUnsafe(
      `INSERT INTO [dbo].[${table}] (${cols}) VALUES (${vals})`
    );
  }
  fmt(rows.length, table);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Export file not found: ${SRC}`);
    console.error("Run: npx tsx scripts/export-config.ts  first.");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SRC, "utf-8"));
  console.log(`Source: ${SRC} (exported ${data.exportedAt})`);
  console.log(COMMIT ? "Mode: COMMIT" : "Mode: DRY-RUN (pass --commit to save)\n");

  // 삽입 순서: FK 부모 → 자식
  await insertWithIdentity("Company",            data.companies);
  await insertWithIdentity("Line",               data.lines);
  await insertWithIdentity("Model",              data.models);
  await insertWithIdentity("PartNumber",         data.partNumbers);
  await insertWithIdentity("ChecksheetTemplate", data.templates);
  await insertWithIdentity("CheckItem",          data.checkItems);
  await insertWithIdentity("SpecRange",          data.specRanges);
  await insertWithIdentity("ShiftConfig",        data.shiftConfigs);
  await insertWithIdentity("Worker",             data.workers);

  // 복합 PK (IDENTITY 없음)
  await insertPlain("TemplateModel",        data.templateModels);
  await insertPlain("PartNumberTemplate",   data.partNumberTemplates);
  await insertPlain("ChartTemplate",        data.chartTemplates);
  await insertPlain("ChartMetric",          data.chartMetrics);

  console.log(COMMIT ? "\nDone." : "\nDry-run complete. Add --commit to apply.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
