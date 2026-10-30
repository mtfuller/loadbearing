/* ===================== Build: step through an entry point =====================
   Runs the code one statement at a time on linked mock data. Every event keeps a
   snapshot of the request context and the table it touched, so stepping back is
   just moving a pointer. Branches can be answered by hand, by odds, or by the
   likelier side. */
const DBG_MS = { slow: 1400, normal: 750, fast: 280 };
const DBG_VIS = new Set(['start', 'enter', 'call', 'back', 'data', 'publish', 'compute', 'branch', 'iter', 'loopend', 'par', 'error', 'return', 'exit', 'done']);
function dbgEntries() { const out = []; Object.values(A.W).forEach(W => Object.values(W.handlers).forEach(H => { if (W.node.external) return; const key = W.node.name + '.' + H.name; const e = A.entries.find(x => x.key === key); out.push({ key, entry: !!e, type: e ? e.type : 'call', label: key }); })); return out.sort((a, b) => (b.entry - a.entry)); }
function dbgStart(key) {
  if (!A.valid) { toast('Fix the Build errors first. Stepping needs code that parses.'); return; }
  if (!key) { const e = A.entries.find(x => x.type === 'request') || A.entries[0]; if (!e) { toast('No entry points yet.'); return; } key = e.key; }
  ST.dbg = { key, branch: ST.dbgBranch || 'ask', speed: ST.dbgSpeed || 'normal', seed: (ST.dbg && ST.dbg.seed) || 7, runs: [{ key, ctx: null }], runIdx: 0, answers: [], vis: [], pos: -1, playing: false, finished: false, pendingAsk: null };
  dbgReset(); ST.bSel = null; render(); dbgForward();
}
function dbgReset() { const D = ST.dbg; D.db = mockDB(ST.build, D.seed); D.db0 = {}; Object.keys(D.db).forEach(k => { if (k[0] !== '_') D.db0[k] = D.db[k].map(r => Object.assign({}, r)); }); D.brng = mkRng(D.seed * 31 + 5); D.ansI = 0; D.gen = dbgGen(D); D.vis = []; D.pos = -1; D.finished = false; D.pendingAsk = null; D.runIdx = 0; D.A = A; D.touched = {}; }
function* dbgGen(D) { let i = 0; while (i < D.runs.length) { const r = D.runs[i]; yield* runEntry(D.A, ST.build, D.db, r.key, { ctx: r.ctx || undefined, odds: {}, maxIter: 6 }); i++; } }
const ctxCopy = c => { const o = {}; Object.keys(c || {}).forEach(k => { if (k[0] !== '_') o[k] = c[k]; }); return o; };
function dbgPull() {
  const D = ST.dbg; if (D.finished || D.pendingAsk) return null;
  const x = D.gen.next(D._send); D._send = undefined;
  if (x.done) { D.finished = true; return null; }
  const e = x.value; e.ctx = ctxCopy(D.db._ctx); e.run = D.runIdx;
  if (e.t === 'data' || e.t === 'publish') { e.table = (D.db[e.d] || []).map(r => Object.assign({}, r)); const key = keyOf(D.A.D[e.d] || {}); (e.rows || (e.msg ? [e.msg] : [])).forEach(r => { if (e.op !== 'read' && r) (D.touched[e.d] || (D.touched[e.d] = new Set())).add(key ? r[key] : JSON.stringify(r)); }); }
  if (e.t === 'ask') {
    if (D.ansI < D.answers.length) { D._send = D.answers[D.ansI++].v; }
    else if (D.branch === 'ask') { D.pendingAsk = e; }
    else { const v = D.branch === 'odds' ? D.brng() < e.p : e.p >= 0.5; D.answers.push({ v, by: D.branch }); D.ansI++; D._send = v; }
    return e;
  }
  if (e.t === 'branch') { const a = D.answers[D.ansI - 1]; e.by = a ? a.by : 'odds'; }
  if (e.t === 'done') { D.runIdx++; if (D.runIdx >= D.runs.length) D.atEnd = true; }
  D.vis.push(e); return e;
}
function dbgForward() {
  const D = ST.dbg; if (!D) return false;
  if (D.pos < D.vis.length - 1) { D.pos++; dbgUpdate(true); return true; }
  if (D.atEnd && D.runIdx >= D.runs.length) { D.playing = false; dbgUpdate(false); return false; }
  for (let i = 0; i < 400; i++) { const e = dbgPull(); if (!e) break; if (e.t !== 'ask') { D.pos = D.vis.length - 1; dbgUpdate(true); return true; } if (D.pendingAsk) break; }
  D.playing = false; dbgUpdate(false); return false;
}
function dbgBack() { const D = ST.dbg; if (!D || D.pos <= 0) return; D.playing = false; D.pos--; dbgUpdate(true); }
function dbgOver() {
  const D = ST.dbg; const cur = D.vis[D.pos]; if (!cur || cur.t !== 'call') return dbgForward();
  const depth = cur.depth; for (let i = 0; i < 2000; i++) { if (!dbgForwardQuiet()) break; const e = D.vis[D.pos]; if (e.t === 'back' && e.depth === depth) break; }
  dbgUpdate(true);
}
function dbgForwardQuiet() { const D = ST.dbg; if (D.pos < D.vis.length - 1) { D.pos++; return true; } if (D.atEnd && D.runIdx >= D.runs.length) return false; for (let i = 0; i < 400; i++) { const e = dbgPull(); if (!e) return false; if (e.t !== 'ask') { D.pos = D.vis.length - 1; return true; } if (D.pendingAsk) return false; } return false; }
function dbgToEnd() { const D = ST.dbg; for (let i = 0; i < 5000; i++) if (!dbgForwardQuiet()) break; D.playing = false; dbgUpdate(true); }
function dbgAnswer(v, by) { const D = ST.dbg; if (!D || !D.pendingAsk) return; D.answers.push({ v, by: by || 'you' }); D.ansI++; D._send = v; D.pendingAsk = null; dbgForward(); if (D.playing) dbgTick(); }
let dbgT = null;
function dbgTick() { clearTimeout(dbgT); const D = ST.dbg; if (!D || !D.playing) return; dbgT = setTimeout(() => { if (!ST.dbg || !ST.dbg.playing) return; if (!dbgForward()) { ST.dbg.playing = false; renderDbgDock(); return; } if (ST.dbg.pendingAsk) { ST.dbg.playing = false; renderDbgDock(); return; } dbgTick(); }, DBG_MS[D.speed]); }
function dbgStop() { clearTimeout(dbgT); ST.dbg = null; render(); }
function dbgRestart(newData) { const D = ST.dbg; if (!D) return; clearTimeout(dbgT); D.playing = false; if (newData) D.seed++; D.answers = []; D.runs = D.runs.slice(0, 1); D.atEnd = false; dbgReset(); dbgForward(); }

