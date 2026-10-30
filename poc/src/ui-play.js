/* ===================== Simulate: watch it run, and step through one request ===================== */
const PLAY_SPEEDS = [0.5, 1, 2, 4];
const fmtClock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
function heatCls(rho) { return rho >= 1 ? 'over' : rho >= 0.75 ? 'hot' : 'cool'; }

/* ---------- live heat on the board ---------- */
function paintBoard(board, res, opt) {
  if (!board) return; opt = opt || {};
  board.querySelectorAll('[data-box]').forEach(el => {
    const k = el.dataset.box; const st = res && (res[k] || (k.startsWith('e:') ? res['g:' + k.slice(2)] : null)); const h = el.querySelector(':scope > .hd .heat, :scope > .heat');
    el.classList.remove('hot', 'over', 'active');
    if (!h) return;
    if (!st) { h.hidden = true; return; }
    const extra = st.type === 'compute' && st.inst != null && st.ref && st.ref.type !== 'fn' ? ` · ${st.inst}${st.lag ? '+' + st.lag : ''} ${st.ref.type === 'k8s' ? 'pods' : 'VMs'}` : st.type === 'compute' && st.inst ? ` · ${st.inst} running` : '';
    h.hidden = false; h.textContent = Math.round(st.rho * 100) + '%' + extra; h.className = 'heat ' + heatCls(st.rho);
    if (st.rho >= 1) el.classList.add('over'); else if (st.rho >= 0.75) el.classList.add('hot');
  });
  if (opt.active) opt.active.forEach(k => { const el = board.querySelector(`[data-box="${CSS.escape(k)}"]`); if (el) el.classList.add('active'); });
}

