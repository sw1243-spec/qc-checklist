"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const R = "/admin/structure";

// ── Rename ────────────────────────────────────────────────

export async function renameCompany(id: number, name: string) {
  await requireAdmin();
  const v = name.trim();
  if (!v) return { error: "Name required" };
  await prisma.company.update({ where: { id }, data: { name: v } });
  await logAudit({ action: "RENAME", entityType: "Company", entityId: id, detail: { name: v } });
  revalidatePath(R);
}

export async function renameLine(id: number, code: string) {
  await requireAdmin();
  const v = code.trim();
  if (!v) return { error: "Code required" };
  await prisma.line.update({ where: { id }, data: { code: v } });
  await logAudit({ action: "RENAME", entityType: "Line", entityId: id, detail: { code: v } });
  revalidatePath(R);
}

export async function renameModel(id: number, name: string) {
  await requireAdmin();
  const v = name.trim();
  if (!v) return { error: "Name required" };
  await prisma.model.update({ where: { id }, data: { name: v } });
  await logAudit({ action: "RENAME", entityType: "Model", entityId: id, detail: { name: v } });
  revalidatePath(R);
}

export async function renamePartNumber(id: number, code: string, label: string) {
  await requireAdmin();
  const c = code.trim();
  if (!c) return { error: "Code required" };
  await prisma.partNumber.update({ where: { id }, data: { code: c, label: label.trim() || null } });
  await logAudit({ action: "RENAME", entityType: "PartNumber", entityId: id, detail: { code: c } });
  revalidatePath(R);
}

export async function renameTemplate(id: number, name: string) {
  await requireAdmin();
  const v = name.trim();
  if (!v) return { error: "Name required" };
  await prisma.checksheetTemplate.update({ where: { id }, data: { name: v } });
  await logAudit({ action: "RENAME", entityType: "Template", entityId: id, detail: { name: v } });
  revalidatePath(R);
}

// 템플릿 코드(예: 20-053) 수정 — 코드는 고유해야 하므로 중복 시 거부
export async function renameTemplateCode(id: number, code: string) {
  await requireAdmin();
  const v = code.trim();
  if (!v) return { error: "Code required" };
  const dup = await prisma.checksheetTemplate.findFirst({ where: { code: v, id: { not: id } } });
  if (dup) return { error: `Code "${v}" is already used by another template.` };
  await prisma.checksheetTemplate.update({ where: { id }, data: { code: v } });
  await logAudit({ action: "RENAME", entityType: "Template", entityId: id, detail: { code: v } });
  revalidatePath(R);
}

// ── Add ───────────────────────────────────────────────────

export async function addCompany(code: string, name: string) {
  await requireAdmin();
  const c = code.trim().toUpperCase();
  const n = name.trim();
  if (!c || !n) return { error: "Code and name required" };
  const created = await prisma.company.create({ data: { code: c, name: n } });
  await logAudit({ action: "CREATE", entityType: "Company", entityId: created.id, detail: { code: c, name: n } });
  revalidatePath(R);
}

export async function addLine(companyId: number, code: string) {
  await requireAdmin();
  const c = code.trim().toUpperCase();
  if (!c) return { error: "Code required" };
  const created = await prisma.line.create({ data: { companyId, code: c } });
  await logAudit({ action: "CREATE", entityType: "Line", entityId: created.id, detail: { companyId, code: c } });
  revalidatePath(R);
}

export async function addModel(lineId: number, name: string) {
  await requireAdmin();
  const n = name.trim();
  if (!n) return { error: "Name required" };
  const created = await prisma.model.create({ data: { lineId, name: n } });
  await logAudit({ action: "CREATE", entityType: "Model", entityId: created.id, detail: { lineId, name: n } });
  revalidatePath(R);
}

export async function addPartNumber(modelId: number, code: string, label: string) {
  await requireAdmin();
  const c = code.trim();
  if (!c) return { error: "Code required" };
  const created = await prisma.partNumber.create({ data: { modelId, code: c, label: label.trim() || null } });
  await logAudit({ action: "CREATE", entityType: "PartNumber", entityId: created.id, detail: { modelId, code: c } });
  revalidatePath(R);
}

// ── Delete (submission이 있으면 스냅샷 처리 후 삭제) ────────