/* ---------- words for each step ---------- */
const OPV = { read: 'Reads', insert: 'Inserts into', update: 'Updates', upsert: 'Upserts into', delete: 'Deletes from' };
function dbgText(e) {
  const H = e.w && ST.dbg.A.W[e.w] ? ST.dbg.A.W[e.w].handlers[e.h] : null;
  switch (e.t) {
    case 'start': return e.type === 'file' ? `A file lands in ${e.data}` : e.type === 'message' ? `A message arrives on ${e.data}` : e.type === 'schedule' ? `The schedule fires` : `A request arrives for ${e.w}.${e.h}`;
    case 'enter': return `${e.w}.${e.h} starts${e.ext ? ' (outside service)' : ''}`;
    case 'call': return `Calls ${e.to}.${e.th} and waits`;
    case 'back': return `Back in ${e.w}.${e.h}${e.outcome === 'error' ? ' — the call failed' : ''}`;
    case 'exit': return `${e.w}.${e.h} finishes${e.outcome === 'error' ? ' with an error' : ''}`;
    case 'data': { const k = keyOf(ST.dbg.A.D[e.d] || {}); const id = e.rows && e.rows[0] && k ? e.rows[0][k] : '';
      if (e.op === 'read') return e.rows && e.rows.length ? `Reads ${e.d}${e.by ? ' by ' + e.by : ''} → ${e.count > 1 ? `${fmtInt(e.count)} rows (showing ${e.rows.length})` : id ? id : '1 row'}${e.scan ? ' · full scan' : ''}` : `Reads ${e.d}${e.by ? ' by ' + e.by : ''} → nothing found`;
      if (e.change === 'new') return `${e.op === 'upsert' ? 'Upserts' : 'Inserts'} a new ${e.d} row ${id}`;
      if (e.change === 'update') return `${e.op === 'upsert' ? 'Upserts' : 'Updates'} ${e.d} ${id}: ${(e.changed || []).map(f => `${f} ${fmtVal(e.before[f])} → ${fmtVal(e.rows[0][f])}`).join(', ')}`;
      if (e.change === 'delete') return `Deletes ${e.d} ${id}`;
      return `${OPV[e.op] || e.op} ${e.d}`; }
    case 'publish': return `Publishes to ${e.d}${e.consumers.length ? ` · ${e.consumers.join(', ')} picks it up later` : ' · nobody listens yet'}`;
    case 'compute': return e.ext ? `${e.w} responds after about ${e.ms} ms` : `Computes for ${e.ms} ms`;
    case 'branch': return `if ${e.cond}: ${e.taken ? 'yes, runs the block' : 'no, skips it'} ${e.by === 'you' ? '(your choice)' : e.by === 'main' ? '(likelier side)' : `(odds ${(e.p * 100).toFixed(e.p < 0.1 ? 1 : 0)}%)`}`;
    case 'iter': return e.file ? `Row ${e.i} of ${fmtInt(e.n)} in the file${e.n > e.shown ? ` (stepping through the first ${e.shown})` : ''}` : `Loop over ${e.item}: ${e.i} of ${e.n}${e.par > 1 ? `, ${e.par} at a time` : ''}${e.n > e.shown ? ` (showing ${e.shown})` : ''}`;
    case 'loopend': return `Loop done: ${fmtInt(e.n)} ${e.file ? 'rows' : 'items'}${e.n > e.shown ? `, ${fmtInt(e.n - e.shown)} not shown` : ''}`;
    case 'par': return e.phase === 'start' ? `Starts ${e.n} things at the same time (shown one by one)` : 'All parallel work finished';
    case 'error': return `Stops with error ${e.code}`;
    case 'return': return 'Returns early';
    case 'done': return e.outcome === 'error' ? 'Done: the request ended with an error' : 'Done: finished successfully';
  }
  return e.t;
}
function dbgIcon(e) { return ({ start: IC.play, enter: IC.code, call: IC.req, back: IC.undo, exit: IC.check, data: e.op === 'read' ? IC.table : IC.plus, publish: IC.msg, compute: IC.clock, branch: IC.route, iter: IC.restart, loopend: IC.check, par: IC.split, error: IC.x, return: IC.undo, done: IC.check })[e.t] || IC.chev; }
function dbgColor(e) { return e.t === 'data' ? (e.op === 'read' ? 'var(--read)' : 'var(--write)') : e.t === 'publish' ? 'var(--pub)' : e.t === 'error' || (e.t === 'done' && e.outcome === 'error') ? 'var(--bad)' : e.t === 'branch' || e.t === 'iter' ? 'var(--repl)' : 'var(--wl)'; }
function fmtVal(v) { if (v == null) return '—'; if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`; if (typeof v === 'object') return Object.keys(v).length ? '{…}' : '{}'; const s = String(v); return s.length > 22 ? s.slice(0, 21) + '…' : s; }

/* ---------- views ---------- */
function dbgCurLine(e) { return e && e.line; }
function dbgStack(D) { const st = []; for (let i = 0; i <= D.pos; i++) { const e = D.vis[i]; if (e.t === 'start') st.length = 0; if (e.t === 'enter') st.push(e.w + '.' + e.h); if (e.t === 'exit') st.pop(); } return st; }
function rowsTable(dn, rows, opt) {
  const d = ST.dbg.A.D[dn]; const fields = (d && d.fields || []).map(f => f.name); opt = opt || {};
  if (!rows.length) return `<div class="muted" style="font-size:12px">${opt.empty || 'No rows'}</div>`;
  return `<div class="tscroll"><table class="mtbl"><thead><tr>${fields.map(f => `<th>${esc(f)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => { const cls = opt.cls ? opt.cls(r) : ''; return `<tr class="${cls}">${fields.map(f => `<td class="${opt.changed && opt.changed.includes(f) ? 'chg' : ''}" title="${esc(typeof r[f] === 'object' ? JSON.stringify(r[f]) : r[f])}">${esc(fmtVal(r[f]))}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`;
}
function renderDbgPanel() {
  const el = $('#b-panel'); const D = ST.dbg; if (!el || !D) return;
  const e = D.vis[D.pos]; const prev = D.vis[D.pos - 1];
  const wNode = e && e.w ? ST.build.workloads.find(w => w.name === (e.t === 'call' ? e.w : e.w)) : null;
  const askNow = D.pendingAsk && D.pos === D.vis.length - 1 ? D.pendingAsk : null;
  const line = askNow && askNow.w === (e && e.w) ? askNow.line : dbgCurLine(e);
  let code = '';
  if (wNode) { const html = highlightCode(wNode.code, new Set()).split('\n'); code = `<div class="codeview" id="dbg-code">${html.map((l, i) => `<div class="cl ${i + 1 === line ? 'cur' : ''}"><span class="ln">${i + 1}</span><span class="lc">${l || ' '}</span></div>`).join('')}</div>`; }
  const ctx = e ? e.ctx : {}; const pctx = prev ? prev.ctx : {};
  const keys = Object.keys(ctx);
  let dataCard = '';
  if (e && e.t === 'data') {
    const k = keyOf(D.A.D[e.d] || {});
    dataCard = `<div class="q dbgdata"><div class="qh">${svg(dbgIcon(e), 14, dbgColor(e))}${esc(OPV[e.op] || e.op)} ${esc(e.d)}${e.by ? ` <span class="muted" style="font-weight:400">by ${esc(e.by)}${ctx[e.by] !== undefined ? ' = ' + esc(fmtVal(ctx[e.by])) : ''}</span>` : ''}</div>
      ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}${e.scan ? `<div class="note" style="color:var(--warn)">${esc(e.by)} isn’t indexed: on real data this reads every row (${fmtInt((D.A.D[e.d] || {}).rows || 0)}).</div>` : ''}
      ${e.change === 'update' ? `<div class="lbl">Before</div>${rowsTable(e.d, [e.before], { changed: e.changed })}<div class="lbl">After</div>${rowsTable(e.d, e.rows, { changed: e.changed, cls: () => 'upd' })}` : rowsTable(e.d, e.rows || [], { cls: () => e.change === 'new' ? 'new' : e.change === 'delete' ? 'del' : '', empty: 'Nothing found.' })}
      ${e.op !== 'read' ? `<div class="note">${esc(e.d)} now has ${fmtInt((e.table || []).length)} mock rows.</div>` : ''}</div>`;
  } else if (e && e.t === 'publish') {
    dataCard = `<div class="q dbgdata"><div class="qh">${svg(IC.msg, 14, 'var(--pub)')}Message on ${esc(e.d)}</div>${rowsTable(e.d, [e.msg], { cls: () => 'new' })}<div class="note">${e.consumers.length ? `${esc(e.consumers.join(', '))} will handle it after this request finishes. Waiting in ${esc(e.d)}: ${e.queued}.` : 'No workload listens to it yet.'}</div></div>`;
  }
  // all mock data at this step
  const snapAt = dn => { for (let i = D.pos; i >= 0; i--) { const x = D.vis[i]; if (x.table && x.d === dn) return x.table; } return D.db0[dn] || []; };
  const touchedAt = dn => { const s = new Set(); const k = keyOf(D.A.D[dn] || {}); for (let i = 0; i <= D.pos; i++) { const x = D.vis[i]; if (x.d === dn && x.op !== 'read' && x.t === 'data') (x.rows || []).forEach(r => s.add(k ? r[k] : '')); if (x.d === dn && x.t === 'publish') s.add(k ? x.msg[k] : JSON.stringify(x.msg)); } return s; };
  const tables = ST.build.data.map(d => { const rows = snapAt(d.name); const t = touchedAt(d.name); const k = keyOf(d); return `<details class="mock" ${e && e.d === d.name ? 'open' : ''}><summary>${svg(IC.chev, 12)}<span class="mono">${esc(d.name)}</span><span class="muted" style="font-weight:400;font-size:12px">${rows.length} row${rows.length === 1 ? '' : 's'}${t.size ? ` · ${t.size} changed in this run` : ''}</span></summary>${rowsTable(d.name, rows, { cls: r => t.has(k ? r[k] : '') ? 'new' : '', empty: d.kind === 'queue' || d.kind === 'stream' || d.kind === 'topic' ? 'No messages yet.' : 'Empty.' })}</details>`; }).join('');
  el.innerHTML = `<div class="ph"><span class="ico" style="width:36px;height:36px;background:var(--accent-soft)">${svg(IC.step, 18, 'var(--accent)')}</span><div style="flex:1;min-width:0"><div class="lbl">Stepping through</div><select class="field" id="dbg-entry" data-ch="dbg-entry" style="font-weight:600;max-width:100%">${dbgEntries().map(x => `<option value="${esc(x.key)}" ${x.key === D.runs[0].key ? 'selected' : ''}>${esc(x.label)}${x.entry ? '' : ' (called by others)'}</option>`).join('')}</select></div><button type="button" class="ghost sm" data-act="dbg-stop">Stop</button></div>
    <div class="q"><div class="qh">${wNode ? `${esc(wNode.name)}${line ? ` <span class="muted" style="font-weight:400">line ${line}</span>` : ''}` : 'Code'}<span style="flex:1"></span>${wNode ? `<button type="button" class="link" style="font-size:12px" data-act="dbg-edit" data-id="${wNode.id}" data-line="${line || ''}">Edit this code</button>` : ''}</div>${code || '<div class="muted">Press Step to begin.</div>'}</div>
    <div class="q"><div class="qh">Call stack</div><div class="stack">${dbgStack(D).map((s, i, a) => `<div class="${i === a.length - 1 ? 'top1' : ''}">${'&nbsp;'.repeat(i * 2)}${i ? '└ ' : ''}${esc(s)}</div>`).join('') || '<span class="muted">Empty</span>'}</div></div>
    ${dataCard}
    <div class="q"><div class="qh">What the request knows<span class="muted" style="font-weight:400;font-size:12px">values carried between steps</span></div>${keys.length ? `<div class="ctxv">${keys.map(k => `<div class="${pctx[k] !== ctx[k] ? 'chg' : ''}"><span class="mono">${esc(k)}</span><span class="mono" title="${esc(typeof ctx[k] === 'object' ? JSON.stringify(ctx[k]) : ctx[k])}">${esc(fmtVal(ctx[k]))}</span></div>`).join('')}</div>` : '<div class="muted" style="font-size:12.5px">Nothing yet. Reads and inserts fill this in; later steps use it to find related rows.</div>'}</div>
    <div class="q"><div class="qh">Mock data<span style="flex:1"></span><button type="button" class="link" style="font-size:12px" data-act="dbg-newdata">New mock data</button></div><div class="note">Generated from your fields. Fields that point to other data use real ids from there, so rows link up.</div>${tables}</div>`;
  const cv = $('#dbg-code .cur'); if (cv) { const box = $('#dbg-code'); box.scrollTop = Math.max(0, cv.offsetTop - box.clientHeight / 2); }
}
function renderDbgDock() {
  const el = $('#b-probs'); const D = ST.dbg; if (!el || !D) return; el.classList.add('dock');
  const e = D.vis[D.pos]; const ended = D.atEnd && D.pos === D.vis.length - 1;
  const lastDone = ended ? e : null;
  const pubs = []; if (lastDone) { for (let i = D.vis.length - 1; i >= 0; i--) { const x = D.vis[i]; if (x.run !== e.run) break; if (x.t === 'publish') x.consumers.forEach(c => pubs.push({ c, msg: x.msg, d: x.d })); } }
  const ask = D.pendingAsk && D.pos === D.vis.length - 1 ? D.pendingAsk : null;
  el.innerHTML = `<div class="dbgbar" role="toolbar" aria-label="Step controls">
      <button type="button" class="iconbtn" data-act="dbg-restart" title="Restart" aria-label="Restart">${svg(IC.restart, 16)}</button>
      <button type="button" class="iconbtn" data-act="dbg-back" title="Back one step (←)" aria-label="Back" ${D.pos <= 0 ? 'disabled' : ''}>${svg(IC.back, 16)}</button>
      <button type="button" class="btn sm" data-act="dbg-play" style="min-width:84px" ${ask || ended ? 'disabled' : ''}>${svg(D.playing ? IC.pause : IC.play, 12, 'currentColor')}${D.playing ? 'Pause' : 'Play'}</button>
      <button type="button" class="ghost sm" data-act="dbg-step" title="Next step (→ or space)" ${ask || ended ? 'disabled' : ''}>${svg(IC.step, 13)}Step</button>
      <button type="button" class="ghost sm" data-act="dbg-over" title="Run the whole call and stop when it returns" ${ask || ended || !e || e.t !== 'call' ? 'disabled' : ''}>${svg(IC.over, 13)}Step over call</button>
      <button type="button" class="ghost sm" data-act="dbg-end" ${ask || ended ? 'disabled' : ''}>To the end</button>
      <span class="sep"></span>
      <span class="lbl">Speed</span><div class="seg">${['slow', 'normal', 'fast'].map(k => `<button type="button" class="${D.speed === k ? 'on' : ''}" data-act="dbg-speed" data-v="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <span class="lbl">Branches</span><div class="seg">${[['ask', 'Ask me'], ['odds', 'Use the odds'], ['main', 'Likelier side']].map(([k, l]) => `<button type="button" class="${D.branch === k ? 'on' : ''}" data-act="dbg-branch" data-v="${k}">${l}</button>`).join('')}</div>
      <span style="flex:1"></span><span class="muted num" style="font-size:12px">step ${D.pos + 1} of ${D.vis.length}${D.atEnd ? '' : '+'}</span></div>
    ${ask ? `<div class="askrow" role="group" aria-label="Branch decision">${svg(IC.route, 16, 'var(--repl)')}<span style="flex:1"><b>${esc(ask.w)} line ${ask.line}:</b> <code>if ${esc(ask.cond)}</code> — which way? <span class="muted">Usually ${(ask.p * 100).toFixed(ask.p < 0.1 ? 1 : 0)}% yes.</span></span><button type="button" class="btn sm" data-act="dbg-ans" data-v="1">Yes, run the block <kbd>Y</kbd></button><button type="button" class="ghost sm" data-act="dbg-ans" data-v="0">${ask.hasElse ? 'No, run else' : 'No, skip it'} <kbd>N</kbd></button></div>` : ''}
    ${lastDone ? `<div class="askrow" style="background:${e.outcome === 'error' ? 'var(--bad-soft)' : 'var(--good-soft)'}">${svg(e.outcome === 'error' ? IC.x : IC.check, 16, e.outcome === 'error' ? 'var(--bad)' : 'var(--good)')}<span style="flex:1"><b>${e.outcome === 'error' ? 'Ended with an error.' : 'Finished.'}</b> ${D.vis.filter(x => x.run === e.run && x.t === 'data' && x.op !== 'read').length} writes, ${D.vis.filter(x => x.run === e.run && x.t === 'data' && x.op === 'read').length} reads, ${D.vis.filter(x => x.run === e.run && x.t === 'call').length} calls.</span>${pubs.slice(0, 3).map((p, i) => `<button type="button" class="ghost sm" data-act="dbg-consume" data-i="${i}">${svg(IC.play, 11)}Then run ${esc(p.c)} on that message</button>`).join('')}<button type="button" class="ghost sm" data-act="dbg-restart">Run again</button></div>` : ''}
    <ol class="steplog" id="dbg-log">${D.vis.map((x, i) => `<li class="${i === D.pos ? 'cur' : i > D.pos ? 'fut' : ''}"><button type="button" data-act="dbg-jump" data-i="${i}" style="padding-left:${8 + (x.depth || 0) * 16}px">${svg(dbgIcon(x), 13, dbgColor(x))}<span class="tx">${esc(dbgText(x))}</span>${x.line ? `<span class="muted num">${esc(x.w || '')}:${x.line}</span>` : ''}</button></li>`).join('')}</ol>`;
  ST._dbgPubs = pubs;
  const cur = $('#dbg-log li.cur'); if (cur) { const L = $('#dbg-log'); if (cur.offsetTop < L.scrollTop || cur.offsetTop > L.scrollTop + L.clientHeight - 30) L.scrollTop = cur.offsetTop - L.clientHeight / 2; }
}
function dbgUpdate(animate) { renderDbgPanel(); renderDbgDock(); dbgPaint(!animate); }

/* ---------- canvas animation ---------- */
function nodeRect(kind, name) { const n = kind === 'w' ? ST.build.workloads.find(x => x.name === name) : ST.build.data.find(x => x.name === name); if (!n) return null; return { x: n.x, y: n.y, w: kind === 'w' ? WW : DW, h: kind === 'w' ? wH(n) : dH(n), n }; }
function dbgPaint(still) {
  const cv = $('#b-canvas'); const D = ST.dbg; if (!cv || !D) return;
  cv.querySelectorAll('.dbg-on,.dbg-stack,.dbg-touch,.dbg-row').forEach(x => x.classList.remove('dbg-on', 'dbg-stack', 'dbg-touch', 'dbg-row'));
  cv.querySelectorAll('.dbg-badge').forEach(x => x.remove());
  let ov = $('#dbg-ov'); if (!ov) { cv.insertAdjacentHTML('beforeend', '<svg id="dbg-ov" class="edges" style="z-index:6"></svg>'); ov = $('#dbg-ov'); }
  ov.setAttribute('width', cv.style.width.replace('px', '')); ov.setAttribute('height', cv.style.height.replace('px', ''));
  const e = D.vis[D.pos]; if (!e) { ov.innerHTML = ''; return; }
  const el = (k, name) => { const n = k === 'w' ? ST.build.workloads.find(x => x.name === name) : ST.build.data.find(x => x.name === name); return n ? cv.querySelector(`[data-node="${k}:${n.id}"]`) : null; };
  dbgStack(D).forEach(s => { const x = el('w', s.split('.')[0]); if (x) x.classList.add('dbg-stack'); });
  const wEl = e.w ? el('w', e.w) : null;
  if (wEl) { wEl.classList.add('dbg-on'); const hs = wHandlers(nodeRect('w', e.w).n); const i = hs.findIndex(h => h.name === e.h); const rows = wEl.querySelectorAll('.row'); if (rows[i]) rows[i].classList.add('dbg-row'); }
  // nearest open loop for the badge
  let loop = null; for (let i = D.pos; i >= 0; i--) { const x = D.vis[i]; if (x.t === 'loopend' && x.w === e.w) break; if (x.t === 'iter' && x.w === e.w && x.h === e.h) { loop = x; break; } if (x.t === 'enter' && x.w === e.w) break; }
  if (wEl && loop) wEl.querySelector('.hd').insertAdjacentHTML('beforeend', `<span class="dbg-badge" style="background:var(--repl);color:#fff">${loop.file ? 'row' : 'loop'} ${loop.i}/${fmtN(loop.n)}</span>`);
  let from = null, to = null, col = 'var(--accent)', label = '';
  if (e.t === 'call') { from = nodeRect('w', e.w); to = nodeRect('w', e.to); col = 'var(--ink-2)'; label = 'call'; }
  else if (e.t === 'back') { from = nodeRect('w', e.from); to = nodeRect('w', e.w); col = 'var(--ink-2)'; label = e.outcome === 'error' ? 'error' : 'reply'; }
  else if (e.t === 'data' || e.t === 'publish') {
    const dEl = el('d', e.d); if (dEl) { dEl.classList.add('dbg-touch'); dEl.style.setProperty('--tc', e.t === 'publish' ? 'var(--pub)' : e.op === 'read' ? 'var(--read)' : 'var(--write)'); dEl.querySelector('.hd').insertAdjacentHTML('beforeend', `<span class="dbg-badge" style="background:${e.t === 'publish' ? 'var(--pub)' : e.op === 'read' ? 'var(--read)' : 'var(--write)'};color:#fff">${e.t === 'publish' ? 'publish' : e.op}${e.change === 'new' ? ' +1' : ''}</span>`); }
    if (e.t === 'data' && e.op === 'read') { from = nodeRect('d', e.d); to = nodeRect('w', e.w); col = 'var(--read)'; label = e.rows && e.rows.length ? `${e.rows.length} row${e.rows.length > 1 ? 's' : ''}` : 'none'; }
    else { from = nodeRect('w', e.w); to = nodeRect('d', e.d); col = e.t === 'publish' ? 'var(--pub)' : 'var(--write)'; label = e.t === 'publish' ? 'message' : e.op; }
  }
  ov.innerHTML = '';
  if (from && to) {
    const a = [from.x + from.w / 2, from.y + 19], b = [to.x + to.w / 2, to.y + 19];
    const sx = to.x > from.x + from.w ? from.x + from.w : to.x + to.w < from.x ? from.x : a[0]; const ex = to.x > from.x + from.w ? to.x : to.x + to.w < from.x ? to.x + to.w : b[0];
    const p0 = [sx, a[1]], p1 = [ex, b[1]]; const dx = Math.max(40, Math.abs(p1[0] - p0[0]) * .45) * (p1[0] >= p0[0] ? 1 : -1);
    const d = `M${p0[0]} ${p0[1]} C${p0[0] + dx} ${p0[1]} ${p1[0] - dx} ${p1[1]} ${p1[0]} ${p1[1]}`;
    ov.innerHTML = `<path id="dbg-path" d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-dasharray="5 5" opacity=".9"/><g id="dbg-dot"><circle r="7" fill="${col}"/><circle r="12" fill="${col}" opacity=".22"/>${label ? `<text y="-14" text-anchor="middle" font-size="11" font-weight="600" fill="${col}" font-family="var(--font)">${esc(label)}</text>` : ''}</g>`;
    const path = $('#dbg-path'), dot = $('#dbg-dot'); const L = path.getTotalLength(); const dur = still ? 0 : Math.min(650, DBG_MS[D.speed] * 0.75); const t0 = performance.now();
    const go = now => { const k = dur ? Math.min(1, (now - t0) / dur) : 1; const q = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; const pt = path.getPointAtLength(L * q); dot.setAttribute('transform', `translate(${pt.x},${pt.y})`); if (k < 1 && ST.dbg) requestAnimationFrame(go); };
    requestAnimationFrame(go);
  }
  if (e.t === 'publish' && e.consumers.length) { const f = nodeRect('d', e.d); e.consumers.forEach(c => { const t = nodeRect('w', c.split('.')[0]); if (!f || !t) return; ov.insertAdjacentHTML('beforeend', `<path d="M${f.x + f.w / 2} ${f.y + f.h} L${t.x + t.w / 2} ${t.y}" stroke="var(--pub)" stroke-width="1.6" stroke-dasharray="2 5" fill="none" opacity=".8"/><text x="${t.x + t.w / 2}" y="${t.y - 6}" text-anchor="middle" font-size="11" fill="var(--pub)" font-family="var(--font)">later</text>`); }); }
  const focus = wEl || null; if (focus && !still) { const wrap = $('#b-cwrap'); const r = focus.getBoundingClientRect(), wr = wrap.getBoundingClientRect(); if (r.left < wr.left || r.right > wr.right || r.top < wr.top || r.bottom > wr.bottom) focus.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }
}

/* ---------- actions ---------- */
ACT['dbg-start'] = el => dbgStart(el.dataset.k || (ST.dbgKey || null));
ACT['dbg-stop'] = () => dbgStop();
ACT['dbg-step'] = () => { ST.dbg.playing = false; dbgForward(); };
ACT['dbg-back'] = () => dbgBack();
ACT['dbg-over'] = () => { ST.dbg.playing = false; dbgOver(); };
ACT['dbg-end'] = () => dbgToEnd();
ACT['dbg-play'] = () => { const D = ST.dbg; D.playing = !D.playing; renderDbgDock(); if (D.playing) { dbgForward(); dbgTick(); } };
ACT['dbg-speed'] = el => { ST.dbg.speed = ST.dbgSpeed = el.dataset.v; renderDbgDock(); };
ACT['dbg-branch'] = el => { ST.dbg.branch = ST.dbgBranch = el.dataset.v; if (ST.dbg.pendingAsk && el.dataset.v !== 'ask') { const p = ST.dbg.pendingAsk; dbgAnswer(el.dataset.v === 'odds' ? ST.dbg.brng() < p.p : p.p >= 0.5, el.dataset.v); } else renderDbgDock(); };
ACT['dbg-ans'] = el => dbgAnswer(el.dataset.v === '1');
ACT['dbg-jump'] = el => { ST.dbg.playing = false; ST.dbg.pos = +el.dataset.i; dbgUpdate(true); };
ACT['dbg-restart'] = () => dbgRestart(false);
ACT['dbg-newdata'] = () => { dbgRestart(true); toast('Fresh mock data. Same code, new values.'); };
ACT['dbg-consume'] = el => { const p = ST._dbgPubs[+el.dataset.i]; const D = ST.dbg; if (!p) return; D.runs.push({ key: p.c, ctx: Object.assign({}, p.msg) }); D.atEnd = false; D.finished = false; dbgForward(); };
ACT['dbg-edit'] = el => { const id = el.dataset.id, ln = el.dataset.line; dbgStop(); ST.bSel = { t: 'w', id }; render(); if (ln) setTimeout(() => ACT['b-goline']({ dataset: { line: ln } }), 40); };
CH['dbg-entry'] = el => { ST.dbgKey = el.value; dbgStart(el.value); };
document.addEventListener('keydown', ev => {
  if (!ST.dbg || ST.mode !== 'build') return; const inField = /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || ''); if (inField) return;
  if (ev.key === 'ArrowRight' || ev.key === ' ') { ev.preventDefault(); if (!ST.dbg.pendingAsk) { ST.dbg.playing = false; dbgForward(); } }
  else if (ev.key === 'ArrowLeft') { ev.preventDefault(); dbgBack(); }
  else if (ev.key.toLowerCase() === 'y' && ST.dbg.pendingAsk) dbgAnswer(true);
  else if (ev.key.toLowerCase() === 'n' && ST.dbg.pendingAsk) dbgAnswer(false);
  else if (ev.key === 'Escape') { ev.stopImmediatePropagation(); dbgStop(); }
}, true);