/* ---------- particles ---------- */
const PCOL = { call: 'var(--ink-2)', read: 'var(--read)', write: 'var(--write)', pub: 'var(--pub)', deliver: 'var(--pub)' };
let PART = null;
function partLayer(board) { let s = board.querySelector('svg.parts'); if (!s) { board.insertAdjacentHTML('beforeend', '<svg class="wires parts" aria-hidden="true" style="z-index:4"></svg>'); s = board.querySelector('svg.parts'); } s.setAttribute('width', board.scrollWidth); s.setAttribute('height', board.scrollHeight); return s; }
function partPath(board, a, b) {
  board._pp = board._pp || {}; const k = a + '|' + b; if (board._pp[k]) return board._pp[k];
  const R = board._R || boxRects(board); const A1 = R[a], B1 = R[b]; if (!A1 || !B1) return null;
  const [d] = wirePath(A1, B1); const s = partLayer(board); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'none'); s.appendChild(p);
  const o = { p, L: p.getTotalLength() }; board._pp[k] = o; return o;
}
function startParticles(getFrame) {
  stopParticles(); const board = $('#s-center .board'); if (!board) return;
  PART = { board, list: [], last: performance.now(), acc: {}, getFrame, raf: 0 };
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); partLayer(board).appendChild(g); PART.g = g;
  const loop = now => {
    if (!PART || !document.body.contains(PART.board)) { PART = null; return; }
    const dt = Math.min(0.1, (now - PART.last) / 1000); PART.last = now; const fr = PART.getFrame(); const speed = ST.play ? PLAY_SPEEDS[ST.play.sp] : 1;
    if (fr && fr.links && (!ST.play || ST.play.playing)) {
      Object.entries(fr.links).forEach(([k, f]) => { if (f <= 0) return; const rate = Math.min(7, 0.4 + Math.log10(1 + f) * 1.3) * Math.min(2, speed); PART.acc[k] = (PART.acc[k] || 0) + rate * dt; while (PART.acc[k] >= 1 && PART.list.length < 220) { PART.acc[k] -= 1; const [a, b, kind] = k.split('|'); const pp = partPath(PART.board, a, b); if (pp) PART.list.push({ pp, t: 0, dur: 0.9 + Math.random() * 0.5, col: (kind === 'call' && a.startsWith('u:') && fr.err > 0.01 && Math.random() < fr.err) ? 'var(--bad)' : PCOL[kind] || 'var(--accent)' }); } });
    }
    let html = '';
    PART.list = PART.list.filter(q => { q.t += dt / q.dur * (ST.play && !ST.play.playing ? 0 : 1); if (q.t >= 1) return false; const pt = q.pp.p.getPointAtLength(q.pp.L * q.t); html += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3.2" fill="${q.col}" opacity="${(0.95 - q.t * 0.35).toFixed(2)}"/>`; return true; });
    PART.g.innerHTML = html; PART.raf = requestAnimationFrame(loop);
  };
  PART.raf = requestAnimationFrame(loop);
}
function stopParticles() { if (PART) { cancelAnimationFrame(PART.raf); if (PART.g) PART.g.remove(); PART = null; } }

/* ---------- watch it run ---------- */
function playStart() {
  const sc = curScen(); if (!sc || !M) return; if (scenarioMode(A, sc) !== 'rate') { toast('Watching over time works for request and message scenarios. File and schedule runs show their finish time instead.'); return; }
  ST.sMode = 'watch'; ST.running = 'Simulating the scenario minute by minute…'; ST.stepR = null; renderSCenter();
  setTimeout(() => { M._pc = {}; const T = simulateTimeline(M, sc, { frames: 48, N: 200 }); ST.play = { scen: sc.id, sig: scenSig(sc), T, f: 0, playing: true, sp: 1 }; ST.running = null; renderSRail(); renderSCenter(); playLoop(); }, 30);
}
let playT = null;
function playLoop() { clearTimeout(playT); const P = ST.play; if (!P || !P.playing || ST.sMode !== 'watch') return; playT = setTimeout(() => { if (!ST.play || ST.sMode !== 'watch') return; if (P.f >= P.T.frames.length - 1) { P.playing = false; playPaint(); return; } P.f++; playPaint(); playLoop(); }, 650 / PLAY_SPEEDS[P.sp]); }
function playFrame() { const P = ST.play; return P ? P.T.frames[Math.min(P.f, P.T.frames.length - 1)] : null; }
function playChart(P, sc) {
  const F = P.T.frames; const W = 760, H = 150, x0 = 46, x1 = 744, y0 = 12, y1 = 120;
  const lamMax = Math.max(...F.map(f => f.lam)) * 1.1; const goal = sc.goalMs || 500; const pMax = Math.max(goal * 1.5, ...F.map(f => Math.min(f.p99, goal * 4)));
  const X = i => x0 + (i + 0.5) / F.length * (x1 - x0); const YL = v => y1 - v / lamMax * (y1 - y0); const YP = v => y1 - Math.min(v, pMax) / pMax * (y1 - y0);
  const area = `M${X(0)} ${y1} ` + F.map((f, i) => `L${X(i).toFixed(1)} ${YL(f.lam).toFixed(1)}`).join(' ') + ` L${X(F.length - 1)} ${y1} Z`;
  const p99 = F.map((f, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + YP(f.p99).toFixed(1)).join(' ');
  const errs = F.map((f, i) => f.err > 0.001 ? `<rect x="${X(i) - 4}" y="${y1 - Math.min(1, f.err) * 60}" width="8" height="${Math.min(1, f.err) * 60}" fill="var(--bad)" opacity=".55" rx="1"/>` : '').join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(q => `<text x="${x0 + q * (x1 - x0)}" y="${H - 8}" text-anchor="${q === 1 ? 'end' : q === 0 ? 'start' : 'middle'}">${fmtClock(q * P.T.durS)}</text>`).join('');
  return `<svg class="chart" id="pl-chart" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;cursor:pointer" role="img" aria-label="Load, slowest 1% and failures over the scenario">
    <path d="${area}" fill="var(--accent)" opacity=".12"/><path d="${p99}" fill="none" stroke="var(--accent)" stroke-width="2"/>${errs}
    <line x1="${x0}" x2="${x1}" y1="${YP(goal)}" y2="${YP(goal)}" stroke="var(--bad)" stroke-dasharray="4 4"/><text x="${x1}" y="${YP(goal) - 4}" text-anchor="end" style="fill:var(--bad)">goal ${fmtMs(goal)}</text>
    <text x="${x0 - 6}" y="${y0 + 8}" text-anchor="end">${fmtMs(pMax)}</text><text x="${x0 - 6}" y="${y1}" text-anchor="end">0</text>${ticks}
    <line id="pl-head" x1="${X(P.f)}" x2="${X(P.f)}" y1="${y0 - 6}" y2="${y1 + 2}" stroke="var(--ink)" stroke-width="1.5"/><circle id="pl-dot" cx="${X(P.f)}" cy="${YP(F[P.f].p99)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></svg>
    <div class="legend" style="padding:2px 0 0"><span><i style="border-color:var(--accent);border-top-width:6px;opacity:.3"></i>requests per second</span><span><i style="border-color:var(--accent)"></i>slowest 1%</span><span><i style="border-color:var(--bad);border-top-width:6px;opacity:.6"></i>failures</span><span class="muted">Click the chart to jump.</span></div>`;
}
function watchBar() {
  const P = ST.play; const fr = playFrame();
  return `<div class="playbar" data-fb="Playback">
      <button type="button" class="btn sm" data-act="pl-toggle" style="min-width:86px">${svg(P.playing ? IC.pause : IC.play, 12, 'currentColor')}${P.playing ? 'Pause' : 'Play'}</button>
      <button type="button" class="iconbtn" data-act="pl-step" data-d="-1" aria-label="Back one moment" title="Back">${svg(IC.back, 15)}</button><button type="button" class="iconbtn" data-act="pl-step" data-d="1" aria-label="Forward one moment" title="Forward">${svg(IC.step, 15)}</button>
      <input type="range" min="0" max="${P.T.frames.length - 1}" value="${P.f}" data-in="pl-seek" aria-label="Time in scenario" style="flex:1;min-width:140px;accent-color:var(--accent)">
      <span class="num" id="pl-clock" style="font-size:12.5px;white-space:nowrap">${fmtClock(fr.t)} / ${fmtClock(P.T.durS)}</span>
      <div class="seg">${PLAY_SPEEDS.map((v, i) => `<button type="button" class="${P.sp === i ? 'on' : ''}" data-act="pl-speed" data-i="${i}">${v === 0.5 ? '½' : v}×</button>`).join('')}</div>
      <button type="button" class="ghost sm" data-act="pl-close">Close</button></div>`;
}
function playLiveHTML(sc) {
  const P = ST.play; const fr = playFrame(); const ok = fr.p99 <= sc.goalMs && fr.err <= 0.01;
  const ranked = Object.entries(fr.res).sort((a, b) => b[1].rho - a[1].rho).slice(0, 6);
  const ev = P.T.events.filter(e => e.i <= P.f).slice(-14).reverse();
  const lags = Object.entries(fr.backlog).filter(([d, b]) => b > 0);
  const top = ranked[0] && ranked[0][1];
  const head = fr.err > 0.01 ? `Failing ${pct(fr.err)} of requests right now.` : !ok ? `Slow right now: the slowest 1% take ${fmtMs(fr.p99)}.` : top && top.rho >= 0.75 ? `Holding up, but ${top.label} is ${Math.round(top.rho * 100)}% busy.` : 'Healthy right now.';
  return `<div class="livehead"><span class="dotlive ${fr.err > 0.01 ? 'bad' : !ok ? 'warn' : ''}"></span><b>${esc(head)}</b></div>
    <div class="tiles"><div class="tile"><span class="lbl">Load now</span><span class="v">${fmtRate(fr.lam)}/s</span></div><div class="tile"><span class="lbl">Typical</span><span class="v">${fmtMs(fr.p50)}</span></div><div class="tile ${ok ? '' : 'bad'}"><span class="lbl">Slowest 1%</span><span class="v">${fmtMs(fr.p99)}</span></div><div class="tile ${fr.err > 0.01 ? 'bad' : ''}"><span class="lbl">Failures</span><span class="v">${pct(fr.err)}</span></div><div class="tile"><span class="lbl">Cost</span><span class="v">$${fr.cost.toFixed(fr.cost < 10 ? 2 : 0)}/h</span></div></div>
    <div class="card">${playChart(P, sc)}</div>
    <div class="livegrid">
      <div class="card" data-fb="Bottlenecks now"><h2>Busiest parts right now</h2>${ranked.map(([k, s]) => `<div class="hbar"><span>${esc(s.label)} <span class="muted">${esc(s.what || '')}${s.lag ? ` · ${s.lag} more starting` : ''}</span></span><span class="tr"><i style="left:0;width:${Math.min(100, s.rho * 100).toFixed(1)}%;background:${s.rho >= 1 ? 'var(--bad)' : s.rho >= 0.75 ? 'var(--warn)' : 'var(--accent)'}"></i></span><span class="num" style="text-align:right">${Math.round(s.rho * 100)}%</span></div>`).join('') || '<div class="muted">Nothing measurably busy.</div>'}
        ${lags.length ? `<div class="lbl" style="margin-top:8px">Waiting to be handled</div>${lags.map(([d, b]) => `<div class="kv"><span>${esc(d)}</span><span class="num" style="color:var(--bad)">${fmtInt(b)} messages</span></div>`).join('')}` : ''}</div>
      <div class="card" data-fb="What happened"><h2>What happened</h2>${ev.length ? `<ol class="feed">${ev.map(e => `<li class="${e.kind}"><button type="button" data-act="pl-seekto" data-i="${e.i}"><span class="num">${fmtClock(e.t)}</span><span>${esc(e.msg)}</span></button></li>`).join('')}</ol>` : '<div class="muted">Nothing notable yet. Scaling, overloads and backlogs show up here as they happen.</div>'}</div>
    </div>`;
}
function playPaint() {
  const P = ST.play; const sc = curScen(); if (!P || ST.sMode !== 'watch' || !sc) return; const fr = playFrame();
  const live = $('#pl-live'); if (live) live.innerHTML = playLiveHTML(sc);
  const board = $('#s-center .board'); if (board) paintBoard(board, Object.assign({}, fr.R));
  const map = $('#s-mapwrap'); if (map) map.innerHTML = worldMap({ res: fr, static: true });
  const rg = $('#s-center .playbar input[type=range]'); if (rg && +rg.value !== P.f) rg.value = P.f;
  const ck = $('#pl-clock'); if (ck) ck.textContent = `${fmtClock(fr.t)} / ${fmtClock(P.T.durS)}`;
  const tg = $('[data-act="pl-toggle"]'); if (tg) tg.innerHTML = `${svg(P.playing ? IC.pause : IC.play, 12, 'currentColor')}${P.playing ? 'Pause' : 'Play'}`;
}
ACT['pl-start'] = () => playStart();
ACT['pl-toggle'] = () => { const P = ST.play; if (!P) return; if (!P.playing && P.f >= P.T.frames.length - 1) P.f = 0; P.playing = !P.playing; playPaint(); playLoop(); };
ACT['pl-step'] = el => { const P = ST.play; P.playing = false; P.f = Math.max(0, Math.min(P.T.frames.length - 1, P.f + +el.dataset.d)); playPaint(); };
ACT['pl-speed'] = el => { ST.play.sp = +el.dataset.i; $('#s-center .playbar .seg').querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === ST.play.sp)); playLoop(); };
ACT['pl-close'] = () => { clearTimeout(playT); stopParticles(); ST.play = null; ST.sMode = null; renderSCenter(); };
ACT['pl-seekto'] = el => { const P = ST.play; P.playing = false; P.f = +el.dataset.i; playPaint(); };
IN['pl-seek'] = el => { const P = ST.play; P.playing = false; P.f = +el.value; playPaint(); };
document.addEventListener('click', ev => { const c = ev.target.closest && ev.target.closest('#pl-chart'); if (!c || !ST.play) return; const r = c.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * 760; const F = ST.play.T.frames.length; ST.play.f = Math.max(0, Math.min(F - 1, Math.floor((x - 46) / (744 - 46) * F))); ST.play.playing = false; playPaint(); });

