// 현재 DB에서 config 데이터 전체 추출 → storage/config-export.json
// 보존: Company, Line, Model, PartNumber, Template, CheckItem, SpecRange,
//        TemplateModel, PartNumberTemplate, ShiftConfig, Worker, ChartTemplate, ChartMetric
// 버림: Submission, CheckValue, SubmissionLog, CorrectiveAction, Attachment, AuditLog, GreaseLog
//
// 사용: npx tsx scripts/export-config.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OUT = path.join(process.cwd(), "storage", "config-export.json");

async function main() {
  console.log("Exporting config data...");

  const [
    companies,
    lines,
    models,
    partNumbers,
    templates,
    checkItems,
    specRanges,
    templateModels,
    partNumberTemplates,
    shiftConfigs,
    workers,
    chartTemplates,
    chartMetrics,
  ] = await Promise.all([
    prisma.company.findMany({ orderBy: { id: "asc" } }),
    prisma.line.findMany({ orderBy: { id: "asc" } }),
    prisma.model.findMany({ orderBy: { id: "asc" } }),
    prisma.partNumber.findMany({ orderBy: { id: "asc" } }),
    prisma.checksheetTemplate.findMany({ orderBy: { id: "asc" } }),
    prisma.checkItem.findMany({ orderBy: { id: "asc" } }),
    prisma.specRange.findMany({ orderBy: { id: "asc" } }),
    prisma.templateModel.findMany(),
    prisma.partNumberTemplate.findMany(),
    prisma.shiftConfig.findMany({ orderBy: { id: "asc" } }),
    prisma.worker.findMany({ orderBy: { id: "asc" } }),
    prisma.chartTemplate.findMany(),
    prisma.chartMetric.findMany(),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    companies,
    lines,
    models,
    partNumbers,
    templates,
    checkItems,
    specRanges,
    templateModels,
    partNumberTemplates,
    shiftConfigs,
    workers,
    chartTemplates,
    chartMetrics,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2), "utf-8");

  console.log(`✓ Exported to ${OUT}`);
  console.log(`  companies:           ${companies.length}`);
  console.log(`  lines:               ${lines.length}`);
  console.log(`  models:              ${models.length}`);
  console.log(`  partNumbers:         ${partNumbers.length}`);
  console.log(`  templates:           ${templates.length}`);
  console.log(`  checkItems:          ${checkItems.length}`);
  console.log(`  specRanges:          ${specRanges.length}`);
  console.log(`  templateModels:      ${templateModels.length}`);
  console.log(`  partNumberTemplates: ${partNumberTemplates.length}`);
  console.log(`  shiftConfigs:        ${shiftConfigs.length}`);
  console.log(`  workers:             ${workers.length}`);
  console.log(`  chartTemplates:      ${chartTemplates.length}`);
  console.log(`  chartMetrics:        ${chartMetrics.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
