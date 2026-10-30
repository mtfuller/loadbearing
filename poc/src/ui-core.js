/* ===================== App core ===================== */
const WORK_KEY = 'loadbearing-work', LIB_KEY = 'loadbearing-library', OLD_WORK_KEY = 'meridian-v3-work', OLD_LIB_KEY = 'meridian-v3-library';
// Documents saved before the rename used 'meridian-*' kinds; accept both and upgrade on load.
const isBuildKind = k => k === 'loadbearing-build' || k === 'meridian-build';
const isDeployKind = k => k === 'loadbearing-deploy' || k === 'meridian-deploy';
function upgradeDoc(o) { if (o && isBuildKind(o.kind)) o.kind = 'loadbearing-build'; if (o && isDeployKind(o.kind)) o.kind = 'loadbearing-deploy'; return o; }
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, el) => (el || document).querySelector(s);
const svg = (d, size, color, sw) => `<svg aria-hidden="true" width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="${sw || 1.9}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const IC = {
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3c-3.5 3-3.5 15 0 18M12 3c3.5 3 3.5 15 0 18M3 12h18',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5', table: 'M4 5h16v14H4zM4 10h16M10 10v9', kv: 'M7 7h.01M4 4h16v16H4zM9 12h8M9 16h5', queue: 'M4 6h16M4 12h16M4 18h10', stream: 'M3 8c3-3 6 3 9 0s6-3 9 0M3 16c3-3 6 3 9 0s6-3 9 0', topic: 'M4 12h4l4-6v12l-4-6M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  file: 'M14 3H6v18h12V7zM14 3v4h4', blob: 'M4 7l8-4 8 4-8 4zM4 7v10l8 4 8-4V7M12 11v10', ext: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  play: 'M7 4v16l13-8z', undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11', redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13', x: 'M6 6l12 12M18 6 6 18', plus: 'M12 5v14M5 12h14', trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  comment: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12z', lib: 'M4 4h5v16H4zM10 4h5v16h-5zM16 5l4 1-3 14-4-1z', chev: 'M9 6l6 6-6 6', check: 'M5 12l5 5 9-10',
  k8s: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 8v8M8.5 10l7 4M15.5 10l-7 4', vm: 'M4 5h16v10H4zM8 19h8M12 15v4', fn: 'M8 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2M16 4h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-2M9 15l2-6h2l-2 6', ctr: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3', bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z', users: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2', req: 'M5 12h14M13 6l6 6-6 6', msg: 'M4 6h16v10H8l-4 4z', route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8', download: 'M12 4v12M6 10l6 6 6-6M4 20h16', upload: 'M12 20V8M6 14l6-6 6 6M4 4h16',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4', shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z', split: 'M4 12h6M10 12l8-6M10 12l8 6M10 12h8', nat: 'M4 12h10M10 8l4 4-4 4M18 5v14', lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  pause: 'M8 5v14M16 5v14', step: 'M6 5v14l9-7zM18 5v14', back: 'M18 5v14l-9-7zM6 5v14', restart: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5', stop: 'M6 6h12v12H6z', over: 'M4 15a8 8 0 0 1 15-4M19 5v6h-6M8 19h.01M12 19h.01M16 19h.01'
};
const KIND_STYLE = { document: ['var(--data-soft)', 'var(--data)', IC.doc], table: ['var(--data-soft)', 'var(--data)', IC.table], kv: ['var(--data-soft)', 'var(--data)', IC.kv], queue: ['var(--msg-soft)', 'var(--msg)', IC.queue], stream: ['var(--msg-soft)', 'var(--msg)', IC.stream], topic: ['var(--msg-soft)', 'var(--msg)', IC.topic], file: ['var(--file-soft)', 'var(--file)', IC.file], blob: ['var(--file-soft)', 'var(--file)', IC.blob] };
const TRIG_ICON = { request: IC.req, message: IC.msg, file: IC.file, schedule: IC.clock, change: IC.db };
const fmtMs = v => v == null || !isFinite(v) ? '–' : v >= 60000 ? (v / 60000).toFixed(1) + ' min' : v >= 10000 ? (v / 1000).toFixed(0) + ' s' : v >= 1000 ? (v / 1000).toFixed(1) + ' s' : v >= 10 ? Math.round(v) + ' ms' : v.toFixed(1) + ' ms';
const fmtDur = s => s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? (s / 3600).toFixed(1) + ' h' : Math.round(s / 86400) + ' days';
const fmtInt = v => Math.round(v).toLocaleString('en-US');
const fmtRate = v => v >= 100 ? fmtInt(v) : v >= 10 ? v.toFixed(0) : v.toFixed(1);
const pct = v => (v * 100 < 10 ? (v * 100).toFixed(1) : Math.round(v * 100)) + '%';
const clone = o => JSON.parse(JSON.stringify(o));

const ST = { build: null, deploy: null, mode: 'build', bSel: null, dSel: null, dView: 'diagram', sView: 'diagram', scen: null, results: {}, trace: null, overlay: null, fb: false, comments: undefined, lib: { builds: [], deploys: [], src: 'local' }, running: null };
let A = null, V = null, M = null;
let HIST = [], FUT = [];

function recompute() {
  normalizeDeploy(ST.deploy);
  A = analyzeBuild(ST.build);
  V = A.valid ? validateDeploy(ST.build, A, ST.deploy) : null;
  M = V && V.valid ? compileModel(ST.build, A, ST.deploy, V) : null;
}
function saveWork() { try { localStorage.setItem(WORK_KEY, JSON.stringify({ build: ST.build, deploy: ST.deploy })); } catch (e) { } }
function loadWork() {
  try { const o = JSON.parse(localStorage.getItem(WORK_KEY) || localStorage.getItem(OLD_WORK_KEY) || 'null'); if (o && o.build && isBuildKind(o.build.kind) && o.deploy && isDeployKind(o.deploy.kind)) { ST.build = upgradeDoc(o.build); ST.deploy = upgradeDoc(o.deploy); return; } } catch (e) { }
  ST.build = exampleBuild(); ST.deploy = exampleDeploys()[0];
}
// mut(build, deploy). opts.partial: function to re-render instead of full render
function commit(mut, opts) {
  opts = opts || {};
  HIST.push(JSON.stringify({ b: ST.build, d: ST.deploy })); if (HIST.length > 120) HIST.shift(); FUT = [];
  mut(ST.build, ST.deploy); recompute(); saveWork();
  if (opts.partial) { opts.partial(); renderTop(); } else render();
}
function undo() { if (!HIST.length) return; FUT.push(JSON.stringify({ b: ST.build, d: ST.deploy })); const o = JSON.parse(HIST.pop()); ST.build = o.b; ST.deploy = o.d; recompute(); fixSel(); saveWork(); render(); toast('Undone'); }
function redo() { if (!FUT.length) return; HIST.push(JSON.stringify({ b: ST.build, d: ST.deploy })); const o = JSON.parse(FUT.pop()); ST.build = o.b; ST.deploy = o.d; recompute(); fixSel(); saveWork(); render(); toast('Redone'); }
function fixSel() {
  if (ST.bSel && !(ST.bSel.t === 'w' ? ST.build.workloads : ST.build.data).some(x => x.id === ST.bSel.id)) ST.bSel = null;
  if (ST.dSel && ST.dSel.t === 'c' && !ST.deploy.compute.some(x => x.id === ST.dSel.id)) ST.dSel = null;
  if (ST.dSel && ST.dSel.t === 's' && !ST.deploy.stores.some(x => x.id === ST.dSel.id)) ST.dSel = null;
  if (ST.scen && !ST.build.scenarios.some(s => s.id === ST.scen)) ST.scen = null;
}

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, action) {
  $('#toast-root').innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${action ? `<button type="button" data-act="toast-act">${esc(action.label)}</button>` : ''}</div>`;
  ST.toastAct = action ? action.fn : null; clearTimeout(toastT); toastT = setTimeout(() => { $('#toast-root').innerHTML = ''; ST.toastAct = null; }, action ? 6000 : 2600);
}

