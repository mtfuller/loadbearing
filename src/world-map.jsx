import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LAND_RINGS } from './world-land.js';
import { dragState, endDrag, startDrag, HEAT_WORDS, resourceFor } from './infra-canvas.jsx';

const E = window.Loadbearing;

const W = 1200, H = 520;
const project = (lat, lon) => ({ x: ((lon + 170) / 350) * W, y: ((80 - lat) / 140) * H });
const CARD_W = 250, ROW = 38, HEAD = 44;
const KIND_ICON = { compute: '⚙', store: '▤', entry: '⇥', nat: '⇄', endpoints: '⌁', external: '☁' };

const landPath = LAND_RINGS.map((ring) => `M${ring.map(([lon, lat]) => { const p = project(lat, lon); return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join('L')}Z`).join('');

const VIEW_KEY = 'loadbearing-canvas-view';
export function useCanvasView() {
  const [view, setView] = useState(() => (localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'diagram'));
  const change = (next) => { setView(next); localStorage.setItem(VIEW_KEY, next); };
  return [view, change];
}

export function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="Canvas view">
      <button type="button" className={view === 'diagram' ? 'on' : ''} aria-pressed={view === 'diagram'} onClick={() => onChange('diagram')}>Diagram</button>
      <button type="button" className={view === 'map' ? 'on' : ''} aria-pressed={view === 'map'} onClick={() => onChange('map')}>World map</button>
    </div>
  );
}

function cardHeight(count) { return HEAD + Math.max(1, count) * ROW + 8; }

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Label sides tried in order for each pin; the first one that does not collide with another label or pin wins.
function placeLabels(items) {
  const placed = []; const pinBoxes = items.map((item) => ({ x: item.x - 8, y: item.y - 8, w: 16, h: 16 }));
  return items.map((item, index) => {
    const w = item.text.length * 6.6 + 14, h = 20;
    const options = [[12, -h / 2], [-12 - w, -h / 2], [-w / 2, 12], [-w / 2, -12 - h], [12, 6], [-12 - w, 6], [12, -h - 6], [-12 - w, -h - 6]];
    let best = null;
    options.forEach(([dx, dy]) => {
      if (best) return;
      const box = { x: item.x + dx, y: item.y + dy, w, h };
      if (box.x < 2 || box.x + w > W - 2 || box.y < 2 || box.y + h > H - 2) return;
      if (placed.some((other) => overlaps(box, other)) || pinBoxes.some((other, j) => j !== index && overlaps(box, other))) return;
      best = { dx, dy, box };
    });
    if (!best) best = { dx: options[0][0], dy: options[0][1], box: { x: item.x + 12, y: item.y - h / 2, w, h } };
    placed.push(best.box);
    return { ...item, dx: best.dx, dy: best.dy, w, h, box: best.box };
  });
}

