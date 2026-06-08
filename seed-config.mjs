// 설정(config) 가져오기 — 회사 서버 등 새 DB에 템플릿/구조/스펙을 복원한다.
//
// 사용법 (회사 서버에서):
//   1) .env 의 DATABASE_URL 을 대상 DB로 설정
//   2) npx prisma migrate deploy   (테이블 생성 — 데이터 보존)
//   3) node seed-config.mjs        (이 스크립트로 설정 주입)
//
// 안전장치: 모든 항목은 자연키로 존재 여부를 확인 후 없을 때만 생성한다.
//          → 여러 번 실행해도 중복이 쌓이지 않는다. 기존 제출 데이터는 건드리지 않는다.

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();
const data = JSON.parse(readFileSync('config-export.json', 'utf8'));

// old id -> new id 매핑
const companyMap = new Map();
const lineMap = new Map();
const modelMap = new Map();
const pnMap = new Map();
const templateMap = new Map();
const itemMap = new Map();

let created = { companies: 0, lines: 0, models: 0, partNumbers: 0, templates: 0, items: 0, templateModels: 0, partNumberTemplates: 0, specRanges: 0, chartTemplates: 0, chartMetrics: 0 };

async function run() {
  // 1) 구조: Company -> Line -> Model -> PartNumber
  for (const c of data.companies) {
    let row = await prisma.company.findUnique({ where: { code: c.code } });
    if (!row) { row = await prisma.company.create({ data: { code: c.code, name: c.name } }); created.companies++; }
    companyMap.set(c.id, row.id);

    for (const l of c.lines) {
      let lr = await prisma.line.findUnique({ where: { companyId_code: { companyId: row.id, code: l.code } } });
      if (!lr) { lr = await prisma.line.create({ data: { companyId: row.id, code: l.code } }); created.lines++; }
      lineMap.set(l.id, lr.id);

      for (const m of l.models) {
        let mr = await prisma.model.findFirst({ where: { lineId: lr.id, name: m.name } });
        if (!mr) { mr = await prisma.model.create({ data: { lineId: lr.id, name: m.name } }); created.models++; }
        modelMap.set(m.id, mr.id);

        for (const pn of m.partNumbers) {
          let pr = await prisma.partNumber.findUnique({ where: { modelId_code: { modelId: mr.id, code: pn.code } } });
          if (!pr) { pr = await prisma.partNumber.create({ data: { modelId: mr.id, code: pn.code, label: pn.label } }); created.partNumbers++; }
          pnMap.set(pn.id, pr.id);
        }
      }
    }
  }

  // 2) 템플릿 + 항목
  for (const t of data.templates) {
    let tr = await prisma.checksheetTemplate.findUnique({ where: { code: t.code } });
    if (!tr) {
      tr = await prisma.checksheetTemplate.create({ data: {
        code: t.code, name: t.name, version: t.version, sampleCount: t.sampleCount,
        sampleLabels: t.sampleLabels, sortOrder: t.sortOrder, note: t.note,
      }});
      created.templates++;
    }
    templateMap.set(t.id, tr.id);

    for (const it of t.items) {
      let ir = await prisma.checkItem.findFirst({ where: { templateId: tr.id, section: it.section, characteristic: it.characteristic } });
      if (!ir) {
        ir = await prisma.checkItem.create({ data: {
          templateId: tr.id, section: it.section, opNo: it.opNo, no: it.no,
          characteristic: it.characteristic, method: it.method, sample: it.sample,
          inputType: it.inputType, unit: it.unit, nullable: it.nullable, department: it.department,
        }});
        created.items++;
      }
      itemMap.set(it.id, ir.id);
    }

    // ChartTemplate (템플릿당 0/1)
    if (t.chartTemplate) {
      const exists = await prisma.chartTemplate.findUnique({ where: { templateId: tr.id } });
      if (!exists) { await prisma.chartTemplate.create({ data: { templateId: tr.id } }); created.chartTemplates++; }
    }
  }

  // 3) TemplateModel 연결
  for (const tm of data.templateModels) {
    const templateId = templateMap.get(tm.templateId), modelId = modelMap.get(tm.modelId);
    if (!templateId || !modelId) continue;
    const exists = await prisma.templateModel.findUnique({ where: { templateId_modelId: { templateId, modelId } } });
    if (!exists) { await prisma.templateModel.create({ data: { templateId, modelId } }); created.templateModels++; }
  }

  // 4) PartNumberTemplate 연결
  for (const pt of data.partNumberTemplates) {
    const partNumberId = pnMap.get(pt.partNumberId), templateId = templateMap.get(pt.templateId);
    if (!partNumberId || !templateId) continue;
    const exists = await prisma.partNumberTemplate.findUnique({ where: { partNumberId_templateId: { partNumberId, templateId } } });
    if (!exists) { await prisma.partNumberTemplate.create({ data: { partNumberId, templateId } }); created.partNumberTemplates++; }
  }

  // 5) SpecRange (자연키 없음 → itemId+scope 조합으로 중복 확인)
  for (const s of data.specRanges) {
    const itemId = itemMap.get(s.itemId);
    if (!itemId) continue;
    const lineId = s.lineId != null ? lineMap.get(s.lineId) ?? null : null;
    const modelId = s.modelId != null ? modelMap.get(s.modelId) ?? null : null;
    const partNumberId = s.partNumberId != null ? pnMap.get(s.partNumberId) ?? null : null;
    const exists = await prisma.specRange.findFirst({ where: { itemId, lineId, modelId, partNumberId } });
    if (!exists) {
      await prisma.specRange.create({ data: { itemId, lineId, modelId, partNumberId, minVal: s.minVal, maxVal: s.maxVal, label: s.label } });
      created.specRanges++;
    }
  }

  // 6) ChartMetric (itemId PK)
  for (const cm of data.chartMetrics) {
    const itemId = itemMap.get(cm.itemId);
    if (!itemId) continue;
    const exists = await prisma.chartMetric.findUnique({ where: { itemId } });
    if (!exists) { await prisma.chartMetric.create({ data: { itemId, metric: cm.metric, unit: cm.unit } }); created.chartMetrics++; }
  }

  console.log('가져오기 완료. 신규 생성:', JSON.stringify(created, null, 2));
  console.log('(이미 있던 항목은 건너뜀 — 재실행해도 안전)');
}

run().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
