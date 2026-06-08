import { redirect, notFound } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ChecklistForm from "./ChecklistForm";

export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ lineId?: string; modelId?: string; partNumberId?: string; shift?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");

  const { templateId: templateIdStr } = await params;
  const { lineId: lineIdStr, modelId: modelIdStr, partNumberId: pnIdStr, shift: shiftStr } = await searchParams;

  const templateId = Number(templateIdStr);
  const lineId = Number(lineIdStr);
  const modelId = Number(modelIdStr);
  const partNumberId = pnIdStr ? Number(pnIdStr) : undefined;
  const shift = Number(shiftStr) === 2 ? 2 : 1;

  if (!lineId || !modelId) notFound();

  const [template, line, model, partNumber] = await Promise.all([
    prisma.checksheetTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: {
          orderBy: [{ no: "asc" }, { id: "asc" }],
          include: { specRanges: true },
        },
      },
    }),
    prisma.line.findUnique({ where: { id: lineId } }),
    prisma.model.findUnique({ where: { id: modelId } }),
    partNumberId ? prisma.partNumber.findUnique({ where: { id: partNumberId } }) : Promise.resolve(null),
  ]);

  if (!template || !line || !model) notFound();

  // 해당 라인(또는 전체) + 해당 shift(또는 전체) 작업자 목록
  const workers = await prisma.worker.findMany({
    where: {
      AND: [
        { OR: [{ lineId }, { lineId: null }] },
        { OR: [{ shift }, { shift: null }] },
      ],
    },
    orderBy: { name: "asc" },
  });
  const leNames = workers.filter((w) => w.role === "LE").map((w) => w.name);
  const qcNames = workers.filter((w) => w.role === "QC").map((w) => w.name);
  const svNames = workers.filter((w) => w.role === "SV").map((w) => w.name);

  const autoPartNo = /^[A-Z0-9]+$/.test(model.name);

  // 서버에서 날짜 계산 → 클라이언트와 timezone 불일치로 인한 hydration 오류 방지
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <ChecklistForm
      templateId={templateId}
      lineId={lineId}
      lineCode={line.code}
      modelId={modelId}
      modelName={model.name}
      partNumberId={partNumberId}
      partNumberCode={partNumber?.code}
      partNumberLabel={partNumber?.label ?? undefined}
      templateName={template.name}
      note={template.note ?? undefined}
      items={template.items}
      shift={shift}
      sampleCount={template.sampleCount}
      sampleLabels={template.sampleLabels.split(",")}
      autoPartNo={autoPartNo}
      defaultDate={todayStr}
      leNames={leNames}
      qcNames={qcNames}
      svNames={svNames}
    />
  );
}
