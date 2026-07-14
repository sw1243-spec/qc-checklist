"use client";

import { useState } from "react";
import StructureTree from "./StructureTree";
import StructureDiagram from "./StructureDiagram";

type T = { id: number; code: string; name: string };
type PN = { id: number; code: string; label: string; templates: T[] };
type Model = { id: number; name: string; templates: T[]; partNumbers: PN[] };
type Line = { id: number; code: string; models: Model[] };
type Company = { id: number; code: string; name: string; lines: Line[] };

export default function StructureView({ tree }: { tree: Company[] }) {
  const [view, setView] = useState<"diagram" | "list">("diagram");

  return (
    <div>
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
        {(["diagram", "list"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              fontSize: "13px", fontWeight: 600, padding: "7px 16px",
              borderRadius: "9999px", cursor: "pointer", fontFamily: "inherit",
              border: "1px solid var(--border)",
              background: view === v ? "var(--accent)" : "transparent",
              color: view === v ? "#fff" : "var(--text-2)",
            }}
          >
            {v === "diagram" ? "Diagram" : "Edit List"}
          </button>
        ))}
      </div>

      {view === "diagram" ? (
        <>
          <p style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "10px" }}>
            Drag to move · scroll to zoom · double-click a node to rename. For add / delete / link, use Edit List.
          </p>
          <StructureDiagram tree={tree} />
        </>
      ) : (
        <StructureTree tree={tree} />
      )}
    </div>
  );
}
