import React, { useEffect, useMemo, useRef, useState } from 'react';
import { dragState, endDrag, startDrag, HEAT_WORDS, resourceFor } from './infra-canvas.jsx';

const E = window.Loadbearing;

const W = 1100, H = 640;
const project = (lat, lon) => ({ x: 40 + ((lon + 170) / 350) * (W - 80), y: 40 + ((72 - lat) / 120) * (H - 80) });
const CARD_W = 244, ROW = 38, HEAD = 40;
const KIND_ICON = { compute: '⚙', store: '▤', entry: '⇥', nat: '⇄', endpoints: '⌁', external: '☁' };

// Rough, stylised outlines (lon, lat). They only orient the learner; they are not survey data.
const LAND = [
  [[-168, 66], [-140, 70], [-95, 72], [-80, 68], [-62, 60], [-55, 52], [-66, 45], [-76, 38], [-81, 31], [-80, 25], [-90, 29], [-97, 26], [-97, 20], [-90, 15], [-80, 8], [-85, 10], [-105, 20], [-118, 32], [-125, 42], [-124, 49], [-140, 60]],
  [[-55, 60], [-30, 68], [-20, 80], [-60, 80], [-72, 76]],
  [[-78, 8], [-62, 11], [-50, 0], [-35, -6], [-40, -22], [-48, -27], [-58, -38], [-65, -45], [-70, -54], [-75, -48], [-73, -37], [-71, -18], [-80, -6], [-80, 0]],
  [[-10, 36], [-9, 43], [-2, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [30, 70], [40, 67], [40, 56], [30, 46], [28, 41], [22, 37], [12, 38], [3, 43], [-5, 36]],
  [[-10, 52], [-6, 58], [-2, 58], [1, 53], [-5, 50]],
  [[-17, 21], [-10, 35], [10, 37], [32, 31], [34, 27], [43, 12], [51, 12], [40, -5], [40, -15], [35, -25], [20, -35], [12, -18], [9, -1], [-8, 4], [-17, 14]],
  [[40, 56], [60, 70], [100, 77], [140, 72], [170, 66], [160, 55], [142, 46], [130, 35], [122, 30], [121, 22], [108, 18], [104, 9], [100, 2], [98, 10], [92, 22], [80, 14], [77, 8], [73, 20], [67, 25], [57, 25], [50, 30], [56, 17], [44, 12], [35, 28], [36, 36], [28, 41], [30, 46]],
  [[130, 31], [135, 34], [140, 36], [142, 40], [142, 45], [140, 41], [136, 36], [131, 34]],
  [[114, -22], [130, -12], [142, -11], [153, -26], [146, -39], [135, -35], [115, -34]]
];

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

function cardHeight(count) { return HEAD + Math.max(1, count) * ROW + 10; }

// Put each region card near its real location, then nudge overlapping cards apart. Deterministic.
function placeCards(items) {
  const cards = items.map((item) => ({ ...item, ...project(item.lat, item.lon) }));
  cards.forEach((card) => { card.px = card.x; card.py = card.y; card.x = card.px - CARD_W / 2; card.y = card.py - card.h / 2; });
  for (let pass = 0; pass < 240; pass += 1) {
    let moved = false;
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i], b = cards[j];
        const dx = (a.x + CARD_W / 2) - (b.x + CARD_W / 2), dy = (a.y + a.h / 2) - (b.y + b.h / 2);
        const ox = CARD_W + 14 - Math.abs(dx), oy = (a.h + b.h) / 2 + 14 - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          moved = true;
          if (ox < oy) { const s = (dx >= 0 ? 1 : -1) * (ox / 2 + 1); a.x += s; b.x -= s; }
          else { const s = (dy >= 0 ? 1 : -1) * (oy / 2 + 1); a.y += s; b.y -= s; }
        }
      }
    }
    cards.forEach((card) => { card.x = Math.max(8, Math.min(W - CARD_W - 8, card.x)); card.y = Math.max(8, Math.min(H - card.h - 8, card.y)); });
    if (!moved) break;
  }
  return cards;
}

function arc(a, b, bend) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / len) * bend, cy = my + (dx / len) * bend - Math.min(80, len * 0.12);
  return { d: `M${a.x} ${a.y} Q${cx} ${cy} ${b.x} ${b.y}`, lx: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, ly: 0.25 * a.y + 0.5 * cy + 0.25 * b.y };
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