/* ---------- header ---------- */
function modeState() {
  const b = A.valid ? { cls: A.warnings ? 'warn' : 'ok', txt: A.warnings ? `Valid · ${A.warnings} warning${A.warnings > 1 ? 's' : ''}` : 'Valid' } : { cls: 'bad', txt: `${A.errors} error${A.errors > 1 ? 's' : ''}` };
  const d = !A.valid ? { cls: 'off', txt: 'Fix Build first', dis: true } : V.valid ? { cls: V.warnings ? 'warn' : 'ok', txt: V.warnings ? `Works · ${V.warnings} note${V.warnings > 1 ? 's' : ''}` : 'Works' } : { cls: 'bad', txt: `${V.errors} problem${V.errors > 1 ? 's' : ''}` };
  const s = !A.valid ? { cls: 'off', txt: 'Fix Build first', dis: true } : !V.valid ? { cls: 'off', txt: 'Fix Deploy first', dis: true } : { cls: 'ok', txt: `${ST.build.scenarios.length} scenario${ST.build.scenarios.length === 1 ? '' : 's'}` };
  return { b, d, s };
}
function renderTop() {
  const ms = modeState();
  const mode = (k, n, label, st) => `<button type="button" class="mode ${ST.mode === k ? 'on' : ''}" data-act="mode" data-m="${k}" ${st.dis ? 'disabled' : ''} title="${st.dis ? esc(st.txt) : ''}" ${ST.mode === k ? 'aria-current="page"' : ''}><span class="n">${n}</span><span><span class="t">${label}</span><span class="s ${st.cls}">${esc(st.txt)}</span></span></button>`;
  $('#top').innerHTML = `
    <div class="brand">${svg('M4 4h16M4 20h16M12 4v16', 22, 'var(--accent)', 2.4)}<b>Loadbearing</b></div>
    <div class="docs" data-fb="Open documents">
      <button type="button" class="docbtn" data-act="library" title="Build: logic and data, no infrastructure"><span class="k">Build</span><span class="v">${esc(ST.build.name)}</span></button>
      <button type="button" class="docbtn" data-act="library" title="Deploy: infrastructure for this Build"><span class="k">Deploy</span><span class="v">${esc(ST.deploy.name)}</span></button>
    </div>
    <nav class="modes" aria-label="Modes" data-fb="Mode switcher">${mode('build', 1, 'Build', ms.b)}<span class="arrow">${svg(IC.chev, 14)}</span>${mode('deploy', 2, 'Deploy', ms.d)}<span class="arrow">${svg(IC.chev, 14)}</span>${mode('simulate', 3, 'Simulate', ms.s)}</nav>
    <div class="tright">
      <button type="button" class="ghost sm" data-act="library" data-fb="Library">${svg(IC.lib, 15)}Save &amp; load</button>
      <button type="button" class="iconbtn" data-act="undo" aria-label="Undo" title="Undo" ${HIST.length ? '' : 'disabled'}>${svg(IC.undo, 17)}</button>
      <button type="button" class="iconbtn" data-act="redo" aria-label="Redo" title="Redo" ${FUT.length ? '' : 'disabled'}>${svg(IC.redo, 17)}</button>
      <button type="button" class="ghost sm ${ST.fb ? 'on' : ''}" data-act="fb" aria-pressed="${ST.fb}">${svg(IC.comment, 15)}Comment</button>
    </div>`;
  $('#fbbar').innerHTML = ST.fb ? `<div class="fbbar" role="status">${svg(IC.comment, 16)}<span><b>Comment mode.</b> Click any part of the app to leave feedback on it.</span><button type="button" data-act="fb" style="margin-left:auto">Done commenting</button></div>` : '';
}
function render() {
  if (ST.mode === 'deploy' && !A.valid) ST.mode = 'build';
  if (ST.mode === 'simulate' && !(V && V.valid)) ST.mode = A.valid ? 'deploy' : 'build';
  renderTop();
  const v = $('#view');
  if (ST.mode === 'build') renderBuild(v); else if (ST.mode === 'deploy') renderDeploy(v); else renderSim(v);
  renderOverlay();
}
function keepScroll(ids, fn) { const k = ids.map(id => { const el = document.getElementById(id); return el ? [el.scrollLeft, el.scrollTop] : null; }); fn(); ids.forEach((id, i) => { const el = document.getElementById(id); if (el && k[i]) { el.scrollLeft = k[i][0]; el.scrollTop = k[i][1]; } }); }

