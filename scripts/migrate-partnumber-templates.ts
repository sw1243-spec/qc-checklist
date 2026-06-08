// 기존 PartNumber.templateId → PartNumberTemplate 조인 테이블로 마이그레이션
// 사용: npx tsx scripts/migrate-partnumber-templates.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Migrating PartNumber → PartNumberTemplate join table...\n");

  const partNumbers = await prisma.partNumber.findMany({
    where: { templateId: { not: null } },
    select: { id: true, code: true, templateId: true },
  });

  console.log(`Found ${partNumbers.length} part numbers with templateId`);

  let created = 0;
  let skipped = 0;

  for (const pn of partNumbers) {
    if (!pn.templateId) continue;
    const existing = await prisma.partNumberTemplate.findUnique({
      where: { partNumberId_templateId: { partNumberId: pn.id, templateId: pn.templateId } },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.partNumberTemplate.create({
      data: { partNumberId: pn.id, templateId: pn.templateId },
    });
    created++;
    console.log(`  ✓ ${pn.code} → template ${pn.templateId}`);
  }

  console.log(`\n✅ Done. Created ${created}, skipped ${skipped} (already exists).\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