// Regions at their real-world positions with their components grouped inside, joined by arcs that carry traffic and latency.
export function WorldMap({
  graph, deploy, build, states, traffic, trace, motion, editable, selectedKey, onSelect, problemsByNode,
  onDropOnNode, onDropOnRegion, onToggleRegion, offline = [], onToggleOffline, label
}) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(0.7);
  useEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const fit = () => setScale(Math.max(0.3, Math.min(el.clientWidth / W, el.clientHeight / H, 1.6)));
    fit();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(fit); observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => {
    const byRegion = {};
    graph.regions.forEach((region) => { byRegion[region.id] = graph.nodes.filter((node) => node.region === region.id && node.kind !== 'nat' && node.kind !== 'endpoints'); });
    return byRegion;
  }, [graph]);
  const cards = useMemo(() => placeCards(graph.regions.map((region) => ({ region, lat: E.REGIONS[region.id].lat, lon: E.REGIONS[region.id].lon, h: cardHeight(rows[region.id].length) }))), [graph, rows]);
  const cardOf = useMemo(() => Object.fromEntries(cards.map((card) => [card.region.id, card])), [cards]);
  const ghosts = Object.keys(E.REGIONS).filter((id) => !graph.regions.some((region) => region.id === id));
  const activeNodes = useMemo(() => new Set(trace?.nodes || []), [trace]);
  const ctx = { deploy, build, states, editable, selectedKey, onSelect, problemsByNode, onDropOnNode, activeNodes };

  const pins = graph.nodes.filter((node) => node.kind === 'user').map((node, index) => {
    const pop = node.key.slice(2); const spot = project(E.POPS[pop].lat, E.POPS[pop].lon);
    return { node, pop, x: spot.x, y: H - 22 - (index % 2) * 26 };
  });
  const links = useMemo(() => {
    const out = {};
    graph.edges.forEach((edge) => {
      const a = graph.byKey[edge.from], b = graph.byKey[edge.to]; if (!a || !b) return;
      const rate = traffic?.[edge.id] || 0;
      if (a.kind === 'user') {
        const id = `${a.key}>${b.region}`; const o = out[id] = out[id] || { id, kind: 'user', from: a.key, region: b.region, rate: 0, active: false, label: 'users' };
        o.rate += rate; o.active = o.active || !!trace?.edges?.has(edge.id);
      } else if (a.region !== b.region && cardOf[a.region] && cardOf[b.region]) {
        const id = `${a.region}>${b.region}`; const o = out[id] = out[id] || { id, kind: edge.kind, from: a.region, to: b.region, rate: 0, active: false, verbs: new Set() };
        o.rate += rate; o.active = o.active || !!trace?.edges?.has(edge.id); o.verbs.add(edge.label || edge.kind);
      }
    });
    return Object.values(out);
  }, [graph, traffic, trace, cardOf]);

  const drawn = links.map((link, index) => {
    let start, end, ms;
    if (link.kind === 'user') {
      const pin = pins.find((item) => item.node.key === link.from); const card = cardOf[link.region]; if (!pin || !card) return null;
      start = { x: pin.x, y: pin.y }; end = { x: card.x + CARD_W / 2, y: card.y + card.h / 2 }; ms = E.popRtt(pin.pop, link.region);
    } else {
      const a = cardOf[link.from], b = cardOf[link.to];
      start = { x: a.x + CARD_W / 2, y: a.y + a.h / 2 }; end = { x: b.x + CARD_W / 2, y: b.y + b.h / 2 }; ms = E.rtt(link.from, link.to);
    }
    const curve = arc(start, end, 40 + (index % 3) * 24);
    const text = `${link.rate > 0 ? `${E.fmtN(link.rate)}/s · ` : ''}${ms} ms round trip`;
    return { link, curve, text, ms };
  }).filter(Boolean);

  const dots = (rate, active) => (active ? 3 : rate > 0 ? Math.min(4, 1 + Math.floor(Math.log10(rate + 1))) : 0);

  return (
    <div className="infra-canvas world-map-wrap" data-testid="world-map" aria-label={label} ref={wrap}>
      <div className="world-stage" style={{ width: W, height: H, transform: `scale(${scale})` }}>
        <svg className="world-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {[-120, -60, 0, 60, 120].map((lon) => { const p = project(0, lon); return <line key={lon} x1={p.x} x2={p.x} y1={0} y2={H} className="world-grid" />; })}
          {[60, 30, 0, -30].map((lat) => { const p = project(lat, 0); return <line key={lat} y1={p.y} y2={p.y} x1={0} x2={W} className="world-grid" />; })}
          {LAND.map((poly, index) => <polygon key={index} className="world-land" points={poly.map(([lon, lat]) => { const p = project(lat, lon); return `${p.x},${p.y}`; }).join(' ')} />)}
          {cards.map((card) => <g key={card.region.id}><line className="world-leader" x1={card.px} y1={card.py} x2={card.x + CARD_W / 2} y2={card.y + card.h / 2} /><circle className="world-dot" cx={card.px} cy={card.py} r={4} /></g>)}
          {drawn.map(({ link, curve }) => (
            <g key={link.id}>
              <path id={`arc-${link.id}`} d={curve.d} className={`map-arc arc-${link.kind} ${link.rate > 0 ? 'edge-live' : ''} ${link.active ? 'edge-active' : ''}`} fill="none" />
              {motion && Array.from({ length: dots(link.rate, link.active) }, (_, i) => (
                <circle key={i} r={link.active ? 5 : 3.4} className={`edge-particle edge-particle-${link.kind}`}>
                  <animateMotion dur="3s" begin={`${-i * 3 / dots(link.rate, link.active)}s`} repeatCount="indefinite" path={curve.d} />
                </circle>
              ))}
            </g>
          ))}
        </svg>
        {drawn.map(({ link, curve, text }) => <div key={link.id} className={`map-arc-label ${link.active ? 'active' : ''}`} style={{ left: curve.lx, top: curve.ly }}>{text}</div>)}
        {pins.map((pin) => (
          <div key={pin.node.key} className="map-pin" style={{ left: pin.x, top: pin.y }} data-node-key={pin.node.key}><span aria-hidden="true">☺</span>{pin.node.name}</div>
        ))}
        {cards.map((card) => {
          const region = card.region; const list = rows[region.id];
          const nets = graph.nodes.filter((node) => node.region === region.id && (node.kind === 'nat' || node.kind === 'endpoints')).map((node) => node.name);
          return (
            <section
              key={region.id} className="map-region" data-region={region.id} aria-label={`${region.code} ${region.city}`}
              style={{ left: card.x, top: card.y, width: CARD_W, height: card.h }}
              onDragOver={editable ? (event) => event.preventDefault() : undefined}
              onDrop={editable ? (event) => { event.preventDefault(); const payload = dragState.current; endDrag(); if (payload) onDropOnRegion?.(region, payload); } : undefined}
            >
              <header><strong>{region.code}</strong><span>{region.city}</span>
                {editable && <button type="button" className="chip-remove" aria-label={`Remove region ${region.code}`} onClick={() => onToggleRegion?.(region.id)}>×</button>}
                {onToggleOffline && <button type="button" className="text-button" aria-label={`Take ${region.code} offline`} onClick={() => onToggleOffline(region.id)}>Take offline</button>}
              </header>
              {nets.length > 0 && <small className="map-nets">{nets.join(' · ')}</small>}
              {list.length === 0 && <p className="muted">{editable ? 'Drop compute or a store here' : 'Nothing here yet'}</p>}
              {list.map((gnode) => <MapRow key={gnode.key} gnode={gnode} ctx={ctx} />)}
            </section>
          );
        })}
        {offline.map((id) => { const spot = project(E.REGIONS[id].lat, E.REGIONS[id].lon); return (
          <div key={id} className="map-ghost offline" style={{ left: spot.x, top: spot.y }}>
            <strong>{E.REGIONS[id].code}</strong> is offline
            <button type="button" className="text-button" aria-label={`Bring ${E.REGIONS[id].code} back online`} onClick={() => onToggleOffline?.(id)}>Bring back</button>
          </div>
        ); })}
        {editable && ghosts.filter((id) => !offline.includes(id)).map((id) => { const spot = project(E.REGIONS[id].lat, E.REGIONS[id].lon); return (
          <button key={id} type="button" className="map-ghost" style={{ left: spot.x, top: spot.y }} aria-label={`Add region ${E.REGIONS[id].code}`} onClick={() => onToggleRegion?.(id)}>+ {E.REGIONS[id].city}</button>
        ); })}
      </div>
    </div>
  );
}