/* ---------- library: builds and deploy configs saved separately ---------- */
let DB = null;
async function initLibrary() {
  loadLocalLib();
  try { DB = window.claude && window.claude.use ? await window.claude.use('db') : null; } catch (e) { DB = null; }
  if (!DB) return;
  try {
    ['builds', 'deploys'].forEach(col => DB.collection(col).onSnapshot(snap => { ST.lib[col] = snap.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); ST.lib.src = 'db'; if (ST.overlay === 'library') renderOverlay(); }, () => { DB = null; loadLocalLib(); }));
  } catch (e) { DB = null; }
}
function loadLocalLib() { try { const o = JSON.parse(localStorage.getItem(LIB_KEY) || localStorage.getItem(OLD_LIB_KEY) || 'null'); if (o) { ST.lib.builds = o.builds || []; ST.lib.deploys = o.deploys || []; } } catch (e) { } ST.lib.src = 'local'; }
function saveLocalLib() { try { localStorage.setItem(LIB_KEY, JSON.stringify({ builds: ST.lib.builds, deploys: ST.lib.deploys })); } catch (e) { toast('Couldn’t save in this browser.'); } }
async function libSave(col, name) {
  const doc = col === 'builds' ? Object.assign(clone(ST.build), { name }) : Object.assign(clone(ST.deploy), { name });
  const rec = { name, savedAt: Date.now(), json: JSON.stringify(doc), summary: col === 'builds' ? `${doc.workloads.length} workloads · ${doc.data.length} data` : `${doc.regions.length} region${doc.regions.length > 1 ? 's' : ''} · ${doc.compute.length} compute · ${doc.stores.length} stores` };
  const existing = ST.lib[col].find(x => x.name === name);
  if (DB) { try { await DB.collection(col).doc(existing ? existing.id : undefined).set(rec); } catch (e) { toast(e && e.code === 'quota_exceeded' ? 'The library is full. Delete something first.' : 'Couldn’t save. Try again.'); return; } }
  else { if (existing) Object.assign(existing, rec); else ST.lib[col].unshift(Object.assign({ id: uid('l') }, rec)); saveLocalLib(); }
  if (col === 'builds') ST.build.name = name; else ST.deploy.name = name; saveWork();
  toast(`Saved “${name}”`); render();
}
async function libDelete(col, id) {
  if (DB) { try { await DB.collection(col).doc(id).delete(); } catch (e) { toast('Couldn’t delete. Try again.'); } }
  else { ST.lib[col] = ST.lib[col].filter(x => x.id !== id); saveLocalLib(); renderOverlay(); }
}
function loadDoc(obj) {
  if (!obj || (!isBuildKind(obj.kind) && !isDeployKind(obj.kind))) { toast('That file isn’t a Loadbearing Build or Deploy config.'); return; }
  upgradeDoc(obj);
  commit(() => { if (obj.kind === 'loadbearing-build') { ST.build = obj; ST.bSel = null; ST.results = {}; ST.trace = null; ST.scen = null; } else { ST.deploy = obj; ST.dSel = null; ST.results = {}; ST.trace = null; } });
  ST.overlay = null; render();
  toast(obj.kind === 'loadbearing-build' ? `Loaded Build “${obj.name}”` : `Loaded Deploy config “${obj.name}”` + (A.valid && V && !V.valid ? `. It has ${V.errors} problem${V.errors > 1 ? 's' : ''} with this Build.` : ''));
}
async function exportDoc(col) {
  const doc = col === 'builds' ? ST.build : ST.deploy; const name = (doc.name || 'untitled').replace(/[^\w-]+/g, '-').toLowerCase() + (col === 'builds' ? '.build.json' : '.deploy.json');
  let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { }
  if (!dl) { // standalone: plain browser download
    try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); } catch (e) { toast('Couldn’t export the file.'); }
    return;
  }
  try { await dl.save({ filename: name, data: JSON.stringify(doc, null, 2) }); } catch (e) { if (e && e.code !== 'cancelled' && e.code !== 'declined') toast('Couldn’t export the file.'); }
}
function libraryHTML() {
  const ex = { builds: [exampleBuild()], deploys: exampleDeploys() };
  const col = (key, title, cur, note) => `<section style="flex:1 1 360px;min-width:0;display:flex;flex-direction:column;gap:10px" data-fb="Library: ${title}">
    <div><h2 style="font-size:16px">${title}</h2><div class="muted" style="font-size:12.5px">${note}</div></div>
    <div class="card" style="padding:12px 14px;display:flex;flex-direction:column;gap:8px"><div class="lbl">Open now</div><b>${esc(cur.name)}</b>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><label class="sr" for="save-${key}">Name</label><input id="save-${key}" class="field" value="${esc(cur.name)}" style="flex:1;min-width:140px"><button type="button" class="btn sm" data-act="lib-save" data-col="${key}">Save</button></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="ghost sm" data-act="lib-export" data-col="${key}">${svg(IC.download, 14)}Export file</button><label class="ghost sm" style="cursor:pointer">${svg(IC.upload, 14)}Import file<input type="file" accept=".json,application/json" data-ch="lib-import" class="sr"></label></div></div>
    <div class="lbl">Saved</div>
    ${ST.lib[key].length ? ST.lib[key].map(x => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:0"><div style="font-weight:500">${esc(x.name)}</div><div class="muted" style="font-size:12px">${esc(x.summary || '')} · ${new Date(x.savedAt).toLocaleString()}</div></div><button type="button" class="ghost sm" data-act="lib-load" data-col="${key}" data-id="${esc(x.id)}">Open</button><button type="button" class="iconbtn" data-act="lib-del" data-col="${key}" data-id="${esc(x.id)}" aria-label="Delete ${esc(x.name)}">${svg(IC.trash, 15)}</button></div>`).join('') : '<div class="muted" style="font-size:12.5px">Nothing saved yet.</div>'}
    <div class="lbl" style="margin-top:6px">Examples</div>
    ${ex[key].map((x, i) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><div style="flex:1;min-width:0"><div style="font-weight:500">${esc(x.name)}</div><div class="muted" style="font-size:12px">${key === 'builds' ? `${x.workloads.length} workloads · ${x.data.length} data · ${x.scenarios.length} scenarios` : `${x.regions.map(r => REGIONS[r].code).join(', ')} · ${x.compute.length} compute · ${x.stores.length} stores`}</div></div><button type="button" class="ghost sm" data-act="lib-example" data-col="${key}" data-i="${i}">Open</button></div>`).join('')}
  </section>`;
  return `<div class="scrim" data-act="close-overlay"><div class="modal" role="dialog" aria-label="Save and load" data-stop="1">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><h1 style="font-size:19px">Save and load</h1><span class="muted" style="font-size:12.5px">Builds and Deploy configs are saved separately, so you can try one Build on several Deploy configs.${ST.lib.src === 'db' ? ' Saved with this page.' : ' Saved in this browser.'}</span><button type="button" class="iconbtn" data-act="close-overlay" aria-label="Close" style="margin-left:auto">${svg(IC.x, 16)}</button></div>
    <div style="display:flex;flex-wrap:wrap;gap:24px;margin-top:12px">${col('builds', 'Builds', ST.build, 'Logic and data only: workloads, data, scenarios.')}${col('deploys', 'Deploy configs', ST.deploy, 'Infrastructure: regions, compute, stores, networks.')}</div>
  </div></div>`;
}
function renderOverlay() { $('#overlay').innerHTML = ST.overlay === 'library' ? libraryHTML() : ''; }

/* ---------- comment mode ---------- */
async function toggleFb() {
  ST.fb = !ST.fb; document.body.classList.toggle('fbmode', ST.fb); renderTop();
  if (ST.fb && ST.comments === undefined) { try { ST.comments = window.claude && window.claude.use ? await window.claude.use('comments') : null; } catch (e) { ST.comments = null; } }
}
async function fbClick(t) {
  const el = t.closest('[data-fb]') || t;
  if (!ST.comments) { toast('Commenting from the page isn’t available here. Use the comment tool above the page.'); return; }
  try { const r = await ST.comments.openComposer({ element: el }); if (r && r.opened === false) toast('Finish the comment you have open first'); } catch (e) { if (e && e.code === 'unavailable') { ST.comments = null; toast('Comments aren’t available in this view.'); } else toast('Couldn’t open the comment box.'); }
}

/* ---------- event wiring (handlers registered by each mode) ---------- */
const ACT = {}, CH = {}, IN = {};
ACT['mode'] = el => { ST.mode = el.dataset.m; history.replaceState(null, '', '#' + ST.mode); render(); };
ACT['undo'] = () => undo(); ACT['redo'] = () => redo();
ACT['library'] = () => { ST.overlay = 'library'; renderOverlay(); };
ACT['close-overlay'] = (el, ev) => { if (el.classList.contains('scrim') && ev.target !== el) return; ST.overlay = null; renderOverlay(); };
ACT['lib-save'] = el => { const n = ($('#save-' + el.dataset.col).value || '').trim(); if (!n) { toast('Give it a name first'); return; } libSave(el.dataset.col, n); };
ACT['lib-load'] = el => { const x = ST.lib[el.dataset.col].find(y => y.id === el.dataset.id); if (x) { try { loadDoc(JSON.parse(x.json)); } catch (e) { toast('That saved item is damaged.'); } } };
ACT['lib-del'] = el => libDelete(el.dataset.col, el.dataset.id);
ACT['lib-example'] = el => loadDoc(el.dataset.col === 'builds' ? exampleBuild() : exampleDeploys()[+el.dataset.i]);
ACT['lib-export'] = el => exportDoc(el.dataset.col);
CH['lib-import'] = el => { const f = el.files && el.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { loadDoc(JSON.parse(r.result)); } catch (e) { toast('That file isn’t valid JSON.'); } }; r.readAsText(f); };
ACT['fb'] = () => toggleFb();
ACT['toast-act'] = () => { const f = ST.toastAct; $('#toast-root').innerHTML = ''; ST.toastAct = null; if (f) f(); };

