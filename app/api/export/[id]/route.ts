import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";
import { isAuthenticated } from "@/lib/auth";

type Spec = { lineId: number | null; modelId: number | null; partNumberId: number | null; minVal: number | null; maxVal: number | null; label: string | null };

// 제출 범위(라인/모델/파트넘버)에 맞는 스펙 선택 (ChecklistForm/submission 과 동일 규칙)
function getSpec(specRanges: Spec[], lineId: number | null, modelId: number | null, partNumberId: number | null): Spec | null {
  return (
    (partNumberId ? specRanges.find((s) => s.partNumberId === partNumberId) : null) ??
    specRanges.find((s) => s.lineId === lineId && s.modelId === modelId && !s.partNumberId) ??
    specRanges.find((s) => s.lineId === lineId && s.modelId === null && !s.partNumberId) ??
    specRanges.find((s) => s.lineId === null && s.modelId === modelId && !s.partNumberId) ??
    specRanges.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId) ??
    null
  );
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const sid = Number(id);
  if (!Number.isFinite(sid)) return new NextResponse("Not Found", { status: 404 });
  const submission = await prisma.submission.findUnique({
    where: { id: sid },
    include: {
      template: true,
      line: { include: { company: true } },
      model: true,
      values: {
        include: { item: { include: { specRanges: true } } },
        orderBy: [{ item: { sortOrder: "asc" } }, { shift: "asc" }, { partNo: "asc" }],
      },
    },
  });
  if (!submission) return new NextResponse("Not Found", { status: 404 });

  const sampleLabels = submission.template.sampleLabels.split(",");
  const sampleCount = submission.template.sampleCount;
  const shift = submission.values[0]?.shift ?? 1;

  // 제출된 shift의 값만
  const vals = submission.values.filter((v) => v.shift === shift);
  const getVal = (itemId: number, partNo: number) =>
    vals.find((v) => v.itemId === itemId && v.partNo === partNo)?.valueText ?? "";
  const isOor = (itemId: number, partNo: number) =>
    vals.find((v) => v.itemId === itemId && v.partNo === partNo)?.isOutOfRange ?? false;

  const items = [...new Map(vals.map((v) => [v.itemId, v.item])).values()]
    .sort((a, b) => a.no - b.no);
  const sections = [...new Set(items.map((i) => i.section))];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("QC Check Sheet");

  // ── 페이지 설정 ─────────────────────────────────────────────
  ws.pageSetup = {
    paperSize: 3 as ExcelJS.PaperSize,  // Tabloid (11" x 17")
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
  };

  // ── 컬럼 정의 ───────────────────────────────────────────────
  // No(3) | Item(26) | Spec(16) | Method(12) | samples(9 each)
  const sampleColWidth = Math.max(9, Math.floor(22 / sampleCount));
  ws.columns = [
    { key: "no",     width: 4 },
    { key: "item",   width: 28 },
    { key: "spec",   width: 16 },
    { key: "method", width: 13 },
    ...sampleLabels.map((_, i) => ({ key: `s${i + 1}`, width: sampleColWidth })),
  ];

  const totalCols = 4 + sampleCount;
  const lastCol = String.fromCharCode(64 + totalCols);

  // ── 헬퍼 ────────────────────────────────────────────────────
  const DARK   = "FF1A1A1A";
  const GRAY   = "FF4A4A4A";
  const LGRAY  = "FFF0F0F0";
  const WHITE  = "FFFFFFFF";
  const ACCENT = "FF0071E3";
  const DANGER = "FFFF3B30";

  function border(style: ExcelJS.BorderStyle = "thin") {
    const s = { style, color: { argb: "FFB0B0B0" } };
    return { top: s, left: s, bottom: s, right: s };
  }

  function fillCell(cell: ExcelJS.Cell, fgArgb: string) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fgArgb } };
  }

  let r = 1;

  // ── Row 1: 타이틀 ───────────────────────────────────────────
  ws.mergeCells(r, 1, r, totalCols);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = submission.template.name.toUpperCase();
  titleCell.font = { bold: true, size: 13, color: { argb: WHITE }, name: "Calibri" };
  fillCell(titleCell, DARK);
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  titleCell.border = border();
  ws.getRow(r).height = 26;
  r++;

  // ── Row 2: 메타 정보 ────────────────────────────────────────
  // [Company | Line] [Model / Part#] [Date] [Shift]
  const metaRow = ws.getRow(r);
  metaRow.height = 18;

  const metaItems: { label: string; value: string }[] = [
    { label: "Company", value: submission.companyName  ?? submission.line.company.name },
    { label: "Line",    value: submission.lineName     ?? submission.line.code },
    { label: "Model",   value: submission.modelName    ?? submission.model?.name ?? "-" },
    { label: "Date",    value: submission.date.toLocaleDateString("en-US") },
    { label: "Shift",   value: `Shift ${shift}` },
    ...(submission.partNumberBuild ? [{ label: "Part #", value: submission.partNumberBuild }] : []),
  ];

  // 메타 셀을 totalCols에 맞게 균등 배분
  const metaPerCol = Math.ceil(totalCols / metaItems.length);
  metaItems.forEach((m, i) => {
    const startC = i * metaPerCol + 1;
    const endC   = Math.min(startC + metaPerCol - 1, totalCols);
    if (startC <= totalCols) {
      if (startC < endC) ws.mergeCells(r, startC, r, endC);
      const cell = ws.getCell(r, startC);
      cell.value = `${m.label}: ${m.value}`;
      cell.font = { size: 9, color: { argb: DARK }, name: "Calibri" };
      fillCell(cell, LGRAY);
      cell.border = border();
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  });
  r++;

  // ── Row 3: 서명 정보 ────────────────────────────────────────
  const sigRow = ws.getRow(r);
  sigRow.height = 17;
  const leVal = shift === 1 ? submission.shift1LE : submission.shift2LE;
  const qcVal = shift === 1 ? submission.shift1QC : submission.shift2QC;
  const half  = Math.floor(totalCols / 2);

  ws.mergeCells(r, 1, r, half);
  const leCell = ws.getCell(r, 1);
  leCell.value = `Line Leader: ${leVal ?? ""}`;
  leCell.font = { size: 9, color: { argb: DARK }, name: "Calibri" };
  fillCell(leCell, LGRAY);
  leCell.border = border();
  leCell.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(r, half + 1, r, totalCols);
  const qcCell = ws.getCell(r, half + 1);
  qcCell.value = `QC Inspector: ${qcVal ?? ""}`;
  qcCell.font = { size: 9, color: { argb: DARK }, name: "Calibri" };
  fillCell(qcCell, LGRAY);
  qcCell.border = border();
  qcCell.alignment = { horizontal: "center", vertical: "middle" };
  r++;

  // ── Row 4: 컬럼 헤더 ────────────────────────────────────────
  const hRow = ws.getRow(r);
  hRow.height = 24;
  const headers = ["No.", "Measuring Item", "Specification", "Method", ...sampleLabels];
  headers.forEach((h, ci) => {
    const cell = ws.getCell(r, ci + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: WHITE }, name: "Calibri" };
    fillCell(cell, GRAY);
    cell.border = border();
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  r++;

  // ── 데이터 행 ───────────────────────────────────────────────
  let rowIdx = 0;
  for (const section of sections) {
    // 섹션 헤더
    ws.mergeCells(r, 1, r, totalCols);
    const secCell = ws.getCell(r, 1);
    secCell.value = section;
    secCell.font = { bold: true, size: 9, color: { argb: WHITE }, name: "Calibri" };
    fillCell(secCell, ACCENT);
    secCell.border = border();
    secCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    ws.getRow(r).height = 16;
    r++;

    const sectionItems = items.filter((i) => i.section === section);
    for (const item of sectionItems) {
      const dataRow = ws.getRow(r);
      dataRow.height = 20;
      const bg = rowIdx % 2 === 0 ? WHITE : "FFF8F8F8";

      const spec = getSpec(item.specRanges, submission.lineId, submission.modelId, submission.partNumberId);
      const specStr = spec?.label
        ?? (spec && (spec.minVal !== null || spec.maxVal !== null)
            ? `${spec.minVal ?? ""}${spec.minVal !== null && spec.maxVal !== null ? " ~ " : ""}${spec.maxVal ?? ""}${item.unit ? ` ${item.unit}` : ""}`
            : item.inputType === "ok_ng" ? "OK / Not OK" : "—");
      const cells = [
        { col: 1, val: item.no,             align: "center" as const },
        { col: 2, val: item.characteristic, align: "left"   as const },
        { col: 3, val: specStr,             align: "center" as const },
        { col: 4, val: item.method ?? "",   align: "center" as const },
      ];
      sampleLabels.forEach((_, si) => {
        const partNo = si + 1;
        const v = getVal(item.id, partNo);
        const oor = isOor(item.id, partNo);
        cells.push({ col: 5 + si, val: v, align: "center" as const, oor } as typeof cells[0] & { oor?: boolean });
      });

      cells.forEach(({ col, val, align, oor }: { col: number; val: string | number; align: "center" | "left"; oor?: boolean }) => {
        const cell = ws.getCell(r, col);
        cell.value = val as string;
        cell.font = {
          size: 9,
          name: "Calibri",
          color: { argb: oor ? DANGER : DARK },
          bold: !!oor,
        };
        fillCell(cell, oor ? "FFFFF0F0" : bg);
        cell.border = border();
        cell.alignment = { horizontal: align, vertical: "middle", wrapText: col === 2 };
      });
      r++;
      rowIdx++;
    }
  }

  // ── 하단 여백 행 ────────────────────────────────────────────
  ws.getRow(r).height = 8;
  r++;

  // ── 프린트 영역 ─────────────────────────────────────────────
  ws.pageSetup.printArea = `A1:${lastCol}${r - 1}`;

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `QC_${submission.template.code}_${submission.date.toISOString().split("T")[0]}_Line${submission.line.code}_Shift${shift}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
