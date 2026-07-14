"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addGreaseLog, deleteGreaseLog } from "@/app/actions";

type PN = { id: number; code: string };
type M = { id: number; name: string; partNumbers: PN[] };
type L = { id: number; code: string; models: M[] };
type C = { id: number; code: string; name: string; lines: L[] };
type Log = {
  id: number; lineId: number; modelId: number | null; partNumberId: number | null;
  companyName: string | null; lineName: string | null; modelName: string | null; partNumberCode: string | null;
  side: string; batchCode: string; operator: string | null; changedAt: string;
};

const selStyle: React.CSSProperties = { fontSize: "14px" };

export default function GreaseChangeForm({ tree, todayLogs, workerNames }: { tree: C[]; todayLogs: Log[]; workerNames: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [companyId, setCompanyId] = useState<number | "">("");
  const [lineId, setLineId]       = useState<number | "">("");
  const [modelId, setModelId]     = useState<number | "">("");
  const [pnId, setPnId]           = useState<number | "">("");
  const [side, setSide]           = useState<"outboard" | "inboard">("outboard");
  const [batch, setBatch]         = useState("");
  const [operator, setOperator]   = useState("");
  const [error, setError]         = useState("");

  const company = useMemo(() => tree.find((c) => c.id === companyId), [tree, companyId]);
  const line    = useMemo(() => company?.lines.find((l) => l.id === lineId), [company, lineId]);
  const model   = useMemo(() => line?.models.find((m) => m.id === modelId), [line, modelId]);

  // 선택된 PN의 오늘 기록
  const pnLogs = useMemo(
    () => todayLogs.filter((g) => pnId !== "" && g.partNumberId === pnId).sort((a, b) => a.changedAt.localeCompare(b.changedAt)),
    [todayLogs, pnId],
  );
  const outLogs = pnLogs.filter((g) => g.side === "outboard");
  const inLogs  = pnLogs.filter((g) => g.side === "inboard");

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function save() {
    setError("");
    if (!lineId || !pnId || !batch.trim() || !operator) {
      setError("Select line / part number / operator and enter a batch code.");
      return;
    }
    const fd = new FormData();
    fd.set("lineId", String(lineId));
    if (modelId) fd.set("modelId", String(modelId));
    if (pnId)    fd.set("partNumberId", String(pnId));
    fd.set("side", side);
    fd.set("batchCode", batch.trim());
    fd.set("operator", operator);
    start(async () => {
      const res = await addGreaseLog(fd);
      if (res?.error) { setError(res.error); return; }
      setBatch("");
      router.refresh();
    });
  }

  function remove(id: number) {
    if (!confirm("Delete this grease change record?")) return;
    start(async () => {
      await deleteGreaseLog(id);
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* 선택 + 입력 */}
      <div className="liquid-glass fade-up" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Customer</label>
            <select className="apple-input" style={selStyle} value={companyId}
              onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ""; setCompanyId(v); setLineId(""); setModelId(""); setPnId(""); }}>
              <option value="">Select…</option>
              {tree.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Line</label>
            <select className="apple-input" style={selStyle} value={lineId} disabled={!company}
              onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ""; setLineId(v); setModelId(""); setPnId(""); }}>
              <option value="">Select…</option>
              {company?.lines.map((l) => <option key={l.id} value={l.id}>Line {l.code}</option>)}
            </select>
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Model</label>
            <select className="apple-input" style={selStyle} value={modelId} disabled={!line}
              onChange={(e) => { const v = e.target.value ? Number(e.target.value) : ""; setModelId(v); setPnId(""); }}>
              <option value="">Select…</option>
              {line?.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Part Number</label>
            <select className="apple-input" style={selStyle} value={pnId} disabled={!model}
              onChange={(e) => setPnId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select…</option>
              {model?.partNumbers.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
          </div>
        </div>

        {/* Side 토글 */}
        <div>
          <label className="apple-label" style={{ display: "block", marginBottom: "6px" }}>Side</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["outboard", "inboard"] as const).map((s) => (
              <button key={s} type="button" onClick={() => setSide(s)}
                style={{
                  flex: 1, padding: "10px", fontSize: "14px", fontWeight: "600", fontFamily: "inherit",
                  borderRadius: "10px", cursor: "pointer", textTransform: "capitalize",
                  border: side === s ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  background: side === s ? "rgba(217,119,87,0.10)" : "var(--card)",
                  color: side === s ? "var(--accent)" : "var(--text-2)",
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Batch code + Operator */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>New Batch / Container Code</label>
            <input className="apple-input" style={{ fontSize: "14px" }} value={batch}
              onChange={(e) => setBatch(e.target.value)} placeholder="e.g. LOT-240612-A" />
          </div>
          <div>
            <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Operator</label>
            <select className="apple-input" style={{ ...selStyle, cursor: "pointer" }} value={operator}
              onChange={(e) => setOperator(e.target.value)}>
              <option value="">— Select —</option>
              {workerNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {error && <p style={{ fontSize: "13px", color: "var(--danger)" }}>{error}</p>}

        <button type="button" className="btn-primary" disabled={pending} onClick={save} style={{ opacity: pending ? 0.6 : 1 }}>
          {pending ? "Saving…" : "Add Grease Change"}
        </button>
      </div>

      {/* 오늘 타임라인 */}
      {pnId !== "" && (
        <div className="fade-up">
          <p className="ios-section-label">Today&apos;s Log — {model?.partNumbers.find((p) => p.id === pnId)?.code}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {([["Outboard", outLogs], ["Inboard", inLogs]] as const).map(([title, list]) => (
              <div key={title} className="liquid-glass" style={{ padding: "14px 16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-2)", marginBottom: "10px" }}>{title}</div>
                {list.length === 0 ? (
                  <p style={{ fontSize: "12px", color: "var(--text-3)", fontStyle: "italic" }}>No records</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {list.map((g, i) => (
                      <div key={g.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ minWidth: 0 }}>
                          <div>
                            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--accent)", fontFamily: "monospace" }}>{fmtTime(g.changedAt)}</span>
                            <span style={{ fontSize: "13px", color: "var(--text-1)", marginLeft: "8px" }}>{g.batchCode}</span>
                            {i === 0 && <span style={{ fontSize: "10px", color: "var(--text-3)", marginLeft: "6px" }}>(start)</span>}
                          </div>
                          {g.operator && <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "1px" }}>by {g.operator}</div>}
                        </div>
                        <button type="button" onClick={() => remove(g.id)} title="Delete"
                          style={{ flexShrink: 0, padding: "3px 7px", fontSize: "11px", background: "rgba(255,59,48,0.08)", color: "var(--danger)", border: "1px solid rgba(255,59,48,0.18)", borderRadius: "6px", cursor: "pointer", fontFamily: "inherit" }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
