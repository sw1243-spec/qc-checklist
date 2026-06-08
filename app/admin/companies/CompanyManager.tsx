"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { createCompany, createLine, createModel, deleteModel, deleteLine, deleteCompany } from "@/app/actions";

type Model  = { id: number; name: string };
type Line   = { id: number; code: string; models: Model[] };
type Company = { id: number; code: string; name: string; lines: Line[] };

const inputStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: "14px", fontFamily: "inherit",
  color: "var(--text-1)", background: "var(--panel)",
  border: "1px solid var(--border)", borderRadius: "8px",
  outline: "none", letterSpacing: "-0.2px", flex: 1,
  WebkitAppearance: "none",
};
const addBtnStyle: React.CSSProperties = {
  padding: "9px 16px", fontSize: "13px", fontWeight: "600",
  fontFamily: "inherit", color: "#fff",
  background: "var(--accent)", border: "none",
  borderRadius: "8px", cursor: "pointer",
  whiteSpace: "nowrap",
};
const cancelBtnStyle: React.CSSProperties = {
  padding: "9px 12px", fontSize: "13px", fontWeight: "500",
  fontFamily: "inherit", color: "var(--text-2)",
  background: "transparent", border: "1px solid var(--border)",
  borderRadius: "8px", cursor: "pointer",
};

/* 삭제 버튼 */
function DeleteBtn({ action, name }: { action: (fd: FormData) => Promise<unknown>; name: string }) {
  return (
    <form action={async (fd) => {
      if (!confirm(`Delete "${name}"?`)) return;
      const result = await action(fd) as { error?: string } | undefined;
      if (result?.error) alert(result.error);
    }} style={{ display: "inline" }}>
      <button type="submit" style={{
        padding: "4px 8px", fontSize: "11px", fontWeight: "500",
        fontFamily: "inherit", color: "var(--danger)",
        background: "rgba(255,59,48,0.07)", border: "1px solid rgba(255,59,48,0.18)",
        borderRadius: "6px", cursor: "pointer",
      }}>Delete</button>
    </form>
  );
}

/* 인라인 Add 폼 */
function InlineForm({ fields, action, onDone }: {
  fields: { name: string; placeholder: string; width?: string }[];
  action: (fd: FormData) => Promise<void>;
  placeholder?: string;
  onDone: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      action={async (fd) => { await action(fd); formRef.current?.reset(); onDone(); }}
      style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginTop: "8px" }}
    >
      {fields.map((f) => (
        <input
          key={f.name} name={f.name} required
          placeholder={f.placeholder}
          style={{ ...inputStyle, width: f.width ?? "auto", flex: f.width ? "none" : 1 }}
        />
      ))}
      <button type="submit" style={addBtnStyle}>Add</button>
      <button type="button" style={cancelBtnStyle} onClick={onDone}>Cancel</button>
    </form>
  );
}

export default function CompanyManager({ companies }: { companies: Company[] }) {
  const [showAddCompany, setShowAddCompany] = useState(false);
  const [openLineForm, setOpenLineForm] = useState<number | null>(null);   // companyId
  const [openModelForm, setOpenModelForm] = useState<number | null>(null); // lineId

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>

      {/* ── Company 목록 ── */}
      {companies.map((company, ci) => (
        <div key={company.id} className="liquid-glass fade-up" style={{ padding: "20px 24px", animationDelay: `${0.04 + ci * 0.04}s` }}>

          {/* Company 헤더 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-1)" }}>{company.name}</span>
              <span style={{
                fontSize: "11px", fontWeight: "600",
                padding: "2px 8px", background: "var(--panel)",
                border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-3)",
              }}>{company.code}</span>
              <DeleteBtn
                name={company.name}
                action={(fd) => { fd.append("companyId", String(company.id)); return deleteCompany(fd); }}
              />
            </div>
            <button
              onClick={() => setOpenLineForm(openLineForm === company.id ? null : company.id)}
              style={{ ...addBtnStyle, fontSize: "12px", padding: "6px 12px" }}
            >
              + Add Line
            </button>
          </div>

          {/* Add Line 폼 */}
          {openLineForm === company.id && (
            <InlineForm
              fields={[{ name: "code", placeholder: "Line code (e.g. A)" }]}
              action={(fd) => { fd.append("companyId", String(company.id)); return createLine(fd); }}
              onDone={() => setOpenLineForm(null)}
            />
          )}

          {/* Lines */}
          {company.lines.length === 0 ? (
            <p style={{ fontSize: "13px", color: "var(--text-3)", fontStyle: "italic" }}>No lines yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {company.lines.map((line) => (
                <div key={line.id} style={{
                  background: "var(--panel)", borderRadius: "10px",
                  border: "1px solid var(--border)", padding: "12px 14px",
                }}>
                  {/* Line 헤더 */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-1)" }}>
                        Line {line.code}
                      </span>
                      <DeleteBtn
                        name={`Line ${line.code}`}
                        action={(fd) => { fd.append("lineId", String(line.id)); return deleteLine(fd); }}
                      />
                    </div>
                    <button
                      onClick={() => setOpenModelForm(openModelForm === line.id ? null : line.id)}
                      style={{ ...addBtnStyle, fontSize: "11px", padding: "5px 10px", background: "var(--accent)" }}
                    >
                      + Add Model
                    </button>
                  </div>

                  {/* Add Model 폼 */}
                  {openModelForm === line.id && (
                    <InlineForm
                      fields={[{ name: "name", placeholder: "Model name (e.g. Atlas)" }]}
                      action={(fd) => { fd.append("lineId", String(line.id)); return createModel(fd); }}
                      onDone={() => setOpenModelForm(null)}
                    />
                  )}

                  {/* Models */}
                  {line.models.length === 0 ? (
                    <p style={{ fontSize: "12px", color: "var(--text-3)", fontStyle: "italic" }}>No models yet</p>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "4px" }}>
                      {line.models.map((model) => (
                        <div key={model.id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <Link href={`/admin/models/${model.id}`} style={{
                            fontSize: "12px", fontWeight: "500",
                            padding: "3px 10px",
                            background: "var(--card)", border: "1px solid var(--border)",
                            borderRadius: "999px", color: "var(--text-1)",
                            textDecoration: "none",
                          }}>
                            {model.name}
                          </Link>
                          <DeleteBtn
                            name={model.name}
                            action={(fd) => { fd.append("modelId", String(model.id)); return deleteModel(fd); }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* ── Add Company ── */}
      <div style={{ marginTop: "8px" }}>
        {!showAddCompany ? (
          <button
            onClick={() => setShowAddCompany(true)}
            style={{
              width: "100%", padding: "14px",
              fontSize: "14px", fontWeight: "600", fontFamily: "inherit",
              color: "var(--accent)",
              background: "rgba(217,119,87,0.07)",
              border: "1px dashed rgba(217,119,87,0.30)",
              borderRadius: "16px", cursor: "pointer",
              letterSpacing: "-0.2px",
            }}
          >
            + Add Customer
          </button>
        ) : (
          <div className="liquid-glass" style={{ padding: "20px 24px" }}>
            <p style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-2)", marginBottom: "10px" }}>
              New Customer
            </p>
            <InlineForm
              fields={[
                { name: "code", placeholder: "Code (e.g. VW)",  width: "120px" },
                { name: "name", placeholder: "Full name (e.g. Volkswagen)" },
              ]}
              action={createCompany}
              onDone={() => setShowAddCompany(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
