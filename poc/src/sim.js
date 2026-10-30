/* ===================== Simulation engine =====================
   Approximate model. Constants are assumptions listed in the app. */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeRng(seed) { const u = mulberry32((seed || 1) * 2654435761 >>> 0); let sp = null; return { u, n() { if (sp !== null) { const s = sp; sp = null; return s; } let a; do { a = u(); } while (a < 1e-12); const b = u(); const r = Math.sqrt(-2 * Math.log(a)); sp = r * Math.sin(2 * Math.PI * b); return r * Math.cos(2 * Math.PI * b); } }; }
function logn(rng, med, p99) { if (med <= 0) return 0; const s = Math.log(Math.max(p99, med * 1.01) / med) / 2.326; return med * Math.exp(s * rng.n()); }
function lnMean(med, p99) { if (med <= 0) return 0; const s = Math.log(Math.max(p99, med * 1.01) / med) / 2.326; return med * Math.exp(s * s / 2); }
const HB = 40, HN = 640;
function Hist() { this.w = new Float64Array(HN); this.tot = 0; }
Hist.prototype.add = function (v, w) { let i = Math.floor(Math.log(v + 1) * HB); if (i < 0) i = 0; if (i >= HN) i = HN - 1; this.w[i] += w; this.tot += w; };
Hist.prototype.q = function (q) { if (!this.tot) return 0; const tg = q * this.tot; let a = 0; for (let i = 0; i < HN; i++) { a += this.w[i]; if (a >= tg) return Math.exp((i + 0.5) / HB) - 1; } return Math.exp(HN / HB) - 1; };
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

function entryInfo(A, key) { return A.entries.find(e => e.key === key) || null; }
function scenarioMode(A, sc) { const e = entryInfo(A, sc.entry); if (!e) return null; return e.type === 'file' || e.type === 'schedule' ? 'batch' : 'rate'; }
function scenarioRate(sc) { return (sc.count || 0) / Math.max(1, (sc.durationMin || 60) * 60) * (sc.burst === 'peak' ? 3 : 1); }

