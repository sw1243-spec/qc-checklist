// 파트넘버-템플릿 연결 현황 확인
// 사용: npx tsx scripts/debug-pn-templates.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, code: true, name: true } });
  console.log("=== Companies ===");
  companies.forEach(c => console.log(`  [${c.id}] ${c.code} - ${c.name}`));

  const templates = await prisma.checksheetTemplate.findMany({ select: { id: true, code: true, name: true } });
  console.log("\n=== Templates ===");
  templates.forEach(t => console.log(`  [${t.id}] ${t.code} - ${t.name}`));

  const links = await prisma.partNumberTemplate.findMany({
    include: {
      partNumber: { include: { model: { include: { line: { include: { company: true } } } } } },
      template: { select: { id: true, name: true } },
    },
  });
  console.log(`\n=== PartNumberTemplate links: ${links.length} total ===`);
  links.slice(0, 20).forEach(l =>
    console.log(`  PN[${l.partNumberId}] ${l.partNumber.model.line.company.code} / ${l.partNumber.code} → Template[${l.templateId}] ${l.template.name}`)
  );
  if (links.length > 20) console.log(`  ... and ${links.length - 20} more`);

  await prisma.$disconnect();
}

main().catch(console.error);
