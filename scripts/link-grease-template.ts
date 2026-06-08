// Stellantis 파트넘버 전체에 Grease Quality Daily Check Sheet 연결
// 사용: npx tsx scripts/link-grease-template.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Start Of Production 템플릿 찾기
  const greaseTemplate = await prisma.checksheetTemplate.findFirst({
    where: {
      OR: [
        { name: { contains: "Start Of Production" } },
        { name: { contains: "Start of Production" } },
        { name: { contains: "SOP" } },
        { name: { contains: "Grease" } },
      ],
    },
  });

  if (!greaseTemplate) {
    console.error("❌ Start Of Production 템플릿을 찾을 수 없습니다. 어드민에서 템플릿 이름을 확인해주세요.");
    const all = await prisma.checksheetTemplate.findMany({ select: { id: true, code: true, name: true } });
    console.log("현재 템플릿 목록:", all);
    process.exit(1);
  }

  console.log(`✓ SOP 템플릿: [${greaseTemplate.id}] ${greaseTemplate.name} (${greaseTemplate.code})\n`);

  // Stellantis 파트넘버 전체 조회
  const stellantis = await prisma.company.findFirst({
    where: { name: { contains: "Stellantis" } },
  });

  if (!stellantis) {
    console.error("❌ Stellantis 회사를 찾을 수 없습니다.");
    const companies = await prisma.company.findMany({ select: { id: true, code: true, name: true } });
    console.log("현재 회사 목록:", companies);
    process.exit(1);
  }

  console.log(`✓ Stellantis: [${stellantis.id}] ${stellantis.name}\n`);

  const partNumbers = await prisma.partNumber.findMany({
    where: {
      model: { line: { companyId: stellantis.id } },
    },
    include: { model: { include: { line: true } } },
    orderBy: { code: "asc" },
  });

  console.log(`Found ${partNumbers.length} Stellantis part numbers\n`);

  let created = 0;
  let skipped = 0;

  for (const pn of partNumbers) {
    const existing = await prisma.partNumberTemplate.findUnique({
      where: {
        partNumberId_templateId: {
          partNumberId: pn.id,
          templateId: greaseTemplate.id,
        },
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.partNumberTemplate.create({
      data: { partNumberId: pn.id, templateId: greaseTemplate.id },
    });
    created++;
    console.log(`  ✓ ${pn.model.line.code} / ${pn.model.name} / ${pn.code}`);
  }

  console.log(`\n✅ Done. Created ${created}, skipped ${skipped} (already linked).\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
