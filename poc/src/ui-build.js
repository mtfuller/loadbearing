/* ===================== Build mode ===================== */
const WW = 214, DW = 198;
const KIND_NOTE = {
  document: 'Nested records, like JSON, looked up by key or an indexed field.',
  table: 'Rows with a key. Lookups by the key or an indexed field are fast; anything else scans.',
  kv: 'Values looked up by one key. No queries on other fields.',
  queue: 'Messages, each handled once by one worker.',
  stream: 'An ordered log of events. Each consumer reads all of it, in order per key.',
  topic: 'Each message is copied to every subscriber.',
  file: 'Files that land and get processed, like CSV feeds. Starts “when file” workloads.',
  blob: 'Objects written and read whole, like reports or images.'
};
function wHandlers(w) { const X = A.W[w.name]; return X && X.node === w ? X.parsed.handlers : parseCode(w.code).handlers; }
function wH(w) { return 38 + Math.max(1, wHandlers(w).length) * 26 + 8; }
function dShown(d) { return (d.fields || []).slice(0, 7); }
function dH(d) { return 38 + Math.max(1, dShown(d).length) * 21 + ((d.fields || []).length > 7 ? 20 : 0) + 8; }
function probsFor(kind, id) { return A.problems.filter(p => p.kind === kind && p.id === id); }

