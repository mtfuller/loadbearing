/* ===================== Deploy mode ===================== */
const CICON = { k8s: IC.k8s, vm: IC.vm, fn: IC.fn, ctr: IC.ctr };
const SICON = { postgres: IC.db, distsql: IC.db, kv: IC.kv, doc: IC.db, redis: IC.bolt, kafka: IC.stream, queue: IC.queue, pubsub: IC.topic, objects: IC.blob };
function sortedRegions() { return ST.deploy.regions.slice().sort((a, b) => REGIONS[a].lon - REGIONS[b].lon); }
function storeRole(S, r) {
  if (S.repl === 'single') return '';
  if (S.repl === 'multi-primary') return 'writable';
  if (S.repl === 'consensus') return r === S.primary ? 'leader' : 'voter';
  return r === S.primary ? 'primary' : (S.repl === 'crr' ? 'copy' : 'read copy');
}
function heatTag(rho) { if (rho == null) return ''; const c = rho >= 1 ? 'var(--bad)' : rho >= 0.75 ? 'var(--warn)' : 'var(--good)'; return `<span class="heat" style="color:${c};border-color:${c}">${Math.round(rho * 100)}%</span>`; }

/* ---------- shared infra board (Deploy and Simulate) ----------
   Regions are big boxes laid out by CSS grid. Inside each: an entry tier (load balancer
   or API gateway), the private network (compute + private stores, NAT and endpoints on
   its edge) and managed services. Wires are drawn after layout by measuring boxes. */
