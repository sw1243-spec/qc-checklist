import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SpcChart from "./SpcChart";
import PeriodSelector from "../../../dashboard/PeriodSelector";

export default async function SpcItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string; itemId: string }>;
  searchParams: Promise<{ lineId?: string; modelId?: string; partNumberId?: string; ym?: string }>;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const { templateId, itemId } = await params;
  const sp = await searchParams;
  const tid = Number(templateId);
  const iid = Number(itemId);
  if (!Number.isFinite(tid) || !Number.isFinite(iid)) notFound();

  const item = await prisma.checkItem.findUnique({
    where: { id: iid },
    include: { specRanges: true, template: true },
  });
  if (!item || item.templateId !== tid) notFound();

  const now = new Date();
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ym = sp.ym ?? "all";

  // 날짜 범위 계산 (all / 연도 / 년-월)
  const whereSub: { date?: { gte: Date; lt: Date }; lineId?: number; modelId?: number; partNumberId?: number } = {};
  if (ym !== "all") {
    if (/^\d{4}$/.test(ym)) {
      const y = Number(ym);
      whereSub.date = { gte: new Date(y, 0, 1, 0, 0, 0, 0), lt: new Date(y + 1, 0, 1, 0, 0, 0, 0) };
    } else {
      const [y, m] = ym.split("-").map(Number);
      whereSub.date = { gte: new Date(y, m - 1, 1, 0, 0, 0, 0), lt: new Date(y, m, 1, 0, 0, 0, 0) };
    }
  }
  if (sp.lineId) whereSub.lineId = Number(sp.lineId);
  if (sp.modelId) whereSub.modelId = Number(sp.modelId);
  if (sp.partNumberId) whereSub.partNumberId = Number(sp.partNumberId);

  const values = await prisma.checkValue.findMany({
    where: {
      itemId: iid,
      submission: whereSub,
      valueText: { not: null },
    },
    include: {
      submission: {
        include: {
          line: { include: { company: true } },
          model: true,
          partNumber: true,
        },
      },
    },
    orderBy: { submission: { date: "asc" } },
  });

  // 숫자 파싱
  const dataPoints = values
    .map((v) => {
      const num = parseFloat(v.valueText ?? "");
      if (isNaN(num)) return null;
      return {
        id: v.id,
        value: num,
        date: v.submission.date,
        lineCode: v.submission.line.code,
        company: v.submission.line.company.code,
        modelName: v.submission.modelName ?? v.submission.model?.name ?? "-",
        partNumberCode: v.submission.partNumber?.code ?? v.submission.partNumberBuild ?? null,
        shift: v.shift,
        partNo: v.partNo,
        isOutOfRange: v.isOutOfRange,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Spec range 결정 (partNumber > line+model > line > model > global > fallback)
  const lineIdNum = sp.lineId ? Number(sp.lineId) : null;
  const modelIdNum = sp.modelId ? Number(sp.modelId) : null;
  const partNumberIdNum = sp.partNumberId ? Number(sp.partNumberId) : null;
  const spec =
    (partNumberIdNum ? item.specRanges.find((s) => s.partNumberId === partNumberIdNum) : null) ??
    item.specRanges.find((s) => s.lineId === lineIdNum && s.modelId === modelIdNum && !s.partNumberId) ??
    item.specRanges.find((s) => s.lineId === lineIdNum && s.modelId === null && !s.partNumberId) ??
    item.specRanges.find((s) => s.lineId === null && s.modelId === modelIdNum && !s.partNumberId) ??
    item.specRanges.find((s) => s.lineId === null && s.modelId === null && !s.partNumberId) ??
    // Fallback: 등록된 첫 spec
    item.specRanges[0];

  // DB에 min/max가 뒤바뀌어 저장된 경우 대비 — 항상 lsl < usl 보장
  let usl = spec?.maxVal ?? null;
  let lsl = spec?.minVal ?? null;
  if (usl !== null && lsl !== null && lsl > usl) {
    [usl, lsl] = [lsl, usl];
  }
  const specHasMultiple = item.specRanges.length > 1;

  // 통계 계산
  const nums = dataPoints.map((p) => p.value);
  const n = nums.length;
  const mean = n > 0 ? nums.reduce((a, b) => a + b, 0) / n : 0;
  const variance = n > 1 ? nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const stdev = Math.sqrt(variance);

  // Cp / Cpk
  // Cp는 양쪽 규격 폭만 사용 → 양쪽 다 있을 때만 계산 가능
  // Cpk는 단방향 규격(one-sided)도 계산 가능: USL만 있으면 Cpu, LSL만 있으면 Cpl
  let cp: number | null = null, cpk: number | null = null;
  if (stdev > 0) {
    if (usl !== null && lsl !== null) {
      // 양방향 규격
      cp = Math.abs(usl - lsl) / (6 * stdev);
      cpk = Math.min((usl - mean) / (3 * stdev), (mean - lsl) / (3 * stdev));
    } else if (usl !== null) {
      // 단방향 (USL만) — Cpu
      cpk = (usl - mean) / (3 * stdev);
    } else if (lsl !== null) {
      // 단방향 (LSL만) — Cpl
      cpk = (mean - lsl) / (3 * stdev);
    }
  }

  // Control limits (process limits, σ ± 3σ)
  const ucl = mean + 3 * stdev;
  const lcl = mean - 3 * stdev;

  // OOR 개수
  const oorCount = dataPoints.filter((p) => p.isOutOfRange).length;
  const oorRate = n > 0 ? (oorCount / n) * 100 : 0;

  // Min / Max
  const minVal = n > 0 ? Math.min(...nums) : 0;
  const maxVal = n > 0 ? Math.max(...nums) : 0;

  // 드롭다운 옵션 (DB에 데이터 있는 년-월)
  const allSubs = await prisma.submission.findMany({
    where: { values: { some: { itemId: iid } } },
    select: { date: true },
  });
  const ymSet = new Set<string>();
  ymSet.add(currentYm);
  allSubs.forEach((s) => {
    const d = new Date(s.date);
    ymSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  const years = Array.from(new Set(Array.from(ymSet).map((m) => m.slice(0, 4)))).sort().reverse();
  const yearMonths: string[] = ["all"];
  for (const y of years) {
    yearMonths.push(y);
    yearMonths.push(...Array.from(ymSet).filter((m) => m.startsWith(`${y}-`)).sort().reverse());
  }

  function ymLabel(y: string) {
    if (y === "all") return "All";
    if (/^\d{4}$/.test(y)) return y;
    const [yy, mm] = y.split("-").map(Number);
    return new Date(yy, mm - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
  }

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "36px 16px 80px", position: "relative", zIndex: 1 }}>
      <div className="fade-up" style={{ marginBottom: "20px" }}>
        <Link href={sp.partNumberId ? `/spc/pn/${sp.partNumberId}` : "/spc"} style={{ fontSize: "13px", color: "var(--accent)", textDecoration: "none" }}>
          ← {sp.partNumberId ? "Back" : "SPC"}
        </Link>
        <h1 style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-0.022em", color: "var(--text-1)", marginTop: "14px" }}>
          <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-3)", marginRight: "8px" }}>#{item.no}</span>
          {item.characteristic}
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "4px" }}>
          {item.section}{item.unit ? ` · ${item.unit}` : ""}
        </p>
      </div>

      {/* 기간 선택 (Period only) */}
      <div className="fade-up" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
        <span className="apple-label">Period</span>
        <PeriodSelector
          current={ym}
          options={yearMonths.map((y) => ({ value: y, label: ymLabel(y) }))}
        />
      </div>

      {/* 통계 카드 */}
      <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px", marginBottom: "20px" }}>
        <Stat label="Samples (n)" value={String(n)} />
        <Stat label="Mean (μ)"    value={n > 0 ? mean.toFixed(3) : "—"} />
        <Stat label="Std Dev (σ)" value={n > 1 ? stdev.toFixed(3) : "—"} />
        <Stat label="Min / Max"   value={n > 0 ? `${minVal.toFixed(2)} / ${maxVal.toFixed(2)}` : "—"} small />
        <Stat label="LSL / USL"   value={lsl !== null || usl !== null ? `${lsl !== null ? lsl.toFixed(2) : "—"} / ${usl !== null ? usl.toFixed(2) : "—"}` : "No Spec"} small />
        <Stat
          label="Cp"
          value={cp !== null ? cp.toFixed(2) : "—"}
          accent={cp === null ? undefined : cp >= 1.33 ? "ok" : cp >= 1.0 ? "warn" : "danger"}
        />
        <Stat
          label="Cpk"
          value={cpk !== null ? cpk.toFixed(2) : "—"}
          accent={cpk === null ? undefined : cpk >= 1.33 ? "ok" : cpk >= 1.0 ? "warn" : "danger"}
        />
        <Stat
          label="OOR %"
          value={n > 0 ? `${oorRate.toFixed(1)}%` : "—"}
          accent={oorRate === 0 ? "ok" : oorRate > 5 ? "danger" : "warn"}
        />
      </div>

      {/* 여러 Spec 안내 */}
      {specHasMultiple && !partNumberIdNum && (
        <div className="fade-up" style={{
          padding: "10px 14px", marginBottom: "16px",
          background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.20)",
          borderRadius: "10px",
          fontSize: "12px", color: "var(--text-2)",
        }}>
          ℹ️ {item.specRanges.length} spec ranges are registered for this item.
          For accurate Cp/Cpk, filter by specific Part Number.
        </div>
      )}

      {/* Cpk 해석 */}
      {cpk !== null && (
        <div className="fade-up" style={{
          padding: "12px 16px", marginBottom: "20px",
          background: cpk >= 1.33 ? "rgba(52,199,89,0.06)" : cpk >= 1.0 ? "rgba(245,158,11,0.06)" : "rgba(255,59,48,0.06)",
          border: `1px solid ${cpk >= 1.33 ? "rgba(52,199,89,0.18)" : cpk >= 1.0 ? "rgba(245,158,11,0.20)" : "rgba(255,59,48,0.20)"}`,
          borderRadius: "10px",
          fontSize: "13px", color: "var(--text-2)",
        }}>
          <strong style={{ color: cpk >= 1.33 ? "#34C759" : cpk >= 1.0 ? "#F59E0B" : "var(--danger)" }}>
            {cpk >= 1.67 ? "Excellent" : cpk >= 1.33 ? "Capable" : cpk >= 1.0 ? "Marginal" : "Not Capable"}
          </strong>
          {" — "}
          {cpk >= 1.33
            ? "Process is stable and well within specification."
            : cpk >= 1.0
            ? "Within specification, but variability reduction is recommended."
            : "Process capability is insufficient. Immediate improvement required."}
        </div>
      )}

      {/* 차트 */}
      <p className="ios-section-label">Control Chart</p>
      <div className="liquid-glass fade-up" style={{ padding: "16px", marginBottom: "20px" }}>
        {n === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", fontSize: "14px", color: "var(--text-3)" }}>
            No data in the selected period.
          </div>
        ) : (
          <SpcChart
            data={dataPoints.map((p) => ({
              idx: p.id,
              value: p.value,
              date: new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
              oor: p.isOutOfRange,
              label: `${p.company}·${p.lineCode} ${p.modelName}${p.partNumberCode ? ` ${p.partNumberCode}` : ""} S${p.shift} P${p.partNo}`,
            }))}
            usl={usl}
            lsl={lsl}
            ucl={n > 1 ? ucl : null}
            lcl={n > 1 ? lcl : null}
            mean={n > 0 ? mean : null}
          />
        )}
      </div>

      {/* Cpk Reference */}
      <div className="fade-up" style={{ fontSize: "11px", color: "var(--text-3)", lineHeight: "1.7", padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "10px" }}>
        <strong style={{ color: "var(--text-2)" }}>Cpk Standard (Automotive IATF 16949):</strong><br />
        ≥ 1.67 Excellent · ≥ 1.33 Capable (Required) · ≥ 1.00 Marginal · &lt; 1.00 Not Capable<br />
        <strong style={{ color: "var(--text-2)" }}>Control Limits:</strong> μ ± 3σ (natural process limits)<br />
        <strong style={{ color: "var(--text-2)" }}>Spec Limits (USL/LSL):</strong> Customer specification (from Spec Range)
      </div>
    </div>
  );
}

function Stat({ label, value, accent, small }: { label: string; value: string; accent?: "ok" | "warn" | "danger"; small?: boolean }) {
  const color = accent === "danger" ? "var(--danger)" : accent === "warn" ? "#F59E0B" : accent === "ok" ? "#34C759" : "var(--text-1)";
  return (
    <div className="liquid-glass" style={{ padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: small ? "14px" : "20px", fontWeight: "700", color, letterSpacing: "-0.01em" }}>{value}</div>
      <div style={{ fontSize: "10px", color: "var(--text-3)", marginTop: "4px", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}
