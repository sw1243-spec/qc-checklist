"use client";

import { useMemo, useState, useEffect, useRef, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, type Node, type Edge, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { renameCompany, renameLine, renameModel, renamePartNumber, renameTemplate, renameTemplateCode } from "./actions";

type T = { id: number; code: string; name: string };
type PN = { id: number; code: string; label: string; templates: T[] };
type Model = { id: number; name: string; templates: T[]; partNumbers: PN[] };
type Line = { id: number; code: string; models: Model[] };
type Company = { id: number; code: string; name: string; lines: Line[] };

// depth별 x좌표 — 균등 간격 대신 파트넘버(빽빽한 칼럼) 양옆을 크게 벌려 선이 잘 보이게
// 0:Company  1:Line  2:Model  3:Part#  4:Template (Part#↔Template 간격 가장 크게)
const X = [0, 470, 1000, 1560, 2480];
const ROW = 60;    // leaf 세로 간격 (파트넘버 콤팩트 → 촘촘해도 OK, 전체 높이 단축)

type EntityData = {
  label: string;
  sub?: string;
  tag: string;
  accent: string;
  onRename?: (v: string) => void;
  onRenameSub?: (v: string) => void; // sub(코드) 수정용
  subLabel?: string;                  // 편집창 라벨 (예: "Code")
};

// 노드 타입별 크기 — 계층순(Company > Line > Model), Template 크게, Part#는 콤팩트
const BIG_SHADOW = "0 3px 10px rgba(0,0,0,0.08), 0 12px 34px rgba(160,110,70,0.12)";
const SM_SHADOW = "0 1px 4px rgba(0,0,0,0.05)";
type NodeSize = { minW: number; maxW: number; pad: string; bl: number; radius: number; label: number; sub: number; tag: number; tagMb: number; shadow: string };
const NODE_SIZE: Record<string, NodeSize> = {
  "Company":  { minW: 290, maxW: 380, pad: "18px 22px", bl: 8, radius: 18, label: 22, sub: 14, tag: 12, tagMb: 4, shadow: BIG_SHADOW },
  "Line":     { minW: 250, maxW: 330, pad: "15px 19px", bl: 7, radius: 16, label: 19, sub: 13, tag: 11, tagMb: 3, shadow: BIG_SHADOW },
  "Model":    { minW: 215, maxW: 290, pad: "13px 16px", bl: 6, radius: 14, label: 16, sub: 12, tag: 10, tagMb: 3, shadow: BIG_SHADOW },
  "Template": { minW: 235, maxW: 310, pad: "14px 18px", bl: 7, radius: 15, label: 18, sub: 12, tag: 11, tagMb: 3, shadow: BIG_SHADOW },
  "Part #":   { minW: 116, maxW: 158, pad: "5px 9px",  bl: 4, radius: 10, label: 11, sub: 9,  tag: 7,  tagMb: 1, shadow: SM_SHADOW },
};

// ── 커스텀 노드: 더블클릭 시 이름 수정 ──────────────────────
function EntityNode({ data }: NodeProps) {
  const d = data as EntityData;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(d.label);
  const [subVal, setSubVal] = useState(d.sub ?? "");

  const s = NODE_SIZE[d.tag] ?? NODE_SIZE.Model;

  return (
    <div style={{
      background: "rgba(255,252,246,0.92)",
      border: `1px solid ${d.accent}`,
      borderLeft: `${s.bl}px solid ${d.accent}`,
      borderRadius: `${s.radius}px`,
      padding: s.pad,
      minWidth: `${s.minW}px`, maxWidth: `${s.maxW}px`,
      boxShadow: s.shadow,
    }}>
      <Handle type="target" position={Position.Left} style={{ background: d.accent, width: 7, height: 7, border: "none" }} />
      <div style={{ fontSize: `${s.tag}px`, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: d.accent, marginBottom: `${s.tagMb}px` }}>
        {d.tag}
      </div>
      {editing && d.onRename ? (
        <div className="nodrag" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <input
            autoFocus value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => { if (val.trim() && val !== d.label) d.onRename!(val); else setVal(d.label); if (!d.onRenameSub) setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") { setVal(d.label); setEditing(false); }
            }}
            placeholder="Name"
            style={{
              width: "100%", fontSize: "13px", fontWeight: 600, fontFamily: "inherit",
              border: "1px solid var(--border)", borderRadius: "6px", padding: "2px 6px", outline: "none",
            }}
          />
          {d.onRenameSub && (
            <input
              value={subVal}
              onChange={(e) => setSubVal(e.target.value)}
              onBlur={() => { setEditing(false); if (subVal.trim() && subVal !== d.sub) d.onRenameSub!(subVal); else setSubVal(d.sub ?? ""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") { setSubVal(d.sub ?? ""); setEditing(false); }
              }}
              placeholder={d.subLabel ?? "Code"}
              style={{
                width: "100%", fontSize: "10px", fontFamily: "inherit",
                border: "1px solid var(--border)", borderRadius: "6px", padding: "2px 6px", outline: "none",
              }}
            />
          )}
        </div>
      ) : (
        <div
          onDoubleClick={() => d.onRename && setEditing(true)}
          title={d.onRename ? "Double-click to edit" : undefined}
          style={{ fontSize: `${s.label}px`, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.25, cursor: d.onRename ? "text" : "default" }}
        >
          {d.label}
          {d.sub && <div style={{ fontSize: `${s.sub}px`, color: "var(--text-3)", fontWeight: 400, marginTop: "1px" }}>{d.sub}</div>}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: d.accent, width: 7, height: 7, border: "none" }} />
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

const COLORS = {
  company: "#c8735a",
  line: "#b08968",
  model: "#7d9b76",
  pn: "#6b8cae",
  template: "#0088ff",
};

export default function StructureDiagram({ tree }: { tree: Company[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [maxDepth, setMaxDepth] = useState(2); // 2=Model, 3=Part#, 4=Template (기본: 한눈에)
  const rf = useRef<ReactFlowInstance | null>(null);

  const rename = useCallback((fn: () => Promise<{ error?: string } | void>) => {
    start(async () => {
      const r = await fn();
      if (r && "error" in r && r.error) { alert(r.error); return; }
      router.refresh();
    });
  }, [router]);

  // 트리 → 노드/엣지 (leaf-slot 자동 배치)
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let slot = 0;

    function add(id: string, depth: number, y: number, data: EntityData) {
      nodes.push({ id, type: "entity", position: { x: X[depth] ?? depth * 400, y }, data: data as unknown as Record<string, unknown> });
    }
    function edge(from: string, to: string) {
      edges.push({ id: `${from}->${to}`, source: from, target: to, animated: true, style: { stroke: "#c8a98e", strokeWidth: 1.5 } });
    }

    // 템플릿은 노드 1개만 만들고 연결된 파트넘버/모델에서 엣지를 모은다 (중복 노드 방지)
    const tmplLinks = new Map<number, { tpl: T; ys: number[] }>();
    const tmplEdges: { tid: number; srcId: string }[] = [];
    function linkTmpl(t: T, srcId: string, srcY: number) {
      let e = tmplLinks.get(t.id);
      if (!e) { e = { tpl: t, ys: [] }; tmplLinks.set(t.id, e); }
      e.ys.push(srcY);
      tmplEdges.push({ tid: t.id, srcId });
    }

    for (const c of tree) {
      const cId = `c-${c.id}`;
      const lineYs: number[] = [];
      for (const l of c.lines) {
        const lId = `l-${l.id}`;
        const modelYs: number[] = [];
        for (const m of l.models) {
          const mId = `m-${m.id}`;
          const childYs: number[] = [];
          // 파트넘버 (깊이 3 이상) — 파트넘버는 잎(leaf)으로 한 슬롯 차지
          if (maxDepth >= 3) {
            for (const pn of m.partNumbers) {
              const pnId = `pn-${pn.id}`;
              const pnY = slot++ * ROW;
              childYs.push(pnY);
              add(pnId, 3, pnY, { label: pn.code, sub: pn.label || undefined, tag: "Part #", accent: COLORS.pn, onRename: (v) => rename(() => renamePartNumber(pn.id, v, pn.label)) });
              edge(mId, pnId);
              if (maxDepth >= 4) for (const t of pn.templates) linkTmpl(t, pnId, pnY);
            }
          }
          const mY = childYs.length ? (childYs[0] + childYs[childYs.length - 1]) / 2 : slot++ * ROW;
          modelYs.push(mY);
          add(mId, 2, mY, { label: m.name, tag: "Model", accent: COLORS.model, onRename: (v) => rename(() => renameModel(m.id, v)) });
          edge(lId, mId);
          // 모델 직접 연결 템플릿 (파트넘버가 없을 때)
          if (maxDepth >= 4 && m.partNumbers.length === 0) {
            for (const t of m.templates) linkTmpl(t, mId, mY);
          }
        }
        const lY = modelYs.length ? (modelYs[0] + modelYs[modelYs.length - 1]) / 2 : slot++ * ROW;
        lineYs.push(lY);
        add(lId, 1, lY, { label: l.code, tag: "Line", accent: COLORS.line, onRename: (v) => rename(() => renameLine(l.id, v)) });
        edge(cId, lId);
      }
      const cY = lineYs.length ? (lineYs[0] + lineYs[lineYs.length - 1]) / 2 : slot++ * ROW;
      add(cId, 0, cY, { label: c.name, sub: c.code, tag: "Company", accent: COLORS.company, onRename: (v) => rename(() => renameCompany(c.id, v)) });
    }

    // 템플릿 노드: 종류별 1개만. y = 연결된 소스들의 평균 (엣지가 모이도록)
    if (maxDepth >= 4) {
      for (const [tid, e] of tmplLinks) {
        const ys = e.ys;
        const y = ys.reduce((a, b) => a + b, 0) / ys.length;
        const t = e.tpl;
        add(`t-${tid}`, 4, y, { label: t.name, sub: t.code, subLabel: "Code", tag: "Template", accent: COLORS.template, onRename: (v) => rename(() => renameTemplate(t.id, v)), onRenameSub: (v) => rename(() => renameTemplateCode(t.id, v)) });
      }
      for (const te of tmplEdges) edge(te.srcId, `t-${te.tid}`);
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [tree, rename, maxDepth]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // 데이터 갱신(rename/refresh)·깊이 변경 시 노드/엣지 동기화
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  // 노드/깊이 변경 시 전체가 화면에 들어오도록 자동 맞춤
  useEffect(() => {
    const t = setTimeout(() => rf.current?.fitView({ padding: 0.06, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [initialNodes, maxDepth]);

  return (
    <div className="liquid-glass fade-up" style={{ height: "84vh", borderRadius: "16px", overflow: "hidden", position: "relative" }}>
      {/* 깊이 토글 */}
      <div style={{ position: "absolute", top: "12px", left: "12px", zIndex: 5, display: "flex", gap: "4px", background: "rgba(255,252,246,0.9)", padding: "4px", borderRadius: "9999px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
        {([[2, "Model"], [3, "Part #"], [4, "Template"]] as const).map(([d, label]) => (
          <button key={d} onClick={() => setMaxDepth(d)} style={{
            fontSize: "12px", fontWeight: 600, padding: "5px 12px", borderRadius: "9999px",
            border: "none", cursor: "pointer", fontFamily: "inherit",
            background: maxDepth === d ? "var(--accent)" : "transparent",
            color: maxDepth === d ? "#fff" : "var(--text-2)",
          }}>{label}</button>
        ))}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(inst) => { rf.current = inst; inst.fitView({ padding: 0.06 }); }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.06 }}
        minZoom={0.05}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#c8a98e" gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => ((n.data as unknown as EntityData)?.accent) ?? "#999"} />
      </ReactFlow>
    </div>
  );
}