const isPrivC = c => COMPUTE[c.type].net === 'vpc' || !!c.vpc;
function boxMeta(kind, o, r) {
  if (kind === 'c') return o.type === 'fn' ? `${fmtInt(o.concurrency || 1000)} at once · ${o.memory || 1024} MB${o.vpc ? ' · in private network' : ''}` : `${o.size} · ${o.min}–${o.max} ${o.type === 'k8s' ? 'pods' : 'instances'}`;
  const T = STORES[o.type]; const bits = [];
  const role = storeRole(o, r); if (role) bits.push(role);
  if (T.usd && T.cap) bits.push(o.size);
  if (T.partitions) bits.push(`${o.partitions || 12} partitions`);
  if (T.shards && shardCount(o) > 1) bits.push(`${shardCount(o)} shards`);
  if (T.autoShard) bits.push('auto-partitioned');
  return bits.join(' · ') || T.label;
}
function boxHTML(kind, o, r, opt) {
  const key = (kind === 'c' ? 'c:' : 's:') + o.id + '@' + r;
  const sel = ST.dSel && ST.dSel.t === kind && ST.dSel.id === o.id;
  const items = kind === 'c' ? o.workloads : o.data;
  const icon = kind === 'c' ? CICON[o.type] : SICON[o.type]; const fg = kind === 'c' ? 'var(--wl)' : 'var(--data)'; const bg = kind === 'c' ? 'var(--wl-soft)' : 'var(--data-soft)';
  const st = opt.heat && opt.heat[key]; const drag = !opt.static;
  const chips = items.map(n => { let warnC = ''; if (kind === 's' && A.D[n]) { const F = storeFit(o.type, A.D[n].kind); if (F.fit === 'works') warnC = ' title="' + esc(F.note) + '" style="box-shadow:inset 0 0 0 1px var(--warn)"'; } return `<span class="chip"${drag ? ` draggable="true" data-drag="${kind === 'c' ? 'w' : 'd'}:${esc(n)}"` : ''}${warnC}>${esc(n)}</span>`; }).join('');
  return `<div class="bx ${sel ? 'sel' : ''}" role="button" tabindex="0" data-box="${key}" data-act="${opt.static ? 'noop' : 'd-sel'}" data-t="${kind}" data-id="${o.id}" ${drag ? `data-drop="${kind}:${o.id}"` : ''} data-fb="${kind === 'c' ? 'Compute' : 'Store'} ${esc(o.name)}" style="${kind === 's' && (['kafka', 'queue', 'pubsub', 'objects'].includes(o.type)) ? 'border-radius:16px' : ''}">
    <div class="hd"><span class="ico" style="width:22px;height:22px;background:${bg}">${svg(icon, 13, fg)}</span><span class="t">${esc(o.name)}</span><span class="heat" ${st ? '' : 'hidden'}>${st ? Math.round(st.rho * 100) + '%' : ''}</span></div>
    <div class="meta">${esc(kind === 'c' ? COMPUTE[o.type].short : STORES[o.type].label.split(' (')[0])} · <span class="live">${esc(boxMeta(kind, o, r))}</span></div>
    <div class="chips">${chips || `<span class="muted" style="font-size:11.5px">${drag ? (kind === 'c' ? 'Drop workloads here' : 'Drop data here') : 'Empty'}</span>`}</div></div>`;
}
function infraDiagram(opt) {
  opt = opt || {}; const Dp = ST.deploy; normalizeDeploy(Dp); const regs = sortedRegions(); const SEL = opt.static ? 'noop' : 'd-sel';
  const exts = ST.build.workloads.filter(w => w.external);
  const pops = {}; ST.build.scenarios.forEach(sc => Object.keys(sc.origins || {}).forEach(p => { if (sc.origins[p] > 0) pops[p] = 1; }));
  const N = Dp.network;
  const band = `<div class="band" data-fb="Users and traffic steering"><span class="lbl">Users</span>${Object.keys(pops).map(p => `<span class="nb" data-box="u:${p}">${svg(IC.users, 13, 'var(--accent)')}${esc(POPS[p].label)}</span>`).join('') || '<span class="muted">Scenarios set where users are.</span>'}<span style="flex:1"></span><button type="button" class="nb" data-act="${SEL}" data-t="net" data-id="net">${svg(IC.route, 13, 'var(--accent)')}DNS: ${esc(NET.steering[N.steering].label.toLowerCase())}</button><button type="button" class="nb ${Dp.peering ? '' : 'off'}" data-act="${SEL}" data-t="net" data-id="net">${svg(IC.globe, 13, Dp.peering ? 'var(--accent)' : 'var(--muted)')}${Dp.peering ? NET.link[N.link].label : 'Region networks not connected'}</button></div>`;
  const regHTML = regs.map(r => {
    const NR = netRegion(Dp, r); const rsel = ST.dSel && ST.dSel.t === 'r' && ST.dSel.id === r;
    const comps = Dp.compute.filter(c => c.regions.includes(r)); const stores = Dp.stores.filter(s => s.regions.includes(r));
    const privC = comps.filter(isPrivC), pubC = comps.filter(c => !isPrivC(c));
    const privS = stores.filter(s => STORES[s.type].net === 'vpc'), pubS = stores.filter(s => STORES[s.type].net !== 'vpc');
    const eh = opt.heat && opt.heat['g:' + r];
    const entry = `<div class="tier"><div class="bx-row" style="align-items:center"><button type="button" class="nb ${NR.entry === 'none' ? 'off' : ''}" data-box="e:${r}" data-act="${SEL}" data-t="r" data-id="${r}" data-fb="Entry ${REGIONS[r].code}">${svg(NR.entry === 'apigw' ? IC.shield : IC.split, 13, NR.entry === 'none' ? 'var(--muted)' : 'var(--accent)')}${NET.entry[NR.entry].label}${NR.entry === 'apigw' ? ` · ${fmtInt(NR.limit)}/s limit` : ''}<span class="heat" ${eh ? '' : 'hidden'}>${eh ? Math.round(eh.rho * 100) + '%' : ''}</span></button><span class="muted" style="font-size:11.5px">${NR.entry === 'none' ? 'Users can’t reach private compute here' : 'Public entry'}</span></div></div>`;
    const nh = opt.heat && opt.heat['n:' + r];
    const vpc = `<div class="vpc" data-fb="Private network ${REGIONS[r].code}"><div class="vpc-l">${svg(IC.lock, 12, 'var(--accent)')}Private network</div>
      <div class="bx-row">${privC.map(c => boxHTML('c', c, r, opt)).join('') || `<span class="muted" style="font-size:12px">No private compute</span>`}</div>
      ${privS.length ? `<div class="bx-row">${privS.map(s => boxHTML('s', s, r, opt)).join('')}</div>` : ''}
      <div class="bx-row" style="gap:6px"><button type="button" class="nb ${NR.nat ? '' : 'off'}" data-box="n:${r}" data-act="${SEL}" data-t="r" data-id="${r}">${svg(IC.nat, 13, NR.nat ? 'var(--accent)' : 'var(--muted)')}NAT gateway${NR.nat ? '' : ': off'}<span class="heat" ${nh ? '' : 'hidden'}>${nh ? Math.round(nh.rho * 100) + '%' : ''}</span></button><button type="button" class="nb ${NR.endpoints ? '' : 'off'}" data-act="${SEL}" data-t="r" data-id="${r}">${svg(IC.lock, 13, NR.endpoints ? 'var(--accent)' : 'var(--muted)')}Private endpoints${NR.endpoints ? '' : ': off'}</button></div></div>`;
    const managed = pubC.length + pubS.length ? `<div class="tier"><div class="lbl">Managed services</div><div class="bx-row">${pubC.map(c => boxHTML('c', c, r, opt)).join('')}${pubS.map(s => boxHTML('s', s, r, opt)).join('')}</div></div>` : '';
    return `<section class="region ${rsel ? 'sel' : ''}" data-region="${r}"><header><button type="button" class="link" style="color:var(--ink);display:flex;align-items:center;gap:8px;font-weight:600" data-act="${SEL}" data-t="r" data-id="${r}"><span class="rdot" style="background:var(--accent)"></span>${REGIONS[r].code}<span class="muted" style="font-weight:400">${REGIONS[r].city}</span></button></header>${entry}${vpc}${managed}</section>`;
  }).join('');
  const outside = exts.length ? `<section class="region outside"><header><span class="muted">Outside your system</span></header><div class="bx-row">${exts.map(w => { const er = (Dp.externals && Dp.externals[w.name] && Dp.externals[w.name].region) || 'use1'; const sel = ST.dSel && ST.dSel.t === 'x' && ST.dSel.id === w.name; return `<div class="bx ${sel ? 'sel' : ''}" role="button" tabindex="0" data-box="x:${esc(w.name)}" data-act="${SEL}" data-t="x" data-id="${esc(w.name)}" style="border-style:dashed"><div class="hd"><span class="ico" style="width:22px;height:22px;background:var(--ext-soft)">${svg(IC.ext, 13, 'var(--ext)')}</span><span class="t">${esc(w.name)}</span></div><div class="meta">Hosted near ${REGIONS[er].code}</div></div>`; }).join('')}</div></section>` : '';
  return `<div class="board ${ST.dWrap ? 'wrap' : ''}" data-board="${opt.static ? 'sim' : 'deploy'}">${band}<div class="regions">${regHTML}${outside}</div><svg class="wires" aria-hidden="true"></svg><svg class="wires wtop" aria-hidden="true"></svg></div>
    <div class="legend"><span><i style="border-color:var(--ink-2)"></i>calls</span><span><i style="border-color:var(--read)"></i>reads</span><span><i style="border-color:var(--write)"></i>writes</span><span><i style="border-color:var(--pub)"></i>publishes</span><span><i style="border-color:var(--repl);border-top-style:dashed"></i>copies data</span><span><i style="border-color:var(--bad);border-top-style:dashed"></i>can’t reach</span><span class="muted">${opt.static ? '' : 'Hover or select a box to see its connections. Drag workloads and data between boxes.'}</span></div>`;
}
function boardLines() {
  const Dp = ST.deploy; const lines = []; const seen = new Set();
  const comp = (V && V.comp) || {}, store = (V && V.store) || {};
  const add = (a, b, kind, bad, label) => { const k = a + '|' + b + '|' + kind; if (seen.has(k)) return; seen.add(k); lines.push({ a, b, kind, bad, label }); };
  A.entries.filter(e => e.type === 'request').forEach(e => { const C = comp[e.w]; if (!C) return; C.regions.forEach(r => { if (netRegion(Dp, r).entry !== 'none') add('e:' + r, 'c:' + C.id + '@' + r, 'call', false, ''); }); });
  A.calls.forEach(c => {
    const C1 = comp[c.from]; if (!C1) return; const W2 = A.W[c.to];
    C1.regions.forEach(r => {
      if (W2 && W2.node.external) { const er = (Dp.externals && Dp.externals[c.to] && Dp.externals[c.to].region) || 'use1'; const viaNat = isPrivC(C1) && netRegion(Dp, r).nat; if (viaNat) { add('c:' + C1.id + '@' + r, 'n:' + r, 'call', false, ''); add('n:' + r, 'x:' + c.to, 'call', false, r !== er ? rtt(r, er) + ' ms' : ''); } else add('c:' + C1.id + '@' + r, 'x:' + c.to, 'call', isPrivC(C1), r !== er ? rtt(r, er) + ' ms' : ''); return; }
      const C2 = comp[c.to]; if (!C2 || C2 === C1 && C2.regions.includes(r)) return;
      const r2 = C2.regions.includes(r) ? r : nearestRegion(C2.regions, r); if (!r2) return;
      const bad = (COMPUTE[C2.type].net === 'vpc' && !canUseVpc(C1)) || (r2 !== r && COMPUTE[C2.type].net === 'vpc' && !Dp.peering);
      add('c:' + C1.id + '@' + r, 'c:' + C2.id + '@' + r2, 'call', bad, r2 !== r ? rtt(r, r2) + ' ms' : '');
    });
  });
  const dataLine = (wn, dn, ops) => {
    const C = comp[wn], S = store[dn]; if (!C || !S) return;
    C.regions.forEach(r => ops.forEach(op => { const t = storeTarget(S, op, r); if (!t) return; const bad = (STORES[S.type].net === 'vpc' && !canUseVpc(C)) || (t !== r && STORES[S.type].net === 'vpc' && !Dp.peering); add('c:' + C.id + '@' + r, 's:' + S.id + '@' + t, op === 'read' ? 'read' : op === 'publish' ? 'pub' : 'write', bad, t !== r ? rtt(r, t) + ' ms' : ''); }));
  };
  A.dataOps.forEach(o => dataLine(o.w, o.d, o.ops.map(x => x === 'publish' ? 'publish' : x === 'read' ? 'read' : 'insert').filter((x, i, a) => a.indexOf(x) === i)));
  A.triggers.forEach(t => { const C = comp[t.w], S = store[t.d]; if (!C || !S) return; C.regions.forEach(r => { const t2 = storeTarget(S, 'read', r); if (t2) add('s:' + S.id + '@' + t2, 'c:' + C.id + '@' + r, 'pub', false, t2 !== r ? rtt(r, t2) + ' ms' : ''); }); });
  Dp.stores.forEach(s => { if (s.repl === 'single' || s.regions.length < 2) return; const p = s.regions.includes(s.primary) ? s.primary : s.regions[0]; s.regions.forEach(r => { if (r !== p) add('s:' + s.id + '@' + p, 's:' + s.id + '@' + r, 'repl', false, REPL[s.repl].short); }); });
  return lines;
}
const WCOL = { call: 'var(--ink-2)', read: 'var(--read)', write: 'var(--write)', pub: 'var(--pub)', repl: 'var(--repl)', deliver: 'var(--pub)' };
function boxRects(board) {
  const o = board.getBoundingClientRect(); const R = {};
  board.querySelectorAll('[data-box]').forEach(el => { const r = el.getBoundingClientRect(); if (!r.width) return; R[el.dataset.box] = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; });
  return R;
}
function wirePath(A1, B1) {
  const ac = [A1.x + A1.w / 2, A1.y + A1.h / 2], bc = [B1.x + B1.w / 2, B1.y + B1.h / 2]; const dx = bc[0] - ac[0], dy = bc[1] - ac[1];
  if (Math.abs(dy) > Math.abs(dx) * 0.8) { const down = dy > 0; const y1 = down ? A1.y + A1.h : A1.y, y2 = down ? B1.y : B1.y + B1.h; const k = Math.max(20, Math.abs(y2 - y1) * 0.45) * (down ? 1 : -1); return [`M${ac[0]} ${y1} C${ac[0]} ${y1 + k} ${bc[0]} ${y2 - k} ${bc[0]} ${y2}`, [(ac[0] + bc[0]) / 2, (y1 + y2) / 2]]; }
  const right = dx > 0; const x1 = right ? A1.x + A1.w : A1.x, x2 = right ? B1.x : B1.x + B1.w; const k = Math.max(24, Math.abs(x2 - x1) * 0.45) * (right ? 1 : -1);
  return [`M${x1} ${ac[1]} C${x1 + k} ${ac[1]} ${x2 - k} ${bc[1]} ${x2} ${bc[1]}`, [(x1 + x2) / 2, (ac[1] + bc[1]) / 2]];
}
function wireBoard(board, focus) {
  if (!board) return; const R = boxRects(board); const lines = board._lines || (board._lines = boardLines());
  const W = board.scrollWidth, H = board.scrollHeight; const svgs = board.querySelectorAll('svg.wires'); if (svgs.length < 2) return;
  const dsel = board.dataset.board === 'deploy' ? ST.dSel : null;
  const sel = focus || (dsel && (dsel.t === 'c' || dsel.t === 's') ? dsel.t + ':' + dsel.id + '@' : dsel && dsel.t === 'x' ? 'x:' + dsel.id : dsel && dsel.t === 'r' ? '@' + dsel.id : null);
  const touches = k => sel && (sel.endsWith('@') ? k.startsWith(sel) : sel.startsWith('@') ? k.endsWith(sel) || k === 'e:' + sel.slice(1) || k === 'n:' + sel.slice(1) : k === sel);
  let paths = '', labs = ''; const labSeen = new Set(); const geo = {};
  const mk = (id, c) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
  lines.forEach(l => {
    const A1 = R[l.a], B1 = R[l.b]; if (!A1 || !B1) return; const [d, m] = wirePath(A1, B1); geo[l.a + '|' + l.b] = d;
    const on = touches(l.a) || touches(l.b); const dim = sel && !on; const c = l.bad ? 'var(--bad)' : WCOL[l.kind];
    const cross = (l.a.split('@')[1] || 'x') !== (l.b.split('@')[1] || 'x'); const busy = lines.length > 14;
    paths += `<path d="${d}" fill="none" stroke="${c}" stroke-width="${l.bad ? 2 : on ? 2 : 1.2}" ${l.bad || l.kind === 'repl' ? 'stroke-dasharray="6 4"' : ''} opacity="${l.bad ? 1 : dim ? .1 : on ? .95 : busy ? (cross ? .4 : .2) : .45}" marker-end="url(#wm-${l.bad ? 'bad' : l.kind})"/>`;
    const t = l.bad ? 'can’t reach' : l.label; if (!t || (dim && !l.bad) || (!on && !l.bad && sel)) return;
    const lk = l.bad ? l.a + l.b : t + '|' + [(l.a.split('@')[1] || l.a), (l.b.split('@')[1] || l.b)].sort().join('-'); if (labSeen.has(lk)) return; labSeen.add(lk);
    labs += `<g><rect x="${m[0] - t.length * 3.1 - 5}" y="${m[1] - 8}" width="${t.length * 6.2 + 10}" height="16" rx="8" fill="var(--surface)" stroke="${c}" stroke-width=".8"/><text x="${m[0]}" y="${m[1] + 3.5}" text-anchor="middle" font-size="10.5" fill="${c}" font-family="var(--font)">${esc(t)}</text></g>`;
  });
  svgs[0].setAttribute('width', W); svgs[0].setAttribute('height', H); svgs[1].setAttribute('width', W); svgs[1].setAttribute('height', H);
  svgs[0].innerHTML = `<defs>${Object.keys(WCOL).map(k => mk('wm-' + k, WCOL[k])).join('')}${mk('wm-bad', 'var(--bad)')}</defs>${paths}`;
  svgs[1].innerHTML = labs + (svgs[1]._parts || '');
  board.querySelectorAll('.bx, .nb[data-box]').forEach(el => el.classList.toggle('dim', !!sel && !touches(el.dataset.box) && !lines.some(l => (touches(l.a) && l.b === el.dataset.box) || (touches(l.b) && l.a === el.dataset.box))));
  board._R = R; board._geo = geo;
}
function wireAll() { document.querySelectorAll('.board').forEach(b => { b._lines = null; wireBoard(b); }); }
let wireRaf = 0; window.addEventListener('resize', () => { cancelAnimationFrame(wireRaf); wireRaf = requestAnimationFrame(wireAll); });
document.addEventListener('mouseover', ev => { const b = ev.target.closest && ev.target.closest('.board'); if (!b) return; const bx = ev.target.closest('[data-box]'); const k = bx ? bx.dataset.box : null; if (b._hover === k) return; b._hover = k; if (b._live) return; wireBoard(b, k && !k.startsWith('u:') ? k : null); });
document.addEventListener('mouseout', ev => { const b = ev.target.closest && ev.target.closest('.board'); if (!b || (ev.relatedTarget && b.contains(ev.relatedTarget))) return; b._hover = null; if (!b._live) wireBoard(b); });
/* drag and drop placement */
let DRAG = null;
document.addEventListener('dragstart', ev => { const el = ev.target.closest && ev.target.closest('[data-drag]'); if (!el) return; const [t, ...n] = el.dataset.drag.split(':'); DRAG = { t, name: n.join(':') }; try { ev.dataTransfer.setData('text/plain', el.dataset.drag); ev.dataTransfer.effectAllowed = 'move'; } catch (e) { } document.body.classList.add('dragging'); });
document.addEventListener('dragend', () => { DRAG = null; document.body.classList.remove('dragging'); document.querySelectorAll('.dropok,.dropno').forEach(e => e.classList.remove('dropok', 'dropno')); });
function dropFit(el) { if (!DRAG) return null; const [k, id] = el.dataset.drop.split(':'); if (DRAG.t === 'w') return k === 'c' ? { ok: true } : { ok: false }; if (k !== 's') return { ok: false }; const s = ST.deploy.stores.find(x => x.id === id); const d = A.D[DRAG.name]; if (!s || !d) return { ok: false }; const F = storeFit(s.type, d.kind); return { ok: F.fit !== 'no', note: F.note, s }; }
document.addEventListener('dragover', ev => { const el = ev.target.closest && ev.target.closest('[data-drop]'); if (!el || !DRAG) return; const f = dropFit(el); document.querySelectorAll('.dropok,.dropno').forEach(e => { if (e !== el) e.classList.remove('dropok', 'dropno'); }); el.classList.toggle('dropok', f.ok); el.classList.toggle('dropno', !f.ok); if (f.ok) { ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch (e) { } } });
document.addEventListener('drop', ev => {
  const el = ev.target.closest && ev.target.closest('[data-drop]'); if (!el || !DRAG) return; ev.preventDefault(); const f = dropFit(el); const d0 = DRAG; DRAG = null; if (!f || !f.ok) return;
  const [k, id] = el.dataset.drop.split(':');
  if (d0.t === 'w') { const c = ST.deploy.compute.find(x => x.id === id); if (c.workloads.includes(d0.name)) return; commit((b, d) => { d.compute.forEach(x => x.workloads = x.workloads.filter(w => w !== d0.name)); d.compute.find(x => x.id === id).workloads.push(d0.name); }); toast(`${d0.name} now runs on ${c.name}`, { label: 'Undo', fn: undo }); }
  else { const s = ST.deploy.stores.find(x => x.id === id); if (s.data.includes(d0.name)) return; commit((b, d) => { d.stores.forEach(x => x.data = x.data.filter(n => n !== d0.name)); d.stores.find(x => x.id === id).data.push(d0.name); }); toast(f.note ? `${d0.name} moved to ${s.name}. It works, but: ${f.note}` : `${d0.name} is now stored in ${s.name}`, { label: 'Undo', fn: undo }); }
});

