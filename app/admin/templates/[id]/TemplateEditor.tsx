"use client";

import { useState, useTransition } from "react";
import { createCheckItem, updateCheckItem, deleteCheckItem, moveCheckItem, upsertSpecRangeGroup, deleteSpecRangeGroup, updateTemplate } from "@/app/admin/actions";

type SpecRange = {
  id: number;
  label: string | null;
  minVal: number | null;
  maxVal: number | null;
  lineId: number | null;
  modelId: number | null;
  partNumberId: number | null;
};

type Item = {
  id: number;
  section: string;
  no: number;
  opNo: string | null;
  characteristic: string;
  method: string | null;
  inputType: string;
  unit: string | null;
  nullable: boolean;
  department: string | null;
  specRanges: SpecRange[];
};

type TemplateInfo = {
  code: string;
  name: string;
  version: string;
  sampleCount: number;
  sampleLabels: string;
  note: string;
};

type PartNumberOption = { id: number; label: string; groupKey: string };

type Props = {
  templateId: number;
  template: TemplateInfo;
  items: Item[];
  partNumbers: PartNumberOption[];
};

const EMPTY_ITEM = { section: "", no: 1, opNo: "", characteristic: "", method: "", inputType: "number", unit: "", nullable: false, department: "" };

// 부서 체크박스 (라디오처럼: 하나 켜면 다른 거 꺼짐, 둘 다 끄면 공통)
function DeptChecks({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={value === "QC"} onChange={() => onChange(value === "QC" ? "" : "QC")} />
        <span style={{ color: "#5a7a52", fontWeight: 600 }}>Quality</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
        <input type="checkbox" checked={value === "PROD"} onChange={() => onChange(value === "PROD" ? "" : "PROD")} />
        <span style={{ color: "#4a6a8e", fontWeight: 600 }}>Production</span>
      </label>
    </div>
  );
}
const EMPTY_SPEC = { label: "", minVal: "", maxVal: "", partNumberId: "" };

const INPUT_TYPES = ["number", "ok_ng", "text"];