function renderBuild(v) {
  keepScroll(['b-cwrap', 'b-panel', 'b-rail'], () => {
    v.innerHTML = `<div class="panes"><aside class="rail" id="b-rail" aria-label="Build contents"></aside>
      <section class="center"><div class="ctool" data-fb="Build toolbar"><span class="lbl">Build</span><span class="muted" style="font-size:12.5px">Arrows are drawn from the code.</span><span style="flex:1"></span>
        <span style="display:inline-flex;align-items:center;gap:2px" role="group" aria-label="Zoom"><button type="button" class="iconbtn" data-act="b-zoom" data-d="-1" aria-label="Zoom out">−</button><span class="num muted" id="b-zl" style="width:44px;text-align:center;font-size:12px"></span><button type="button" class="iconbtn" data-act="b-zoom" data-d="1" aria-label="Zoom in">+</button><button type="button" class="ghost sm" data-act="b-zoom" data-d="0">Fit</button></span>
        <button type="button" class="ghost sm" data-act="b-add-w">${svg(IC.code, 14)}Add workload</button><button type="button" class="ghost sm" data-act="b-add-d">${svg(IC.table, 14)}Add data</button>${ST.dbg ? `<button type="button" class="ghost sm on" data-act="dbg-stop">${svg(IC.stop, 12)}Stop stepping</button>` : `<button type="button" class="btn sm" data-act="dbg-start" ${A.valid ? '' : 'disabled title="Fix errors first"'}>${svg(IC.play, 11, 'currentColor')}Step through</button>`}</div>
        <div class="cwrap" id="b-cwrap" data-fb="Build canvas"><div id="b-sizer" style="position:relative"><div class="canvas" id="b-canvas" style="transform-origin:0 0"></div></div></div>
        <div class="probs" id="b-probs" data-fb="Build checks"></div></section>
      <aside class="panel" id="b-panel" aria-label="Editor"></aside></div>`;
    renderBRail(); renderBCanvas(); renderBProbs(); renderBPanel();
  });
}
function renderBRail() {
  const el = $('#b-rail'); if (!el) return;
  const sel = ST.bSel || {};
  el.innerHTML = `
    <div class="rsec"><div class="hd"><span class="lbl" style="flex:1">Workloads</span><button type="button" class="iconbtn" data-act="b-add-w" aria-label="Add workload" title="Add workload">${svg(IC.plus, 15)}</button></div>
      ${ST.build.workloads.map(w => { const e = probsFor('workload', w.id).filter(p => p.sev === 'error').length; return `<button type="button" class="ritem ${sel.t === 'w' && sel.id === w.id ? 'on' : ''}" data-act="b-sel" data-t="w" data-id="${w.id}"><span class="ico" style="background:${w.external ? 'var(--ext-soft)' : 'var(--wl-soft)'}">${svg(w.external ? IC.ext : IC.code, 14, w.external ? 'var(--ext)' : 'var(--wl)')}</span><span class="nm">${esc(w.name)}</span>${e ? `<span class="tag bad">${e}</span>` : `<span class="muted num" style="font-size:11.5px">${wHandlers(w).length}</span>`}</button>`; }).join('')}</div>
    <div class="rsec"><div class="hd"><span class="lbl" style="flex:1">Data</span><button type="button" class="iconbtn" data-act="b-add-d" aria-label="Add data" title="Add data">${svg(IC.plus, 15)}</button></div>
      ${ST.build.data.map(d => { const [bg, fg, ic] = KIND_STYLE[d.kind]; const e = probsFor('data', d.id).filter(p => p.sev === 'error').length; return `<button type="button" class="ritem ${sel.t === 'd' && sel.id === d.id ? 'on' : ''}" data-act="b-sel" data-t="d" data-id="${d.id}"><span class="ico" style="background:${bg}">${svg(ic, 14, fg)}</span><span class="nm">${esc(d.name)}</span>${e ? `<span class="tag bad">${e}</span>` : `<span class="muted" style="font-size:11.5px">${DATA_KINDS[d.kind].label}</span>`}</button>`; }).join('')}</div>
    <div class="rsec" data-fb="Entry points"><div class="hd"><span class="lbl">Entry points</span></div><div class="muted" style="font-size:12px;margin-bottom:2px">Found in the code: things that start work.</div>
      ${A.entries.length ? A.entries.map(e => `<div class="eprow ${ST.dbg && ST.dbg.runs[0].key === e.key ? 'on' : ''}">${svg(TRIG_ICON[e.type], 14, 'var(--muted)')}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.type === 'request' ? e.w + '.' + e.h : e.label)}</span><button type="button" class="iconbtn" style="width:26px;height:26px" data-act="dbg-start" data-k="${esc(e.key)}" ${A.valid ? '' : 'disabled'} title="Step through ${esc(e.key)}" aria-label="Step through ${esc(e.key)}">${svg(IC.play, 12, 'var(--accent)')}</button></div>`).join('') : '<div class="muted" style="font-size:12.5px">None yet.</div>'}</div>`;
}
function rowY(n, kind, i) { return n.y + 38 + i * (kind === 'w' ? 26 : 21) + (kind === 'w' ? 13 : 10.5); }
function edgeD(S, yS, T, yT) {
  if (T.x >= S.x + S.w - 10) { const x1 = S.x + S.w, x2 = T.x, dx = Math.max(36, (x2 - x1) * 0.45); return [`M${x1} ${yS} C${x1 + dx} ${yS} ${x2 - dx} ${yT} ${x2} ${yT}`, [x1, yS, x1 + dx, yS, x2 - dx, yT, x2, yT]]; }
  if (T.x + T.w <= S.x + 10) { const x1 = S.x, x2 = T.x + T.w, dx = Math.max(36, (x1 - x2) * 0.45); return [`M${x1} ${yS} C${x1 - dx} ${yS} ${x2 + dx} ${yT} ${x2} ${yT}`, [x1, yS, x1 - dx, yS, x2 + dx, yT, x2, yT]]; }
  const x1 = S.x + S.w, x2 = T.x + T.w, mx = Math.max(x1, x2) + 56; return [`M${x1} ${yS} C${mx} ${yS} ${mx} ${yT} ${x2} ${yT}`, [x1, yS, mx, yS, mx, yT, x2, yT]];
}
function mid(p) { return [(p[0] + 3 * p[2] + 3 * p[4] + p[6]) / 8, (p[1] + 3 * p[3] + 3 * p[5] + p[7]) / 8]; }
function renderBCanvas() {
  const el = $('#b-canvas'); if (!el) return;
  const B = ST.build; const sel = ST.bSel || {};
  const rect = {}; B.workloads.forEach(w => rect['w:' + w.name] = { x: w.x, y: w.y, w: WW, h: wH(w), n: w, k: 'w' }); B.data.forEach(d => rect['d:' + d.name] = { x: d.x, y: d.y, w: DW, h: dH(d), n: d, k: 'd' });
  const W = Math.max(1200, ...Object.values(rect).map(r => r.x + r.w + 120)), H = Math.max(700, ...Object.values(rect).map(r => r.y + r.h + 80));
  const hIdx = (wn, hn) => { const w = rect['w:' + wn]; if (!w) return 0; const i = wHandlers(w.n).findIndex(h => h.name === hn); return Math.max(0, i); };
  const fIdx = (dn, fn) => { const d = rect['d:' + dn]; if (!d) return 0; const i = dShown(d.n).findIndex(f => f.name === fn); return i < 0 ? 0 : i; };
  let paths = '', labels = '';
  const hi = x => sel.id && ((sel.t === 'w' && rect['w:' + x] && rect['w:' + x].n.id === sel.id) || (sel.t === 'd' && rect['d:' + x] && rect['d:' + x].n.id === sel.id));
  const seenCall = new Set();
  A.calls.forEach(c => {
    const S = rect['w:' + c.from], T = rect['w:' + c.to]; if (!S || !T) return; const k = c.from + c.fromH + c.to + c.h; if (seenCall.has(k)) return; seenCall.add(k);
    const [d] = edgeD(S, rowY(S.n, 'w', hIdx(c.from, c.fromH)), T, rowY(T.n, 'w', hIdx(c.to, c.h)));
    const on = hi(c.from) || hi(c.to);
    paths += `<path d="${d}" fill="none" stroke="var(--ink-2)" stroke-width="${on ? 2.2 : 1.4}" opacity="${sel.id && !on ? .3 : .85}" marker-end="url(#m-ink)"/>`;
  });
  A.dataOps.forEach(o => {
    const S = rect['w:' + o.w], T = rect['d:' + o.d]; if (!S || !T) return;
    const r = o.ops.includes('read'), wr = o.ops.some(x => ['insert', 'update', 'upsert', 'delete'].includes(x)), pb = o.ops.includes('publish');
    const col = pb ? 'var(--pub)' : wr ? 'var(--write)' : 'var(--read)'; const mk = pb ? 'm-pub' : wr ? 'm-write' : 'm-read';
    const [d, pts] = edgeD(S, rowY(S.n, 'w', hIdx(o.w, o.hs[0])), T, T.y + 19);
    const on = hi(o.w) || hi(o.d);
    paths += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${on ? 2.2 : 1.4}" opacity="${sel.id && !on ? .25 : .9}" marker-end="url(#${mk})"/>`;
    if (sel.id && on) { const [mx, my] = mid(pts); const t = pb ? 'publishes' : r && wr ? 'reads, writes' : wr ? 'writes' : 'reads'; labels += `<g><rect x="${mx - t.length * 3.1 - 5}" y="${my - 8}" width="${t.length * 6.2 + 10}" height="16" rx="8" fill="var(--surface)" stroke="${col}" stroke-width=".8"/><text x="${mx}" y="${my + 3.5}" text-anchor="middle" font-size="10.5" fill="${col}" font-family="var(--font)">${t}</text></g>`; }
  });
  A.triggers.forEach(t => {
    const S = rect['d:' + t.d], T = rect['w:' + t.w]; if (!S || !T) return;
    const [d] = edgeD(S, S.y + 19, T, rowY(T.n, 'w', hIdx(t.w, t.h))); const on = hi(t.w) || hi(t.d);
    paths += `<path d="${d}" fill="none" stroke="var(--pub)" stroke-width="${on ? 2.2 : 1.4}" stroke-dasharray="6 4" opacity="${sel.id && !on ? .25 : .9}" marker-end="url(#m-pub)"/>`;
  });
  A.refs.forEach(r => {
    const S = rect['d:' + r.from], T = rect['d:' + r.to]; if (!S || !T) return;
    const [d] = edgeD(S, rowY(S.n, 'd', fIdx(r.from, r.field)), T, rowY(T.n, 'd', fIdx(r.to, r.toField))); const on = hi(r.from) || hi(r.to);
    paths += `<path d="${d}" fill="none" stroke="var(--muted)" stroke-width="${on ? 1.8 : 1.1}" stroke-dasharray="2 4" opacity="${sel.id && !on ? .25 : .8}" marker-end="url(#m-ref)"/>`;
  });
  const mk = (id, c) => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`;
  const nodes = B.workloads.map(w => {
    const hs = wHandlers(w); const errs = probsFor('workload', w.id).filter(p => p.sev === 'error').length;
    const entryKeys = new Set(A.entries.map(e => e.key));
    return `<div class="bn ${w.external ? 'ext' : ''} ${sel.t === 'w' && sel.id === w.id ? 'sel' : ''} ${errs ? 'err' : ''}" data-node="w:${w.id}" style="left:${w.x}px;top:${w.y}px;width:${WW}px;height:${wH(w)}px" data-fb="Workload ${esc(w.name)}" tabindex="0" role="button" aria-label="Workload ${esc(w.name)}">
      <div class="hd"><span class="ico" style="width:22px;height:22px;background:${w.external ? 'var(--ext-soft)' : 'var(--wl-soft)'}">${svg(w.external ? IC.ext : IC.code, 13, w.external ? 'var(--ext)' : 'var(--wl)')}</span><b>${esc(w.name)}</b>${w.external ? '<span class="etag" style="background:var(--ext-soft);color:var(--ext)">outside</span>' : ''}${errs ? `<span class="etag" style="background:var(--bad-soft);color:var(--bad)">${errs} error${errs > 1 ? 's' : ''}</span>` : ''}</div>
      <div style="padding-top:4px">${hs.length ? hs.map(h => `<div class="row" style="height:26px">${svg(TRIG_ICON[h.type === 'call' ? 'request' : h.type], 12, 'var(--muted)')}<span class="t"><span style="color:var(--tk-k)">when</span> ${esc(h.name)}</span>${entryKeys.has(w.name + '.' + h.name) ? '<span class="etag" style="background:var(--accent-soft);color:var(--accent-ink)">entry</span>' : ''}${w.external ? '' : `<span class="port" data-port="w|${w.id}|${esc(h.name)}" title="Drag to a data node or another workload to add a statement" aria-hidden="true"></span>`}</div>`).join('') : '<div class="row muted" style="height:26px">no handlers yet</div>'}</div></div>`;
  }).join('') + B.data.map(d => {
    const [bg, fg, ic] = KIND_STYLE[d.kind]; const errs = probsFor('data', d.id).filter(p => p.sev === 'error').length;
    return `<div class="bn ${sel.t === 'd' && sel.id === d.id ? 'sel' : ''} ${errs ? 'err' : ''}" data-node="d:${d.id}" style="left:${d.x}px;top:${d.y}px;width:${DW}px;height:${dH(d)}px;border-radius:${d.kind === 'table' || d.kind === 'kv' ? 12 : 18}px" data-fb="Data ${esc(d.name)}" tabindex="0" role="button" aria-label="Data ${esc(d.name)}">
      <div class="hd" style="background:${bg}"><span style="display:flex">${svg(ic, 14, fg)}</span><b>${esc(d.name)}</b><span class="etag" style="background:var(--surface);color:${fg}">${DATA_KINDS[d.kind].label}</span></div>
      <div style="padding-top:4px">${dShown(d).map(f => `<div class="row" style="height:21px"><span class="t">${esc(f.name)} <span class="muted">${esc(f.type || '')}</span></span>${f.key ? '<span class="etag" style="background:var(--accent-soft);color:var(--accent-ink)">key</span>' : f.index ? '<span class="etag" style="background:var(--sunk);color:var(--ink-2)">index</span>' : ''}${f.ref ? `<span class="etag" style="background:var(--sunk);color:var(--muted)">→ ${esc(f.ref.split('.')[0])}</span>` : ''}</div>`).join('') || '<div class="row muted" style="height:21px">no fields</div>'}
      ${(d.fields || []).length > 7 ? `<div class="row muted" style="height:20px;font-family:var(--font)">+${d.fields.length - 7} more</div>` : ''}</div></div>`;
  }).join('');
  el.style.width = W + 'px'; el.style.height = H + 'px';
  const cw = $('#b-cwrap'); if (ST.bZoom == null && cw && cw.clientWidth) ST.bZoom = Math.max(0.6, Math.min(1, (cw.clientWidth - 16) / W));
  const z = ST.bZoom || 1; el.style.transform = `scale(${z})`; const sz = $('#b-sizer'); if (sz) { sz.style.width = W * z + 'px'; sz.style.height = H * z + 'px'; } const zl = $('#b-zl'); if (zl) zl.textContent = Math.round(z * 100) + '%'; ST._bW = W;
  ST._bcanvas = 1; el.innerHTML = `<svg class="edges" width="${W}" height="${H}"><defs>${mk('m-ink', 'var(--ink-2)')}${mk('m-read', 'var(--read)')}${mk('m-write', 'var(--write)')}${mk('m-pub', 'var(--pub)')}${mk('m-ref', 'var(--muted)')}</defs>${paths}${labels}</svg>${nodes}
    ${ST.dbg ? '' : ''}<div class="legend" style="position:absolute;left:8px;bottom:6px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:6px 10px"><span><i style="border-color:var(--ink-2)"></i>calls</span><span><i style="border-color:var(--read)"></i>reads</span><span><i style="border-color:var(--write)"></i>writes</span><span><i style="border-color:var(--pub);border-top-style:dashed"></i>publishes / triggers</span><span><i style="border-color:var(--muted);border-top-style:dotted"></i>points to</span><span class="muted">Drag from a <span class="port" style="position:static;display:inline-block;vertical-align:middle"></span> to connect</span></div>`;
  if (ST.dbg) dbgPaint(true);
}
function renderBProbs() {
  const el = $('#b-probs'); if (!el) return;
  if (ST.dbg) { renderDbgDock(); return; } el.classList.remove('dock');
  const P = A.problems.slice().sort((a, b) => (a.sev === 'error' ? 0 : 1) - (b.sev === 'error' ? 0 : 1));
  el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:${P.length ? 4 : 0}px">${A.valid ? `<span class="tag good">${svg(IC.check, 12, 'currentColor', 3)} Build is valid</span>` : `<span class="tag bad">${A.errors} error${A.errors > 1 ? 's' : ''}</span>`}${A.warnings ? `<span class="tag warn">${A.warnings} warning${A.warnings > 1 ? 's' : ''}</span>` : ''}<span class="muted" style="font-size:12.5px">${A.valid ? 'Deploy is unlocked.' : 'Deploy unlocks when there are no errors.'}</span>${A.valid ? `<button type="button" class="btn sm" data-act="mode" data-m="deploy" style="margin-left:auto">Go to Deploy</button>` : ''}</div>
    ${P.map((p, i) => (p.sev === 'warn' && A.errors && !ST.bNotes) ? '' : `<button type="button" class="prob" data-act="b-prob" data-i="${i}"><span class="ic ${p.sev}">!</span><span style="flex:1;min-width:0">${esc(p.msg)}</span><span class="muted" style="font-size:12px;white-space:nowrap">${esc(probWhere(p))}</span></button>`).join('')}`;
  ST._probs = P;
}
function probWhere(p) { const n = p.kind === 'workload' ? ST.build.workloads.find(w => w.id === p.id) : ST.build.data.find(d => d.id === p.id); return (n ? n.name : '') + (p.line ? ` · line ${p.line}` : ''); }

/* ---------- right panel ---------- */
function renderBPanel() {
  const el = $('#b-panel'); if (!el) return;
  if (ST.dbg) { renderDbgPanel(); return; }
  const s = ST.bSel;
  if (s && s.t === 'w') { const w = ST.build.workloads.find(x => x.id === s.id); if (w) { el.innerHTML = workloadPanel(w); wireEditor(w); return; } }
  if (s && s.t === 'd') { const d = ST.build.data.find(x => x.id === s.id); if (d) { el.innerHTML = dataPanel(d); return; } }
  el.innerHTML = overviewPanel();
}
const REF_HTML = `<details class="ref" data-fb="Language reference"><summary>${svg(IC.chev, 14)}Language reference</summary><table style="margin-top:8px">
  <tr><td><code>when Name { }</code></td><td>An endpoint. Users or other workloads call it.</td></tr>
  <tr><td><code>when message Data { }</code></td><td>Runs for each message on a queue, stream or topic.</td></tr>
  <tr><td><code>when file Data { }</code></td><td>Runs when a file lands.</td></tr>
  <tr><td><code>when schedule "daily 02:00" { }</code></td><td>Runs on a schedule.</td></tr>
  <tr><td><code>call Workload.Handler</code></td><td>Calls another workload and waits.</td></tr>
  <tr><td><code>read Data by field many 20</code></td><td>Reads rows. Scans if the field isn’t indexed.</td></tr>
  <tr><td><code>insert | update | upsert | delete Data</code></td><td>Writes.</td></tr>
  <tr><td><code>publish Data</code></td><td>Sends a message and moves on.</td></tr>
  <tr><td><code>if Cond @10% { } else { }</code></td><td>A branch. The % is the default odds; change them per scenario.</td></tr>
  <tr><td><code>for each x in Items ~3 { }</code></td><td>Repeats about 3 times, one after another. Add <code>parallel 10</code> to run 10 at once.</td></tr>
  <tr><td><code>parallel { }</code></td><td>Runs the statements inside at the same time.</td></tr>
  <tr><td><code>compute 15ms</code></td><td>CPU work, or an outside service’s response time.</td></tr>
  <tr><td><code>error 402</code> · <code>return</code></td><td>Ends the request.</td></tr></table></details>`;
function workloadPanel(w) {
  const hs = wHandlers(w);
  const callers = h => A.calls.filter(c => c.to === w.name && c.h === h.name).map(c => c.from + '.' + c.fromH);
  return `<div class="ph"><span class="ico" style="width:36px;height:36px;background:${w.external ? 'var(--ext-soft)' : 'var(--wl-soft)'}">${svg(w.external ? IC.ext : IC.code, 18, w.external ? 'var(--ext)' : 'var(--wl)')}</span><div style="flex:1;min-width:0"><label class="lbl" for="w-name" style="display:block">Workload</label><input id="w-name" value="${esc(w.name)}" data-ch="b-wname" data-id="${w.id}"></div><button type="button" class="iconbtn" data-act="b-del" data-t="w" data-id="${w.id}" aria-label="Delete workload" title="Delete">${svg(IC.trash, 16)}</button><button type="button" class="iconbtn" data-act="b-desel" aria-label="Close">${svg(IC.x, 16)}</button></div>
    <div class="q"><label class="switch"><input type="checkbox" id="w-ext" ${w.external ? 'checked' : ''} data-ch="b-wext" data-id="${w.id}"><span>Runs outside your system</span></label><div class="note">${w.external ? 'A provider’s API, like a payment gateway. Deploy only asks where it’s hosted; use <code>compute</code> for its response time.' : 'Code you run. In Deploy you choose what it runs on: a cluster, VMs, functions or containers.'}</div></div>
    <div class="q" data-fb="Code editor"><div class="qh">Code<span class="muted" style="font-weight:400;font-size:12.5px">the least code that shows what it touches</span></div>
      <div class="snips" aria-label="Insert">${['call', 'read', 'insert', 'update', 'publish', 'if', 'for each', 'parallel', 'compute', 'error', 'when'].map(s => `<button type="button" data-act="b-snip" data-s="${s}">${s}</button>`).join('')}</div>
      <div class="editor"><div class="gutter" id="gut"></div><div class="code-area"><pre id="hl" aria-hidden="true"></pre><textarea id="code" data-in="b-code" data-id="${w.id}" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off" aria-label="Code for ${esc(w.name)}" aria-autocomplete="list">${esc(w.code)}</textarea><div id="ac" class="acbox" role="listbox" hidden></div></div></div>
      <div class="muted" style="font-size:12px">Suggestions appear as you type. You can also drag from a handler’s dot on the canvas to a data node or workload.</div>
      <div id="b-diag"></div></div>
    <div class="q"><div class="qh">Handlers</div>${hs.length ? hs.map(h => { const cs = callers(h); const isEntry = A.entries.some(e => e.key === w.name + '.' + h.name); return `<div class="kv"><span class="mono">when ${esc(h.name)}</span><span class="muted">${isEntry ? 'entry point' : cs.length ? 'called by ' + esc(cs.join(', ')) : h.type}${!w.external && A.valid ? ` · <button type="button" class="link" style="font-size:12.5px" data-act="dbg-start" data-k="${esc(w.name + '.' + h.name)}">Step through</button>` : ''}</span></div>`; }).join('') : '<div class="muted">None yet. Start with <code>when Name {</code>.</div>'}</div>
    ${REF_HTML}`;
}
function renderBDiag(w) {
  const el = $('#b-diag'); if (!el) return;
  const ps = probsFor('workload', w.id);
  el.innerHTML = ps.length ? ps.map(p => `<button type="button" class="prob" data-act="b-goline" data-line="${p.line || ''}"><span class="ic ${p.sev}">!</span><span style="flex:1">${esc(p.msg)}</span>${p.line ? `<span class="muted num" style="font-size:12px">line ${p.line}</span>` : ''}${p.fix ? `<span class="link" data-act="b-fixidx" data-d="${p.fix.data}" data-f="${esc(p.fix.field)}">${esc(p.fix.label)}</span>` : ''}</button>`).join('') : `<div class="tag good" style="align-self:flex-start">${svg(IC.check, 12, 'currentColor', 3)} No problems in this workload</div>`;
}
function paintCode(w, src) {
  const ta = $('#code'), hl = $('#hl'), gut = $('#gut'); if (!ta) return;
  const errs = new Set(probsFor('workload', w.id).filter(p => p.sev === 'error' && p.line).map(p => p.line));
  hl.innerHTML = highlightCode(src, errs);
  const n = src.split('\n').length; gut.innerHTML = Array.from({ length: n }, (_, i) => errs.has(i + 1) ? `<span class="e">${i + 1}</span>` : String(i + 1)).join('\n');
  ta.style.height = (n * 20 + 22) + 'px'; hl.scrollLeft = ta.scrollLeft;
}
function wireEditor(w) {
  const ta = $('#code'); if (!ta) return;
  paintCode(w, w.code); renderBDiag(w);
  ta.addEventListener('scroll', () => { $('#hl').scrollLeft = ta.scrollLeft; });
  ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) acHide(); }, 120));
  ta.addEventListener('click', () => acHide());
  ta.addEventListener('keydown', ev => {
    if (AC) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); AC.i = (AC.i + (ev.key === 'ArrowDown' ? 1 : -1) + AC.items.length) % AC.items.length; acShow(ta, w); return; }
      if (ev.key === 'Enter' || ev.key === 'Tab') { ev.preventDefault(); acAccept(); return; }
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); acHide(); return; }
    }
    if (ev.key === 'Tab') { ev.preventDefault(); insertAtCursor(ta, '  '); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const v = ta.value, p = ta.selectionStart; const ls = v.lastIndexOf('\n', p - 1) + 1; const line = v.slice(ls, p); let ind = (line.match(/^\s*/) || [''])[0]; if (/\{\s*$/.test(line)) ind += '  '; insertAtCursor(ta, '\n' + ind); }
    else if (ev.key === '}' ) { const v = ta.value, p = ta.selectionStart; const ls = v.lastIndexOf('\n', p - 1) + 1; if (/^\s+$/.test(v.slice(ls, p)) && v.slice(ls, p).length >= 2) { ev.preventDefault(); ta.setRangeText('', p - 2, p, 'end'); insertAtCursor(ta, '}'); } }
  });
}
function insertAtCursor(ta, text) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
let codeT = null;
IN['b-code'] = el => {
  const w = ST.build.workloads.find(x => x.id === el.dataset.id); if (!w) return;
  paintCode(w, el.value); acShow(el, w);
  clearTimeout(codeT); codeT = setTimeout(() => {
    const val = el.value; if (val === w.code) return;
    commit(() => { w.code = val; }, { partial: () => { renderBRail(); renderBCanvas(); renderBProbs(); paintCode(w, val); renderBDiag(w); } });
  }, 260);
};
function snippetText(s, w) {
  const others = ST.build.workloads.filter(x => x.id !== w.id); const o = others[0]; const oh = o ? (wHandlers(o)[0] || { name: 'Handler' }).name : 'Handler';
  const tbl = ST.build.data.find(d => d.kind === 'table' || d.kind === 'kv'); const key = tbl ? ((tbl.fields || []).find(f => f.key) || { name: 'id' }).name : 'id';
  const msg = ST.build.data.find(d => ['queue', 'stream', 'topic'].includes(d.kind));
  return ({ call: `call ${o ? o.name : 'Service'}.${oh}`, read: `read ${tbl ? tbl.name : 'Table'} by ${key}`, insert: `insert ${tbl ? tbl.name : 'Table'}`, update: `update ${tbl ? tbl.name : 'Table'}`, publish: `publish ${msg ? msg.name : 'Events'}`, if: 'if Condition @10% {\n  \n}', 'for each': 'for each item in Items ~3 {\n  \n}', parallel: 'parallel {\n  \n}', compute: 'compute 10ms', error: 'error 400', when: 'when NewHandler {\n  \n}' })[s];
}
ACT['b-snip'] = el => {
  const ta = $('#code'); const w = ST.build.workloads.find(x => x.id === (ST.bSel || {}).id); if (!ta || !w) return;
  const v = ta.value, p = ta.selectionStart; const ls = v.lastIndexOf('\n', p - 1) + 1; const line = v.slice(ls, p); const ind = (line.match(/^\s*/) || [''])[0];
  let t = snippetText(el.dataset.s, w).split('\n').map((l, i) => i ? ind + l : l).join('\n');
  const atLineStart = /^\s*$/.test(line);
  ta.focus(); ta.setSelectionRange(p, p); insertAtCursor(ta, (atLineStart ? '' : '\n' + ind) + t);
};
ACT['b-goline'] = el => { const ln = +el.dataset.line; const ta = $('#code'); if (!ta || !ln) return; const lines = ta.value.split('\n'); let pos = 0; for (let i = 0; i < ln - 1 && i < lines.length; i++) pos += lines[i].length + 1; ta.focus(); ta.setSelectionRange(pos, pos + (lines[ln - 1] || '').length); };
ACT['b-fixidx'] = (el, ev) => { ev.stopPropagation(); const d = ST.build.data.find(x => x.id === el.dataset.d); commit(() => { const f = d.fields.find(x => x.name === el.dataset.f); if (f) f.index = true; }); toast(`Indexed ${d.name}.${el.dataset.f}`, { label: 'Undo', fn: undo }); };

