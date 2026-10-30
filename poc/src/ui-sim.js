/* ===================== Simulate mode ===================== */
function curScen() { let s = ST.build.scenarios.find(x => x.id === ST.scen); if (!s) { s = ST.build.scenarios.find(x => A.entries.some(e => e.key === x.entry)) || ST.build.scenarios[0]; ST.scen = s ? s.id : null; } return s; }
function scenSig(sc) { return JSON.stringify([ST.build.workloads.map(w => [w.name, w.code, !!w.external]), ST.build.data.map(d => [d.name, d.kind, d.rows, d.rowKB, d.fields]), ST.deploy, sc]); }
function scenPaths(sc) { const e = entryInfo(A, sc.entry); if (!e) return []; return enumeratePaths(A, sc.entry, sc.odds || {}, { fileRows: e.type === 'file' ? (sc.rows || 1) : 1 }); }
function niceStep(x) { if (x <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(x))); const m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

function renderSim(v) {
  keepScroll(['s-center', 's-panel', 's-rail'], () => {
    v.innerHTML = `<div class="panes"><aside class="rail" id="s-rail" aria-label="Scenarios and paths"></aside><section class="center scroll" id="s-center"></section><aside class="panel" id="s-panel" aria-label="Scenario"></aside></div>`;
    renderSRail(); renderSCenter(); renderSPanel();
  });
}
function scenStatus(sc) {
  const r = ST.results[sc.id]; if (!r) return '<span class="muted" style="font-size:11.5px">not run</span>';
  if (r.sig !== scenSig(sc)) return '<span class="tag mute">out of date</span>';
  return r.ok ? '<span class="tag good">met</span>' : '<span class="tag bad">missed</span>';
}
function renderSRail() {
  const el = $('#s-rail'); if (!el) return; const sc = curScen();
  const paths = sc && entryInfo(A, sc.entry) ? scenPaths(sc) : [];
  el.innerHTML = `<div class="rsec" data-fb="Scenarios"><div class="hd"><span class="lbl" style="flex:1">Scenarios</span><button type="button" class="iconbtn" data-act="s-add" aria-label="Add scenario" title="Add scenario">${svg(IC.plus, 15)}</button></div>
      ${ST.build.scenarios.map(s => { const e = entryInfo(A, s.entry); return `<button type="button" class="ritem ${sc && s.id === sc.id ? 'on' : ''}" data-act="s-sel" data-id="${s.id}">${svg(e ? TRIG_ICON[e.type] : IC.x, 14, e ? 'var(--muted)' : 'var(--bad)')}<span class="nm">${esc(s.name)}</span>${scenStatus(s)}</button>`; }).join('') || '<div class="muted" style="font-size:12.5px">No scenarios yet.</div>'}</div>
    ${sc && entryInfo(A, sc.entry) ? `<div class="rsec" data-fb="Paths"><div class="hd"><span class="lbl">Paths</span></div><div class="muted" style="font-size:12px;margin-bottom:2px">${paths.length} way${paths.length > 1 ? 's' : ''} through, read from the code. Click one to follow a single request through the infrastructure.</div>
      ${paths.map((p, i) => `<button type="button" class="ritem ${ST.sMode === 'step' && ST.stepR && ST.stepR.scen === sc.id && ST.stepR.i === i ? 'on' : ''}" data-act="s-trace" data-i="${i}" style="align-items:flex-start" title="Step through this path"><span class="num" style="font-size:11.5px;width:42px;flex-shrink:0;padding-top:1px">${(p.p * 100).toFixed(p.p < 0.1 ? 1 : 0)}%</span><span style="flex:1;min-width:0;font-size:12.5px;line-height:1.35">${esc(p.label.charAt(0).toUpperCase() + p.label.slice(1))}</span>${p.outcome === 'error' ? '<span class="tag warn">error</span>' : ''}</button>`).join('')}</div>` : ''}`;
}
function renderSPanel() {
  const el = $('#s-panel'); if (!el) return; const sc = curScen();
  if (!sc) { el.innerHTML = `<div class="note">Add a scenario to describe what happens to the system: a rush of requests, a file landing, a scheduled job.</div><button type="button" class="btn sm" data-act="s-add">Add a scenario</button>`; return; }
  const e = entryInfo(A, sc.entry); const mode = e ? scenarioMode(A, sc) : null;
  const conds = e ? conditionsFor(A, sc.entry) : [];
  const ot = Object.values(sc.origins || {}).reduce((a, b) => a + b, 0) || 1;
  el.innerHTML = `<div class="ph"><span class="ico" style="width:36px;height:36px;background:var(--accent-soft)">${svg(e ? TRIG_ICON[e.type] : IC.play, 18, 'var(--accent)')}</span><div style="flex:1;min-width:0"><label class="lbl" for="sc-name" style="display:block">Scenario</label><input id="sc-name" value="${esc(sc.name)}" data-ch="s-name"></div><button type="button" class="iconbtn" data-act="s-del" aria-label="Delete scenario" title="Delete">${svg(IC.trash, 16)}</button></div>
    <div class="q" data-fb="Scenario trigger"><label class="qh" for="sc-entry">What starts it?</label><select class="field" id="sc-entry" data-ch="s-entry">${!e ? `<option selected value="${esc(sc.entry)}">${esc(sc.entry)} (no longer in the Build)</option>` : ''}${A.entries.map(x => `<option value="${esc(x.key)}" ${x.key === sc.entry ? 'selected' : ''}>${esc(x.type === 'request' ? `Request: ${x.w}.${x.h}` : x.type === 'message' ? `Message: ${x.label}` : x.type === 'file' ? `File lands: ${x.label}` : x.type === 'schedule' ? `Schedule: ${x.label}` : x.label)}</option>`).join('')}</select></div>
    ${mode === 'rate' ? `<div class="q" data-fb="Scenario volume"><div class="qh">How many?</div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="field num" style="width:120px" type="number" min="1" id="sc-count" value="${sc.count || 1000}" data-ch="s-num" data-k="count" aria-label="Count"><span class="muted">over</span><input class="field num" style="width:70px" type="number" min="1" id="sc-dur" value="${sc.durationMin || 60}" data-ch="s-num" data-k="durationMin" aria-label="Minutes"><span class="muted">minutes</span></div>
        <div class="seg">${[['steady', 'Spread evenly'], ['peak', 'Peaks at 3×'], ['ramp', 'Keeps rising']].map(([k, l]) => `<button type="button" class="${(sc.burst || 'steady') === k ? 'on' : ''}" data-act="s-set" data-k="burst" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="note">${sc.burst === 'ramp' ? `Starts low and keeps rising past what this Deploy can take, so you can watch what breaks first. <b>Run</b> tests ${fmtRate(scenarioRate(sc))} a second; use <b>Watch it run</b> to see the climb.` : `About <b class="num">${fmtRate(scenarioRate(sc))}</b> a second at the busiest moment.`}</div></div>`
      : mode === 'batch' ? `<div class="q" data-fb="Scenario volume"><div class="qh">${e.type === 'file' ? 'How big is the file?' : 'One run'}</div>${e.type === 'file' ? `<div style="display:flex;gap:8px;align-items:center"><input class="field num" style="width:140px" type="number" min="1" id="sc-rows" value="${sc.rows || 1}" data-ch="s-num" data-k="rows" aria-label="Rows"><span class="muted">rows</span></div>` : `<div class="note">The job runs once, as scheduled. Its work comes from the code.</div>`}</div>` : ''}
    ${e && e.type === 'request' ? `<div class="q" data-fb="Where users are"><div class="qh">Where are the users?</div>${Object.keys(POPS).map(p => `<div class="slider"><label for="o-${p}">${POPS[p].label}</label><input type="range" id="o-${p}" min="0" max="100" value="${(sc.origins || {})[p] || 0}" data-in="s-origin" data-ch="s-origin" data-p="${p}"><span class="num" id="ov-${p}" style="text-align:right">${Math.round(((sc.origins || {})[p] || 0) / ot * 100)}%</span></div>`).join('')}<div class="note">Each group reaches the nearest region where ${esc(e.w)} runs.</div></div>` : ''}
    ${conds.length ? `<div class="q" data-fb="Branch odds"><div class="qh">How often does each branch happen?</div>${conds.map(c => { const v = sc.odds && sc.odds[c.key] != null ? sc.odds[c.key] : c.def; const changed = sc.odds && sc.odds[c.key] != null; return `<div class="slider" style="grid-template-columns:1fr 110px 46px"><label for="b-${esc(c.key)}" title="${esc(c.key)}"><span class="mono" style="font-size:12px">${esc(c.cond)}</span> <span class="muted" style="font-size:11.5px">${esc(c.w)}</span> ${changed ? `<button type="button" class="link" style="font-size:11.5px" data-act="s-odds-reset" data-k="${esc(c.key)}">reset</button>` : ''}</label><input type="range" id="b-${esc(c.key)}" min="0" max="100" step="0.5" value="${(v * 100).toFixed(1)}" data-in="s-odds" data-ch="s-odds" data-k="${esc(c.key)}"><span class="num" id="bv-${esc(c.key)}" style="text-align:right">${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%</span></div>`; }).join('')}<div class="note">Defaults come from the <code>@%</code> in the code. Changes here apply to this scenario only.</div></div>` : ''}
    <div class="q" data-fb="Goal"><div class="qh">Goal</div>${mode === 'batch' ? `<div style="display:flex;gap:8px;align-items:center"><span class="muted">Finish within</span><input class="field num" style="width:80px" type="number" min="1" id="sc-goalmin" value="${sc.goalMin || 30}" data-ch="s-num" data-k="goalMin" aria-label="Minutes"><span class="muted">minutes</span></div>` : `<div style="display:flex;gap:8px;align-items:center"><span class="muted">99% finish within</span><input class="field num" style="width:90px" type="number" min="1" id="sc-goalms" value="${sc.goalMs || 500}" data-ch="s-num" data-k="goalMs" aria-label="Milliseconds"><span class="muted">ms</span></div>`}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="s-run" ${e ? '' : 'disabled'}>${svg(IC.play, 12, 'currentColor')}Run scenario</button>${mode === 'rate' ? `<button type="button" class="ghost" data-act="pl-start">${svg(IC.clock, 14)}Watch it run</button><button type="button" class="ghost" data-act="s-stress">Find max throughput</button>` : ''}<button type="button" class="ghost sm" data-act="s-dup">Duplicate</button></div>
    <div class="note">${mode === 'rate' ? '<b>Run</b> tests the busiest moment. <b>Watch it run</b> plays the whole scenario so you can see scaling and bottlenecks as they happen. Click a path on the left to follow one request step by step.' : 'Click the path on the left to follow one run step by step.'}</div>`;
}
function routeOf(spans) { const out = []; spans.forEach(s => { const g = s[4]; if (!g) return; if (g.kind === 'net' && g.from && g.to && g.from !== g.to) out.push([g.from, g.to]); if ((g.kind === 'data' || g.kind === 'pub') && g.target !== g.region) out.push([g.region, g.target]); }); return out; }
function renderSCenter() {
  const el = $('#s-center'); if (!el) return; const sc = curScen(); stopParticles();
  if (ST.play && (!sc || ST.play.scen !== sc.id)) { clearTimeout(playT); ST.play = null; if (ST.sMode === 'watch') ST.sMode = null; }
  if (ST.stepR && (!sc || ST.stepR.scen !== sc.id)) { ST.stepR = null; if (ST.sMode === 'step') ST.sMode = null; }
  if (ST.sMode === 'watch' && !ST.play && !ST.running) ST.sMode = null; if (ST.sMode === 'step' && !ST.stepR) ST.sMode = null;
  const rr = sc && ST.results[sc.id]; const res = rr && rr.res; const rate = sc && scenarioMode(A, sc) === 'rate';
  const view = ST.sView === 'diagram' ? `<div id="s-boardwrap" class="sboard">${infraDiagram({ static: true })}</div>` : `<div style="padding:10px 14px;border-bottom:1px solid var(--line);background:var(--surface-2)"><div id="s-mapwrap">${worldMap({ res: res && res.mode === 'rate' && ST.sMode !== 'step' ? res : null, static: true })}</div><div class="legend" style="padding:6px 0 0"><span><i style="border-color:var(--accent)"></i>users to region</span><span><i style="border-color:var(--write)"></i>traffic between regions</span><span><i style="border-color:var(--repl);border-top-style:dashed"></i>copies data</span>${ST.sMode === 'step' ? '<span><i style="border-color:var(--bad)"></i>this request so far</span>' : ''}<span class="muted">Region color shows how busy its busiest part is.</span></div></div>`;
  const tb = sc ? `<button type="button" class="${ST.sMode ? 'ghost' : 'btn'} sm" data-act="s-run">${svg(IC.play, 11, 'currentColor')}Run</button>${rate ? `<button type="button" class="${ST.sMode === 'watch' ? 'ghost on' : 'ghost'} sm" data-act="pl-start" title="Play the scenario minute by minute">${svg(IC.clock, 13)}Watch it run</button><button type="button" class="ghost sm" data-act="s-stress">Find max throughput</button>` : ''}` : '';
  let top = '', body = '';
  if (ST.running) body = `<div class="res"><div class="card"><h2>Running…</h2><div class="muted">${ST.running}</div></div></div>`;
  else if (ST.sMode === 'watch') { top = watchBar(); body = `<div class="res"><div class="live" id="pl-live"></div></div>`; }
  else if (ST.sMode === 'step') { top = `<div id="sr-bar">${stepBar(sc)}</div>`; body = `<div class="res" id="s-step">${stepCard(sc)}</div>`; }
  else body = `<div class="res" id="s-res">${sc ? resultsHTML(sc, rr) : ''}</div>`;
  el.innerHTML = `<div class="ctool" data-fb="Simulate toolbar"><div class="tabs2" role="group" aria-label="View"><button type="button" class="${ST.sView === 'diagram' ? 'on' : ''}" data-act="s-view" data-v="diagram">Diagram</button><button type="button" class="${ST.sView === 'map' ? 'on' : ''}" data-act="s-view" data-v="map">World map</button></div>
      <span class="muted" style="font-size:12.5px">${sc ? esc(sc.name) : ''} on “${esc(ST.deploy.name)}”</span><span style="flex:1"></span>${tb}</div>${top}${view}${body}`;
  requestAnimationFrame(() => {
    wireAll(); const board = $('#s-center .board');
    if (ST.sMode === 'watch' && ST.play) { playPaint(); startParticles(playFrame); }
    else if (ST.sMode === 'step' && ST.stepR) stepPaint(false);
    else if (res && res.mode === 'rate' && rr.sig === scenSig(sc)) { paintBoard(board, res.R); startParticles(() => ({ links: res.links, err: res.sysErr })); }
  });
}
function traceHTML(tr) {
  const tot = tr.t || 1; const col = k => ({ net: 'var(--ext)', cpu: 'var(--wl)', data: 'var(--data)', pub: 'var(--msg)', ext: 'var(--ext)', par: 'var(--repl)' })[k] || 'var(--accent)';
  return `<div class="card" data-fb="Path trace"><div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px"><h2 style="margin:0">Trace: ${esc(tr.label)}</h2><span class="muted">${fmtMs(tr.t)} · typical timings${tr.withLoad ? ' at the last run’s load' : ', no load'}</span><span style="flex:1"></span>
      ${tr.origins.length > 1 ? `<label class="muted" style="font-size:12.5px;display:flex;gap:6px;align-items:center">From <select class="field" id="tr-o" data-ch="s-trace-o">${tr.origins.map((o, i) => `<option value="${i}" ${i === tr.oi ? 'selected' : ''}>${o.pop ? POPS[o.pop].label : REGIONS[o.region].code}</option>`).join('')}</select></label>` : ''}<button type="button" class="iconbtn" data-act="s-trace-close" aria-label="Close trace">${svg(IC.x, 15)}</button></div>
    ${tr.spans.map(s => `<div class="hbar"><span title="${esc(s[0])}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s[0])}</span><span class="tr" style="background:var(--surface-2)"><i style="left:${(s[1] / tot * 100).toFixed(2)}%;width:${Math.max(0.5, s[2] / tot * 100).toFixed(2)}%;background:${col(s[3])}"></i></span><span class="num" style="text-align:right">${fmtMs(s[2])}</span></div>`).join('')}
    ${tr.route.length ? `<div class="note" style="margin-top:6px">Crosses regions ${tr.route.length} time${tr.route.length > 1 ? 's' : ''}: ${tr.route.map(([a, b]) => `${REGIONS[a].code} → ${REGIONS[b].code} (${rtt(a, b)} ms)`).join(', ')}.</div>` : ''}</div>`;
}
function resultsHTML(sc, rr) {
  if (!rr) return `<div class="card"><h2>Not run yet</h2><div class="muted">Run the scenario to see how “${esc(ST.deploy.name)}” handles it. Every run uses the same Build, so you can switch Deploy configs and compare.</div></div>`;
  const stale = rr.sig !== scenSig(sc); const r = rr.res;
  const staleB = stale ? `<div class="banner warn">The Build, Deploy config or scenario changed since this run.<button type="button" class="btn sm" data-act="s-run" style="margin-left:auto">Run again</button></div>` : '';
  if (r.mode === 'batch') return staleB + batchHTML(sc, r);
  const ok = r.p99 <= sc.goalMs && r.sysErr <= 0.01; const top = r.ranked[0] && r.ranked[0][1];
  const worstPop = r.popStats.slice().sort((a, b) => b.p99 - a.p99)[0];
  const head = ok ? `Meets the goal: 99% finish within ${fmtMs(r.p99)} at ${fmtRate(r.lambda)} a second.` : r.sysErr > 0.01 ? `Fails ${pct(r.sysErr)} of requests at ${fmtRate(r.lambda)} a second${Object.keys(r.why)[0] ? ': ' + Object.keys(r.why).sort((a, b) => r.why[b] - r.why[a])[0].toLowerCase() : ''}.` : `Misses the goal: the slowest 1% take ${fmtMs(r.p99)}${worstPop && worstPop.o.pop && r.popStats.length > 1 ? `, worst for ${POPS[worstPop.o.pop].label} (${fmtMs(worstPop.p99)})` : ''}.`;
  const lamMax = top && top.rho > 0 ? r.lambda / top.rho : Infinity;
  const sugg = suggestions(sc, r);
  const st = rr.stress;
  return staleB + `<div data-fb="Results headline"><h1 class="head1">${esc(head)}</h1><div class="muted" style="margin-top:4px">${fmtInt(r.paths.length)} path${r.paths.length > 1 ? 's' : ''} · 1,500 sample requests at the busiest moment · approximate model</div></div>
    <div class="tiles"><div class="tile"><span class="lbl">Load</span><span class="v">${fmtRate(r.lambda)}/s</span><span class="muted" style="font-size:12px">${fmtInt(sc.count)} over ${sc.durationMin} min</span></div>
      <div class="tile"><span class="lbl">Typical</span><span class="v">${fmtMs(r.p50)}</span></div>
      <div class="tile ${ok ? 'good' : 'bad'}"><span class="lbl">Slowest 1%</span><span class="v">${fmtMs(r.p99)}</span><span class="muted" style="font-size:12px">goal ${fmtMs(sc.goalMs)}</span></div>
      <div class="tile ${r.sysErr > 0.01 ? 'bad' : ''}"><span class="lbl">Failures</span><span class="v">${pct(r.sysErr)}</span><span class="muted" style="font-size:12px">overload, timeouts</span></div>
      <div class="tile"><span class="lbl">Expected errors</span><span class="v">${pct(r.bizErr)}</span><span class="muted" style="font-size:12px">error paths in the code</span></div>
      <div class="tile"><span class="lbl">Cost</span><span class="v">$${r.cost.toFixed(r.cost < 10 ? 2 : 0)}/h</span><span class="muted" style="font-size:12px">sample prices</span></div></div>
    ${sugg.length ? `<div style="display:flex;flex-direction:column;gap:8px">${sugg.join('')}</div>` : ''}
    <div class="card" data-fb="What limits it"><h2>What limits it</h2>${r.ranked.slice(0, 6).map(([k, s]) => `<div class="hbar"><span>${esc(s.label)} <span class="muted">${s.what}</span></span><span class="tr"><i style="left:0;width:${Math.min(100, s.rho * 100).toFixed(1)}%;background:${s.rho >= 1 ? 'var(--bad)' : s.rho >= 0.75 ? 'var(--warn)' : 'var(--accent)'}"></i></span><span class="num" style="text-align:right">${Math.round(s.rho * 100)}%</span></div>`).join('') || '<div class="muted">Nothing is measurably busy.</div>'}
      <div class="note" style="margin-top:6px">${isFinite(lamMax) && top ? `At this mix it could take about <b class="num">${fmtRate(lamMax)}</b> a second before ${esc(top.label)} is full. “Find max throughput” checks this properly.` : 'Serverless services scale on their own and don’t show here.'}</div></div>
    ${Object.keys(r.lags).length ? `<div class="card" data-fb="Async work"><h2>Work that happens later</h2>${Object.entries(r.lags).map(([d, l]) => `<div class="kv"><span>${esc(d)} → ${esc(l.consumer.split('.')[0])}</span><span class="${l.lagS > 60 ? '' : 'muted'}" style="${l.lagS > 60 ? 'color:var(--bad)' : ''}">${l.lagS > 60 ? `falls ${fmtDur(l.lagS)} behind by the end` : `keeps up (${fmtRate(l.pubRate)}/s in, room for ~${fmtRate(l.capRate)}/s)`}</span></div>`).join('')}</div>` : ''}
    ${st ? stressHTML(sc, st) : ''}
    ${r.popStats.length > 1 || (r.popStats[0] && r.popStats[0].o.pop) ? `<div class="card" data-fb="By where users are"><h2>By where users are</h2><div class="tscroll"><table class="tbl"><thead><tr><th>Users</th><th>Served from</th><th>Getting there</th><th>Typical</th><th>Slowest 1%</th></tr></thead><tbody>${r.popStats.map(x => { const bad = x.p99 > sc.goalMs; return `<tr><td>${x.o.pop ? esc(POPS[x.o.pop].label) : 'Start'} <span class="muted">${Math.round(x.o.share * 100)}%</span></td><td class="mono">${x.o.region ? REGIONS[x.o.region].code : '–'}</td><td class="num">${fmtMs(x.o.reach)}</td><td class="num">${fmtMs(x.p50)}</td><td class="num" style="${bad ? 'color:var(--bad);font-weight:600' : ''}">${fmtMs(x.p99)}</td></tr>`; }).join('')}</tbody></table></div></div>` : ''}
    <div class="card" data-fb="Paths results"><h2>Each path</h2><div class="tscroll"><table class="tbl"><thead><tr><th>Path</th><th>Share</th><th>Typical</th><th>Slowest 1%</th><th>Failures</th><th></th></tr></thead><tbody>${r.pathStats.map((p, i) => `<tr><td>${esc(p.path.label.charAt(0).toUpperCase() + p.path.label.slice(1))} ${p.path.outcome === 'error' ? '<span class="tag warn">error</span>' : ''}</td><td class="num">${pct(p.share)}</td><td class="num">${fmtMs(p.p50)}</td><td class="num">${fmtMs(p.p99)}</td><td class="num">${p.err ? pct(p.err) : '–'}</td><td><button type="button" class="ghost sm" data-act="s-trace" data-i="${i}">Step through</button></td></tr>`).join('')}</tbody></table></div></div>
    ${r.slow ? `<div class="card" data-fb="Slowest request"><h2>The slowest request</h2><div class="muted" style="margin-bottom:6px">${esc(r.slow.path.label)} · ${r.slow.origin.pop ? esc(POPS[r.slow.origin.pop].label) : ''} · ${fmtMs(r.slow.t)}</div>${r.slow.spans.map(s => `<div class="hbar"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s[0])}">${esc(s[0])}</span><span class="tr" style="background:var(--surface-2)"><i style="left:${(s[1] / r.slow.t * 100).toFixed(2)}%;width:${Math.max(0.5, s[2] / r.slow.t * 100).toFixed(2)}%;background:${({ net: 'var(--ext)', cpu: 'var(--wl)', data: 'var(--data)', pub: 'var(--msg)', ext: 'var(--ext)', par: 'var(--repl)' })[s[3]] || 'var(--accent)'}"></i></span><span class="num" style="text-align:right">${fmtMs(s[2])}</span></div>`).join('')}</div>` : ''}
    <div class="card"><h2>Cost per hour at this load</h2>${Object.entries(r.costBy).map(([k, v]) => `<div class="kv"><span>${k}</span><span class="num">$${v.toFixed(2)}</span></div>`).join('')}<div class="note">Sample list prices. Not a quote.</div></div>`;
}
function suggestions(sc, r) {
  const out = []; const row = (txt, btn) => `<div class="fixrow">${svg(IC.bolt, 16, 'var(--accent)')}<span style="flex:1">${txt}</span>${btn || ''}</div>`;
  const conn = r.ranked.find(([k, s]) => s.type === 'conn' && s.rho > 0.9);
  if (conn) out.push(row(`<b>${esc(conn[1].ref.name)} is running out of connections</b>: instances want ${fmtInt(conn[1].want)}, it allows ${fmtInt(conn[1].cap)}. Use a bigger size, fewer instances, or a pooler.`, `<button type="button" class="ghost sm" data-act="d-sel" data-t="s" data-id="${conn[1].ref.id}">Open in Deploy</button>`));
  const hot = r.ranked.find(([k, s]) => s.type !== 'conn' && s.rho > 0.9);
  if (hot) out.push(row(`<b>${esc(hot[1].label)}</b> is ${Math.round(hot[1].rho * 100)}% busy (${hot[1].what}).`, `<button type="button" class="ghost sm" data-act="d-sel" data-t="${hot[1].type === 'compute' ? 'c' : 's'}" data-id="${hot[1].ref.id}">Open in Deploy</button>`));
  // cross-region hops on the slowest path
  if (r.slow) { const far = r.slow.spans.filter(s => s[4] && ((s[4].kind === 'net' && s[4].from !== s[4].to && !s[4].external) || ((s[4].kind === 'data' || s[4].kind === 'pub') && s[4].target !== s[4].region))).sort((a, b) => b[2] - a[2])[0];
    if (far && far[2] > sc.goalMs * 0.15) { const g = far[4]; const isData = g.kind !== 'net'; out.push(row(`<b>${esc(far[0])}</b> crosses regions and takes ${fmtMs(far[2])} of the slowest request. ${isData ? `Consider copies of ${esc(g.store.name)} in more regions, or a different “copies across regions” setting.` : `Consider running ${esc(g.s.w)} in more regions.`}`, `<button type="button" class="ghost sm" data-act="d-sel" data-t="${isData ? 's' : 'c'}" data-id="${isData ? g.store.id : (M.comp[g.s.w] || {}).id}">Open in Deploy</button>`)); } }
  // sequential loops (N+1)
  const loopStep = r.paths[0] && r.paths[0].steps.find(s => s.loop && !s.loop.file && s.loop.par <= 1 && s.k === 'data' && s.loop.n > 1);
  if (loopStep) { const w = ST.build.workloads.find(x => x.name === loopStep.w); out.push(row(`<b>${esc(loopStep.w)}</b> reads ${esc(loopStep.d)} ${loopStep.loop.n} times one after another (line ${loopStep.loop.line}). Reading them in one query, or adding <code>parallel</code>, removes ${loopStep.loop.n - 1} round trips.`, w ? `<button type="button" class="ghost sm" data-act="s-open-build" data-id="${w.id}" data-line="${loopStep.loop.line}">Open in Build</button>` : '')); }
  return out;
}
function stressHTML(sc, st) {
  const pts = st.pts; const xmax = Math.max(...pts.map(p => p.lam)); const ymax0 = Math.max(sc.goalMs * 1.4, ...pts.map(p => Math.min(p.p99, sc.goalMs * 4))); const ys = niceStep(ymax0 / 4); const ymax = Math.ceil(ymax0 / ys) * ys; const xs = niceStep(xmax / 5);
  const X = v => 56 + v / xmax * 680, Y = v => 200 - Math.min(v, ymax) / ymax * 180;
  const ticksY = []; for (let v = 0; v <= ymax + 0.01; v += ys) ticksY.push(v); const ticksX = []; for (let v = 0; v <= xmax + 0.01; v += xs) ticksX.push(v);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p.lam).toFixed(1) + ' ' + Y(p.p99).toFixed(1)).join(' ');
  const bars = pts.map(p => p.err > 0 ? `<rect x="${X(p.lam) - 6}" y="${200 - p.err * 70}" width="12" height="${p.err * 70}" rx="2" fill="var(--bad)" opacity=".6"/>` : '').join('');
  const head = st.slo > 0 ? `Handles up to about ${fmtRate(st.slo)} a second within the goal.` : `Misses the goal even at light load (slowest 1% stays above ${fmtMs(sc.goalMs)}).`;
  return `<div class="card" data-fb="Max throughput"><h2>Max throughput</h2><div style="font-weight:600;margin-bottom:2px">${esc(head)}</div><div class="muted" style="margin-bottom:8px">${st.first ? `Past about ${fmtRate(st.lamCap)} a second, ${esc(st.first.label)} is full (${st.first.what}). ` : ''}Scenario load today: ${fmtRate(scenarioRate(sc))} a second.</div>
    <div style="overflow-x:auto"><svg class="chart" viewBox="0 0 760 236" style="width:100%;min-width:520px;height:auto;display:block" role="img" aria-label="Slowest 1% and failures as load rises">
      ${ticksY.map(v => `<line x1="56" x2="736" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="50" y="${Y(v) + 4}" text-anchor="end">${fmtMs(v)}</text>`).join('')}
      ${ticksX.map(v => `<text x="${X(v)}" y="222" text-anchor="middle">${fmtRate(v)}/s</text>`).join('')}
      <line x1="56" x2="736" y1="${Y(sc.goalMs)}" y2="${Y(sc.goalMs)}" stroke="var(--bad)" stroke-dasharray="5 4"/><text x="736" y="${Y(sc.goalMs) - 5}" text-anchor="end" style="fill:var(--bad)">goal ${fmtMs(sc.goalMs)}</text>
      ${bars}<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2"/>${pts.map(p => `<circle cx="${X(p.lam)}" cy="${Y(p.p99)}" r="3" fill="var(--accent)"/>`).join('')}
      ${st.slo > 0 ? `<line x1="${X(st.slo)}" x2="${X(st.slo)}" y1="20" y2="200" stroke="var(--good)" stroke-dasharray="3 3"/><text x="${X(st.slo) + 4}" y="30" style="fill:var(--good)">within goal up to here</text>` : ''}
    </svg></div><div class="muted" style="font-size:12px">Blue: slowest 1% as requests per second rise. Red bars: share of requests that fail.</div>
    <div style="margin-top:8px"><div class="lbl">What fills up, in order</div>${st.order.map(s => `<div class="kv"><span>${esc(s.label)} <span class="muted">${s.what}</span></span><span class="num">${Math.round(s.rho * 100)}% at the highest load tested</span></div>`).join('')}</div></div>`;
}
function batchHTML(sc, r) {
  const goalS = (sc.goalMin || 30) * 60; const ok = !r.timeout && r.finishS <= goalS;
  const head = r.timeout ? `Stops after 15 minutes: ${r.comp.name} runs on Functions, which time out. About ${fmtInt(r.done)} of ${fmtInt(r.rows)} rows get done.` : ok ? `Finishes in ${fmtDur(r.finishS)}, within the ${sc.goalMin}-minute goal.` : `Takes ${fmtDur(r.finishS)}, over the ${sc.goalMin}-minute goal.`;
  const first = r.limits[0]; const mx = Math.max(...r.limits.map(l => l.t), 1);
  const sugg = [];
  const row = (txt, btn) => `<div class="fixrow">${svg(IC.bolt, 16, 'var(--accent)')}<span style="flex:1">${txt}</span>${btn || ''}</div>`;
  const loop = r.plan.find(g => g.s.loop && g.s.loop.file);
  if (first.what === 'one step at a time' && loop && loop.s.loop.par <= 1) { const w = ST.build.workloads.find(x => x.name === loop.s.w); sugg.push(row(`Rows are handled one at a time, so the run takes as long as ${fmtInt(r.rows)} round trips. Process them in parallel: <code>for each row in file parallel 50</code>.`, w ? `<button type="button" class="btn sm" data-act="s-par" data-id="${w.id}" data-line="${loop.s.loop.line}">Apply in Build</button>` : '')); }
  const scan = r.plan.find(g => g.kind === 'data' && g.scan);
  if (scan) { const d = ST.build.data.find(x => x.name === scan.d); const by = scan.s.by; sugg.push(row(`<b>${esc(scan.d)}.${esc(by)}</b> isn’t indexed, so the job reads all ${fmtInt(scan.rows)} rows.`, d ? `<button type="button" class="btn sm" data-act="s-index" data-id="${d.id}" data-f="${esc(by)}">Index ${esc(scan.d)}.${esc(by)} in Build</button>` : '')); }
  if (r.timeout) sugg.push(row(`Functions stop after 15 minutes. Move ${esc(r.entry.w)} to a Kubernetes cluster or VMs, or make the run shorter.`, `<button type="button" class="ghost sm" data-act="d-sel" data-t="c" data-id="${r.comp.id}">Open in Deploy</button>`));
  return `<div data-fb="Results headline"><h1 class="head1">${esc(head)}</h1><div class="muted" style="margin-top:4px">${esc(r.entry.label)} · one run · approximate model</div></div>
    <div class="tiles"><div class="tile"><span class="lbl">${r.entry.type === 'file' ? 'Rows' : 'Runs'}</span><span class="v">${fmtInt(r.rows)}</span></div><div class="tile ${ok ? 'good' : 'bad'}"><span class="lbl">Finish time</span><span class="v">${r.timeout ? '15 min' : fmtDur(r.finishS)}</span><span class="muted" style="font-size:12px">goal ${sc.goalMin} min</span></div>${r.entry.type === 'file' ? `<div class="tile"><span class="lbl">Rows per second</span><span class="v">${fmtRate(r.rate)}</span></div>` : ''}<div class="tile"><span class="lbl">Runs on</span><span class="v" style="font-size:15px">${r.comp ? esc(r.comp.name) : '–'}</span><span class="muted" style="font-size:12px">${r.comp ? COMPUTE[r.comp.type].short : ''}</span></div></div>
    ${sugg.length ? `<div style="display:flex;flex-direction:column;gap:8px">${sugg.join('')}</div>` : ''}
    <div class="card" data-fb="What limits it"><h2>What limits it</h2><div class="muted" style="margin-bottom:6px">How long the run would take if only this mattered. The longest one sets the finish time.</div>${r.limits.slice(0, 5).map((l, i) => `<div class="hbar"><span>${esc(l.what.charAt(0).toUpperCase() + l.what.slice(1))} <span class="muted">${esc(l.detail || '')}</span></span><span class="tr"><i style="left:0;width:${(l.t / mx * 100).toFixed(1)}%;background:${i === 0 ? 'var(--bad)' : 'var(--accent)'}"></i></span><span class="num" style="text-align:right">${fmtDur(l.t)}</span></div>`).join('')}</div>
    <div class="card"><h2>Where the time goes</h2>${r.steps.slice(0, 6).map(s => `<div class="hbar"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.label)}</span><span class="tr"><i style="left:0;width:${(s.t / Math.max(1, r.steps[0].t) * 100).toFixed(1)}%;background:var(--data)"></i></span><span class="num" style="text-align:right">${fmtDur(s.t / 1000)}</span></div>`).join('')}</div>`;
}

/* ---------- simulate actions ---------- */
function runScenario(stress) {
  const sc = curScen(); if (!sc || !M) return; const e = entryInfo(A, sc.entry); if (!e) return;
  ST.sMode = null; ST.running = stress ? 'Raising the load step by step until something gives…' : 'Simulating the busiest moment…'; renderSCenter();
  setTimeout(() => {
    const sig = scenSig(sc); let res, st = null;
    M._pc = {};
    if (scenarioMode(A, sc) === 'batch') res = evaluateBatch(M, sc);
    else { res = evaluateRate(M, sc, { N: 1500, seed: 11 }); if (stress) st = stressTest(M, sc); else if (ST.results[sc.id] && ST.results[sc.id].sig === sig) st = ST.results[sc.id].stress; }
    const ok = res.mode === 'batch' ? (!res.timeout && res.finishS <= (sc.goalMin || 30) * 60) : (res.p99 <= sc.goalMs && res.sysErr <= 0.01);
    ST.results[sc.id] = { sig, res, stress: st, ok }; ST.running = null; ST.sMode = null; clearTimeout(playT);
    renderSRail(); renderSCenter();
  }, 30);
}
ACT['s-run'] = () => runScenario(false);
ACT['s-stress'] = () => runScenario(true);
ACT['s-view'] = el => { ST.sView = el.dataset.v; renderSCenter(); };
ACT['s-sel'] = el => { ST.scen = el.dataset.id; ST.sMode = null; render(); };
ACT['s-add'] = () => { const e = A.entries.find(x => x.type === 'request') || A.entries[0]; if (!e) { toast('The Build has no entry points yet.'); return; } const id = uid('sc'); commit(b => b.scenarios.push({ id, name: 'New scenario', entry: e.key, count: 60000, durationMin: 60, burst: 'steady', rows: 100000, origins: { na: 60, eu: 40 }, odds: {}, goalMs: 300, goalMin: 30 })); ST.scen = id; render(); };
ACT['s-dup'] = () => { const sc = curScen(); const id = uid('sc'); commit(b => b.scenarios.push(Object.assign(clone(sc), { id, name: sc.name + ' copy' }))); ST.scen = id; render(); };
ACT['s-del'] = () => { const sc = curScen(); commit(b => { b.scenarios = b.scenarios.filter(x => x.id !== sc.id); }); ST.scen = null; ST.sMode = null; render(); toast(`Deleted ${sc.name}`, { label: 'Undo', fn: undo }); };
const scMut = f => { const sc = curScen(); commit(b => f(b.scenarios.find(x => x.id === sc.id)), { partial: () => { renderSRail(); renderSPanel(); renderSCenter(); } }); };
CH['s-name'] = el => scMut(s => { s.name = el.value.trim() || 'Scenario'; });
CH['s-entry'] = el => { scMut(s => { s.entry = el.value; s.odds = {}; const e = entryInfo(A, el.value); if (e && e.type === 'file') { const H = A.W[e.w].handlers[e.h]; const d = A.D[H.data]; s.rows = (d && d.rows) || s.rows || 100000; } }); ST.sMode = null; renderSCenter(); };
CH['s-num'] = el => scMut(s => { s[el.dataset.k] = Math.max(1, Number(el.value) || 1); });
ACT['s-set'] = el => scMut(s => { s[el.dataset.k] = el.dataset.v; });
IN['s-origin'] = () => { const vals = {}; Object.keys(POPS).forEach(p => vals[p] = Number(($('#o-' + p) || {}).value || 0)); const t = Object.values(vals).reduce((a, b) => a + b, 0) || 1; Object.keys(POPS).forEach(p => { const s = $('#ov-' + p); if (s) s.textContent = Math.round(vals[p] / t * 100) + '%'; }); };
CH['s-origin'] = el => scMut(s => { s.origins = Object.assign({}, s.origins || {}); s.origins[el.dataset.p] = Number(el.value); });
IN['s-odds'] = el => { const s = document.getElementById('bv-' + el.dataset.k); if (s) s.textContent = Number(el.value).toFixed(Number(el.value) < 10 ? 1 : 0) + '%'; };
CH['s-odds'] = el => scMut(s => { s.odds = Object.assign({}, s.odds || {}); s.odds[el.dataset.k] = Number(el.value) / 100; });
ACT['s-odds-reset'] = el => scMut(s => { s.odds = Object.assign({}, s.odds || {}); delete s.odds[el.dataset.k]; });
ACT['s-trace'] = el => { clearTimeout(playT); if (ST.play) ST.play.playing = false; stepOpen(+el.dataset.i); const c = $('#s-center'); if (c) c.scrollTop = 0; };
ACT['s-open-build'] = el => { ST.mode = 'build'; ST.bSel = { t: 'w', id: el.dataset.id }; history.replaceState(null, '', '#build'); render(); setTimeout(() => ACT['b-goline']({ dataset: { line: el.dataset.line } }), 40); };
ACT['s-par'] = el => { const w = ST.build.workloads.find(x => x.id === el.dataset.id); const ln = +el.dataset.line; commit(() => { const lines = w.code.split('\n'); const L = lines[ln - 1] || ''; if (!/parallel\s+\d+/.test(L)) lines[ln - 1] = L.replace(/\s*\{\s*$/, ' parallel 50 {'); w.code = lines.join('\n'); }, { partial: () => { renderSRail(); renderSPanel(); renderSCenter(); } }); toast(`Changed ${w.name} line ${ln} to run 50 rows at a time. Run again to see the effect.`, { label: 'Undo', fn: undo }); };
ACT['s-index'] = el => { const d = ST.build.data.find(x => x.id === el.dataset.id); commit(() => { const f = d.fields.find(x => x.name === el.dataset.f); if (f) f.index = true; }, { partial: () => { renderSRail(); renderSPanel(); renderSCenter(); } }); toast(`Indexed ${d.name}.${el.dataset.f} in the Build. Run again to see the effect.`, { label: 'Undo', fn: undo }); };
