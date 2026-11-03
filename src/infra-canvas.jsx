import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  applyNodeChanges,
  getSmoothStepPath,
  useReactFlow
} from '@xyflow/react';

const E = window.Loadbearing;

// What is being dragged right now (browsers hide drag data during dragover, so keep it here).
export const dragState = { current: null };
export const startDrag = (event, payload) => {
  dragState.current = payload;
  event.dataTransfer.setData('application/loadbearing-infra', JSON.stringify(payload));
  event.dataTransfer.effectAllowed = 'move';
};
export const endDrag = () => { dragState.current = null; };

const InfraContext = createContext({});

export const HEAT_WORDS = { low: 'Healthy', medium: 'Moderate', high: 'Near limit', over: 'Over capacity' };
const KIND_ICON = { compute: '⚙', store: '▤', entry: '⇥', nat: '⇄', endpoints: '⌁', external: '☁', user: '☺' };
const KIND_LABEL = { entry: 'Public entry', nat: 'Outbound traffic', endpoints: 'Private links', external: 'Outside service', user: 'Users' };
const EDGE_VERB = { call: 'calls', read: 'reads', write: 'writes', pub: 'publishes', deliver: 'delivers', replicate: 'copies', entry: 'requests', user: 'requests' };

export function resourceFor(deploy, gnode) {
  if (gnode.kind === 'compute') return deploy.compute.find((item) => item.id === gnode.id);
  if (gnode.kind === 'store') return deploy.stores.find((item) => item.id === gnode.id);
  return null;
}

function nodeDetail(gnode, resource, deploy) {
  if (gnode.kind === 'compute' && resource) {
    const T = E.COMPUTE[resource.type];
    const size = T.sizes ? `${resource.size} · ` : '';
    const scale = resource.type === 'fn' ? `up to ${resource.concurrency || 1000} at once` : `${resource.min ?? 0}–${resource.max ?? 1} instances`;
    return `${T.short} · ${size}${scale}`;
  }
  if (gnode.kind === 'store' && resource) {
    const T = E.STORES[resource.type];
    const copies = resource.regions.length > 1 ? ` · ${E.REPL[resource.repl].short}` : '';
    return `${T.label}${T.usd ? ` · ${resource.size || 'Medium'}` : ''}${copies}`;
  }
  if (gnode.kind === 'entry') {
    const net = E.netRegion(deploy, gnode.region);
    return net.entry === 'none' ? 'Nothing outside reaches private compute' : `Up to ${net.limit.toLocaleString()} requests/s`;
  }
  if (gnode.kind === 'nat') return 'Private compute reaches the internet';
  if (gnode.kind === 'endpoints') return 'Private links to managed services';
  if (gnode.kind === 'external') return `Outside your system · ${E.REGIONS[deploy.externals?.[gnode.id]?.region || deploy.regions[0]]?.code || ''}`;
  return KIND_LABEL[gnode.kind] || '';
}