/* shared world map */
function worldMap(opt) {
  opt = opt || {}; const Dp = ST.deploy; const res = opt.res;
  let g = '';
  // replication arcs
  Dp.stores.forEach(s => { if (s.repl === 'single' || s.regions.length < 2) return; const p = s.regions.includes(s.primary) ? s.primary : s.regions[0]; s.regions.forEach(r => { if (r !== p) g += `<path d="${arcPath(regionXY(p), regionXY(r), 0.18)}" fill="none" stroke="var(--repl)" stroke-width="1.4" stroke-dasharray="5 4" opacity=".7"/>`; }); });
  if (res && res.mode === 'rate') {
    const mx = Math.max(1, ...Object.values(res.flows)); Object.entries(res.flows).forEach(([k, v]) => { const [a, b] = k.split('>'); g += `<path d="${arcPath(regionXY(a), regionXY(b), 0.28)}" fill="none" stroke="var(--write)" stroke-width="${(1 + 4 * v / mx).toFixed(1)}" opacity=".75"/>`; });
    res.origins.forEach(o => { if (!o.pop || !o.region) return; const P = popXY(o.pop), R = regionXY(o.region); g += `<path d="${arcPath(P, R, 0.1)}" fill="none" stroke="var(--accent)" stroke-width="${(1 + 6 * o.share).toFixed(1)}" opacity=".5"/><circle cx="${P[0]}" cy="${P[1]}" r="${(6 + 22 * Math.sqrt(o.share)).toFixed(1)}" fill="var(--accent)" fill-opacity=".14" stroke="var(--accent)" stroke-width="1"/><text x="${P[0]}" y="${P[1] + 4}" text-anchor="middle" style="font-weight:600;fill:var(--accent-ink)">${Math.round(o.share * 100)}%</text><text x="${P[0]}" y="${P[1] - 12 - 22 * Math.sqrt(o.share)}" text-anchor="middle" style="font-weight:500">${esc(POPS[o.pop].label)}</text>`; });
  } else if (!res) {
    const regs = Dp.regions; if (Dp.peering && regs.length > 1) regs.forEach((a, i) => regs.slice(i + 1).forEach(b => { g += `<path d="${arcPath(regionXY(a), regionXY(b), 0.12)}" fill="none" stroke="var(--line-2)" stroke-width="1"/>`; }));
    const seen = new Set();
    A.calls.forEach(c => { const C1 = V && V.comp[c.from], C2 = V && V.comp[c.to]; if (!C1 || !C2 || C1 === C2) return; C1.regions.forEach(r => { if (C2.regions.includes(r)) return; const r2 = nearestRegion(C2.regions, r); const k = r + r2; if (!r2 || seen.has(k)) return; seen.add(k); const m = regionXY(r), n = regionXY(r2); g += `<path d="${arcPath(m, n, 0.3)}" fill="none" stroke="var(--write)" stroke-width="1.8" opacity=".8"/><text x="${(m[0] + n[0]) / 2}" y="${(m[1] + n[1]) / 2 - Math.hypot(n[0] - m[0], n[1] - m[1]) * 0.15 - 4}" text-anchor="middle" style="fill:var(--write)">${rtt(r, r2)} ms</text>`; }); });
  }
  if (opt.route && opt.route.length) opt.route.forEach(([a, b]) => { g += `<path d="${arcPath(regionXY(a), regionXY(b), 0.34)}" fill="none" stroke="var(--bad)" stroke-width="2.6" marker-end="url(#mm-r)"/>`; });
  // regions
  Object.keys(REGIONS).forEach(r => {
    const [x, y] = regionXY(r); const on = Dp.regions.includes(r);
    let heat = null; if (res && res.R) Object.values(res.R).forEach(s => { if (s.region === r && s.type !== 'external') heat = Math.max(heat || 0, s.rho); });
    const fill = !on ? 'var(--surface)' : heat == null ? 'var(--accent)' : heat >= 1 ? 'var(--bad)' : heat >= 0.75 ? 'var(--warn)' : 'var(--good)';
    const items = on && !res && !opt.static ? Dp.compute.filter(c => c.regions.includes(r)).map(c => c.name).concat(Dp.stores.filter(s => s.regions.includes(r)).map(s => s.name)) : [];
    const below = y > 300;
    const lines = items.slice(0, 4).map((n, i) => `<text x="${x}" y="${below ? y - 26 - (items.slice(0, 4).length - 1 - i) * 13 : y + 30 + i * 13}" text-anchor="middle" style="font-size:10.5px;fill:var(--muted)">${esc(n)}</text>`).join('') + (items.length > 4 ? `<text x="${x}" y="${below ? y - 26 - 4 * 13 : y + 30 + 4 * 13}" text-anchor="middle" style="font-size:10.5px;fill:var(--muted)">+${items.length - 4} more</text>` : '');
    g += `<g class="rg" data-act="${opt.static ? 'noop' : 'd-mapregion'}" data-id="${r}" role="button" aria-label="${REGIONS[r].code}${on ? '' : ', not used'}"><circle cx="${x}" cy="${y}" r="${on ? 8 : 5}" fill="${fill}" stroke="${on ? 'var(--surface)' : 'var(--muted)'}" stroke-width="${on ? 2.5 : 1.3}"/>${heat != null && on ? `<text x="${x + 12}" y="${y - 8}" style="font-weight:600;fill:${fill}">${Math.round(heat * 100)}%</text>` : ''}<text x="${x}" y="${below ? y - 14 : y + 18}" text-anchor="middle" style="font-weight:${on ? 600 : 400};fill:${on ? 'var(--ink)' : 'var(--muted)'}">${REGIONS[r].code}</text>${lines}</g>`;
  });
  return `<svg class="map" viewBox="0 0 ${MAPW} ${MAPH}" role="img" aria-label="World map of regions"><defs><marker id="mm-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--bad)"/></marker></defs>${landDots()}${g}</svg>`;
}

