"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reorderTemplates } from "@/app/admin/actions";

type Tpl = { id: number; name: string; version: string; code: string; items: number };

export default function TemplateList({ initial }: { initial: Tpl[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [, start] = useTransition();
  const dragId = useRef<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  function onDrop(targetId: number) {
    const from = dragId.current;
    setOverId(null);
    dragId.current = null;
    if (from == null || from === targetId) return;
    const next = [...items];
    const fromIdx = next.findIndex((t) => t.id === from);
    const toIdx = next.findIndex((t) => t.id === targetId);
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setItems(next);
    start(async () => {
      await reorderTemplates(next.map((t) => t.id));
      router.refresh();
    });
  }

  return (
    <div className="fade-up" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {items.map((t) => (
        <div
          key={t.id}
          draggable
          onDragStart={() => { dragId.current = t.id; }}
          onDragOver={(e) => { e.preventDefault(); if (overId !== t.id) setOverId(t.id); }}
          onDragLeave={() => setOverId((o) => (o === t.id ? null : o))}
          onDrop={() => onDrop(t.id)}
          className="liquid-glass"
          style={{
            display: "flex", alignItems: "center", gap: "12px",
            padding: "16px 16px 16px 12px",
            borderTop: overId === t.id ? "2px solid var(--accent)" : "2px solid transparent",
          }}
        >
          {/* 드래그 핸들 */}
          <div style={{ cursor: "grab", color: "var(--text-3)", flexShrink: 0, lineHeight: 1 }} title="Drag to reorder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
              <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
              <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
            </svg>
          </div>

          <a href={`/SWJ/templates/${t.id}`} style={{ flex: 1, textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-1)" }}>{t.name}</span>
                <span style={{
                  fontSize: "10px", fontWeight: "600", padding: "2px 7px",
                  background: "var(--panel)", border: "1px solid var(--border)",
                  borderRadius: "999px", color: "var(--text-3)",
                }}>{t.version}</span>
              </div>
              <div className="label-caps" style={{ marginTop: "4px", fontSize: "10px" }}>
                {t.code} · {t.items} items
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </a>
        </div>
      ))}
    </div>
  );
}