document.addEventListener('click', ev => {
  if (ST.fb && !ev.target.closest('[data-act="fb"], .fbbar, #toast-root')) { ev.preventDefault(); ev.stopPropagation(); fbClick(ev.target); return; }
  const el = ev.target.closest('[data-act]'); if (!el) { if (ACT._bg) ACT._bg(ev); return; }
  if (el.disabled) return;
  const f = ACT[el.dataset.act]; if (f) f(el, ev);
}, true);
document.addEventListener('change', ev => { const el = ev.target.closest('[data-ch]'); if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, ev); });
document.addEventListener('input', ev => { const el = ev.target.closest('[data-in]'); if (el && IN[el.dataset.in]) IN[el.dataset.in](el, ev); });
document.addEventListener('keydown', ev => {
  const inField = /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '');
  if (ev.key === 'Escape') { if (ST.overlay) { ST.overlay = null; renderOverlay(); } else if (ST.fb) toggleFb(); else if (ST.mode === 'build' && ST.bSel && !inField) { ST.bSel = null; render(); } else if (ST.mode === 'deploy' && ST.dSel && !inField) { ST.dSel = null; render(); } return; }
  if (inField) return;
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? redo() : undo(); }
});
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (['build', 'deploy', 'simulate'].includes(h) && h !== ST.mode) { ST.mode = h; render(); } });