const S = {
  th: { padding: "9px 12px", fontSize: "11px", fontWeight: "600", color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase" as const, textAlign: "left" as const, background: "var(--panel)", borderBottom: "1px solid var(--border)" },
  td: { padding: "10px 12px", fontSize: "13px", color: "var(--text-1)", borderBottom: "1px solid var(--border)", verticalAlign: "top" as const },
  input: { padding: "7px 10px", fontSize: "13px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px", color: "var(--text-1)", width: "100%", outline: "none" as const },
  btnSm: { padding: "5px 10px", fontSize: "11px", fontWeight: "600", borderRadius: "6px", border: "none", cursor: "pointer" as const },
};

export default function TemplateEditor({ templateId, template, items, partNumbers }: Props) {
  const [, startTransition] = useTransition();

  // Template info editing
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [tplData, setTplData] = useState<TemplateInfo>(template);

  function saveTpl() {
    startTransition(async () => {
      await updateTemplate(templateId, tplData);
      setEditingTemplate(false);
    });
  }

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState(EMPTY_ITEM);
  const [addingSpec, setAddingSpec] = useState<number | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null); // `${itemId}:${groupKey}`
  const [specData, setSpecData] = useState(EMPTY_SPEC);
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const [expandedSpec, setExpandedSpec] = useState<number | null>(null);

  const sections = [...new Set(items.map(i => i.section))];

  function startEdit(item: Item) {
    setEditingId(item.id);
    setEditData({ section: item.section, no: item.no, opNo: item.opNo ?? "", characteristic: item.characteristic, method: item.method ?? "", inputType: item.inputType, unit: item.unit ?? "", nullable: item.nullable, department: item.department ?? "" });
  }

  function saveEdit(itemId: number) {
    startTransition(async () => {
      await updateCheckItem(itemId, templateId, editData);
      setEditingId(null);
    });
  }

  function doDelete(itemId: number) {
    if (!confirm("Delete this item and all its spec ranges?")) return;
    startTransition(async () => { await deleteCheckItem(itemId, templateId); });
  }

  function doMove(itemId: number, direction: "up" | "down") {
    startTransition(async () => { await moveCheckItem(itemId, templateId, direction); });
  }

  function doAddItem() {
    startTransition(async () => {
      await createCheckItem(templateId, newItem);
      setNewItem(EMPTY_ITEM);
      setShowAddItem(false);
    });
  }

  // 파트넘버 id → 논리 그룹키 / 라벨 매핑
  const pnGroupKeyById = new Map(partNumbers.map(p => [p.id, p.groupKey]));
  const pnLabelByGroup = new Map(partNumbers.map(p => [p.groupKey, p.label]));
  // 드롭다운용: 코드(그룹)별 1개로 중복 제거
  const pnOptions = (() => {
    const seen = new Set<string>();
    const out: PartNumberOption[] = [];
    for (const p of partNumbers) { if (!seen.has(p.groupKey)) { seen.add(p.groupKey); out.push(p); } }
    return out;
  })();
  // 그룹키 → 드롭다운 대표 옵션 id (편집 시 select 값 일치용)
  const pnOptionIdByGroup = new Map(pnOptions.map(p => [p.groupKey, p.id]));

  // 한 항목의 스펙들을 논리 단위(전체 / 파트넘버 코드)로 묶어 중복 표시 제거
  function groupedSpecs(item: Item) {
    const map = new Map<string, { key: string; label: string; partNumberId: number | null; rep: SpecRange }>();
    for (const s of item.specRanges) {
      const key = s.partNumberId != null ? (pnGroupKeyById.get(s.partNumberId) ?? `pn:${s.partNumberId}`) : "__global__";
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: s.partNumberId != null ? (pnLabelByGroup.get(key) ?? `PN#${s.partNumberId}`) : "Global (all)",
          partNumberId: s.partNumberId,
          rep: s,
        });
      }
    }
    return [...map.values()];
  }

  function saveSpec(itemId: number) {
    startTransition(async () => {
      const r = await upsertSpecRangeGroup(itemId, templateId, {
        partNumberId: specData.partNumberId !== "" ? Number(specData.partNumberId) : null,
        minVal: specData.minVal,
        maxVal: specData.maxVal,
        label: specData.label,
      });
      if (r && "error" in r && r.error) { alert(r.error); return; }
      setAddingSpec(null);
      setEditingGroup(null);
      setSpecData(EMPTY_SPEC);
    });
  }

  function startEditGroup(itemId: number, g: { key: string; partNumberId: number | null; rep: SpecRange }) {
    setEditingGroup(`${itemId}:${g.key}`);
    setAddingSpec(null);
    // 드롭다운 옵션과 일치하는 대표 id 사용 (없으면 rep의 id)
    const optionId = g.partNumberId !== null ? (pnOptionIdByGroup.get(g.key) ?? g.partNumberId) : null;
    setSpecData({
      label: g.rep.label ?? "",
      minVal: g.rep.minVal !== null ? String(g.rep.minVal) : "",
      maxVal: g.rep.maxVal !== null ? String(g.rep.maxVal) : "",
      partNumberId: optionId !== null ? String(optionId) : "",
    });
  }

  function doDeleteGroup(itemId: number, partNumberId: number | null) {
    startTransition(async () => { await deleteSpecRangeGroup(itemId, templateId, partNumberId); });
  }

  return (
    <div>
      {/* Template Info */}
      <div className="glass" style={{ padding: "18px 20px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editingTemplate ? "14px" : "0" }}>
          {editingTemplate ? (
            <p className="label-caps" style={{ fontSize: "10px" }}>Edit Template Info</p>
          ) : (
            <div style={{ display: "flex", gap: "20px", alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-1)" }}>{tplData.name}</span>
              <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{tplData.code}</span>
              <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{tplData.version}</span>
              <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Samples: {tplData.sampleCount} ({tplData.sampleLabels})</span>
            </div>
          )}
          {!editingTemplate && (
            <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)", border: "1px solid var(--border)", marginLeft: "12px", whiteSpace: "nowrap" }}
              onClick={() => setEditingTemplate(true)}>
              Edit Info
            </button>
          )}
        </div>

        {editingTemplate && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 110px" }}>
                <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Code</label>
                <input style={S.input} value={tplData.code} onChange={e => setTplData(p => ({ ...p, code: e.target.value }))} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "2 1 200px" }}>
                <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Name</label>
                <input style={S.input} value={tplData.name} onChange={e => setTplData(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 90px" }}>
                <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Version</label>
                <input style={S.input} value={tplData.version} onChange={e => setTplData(p => ({ ...p, version: e.target.value }))} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 60px" }}>
                <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Samples</label>
                <input type="number" min={1} max={10} style={S.input} value={tplData.sampleCount} onChange={e => setTplData(p => ({ ...p, sampleCount: +e.target.value }))} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 160px" }}>
                <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Sample Labels</label>
                <input style={S.input} placeholder="P#1,P#2" value={tplData.sampleLabels} onChange={e => setTplData(p => ({ ...p, sampleLabels: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "12px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Note (shown on the check sheet header)</label>
              <textarea
                style={{ ...S.input, minHeight: "64px", resize: "vertical", fontFamily: "inherit", lineHeight: "1.5" }}
                placeholder="e.g. Caution: tighten clamp before measuring."
                value={tplData.note}
                onChange={e => setTplData(p => ({ ...p, note: e.target.value }))}
              />
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={{ ...S.btnSm, background: "#111", color: "#fff" }} onClick={saveTpl}>Save</button>
              <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)" }} onClick={() => { setTplData(template); setEditingTemplate(false); }}>Cancel</button>
            </div>
          </>
        )}
      </div>

      {/* Items table */}
      <div className="glass" style={{ overflow: "hidden", marginBottom: "12px" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: "980px", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["No.", "Section", "Op#", "Characteristic", "Method", "Type", "Unit", "Nullable", "Dept", "Spec Ranges", ""].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <>
                  <tr key={item.id} style={{ background: editingId === item.id ? "rgba(0,113,227,0.04)" : "transparent" }}>
                    {editingId === item.id ? (
                      <>
                        <td style={S.td}><input style={{ ...S.input, width: "48px" }} type="number" value={editData.no} onChange={e => setEditData(p => ({ ...p, no: +e.target.value }))} /></td>
                        <td style={S.td}>
                          <input style={S.input} list="sections-list" value={editData.section} onChange={e => setEditData(p => ({ ...p, section: e.target.value }))} />
                          <datalist id="sections-list">{sections.map(s => <option key={s} value={s} />)}</datalist>
                        </td>
                        <td style={S.td}><input style={{ ...S.input, width: "60px" }} value={editData.opNo} onChange={e => setEditData(p => ({ ...p, opNo: e.target.value }))} /></td>
                        <td style={S.td}><input style={S.input} value={editData.characteristic} onChange={e => setEditData(p => ({ ...p, characteristic: e.target.value }))} /></td>
                        <td style={S.td}><input style={S.input} value={editData.method} onChange={e => setEditData(p => ({ ...p, method: e.target.value }))} /></td>
                        <td style={S.td}>
                          <select style={S.input} value={editData.inputType} onChange={e => setEditData(p => ({ ...p, inputType: e.target.value }))}>
                            {INPUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td style={S.td}><input style={{ ...S.input, width: "52px" }} value={editData.unit} onChange={e => setEditData(p => ({ ...p, unit: e.target.value }))} /></td>
                        <td style={S.td}><input type="checkbox" checked={editData.nullable} onChange={e => setEditData(p => ({ ...p, nullable: e.target.checked }))} /></td>
                        <td style={S.td}>
                          <DeptChecks value={editData.department} onChange={(v) => setEditData(p => ({ ...p, department: v }))} />
                        </td>
                        <td style={S.td} />
                        <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                          <button style={{ ...S.btnSm, background: "#111", color: "#fff", marginRight: "4px" }} onClick={() => saveEdit(item.id)}>Save</button>
                          <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)" }} onClick={() => setEditingId(null)}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ ...S.td, color: "var(--text-3)", width: "36px" }}>{item.no}</td>
                        <td style={{ ...S.td, fontSize: "11px", color: "var(--text-3)", fontWeight: "600", letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.section}</td>
                        <td style={{ ...S.td, fontSize: "11px", color: "var(--accent)" }}>{item.opNo ?? "—"}</td>
                        <td style={{ ...S.td, fontWeight: "500" }}>{item.characteristic}{item.unit && <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "4px" }}>({item.unit})</span>}</td>
                        <td style={{ ...S.td, fontSize: "12px", color: "var(--text-2)" }}>{item.method ?? "—"}</td>
                        <td style={{ ...S.td, fontSize: "12px" }}>{item.inputType}</td>
                        <td style={{ ...S.td, fontSize: "12px", color: "var(--text-3)" }}>{item.unit ?? "—"}</td>
                        <td style={{ ...S.td, textAlign: "center" }}>{item.nullable ? "✓" : ""}</td>
                        <td style={S.td}>
                          {item.department === "QC" ? (
                            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", background: "rgba(125,155,118,0.15)", color: "#5a7a52" }}>Quality</span>
                          ) : item.department === "PROD" ? (
                            <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", background: "rgba(107,140,174,0.15)", color: "#4a6a8e" }}>Production</span>
                          ) : (
                            <span style={{ fontSize: "10px", color: "var(--text-3)" }}>—</span>
                          )}
                        </td>
                        <td style={S.td}>
                          <button
                            style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)", border: "1px solid var(--border)" }}
                            onClick={() => setExpandedSpec(expandedSpec === item.id ? null : item.id)}
                          >
                            {item.specRanges.length} spec{item.specRanges.length !== 1 ? "s" : ""} {expandedSpec === item.id ? "▲" : "▼"}
                          </button>
                        </td>
                        <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                          {(() => {
                            const secItems = items.filter((i) => i.section === item.section);
                            const pos = secItems.findIndex((i) => i.id === item.id);
                            const isFirst = pos === 0;
                            const isLast = pos === secItems.length - 1;
                            const arrow = (disabled: boolean): React.CSSProperties => ({
                              ...S.btnSm, background: "var(--panel)", color: disabled ? "var(--text-3)" : "var(--text-2)",
                              border: "1px solid var(--border)", marginRight: "4px",
                              opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer",
                            });
                            return (
                              <>
                                <button style={arrow(isFirst)} disabled={isFirst} title="Move up" onClick={() => doMove(item.id, "up")}>↑</button>
                                <button style={arrow(isLast)} disabled={isLast} title="Move down" onClick={() => doMove(item.id, "down")}>↓</button>
                              </>
                            );
                          })()}
                          <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)", marginRight: "4px" }} onClick={() => startEdit(item)}>Edit</button>
                          <button style={{ ...S.btnSm, background: "rgba(186,26,26,0.08)", color: "var(--danger)" }} onClick={() => doDelete(item.id)}>Del</button>
                        </td>
                      </>
                    )}
                  </tr>

                  {/* Spec rows */}
                  {expandedSpec === item.id && (
                    <tr key={`spec-${item.id}`}>
                      <td colSpan={10} style={{ padding: "0 12px 12px 36px", background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "10px" }}>
                          {groupedSpecs(item).map(g => (
                            editingGroup === `${item.id}:${g.key}` ? (
                              <div key={g.key} style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                                <input placeholder={item.inputType === "number" ? "Label (e.g. Max 2.5mm)" : "Label / note (optional)"} style={{ ...S.input, width: "180px" }} value={specData.label} onChange={e => setSpecData(p => ({ ...p, label: e.target.value }))} />
                                {item.inputType === "number" && <>
                                  <input placeholder="Min" type="number" style={{ ...S.input, width: "72px" }} value={specData.minVal} onChange={e => setSpecData(p => ({ ...p, minVal: e.target.value }))} />
                                  <input placeholder="Max" type="number" style={{ ...S.input, width: "72px" }} value={specData.maxVal} onChange={e => setSpecData(p => ({ ...p, maxVal: e.target.value }))} />
                                </>}
                                <select style={{ ...S.input, width: "240px" }} value={specData.partNumberId} onChange={e => setSpecData(p => ({ ...p, partNumberId: e.target.value }))}>
                                  <option value="">All (global)</option>
                                  {pnOptions.map(p => <option key={p.groupKey} value={p.id}>{p.label}</option>)}
                                </select>
                                <button style={{ ...S.btnSm, background: "#111", color: "#fff" }} onClick={() => saveSpec(item.id)}>Save</button>
                                <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)" }} onClick={() => { setEditingGroup(null); setSpecData(EMPTY_SPEC); }}>Cancel</button>
                              </div>
                            ) : (
                              <div key={g.key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                                <span style={{ padding: "3px 8px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "6px", color: "var(--text-3)", fontSize: "11px" }}>
                                  {g.label}
                                </span>
                                <span style={{ color: "var(--text-1)" }}>{g.rep.label ?? "—"}</span>
                                {(g.rep.minVal !== null || g.rep.maxVal !== null) && (
                                  <span style={{ color: "var(--text-3)" }}>
                                    [{g.rep.minVal ?? "—"} ~ {g.rep.maxVal ?? "—"}]
                                  </span>
                                )}
                                <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)", border: "1px solid var(--border)", marginLeft: "auto" }} onClick={() => startEditGroup(item.id, g)}>Edit</button>
                                <button style={{ ...S.btnSm, background: "rgba(186,26,26,0.08)", color: "var(--danger)" }} onClick={() => doDeleteGroup(item.id, g.partNumberId)}>Del</button>
                              </div>
                            )
                          ))}

                          {/* Add spec form */}
                          {addingSpec === item.id ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "4px" }}>
                              <input placeholder={item.inputType === "number" ? "Label (e.g. Max 2.5mm)" : "Label / note (optional)"} style={{ ...S.input, width: "180px" }} value={specData.label} onChange={e => setSpecData(p => ({ ...p, label: e.target.value }))} />
                              {item.inputType === "number" && <>
                                <input placeholder="Min" type="number" style={{ ...S.input, width: "72px" }} value={specData.minVal} onChange={e => setSpecData(p => ({ ...p, minVal: e.target.value }))} />
                                <input placeholder="Max" type="number" style={{ ...S.input, width: "72px" }} value={specData.maxVal} onChange={e => setSpecData(p => ({ ...p, maxVal: e.target.value }))} />
                              </>}
                              <select style={{ ...S.input, width: "240px" }} value={specData.partNumberId} onChange={e => setSpecData(p => ({ ...p, partNumberId: e.target.value }))}>
                                <option value="">All (global)</option>
                                {pnOptions.map(p => <option key={p.groupKey} value={p.id}>{p.label}</option>)}
                              </select>
                              <button style={{ ...S.btnSm, background: "#111", color: "#fff" }} onClick={() => saveSpec(item.id)}>Add</button>
                              <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)" }} onClick={() => { setAddingSpec(null); setSpecData(EMPTY_SPEC); }}>Cancel</button>
                              <span style={{ fontSize: "11px", color: "var(--text-3)", whiteSpace: "nowrap" }}>Selecting a part number applies to all its lines automatically</span>
                            </div>
                          ) : editingGroup === null && (
                            <button style={{ ...S.btnSm, background: "var(--panel)", color: "var(--text-2)", border: "1px solid var(--border)", alignSelf: "flex-start", marginTop: "4px" }}
                              onClick={() => { setAddingSpec(item.id); setEditingGroup(null); setSpecData(EMPTY_SPEC); }}>
                              + Add Spec Range
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item */}
      {showAddItem ? (
        <div className="glass" style={{ padding: "20px", marginBottom: "12px" }}>
          <p className="label-caps" style={{ marginBottom: "14px", fontSize: "10px" }}>New Item</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 60px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>No.</label>
              <input type="number" style={S.input} value={newItem.no} onChange={e => setNewItem(p => ({ ...p, no: +e.target.value }))} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 120px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Section</label>
              <input style={S.input} list="sections-list2" value={newItem.section} onChange={e => setNewItem(p => ({ ...p, section: e.target.value }))} />
              <datalist id="sections-list2">{sections.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 72px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Op#</label>
              <input style={S.input} value={newItem.opNo} onChange={e => setNewItem(p => ({ ...p, opNo: e.target.value }))} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "2 1 200px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Characteristic *</label>
              <input style={S.input} value={newItem.characteristic} onChange={e => setNewItem(p => ({ ...p, characteristic: e.target.value }))} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "1 1 140px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Method</label>
              <input style={S.input} value={newItem.method} onChange={e => setNewItem(p => ({ ...p, method: e.target.value }))} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 90px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Input Type</label>
              <select style={S.input} value={newItem.inputType} onChange={e => setNewItem(p => ({ ...p, inputType: e.target.value }))}>
                {INPUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 60px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Unit</label>
              <input style={S.input} value={newItem.unit} onChange={e => setNewItem(p => ({ ...p, unit: e.target.value }))} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "center", justifyContent: "flex-end" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Nullable</label>
              <input type="checkbox" checked={newItem.nullable} onChange={e => setNewItem(p => ({ ...p, nullable: e.target.checked }))} style={{ width: "16px", height: "16px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: "0 0 110px" }}>
              <label style={{ fontSize: "10px", color: "var(--text-3)", fontWeight: "600" }}>Dept</label>
              <DeptChecks value={newItem.department} onChange={(v) => setNewItem(p => ({ ...p, department: v }))} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-primary" style={{ fontSize: "13px", padding: "10px 20px" }} onClick={doAddItem}
              disabled={!newItem.characteristic || !newItem.section}>
              Add Item
            </button>
            <button className="btn-secondary" style={{ fontSize: "13px", padding: "10px 20px" }} onClick={() => { setShowAddItem(false); setNewItem(EMPTY_ITEM); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary" style={{ fontSize: "13px", padding: "10px 20px" }} onClick={() => setShowAddItem(true)}>
          + Add Item
        </button>
      )}
    </div>
  );
}