/* ---------- step through one request on the infrastructure ---------- */
function stepOpen(i, keepOrigin) {
  const sc = curScen(); const paths = scenPaths(sc); const p = paths[i]; if (!p || !M) return;
  const e = entryInfo(A, sc.entry); const origins = originsFor(M, sc, e).filter(o => o.region);
  if (!origins.length) { toast('No region runs this entry point.'); return; }
  const prev = ST.stepR; const oi = keepOrigin && prev ? Math.min(prev.oi, origins.length - 1) : origins.reduce((b, o, j) => o.share > origins[b].share ? j : b, 0);
  const load = keepOrigin && prev ? prev.load : (ST.play && ST.play.scen === sc.id ? 'play' : 'avg');
  let R, loadLabel;
  if (load === 'play' && ST.play) { const fr = playFrame(); R = fr.R; loadLabel = `at ${fmtClock(fr.t)} in the playback (${fmtRate(fr.lam)}/s)`; }
  else if (load === 'none') { R = {}; loadLabel = 'with no other traffic'; }
  else { M._pc = {}; const r = evaluateRate(M, sc, { N: 200, seed: 3 }); R = r.R; loadLabel = `at the scenario’s load (${fmtRate(r.lambda)}/s)`; }
  M._pc = {}; const S = stepRequest(M, sc, p, origins[oi], R);
  ST.sMode = 'step'; ST.stepR = { scen: sc.id, i, oi, origins, load, loadLabel, S, k: 0, playing: false, label: p.label };
  renderSRail(); renderSCenter();
}
const SRCOL = x => ({ net: 'var(--ext)', edge: 'var(--accent)', cpu: 'var(--wl)', data: 'var(--data)', pub: 'var(--msg)', ext: 'var(--ext)', err: 'var(--bad)' })[x] || 'var(--accent)';
function stepBar(sc) {
  const T = ST.stepR; const S = T.S; const k = T.k; const cur = S.steps[k]; const tot = S.total || 1; const clock = cur ? cur.start + cur.dur : 0;
  return `<div class="playbar" data-fb="Step controls">
      <button type="button" class="iconbtn" data-act="sr-go" data-k="0" title="Restart" aria-label="Restart">${svg(IC.restart, 15)}</button>
      <button type="button" class="iconbtn" data-act="sr-go" data-k="${k - 1}" ${k <= 0 ? 'disabled' : ''} title="Back" aria-label="Back">${svg(IC.back, 15)}</button>
      <button type="button" class="btn sm" data-act="sr-play" style="min-width:86px">${svg(T.playing ? IC.pause : IC.play, 12, 'currentColor')}${T.playing ? 'Pause' : 'Play'}</button>
      <button type="button" class="ghost sm" data-act="sr-go" data-k="${k + 1}" ${k >= S.steps.length - 1 ? 'disabled' : ''}>${svg(IC.step, 13)}Step</button>
      <span class="num" style="font-size:12.5px">step ${k + 1} of ${S.steps.length} · clock ${fmtMs(clock)} of ${fmtMs(tot)}</span><span style="flex:1"></span>
      ${T.origins.length > 1 ? `<label class="muted" style="font-size:12.5px;display:flex;gap:6px;align-items:center">From <select class="field" data-ch="sr-origin">${T.origins.map((o, i) => `<option value="${i}" ${i === T.oi ? 'selected' : ''}>${o.pop ? POPS[o.pop].label : REGIONS[o.region].code}</option>`).join('')}</select></label>` : ''}
      <label class="muted" style="font-size:12.5px;display:flex;gap:6px;align-items:center">Load <select class="field" data-ch="sr-load"><option value="none" ${T.load === 'none' ? 'selected' : ''}>Quiet system</option><option value="avg" ${T.load === 'avg' ? 'selected' : ''}>Scenario load</option>${ST.play && ST.play.scen === sc.id ? `<option value="play" ${T.load === 'play' ? 'selected' : ''}>Playback moment</option>` : ''}</select></label>
      <button type="button" class="ghost sm" data-act="sr-close">Close</button></div>`;
}
function stepCard(sc) {
  const T = ST.stepR; const S = T.S; const k = T.k; const cur = S.steps[k]; const tot = S.total || 1; const col = SRCOL;
  return `<div class="card" data-fb="Request steps"><div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:6px"><h2 style="margin:0">One request: ${esc(T.label.charAt(0).toUpperCase() + T.label.slice(1))}</h2><span class="muted">${esc(T.loadLabel)} · typical timings</span></div>
      ${cur ? `<div class="nowbox"><div style="display:flex;gap:8px;align-items:center"><span class="rdot" style="background:${col(cur.kind)};width:10px;height:10px"></span><b>${esc(cur.label)}</b><span class="num muted">${fmtMs(cur.dur)}</span>${cur.wait > 0.5 ? `<span class="tag warn">${fmtMs(cur.wait)} waiting</span>` : ''}${cur.rho != null && cur.rho > 0 ? `<span class="heat ${heatCls(cur.rho)}">${Math.round(cur.rho * 100)}% busy</span>` : ''}${cur.lane != null ? '<span class="tag mute">in parallel</span>' : ''}</div><div class="note" style="margin-top:4px">${esc(cur.why || '')}</div></div>` : ''}
      <div class="wf">${S.steps.map((s, i) => `<button type="button" class="hbar wfr ${i === k ? 'cur' : i > k ? 'fut' : ''}" data-act="sr-go" data-k="${i}"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">${s.lane != null ? '<span class="muted">∥ </span>' : ''}${esc(s.label)}</span><span class="tr" style="background:var(--surface-2)">${i <= k ? `<i style="left:${(s.start / tot * 100).toFixed(2)}%;width:${Math.max(0.6, s.dur / tot * 100).toFixed(2)}%;background:${col(s.kind)}"></i>${s.wait > 0.5 ? `<i class="waitbar" style="left:${((s.start + s.dur - s.wait) / tot * 100).toFixed(2)}%;width:${Math.max(0.4, s.wait / tot * 100).toFixed(2)}%"></i>` : ''}` : ''}</span><span class="num" style="text-align:right">${i <= k ? fmtMs(s.dur) : ''}</span></button>`).join('')}</div>
      <div class="legend" style="padding:6px 0 0"><span><i style="border-color:var(--ext)"></i>network</span><span><i style="border-color:var(--wl)"></i>CPU</span><span><i style="border-color:var(--data)"></i>data</span><span><i style="border-color:var(--msg)"></i>messages</span><span><i class="waitbar" style="border:0;height:8px;width:18px;position:static;display:inline-block"></i>waiting because something is busy</span></div></div>`;
}
let srT = null;
function stepPaint(animate) {
  const T = ST.stepR; if (!T || ST.sMode !== 'step') return; const cur = T.S.steps[T.k];
  const board = $('#s-center .board');
  if (board) {
    paintBoard(board, {}, { active: cur ? [cur.box, cur.toBox].filter(Boolean) : [] });
    const layer = partLayer(board); let g = layer.querySelector('#sr-dot'); if (g) g.remove();
    if (cur && cur.fromBox && cur.toBox && cur.fromBox !== cur.toBox) { const pp = partPath(board, cur.fromBox, cur.toBox); if (pp) { layer.insertAdjacentHTML('beforeend', `<g id="sr-dot"><path d="${pp.p.getAttribute('d')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="5 5"/><circle r="7" fill="var(--accent)"/><circle r="13" fill="var(--accent)" opacity=".2"/></g>`); const dot = layer.querySelector('#sr-dot'); const cs = dot.querySelectorAll('circle'); const t0 = performance.now(); const dur = animate ? 600 : 0; const go = now => { const q = dur ? Math.min(1, (now - t0) / dur) : 1; const pt = pp.p.getPointAtLength(pp.L * (q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2)); cs.forEach(c => { c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); }); if (q < 1 && document.body.contains(dot)) requestAnimationFrame(go); }; requestAnimationFrame(go); } }
    const act = cur && (cur.box || cur.toBox) ? board.querySelector(`[data-box="${CSS.escape(cur.box || cur.toBox)}"]`) : null; if (act && animate) { const wrap = $('#s-boardwrap'); if (wrap) { const r = act.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); if (r.left < wr.left || r.right > wr.right) wrap.scrollLeft += (r.left - wr.left) - wr.width / 2 + r.width / 2; } }
  }
  const map = $('#s-mapwrap'); if (map) { const route = []; T.S.steps.slice(0, T.k + 1).forEach(s => { const g = s.g; if (!g) return; if (g.kind === 'net' && g.from && g.to && g.from !== g.to) route.push([g.from, g.to]); if ((g.kind === 'data' || g.kind === 'pub') && g.target !== g.region) route.push([g.region, g.target]); }); map.innerHTML = worldMap({ static: true, route }); }
}
function stepGo(k, animate) { const T = ST.stepR; if (!T) return; T.k = Math.max(0, Math.min(T.S.steps.length - 1, k)); const box = $('#s-step'); if (box) box.innerHTML = stepCard(curScen()); const bar = $('#sr-bar'); if (bar) bar.innerHTML = stepBar(curScen()); stepPaint(animate); const c = box && box.querySelector('.wfr.cur'); if (c) { const wf = box.querySelector('.wf'); if (wf && (c.offsetTop < wf.scrollTop || c.offsetTop > wf.scrollTop + wf.clientHeight - 30)) wf.scrollTop = c.offsetTop - wf.clientHeight / 2; } }
function stepTick() { clearTimeout(srT); const T = ST.stepR; if (!T || !T.playing) return; srT = setTimeout(() => { if (!ST.stepR || !ST.stepR.playing) return; if (T.k >= T.S.steps.length - 1) { T.playing = false; stepGo(T.k, false); return; } stepGo(T.k + 1, true); stepTick(); }, 1000); }
ACT['sr-go'] = el => { ST.stepR.playing = false; stepGo(+el.dataset.k, true); };
ACT['sr-play'] = () => { const T = ST.stepR; if (T.k >= T.S.steps.length - 1) T.k = -1; T.playing = !T.playing; if (T.playing) { stepGo(T.k + 1, true); stepTick(); } else stepGo(T.k, false); };
ACT['sr-close'] = () => { clearTimeout(srT); ST.stepR = null; ST.sMode = ST.play ? 'watch' : null; renderSRail(); renderSCenter(); };
CH['sr-origin'] = el => { ST.stepR.oi = +el.value; stepOpen(ST.stepR.i, true); };
CH['sr-load'] = el => { ST.stepR.load = el.value; stepOpen(ST.stepR.i, true); };
document.addEventListener('keydown', ev => { if (ST.mode !== 'simulate' || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return; if (ST.sMode === 'step' && ST.stepR) { if (ev.key === 'ArrowRight' || ev.key === ' ') { ev.preventDefault(); ST.stepR.playing = false; stepGo(ST.stepR.k + 1, true); } else if (ev.key === 'ArrowLeft') { ev.preventDefault(); ST.stepR.playing = false; stepGo(ST.stepR.k - 1, true); } } else if (ST.sMode === 'watch' && ST.play) { if (ev.key === ' ') { ev.preventDefault(); ACT['pl-toggle'](); } else if (ev.key === 'ArrowRight') ACT['pl-step']({ dataset: { d: 1 } }); else if (ev.key === 'ArrowLeft') ACT['pl-step']({ dataset: { d: -1 } }); } });