function dataPanel(d) {
  const [bg, fg, ic] = KIND_STYLE[d.kind];
  const allRefs = []; ST.build.data.forEach(x => { if (x.id !== d.id) (x.fields || []).forEach(f => allRefs.push(x.name + '.' + f.name)); });
  const uses = A.dataOps.filter(o => o.d === d.name).map(o => `<div class="kv"><span>${esc(o.w)}</span><span class="muted">${o.ops.join(', ')}</span></div>`).join('') + A.triggers.filter(t => t.d === d.name).map(t => `<div class="kv"><span>${esc(t.w)}</span><span class="muted">runs on each ${t.type === 'file' ? 'file' : t.type === 'change' ? 'change' : 'message'}</span></div>`).join('');
  const isMsg = ['queue', 'stream', 'topic'].includes(d.kind);
  return `<div class="ph"><span class="ico" style="width:36px;height:36px;background:${bg}">${svg(ic, 18, fg)}</span><div style="flex:1;min-width:0"><label class="lbl" for="d-name" style="display:block">Data</label><input id="d-name" value="${esc(d.name)}" data-ch="b-dname" data-id="${d.id}"></div><button type="button" class="iconbtn" data-act="b-del" data-t="d" data-id="${d.id}" aria-label="Delete data" title="Delete">${svg(IC.trash, 16)}</button><button type="button" class="iconbtn" data-act="b-desel" aria-label="Close">${svg(IC.x, 16)}</button></div>
    <div class="q" data-fb="Data kind"><div class="qh">What kind of data?</div><div class="seg">${Object.keys(DATA_KINDS).map(k => `<button type="button" class="${d.kind === k ? 'on' : ''}" aria-pressed="${d.kind === k}" data-act="b-dkind" data-id="${d.id}" data-k="${k}">${DATA_KINDS[k].label}</button>`).join('')}</div><div class="note">${KIND_NOTE[d.kind]} No product is chosen here; that happens in Deploy.</div></div>
    <div class="q" data-fb="Volume"><div class="qh">How much?</div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      ${isMsg ? '' : `<label style="display:flex;gap:6px;align-items:center"><span class="muted">${d.kind === 'file' ? 'Rows per file' : d.kind === 'blob' ? 'Objects' : 'Rows'}</span><input class="field num" style="width:120px" type="number" min="0" id="d-rows" value="${d.rows || 0}" data-ch="b-dnum" data-id="${d.id}" data-k="rows"></label>`}
      <label style="display:flex;gap:6px;align-items:center"><span class="muted">${isMsg ? 'Message size' : d.kind === 'blob' ? 'Object size' : 'Row size'}</span><input class="field num" style="width:80px" type="number" min="0" step="0.1" id="d-kb" value="${d.rowKB || 1}" data-ch="b-dnum" data-id="${d.id}" data-k="rowKB"><span class="muted">KB</span></label></div>
      ${d.kind === 'stream' ? `<label style="display:flex;gap:8px;align-items:center"><span class="muted">Keep events in order per</span><select class="field" id="d-pk" data-ch="b-dpk" data-id="${d.id}">${['', ...(d.fields || []).map(f => f.name)].map(n => `<option value="${esc(n)}" ${d.partitionKey === n ? 'selected' : ''}>${n ? esc(n) : 'no ordering'}</option>`).join('')}</select></label>` : ''}</div>
    <div class="q" data-fb="Fields"><div class="qh">Fields</div><div class="tscroll"><table class="ftbl"><thead><tr><th>Name</th><th>Type</th><th title="Main key">Key</th><th title="Indexed for fast lookups">Index</th><th>Points to</th><th></th></tr></thead><tbody>
      ${(d.fields || []).map((f, i) => `<tr><td><input class="field" id="f-n-${i}" value="${esc(f.name)}" data-ch="b-fset" data-id="${d.id}" data-i="${i}" data-k="name" aria-label="Field name"></td><td><input class="field" id="f-t-${i}" value="${esc(f.type || '')}" data-ch="b-fset" data-id="${d.id}" data-i="${i}" data-k="type" aria-label="Field type" style="width:86px"></td>
        <td style="text-align:center"><input type="radio" name="key-${d.id}" ${f.key ? 'checked' : ''} data-ch="b-fkey" data-id="${d.id}" data-i="${i}" aria-label="Main key"></td><td style="text-align:center"><input type="checkbox" ${f.index || f.key ? 'checked' : ''} ${f.key ? 'disabled' : ''} data-ch="b-fidx" data-id="${d.id}" data-i="${i}" aria-label="Indexed"></td>
        <td><select class="field" id="f-r-${i}" data-ch="b-fset" data-id="${d.id}" data-i="${i}" data-k="ref" aria-label="Points to" style="width:130px"><option value="">—</option>${allRefs.map(r => `<option ${f.ref === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></td>
        <td><button type="button" class="iconbtn" style="width:26px;height:26px" data-act="b-fdel" data-id="${d.id}" data-i="${i}" aria-label="Remove field">${svg(IC.x, 13)}</button></td></tr>`).join('')}
      </tbody></table></div><div><button type="button" class="ghost sm" data-act="b-fadd" data-id="${d.id}">${svg(IC.plus, 14)}Add field</button></div>
      <div class="note">“Points to” links a field to another data node, like a foreign key or an ID inside a file. Deploy warns when linked data ends up in different stores.</div></div>
    <div class="q"><div class="qh">Used by</div>${uses || '<div class="muted">No workload uses it yet.</div>'}</div>
    ${probsFor('data', d.id).map(p => `<div class="prob"><span class="ic ${p.sev}">!</span><span>${esc(p.msg)}</span></div>`).join('')}`;
}
function overviewPanel() {
  const B = ST.build;
  return `<div><label class="lbl" for="b-name" style="display:block">Build</label><input id="b-name" class="field" value="${esc(B.name)}" data-ch="b-name" style="font-size:17px;font-weight:600;width:100%"></div>
    <div class="note">The logic of your system, with no infrastructure. <b>Workloads</b> are small pieces of code that run when something happens. <b>Data</b> nodes are the collections they read and write. Arrows on the canvas come from the code, so the picture can’t drift from the logic.</div>
    <div class="tiles"><div class="tile"><span class="lbl">Workloads</span><span class="v">${B.workloads.length}</span></div><div class="tile"><span class="lbl">Data</span><span class="v">${B.data.length}</span></div><div class="tile"><span class="lbl">Entry points</span><span class="v">${A.entries.length}</span></div></div>
    <div class="q"><div class="qh">Paths through the system</div>${A.valid ? A.entries.map(e => { const n = enumeratePaths(A, e.key, {}).length; return `<div class="kv"><span>${svg(TRIG_ICON[e.type], 13, 'var(--muted)')} ${esc(e.type === 'request' ? e.w + '.' + e.h : e.label)}</span><span class="muted">${n} path${n > 1 ? 's' : ''}</span></div>`; }).join('') : '<div class="muted">Fix the errors to see paths.</div>'}
      <div class="note">Every <code>if</code> and <code>error</code> in the code adds a path. Simulate lists them and lets you test each one.</div></div>
    <div class="q"><div class="qh">Check the logic before deploying</div><div class="note">Press <b>Step through</b> (or the ▶ next to an entry point) to run it one statement at a time on mock data. You choose which way each <code>if</code> goes, see every row that’s read or written, and watch loops count up on the canvas.</div>${A.valid ? `<div><button type="button" class="btn sm" data-act="dbg-start">${svg(IC.play, 11, 'currentColor')}Step through ${esc((A.entries.find(x => x.type === 'request') || A.entries[0] || { key: '' }).key)}</button></div>` : ''}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="ghost sm" data-act="library">${svg(IC.lib, 14)}Save or load a Build</button>${A.valid ? `<button type="button" class="btn sm" data-act="mode" data-m="deploy">Go to Deploy</button>` : ''}</div>
    ${REF_HTML}`;
}

/* ---------- build actions ---------- */
function freePos(w, h) { let x = 40, y = 40; const all = ST.build.workloads.map(n => ({ x: n.x, y: n.y, w: WW, h: wH(n) })).concat(ST.build.data.map(n => ({ x: n.x, y: n.y, w: DW, h: dH(n) }))); for (let i = 0; i < 400; i++) { if (!all.some(r => x < r.x + r.w + 20 && x + w + 20 > r.x && y < r.y + r.h + 20 && y + h + 20 > r.y)) return { x, y }; x += 60; if (x > 1100) { x = 40; y += 60; } } return { x: 40, y: 40 }; }
function uniqName(base, list) { let n = base, i = 1; while (list.some(x => x.name === n)) n = base + (++i); return n; }
ACT['b-add-w'] = () => { const name = uniqName('NewService', ST.build.workloads); const p = freePos(WW, 90); const id = uid('w'); commit(b => b.workloads.push({ id, name, x: p.x, y: p.y, code: `when NewRequest {\n  # call Service.Handler\n  # read Table by field\n}` })); ST.bSel = { t: 'w', id }; render(); };
ACT['b-add-d'] = () => { const name = uniqName('NewTable', ST.build.data); const p = freePos(DW, 90); const id = uid('d'); commit(b => b.data.push({ id, name, kind: 'table', x: p.x, y: p.y, rows: 1e6, rowKB: 1, fields: [{ name: 'id', type: 'uuid', key: true }] })); ST.bSel = { t: 'd', id }; render(); };
ACT['b-zoom'] = el => { const d = +el.dataset.d; const cw = $('#b-cwrap'); if (d === 0) ST.bZoom = Math.max(0.4, Math.min(1.2, ((cw ? cw.clientWidth : 900) - 16) / (ST._bW || 1200))); else ST.bZoom = Math.max(0.4, Math.min(1.6, Math.round(((ST.bZoom || 1) + d * 0.1) * 10) / 10)); renderBCanvas(); };
ACT['b-sel'] = el => { ST.bSel = { t: el.dataset.t, id: el.dataset.id }; render(); };
ACT['b-desel'] = () => { ST.bSel = null; render(); };
ACT['b-prob'] = el => { const p = ST._probs[+el.dataset.i]; if (!p) return; const n = p.kind === 'workload' ? ST.build.workloads.find(w => w.id === p.id) : ST.build.data.find(d => d.id === p.id); if (!n) return; ST.bSel = { t: p.kind === 'workload' ? 'w' : 'd', id: n.id }; render(); if (p.line) setTimeout(() => ACT['b-goline']({ dataset: { line: p.line } }), 30); };
ACT['b-del'] = el => { const list = el.dataset.t === 'w' ? 'workloads' : 'data'; const n = ST.build[list].find(x => x.id === el.dataset.id); commit(b => { b[list] = b[list].filter(x => x.id !== el.dataset.id); }); ST.bSel = null; render(); toast(`Deleted ${n.name}. Code that uses it now shows an error.`, { label: 'Undo', fn: undo }); };
ACT['b-dkind'] = el => commit(b => { b.data.find(x => x.id === el.dataset.id).kind = el.dataset.k; });
CH['b-name'] = el => commit(b => { b.name = el.value.trim() || 'Untitled build'; });
CH['b-wext'] = el => commit(b => { b.workloads.find(x => x.id === el.dataset.id).external = el.checked; });
CH['b-dnum'] = el => commit(b => { b.data.find(x => x.id === el.dataset.id)[el.dataset.k] = Math.max(0, Number(el.value) || 0); });
CH['b-dpk'] = el => commit(b => { b.data.find(x => x.id === el.dataset.id).partitionKey = el.value; });
CH['b-fset'] = el => commit(b => { const d = b.data.find(x => x.id === el.dataset.id); const f = d.fields[+el.dataset.i]; const k = el.dataset.k; if (k === 'name') { const old = f.name; f.name = el.value.trim() || old; b.data.forEach(x => (x.fields || []).forEach(g => { if (g.ref === d.name + '.' + old) g.ref = d.name + '.' + f.name; })); } else f[k] = el.value; });
CH['b-fkey'] = el => commit(b => { const d = b.data.find(x => x.id === el.dataset.id); d.fields.forEach((f, i) => f.key = i === +el.dataset.i); });
CH['b-fidx'] = el => commit(b => { b.data.find(x => x.id === el.dataset.id).fields[+el.dataset.i].index = el.checked; });
ACT['b-fdel'] = el => commit(b => { b.data.find(x => x.id === el.dataset.id).fields.splice(+el.dataset.i, 1); });
ACT['b-fadd'] = el => commit(b => { const d = b.data.find(x => x.id === el.dataset.id); d.fields.push({ name: uniqName('field', d.fields), type: 'text' }); });
function renameEverywhere(b, dp, kind, oldN, newN) {
  let n = 0; const re = new RegExp('\\b' + oldN + '\\b', 'g');
  b.workloads.forEach(w => { const c = w.code.replace(re, () => { n++; return newN; }); w.code = c; });
  if (kind === 'd') b.data.forEach(d => (d.fields || []).forEach(f => { if (f.ref && f.ref.split('.')[0] === oldN) { f.ref = newN + '.' + f.ref.split('.')[1]; n++; } }));
  b.scenarios.forEach(s => { if (kind === 'w' && s.entry.split('.')[0] === oldN) { s.entry = newN + s.entry.slice(oldN.length); n++; } if (kind === 'd') s.entry = s.entry.replace(re, newN); });
  if (kind === 'w') { dp.compute.forEach(c => { c.workloads = c.workloads.map(x => x === oldN ? (n++, newN) : x); }); if (dp.externals && dp.externals[oldN]) { dp.externals[newN] = dp.externals[oldN]; delete dp.externals[oldN]; } }
  else dp.stores.forEach(s => { s.data = s.data.map(x => x === oldN ? (n++, newN) : x); });
  return n;
}
function renameNode(kind, id, raw) {
  const list = kind === 'w' ? ST.build.workloads : ST.build.data; const node = list.find(x => x.id === id); const nn = raw.trim().replace(/[^\w]/g, '');
  if (!nn || nn === node.name) { render(); return; }
  if (!/^[A-Za-z_]/.test(nn)) { toast('Names start with a letter.'); render(); return; }
  if (ST.build.workloads.concat(ST.build.data).some(x => x.name === nn)) { toast(`${nn} is already used.`); render(); return; }
  let n = 0; commit((b, dp) => { const x = (kind === 'w' ? b.workloads : b.data).find(y => y.id === id); n = renameEverywhere(b, dp, kind, x.name, nn); x.name = nn; });
  toast(`Renamed to ${nn}${n ? ` and updated ${n} reference${n > 1 ? 's' : ''}` : ''}`, { label: 'Undo', fn: undo });
}
CH['b-wname'] = el => renameNode('w', el.dataset.id, el.value);
CH['b-dname'] = el => renameNode('d', el.dataset.id, el.value);

/* ---------- canvas dragging ---------- */
let bDrag = null;
document.addEventListener('pointerdown', ev => {
  if (ST.fb || ST.mode !== 'build' || bConn || (ev.target.closest && ev.target.closest('.port'))) return; const n = ev.target.closest('#b-canvas .bn'); if (!n) return;
  const [t, id] = n.dataset.node.split(':'); const node = (t === 'w' ? ST.build.workloads : ST.build.data).find(x => x.id === id);
  const c = $('#b-canvas').getBoundingClientRect(); const z = ST.bZoom || 1; bDrag = { el: n, node, t, id, ox: (ev.clientX - c.left) / z - node.x, oy: (ev.clientY - c.top) / z - node.y, sx: ev.clientX, sy: ev.clientY, moved: false, x0: node.x, y0: node.y };
  n.setPointerCapture && n.setPointerCapture(ev.pointerId);
});
document.addEventListener('pointermove', ev => {
  if (!bDrag) return; if (!bDrag.moved && Math.hypot(ev.clientX - bDrag.sx, ev.clientY - bDrag.sy) < 4) return;
  bDrag.moved = true; bDrag.el.classList.add('drag'); const c = $('#b-canvas').getBoundingClientRect(); const z = ST.bZoom || 1;
  bDrag.node.x = Math.max(4, Math.round((ev.clientX - c.left) / z - bDrag.ox)); bDrag.node.y = Math.max(4, Math.round((ev.clientY - c.top) / z - bDrag.oy));
  bDrag.el.style.left = bDrag.node.x + 'px'; bDrag.el.style.top = bDrag.node.y + 'px';
  if (!bDrag.raf) bDrag.raf = requestAnimationFrame(() => { if (bDrag) { bDrag.raf = 0; const keep = bDrag.el; renderBCanvas(); const again = $(`#b-canvas [data-node="${bDrag.t}:${bDrag.id}"]`); if (again) { again.classList.add('drag'); bDrag.el = again; } } });
});
document.addEventListener('pointerup', () => {
  if (!bDrag) return; const d = bDrag; bDrag = null;
  if (!d.moved) { ST.bSel = { t: d.t, id: d.id }; renderBRail(); renderBCanvas(); renderBPanel(); return; }
  const nx = d.node.x, ny = d.node.y; d.node.x = d.x0; d.node.y = d.y0;
  commit(b => { const x = (d.t === 'w' ? b.workloads : b.data).find(y => y.id === d.id); x.x = nx; x.y = ny; }, { partial: () => renderBCanvas() });
});
ACT._bg = ev => { if (ST.mode === 'build' && (ev.target.id === 'b-canvas' || ev.target.id === 'b-cwrap' || ev.target.id === 'b-sizer') && ST.bSel) { ST.bSel = null; render(); } if (ST.mode === 'deploy' && ev.target.closest('#d-view') && !ev.target.closest('.bx, .nb, .rg, .region header, button') && ST.dSel) { ST.dSel = null; render(); } };

/* ---------- code autocomplete ---------- */
const AC_KW = ['call', 'read', 'insert', 'update', 'upsert', 'delete', 'publish', 'if', 'else', 'for each', 'parallel', 'compute', 'error', 'return', 'when'];
let AC = null, charW = 0;
function acItems(text, pos, self) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1; const line = text.slice(ls, pos); let m;
  const B = ST.build; const dataOf = k => B.data.filter(d => !k || k.includes(d.kind));
  const D = (list, pre, hint) => list.filter(d => d.name.toLowerCase().startsWith(pre.toLowerCase())).map(d => ({ label: d.name, insert: d.name, hint: hint ? hint(d) : DATA_KINDS[d.kind].label }));
  if ((m = line.match(/\bcall\s+([A-Za-z_]\w*)\.(\w*)$/))) { const w = B.workloads.find(x => x.name === m[1]); if (!w) return null; return { from: pos - m[2].length, items: wHandlers(w).filter(h => h.type === 'call' && h.name.toLowerCase().startsWith(m[2].toLowerCase())).map(h => ({ label: h.name, insert: h.name, hint: `${w.name}.${h.name}` })) }; }
  if ((m = line.match(/\bcall\s+(\w*)$/))) { const items = []; B.workloads.forEach(w => { if (w.id === self) return; wHandlers(w).filter(h => h.type === 'call').forEach(h => { const full = w.name + '.' + h.name; if (full.toLowerCase().startsWith(m[1].toLowerCase()) || w.name.toLowerCase().startsWith(m[1].toLowerCase())) items.push({ label: full, insert: full, hint: w.external ? 'outside service' : 'workload' }); }); }); return { from: pos - m[1].length, items }; }
  if ((m = line.match(/\b(read|update|upsert|delete)\s+([A-Za-z_]\w*)\s+(?:by|where)\s+(\w*)$/))) { const d = B.data.find(x => x.name === m[2]); if (!d) return null; return { from: pos - m[3].length, items: (d.fields || []).filter(f => f.name.toLowerCase().startsWith(m[3].toLowerCase())).map(f => ({ label: f.name, insert: f.name, hint: f.key ? 'key · fast' : f.index ? 'indexed · fast' : 'not indexed · scans' })) }; }
  if ((m = line.match(/\b(read|update|upsert|delete)\s+([A-Za-z_]\w*)\s+(\w*)$/)) && B.data.some(x => x.name === m[2])) return { from: pos - m[3].length, items: [{ label: 'by', insert: 'by ', hint: 'look up by a field' }, { label: 'many', insert: 'many ', hint: 'read many rows, e.g. many 20' }].filter(x => x.label.startsWith(m[3])) };
  if ((m = line.match(/\bpublish\s+(\w*)$/))) return { from: pos - m[1].length, items: D(dataOf(['queue', 'stream', 'topic']), m[1]).concat(D(dataOf(['table', 'kv', 'document']), m[1], d => DATA_KINDS[d.kind].label + ' · works as an outbox')) };
  if ((m = line.match(/\b(read|insert|update|upsert|delete)\s+(\w*)$/))) return { from: pos - m[2].length, items: D(dataOf(), m[2]) };
  if ((m = line.match(/\bwhen\s+(message|file|change)\s+(\w*)$/))) return { from: pos - m[2].length, items: D(dataOf(m[1] === 'message' ? ['queue', 'stream', 'topic'] : m[1] === 'file' ? ['file'] : ['table', 'kv', 'document']), m[2]) };
  if ((m = line.match(/\bfor each\s+\w+\s+in\s+(\w*)$/))) return { from: pos - m[1].length, items: [{ label: 'file', insert: 'file', hint: 'each row of the file that started this' }].filter(x => x.label.startsWith(m[1])).concat(D(dataOf(), m[1])) };
  if ((m = line.match(/^\s*([a-z]+)$/)) && m[1].length >= 1) { const items = AC_KW.filter(k => k.startsWith(m[1]) && k !== m[1]).map(k => ({ label: k, insert: k + ' ', hint: '' })); return items.length ? { from: pos - m[1].length, items } : null; }
  return null;
}
function acShow(ta, w) {
  const r = acItems(ta.value, ta.selectionStart, w.id); const box = $('#ac');
  if (!r || !r.items.length || ta.selectionStart !== ta.selectionEnd) { acHide(); return; }
  if (!charW) { const sp = document.createElement('span'); sp.style.cssText = 'position:absolute;visibility:hidden;font:inherit;white-space:pre'; sp.textContent = 'MMMMMMMMMM'; ta.parentNode.appendChild(sp); charW = sp.getBoundingClientRect().width / 10 || 7.5; sp.remove(); }
  const before = ta.value.slice(0, ta.selectionStart); const lineIdx = before.split('\n').length - 1; const col = before.length - before.lastIndexOf('\n') - 1 - (ta.selectionStart - r.from);
  AC = { from: r.from, items: r.items.slice(0, 8), i: AC && AC.from === r.from ? Math.min(AC.i, r.items.length - 1) : 0, ta, w };
  box.style.top = (10 + (lineIdx + 1) * 20 + 2) + 'px'; box.style.left = Math.max(4, Math.min(ta.clientWidth - 250, 12 + col * charW - ta.scrollLeft - 6)) + 'px'; box.hidden = false;
  box.innerHTML = AC.items.map((x, i) => `<div class="aci ${i === AC.i ? 'on' : ''}" data-i="${i}" role="option" aria-selected="${i === AC.i}"><span class="mono">${esc(x.label)}</span><span class="muted">${esc(x.hint)}</span></div>`).join('') + '<div class="acf muted">↑↓ to choose · Enter or Tab to insert · Esc to close</div>';
}
function acHide() { AC = null; const b = $('#ac'); if (b) { b.hidden = true; b.innerHTML = ''; } }
function acAccept(i) { if (!AC) return; const x = AC.items[i == null ? AC.i : i]; const ta = AC.ta; ta.setRangeText(x.insert, AC.from, ta.selectionStart, 'end'); acHide(); ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true })); }
document.addEventListener('mousedown', ev => { const it = ev.target.closest && ev.target.closest('#ac .aci'); if (it) { ev.preventDefault(); acAccept(+it.dataset.i); } else if (!ev.target.closest || !ev.target.closest('#ac')) acHide(); }, true);