// Turn a path into located segments for a given start region
function planPath(M, path, r0) {
  const out = []; let cur = r0, curC = null, ext = null; const stack = [];
  for (const s of path.steps) {
    const base = { s, mult: s.mult || 1, par: s.par || 1, pg: s.pg || 0, pi: s.pi || 0 };
    if (s.k === 'enter') {
      if (s.ext) continue;
      if (!curC) curC = M.comp[s.w] || null;
      out.push(Object.assign(base, { kind: 'cpu', box: curC ? 'c:' + curC.id + '@' + cur : null, comp: curC, region: cur, cpu: 0.4, label: `Run ${s.w}.${s.h}` }));
    } else if (s.k === 'call') {
      const W = M.A.W[s.w];
      stack.push({ cur, curC, ext });
      if (W && W.node.external) {
        const er = (M.ext[s.w] && M.ext[s.w].region) || 'use1'; ext = { w: s.w, region: er };
        const nat = curC && canUseVpc(curC) ? cur : null;
        out.push(Object.assign(base, { kind: 'net', hop: rtt(cur, er) + 20 + (nat ? NET.nat.ms : 0), from: cur, to: er, nat, fromBox: curC ? 'c:' + curC.id + '@' + cur : null, toBox: 'x:' + s.w, label: `Call ${s.w}.${s.h} (outside, ${REGIONS[er].code}${nat ? ', via NAT' : ''})`, external: true }));
      } else {
        const C2 = M.comp[s.w]; if (!C2) continue;
        const r2 = C2.regions.includes(cur) ? cur : nearestRegion(C2.regions, cur);
        const inproc = C2 === curC && r2 === cur;
        out.push(Object.assign(base, { kind: 'net', hop: inproc ? 0.05 : r2 === cur ? 0.8 : rtt(cur, r2) + (M.Dp.network && M.Dp.network.link === 'transit' ? 2 : 0), from: cur, to: r2, inproc, fromBox: curC ? 'c:' + curC.id + '@' + cur : null, toBox: 'c:' + C2.id + '@' + r2, label: `Call ${s.w}.${s.h}` + (inproc ? ' (same process)' : r2 !== cur ? ` (${REGIONS[r2].code})` : '') }));
        cur = r2; curC = C2;
      }
    } else if (s.k === 'ret') { const f = stack.pop(); if (f) { cur = f.cur; curC = f.curC; ext = f.ext; } }
    else if (s.k === 'data' || s.k === 'publish') {
      const S = M.store[s.d]; if (!S) continue; const dn = M.A.D[s.d];
      const T = STORES[S.type]; const msgKind = dn && ['queue', 'stream', 'topic'].includes(dn.kind);
      const asPub = s.k === 'publish' || (msgKind && s.op === 'insert');
      const op = asPub ? 'insert' : s.op; const t = storeTarget(S, op, cur);
      // leaving the private network for a public managed service
      let via = 0, nat = null; if (curC && canUseVpc(curC) && T.net === 'public') { const NR = netRegion(M.Dp, cur); if (NR.endpoints) via = NET.endpoints.ms; else { via = NET.nat.ms; nat = cur; } }
      const hop = (t === cur ? 0.5 : rtt(cur, t)) + via;
      const boxes = { fromBox: curC ? 'c:' + curC.id + '@' + cur : null, toBox: 's:' + S.id + '@' + t, nat };
      if (asPub) { out.push(Object.assign(base, boxes, { kind: 'pub', store: S, d: s.d, region: cur, target: t, hop, label: `Publish ${s.d}` + (t !== cur ? ` to ${REGIONS[t].code}` : '') })); continue; }
      let scan = false;
      if (s.by && s.op !== 'insert' && dn && dn.fields) { const f = dn.fields.find(x => x.name === s.by); scan = !f || !(f.key || f.index); }
      const rows = scan ? (dn.rows || 1e6) : (s.rows || 1);
      const shards = shardCount(S); const pk = dn ? partitionKeyOf(S, dn) : null;
      const fan = shards > 1 && s.op === 'read' && s.by && pk && s.by !== pk ? shards : 1;
      out.push(Object.assign(base, boxes, { kind: 'data', store: S, d: s.d, op: s.op, region: cur, target: t, hop, quorum: s.op !== 'read' ? quorumRtt(S) : 0, rows, scan, fan, label: `${s.op[0].toUpperCase() + s.op.slice(1)} ${s.d}${scan ? ' (full scan)' : rows > 1 ? ` (${fmtN(rows)} rows)` : ''}${fan > 1 ? ` (asks all ${fan} shards)` : ''}` + (t !== cur ? ` in ${REGIONS[t].code}` : '') }));
    } else if (s.k === 'compute') {
      if (ext) out.push(Object.assign(base, { kind: 'ext', w: ext.w, ms: s.ms, region: ext.region, box: 'x:' + ext.w, label: `${ext.w} responds` }));
      else out.push(Object.assign(base, { kind: 'cpu', box: curC ? 'c:' + curC.id + '@' + cur : null, comp: curC, region: cur, cpu: s.ms, label: `Compute ${s.ms} ms (${s.w})` }));
    } else if (s.k === 'error') out.push(Object.assign(base, { kind: 'err', code: s.code, label: `Error ${s.code}` }));
  }
  out.forEach(g => { if (g.mult > 1 && g.kind !== 'err') g.label += g.par > 1 ? ` ×${fmtN(g.mult)}, ${g.par} at a time` : ` ×${fmtN(g.mult)}`; });
  return out;
}
function fmtN(v) { if (v >= 1e9) return (v / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'; if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (v >= 1e3) return (v / 1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k'; return String(Math.round(v)); }

function compileModel(B, A, Dp, V) { return { B, A, Dp, comp: V.comp, store: V.store, ext: Dp.externals || {} }; }
function originsFor(M, sc, e) {
  const C = M.comp[e.w];
  if (e.type === 'request') {
    const o = sc.origins || {}; const tot = Object.values(o).reduce((a, b) => a + b, 0) || 1;
    const steer = M.Dp.network && M.Dp.network.steering === 'primary';
    return Object.keys(o).filter(p => o[p] > 0 && POPS[p]).map(p => { const r = C ? (steer ? (C.regions.includes(M.Dp.regions[0]) ? M.Dp.regions[0] : C.regions[0]) : nearestForPop(C.regions, p)) : null; const NR = r ? netRegion(M.Dp, r) : null; const entry = NR && COMPUTE[C.type].net === 'vpc' ? NR.entry : (NR && NR.entry === 'apigw' ? 'apigw' : 'none'); return { pop: p, share: o[p] / tot, region: r, reach: r ? popRtt(p, r) : 0, entry, edgeMs: entry !== 'none' ? NET.entry[entry].ms : 0, limit: NR ? NR.limit : 0, box: r ? 'c:' + C.id + '@' + r : null }; });
  }
  const H = M.A.W[e.w] && M.A.W[e.w].handlers[e.h];
  if (H && H.data && M.store[H.data]) { const S = M.store[H.data]; const sr = S.regions.includes(S.primary) ? S.primary : S.regions[0]; const r = C ? nearestRegion(C.regions, sr) : sr; return [{ pop: null, share: 1, region: r, reach: r === sr ? 0.5 : rtt(r, sr), src: sr }]; }
  return [{ pop: null, share: 1, region: C ? C.regions[0] : M.Dp.regions[0], reach: 0 }];
}

/* demand of one request per second, added into acc */
function addDemand(M, plan, w, acc, depth) {
  const add = (k, f, v, meta) => { const o = acc.res[k] || (acc.res[k] = Object.assign({ cpu: 0, ops: 0, conc: 0, pub: 0, rps: 0 }, meta)); o[f] += v; };
  const link = (a, b, kind, v) => { if (!a || !b || a === b || !acc.links) return; const k = a + '|' + b + '|' + kind; acc.links[k] = (acc.links[k] || 0) + v; };
  for (const g of plan) {
    const m = g.mult * w;
    if (g.nat) { add('n:' + g.nat, 'rps', m, { type: 'nat', region: g.nat }); }
    if (g.kind === 'net' && !g.inproc) link(g.fromBox, g.toBox, 'call', m);
    if (g.kind === 'data') link(g.fromBox, g.toBox, g.op === 'read' ? 'read' : 'write', m);
    if (g.kind === 'pub') link(g.fromBox, g.toBox, 'pub', m);
    if (g.kind === 'cpu' && g.comp) { add('c:' + g.comp.id + '@' + g.region, 'cpu', g.cpu * m, { type: 'compute', ref: g.comp, region: g.region }); add('c:' + g.comp.id + '@' + g.region, 'conc', m * (g.cpu * 1.6 + 12) / 1000, {}); (acc.users[g.comp.id + '@' + g.region] || (acc.users[g.comp.id + '@' + g.region] = new Set())); }
    else if (g.kind === 'net') { if (g.from !== g.to) { const k = g.from + '>' + g.to; acc.flows[k] = (acc.flows[k] || 0) + m; } if (g.external) add('x:' + g.s.w, 'rps', m, { type: 'external', name: g.s.w, region: g.to }); }
    else if (g.kind === 'data') {
      const S = g.store; const cost = (g.op === 'read' ? (g.scan ? g.rows / 400 : 1 + g.rows / 50) : 2) * (g.fan || 1);
      add('s:' + S.id + '@' + g.target, 'ops', cost * m, { type: 'store', ref: S, region: g.target });
      if (g.op !== 'read' && S.repl !== 'single') S.regions.forEach(r => { if (r !== g.target) { add('s:' + S.id + '@' + r, 'ops', m, { type: 'store', ref: S, region: r }); const k = g.target + '>' + r; acc.repl[k] = (acc.repl[k] || 0) + m; } });
      if (g.target !== g.region) { const k = g.region + '>' + g.target; acc.flows[k] = (acc.flows[k] || 0) + m; }
      (acc.conn[S.id] || (acc.conn[S.id] = new Set())).add(planComp(plan, g));
    } else if (g.kind === 'pub') {
      add('s:' + g.store.id + '@' + g.target, 'pub', m, { type: 'store', ref: g.store, region: g.target });
      acc.pubs[g.d] = (acc.pubs[g.d] || 0) + m;
      if (depth < 3) M.A.triggers.filter(t => t.d === g.d && t.type === 'message').forEach(t => {
        const key = t.w + '.' + t.h; const C = M.comp[t.w]; if (!C) return;
        const r0 = nearestRegion(C.regions, g.target); const paths = cachedPaths(M, key); link('s:' + g.store.id + '@' + g.target, 'c:' + C.id + '@' + r0, 'deliver', m);
        paths.forEach(p => { const pl = planPath(M, p, r0); addDemand(M, pl, m * p.p, acc, depth + 1); });
        acc.consumers[g.d] = acc.consumers[g.d] || { key, comp: C, region: r0, lat: paths.reduce((s, p) => s + p.p * planLatency(planPath(M, p, r0)), 0) };
      });
    }
  }
}
function planComp(plan, g) { let c = null; for (const x of plan) { if (x === g) break; if (x.kind === 'cpu' && x.comp) c = x.comp.id + '@' + x.region; } return c; }
function planLatency(plan) { let t = 0; plan.forEach(g => { if (g.kind === 'net') t += g.hop; else if (g.kind === 'cpu') t += g.cpu; else if (g.kind === 'data') t += g.hop + 3; else if (g.kind === 'pub') t += g.hop + 5; else if (g.kind === 'ext') t += g.ms; }); return t; }
function cachedPaths(M, key, odds) { M._pc = M._pc || {}; const k = key + JSON.stringify(odds || {}); if (!M._pc[k]) M._pc[k] = enumeratePaths(M.A, key, odds || {}); return M._pc[k]; }

/* resource states from demand */
function resourceStates(M, acc) {
  const R = {};
  Object.entries(acc.res).forEach(([k, o]) => {
    if (o.type === 'compute') {
      const C = o.ref, T = COMPUTE[C.type];
      if (C.type === 'fn') { const lim = C.concurrency || 1000; R[k] = Object.assign({}, o, { rho: o.conc / lim, inst: Math.ceil(o.conc), cap: lim, label: `${C.name} (${REGIONS[o.region].code})`, what: 'concurrency' }); }
      else {
        const cores = T.sizes[C.size] || 2; const need = Math.ceil(o.cpu / (cores * 1000 * 0.6));
        const inst = clampN(need, C.min || 0, C.max || 1); const rho = inst ? o.cpu / (inst * cores * 1000) : (o.cpu > 0 ? 9 : 0);
        R[k] = Object.assign({}, o, { rho, inst, need, cores, cap: (C.max || 1) * cores * 1000, label: `${C.name} (${REGIONS[o.region].code})`, what: 'CPU' });
      }
    } else if (o.type === 'store') {
      const S = o.ref, T = STORES[S.type]; let rho = 0, what = 'capacity';
      if (T.cap) rho = o.ops / ((T.cap[S.size] || 20000) * shardCount(S));
      if (T.partitions) { const pr = o.pub / ((S.partitions || 12) * 1000); if (pr > rho) { rho = pr; what = 'partition throughput'; } }
      R[k] = Object.assign({}, o, { rho, label: `${S.name} (${REGIONS[o.region].code})${shardCount(S) > 1 ? ` · ${shardCount(S)} shards` : ''}`, what });
    } else if (o.type === 'nat') R[k] = Object.assign({}, o, { rho: o.rps / NET.nat.cap, cap: NET.nat.cap, label: `NAT gateway (${REGIONS[o.region].code})`, what: 'connections' });
    else if (o.type === 'gateway') R[k] = Object.assign({}, o, { rho: o.rps / Math.max(1, o.limit), cap: o.limit, label: `API gateway (${REGIONS[o.region].code})`, what: 'request limit' });
    else if (o.type === 'external') R[k] = Object.assign({}, o, { rho: 0, label: `${o.name} (outside)` });
  });
  // connections
  Object.entries(acc.conn).forEach(([sid, users]) => {
    const S = M.Dp.stores.find(s => s.id === sid); const T = STORES[S.type]; if (!T.conn) return;
    const lim = (T.conn[S.size] || 500) * shardCount(S); let want = 0;
    users.forEach(u => { if (!u) return; const st = R['c:' + u]; if (!st) return; const C = st.ref; want += C.type === 'fn' ? st.inst : st.inst * (COMPUTE[C.type].pool || 10); });
    R['conn:' + sid] = { type: 'conn', ref: S, rho: want / lim, want, cap: lim, label: `${S.name} connections`, what: 'connections', region: S.primary };
  });
  return R;
}

/* ---------- rate scenarios ---------- */
function evaluateRate(M, sc, opt) {
  opt = opt || {};
  const e = entryInfo(M.A, sc.entry); const N = opt.N || 1500; const rng = makeRng(opt.seed || 11);
  const lam = opt.lambda != null ? opt.lambda : scenarioRate(sc);
  const paths = cachedPaths(M, sc.entry, sc.odds);
  const origins = originsFor(M, sc, e);
  const acc = { res: {}, flows: {}, repl: {}, pubs: {}, consumers: {}, conn: {}, users: {}, links: {} };
  const plans = origins.map(o => paths.map(p => o.region ? planPath(M, p, o.region) : []));
  origins.forEach((o, oi) => paths.forEach((p, pi) => { if (o.region) addDemand(M, plans[oi][pi], lam * o.share * p.p, acc, 0); }));
  origins.forEach(o => { if (!o.region) return; const k = 'g:' + o.region; if (o.entry === 'apigw') { const r = acc.res[k] || (acc.res[k] = { type: 'gateway', region: o.region, rps: 0, limit: o.limit || 10000, cpu: 0, ops: 0, conc: 0, pub: 0 }); r.rps += lam * o.share; } const ub = o.pop ? 'u:' + o.pop : null; const eb = o.entry !== 'none' ? 'e:' + o.region : null; if (ub) { if (eb) { acc.links[ub + '|' + eb + '|call'] = (acc.links[ub + '|' + eb + '|call'] || 0) + lam * o.share; acc.links[eb + '|' + o.box + '|call'] = (acc.links[eb + '|' + o.box + '|call'] || 0) + lam * o.share; } else acc.links[ub + '|' + o.box + '|call'] = (acc.links[ub + '|' + o.box + '|call'] || 0) + lam * o.share; } });
  const R = resourceStates(M, acc);
  if (opt.adjust) opt.adjust(R);
  // tracers
  const all = new Hist(), byPath = paths.map(() => new Hist()), byPop = origins.map(() => new Hist()), pathW = paths.map(() => 0), pathErr = paths.map(() => 0);
  let sysErr = 0, bizErr = 0, tot = 0, slow = null; const why = {};
  const cum = []; let c = 0; origins.forEach((o, oi) => paths.forEach((p, pi) => { c += o.share * p.p; cum.push([c, oi, pi]); }));
  for (let i = 0; i < N; i++) {
    const u = rng.u() * c; const pick = cum.find(x => x[0] >= u) || cum[cum.length - 1]; const oi = pick[1], pi = pick[2];
    const o = origins[oi]; if (!o.region) { sysErr++; tot++; continue; }
    const r = runTracer(M, plans[oi][pi], R, rng, o, opt.spans || i < 4 || true);
    tot++; pathW[pi]++;
    if (r.sys) { sysErr++; pathErr[pi]++; why[r.sys] = (why[r.sys] || 0) + 1; }
    else if (r.biz) bizErr++;
    all.add(r.t, 1); byPath[pi].add(r.t, 1); byPop[oi].add(r.t, 1);
    if (!r.sys && (!slow || r.t > slow.t)) slow = { t: r.t, spans: r.spans, origin: o, path: paths[pi] };
  }
  const lags = {};
  Object.entries(acc.consumers).forEach(([d, cinfo]) => {
    const S = M.store[d]; const parts = S && STORES[S.type].partitions ? (S.partitions || 12) : null;
    const st = R['c:' + cinfo.comp.id + '@' + cinfo.region];
    let capRate = parts ? parts * 1000 / Math.max(1, cinfo.lat) : (cinfo.comp.type === 'fn' ? (cinfo.comp.concurrency || 1000) * 1000 / Math.max(1, cinfo.lat) : Infinity);
    if (st && st.rho > 1) capRate = Math.min(capRate, acc.pubs[d] / st.rho);
    const pubRate = acc.pubs[d]; const dur = (sc.durationMin || 60) * 60;
    lags[d] = { pubRate, capRate, lagS: pubRate > capRate ? (pubRate - capRate) * dur / capRate : 0, consumer: cinfo.key, parts };
  });
  // cost per hour
  let cost = 0; const costBy = {};
  const cAdd = (k, v) => { cost += v; costBy[k] = (costBy[k] || 0) + v; };
  Object.values(R).forEach(s => {
    if (s.type === 'compute') { const C = s.ref; if (C.type === 'fn') cAdd('Compute', lam ? s.conc * 3600 * 0.0000166667 * (C.memory || 1024) / 1024 + s.cpu / 1 * 0 : 0); else cAdd('Compute', s.inst * s.cores * COMPUTE[C.type].usd); }
    if (s.type === 'store') { const S = s.ref, T = STORES[S.type]; if (T.usd) cAdd('Databases and storage', (T.usd[S.size] || 1) * (s.region === S.primary || S.repl === 'single' ? 1 : 0.6)); if (T.perM) cAdd('Databases and storage', (s.ops + s.pub) * 3600 / 1e6 * T.perM[1]); }
  });
  Object.values(R).forEach(s => { if (s.type === 'nat') cAdd('Network', NET.nat.usd + s.rps * 3600 * 4 / 1e6 * 0.045); if (s.type === 'gateway') cAdd('Network', s.rps * 3600 / 1e6 * 1.0); });
  Object.values(acc.flows).forEach(v => cAdd('Traffic between regions', v * 3600 * 4 / 1e6 * 0.02));
  Object.values(acc.repl).forEach(v => cAdd('Traffic between regions', v * 3600 * 2 / 1e6 * 0.02));
  const ranked = Object.entries(R).filter(([k, s]) => s.type !== 'external').sort((a, b) => b[1].rho - a[1].rho);
  return {
    mode: 'rate', lambda: lam, entry: e, paths, origins, R, ranked, links: acc.links, flows: acc.flows, repl: acc.repl, lags,
    p50: all.q(0.5), p95: all.q(0.95), p99: all.q(0.99), sysErr: tot ? sysErr / tot : 0, bizErr: tot ? bizErr / tot : 0, why,
    pathStats: paths.map((p, i) => ({ path: p, share: pathW[i] / (tot || 1), p50: byPath[i].q(0.5), p99: byPath[i].q(0.99), err: pathW[i] ? pathErr[i] / pathW[i] : 0 })),
    popStats: origins.map((o, i) => ({ o, p50: byPop[i].q(0.5), p99: byPop[i].q(0.99) })), slow, cost, costBy
  };
}
function runTracer(M, plan, R, rng, o, keepSpans) {
  let t = 0, sys = null, biz = false; const spans = [];
  const groups = {}; let curG = 0;
  const flushG = () => { if (!curG) return; const g = groups[curG]; const mx = Math.max(...Object.values(g)); spans.push(['in parallel', t, mx, 'par']); t += mx; curG = 0; };
  if (o.reach) { spans.push([o.pop ? `${POPS[o.pop].label} → ${REGIONS[o.region].code}` : `Start in ${REGIONS[o.region].code}`, 0, o.reach, 'net', { kind: 'net', toBox: o.entry && o.entry !== 'none' ? 'e:' + o.region : o.box, fromBox: o.pop ? 'u:' + o.pop : null }]); t += o.reach; }
  if (o.edgeMs) { const gw = R['g:' + o.region]; let l = o.edgeMs; if (gw && gw.rho > 1 && rng.u() < 1 - 1 / gw.rho) sys = `API gateway in ${REGIONS[o.region].code} rejected it (over its limit)`; spans.push([`${NET.entry[o.entry].label} (${REGIONS[o.region].code})`, t, l, 'net', { kind: 'edge', box: 'e:' + o.region, fromBox: 'e:' + o.region, toBox: o.box }]); t += l; if (sys) return { t, sys, biz, spans }; }
  for (const g of plan) {
    if (g.pg !== curG) { flushG(); if (g.pg) curG = g.pg; }
    let lat = 0; const m = g.mult / g.par; const big = g.mult > 40;
    if (g.kind === 'net') lat = g.hop < 0.2 ? g.hop : (big ? g.hop * 1.03 : logn(rng, g.hop, g.hop * 1.15 + 0.6));
    else if (g.kind === 'cpu') {
      const st = g.comp && R['c:' + g.comp.id + '@' + g.region];
      if (!st) { lat = g.cpu; }
      else {
        const rho = Math.min(st.rho, 0.97); const cc = Math.max(1, (st.inst || 1) * (st.cores || 1));
        const wait = g.cpu * Math.pow(rho, Math.sqrt(2 * (cc + 1)) - 1) / (cc * (1 - rho));
        lat = big ? lnMean(g.cpu + wait * 0.7, g.cpu * 2.5 + wait * 4.6) : logn(rng, g.cpu + wait * 0.7, g.cpu * 2.5 + wait * 4.6);
        if (st.rho > 0.97 && rng.u() < 1 - 0.97 / st.rho) sys = sys || `${g.comp.name} is overloaded`;
        if (g.comp.type === 'fn' && g.s.k === 'enter' && rng.u() < (st.rho > 0.85 ? 0.05 : 0.006)) lat += logn(rng, 250, 900);
        if (g.comp.type === 'ctr' && g.s.k === 'enter' && (g.comp.min || 0) === 0 && rng.u() < (st.inst <= 1 ? 0.15 : 0.01)) lat += logn(rng, 1500, 4000);
      }
    } else if (g.kind === 'data') {
      const T = STORES[g.store.type]; const st = R['s:' + g.store.id + '@' + g.target]; const rho = st ? Math.min(st.rho, 0.97) : 0;
      const um = (1 + rho * rho * rho / (1 - rho) * 0.5) * (g.fan > 1 ? 1 + 0.35 * Math.log2(g.fan) : 1); const prof = (g.op === 'read' ? T.read : T.write) || T.pub;
      const base = big ? lnMean(prof[0] * um, prof[1] * um) : logn(rng, prof[0] * um, prof[1] * um);
      lat = g.hop + g.quorum + base + (g.rows > 1 ? g.rows * 0.01 : 0) + (g.scan ? g.rows / 40000 : 0);
      const cn = R['conn:' + g.store.id]; if (cn && cn.rho > 1 && rng.u() < 1 - 1 / cn.rho) { lat += logn(rng, 30, 400); if (lat > 3000) sys = sys || `${g.store.name} ran out of connections`; }
      if (st && st.rho > 0.97 && rng.u() < 1 - 0.97 / st.rho) sys = sys || `${g.store.name} is overloaded`;
    } else if (g.kind === 'pub') { const T = STORES[g.store.type]; const pp = T.pub || T.write; const st = R['s:' + g.store.id + '@' + g.target]; lat = g.hop + logn(rng, pp[0], pp[1]); if (st && st.rho > 1 && rng.u() < 1 - 1 / st.rho) sys = sys || `${g.store.name} can’t take more events`; }
    else if (g.kind === 'ext') lat = big ? lnMean(g.ms, g.ms * 2.5) : logn(rng, g.ms, g.ms * 2.5);
    else if (g.kind === 'err') { biz = true; }
    if (g.nat) { const nt = R['n:' + g.nat]; if (nt && nt.rho > 1 && rng.u() < 1 - 1 / nt.rho) sys = sys || `NAT gateway in ${REGIONS[g.nat].code} ran out of connections`; }
    lat *= m;
    if (curG) { const gg = groups[curG] || (groups[curG] = {}); gg[g.pi] = (gg[g.pi] || 0) + lat; }
    else { if (keepSpans && g.kind !== 'err') spans.push([g.label, t, lat, g.kind, g]); t += lat; }
    if (sys || biz) break;
  }
  flushG();
  if (t > 30000 && !sys) sys = 'Timed out after 30 s';
  return { t, sys, biz, spans };
}

/* ---------- stress test ---------- */
function capacityLambda(M, sc) {
  const unit = evaluateRate(M, sc, { lambda: 1, N: 60 });
  let lamCap = Infinity, first = null;
  Object.values(unit.R).forEach(s => {
    let capLam = Infinity;
    if (s.type === 'compute') { const C = s.ref; if (C.type === 'fn') capLam = (C.concurrency || 1000) / Math.max(1e-9, s.conc); else capLam = ((C.max || 1) * s.cores * 1000 * 0.97) / Math.max(1e-9, s.cpu); }
    else if (s.type === 'nat') capLam = NET.nat.cap * 0.97 / Math.max(1e-9, s.rps);
    else if (s.type === 'gateway') capLam = s.limit / Math.max(1e-9, s.rps);
    else if (s.type === 'store') { const T = STORES[s.ref.type]; if (T.cap) capLam = (T.cap[s.ref.size] || 20000) * shardCount(s.ref) * 0.97 / Math.max(1e-9, s.ops); if (T.partitions && s.pub) capLam = Math.min(capLam, (s.ref.partitions || 12) * 1000 / s.pub); }
    if (capLam < lamCap) { lamCap = capLam; first = s; }
  });
  if (!isFinite(lamCap)) lamCap = 1e6;
  return { lamCap, first };
}
function stressTest(M, sc) {
  const { lamCap, first } = capacityLambda(M, sc);
  const pts = [0.05, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0, 1.1, 1.25].map(f => { const r = evaluateRate(M, sc, { lambda: lamCap * f, N: 500, seed: 5 }); return { lam: lamCap * f, p50: r.p50, p99: r.p99, err: r.sysErr, top: r.ranked[0] ? r.ranked[0][1] : null, R: r.R }; });
  let slo = 0; pts.forEach(p => { if (p.p99 <= (sc.goalMs || Infinity) && p.err <= 0.01) slo = Math.max(slo, p.lam); });
  const order = Object.values(pts[pts.length - 1].R).filter(s => s.type !== 'external').sort((a, b) => b.rho - a.rho).slice(0, 4);
  return { lamCap, first, pts, slo, order };
}

/* ---------- batch scenarios (file drops, scheduled jobs) ---------- */
function evaluateBatch(M, sc) {
  const e = entryInfo(M.A, sc.entry); const rows = e.type === 'file' ? (sc.rows || 1) : 1;
  const paths = enumeratePaths(M.A, sc.entry, sc.odds || {}, { fileRows: rows });
  const p = paths[0]; const o = originsFor(M, sc, e)[0];
  const plan = planPath(M, p, o.region);
  const acc = { res: {}, flows: {}, repl: {}, pubs: {}, consumers: {}, conn: {}, users: {} };
  addDemand(M, plan, 1, acc, 0); // totals for one run
  // time if limited only by latency (each step's mean latency at idle)
  let tLat = 0; const stepT = [];
  plan.forEach(g => {
    let l = 0;
    if (g.kind === 'net') l = g.hop; else if (g.kind === 'cpu') l = g.cpu; else if (g.kind === 'ext') l = lnMean(g.ms, g.ms * 2.5);
    else if (g.kind === 'data') { const T = STORES[g.store.type]; const pr = (g.op === 'read' ? T.read : T.write) || T.pub; l = g.hop + g.quorum + lnMean(pr[0], pr[1]) + (g.rows > 1 ? g.rows * 0.01 : 0) + (g.scan ? g.rows / 40000 : 0); }
    else if (g.kind === 'pub') { const T = STORES[g.store.type]; const pp = T.pub || T.write; l = g.hop + lnMean(pp[0], pp[1]); }
    const tt = l * g.mult / g.par; tLat += tt; stepT.push({ label: g.label, t: tt, g });
  });
  // time if limited by capacity
  const limits = [{ what: 'one step at a time', detail: `Each row waits for the previous one${plan.some(g => g.par > 1) ? '' : ' (no parallelism in the code)'}`, t: tLat / 1000 }];
  Object.values(acc.res).forEach(s => {
    if (s.type === 'compute') { const C = s.ref; const par = Math.max(...plan.map(g => g.par)); const cores = C.type === 'fn' ? 1 : (COMPUTE[C.type].sizes[C.size] || 2); const usable = Math.min(par, C.type === 'fn' ? 1000 : cores * (C.max || 1)); limits.push({ what: `${C.name} CPU`, detail: `${fmtN(s.cpu / 1000)} CPU-seconds of work`, t: s.cpu / 1000 / Math.max(1, usable) }); }
    if (s.type === 'store') { const T = STORES[s.ref.type]; if (T.cap) limits.push({ what: `${s.ref.name} capacity (${REGIONS[s.region].code})`, detail: `${fmtN(s.ops)} operations${shardCount(s.ref) > 1 ? ` over ${shardCount(s.ref)} shards` : ''}`, t: s.ops / ((T.cap[s.ref.size] || 20000) * shardCount(s.ref) * 0.9) }); }
  });
  limits.sort((a, b) => b.t - a.t);
  const T = limits[0].t; const C = M.comp[e.w];
  const timeout = C && C.type === 'fn' && T > COMPUTE.fn.maxDurMs / 1000;
  const done = timeout ? Math.floor(rows * (COMPUTE.fn.maxDurMs / 1000) / T) : rows;
  stepT.sort((a, b) => b.t - a.t);
  return { mode: 'batch', entry: e, rows, path: p, plan, finishS: T, limits, timeout, done, steps: stepT, origin: o, rate: rows / Math.max(0.001, T), comp: C };
}

/* ---------- single path trace (medians) ---------- */
function tracePath(M, sc, path, origin, R) {
  const plan = planPath(M, path, origin.region);
  const rng = { u: () => 0.999, n: () => 0 }; // medians, no failures
  return runTracer(M, plan, R || {}, rng, origin, true);
}

/* ---------- playback: the scenario over time ---------- */
function shapeAt(sc, f) {
  if (sc.burst === 'peak') return 0.6 + 2.4 * Math.exp(-Math.pow((f - 0.55) / 0.12, 2));
  if (sc.burst === 'ramp') return 0.15 + 2.6 * f;
  return 1 + 0.06 * Math.sin(f * 19) + 0.04 * Math.sin(f * 47);
}
const SCALE_RATE = { k8s: 0.6, vm: 0.15, ctr: 2.5 }; // fraction of current size added per minute
function simulateTimeline(M, sc, opt) {
  opt = opt || {}; const F = opt.frames || 40; const durS = (sc.durationMin || 60) * 60; const dt = durS / F;
  let base = (sc.count || 0) / durS; const inst = {};
  if (sc.burst === 'ramp') { const cap = capacityLambda(M, sc).lamCap; base = Math.max(base, cap * 1.35 / 2.75); } const backlog = {}; const frames = []; const events = [];
  const prevRho = {}; let prevErr = 0;
  for (let i = 0; i < F; i++) {
    const f = (i + 0.5) / F; const lam = base * shapeAt(sc, f);
    const r = evaluateRate(M, sc, { lambda: lam, N: opt.N || 220, seed: 100 + i, adjust: R => {
      Object.entries(R).forEach(([k, st]) => {
        if (st.type !== 'compute' || st.ref.type === 'fn') return;
        const C = st.ref; const prev = inst[k] != null ? inst[k] : Math.max(C.min || 0, i === 0 ? st.inst : 0);
        const grow = Math.max(1, Math.ceil(prev * SCALE_RATE[C.type] * dt / 60));
        const want = st.inst; const now = want > prev ? Math.min(want, prev + grow) : Math.max(want, prev - Math.ceil(prev * 0.3));
        if (now !== prev && i > 0) events.push({ i, t: f * durS, kind: now > prev ? 'scale' : 'scalein', k, msg: `${C.name} (${REGIONS[st.region].code}) ${now > prev ? 'scaled out' : 'scaled in'}: ${prev} → ${now} ${C.type === 'k8s' ? 'pods' : 'instances'}` });
        inst[k] = now; st.inst = now; st.lag = want > now ? want - now : 0;
        st.rho = now ? st.cpu / (now * st.cores * 1000) : (st.cpu > 0 ? 9 : 0);
      });
    } });
    Object.entries(r.lags).forEach(([d, L]) => { const b = Math.max(0, (backlog[d] || 0) + (L.pubRate - L.capRate) * dt); if (b > 1000 && !(backlog[d] > 1000)) events.push({ i, t: f * durS, kind: 'backlog', msg: `${d} is backing up: consumers handle ${fmtN(L.capRate)}/s, ${fmtN(L.pubRate)}/s arriving` }); if (b === 0 && backlog[d] > 1000) events.push({ i, t: f * durS, kind: 'ok', msg: `${d} backlog cleared` }); backlog[d] = b; });
    const res = {}; Object.entries(r.R).forEach(([k, st]) => { if (st.type === 'external') return; res[k] = { rho: st.rho, inst: st.inst, lag: st.lag || 0, label: st.label, type: st.type, what: st.what };
      const pr = prevRho[k] || 0;
      if (st.rho >= 1 && pr < 1) events.push({ i, t: f * durS, kind: 'bad', k, msg: `${st.label} is over capacity (${Math.round(st.rho * 100)}% ${st.what || ''})` });
      else if (st.rho >= 0.8 && pr < 0.8) events.push({ i, t: f * durS, kind: 'warn', k, msg: `${st.label} passed 80% ${st.what || 'busy'}` });
      else if (st.rho < 0.7 && pr >= 0.8) events.push({ i, t: f * durS, kind: 'ok', k, msg: `${st.label} back under 70%` });
      prevRho[k] = st.rho; });
    if (r.sysErr > 0.01 && prevErr <= 0.01) events.push({ i, t: f * durS, kind: 'bad', msg: `Requests start failing (${Math.round(r.sysErr * 100)}%): ${Object.keys(r.why).sort((a, b) => r.why[b] - r.why[a])[0] || 'overload'}` });
    if (r.sysErr <= 0.01 && prevErr > 0.01) events.push({ i, t: f * durS, kind: 'ok', msg: 'Errors back under 1%' });
    prevErr = r.sysErr;
    frames.push({ i, t: f * durS, flows: r.flows, mode: 'rate', lam, p50: r.p50, p99: r.p99, err: r.sysErr, res, links: r.links, backlog: Object.assign({}, backlog), top: r.ranked[0] ? r.ranked[0][0] : null, cost: r.cost, R: r.R, origins: r.origins });
  }
  return { frames, events, durS, dt };
}

/* ---------- one request, step by step, at a given load ---------- */
function stepRequest(M, sc, path, origin, R) {
  const plan = planPath(M, path, origin.region); const steps = []; let t = 0;
  const push = (o) => { steps.push(Object.assign({ start: t }, o)); t += o.dur; };
  if (origin.reach) push({ label: origin.pop ? `Travel from ${POPS[origin.pop].label} to ${REGIONS[origin.region].code}` : `Start in ${REGIONS[origin.region].code}`, dur: origin.reach, kind: 'net', fromBox: origin.pop ? 'u:' + origin.pop : null, toBox: origin.entry && origin.entry !== 'none' ? 'e:' + origin.region : origin.box, why: origin.pop ? 'Distance from the users to the nearest region running this entry point.' : '' });
  if (origin.edgeMs) { const gw = R['g:' + origin.region]; push({ label: `${NET.entry[origin.entry].label} (${REGIONS[origin.region].code})`, dur: origin.edgeMs, kind: 'edge', box: 'e:' + origin.region, toBox: origin.box, fromBox: 'e:' + origin.region, rho: gw ? gw.rho : null, why: NET.entry[origin.entry].note }); }
  let grp = 0, gs = 0, gmax = 0; const lanes = {};
  for (const g of plan) {
    if (g.pg !== grp) { if (grp) { t = gs + gmax; } grp = g.pg; gs = t; gmax = 0; Object.keys(lanes).forEach(k => delete lanes[k]); }
    let dur = 0, wait = 0, why = '', rho = null, box = g.box || g.toBox || null;
    const m = g.mult / g.par;
    if (g.kind === 'net') { dur = g.hop; why = g.inproc ? 'Same process: no network hop.' : g.external ? `Outside service ${REGIONS[g.to].code}; includes TLS and the provider’s front door${g.nat ? ', through the NAT gateway' : ''}.` : g.from !== g.to ? `Crosses regions ${REGIONS[g.from].code} → ${REGIONS[g.to].code}.` : 'Network hop inside the region.'; }
    else if (g.kind === 'cpu') { const st = g.comp && R['c:' + g.comp.id + '@' + g.region]; dur = g.cpu; if (st) { rho = st.rho; const r2 = Math.min(st.rho, 0.97); const cc = Math.max(1, (st.inst || 1) * (st.cores || 1)); wait = g.cpu * Math.pow(r2, Math.sqrt(2 * (cc + 1)) - 1) / (cc * (1 - r2)) * 0.7; } why = wait > 0.5 ? `Waited ${wait.toFixed(1)} ms for a free CPU: ${g.comp.name} is ${Math.round(rho * 100)}% busy.` : 'Work on the CPU.'; }
    else if (g.kind === 'data') { const T = STORES[g.store.type]; const st = R['s:' + g.store.id + '@' + g.target]; rho = st ? st.rho : null; const r2 = Math.min(rho || 0, 0.97); const um = (1 + r2 * r2 * r2 / (1 - r2) * 0.5) * (g.fan > 1 ? 1 + 0.35 * Math.log2(g.fan) : 1); const prof = (g.op === 'read' ? T.read : T.write) || T.pub; const svc = prof[0]; wait = svc * (um - 1); dur = g.hop + g.quorum + svc + (g.rows > 1 ? g.rows * 0.01 : 0) + (g.scan ? g.rows / 40000 : 0);
      why = [g.target !== g.region ? `${REGIONS[g.target].code} is ${Math.round(g.hop)} ms away.` : '', g.quorum ? `Waits ${g.quorum} ms for a majority of regions to agree.` : '', g.scan ? 'No index on this field, so it reads every row.' : '', g.fan > 1 ? `Asks all ${g.fan} shards and merges the answers.` : '', wait > 0.5 ? `Queued ${wait.toFixed(1)} ms: ${g.store.name} is ${Math.round(rho * 100)}% busy.` : ''].filter(Boolean).join(' ') || `${T.label} ${g.op}.`; }
    else if (g.kind === 'pub') { const T = STORES[g.store.type]; const pp = T.pub || T.write; dur = g.hop + pp[0]; why = `Hands the message to ${g.store.name}. Consumers pick it up later.`; }
    else if (g.kind === 'ext') { dur = g.ms; why = 'Response time you set in Build.'; }
    else if (g.kind === 'err') { push({ label: g.label, dur: 0, kind: 'err', why: 'The request ends with this error.' }); break; }
    const total = (dur + wait) * m;
    const o = { label: g.label, dur: total, wait: wait * m, kind: g.kind, box, fromBox: g.fromBox, toBox: g.toBox, rho, why, mult: g.mult, par: g.par, g };
    if (grp) { const st0 = gs + (lanes[g.pi] || 0); steps.push(Object.assign({ start: st0, lane: g.pi }, o)); lanes[g.pi] = (lanes[g.pi] || 0) + total; gmax = Math.max(gmax, lanes[g.pi]); }
    else push(o);
  }
  if (grp) t = gs + gmax;
  return { steps, total: t };
}
if (typeof module !== 'undefined') module.exports = { simulateTimeline, stepRequest, shapeAt, evaluateRate, evaluateBatch, stressTest, tracePath, compileModel, scenarioMode, scenarioRate, entryInfo, planPath, fmtN };