function curve(a, b, bend) {
  const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
  const c = { x: (a.x + b.x) / 2 - (dy / len) * bend, y: (a.y + b.y) / 2 + (dx / len) * bend };
  const tx = b.x - c.x, ty = b.y - c.y; const tl = Math.hypot(tx, ty) || 1;
  const end = { x: b.x - (tx / tl) * 11, y: b.y - (ty / tl) * 11 };
  const at = (t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * end.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * end.y });
  return { d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`, at, len };
}

function MapRow({ gnode, ctx }) {
  const resource = resourceFor(ctx.deploy, gnode);
  const state = E.heatFor(gnode.key, ctx.states);
  const level = state ? E.heatLevel(state.rho) : null;
  const problems = ctx.problemsByNode?.[gnode.key] || [];
  const moves = ctx.editable && ['compute', 'store', 'external'].includes(gnode.kind);
  const droppable = ctx.editable && (gnode.kind === 'compute' || gnode.kind === 'store');
  const placed = gnode.kind === 'compute' ? resource?.workloads?.length : gnode.kind === 'store' ? resource?.data?.length : null;
  const detail = placed != null ? `${placed} ${gnode.kind === 'compute' ? (placed === 1 ? 'workload' : 'workloads') : 'data'}` : gnode.kind === 'entry' ? 'Public entry' : gnode.kind === 'external' ? 'Outside service' : '';
  return (
    <div
      role="button" tabIndex={0}
      className={`map-row kind-${gnode.kind} ${level ? `heat-${level}` : ''} ${ctx.selectedKey === gnode.key ? 'selected' : ''} ${ctx.activeNodes?.has(gnode.key) ? 'trace-active' : ''}`}
      data-node-key={gnode.key} data-kind={gnode.kind}
      draggable={moves} onDragStart={moves ? (event) => startDrag(event, { type: 'moveNode', key: gnode.key }) : undefined} onDragEnd={endDrag}
      onClick={() => ctx.onSelect?.(gnode.key)}
      onKeyDown={(event) => { if (event.key === 'Enter') ctx.onSelect?.(gnode.key); }}
      onDragOver={droppable ? (event) => { event.preventDefault(); event.stopPropagation(); } : undefined}
      onDrop={droppable ? (event) => { event.preventDefault(); event.stopPropagation(); const payload = dragState.current; endDrag(); if (payload) ctx.onDropOnNode?.(gnode, payload); } : undefined}
    >
      <span aria-hidden="true">{KIND_ICON[gnode.kind]}</span>
      <strong>{gnode.name}</strong>
      <small>{detail}</small>
      {problems.length > 0 && <em className="problem-badge error">! Fix</em>}
      {state && <b className="map-heat">{Math.round(state.rho * 100)}% {HEAT_WORDS[level]}</b>}
    </div>
  );
}

const ZOOM_MIN = 0.5, ZOOM_MAX = 6;

// Regions as compact pins at their real locations. Click a pin to open its components; arcs carry traffic and round-trip latency.
export function WorldMap({
  graph, deploy, build, states, traffic, trace, motion, editable, selectedKey, onSelect, problemsByNode,
  onDropOnNode, onDropOnRegion, onToggleRegion, offline = [], onToggleOffline, label
}) {
  const wrap = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const touched = useRef(false);
  const [open, setOpen] = useState(null);
  const fit = (box = size) => { if (!box.w) return; const k = Math.min(box.w / W, box.h / H); setView({ k, x: (box.w - W * k) / 2, y: (box.h - H * k) / 2 }); };
  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const measure = () => { const box = { w: el.clientWidth, h: el.clientHeight }; setSize(box); if (!touched.current) fit(box); };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const wheel = (event) => {
      event.preventDefault(); touched.current = true;
      const rect = el.getBoundingClientRect(); const px = event.clientX - rect.left, py = event.clientY - rect.top;
      setView((v) => { const k = Math.max(ZOOM_MIN * Math.min(size.w / W, size.h / H), Math.min(ZOOM_MAX, v.k * Math.exp(-event.deltaY * 0.0015))); const r = k / v.k; return { k, x: px - (px - v.x) * r, y: py - (py - v.y) * r }; });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [size]);
  const zoomBy = (factor) => { touched.current = true; setView((v) => { const k = Math.max(0.3, Math.min(ZOOM_MAX, v.k * factor)); const cx = size.w / 2, cy = size.h / 2, r = k / v.k; return { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r }; }); };
  const drag = useRef(null);
  const onPointerDown = (event) => {
    if (event.target.closest('button, .map-region, .map-pin-region, .map-controls, .map-row')) return;
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }; event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event) => { if (!drag.current) return; touched.current = true; const d = drag.current; setView((v) => ({ ...v, x: d.vx + event.clientX - d.x, y: d.vy + event.clientY - d.y })); };
  const onPointerUp = () => { drag.current = null; };

  const rows = useMemo(() => {
    const byRegion = {};
    graph.regions.forEach((region) => { byRegion[region.id] = graph.nodes.filter((node) => node.region === region.id && node.kind !== 'nat' && node.kind !== 'endpoints'); });
    return byRegion;
  }, [graph]);
  const activeNodes = useMemo(() => new Set(trace?.nodes || []), [trace]);
  const ctx = { deploy, build, states, editable, selectedKey, onSelect, problemsByNode, onDropOnNode, activeNodes };

  const regionPins = graph.regions.map((region) => {
    const spot = project(E.REGIONS[region.id].lat, E.REGIONS[region.id].lon);
    const worst = rows[region.id].map((node) => E.heatFor(node.key, states)).filter(Boolean).reduce((top, state) => (!top || state.rho > top.rho ? state : top), null);
    const level = worst ? E.heatLevel(worst.rho) : null;
    return { region, id: region.id, ...spot, level, worst, text: region.code };
  });
  const userPins = graph.nodes.filter((node) => node.kind === 'user').map((node) => {
    const pop = node.key.slice(2); const spot = project(E.POPS[pop].lat, E.POPS[pop].lon);
    return { node, pop, id: node.key, ...spot, text: node.name };
  });
  const offlinePins = offline.filter((id) => E.REGIONS[id]).map((id) => ({ id, ...project(E.REGIONS[id].lat, E.REGIONS[id].lon), text: `${E.REGIONS[id].code} offline` }));
  const labelled = useMemo(() => placeLabels([...regionPins, ...offlinePins, ...userPins]), [graph, states, offline]); // eslint-disable-line react-hooks/exhaustive-deps
  const labelOf = Object.fromEntries(labelled.map((item) => [item.id, item]));
  const pinOf = Object.fromEntries([...regionPins, ...userPins].map((item) => [item.id, item]));

  const arcs = useMemo(() => {
    const out = {};
    graph.edges.forEach((edge) => {
      const a = graph.byKey[edge.from], b = graph.byKey[edge.to]; if (!a || !b) return;
      const rate = traffic?.[edge.id] || 0; const live = !!trace?.edges?.has(edge.id);
      if (a.kind === 'user') {
        const id = `${a.key}>${b.region}`; const o = out[id] = out[id] || { id, kind: 'user', from: a.key, to: b.region, rate: 0, active: false, pop: a.key.slice(2) };
        o.rate += rate; o.active = o.active || live;
      } else if (a.region !== b.region) {
        const id = `${a.region}>${b.region}`; const o = out[id] = out[id] || { id, kind: edge.kind, from: a.region, to: b.region, rate: 0, active: false };
        o.rate += rate; o.active = o.active || live;
      }
    });
    return Object.values(out).filter((arc) => pinOf[arc.from] && pinOf[arc.to]);
  }, [graph, traffic, trace]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawn = useMemo(() => {
    const taken = labelled.map((item) => item.box);
    return arcs.map((arc) => {
      const a = pinOf[arc.from], b = pinOf[arc.to];
      const ms = arc.kind === 'user' ? E.popRtt(arc.pop, arc.to) : E.rtt(arc.from, arc.to);
      const c = curve(a, b, Math.max(24, Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.22)) * (arc.from < arc.to ? 1 : -1));
      const text = `${arc.rate > 0 ? `${E.fmtN(arc.rate)}/s · ` : ''}${ms} ms`;
      const w = text.length * 6.2 + 14; let box = null; let pos = c.at(0.5);
      [0.5, 0.4, 0.6, 0.32, 0.68, 0.25, 0.75].some((t) => { pos = c.at(t); const candidate = { x: pos.x - w / 2, y: pos.y - 10, w, h: 20 }; if (!taken.some((other) => overlaps(candidate, other))) { box = candidate; return true; } return false; });
      if (!box) box = { x: pos.x - w / 2, y: pos.y - 10, w, h: 20 };
      taken.push(box);
      return { arc, c, text, box };
    });
  }, [arcs, labelled]); // eslint-disable-line react-hooks/exhaustive-deps

  const dots = (rate, active) => (active ? 3 : rate > 0 ? Math.min(4, 1 + Math.floor(Math.log10(rate + 1))) : 0);
  const ghosts = Object.keys(E.REGIONS).filter((id) => !graph.regions.some((region) => region.id === id) && !offline.includes(id));
  const openRegion = graph.regions.find((region) => region.id === open);
  const card = (() => {
    if (!openRegion) return null;
    const pin = pinOf[openRegion.id]; const list = rows[openRegion.id]; const h = cardHeight(list.length) + 18;
    const left = pin.x + 16 + CARD_W > W - 4 ? pin.x - 16 - CARD_W : pin.x + 16;
    return { region: openRegion, list, h, left: Math.max(4, left), top: Math.max(4, Math.min(H - h - 4, pin.y - 24)) };
  })();

  return (
    <div
      className="infra-canvas world-map-wrap" data-testid="world-map" aria-label={label} ref={wrap}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
    >
      <div className="world-stage" style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="world-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <defs>
            <marker id="map-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0.8L8 4.5L0 8.2z" className="map-arrowhead" /></marker>
            <marker id="map-arrow-live" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0.8L8 4.5L0 8.2z" className="map-arrowhead live" /></marker>
          </defs>
          {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => { const p = project(0, lon); return <line key={lon} x1={p.x} x2={p.x} y1={0} y2={H} className="world-grid" />; })}
          {[60, 30, 0, -30].map((lat) => { const p = project(lat, 0); return <line key={lat} y1={p.y} y2={p.y} x1={0} x2={W} className="world-grid" />; })}
          <path d={landPath} className="world-land" />
          {drawn.map(({ arc, c }) => (
            <g key={arc.id}>
              <path d={c.d} className={`map-arc arc-${arc.kind} ${arc.rate > 0 ? 'edge-live' : ''} ${arc.active ? 'edge-active' : ''}`} fill="none" markerEnd={arc.rate > 0 || arc.active ? 'url(#map-arrow-live)' : 'url(#map-arrow)'} />
              {motion && Array.from({ length: dots(arc.rate, arc.active) }, (_, i) => (
                <circle key={i} r={arc.active ? 4.5 : 3} className={`edge-particle edge-particle-${arc.kind}`}>
                  <animateMotion dur="3s" begin={`${-i * 3 / dots(arc.rate, arc.active)}s`} repeatCount="indefinite" path={c.d} />
                </circle>
              ))}
            </g>
          ))}
        </svg>
        {drawn.map(({ arc, text, box }) => <div key={arc.id} className={`map-arc-label ${arc.active ? 'active' : ''}`} style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>{text}</div>)}
        {userPins.map((pin) => { const l = labelOf[pin.id]; return (
          <div key={pin.id} className="map-user" style={{ left: pin.x, top: pin.y }} data-node-key={pin.node.key}>
            <i aria-hidden="true">☺</i><span style={{ left: l.dx, top: l.dy }}>{pin.text}</span>
          </div>
        ); })}
        {ghosts.map((id) => { const spot = project(E.REGIONS[id].lat, E.REGIONS[id].lon); return editable ? (
          <button key={id} type="button" className="map-ghost" style={{ left: spot.x, top: spot.y }} aria-label={`Add region ${E.REGIONS[id].code}`} title={`Add ${E.REGIONS[id].code} (${E.REGIONS[id].city})`} onClick={() => onToggleRegion?.(id)}><i /><span>+ {E.REGIONS[id].city}</span></button>
        ) : <div key={id} className="map-ghost passive" style={{ left: spot.x, top: spot.y }} title={`${E.REGIONS[id].code} is not in this deployment`}><i /></div>; })}
        {offlinePins.map((pin) => (
          <button key={pin.id} type="button" className="map-pin-region offline" style={{ left: pin.x, top: pin.y }} aria-label={`Bring ${E.REGIONS[pin.id].code} back online`} onClick={() => onToggleOffline?.(pin.id)}>
            <i /><span style={{ left: labelOf[pin.id].dx, top: labelOf[pin.id].dy }}>✕ {pin.text} · bring back</span>
          </button>
        ))}
        {regionPins.map((pin) => (
          <button
            key={pin.id} type="button" data-region={pin.id}
            className={`map-pin-region ${pin.level ? `heat-${pin.level}` : ''} ${open === pin.id ? 'open' : ''}`}
            style={{ left: pin.x, top: pin.y }} aria-expanded={open === pin.id} aria-label={`${pin.region.code} ${pin.region.city}`}
            onClick={() => setOpen(open === pin.id ? null : pin.id)}
            onDragEnter={editable ? () => setOpen(pin.id) : undefined}
            onDragOver={editable ? (event) => event.preventDefault() : undefined}
            onDrop={editable ? (event) => { event.preventDefault(); const payload = dragState.current; endDrag(); if (payload) onDropOnRegion?.(pin.region, payload); } : undefined}
          >
            <i /><span style={{ left: labelOf[pin.id].dx, top: labelOf[pin.id].dy }}><strong>{pin.region.code}</strong>{pin.worst ? ` ${Math.round(pin.worst.rho * 100)}%` : ''}</span>
          </button>
        ))}
        {card && (
          <section
            className="map-region" data-region={card.region.id} aria-label={`${card.region.code} ${card.region.city} details`}
            style={{ left: card.left, top: card.top, width: CARD_W, minHeight: card.h }}
            onDragOver={editable ? (event) => event.preventDefault() : undefined}
            onDrop={editable ? (event) => { event.preventDefault(); const payload = dragState.current; endDrag(); if (payload) onDropOnRegion?.(card.region, payload); } : undefined}
          >
            <header><strong>{card.region.code}</strong><span>{card.region.city}</span>
              {onToggleOffline && <button type="button" className="text-button" aria-label={`Take ${card.region.code} offline`} onClick={() => onToggleOffline(card.region.id)}>Take offline</button>}
              {editable && <button type="button" className="chip-remove" aria-label={`Remove region ${card.region.code}`} onClick={() => onToggleRegion?.(card.region.id)}>×</button>}
              <button type="button" className="text-button" aria-label="Close region details" onClick={() => setOpen(null)}>Close</button>
            </header>
            {graph.nodes.some((node) => node.region === card.region.id && (node.kind === 'nat' || node.kind === 'endpoints')) && <small className="map-nets">{graph.nodes.filter((node) => node.region === card.region.id && (node.kind === 'nat' || node.kind === 'endpoints')).map((node) => node.name).join(' · ')}</small>}
            {card.list.length === 0 && <p className="muted">{editable ? 'Drop compute or a store here' : 'Nothing here yet'}</p>}
            {card.list.map((gnode) => <MapRow key={gnode.key} gnode={gnode} ctx={ctx} />)}
          </section>
        )}
      </div>
      <div className="map-controls" role="group" aria-label="Map zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.3)}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.3)}>−</button>
        <button type="button" aria-label="Fit map" onClick={() => { touched.current = false; fit(); }}>Fit</button>
      </div>
    </div>
  );
}