export async function delCompany(id: number) {
  await requireAdmin();
  const lines = await prisma.line.findMany({ where: { companyId: id } });
  for (const line of lines) {
    const subCount = await prisma.submission.count({ where: { lineId: line.id } });
    if (subCount > 0) return { error: `Line ${line.code} has submission records. Delete blocked.` };
  }
  for (const line of lines) {
    const models = await prisma.model.findMany({ where: { lineId: line.id } });
    for (const m of models) {
      await prisma.templateModel.deleteMany({ where: { modelId: m.id } });
      const pns = await prisma.partNumber.findMany({ where: { modelId: m.id } });
      for (const pn of pns) {
        await prisma.partNumberTemplate.deleteMany({ where: { partNumberId: pn.id } });
        await prisma.specRange.deleteMany({ where: { partNumberId: pn.id } });
      }
      await prisma.partNumber.deleteMany({ where: { modelId: m.id } });
    }
    await prisma.model.deleteMany({ where: { lineId: line.id } });
  }
  await prisma.line.deleteMany({ where: { companyId: id } });
  await prisma.company.delete({ where: { id } });
  await logAudit({ action: "DELETE", entityType: "Company", entityId: id });
  revalidatePath(R);
}

export async function delLine(id: number) {
  await requireAdmin();
  const subCount = await prisma.submission.count({ where: { lineId: id } });
  if (subCount > 0) return { error: `${subCount} submission record(s) exist. Delete blocked.` };
  const models = await prisma.model.findMany({ where: { lineId: id } });
  for (const m of models) {
    await prisma.templateModel.deleteMany({ where: { modelId: m.id } });
    const pns = await prisma.partNumber.findMany({ where: { modelId: m.id } });
    for (const pn of pns) {
      await prisma.partNumberTemplate.deleteMany({ where: { partNumberId: pn.id } });
      await prisma.specRange.deleteMany({ where: { partNumberId: pn.id } });
    }
    await prisma.partNumber.deleteMany({ where: { modelId: m.id } });
  }
  await prisma.model.deleteMany({ where: { lineId: id } });
  await prisma.line.delete({ where: { id } });
  await logAudit({ action: "DELETE", entityType: "Line", entityId: id });
  revalidatePath(R);
}

export async function delModel(id: number) {
  await requireAdmin();
  const model = await prisma.model.findUnique({ where: { id } });
  if (model) {
    await prisma.submission.updateMany({ where: { modelId: id }, data: { modelId: null, modelName: model.name } });
  }
  await prisma.templateModel.deleteMany({ where: { modelId: id } });
  const pns = await prisma.partNumber.findMany({ where: { modelId: id } });
  for (const pn of pns) {
    await prisma.submission.updateMany({ where: { partNumberId: pn.id }, data: { partNumberId: null, partNumberBuild: pn.code } });
    await prisma.partNumberTemplate.deleteMany({ where: { partNumberId: pn.id } });
    await prisma.specRange.deleteMany({ where: { partNumberId: pn.id } });
  }
  await prisma.partNumber.deleteMany({ where: { modelId: id } });
  await prisma.model.delete({ where: { id } });
  await logAudit({ action: "DELETE", entityType: "Model", entityId: id, detail: { name: model?.name } });
  revalidatePath(R);
}

export async function delPartNumber(id: number) {
  await requireAdmin();
  const pn = await prisma.partNumber.findUnique({ where: { id } });
  if (pn) {
    await prisma.submission.updateMany({ where: { partNumberId: id }, data: { partNumberId: null, partNumberBuild: pn.code } });
  }
  await prisma.partNumberTemplate.deleteMany({ where: { partNumberId: id } });
  await prisma.specRange.deleteMany({ where: { partNumberId: id } });
  await prisma.partNumber.delete({ where: { id } });
  await logAudit({ action: "DELETE", entityType: "PartNumber", entityId: id, detail: { code: pn?.code } });
  revalidatePath(R);
}

// ── Template 연결 ─────────────────────────────────────────

// 모델에 템플릿 직접 연결 (TemplateModel)
export async function linkTemplateModel(modelId: number, templateId: number) {
  await requireAdmin();
  await prisma.templateModel.upsert({
    where: { templateId_modelId: { templateId, modelId } },
    create: { templateId, modelId },
    update: {},
  });
  revalidatePath(R);
}

export async function unlinkTemplateModel(modelId: number, templateId: number) {
  await requireAdmin();
  await prisma.templateModel.deleteMany({ where: { templateId, modelId } });
  revalidatePath(R);
}

// 파트넘버에 템플릿 연결 (PartNumberTemplate)
export async function linkTemplatePartNumber(partNumberId: number, templateId: number) {
  await requireAdmin();
  await prisma.partNumberTemplate.upsert({
    where: { partNumberId_templateId: { partNumberId, templateId } },
    create: { partNumberId, templateId },
    update: {},
  });
  revalidatePath(R);
}

export async function unlinkTemplatePartNumber(partNumberId: number, templateId: number) {
  await requireAdmin();
  await prisma.partNumberTemplate.deleteMany({ where: { partNumberId, templateId } });
  revalidatePath(R);
}