function renderDeploy(v) {
  keepScroll(['d-view', 'd-panel', 'd-rail'], () => {
    v.innerHTML = `<div class="panes"><aside class="rail" id="d-rail" aria-label="Infrastructure"></aside>
      <section class="center"><div class="ctool" data-fb="Deploy toolbar"><div class="tabs2" role="group" aria-label="View"><button type="button" class="${ST.dView === 'diagram' ? 'on' : ''}" data-act="d-view" data-v="diagram">Diagram</button><button type="button" class="${ST.dView === 'map' ? 'on' : ''}" data-act="d-view" data-v="map">World map</button></div><span class="muted" style="font-size:12.5px">Changes here never change the logic.</span><span style="flex:1"></span>${ST.dView === 'diagram' ? `<div class="tabs2" role="group" aria-label="Region layout"><button type="button" class="${ST.dWrap ? '' : 'on'}" data-act="d-wrap" data-v="0">Side by side</button><button type="button" class="${ST.dWrap ? 'on' : ''}" data-act="d-wrap" data-v="1">Wrap</button></div>` : ''}</div>
        <div class="dview" id="d-view" data-fb="Deploy view">${ST.dView === 'diagram' ? infraDiagram() : `<div style="padding:12px 14px">${worldMap()}</div><div class="legend"><span><i style="border-color:var(--repl);border-top-style:dashed"></i>copies data</span><span><i style="border-color:var(--write)"></i>calls between regions</span><span><i style="border-color:var(--line-2)"></i>networks connected</span><span class="muted">Click a grey region to start using it.</span></div>`}</div>
        <div class="probs" id="d-probs" data-fb="Deploy checks"></div></section>
      <aside class="panel" id="d-panel" aria-label="Inspector"></aside></div>`;
    renderDRail(); renderDProbs(); renderDPanel();
  });
  requestAnimationFrame(wireAll);
}
function unplaced() { const w = ST.build.workloads.filter(x => !x.external && !ST.deploy.compute.some(c => c.workloads.includes(x.name))).map(x => x.name); const d = ST.build.data.filter(x => !ST.deploy.stores.some(s => s.data.includes(x.name))).map(x => x.name); return { w, d }; }
function renderDRail() {
  const el = $('#d-rail'); if (!el) return; const Dp = ST.deploy; const up = unplaced();
  el.innerHTML = `
    ${up.w.length + up.d.length ? `<div class="rsec" data-fb="Not placed"><div class="hd"><span class="lbl" style="flex:1;color:var(--bad)">Not placed yet</span></div>
      <div class="muted" style="font-size:12px">Drag onto a box in the diagram, or click to choose.</div>
      ${up.w.map(n => `<button type="button" draggable="true" data-drag="w:${esc(n)}" class="ritem ${ST.dSel && ST.dSel.t === 'wl' && ST.dSel.id === n ? 'on' : ''}" data-act="d-sel" data-t="wl" data-id="${esc(n)}">${svg(IC.code, 14, 'var(--wl)')}<span class="nm">${esc(n)}</span><span class="tag bad">place</span></button>`).join('')}
      ${up.d.map(n => `<button type="button" draggable="true" data-drag="d:${esc(n)}" class="ritem ${ST.dSel && ST.dSel.t === 'dn' && ST.dSel.id === n ? 'on' : ''}" data-act="d-sel" data-t="dn" data-id="${esc(n)}">${svg(KIND_STYLE[A.D[n].kind][2], 14, 'var(--data)')}<span class="nm">${esc(n)}</span><span class="tag bad">place</span></button>`).join('')}
      <button type="button" class="btn sm" data-act="d-auto" style="margin-top:4px">Place automatically</button></div>` : ''}
    <div class="rsec" data-fb="Regions"><div class="hd"><span class="lbl">Regions</span></div>
      ${Object.keys(REGIONS).map(r => `<label class="switch" style="justify-content:space-between;padding:3px 4px;font-size:12.5px"><span style="display:flex;gap:6px;align-items:center;min-width:0"><span class="mono" style="white-space:nowrap">${REGIONS[r].code}</span><span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${REGIONS[r].city}</span></span><input type="checkbox" ${Dp.regions.includes(r) ? 'checked' : ''} data-ch="d-region" data-r="${r}" aria-label="Use ${REGIONS[r].code}"></label>`).join('')}</div>
    <div class="rsec" data-fb="Networks"><div class="hd"><span class="lbl" style="flex:1">Network</span><button type="button" class="link" style="font-size:12px" data-act="d-sel" data-t="net" data-id="net">Details</button></div>
      <label class="switch" style="font-size:12.5px"><input type="checkbox" ${Dp.peering ? 'checked' : ''} data-ch="d-peer"><span>Connect region networks</span></label>
      <div class="muted" style="font-size:12px">Each region has its own private network. Click a region’s load balancer or NAT gateway in the diagram to change it.</div></div>
    <div class="rsec"><div class="hd"><span class="lbl">Add compute</span></div>${Object.keys(COMPUTE).map(k => `<button type="button" class="ritem" data-act="d-add-c" data-type="${k}">${svg(CICON[k], 14, 'var(--wl)')}<span class="nm">${COMPUTE[k].label}</span>${svg(IC.plus, 13, 'var(--muted)')}</button>`).join('')}</div>
    <div class="rsec"><div class="hd"><span class="lbl">Add store</span></div>${Object.keys(STORES).map(k => `<button type="button" class="ritem" data-act="d-add-s" data-type="${k}">${svg(SICON[k], 14, 'var(--data)')}<span class="nm">${STORES[k].label}</span>${svg(IC.plus, 13, 'var(--muted)')}</button>`).join('')}</div>`;
}
function renderDProbs() {
  const el = $('#d-probs'); if (!el) return;
  const P = V.problems.slice().sort((a, b) => (a.sev === 'error' ? 0 : 1) - (b.sev === 'error' ? 0 : 1)); ST._dprobs = P;
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:${P.length ? 4 : 0}px">${V.valid ? `<span class="tag good">${svg(IC.check, 12, 'currentColor', 3)} Infrastructure works</span>` : `<span class="tag bad">${V.errors} problem${V.errors > 1 ? 's' : ''} block Simulate</span>`}${V.warnings ? `<button type="button" class="link" style="font-size:12.5px" data-act="d-notes">${ST.dNotes ? 'Hide' : 'Show'} ${V.warnings} note${V.warnings > 1 ? 's' : ''}</button>` : ''}<span class="muted" style="font-size:12.5px">${V.valid ? 'Everything in the Build has somewhere to run, and every connection can be made.' : 'Every workload and data node needs a home, and every connection must be reachable.'}</span>${V.valid ? `<button type="button" class="btn sm" data-act="mode" data-m="simulate" style="margin-left:auto">Go to Simulate</button>` : ''}</div>
    ${P.map((p, i) => (p.sev === 'warn' && !ST.dNotes) ? '' : `<div class="prob"><span class="ic ${p.sev}">!</span><span style="flex:1;min-width:0">${esc(p.msg)}</span>${p.fix ? `<button type="button" class="ghost sm" data-act="d-fix" data-i="${i}">${esc(p.fix.label)}</button>` : ''}${p.at && (p.at.kind === 'compute' || p.at.kind === 'store') ? `<button type="button" class="link" style="font-size:12px;white-space:nowrap" data-act="d-sel" data-t="${p.at.kind === 'compute' ? 'c' : 's'}" data-id="${esc(p.at.id)}">Show</button>` : ''}</div>`).join('')}`;
}
function regionChips(obj, act) { return `<div class="seg">${sortedRegions().map(r => `<button type="button" class="${obj.regions.includes(r) ? 'on' : ''}" aria-pressed="${obj.regions.includes(r)}" data-act="${act}" data-id="${obj.id}" data-r="${r}">${REGIONS[r].code}</button>`).join('')}</div>`; }
function renderDPanel() {
  const el = $('#d-panel'); if (!el) return; const s = ST.dSel || {}; const Dp = ST.deploy;
  const head = (icon, bg, fg, kind, name, id, act, del) => `<div class="ph"><span class="ico" style="width:36px;height:36px;background:${bg}">${svg(icon, 18, fg)}</span><div style="flex:1;min-width:0"><label class="lbl" style="display:block" for="dp-name">${kind}</label>${act ? `<input id="dp-name" value="${esc(name)}" data-ch="${act}" data-id="${id}">` : `<div style="font-size:17px;font-weight:600">${esc(name)}</div>`}</div>${del ? `<button type="button" class="iconbtn" data-act="${del}" data-id="${id}" aria-label="Delete" title="Delete">${svg(IC.trash, 16)}</button>` : ''}<button type="button" class="iconbtn" data-act="d-desel" aria-label="Close">${svg(IC.x, 16)}</button></div>`;
  if (s.t === 'c') {
    const c = Dp.compute.find(x => x.id === s.id); if (!c) { ST.dSel = null; return renderDPanel(); } const T = COMPUTE[c.type];
    el.innerHTML = head(CICON[c.type], 'var(--wl-soft)', 'var(--wl)', 'Compute', c.name, c.id, 'd-cname', 'd-cdel') +
      `<div class="q"><div class="qh">Type</div><div class="seg">${Object.keys(COMPUTE).map(k => `<button type="button" class="${c.type === k ? 'on' : ''}" data-act="d-cset" data-id="${c.id}" data-k="type" data-v="${k}">${COMPUTE[k].short}</button>`).join('')}</div><div class="note">${T.note}</div></div>
      <div class="q"><div class="qh">Regions</div>${regionChips(c, 'd-creg')}<div class="note">It runs a copy in each region. Requests use the nearest copy.</div></div>
      ${c.type !== 'fn' ? `<div class="q"><div class="qh">Size and scaling</div><div class="seg">${Object.keys(T.sizes).map(k => `<button type="button" class="${c.size === k ? 'on' : ''}" data-act="d-cset" data-id="${c.id}" data-k="size" data-v="${k}">${k} · ${T.sizes[k]} vCPU</button>`).join('')}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><label style="display:flex;gap:6px;align-items:center"><span class="muted">Fewest</span><input class="field num" style="width:70px" type="number" min="0" id="c-min" value="${c.min}" data-ch="d-cnum" data-id="${c.id}" data-k="min"></label><label style="display:flex;gap:6px;align-items:center"><span class="muted">Most</span><input class="field num" style="width:70px" type="number" min="1" id="c-max" value="${c.max}" data-ch="d-cnum" data-id="${c.id}" data-k="max"></label><span class="muted">${c.type === 'k8s' ? 'pods' : 'instances'} per region</span></div></div>`
        : `<div class="q"><div class="qh">Limits</div><div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><label style="display:flex;gap:6px;align-items:center"><span class="muted">Most at once</span><input class="field num" style="width:90px" type="number" min="1" id="c-conc" value="${c.concurrency}" data-ch="d-cnum" data-id="${c.id}" data-k="concurrency"></label><label style="display:flex;gap:6px;align-items:center"><span class="muted">Memory</span><input class="field num" style="width:80px" type="number" min="128" step="128" id="c-mem" value="${c.memory}" data-ch="d-cnum" data-id="${c.id}" data-k="memory"><span class="muted">MB</span></label></div><div class="note">Each run stops after 15 minutes.</div></div>`}
      ${T.net === 'public' ? `<div class="q"><label class="switch"><input type="checkbox" ${c.vpc ? 'checked' : ''} data-ch="d-cvpc" data-id="${c.id}"><span>Private network access</span></label><div class="note">Needed to reach private stores (PostgreSQL, Redis, Kafka…) and Kubernetes or VM services.</div></div>` : ''}
      <div class="q maplist" data-fb="Workloads on this compute"><div class="qh">Workloads running here</div>${ST.build.workloads.filter(w => !w.external).map(w => { const on = c.workloads.includes(w.name); const other = !on && Dp.compute.find(x => x.workloads.includes(w.name)); return `<label><input type="checkbox" ${on ? 'checked' : ''} data-ch="d-mapw" data-id="${c.id}" data-w="${esc(w.name)}"><span style="flex:1" class="mono">${esc(w.name)}</span>${other ? `<span class="muted">on ${esc(other.name)}</span>` : ''}</label>`; }).join('')}<div class="note">Workloads on the same compute in the same region call each other in-process, with no network hop.</div></div>`;
    return;
  }
  if (s.t === 's') {
    const st = Dp.stores.find(x => x.id === s.id); if (!st) { ST.dSel = null; return renderDPanel(); } const T = STORES[st.type];
    el.innerHTML = head(SICON[st.type], 'var(--data-soft)', 'var(--data)', 'Store', st.name, st.id, 'd-sname', 'd-sdel') +
      `<div class="q"><label class="qh" for="s-type">Product type</label><select class="field" id="s-type" data-ch="d-stype" data-id="${st.id}">${Object.keys(STORES).map(k => `<option value="${k}" ${st.type === k ? 'selected' : ''}>${STORES[k].label}</option>`).join('')}</select><div class="note">${esc(T.note || '')} Best for: ${T.kinds.map(k => DATA_KINDS[k].label.toLowerCase()).join(', ')}${Object.keys(T.fits || {}).length ? `. Also works for: ${Object.keys(T.fits).map(k => DATA_KINDS[k].label.toLowerCase()).join(', ')}` : ''}. Network: ${T.net === 'vpc' ? 'inside the private network' : 'managed service, reached over the provider’s network'}.</div></div>
      <div class="q"><div class="qh">Regions</div>${regionChips(st, 'd-sreg')}</div>
      <div class="q"><div class="qh">Copies across regions</div><div class="seg">${T.repl.map(k => `<button type="button" class="${st.repl === k ? 'on' : ''}" data-act="d-sset" data-id="${st.id}" data-k="repl" data-v="${k}">${REPL[k].label}</button>`).join('')}</div>
        <div class="note">${({ single: 'All data lives in one region. Other regions reach across to it.', 'read-replicas': 'Writes go to the primary; other regions keep read-only copies a moment behind.', 'multi-primary': 'Every region accepts writes and copies them to the others. If two regions change one row at once, the newest wins.', consensus: `Writes wait for a majority of regions to agree (about ${quorumRtt(st)} ms here). Always consistent.`, crr: 'Objects are written in the primary region and copied to the others.' })[st.repl]}</div>
        ${st.repl !== 'single' && st.repl !== 'multi-primary' ? `<label style="display:flex;gap:8px;align-items:center"><span class="muted">${st.repl === 'consensus' ? 'Leader' : 'Primary'}</span><select class="field" id="s-prim" data-ch="d-sprim" data-id="${st.id}">${st.regions.map(r => `<option value="${r}" ${st.primary === r ? 'selected' : ''}>${REGIONS[r].code}</option>`).join('')}</select></label>
        <div class="seg">${[['nearest', 'Read the nearest copy'], ['primary', `Read from the ${st.repl === 'consensus' ? 'leader' : 'primary'}`]].map(([k, l]) => `<button type="button" class="${st.readFrom === k ? 'on' : ''}" data-act="d-sset" data-id="${st.id}" data-k="readFrom" data-v="${k}">${l}</button>`).join('')}</div>` : ''}</div>
      ${T.usd ? `<div class="q"><div class="qh">Size</div><div class="seg">${Object.keys(T.usd).map(k => `<button type="button" class="${st.size === k ? 'on' : ''}" data-act="d-sset" data-id="${st.id}" data-k="size" data-v="${k}">${k}</button>`).join('')}</div><div class="note">${T.cap ? `About ${fmtInt(T.cap[st.size])} operations a second` : ''}${T.conn ? ` · ${fmtInt(T.conn[st.size])} connections` : ''}${T.partitions ? `<label style="display:flex;gap:6px;align-items:center;margin-top:6px"><span class="muted">Partitions</span><input class="field num" style="width:70px" type="number" min="1" id="s-parts" value="${st.partitions || 12}" data-ch="d-snum" data-id="${st.id}" data-k="partitions"></label>` : ''}</div></div>` : ''}
      ${(T.shards || T.autoShard || T.partitions) && st.data.length ? `<div class="q" data-fb="Partitioning"><div class="qh">Splitting the data</div>
        ${T.shards ? `<label style="display:flex;gap:6px;align-items:center"><span class="muted">Shards</span><input class="field num" style="width:70px" type="number" min="1" max="64" id="s-shards" value="${shardCount(st)}" data-ch="d-snum" data-id="${st.id}" data-k="shards"><span class="muted">${shardCount(st) > 1 ? `separate ${T.label.split(' (')[0]} servers, each with its own capacity and connections` : 'one server holds everything'}</span></label>` : T.autoShard ? '<div class="note">This product splits data by key on its own. Lookups by the key go to one partition.</div>' : ''}
        ${(T.shards && shardCount(st) > 1) || T.autoShard ? st.data.filter(n => A.D[n] && A.D[n].fields && A.D[n].fields.length).map(n => { const d = A.D[n]; const pk = partitionKeyOf(st, d); return `<label style="display:flex;gap:6px;align-items:center;font-size:12.5px"><span class="mono" style="flex:1">${esc(n)}</span><span class="muted">split by</span><select class="field" data-ch="d-pk" data-id="${st.id}" data-d="${esc(n)}">${d.fields.map(f => `<option ${f.name === pk ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>`; }).join('') + '<div class="note">Reads that use the split field go to one shard. Reads by anything else ask every shard and merge the results.</div>' : ''}
        ${T.partitions ? `<div class="note">Kafka keeps order inside a partition. ${st.data.map(n => A.D[n] && A.D[n].partitionKey ? `${esc(n)} is keyed by <code>${esc(A.D[n].partitionKey)}</code> (set in Build).` : `${esc(n)} has no key, so events spread evenly.`).join(' ')}</div>` : ''}</div>` : ''}
      <div class="q maplist" data-fb="Data in this store"><div class="qh">Data stored here</div>${ST.build.data.map(d => { const F = storeFit(st.type, d.kind); const ok = F.fit !== 'no'; const on = st.data.includes(d.name); const other = !on && Dp.stores.find(x => x.data.includes(d.name)); return `<label class="${ok || on ? '' : 'dis'}" ${F.note ? `title="${esc(F.note)}"` : ''}><input type="checkbox" ${on ? 'checked' : ''} ${ok || on ? '' : 'disabled'} data-ch="d-mapd" data-id="${st.id}" data-d="${esc(d.name)}"><span style="flex:1" class="mono">${esc(d.name)}</span><span class="muted">${!ok ? `can’t hold ${DATA_KINDS[d.kind].label.toLowerCase()}` : other ? 'in ' + esc(other.name) : DATA_KINDS[d.kind].label.toLowerCase()}</span>${F.fit === 'works' ? '<span class="tag warn">works</span>' : ''}</label>`; }).join('')}<div class="note">Many data nodes can share one store, like several tables in one database. “Works” means it fits but isn’t what this product is best at; hover for why.</div></div>`;
    return;
  }
  if (s.t === 'net') {
    const N = Dp.network;
    el.innerHTML = head(IC.route, 'var(--accent-soft)', 'var(--accent)', 'Network', 'Global network', 'net', null, null) +
      `<div class="q"><div class="qh">Sending users to a region</div><div class="seg">${Object.keys(NET.steering).map(k => `<button type="button" class="${N.steering === k ? 'on' : ''}" data-act="d-net" data-k="steering" data-v="${k}">${NET.steering[k].label}</button>`).join('')}</div><div class="note">${NET.steering[N.steering].note}</div></div>
      <div class="q"><label class="switch"><input type="checkbox" ${Dp.peering ? 'checked' : ''} data-ch="d-peer"><span>Connect region networks</span></label>${Dp.peering ? `<div class="seg">${Object.keys(NET.link).map(k => `<button type="button" class="${N.link === k ? 'on' : ''}" data-act="d-net" data-k="link" data-v="${k}">${NET.link[k].label}</button>`).join('')}</div><div class="note">${NET.link[N.link].note}</div>` : '<div class="note">Private services in one region can’t reach private services in another.</div>'}</div>
      <div class="q"><div class="qh">Each region</div>${sortedRegions().map(r => { const NR = netRegion(Dp, r); return `<button type="button" class="ritem" data-act="d-sel" data-t="r" data-id="${r}"><span class="mono" style="width:90px">${REGIONS[r].code}</span><span class="nm muted" style="font-size:12px">${NET.entry[NR.entry].label}${NR.nat ? ' · NAT' : ''}${NR.endpoints ? ' · endpoints' : ''}</span></button>`; }).join('')}</div>`;
    return;
  }
  if (s.t === 'r') {
    const r = s.id; const others = Dp.regions.filter(x => x !== r);
    el.innerHTML = head(IC.globe, 'var(--accent-soft)', 'var(--accent)', 'Region', `${REGIONS[r].code} · ${REGIONS[r].city}`, r, null, null) +
      `<div class="q" data-fb="Region entry"><div class="qh">How users get in</div><div class="seg">${Object.keys(NET.entry).map(k => `<button type="button" class="${netRegion(Dp, r).entry === k ? 'on' : ''}" data-act="d-rnet" data-r="${r}" data-k="entry" data-v="${k}">${NET.entry[k].label}</button>`).join('')}</div><div class="note">${NET.entry[netRegion(Dp, r).entry].note} Functions and scale-to-zero containers have their own public address, so they don’t need one.</div>
        ${netRegion(Dp, r).entry === 'apigw' ? `<label style="display:flex;gap:6px;align-items:center"><span class="muted">Request limit</span><input class="field num" style="width:100px" type="number" min="1" id="r-limit" value="${netRegion(Dp, r).limit}" data-ch="d-rlimit" data-r="${r}"><span class="muted">per second</span></label>` : ''}</div>
      <div class="q" data-fb="Region egress"><div class="qh">Leaving the private network</div>
        <label class="switch"><input type="checkbox" ${netRegion(Dp, r).nat ? 'checked' : ''} data-ch="d-rnetb" data-r="${r}" data-k="nat"><span>NAT gateway</span></label><div class="note">${NET.nat.note} Needed to call outside services.</div>
        <label class="switch"><input type="checkbox" ${netRegion(Dp, r).endpoints ? 'checked' : ''} data-ch="d-rnetb" data-r="${r}" data-k="endpoints"><span>Private endpoints</span></label><div class="note">${NET.endpoints.note} Faster than going through NAT.</div></div>
      <div class="q"><div class="qh">Running here</div><div class="chips">${Dp.compute.filter(c => c.regions.includes(r)).map(c => `<span class="chip">${esc(c.name)}</span>`).join('') || '<span class="muted">No compute</span>'}${Dp.stores.filter(x => x.regions.includes(r)).map(x => `<span class="chip">${esc(x.name)} ${storeRole(x, r) ? '· ' + storeRole(x, r) : ''}</span>`).join('')}</div></div>
      <div class="q"><div class="qh">Round trip to other regions</div>${others.length ? others.map(o => `<div class="kv"><span class="mono">${REGIONS[o].code}</span><span class="num">${rtt(r, o)} ms</span></div>`).join('') : '<div class="muted">Only region.</div>'}<div class="note">Estimated from distance (light in fiber plus routing). Real figures vary.</div></div>
      <div class="q"><div class="qh">Users nearby</div>${Object.keys(POPS).map(p => `<div class="kv"><span>${POPS[p].label}</span><span class="num">${popRtt(p, r)} ms</span></div>`).join('')}</div>
      <div><button type="button" class="ghost sm" data-act="d-rmregion" data-id="${r}">Stop using ${REGIONS[r].code}</button></div>`;
    return;
  }
  if (s.t === 'x') {
    const e = (Dp.externals && Dp.externals[s.id]) || { region: 'use1' };
    el.innerHTML = head(IC.ext, 'var(--ext-soft)', 'var(--ext)', 'Outside service', s.id, s.id, null, null) + `<div class="q"><label class="qh" for="x-reg">Hosted near</label><select class="field" id="x-reg" data-ch="d-xreg" data-id="${esc(s.id)}">${Object.keys(REGIONS).map(r => `<option value="${r}" ${e.region === r ? 'selected' : ''}>${REGIONS[r].code} · ${REGIONS[r].city}</option>`).join('')}</select><div class="note">You don’t run it, so there’s nothing to size. Its response time comes from the Build code; the distance to it comes from here.</div></div>`;
    return;
  }
  if (s.t === 'wl' || s.t === 'dn') {
    const isW = s.t === 'wl'; const opts = isW ? Dp.compute : Dp.stores.filter(x => storeFit(x.type, A.D[s.id].kind).fit !== 'no');
    el.innerHTML = head(isW ? IC.code : KIND_STYLE[A.D[s.id].kind][2], isW ? 'var(--wl-soft)' : 'var(--data-soft)', isW ? 'var(--wl)' : 'var(--data)', isW ? 'Workload' : 'Data · ' + DATA_KINDS[A.D[s.id].kind].label, s.id, s.id, null, null) +
      `<div class="q"><div class="qh">${isW ? 'Where does it run?' : 'Where is it stored?'}</div>${opts.length ? opts.map(o => `<button type="button" class="ritem" data-act="d-place" data-t="${s.t}" data-id="${esc(s.id)}" data-to="${o.id}">${svg(isW ? CICON[o.type] : SICON[o.type], 14, isW ? 'var(--wl)' : 'var(--data)')}<span class="nm">${esc(o.name)}</span><span class="muted" style="font-size:12px">${isW ? COMPUTE[o.type].short : STORES[o.type].label}</span></button>`).join('') : '<div class="muted">Nothing suitable yet.</div>'}
      <div class="lbl" style="margin-top:8px">Or create new</div>${isW ? Object.keys(COMPUTE).map(k => `<button type="button" class="ritem" data-act="d-place-new" data-t="wl" data-id="${esc(s.id)}" data-type="${k}">${svg(CICON[k], 14, 'var(--wl)')}<span class="nm">New ${COMPUTE[k].label.toLowerCase()}</span></button>`).join('') : Object.keys(STORES).filter(k => storeFit(k, A.D[s.id].kind).fit !== 'no').sort((a, b) => (storeFit(a, A.D[s.id].kind).fit === 'native' ? 0 : 1) - (storeFit(b, A.D[s.id].kind).fit === 'native' ? 0 : 1)).map(k => `<button type="button" class="ritem" data-act="d-place-new" data-t="dn" data-id="${esc(s.id)}" data-type="${k}">${svg(SICON[k], 14, 'var(--data)')}<span class="nm">New ${STORES[k].label}</span>${storeFit(k, A.D[s.id].kind).fit === 'works' ? '<span class="tag warn">works</span>' : ''}</button>`).join('')}</div>`;
    return;
  }
  el.innerHTML = `<div><label class="lbl" for="dp-dname" style="display:block">Deploy config</label><input id="dp-dname" class="field" value="${esc(Dp.name)}" data-ch="d-name" style="font-size:17px;font-weight:600;width:100%"></div>
    <div class="note">How the Build runs on real infrastructure. Put workloads on compute and data in stores, across one or more regions. The logic stays the same; speed, cost and failure behavior change.</div>
    <div class="tiles"><div class="tile"><span class="lbl">Regions</span><span class="v">${Dp.regions.length}</span></div><div class="tile"><span class="lbl">Compute</span><span class="v">${Dp.compute.length}</span></div><div class="tile"><span class="lbl">Stores</span><span class="v">${Dp.stores.length}</span></div></div>
    <div class="note">Click anything in the diagram to change it. Problems listed below the diagram block Simulate until they’re fixed; most have a one-click fix.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ghost sm" data-act="library">${svg(IC.lib, 14)}Save or load a Deploy config</button>${V.valid ? `<button type="button" class="btn sm" data-act="mode" data-m="simulate">Go to Simulate</button>` : ''}</div>`;
}