/* ---------- drag from a handler to connect ---------- */
let bConn = null;
function addStmt(wId, hName, stmt) {
  const w = ST.build.workloads.find(x => x.id === wId); if (!w) return;
  const H = wHandlers(w).find(h => h.name === hName); if (!H) { toast('Couldn’t find that handler.'); return; }
  const lines = w.code.split('\n'); let depth = 0, close = -1; const ind = (lines[H.line - 1].match(/^\s*/) || [''])[0];
  for (let i = H.line - 1; i < lines.length; i++) { const t = lines[i].replace(/(#|\/\/).*$/, ''); for (const ch of t) { if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { close = i; break; } } } if (close >= 0) break; }
  if (close < 0) { toast('Close the handler with } first.'); return; }
  commit(() => { lines.splice(close, 0, ind + '  ' + stmt); w.code = lines.join('\n'); });
  toast(`Added “${stmt}” to ${w.name}.${hName}`, { label: 'Undo', fn: undo });
}
document.addEventListener('pointerdown', ev => {
  if (ST.fb || ST.mode !== 'build') return; const port = ev.target.closest && ev.target.closest('#b-canvas .port'); if (!port) return;
  ev.stopPropagation(); ev.preventDefault(); const [, id, h] = port.dataset.port.split('|');
  const c = $('#b-canvas').getBoundingClientRect(); const z = ST.bZoom || 1; const pr = port.getBoundingClientRect();
  bConn = { id, h, x0: (pr.left + pr.width / 2 - c.left) / z, y0: (pr.top + pr.height / 2 - c.top) / z };
  document.body.classList.add('connecting');
}, true);
document.addEventListener('pointermove', ev => {
  if (!bConn) return; const cv = $('#b-canvas'); const c = cv.getBoundingClientRect(); const z = ST.bZoom || 1; const x = (ev.clientX - c.left) / z, y = (ev.clientY - c.top) / z;
  let ov = $('#conn-ov'); if (!ov) { cv.insertAdjacentHTML('beforeend', `<svg id="conn-ov" class="edges" style="z-index:7" width="${cv.style.width.replace('px', '')}" height="${cv.style.height.replace('px', '')}"></svg>`); ov = $('#conn-ov'); }
  ov.innerHTML = `<path d="M${bConn.x0} ${bConn.y0} C${bConn.x0 + 60} ${bConn.y0} ${x - 60} ${y} ${x} ${y}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="6 4" fill="none"/><circle cx="${x}" cy="${y}" r="5" fill="var(--accent)"/>`;
  document.querySelectorAll('#b-canvas .bn.conn-t').forEach(n => n.classList.remove('conn-t'));
  const t = document.elementFromPoint(ev.clientX, ev.clientY); const n = t && t.closest && t.closest('#b-canvas .bn'); if (n && n.dataset.node !== 'w:' + bConn.id) n.classList.add('conn-t');
}, true);
document.addEventListener('pointerup', ev => {
  if (!bConn) return; const cn = bConn; bConn = null; document.body.classList.remove('connecting'); const ov = $('#conn-ov'); if (ov) ov.remove();
  document.querySelectorAll('#b-canvas .bn.conn-t').forEach(n => n.classList.remove('conn-t'));
  const t = document.elementFromPoint(ev.clientX, ev.clientY); const n = t && t.closest && t.closest('#b-canvas .bn'); if (!n) return;
  const [k, id] = n.dataset.node.split(':'); if (k === 'w' && id === cn.id) return;
  let opts = [];
  if (k === 'd') { const d = ST.build.data.find(x => x.id === id); const key = (d.fields || []).find(f => f.key); const K = DATA_KINDS[d.kind];
    const ops = K.ops.includes('publish') ? ['publish'] : []; K.ops.forEach(o => { if (o !== 'publish' && o !== 'insert' || !ops.includes('publish')) if (!ops.includes(o)) ops.push(o); });
    opts = ops.map(o => o === 'read' ? `read ${d.name}${key ? ' by ' + key.name : ''}` : o === 'update' || o === 'delete' ? `${o} ${d.name}` : `${o} ${d.name}`);
    if (['queue', 'stream', 'topic'].includes(d.kind)) opts.push(`__trigger__${d.name}`);
  } else { const w = ST.build.workloads.find(x => x.id === id); opts = wHandlers(w).filter(h => h.type === 'call').map(h => `call ${w.name}.${h.name}`); if (!opts.length) { toast(`${w.name} has no handler to call yet.`); return; } }
  const src = ST.build.workloads.find(x => x.id === cn.id);
  $('#overlay').innerHTML = `<div class="cmenu" style="left:${Math.min(ev.clientX, innerWidth - 300)}px;top:${Math.min(ev.clientY, innerHeight - 40 - opts.length * 34)}px" role="menu" aria-label="Add a statement"><div class="lbl" style="padding:4px 8px">Add to ${esc(src.name)}.${esc(cn.h)}</div>${opts.map(o => o.startsWith('__trigger__') ? '' : `<button type="button" role="menuitem" data-act="b-conn" data-id="${cn.id}" data-h="${esc(cn.h)}" data-s="${esc(o)}"><code>${esc(o)}</code></button>`).join('')}<button type="button" role="menuitem" data-act="close-cmenu" class="muted">Cancel</button></div>`;
}, true);
ACT['b-conn'] = el => { $('#overlay').innerHTML = ''; addStmt(el.dataset.id, el.dataset.h, el.dataset.s); };
ACT['close-cmenu'] = () => { $('#overlay').innerHTML = ''; };
