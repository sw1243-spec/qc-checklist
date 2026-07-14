"use client";

import { useState } from "react";
import { updateShiftConfig } from "@/app/admin/actions";

type Shift = { id: number; name: string; order: number; startHour: number; startMinute: number; endHour: number; endMinute: number; isActive: boolean };

function pad(n: number) { return String(n).padStart(2, "0"); }

function ShiftRow({ shift }: { shift: Shift }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggleActive() {
    setPending(true);
    const fd = new FormData();
    fd.append("id", String(shift.id));
    fd.append("name", shift.name);
    fd.append("startHour", String(shift.startHour));
    fd.append("startMinute", String(shift.startMinute));
    fd.append("endHour", String(shift.endHour));
    fd.append("endMinute", String(shift.endMinute));
    fd.append("isActive", String(!shift.isActive));
    await updateShiftConfig(fd);
    setPending(false);
  }

  if (editing) {
    return (
      <form
        action={async (fd) => { await updateShiftConfig(fd); setEditing(false); }}
        className="liquid-glass"
        style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}
      >
        <input type="hidden" name="id" value={shift.id} />
        <input type="hidden" name="name" value={shift.name} />
        <input type="hidden" name="isActive" value={String(shift.isActive)} />

        <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>{shift.name}</div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "var(--text-3)", minWidth: "64px" }}>Start</span>
          <input name="startHour" type="number" min={0} max={23} defaultValue={shift.startHour} required className="apple-input" style={{ width: "70px" }} placeholder="HH" />
          <span style={{ color: "var(--text-3)" }}>:</span>
          <input name="startMinute" type="number" min={0} max={59} defaultValue={shift.startMinute} required className="apple-input" style={{ width: "70px" }} placeholder="MM" />
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: "var(--text-3)", minWidth: "64px" }}>Deadline</span>
          <input name="endHour" type="number" min={0} max={23} defaultValue={shift.endHour} required className="apple-input" style={{ width: "70px" }} placeholder="HH" />
          <span style={{ color: "var(--text-3)" }}>:</span>
          <input name="endMinute" type="number" min={0} max={59} defaultValue={shift.endMinute} required className="apple-input" style={{ width: "70px" }} placeholder="MM" />
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          <button type="submit" className="btn-primary" style={{ flex: 1 }}>Save</button>
          <button type="button" onClick={() => setEditing(false)} style={{ flex: 1, padding: "10px", borderRadius: "10px", border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", fontSize: "14px", cursor: "pointer" }}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="liquid-glass" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "15px", fontWeight: "600", color: shift.isActive ? "var(--text-1)" : "var(--text-3)" }}>{shift.name}</span>
          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: shift.isActive ? "rgba(52,199,89,0.12)" : "var(--fill-2)", color: shift.isActive ? "#34C759" : "var(--text-3)", fontWeight: "600" }}>
            {shift.isActive ? "Active" : "Inactive"}
          </span>
        </div>
        <div style={{ fontSize: "13px", color: "var(--text-3)", marginTop: "3px" }}>
          {pad(shift.startHour)}:{pad(shift.startMinute)} – {pad(shift.endHour)}:{pad(shift.endMinute)}
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={toggleActive} disabled={pending} style={{ fontSize: "13px", color: shift.isActive ? "var(--danger)" : "#34C759", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
          {shift.isActive ? "Deactivate" : "Activate"}
        </button>
        <button onClick={() => setEditing(true)} style={{ fontSize: "13px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
          Edit
        </button>
      </div>
    </div>
  );
}

export default function ShiftManager({ shifts }: { shifts: Shift[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {shifts.map((s) => <ShiftRow key={s.id} shift={s} />)}
    </div>
  );
}
