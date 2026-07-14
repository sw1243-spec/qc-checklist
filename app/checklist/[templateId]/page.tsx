import { redirect, notFound } from "next/navigation";
import { cookies } from "next/headers";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEVICE_DEPARTMENT_COOKIE, parseDeviceDepartment } from "@/lib/device";
import ChecklistForm from "./ChecklistForm";

export default async function ChecklistPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ lineId?: string; modelId?: string; partNumberId?: string; shift?: string; submissionId?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");

  const { templateId: templateIdStr } = await params;
  const { lineId: lineIdStr, modelId: modelIdStr, partNumberId: pnIdStr, shift: shiftStr, submissionId: subIdStr } = await searchParams;

  const templateId = Number(templateIdStr);
  const lineId = Number(lineIdStr);
  const modelId = Number(modelIdStr);
  const partNumberId = pnIdStr ? Number(pnIdStr) : undefined;
  const shift = Number(shiftStr) === 3 ? 3 : Number(shiftStr) === 2 ? 2 : 1;

  if (!lineId || !modelId) notFound();

  const [template, line, model, partNumber] = await Promise.all([
    prisma.checksheetTemplate.findUnique({
      where: { id: templateId },
      include: {
        items: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: { specRanges: true },
        },
      },
    }),
    prisma.line.findUnique({ where: { id: lineId } }),
    prisma.model.findUnique({ where: { id: modelId } }),
    partNumberId ? prisma.partNumber.findUnique({ where: { id: partNumberId } }) : Promise.resolve(null),
  ]);

  if (!template || !line || !model) notFound();
  const cookieStore = await cookies();
  const lockedDepartment = parseDeviceDepartment(cookieStore.get(DEVICE_DEPARTMENT_COOKIE)?.value);

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

  const shiftConfig = await prisma.shiftConfig.findUnique({ where: { order: shift } });
  const shiftName = shiftConfig?.name ?? (shift === 1 ? "1st Shift" : shift === 2 ? "2nd Shift" : "3rd Shift");

  const initialValues: Record<string, string> = {};
  let initialMeta: {
    shift1LE: string; shift2LE: string; shift1QC: string; shift2QC: string;
    shift1SV: string; shift2SV: string;
    shift3LE: string; shift3QC: string; shift3SV: string;
    partNumberBuild: string;
  } | null = null;
  let defaultDate = todayStr;

  const subId = subIdStr ? Number(subIdStr) : null;

  if (subId) {
    // 과거 제출 편집 모드: 마감 체크 없이 해당 제출 값 로드
    const existing = await prisma.submission.findUnique({
      where: { id: subId },
      include: { values: true },
    });
    if (existing && existing.templateId === templateId && existing.lineId === lineId) {
      const d = new Date(existing.date);
      defaultDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      for (const v of existing.values) initialValues[`${v.itemId}-${v.shift}-${v.partNo}`] = v.valueText ?? "";
      initialMeta = {
        shift1LE: existing.shift1LE ?? "", shift2LE: existing.shift2LE ?? "",
        shift1QC: existing.shift1QC ?? "", shift2QC: existing.shift2QC ?? "",
        shift1SV: existing.shift1SV ?? "", shift2SV: existing.shift2SV ?? "",
        shift3LE: existing.shift3LE ?? "", shift3QC: existing.shift3QC ?? "",
        shift3SV: existing.shift3SV ?? "",
        partNumberBuild: existing.partNumberBuild ?? "",
      };
    }
  } else {
    // 일반 모드: 마감시간이 아직 지나지 않은 경우에만 기존 제출값 로드
    const dayStart = new Date(todayStr + "T00:00:00");
    const windowEnd = new Date(todayStr + "T00:00:00");
    if (shiftConfig) {
      windowEnd.setHours(shiftConfig.endHour, shiftConfig.endMinute, 59, 999);
    } else {
      windowEnd.setHours(23, 59, 59, 999);
    }
    if (now <= windowEnd) {
      const existing = await prisma.submission.findFirst({
        where: { templateId, partNumberId: partNumberId ?? null, lineId, modelId, date: { gte: dayStart, lte: windowEnd } },
        include: { values: true },
      });
      if (existing) {
        for (const v of existing.values) initialValues[`${v.itemId}-${v.shift}-${v.partNo}`] = v.valueText ?? "";
        initialMeta = {
          shift1LE: existing.shift1LE ?? "", shift2LE: existing.shift2LE ?? "",
          shift1QC: existing.shift1QC ?? "", shift2QC: existing.shift2QC ?? "",
          shift1SV: existing.shift1SV ?? "", shift2SV: existing.shift2SV ?? "",
          shift3LE: existing.shift3LE ?? "", shift3QC: existing.shift3QC ?? "",
          shift3SV: existing.shift3SV ?? "",
          partNumberBuild: existing.partNumberBuild ?? "",
        };
      }
    }
  }

  return (
    <ChecklistForm
      initialValues={initialValues}
      initialMeta={initialMeta}
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
      defaultDate={defaultDate}
      leNames={leNames}
      qcNames={qcNames}
      svNames={svNames}
      lockedDepartment={lockedDepartment ?? undefined}
      shiftName={shiftName}
    />
  );
}
