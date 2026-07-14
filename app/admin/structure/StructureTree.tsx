"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renameCompany, renameLine, renameModel, renamePartNumber,
  addCompany, addLine, addModel, addPartNumber,
  delCompany, delLine, delModel, delPartNumber,
} from "./actions";

type T = { id: number; code: string; name: string };
type PN = { id: number; code: string; label: string; templates: T[] };
type Model = { id: number; name: string; templates: T[]; partNumbers: PN[] };
type Line = { id: number; code: string; models: Model[] };
type Company = { id: number; code: string; name: string; lines: Line[] };

export default function StructureTree({ tree }: { tree: Company[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error?: string } | void>) {
    start(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div style={{ opacity: pending ? 0.6 : 1, transition: "opacity 0.15s" }}>
      {tree.map((c) => (
        <div key={c.id} className="liquid-glass fade-up" style={{ padding: "16px 18px", marginBottom: "12px" }}>
          {/* Company */}
          <Row
            depth={0} color="var(--accent)" tag="Company"
            value={c.name}
            onSave={(v) => run(() => renameCompany(c.id, v))}
            onDelete={() => confirm(`Delete company "${c.name}"?`) && run(() => delCompany(c.id))}
          />

          {c.lines.map((l) => (
            <div key={l.id} style={{ marginLeft: "16px", borderLeft: "1px solid var(--border)", paddingLeft: "14px", marginTop: "8px" }}>
              {/* Line */}
              <Row
                depth={1} tag="Line"
                value={l.code}
                onSave={(v) => run(() => renameLine(l.id, v))}
                onDelete={() => confirm(`Delete line "${l.code}"?`) && run(() => delLine(l.id))}
              />

              {l.models.map((m) => (
                <div key={m.id} style={{ marginLeft: "16px", borderLeft: "1px solid var(--border)", paddingLeft: "14px", marginTop: "8px" }}>
                  {/* Model */}
                  <Row
                    depth={2} tag="Model"
                    value={m.name}
                    onSave={(v) => run(() => renameModel(m.id, v))}
                    onDelete={() => confirm(`Delete model "${m.name}"?`) && run(() => delModel(m.id))}
                  />

                      {/* Part Numbers */}
                  {m.partNumbers.map((pn) => (
                    <div key={pn.id} style={{ marginLeft: "16px", borderLeft: "1px solid var(--border)", paddingLeft: "14px", marginTop: "6px" }}>
                      <Row
                        depth={3} tag="Part #"
                        value={pn.code}
                        sub={pn.label}
                        onSave={(v) => run(() => renamePartNumber(pn.id, v, pn.label))}
                        onDelete={() => confirm(`Delete part number "${pn.code}"?`) && run(() => delPartNumber(pn.id))}
                      />
                    </div>
                  ))}
                  <AddForm fields={[{ key: "code", ph: "Part # (e.g. PN-B-001)" }]} label="+ Part Number"
                    onAdd={(v) => run(() => addPartNumber(m.id, v.code, ""))} />
                </div>
              ))}
              <AddForm fields={[{ key: "name", ph: "Model name" }]} label="+ Model"
                onAdd={(v) => run(() => addModel(l.id, v.name))} />
            </div>
          ))}
          <AddForm fields={[{ key: "code", ph: "Line code (e.g. 2)" }]} label="+ Line"
            onAdd={(v) => run(() => addLine(c.id, v.code))} />
        </div>
      ))}

      {/* Add company */}
      <div className="liquid-glass fade-up" style={{ padding: "16px 18px" }}>
        <AddForm fields={[{ key: "code", ph: "Code (e.g. VW)" }, { key: "name", ph: "Company name" }]} label="+ Company"
          onAdd={(v) => run(() => addCompany(v.code, v.name))} />
      </div>
    </div>
  );
}

// ── 행: 이름 클릭 → 인라인 편집 ──────────────────────────────
function Row({ depth, tag, value, sub, color, onSave, onDelete }: {
  depth: number; tag: string; value: string; sub?: string; color?: string;
  onSave: (v: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);

  const fontSize = depth === 0 ? "16px" : depth === 1 ? "15px" : "14px";
  const fontWeight = depth <= 1 ? "700" : "600";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0" }}>
      <span style={{
        fontSize: "9px", fontWeight: "700", letterSpacing: "0.06em", textTransform: "uppercase",
        color: color ?? "var(--text-3)", minWidth: "52px",
      }}>{tag}</span>

      {editing ? (
        <input
          autoFocus value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { setEditing(false); if (val.trim() && val !== value) onSave(val); else setVal(value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") { setVal(value); setEditing(false); }
          }}
          className="apple-input"
          style={{ fontSize, fontWeight, padding: "4px 8px", maxWidth: "260px" }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          title="Click to rename"
          style={{
            fontSize, fontWeight, color: "var(--text-1)", letterSpacing: "-0.01em",
            background: "none", border: "none", cursor: "pointer", padding: "2px 4px",
            borderRadius: "6px", fontFamily: "inherit", textAlign: "left",
          }}
        >
          {value}
          {sub && <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: "400", marginLeft: "6px" }}>{sub}</span>}
        </button>
      )}

      <button
        onClick={onDelete}
        style={{
          marginLeft: "auto", fontSize: "11px", fontWeight: "500", padding: "3px 8px",
          background: "rgba(255,59,48,0.08)", color: "var(--danger)",
          border: "1px solid rgba(255,59,48,0.18)", borderRadius: "6px",
          cursor: "pointer", fontFamily: "inherit",
        }}
      >
        Delete
      </button>
    </div>
  );
}

// ── 추가 폼 (토글) ──────────────────────────────────────────
function AddForm({ fields, label, onAdd }: {
  fields: { key: string; ph: string }[]; label: string; onAdd: (v: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        marginTop: "6px", fontSize: "12px", fontWeight: "500",
        padding: "4px 10px", background: "none", color: "var(--accent)",
        border: "1px dashed rgba(0,136,255,0.3)", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit",
      }}>{label}</button>
    );
  }

  return (
    <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap", alignItems: "center" }}>
      {fields.map((f) => (
        <input key={f.key} autoFocus={f.key === fields[0].key} placeholder={f.ph}
          value={vals[f.key] ?? ""}
          onChange={(e) => setVals((p) => ({ ...p, [f.key]: e.target.value }))}
          className="apple-input" style={{ fontSize: "13px", padding: "5px 9px", maxWidth: "200px" }}
        />
      ))}
      <button onClick={() => { onAdd(vals); setVals({}); setOpen(false); }} style={{
        fontSize: "12px", fontWeight: "600", padding: "5px 12px", color: "#fff",
        background: "var(--accent)", border: "none", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit",
      }}>Add</button>
      <button onClick={() => { setVals({}); setOpen(false); }} style={{
        fontSize: "12px", padding: "5px 10px", color: "var(--text-3)",
        background: "none", border: "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", fontFamily: "inherit",
      }}>Cancel</button>
    </div>
  );
}
