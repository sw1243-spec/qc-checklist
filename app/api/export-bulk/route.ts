import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";
import { isAuthenticated } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!(await isAuthenticated())) return new NextResponse("Unauthorized", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const defaultFrom = () => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; };
  // 잘못된 날짜 파라미터(Invalid Date)는 기본값으로 폴백 — 쿼리 크래시 방지
  // 'T00:00:00'을 붙여 로컬 자정으로 파싱 (UTC 파싱 시 타임존 어긋남 방지, history 페이지와 동일)
  const fromParam = sp.get("from") ? new Date(sp.get("from")! + "T00:00:00") : defaultFrom();
  const from = isNaN(fromParam.getTime()) ? defaultFrom() : fromParam;
  const toParam = sp.get("to") ? new Date(sp.get("to")! + "T00:00:00") : new Date();
  const to = isNaN(toParam.getTime()) ? new Date() : toParam;
  const lineId   = sp.get("line")    ? Number(sp.get("line"))    : undefined;
  const company  = sp.get("company") ?? undefined;
  const oorOnly  = sp.get("oor") === "1";

  to.setHours(23, 59, 59, 999);

  const submissions = await prisma.submission.findMany({
    where: {
      date: { gte: from, lte: to },
      ...(lineId ? { lineId } : company ? { line: { company: { code: company } } } : {}),
      ...(oorOnly ? { hasOutOfRange: true } : {}),
    },
    include: {
      line: { include: { company: true } },
      model: true,
      template: { select: { code: true, name: true, sampleLabels: true, sampleCount: true } },
      correctiveAction: true,
      values: {
        include: { item: true },
        orderBy: [{ item: { sortOrder: "asc" } }, { shift: "asc" }, { partNo: "asc" }],
      },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 1000,
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Submissions");

  // 헤더
  ws.columns = [
    { header: "ID",            key: "id",          width: 8 },
    { header: "Date",          key: "date",         width: 14 },
    { header: "Company",       key: "company",      width: 14 },
    { header: "Line",          key: "line",         width: 10 },
    { header: "Model",         key: "model",        width: 18 },
    { header: "Part #",        key: "partNo",       width: 18 },
    { header: "Template",      key: "template",     width: 24 },
    { header: "Shift 1 LE",    key: "s1le",         width: 14 },
    { header: "Shift 1 QC",    key: "s1qc",         width: 14 },
    { header: "Shift 2 LE",    key: "s2le",         width: 14 },
    { header: "Shift 2 QC",    key: "s2qc",         width: 14 },
    { header: "Shift 3 LE",    key: "s3le",         width: 14 },
    { header: "Shift 3 QC",    key: "s3qc",         width: 14 },
    { header: "OOR",           key: "oor",          width: 8 },
    { header: "CA Action",     key: "caAction",     width: 24 },
    { header: "CA Resolved By",key: "caResolvedBy", width: 16 },
  ];

  // 헤더 스타일
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD97757" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(1).height = 20;

  // 데이터 행
  submissions.forEach((s) => {
    const row = ws.addRow({
      id:          s.id,
      date:        s.date.toLocaleDateString("en-US"),
      company:     s.companyName  ?? s.line.company.name,
      line:        s.lineName     ?? s.line.code,
      model:       s.modelName    ?? s.model?.name ?? "-",
      partNo:      s.partNumberBuild ?? "",
      template:    s.templateCode ?? s.template.code,
      s1le:        s.shift1LE ?? "",
      s1qc:        s.shift1QC ?? "",
      s2le:        s.shift2LE ?? "",
      s2qc:        s.shift2QC ?? "",
      s3le:        s.shift3LE ?? "",
      s3qc:        s.shift3QC ?? "",
      oor:         s.hasOutOfRange ? "OOR" : "Pass",
      caAction:    s.correctiveAction?.action ?? "",
      caResolvedBy:s.correctiveAction?.resolvedBy ?? "",
    });

    // OOR 행 강조
    if (s.hasOutOfRange) {
      row.getCell("oor").font = { bold: true, color: { argb: "FFFF3B30" } };
    }
  });

  // 테두리
  ws.eachRow((row, i) => {
    if (i === 1) return;
    row.eachCell((cell) => {
      cell.border = {
        top:    { style: "thin", color: { argb: "FFE5E5EA" } },
        bottom: { style: "thin", color: { argb: "FFE5E5EA" } },
        left:   { style: "thin", color: { argb: "FFE5E5EA" } },
        right:  { style: "thin", color: { argb: "FFE5E5EA" } },
      };
    });
  });

  const fromStr = from.toISOString().slice(0, 10);
  const toStr   = to.toISOString().slice(0, 10);
  const filename = `QC_Export_${fromStr}_${toStr}.xlsx`;

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
