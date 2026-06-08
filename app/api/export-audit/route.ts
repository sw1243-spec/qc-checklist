import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";
import { isAdminAuthenticated } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const action     = sp.get("action") ?? undefined;
  const entityType = sp.get("entityType") ?? undefined;

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10000, // 최대 1만 건
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Audit Log");

  ws.columns = [
    { header: "Timestamp",   key: "createdAt",  width: 22 },
    { header: "Action",      key: "action",     width: 20 },
    { header: "Entity Type", key: "entityType", width: 16 },
    { header: "Entity ID",   key: "entityId",   width: 10 },
    { header: "Actor",       key: "actor",      width: 14 },
    { header: "Detail",      key: "detail",     width: 60 },
  ];

  // 헤더 스타일
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111111" } };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 22;

  logs.forEach((log) => {
    ws.addRow({
      createdAt: log.createdAt.toLocaleString("en-US", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      }),
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId ?? "",
      actor: log.actor ?? "",
      detail: log.detail ?? "",
    });
  });

  // Action별 색상 표시
  const ACTION_COLORS: Record<string, string> = {
    SUBMIT: "FFE8F8EE",
    EDIT_SUBMISSION: "FFFEF3E0",
    CORRECTIVE_ACTION: "FFE0EEFE",
    CREATE: "FFE8F8EE",
    DELETE: "FFFEE4E2",
    LOGIN_FAIL: "FFFEE4E2",
  };

  logs.forEach((log, idx) => {
    const row = ws.getRow(idx + 2);
    const color = ACTION_COLORS[log.action];
    if (color) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      });
    }
  });

  // border
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top:    { style: "thin", color: { argb: "FFE6E6E6" } },
        left:   { style: "thin", color: { argb: "FFE6E6E6" } },
        bottom: { style: "thin", color: { argb: "FFE6E6E6" } },
        right:  { style: "thin", color: { argb: "FFE6E6E6" } },
      };
    });
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
