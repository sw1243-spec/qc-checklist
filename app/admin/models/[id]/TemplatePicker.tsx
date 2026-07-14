"use client";

import { useState } from "react";

type Template = { id: number; name: string; code: string };

export default function TemplatePicker({
  name = "templateId",
  templates,
  placeholder = "Select template…",
}: {
  name?: string;
  templates: Template[];
  placeholder?: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = templates.find((t) => String(t.id) === selectedId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <select
        name={name}
        required
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
        style={{
          width: "100%",
          padding: "9px 12px",
          fontSize: "14px",
          fontFamily: "inherit",
          color: "var(--text-1)",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          outline: "none",
        }}
      >
        <option value="">{placeholder}</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.code})
          </option>
        ))}
      </select>

      {selected && (
        <div style={{
          fontSize: "12px",
          color: "var(--text-2)",
          padding: "7px 10px",
          background: "var(--fill-1)",
          border: "1px solid var(--border)",
          borderRadius: "7px",
          lineHeight: 1.5,
          wordBreak: "break-word",
        }}>
          {selected.name} <span style={{ color: "var(--text-3)" }}>({selected.code})</span>
        </div>
      )}
    </div>
  );
}