function InfraNode({ data, selected }) {
  const ctx = useContext(InfraContext);
  const { gnode } = data;
  const resource = resourceFor(ctx.deploy, gnode);
  const state = E.heatFor(gnode.key, ctx.states);
  const level = state ? E.heatLevel(state.rho) : null;
  const problems = ctx.problemsByNode?.[gnode.key] || [];
  const worst = problems.some((item) => item.sev === 'error') ? 'error' : problems.length ? 'warn' : '';
  const [over, setOver] = useState(null);
  const chips = gnode.kind === 'compute' ? resource?.workloads : gnode.kind === 'store' ? resource?.data : null;
  const active = ctx.activeNodes?.has(gnode.key);
  const dropFit = (payload) => {
    if (!payload) return null;
    if (gnode.kind === 'compute') return payload.type === 'workload' ? { ok: true, text: 'Run here' } : { ok: false, text: 'Data goes in a store' };
    if (gnode.kind === 'store') {
      if (payload.type !== 'data') return { ok: false, text: 'Workloads run on compute' };
      const kind = ctx.build.data.find((item) => item.name === payload.name)?.kind;
      const fit = E.storeFit(resource.type, kind);
      return fit.fit === 'no' ? { ok: false, text: 'This store can’t hold it' } : { ok: true, text: fit.fit === 'native' ? 'Fits well' : 'Works, with caveats' };
    }
    return null;
  };
  const droppable = ctx.editable && (gnode.kind === 'compute' || gnode.kind === 'store');
  const hint = over ? dropFit(over) : null;
  const rate = ctx.nodeRates?.[gnode.key];
  return (
    <div
      className={`infra-node kind-${gnode.kind} ${level ? `heat-${level}` : ''} ${selected ? 'selected' : ''} ${active ? 'trace-active' : ''} ${hint ? (hint.ok ? 'drop-ok' : 'drop-no') : ''}`}
      data-node-key={gnode.key}
      data-kind={gnode.kind}
      onDragOver={droppable ? (event) => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; if (!over) setOver(dragState.current); } : undefined}
      onDragLeave={droppable ? () => setOver(null) : undefined}
      onDrop={droppable ? (event) => { event.preventDefault(); event.stopPropagation(); const payload = dragState.current; setOver(null); endDrag(); if (payload) ctx.onDropOnNode?.(gnode, payload); } : undefined}
    >
      <Handle type="target" position={Position.Left} isConnectable={ctx.editable} />
      <div className="infra-node-title">
        <span className="node-icon" aria-hidden="true">{KIND_ICON[gnode.kind]}</span>
        <strong>{gnode.name}</strong>
        {gnode.kind === 'store' && gnode.primary && resource?.regions.length > 1 && <span className="node-badge">Primary</span>}
        {worst && <span className={`problem-badge ${worst}`} title={problems.map((item) => item.msg).join(' ')}>{worst === 'error' ? '! Fix' : 'Note'}{problems.length > 1 ? ` ×${problems.length}` : ''}</span>}
      </div>
      <div className="infra-node-detail">{nodeDetail(gnode, resource, ctx.deploy)}</div>
      {chips && <div className="chip-list" aria-label={`${gnode.kind === 'compute' ? 'Workloads' : 'Data'} on ${gnode.name}`}>
        {chips.length === 0 && <span className="chip-empty">{ctx.editable ? `Drop ${gnode.kind === 'compute' ? 'workloads' : 'data'} here` : 'Nothing placed'}</span>}
        {chips.map((name) => (
          <span
            key={name}
            className={`chip ${gnode.kind === 'compute' ? 'chip-workload' : 'chip-data'} nodrag nopan`}
            draggable={ctx.editable}
            onDragStart={ctx.editable ? (event) => startDrag(event, { type: gnode.kind === 'compute' ? 'workload' : 'data', name, fromId: gnode.id }) : undefined}
            onDragEnd={endDrag}
          >
            <span>{name}</span>
            {ctx.editable && <button type="button" className="chip-remove nodrag" aria-label={`Remove ${name} from ${gnode.name}`} onClick={(event) => { event.stopPropagation(); ctx.onRemoveChip?.(gnode, name); }}>×</button>}
          </span>
        ))}
      </div>}
      {hint && <div className={`drop-hint ${hint.ok ? 'ok' : 'no'}`}>{hint.ok ? '✓' : '✕'} {hint.text}</div>}
      {state && !hint && <div className={`heat-readout heat-${level}`}>
        <div className="heat-line"><strong>{Math.round(state.rho * 100)}% {state.what || 'busy'}</strong><span>{HEAT_WORDS[level]}</span></div>
        <i><b style={{ width: `${Math.min(100, state.rho * 100)}%` }} /></i>
        {state.inst != null && state.type === 'compute' && <small>{state.inst} {state.inst === 1 ? 'instance' : 'instances'}{state.lag ? ` · ${state.lag} still starting` : ''}</small>}
      </div>}
      {rate > 0 && !state && <div className="heat-readout"><small>{E.fmtN(rate)} requests/s pass through</small></div>}
      <Handle type="source" position={Position.Right} isConnectable={ctx.editable} />
    </div>
  );
}

function RegionNode({ data, selected }) {
  const { region } = data;
  return (
    <div className={`region-box ${region.outside ? 'outside' : ''} ${selected ? 'selected' : ''}`} data-region={region.id}>
      <div className="region-box-title"><strong>{region.code}</strong><span>{region.city}</span></div>
    </div>
  );
}

const nodeTypes = { infra: InfraNode, region: RegionNode };

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handle = () => setReduced(query.matches);
    query.addEventListener('change', handle);
    return () => query.removeEventListener('change', handle);
  }, []);
  return reduced;
}

function TrafficEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }) {
  const reduced = useReducedMotion();
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  const rate = data.rate || 0;
  const width = data.active ? 4 : rate > 0 ? 1.6 + Math.min(4.4, Math.log10(rate + 1) * 1.1) : 1.4;
  const dots = data.active ? 3 : rate > 0 ? Math.min(4, 1 + Math.floor(Math.log10(rate + 1))) : 0;
  const seconds = Math.max(0.8, 3 / (data.speed || 1));
  const text = data.showLabel ? `${EDGE_VERB[data.kind] || data.kind}${rate > 0 ? ` · ${E.fmtN(rate)}/s` : ''}` : rate > 0 ? `${E.fmtN(rate)}/s` : '';
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={`infra-edge edge-${data.kind} ${data.active ? 'edge-active' : ''} ${data.dim ? 'edge-dim' : ''} ${rate > 0 ? 'edge-live' : ''}`} style={{ strokeWidth: width }} />
      {!reduced && data.motion && Array.from({ length: dots }, (_, index) => (
        <circle key={index} r={data.active ? 5 : 3.2} className={`edge-particle edge-particle-${data.kind} ${data.active ? 'edge-particle-active' : ''}`}>
          <animateMotion dur={`${seconds}s`} begin={`${-(index * seconds) / dots}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
      {text && <EdgeLabelRenderer><div className={`edge-label ${data.active ? 'active' : ''}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>{text}</div></EdgeLabelRenderer>}
    </>
  );
}

const edgeTypes = { traffic: TrafficEdge };

export function Legend({ showHeat }) {
  return (
    <div className="infra-legend" aria-label="Legend">
      {showHeat && <>
        <span className="legend-item heat-low"><i />Healthy under 50%</span>
        <span className="legend-item heat-medium"><i />Moderate 50–80%</span>
        <span className="legend-item heat-high"><i />Near limit 80–100%</span>
        <span className="legend-item heat-over"><i />Over capacity</span>
      </>}
      <span className="legend-item"><i className="legend-line" />Line thickness = requests per second</span>
    </div>
  );
}

// The infrastructure picture. Deploy edits it; Simulate only reads it and overlays results.
export function InfraCanvas({
  graph, build, deploy, editable = false, states, traffic, trace, motion = false, speed = 1,
  selectedKey, onSelect, problemsByNode, onDropOnNode, onDropOnRegion, onRemoveChip, onMoveNode, onConnect, label
}) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [nodes, setNodes] = useState([]);
  const structure = `${graph.regions.map((region) => region.id).join()}|${graph.nodes.map((node) => node.key).join()}`;

  const baseNodes = useMemo(() => {
    const regionNodes = [...(graph.outside ? [graph.outside] : []), ...graph.regions].map((region) => ({
      id: region.key, type: 'region', position: { x: region.x, y: region.y }, data: { region },
      style: { width: region.w, height: region.h }, draggable: editable && !region.outside, selectable: false, zIndex: 0
    }));
    const infraNodes = graph.nodes.map((gnode) => ({
      id: gnode.key, type: 'infra', parentId: `r:${gnode.region}`, position: { x: gnode.x, y: gnode.y },
      data: { gnode }, style: { width: gnode.w, height: gnode.h }, draggable: editable && gnode.kind !== 'user', zIndex: 2
    }));
    return [...regionNodes, ...infraNodes];
  }, [graph, editable]);
  useEffect(() => setNodes(baseNodes), [baseNodes]);
  useEffect(() => { const timer = window.setTimeout(() => fitView({ padding: 0.08, duration: 200 }), 60); return () => window.clearTimeout(timer); }, [structure, fitView]);

  const activeNodes = useMemo(() => new Set(trace?.nodes || []), [trace]);
  const edges = useMemo(() => graph.edges.map((edge) => {
    const touchesSelection = selectedKey && (edge.from === selectedKey || edge.to === selectedKey);
    const active = !!trace?.edges?.has(edge.id);
    const rate = traffic?.[edge.id] || 0;
    return {
      id: edge.id, source: edge.from, target: edge.to, type: 'traffic', zIndex: active ? 5 : 1,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      data: { kind: edge.kind, rate, active, dim: !!trace && !active, motion, speed, showLabel: touchesSelection || active || (editable && graph.edges.length < 9) }
    };
  }), [graph.edges, selectedKey, trace, traffic, motion, speed, editable]);

  const nodeRates = useMemo(() => {
    const totals = {};
    graph.edges.forEach((edge) => { const rate = traffic?.[edge.id] || 0; if (rate) totals[edge.to] = (totals[edge.to] || 0) + rate; });
    return totals;
  }, [graph.edges, traffic]);

  const context = useMemo(() => ({ deploy, build, editable, states, problemsByNode, onDropOnNode, onRemoveChip, activeNodes, nodeRates }), [deploy, build, editable, states, problemsByNode, onDropOnNode, onRemoveChip, activeNodes, nodeRates]);

  const regionAt = (point) => graph.regions.find((region) => point.x >= region.x && point.x <= region.x + region.w && point.y >= region.y && point.y <= region.y + region.h);

  const handleDragStop = (_event, node) => {
    if (!editable) return;
    if (node.type === 'region') return onMoveNode?.({ region: node.data.region, position: { x: Math.round(node.position.x), y: Math.round(node.position.y) } });
    const gnode = node.data.gnode; const home = graph.regions.find((region) => region.id === gnode.region);
    if (!home) return;
    const abs = { x: home.x + node.position.x + gnode.w / 2, y: home.y + node.position.y + gnode.h / 2 };
    const target = regionAt(abs) || home;
    onMoveNode?.({ gnode, region: target, position: { x: Math.round(home.x + node.position.x - target.x), y: Math.round(home.y + node.position.y - target.y) } });
  };

  return (
    <div className="infra-canvas canvas-wrap" data-testid="infra-canvas" aria-label={label}>
      <InfraContext.Provider value={context}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={(changes) => setNodes((items) => applyNodeChanges(changes, items))}
          onNodeDragStop={handleDragStop}
          onNodeClick={(_event, node) => node.type === 'infra' && onSelect?.(node.id)}
          onPaneClick={() => onSelect?.(null)}
          onConnect={(connection) => onConnect?.(connection.source, connection.target)}
          nodesDraggable={editable}
          nodesConnectable={editable}
          onDragOver={editable ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } : undefined}
          onDrop={editable ? (event) => {
            event.preventDefault();
            const payload = dragState.current; endDrag();
            if (!payload) return;
            const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
            onDropOnRegion?.(regionAt(point) || null, payload);
          } : undefined}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--grid)" gap={22} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </InfraContext.Provider>
    </div>
  );
}