/* ---------- deploy actions ---------- */
ACT['d-notes'] = () => { ST.dNotes = !ST.dNotes; renderDProbs(); };
ACT['d-view'] = el => { ST.dView = el.dataset.v; render(); };
ACT['d-sel'] = el => { ST.dSel = { t: el.dataset.t, id: el.dataset.id }; if (ST.mode !== 'deploy') { ST.mode = 'deploy'; history.replaceState(null, '', '#deploy'); } render(); };
ACT['d-desel'] = () => { ST.dSel = null; render(); };
ACT['noop'] = () => { };
ACT['d-mapregion'] = el => { const r = el.dataset.id; if (ST.deploy.regions.includes(r)) { ST.dSel = { t: 'r', id: r }; render(); } else { commit((b, d) => { d.regions.push(r); normalizeDeploy(d); }); toast(`Now using ${REGIONS[r].code}. Add compute or stores there.`, { label: 'Undo', fn: undo }); } };
ACT['d-rmregion'] = el => { const r = el.dataset.id; if (ST.deploy.regions.length <= 1) { toast('Keep at least one region'); return; } commit((b, d) => { d.regions = d.regions.filter(x => x !== r); d.compute.forEach(c => c.regions = c.regions.filter(x => x !== r)); d.stores.forEach(s => { s.regions = s.regions.filter(x => x !== r); if (s.primary === r) s.primary = s.regions[0]; }); }); ST.dSel = null; render(); toast(`Stopped using ${REGIONS[r].code}`, { label: 'Undo', fn: undo }); };
CH['d-region'] = el => { const r = el.dataset.r; if (el.checked) commit((b, d) => { d.regions.push(r); normalizeDeploy(d); }); else ACT['d-rmregion']({ dataset: { id: r } }); };
CH['d-peer'] = el => commit((b, d) => { d.peering = el.checked; });
CH['d-name'] = el => commit((b, d) => { d.name = el.value.trim() || 'Untitled deploy'; });
ACT['d-add-c'] = el => { const c = newCompute(ST.deploy, el.dataset.type); commit((b, d) => d.compute.push(c)); ST.dSel = { t: 'c', id: c.id }; render(); };
ACT['d-add-s'] = el => { const s = newStore(ST.deploy, el.dataset.type); commit((b, d) => d.stores.push(s)); ST.dSel = { t: 's', id: s.id }; render(); };
ACT['d-auto'] = () => { commit((b, d) => autoPlace(b, A, d)); toast('Placed everything with defaults', { label: 'Undo', fn: undo }); };
ACT['d-fix'] = el => { const p = ST._dprobs[+el.dataset.i]; if (!p || !p.fix) return; commit((b, d) => p.fix.apply(d)); toast(p.fix.label, { label: 'Undo', fn: undo }); };
ACT['d-cset'] = el => commit((b, d) => { const c = d.compute.find(x => x.id === el.dataset.id); c[el.dataset.k] = el.dataset.v; if (el.dataset.k === 'type') { const T = COMPUTE[c.type]; Object.keys(T.def).forEach(k => { if (c[k] == null || (k === 'size' && T.sizes && !T.sizes[c.size])) c[k] = T.def[k]; }); } });
CH['d-cnum'] = el => commit((b, d) => { const c = d.compute.find(x => x.id === el.dataset.id); c[el.dataset.k] = Math.max(el.dataset.k === 'min' ? 0 : 1, Math.round(Number(el.value) || 0)); if (c.min > c.max) c.max = c.min; });
CH['d-cvpc'] = el => commit((b, d) => { d.compute.find(x => x.id === el.dataset.id).vpc = el.checked; });
CH['d-cname'] = el => commit((b, d) => { d.compute.find(x => x.id === el.dataset.id).name = el.value.trim() || 'compute'; });
ACT['d-creg'] = el => commit((b, d) => { const c = d.compute.find(x => x.id === el.dataset.id); const r = el.dataset.r; c.regions = c.regions.includes(r) ? c.regions.filter(x => x !== r) : c.regions.concat([r]); });
ACT['d-cdel'] = el => { const c = ST.deploy.compute.find(x => x.id === el.dataset.id); commit((b, d) => { d.compute = d.compute.filter(x => x.id !== c.id); }); ST.dSel = null; render(); toast(`Deleted ${c.name}${c.workloads.length ? `. ${c.workloads.length} workload${c.workloads.length > 1 ? 's' : ''} need a new home.` : ''}`, { label: 'Undo', fn: undo }); };
CH['d-mapw'] = el => commit((b, d) => { const w = el.dataset.w; d.compute.forEach(c => c.workloads = c.workloads.filter(x => x !== w)); if (el.checked) d.compute.find(x => x.id === el.dataset.id).workloads.push(w); });
CH['d-sname'] = el => commit((b, d) => { d.stores.find(x => x.id === el.dataset.id).name = el.value.trim() || 'store'; });
CH['d-stype'] = el => commit((b, d) => { const s = d.stores.find(x => x.id === el.dataset.id); s.type = el.value; const T = STORES[s.type]; if (!T.repl.includes(s.repl)) s.repl = T.repl.includes('single') && s.regions.length <= 1 ? 'single' : T.repl[T.repl.length - 1]; if (T.usd && !T.usd[s.size]) s.size = 'Medium'; });
ACT['d-sset'] = el => commit((b, d) => { d.stores.find(x => x.id === el.dataset.id)[el.dataset.k] = el.dataset.v; });
CH['d-sprim'] = el => commit((b, d) => { d.stores.find(x => x.id === el.dataset.id).primary = el.value; });
CH['d-snum'] = el => commit((b, d) => { d.stores.find(x => x.id === el.dataset.id)[el.dataset.k] = Math.min(el.dataset.k === 'shards' ? 64 : 1e4, Math.max(1, Math.round(Number(el.value) || 1))); });
ACT['d-sreg'] = el => commit((b, d) => { const s = d.stores.find(x => x.id === el.dataset.id); const r = el.dataset.r; s.regions = s.regions.includes(r) ? s.regions.filter(x => x !== r) : s.regions.concat([r]); if (!s.regions.includes(s.primary)) s.primary = s.regions[0]; });
ACT['d-sdel'] = el => { const s = ST.deploy.stores.find(x => x.id === el.dataset.id); commit((b, d) => { d.stores = d.stores.filter(x => x.id !== s.id); }); ST.dSel = null; render(); toast(`Deleted ${s.name}`, { label: 'Undo', fn: undo }); };
CH['d-mapd'] = el => commit((b, d) => { const n = el.dataset.d; d.stores.forEach(s => s.data = s.data.filter(x => x !== n)); if (el.checked) d.stores.find(x => x.id === el.dataset.id).data.push(n); });
CH['d-xreg'] = el => commit((b, d) => { d.externals = d.externals || {}; d.externals[el.dataset.id] = { region: el.value }; });
ACT['d-place'] = el => { commit((b, d) => { if (el.dataset.t === 'wl') d.compute.find(x => x.id === el.dataset.to).workloads.push(el.dataset.id); else d.stores.find(x => x.id === el.dataset.to).data.push(el.dataset.id); }); ST.dSel = null; render(); };
ACT['d-place-new'] = el => { let id; commit((b, d) => { if (el.dataset.t === 'wl') { const c = newCompute(d, el.dataset.type); c.workloads.push(el.dataset.id); d.compute.push(c); id = c.id; } else { const s = newStore(d, el.dataset.type); s.data.push(el.dataset.id); d.stores.push(s); id = s.id; } }); ST.dSel = { t: el.dataset.t === 'wl' ? 'c' : 's', id }; render(); };

ACT['d-net'] = el => commit((b, d) => { normalizeDeploy(d); d.network[el.dataset.k] = el.dataset.v; });
ACT['d-rnet'] = el => commit((b, d) => { normalizeDeploy(d); d.network.regions[el.dataset.r][el.dataset.k] = el.dataset.v; });
CH['d-rnetb'] = el => commit((b, d) => { normalizeDeploy(d); d.network.regions[el.dataset.r][el.dataset.k] = el.checked; });
CH['d-rlimit'] = el => commit((b, d) => { normalizeDeploy(d); d.network.regions[el.dataset.r].limit = Math.max(1, Math.round(Number(el.value) || 1)); });
CH['d-pk'] = el => commit((b, d) => { const s = d.stores.find(x => x.id === el.dataset.id); s.dataCfg = s.dataCfg || {}; s.dataCfg[el.dataset.d] = { pk: el.value }; });
ACT['d-wrap'] = el => { ST.dWrap = el.dataset.v === '1'; render(); };
