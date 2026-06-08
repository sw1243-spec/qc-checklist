// 초기 Trend Chart 설정 시드: 기존 하드코딩(DAILY_CODES + 이름 추측)을 DB 설정으로 이전.
// 한 번만 실행하면 됨. 이후에는 관리자 페이지(/SWJ/chart)에서 관리.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAILY_CODES = ["20-053", "21-011", "20-052"];

async function main() {
  const templates = await prisma.checksheetTemplate.findMany({
    where: { code: { in: DAILY_CODES } },
    include: {
      items: {
        where: { inputType: "number" },
        select: { id: true, section: true, characteristic: true, unit: true },
      },
    },
  });

  for (const t of templates) {
    await prisma.chartTemplate.upsert({
      where: { templateId: t.id },
      update: {},
      create: { templateId: t.id },
    });

    for (const it of t.items) {
      const hay = `${it.section} ${it.characteristic}`.toLowerCase();
      const isSwaging = hay.includes("swag");
      let metric: string | null = null;
      let unit = it.unit ?? "";
      if (isSwaging && (hay.includes("inboard") || hay.includes("(ib)") || hay.includes("ib "))) {
        metric = "ib"; unit = it.unit ?? "mm";
      } else if (isSwaging && (hay.includes("outboard") || hay.includes("(ob)") || hay.includes("ob "))) {
        metric = "ob"; unit = it.unit ?? "mm";
      } else if (hay.includes("weight")) {
        metric = "weight"; unit = it.unit ?? "g";
      }
      if (metric) {
        await prisma.chartMetric.upsert({
          where: { itemId: it.id },
          update: { metric, unit: unit || null },
          create: { itemId: it.id, metric, unit: unit || null },
        });
      }
    }
    console.log(`Configured ${t.code}: ${t.items.length} numeric items`);
  }
}

main()
  .then(() => console.log("Chart config seeded."))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
