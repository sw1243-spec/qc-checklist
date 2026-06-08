// Excel 파일 구조 확인용 스크립트
// 사용: npx tsx scripts/inspect-excel.ts
import ExcelJS from "exceljs";
import path from "path";

const FILE = path.resolve(
  "C:/Users/jin.sewoon/Desktop/VW/Line A/19-021_Rev M_VW Taos-Tiguan_Atlas_Daily Quality_Check Sheet  04.24.2026- ATLAS_271.J,271 K 272.AC,.xlsx"
);

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  console.log("Sheets:", wb.worksheets.map((s) => `[${s.id}] ${s.name}`).join(", "));

  const ws = wb.worksheets[0];
  console.log(`\nSheet: "${ws.name}"  rows=${ws.rowCount} cols=${ws.columnCount}\n`);

  // 처음 80행 출력 (각 행의 처음 10열만)
  for (let r = 1; r <= Math.min(ws.rowCount, 80); r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= Math.min(ws.columnCount, 15); c++) {
      const cell = row.getCell(c);
      const v = cell.value;
      let txt = "";
      if (v === null || v === undefined) txt = "";
      else if (typeof v === "object" && "richText" in (v as object)) {
        txt = (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
      } else txt = String(v);
      cells.push(txt.slice(0, 25).replace(/\n/g, "↵"));
    }
    const line = cells.map((c, i) => `[${i + 1}]${c}`).join("  ");
    if (line.trim().replace(/\[\d+\]/g, "").trim()) {
      console.log(`R${String(r).padStart(3, "0")}: ${line}`);
    }
  }
}

main().catch(console.error);
