"use client";

import { useState } from "react";
import { createWorker, deleteWorker } from "@/app/admin/actions";

type Line = { id: number; code: string; company: { name: string } };
type Worker = { id: number; name: string; role: string; shift: number | null; line: Line | null };
type Company = { id: number; code: string; name: string; lines: { id: number; code: string }[] };

export default function WorkerManager({
  workers,
  companies,
}: {
  workers: Worker[];
  companies: Company[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState("");

  const leWorkers = workers.filter((w) => w.role === "LE");
  const qcWorkers = workers.filter((w) => w.role === "QC");
  const svWorkers = workers.filter((w) => w.role === "SV");
  const lines = companies.find((c) => c.code === selectedCompany)?.lines ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* Add button */}
      <div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
          style={{ width: "100%" }}
        >
          {showForm ? "Cancel" : "+ Add Worker"}
        </button>

        {showForm && (
          <form
            action={async (fd) => { await createWorker(fd); setShowForm(false); }}
            style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "12px" }}
            className="liquid-glass"
          >
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Name</label>
                <input name="name" required placeholder="Full name" className="apple-input" />
              </div>
              <div>
                <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Role</label>
                <select name="role" required className="apple-input" style={{ fontFamily: "inherit" }}>
                  <option value="LE">Line Leader</option>
                  <option value="QC">QC Inspector</option>
                  <option value="SV">QC Supervisor</option>
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Customer <span style={{ color: "var(--text-3)" }}>(optional)</span></label>
                  <select
                    className="apple-input"
                    style={{ fontFamily: "inherit" }}
                    value={selectedCompany}
                    onChange={(e) => setSelectedCompany(e.target.value)}
                  >
                    <option value="">All</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Line <span style={{ color: "var(--text-3)" }}>(optional)</span></label>
                  <select name="lineId" className="apple-input" style={{ fontFamily: "inherit" }}>
                    <option value="">All lines</option>
                    {lines.map((l) => (
                      <option key={l.id} value={l.id}>Line {l.code}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="apple-label" style={{ display: "block", marginBottom: "5px" }}>Shift <span style={{ color: "var(--text-3)" }}>(optional)</span></label>
                <select name="shift" className="apple-input" style={{ fontFamily: "inherit" }}>
                  <option value="">All shifts</option>
                  <option value="1">1st Shift</option>
                  <option value="2">2nd Shift</option>
                </select>
              </div>
              <button type="submit" className="btn-primary" style={{ marginTop: "4px" }}>Save</button>
            </div>
          </form>
        )}
      </div>

      {/* Line Leaders */}
      <WorkerGroup title="Line Leaders" workers={leWorkers} />

      {/* QC Inspectors */}
      <WorkerGroup title="QC Inspectors" workers={qcWorkers} />

      {/* QC Supervisors */}
      <WorkerGroup title="QC Supervisors" workers={svWorkers} />
    </div>
  );
}

function WorkerGroup({ title, workers }: { title: string; workers: Worker[] }) {
  return (
    <div>
      <p className="ios-section-label">{title}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {workers.length === 0 && (
          <div className="liquid-glass" style={{ padding: "16px 20px" }}>
            <p style={{ fontSize: "13px", color: "var(--text-3)", fontStyle: "italic" }}>None added yet</p>
          </div>
        )}
        {workers.map((w) => (
          <div key={w.id} className="liquid-glass" style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px",
          }}>
            <div>
              <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>{w.name}</div>
              <div style={{ fontSize: "12px", color: "var(--text-3)", marginTop: "2px" }}>
                {w.line ? `${w.line.company.name} · Line ${w.line.code}` : "All lines"}
                {" · "}{w.shift === 1 ? "1st Shift" : w.shift === 2 ? "2nd Shift" : "All shifts"}
              </div>
            </div>
            <form action={deleteWorker}>
              <input type="hidden" name="id" value={w.id} />
              <button
                type="submit"
                onClick={(e) => { if (!confirm(`Delete "${w.name}"?`)) e.preventDefault(); }}
                style={{
                  fontSize: "12px", fontWeight: "500", padding: "5px 12px",
                  background: "rgba(255,59,48,0.08)", color: "var(--danger)",
                  border: "1px solid rgba(255,59,48,0.18)", borderRadius: "8px",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Delete
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
