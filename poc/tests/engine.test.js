// Engine tests: language, interpreter, validation, simulation. No dependencies.
// Run: node poc/tests/engine.test.js
// Note: values come from a separate vm context, so compare arrays/objects via JSON, not deepStrictEqual.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = path.join(__dirname, '..', 'src');
const ctx = { console, Math, JSON, Date, Set, Map, Array, Object, Number, String, Float64Array, Infinity, isFinite };
vm.createContext(ctx);
for (const f of ['lang.js', 'run.js', 'infra.js', 'sim.js', 'starter.js']) {
  const code = fs.readFileSync(path.join(src, f), 'utf8').split('\n').filter(l => !l.startsWith("if (typeof module !== 'undefined')")).join('\n');
  vm.runInContext(code, ctx, { filename: f });
}
const E = (expr) => vm.runInContext(expr, ctx);
let n = 0; const test = (name, fn) => { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e.message); process.exitCode = 1; } };

E(`var B = exampleBuild(); var A = analyzeBuild(B); var deps = exampleDeploys();`);

test('example Build is valid', () => assert.strictEqual(E('A.valid'), true));
test('unindexed lookup is a warning, not an error', () => assert.ok(E(`A.problems.some(p => p.sev === 'warn' && /status/.test(p.msg))`)));
test('entry points found', () => { const keys = E('A.entries.map(e => e.key)'); for (const k of ['Storefront.Checkout', 'Storefront.ViewOrder', 'Fulfillment.message OrderEvents', 'ProductImport.file ProductFeeds']) assert.ok(keys.includes(k), k); });
test('checkout has 3 paths summing to 1', () => { const ps = E(`enumeratePaths(A, 'Storefront.Checkout', {})`); assert.strictEqual(ps.length, 3); assert.ok(Math.abs(ps.reduce((s, p) => s + p.p, 0) - 1) < 1e-9); });
test('syntax error is reported with a line', () => { const r = E(`analyzeBuild(Object.assign(exampleBuild(), { workloads: [{ id: 'x', name: 'X', code: 'when A {\\n  cal Nope.B\\n}' }] }))`); assert.strictEqual(r.valid, false); assert.ok(r.problems.some(p => p.line === 2)); });
test('publishing to a table is only a warning (outbox)', () => { const r = E(`(() => { const b = exampleBuild(); b.workloads[0].code += '\\nwhen Extra {\\n  publish Checkouts\\n}'; return analyzeBuild(b); })()`); assert.strictEqual(r.valid, true); });

test('step-through: checkout runs on linked mock data', () => {
  const out = E(`(() => { const db = mockDB(B, 3); const g = runEntry(A, B, db, 'Storefront.Checkout', {}); const ev = []; let x = g.next(); let guard = 0; while (!x.done && guard++ < 500) { const e = x.value; ev.push(e); x = g.next(e.t === 'ask' ? false : undefined); } return { ev, db }; })()`);
  const ins = out.ev.find(e => e.t === 'data' && e.d === 'Checkouts' && e.op === 'insert');
  assert.ok(ins, 'inserts a checkout');
  const cust = out.ev.find(e => e.t === 'data' && e.d === 'Customers');
  assert.strictEqual(ins.rows[0].customer_id, cust.rows[0].customer_id, 'checkout links to the customer that was read');
  assert.ok(out.ev.some(e => e.t === 'iter'), 'loop iterations emitted');
  assert.ok(out.ev.some(e => e.t === 'publish' && e.consumers.includes('Fulfillment.message OrderEvents')));
  assert.strictEqual(out.ev[out.ev.length - 1].outcome, 'ok');
});
test('step-through: answering yes to CartIsEmpty ends with error', () => {
  const last = E(`(() => { const db = mockDB(B, 3); const g = runEntry(A, B, db, 'Storefront.Checkout', {}); let x = g.next(), last; let guard = 0; while (!x.done && guard++ < 500) { last = x.value; x = g.next(last.t === 'ask' ? true : undefined); } return last; })()`);
  assert.strictEqual(last.outcome, 'error');
});

test('both example Deploys work', () => { for (let i = 0; i < 2; i++) assert.strictEqual(E(`(() => { const d = deps[${i}]; normalizeDeploy(d); return validateDeploy(B, A, d).valid; })()`), true, 'deploy ' + i); });
test('removing the load balancer blocks private entry, and the fix restores it', () => {
  const r = E(`(() => { const d = JSON.parse(JSON.stringify(deps[0])); normalizeDeploy(d); d.network.regions.use1.entry = 'none'; const v = validateDeploy(B, A, d); const p = v.problems.find(x => x.sev === 'error' && x.fix); p.fix.apply(d); return [v.valid, validateDeploy(B, A, d).valid]; })()`);
  assert.strictEqual(JSON.stringify(r), '[false,true]');
});
test('a table in Kafka is refused; key-value in PostgreSQL only warns', () => {
  assert.strictEqual(E(`storeFit('kafka', 'table').fit`), 'no');
  assert.strictEqual(E(`storeFit('postgres', 'kv').fit`), 'works');
});
test('sharding by id warns about reads by another field', () => {
  const ok = E(`(() => { const d = JSON.parse(JSON.stringify(deps[0])); normalizeDeploy(d); d.stores[0].shards = 4; return validateDeploy(B, A, d).problems.some(p => /asks all 4 shards/.test(p.msg)); })()`);
  assert.ok(ok);
});

test('busiest moment: monolith meets the 800 ms goal deterministically', () => {
  const r = E(`(() => { const d = deps[0]; normalizeDeploy(d); const V = validateDeploy(B, A, d); const M = compileModel(B, A, d, V); const r1 = evaluateRate(M, B.scenarios[0], { N: 1500, seed: 11 }); const r2 = evaluateRate(M, B.scenarios[0], { N: 1500, seed: 11 }); return { p99: r1.p99, same: r1.p99 === r2.p99, err: r1.sysErr }; })()`);
  assert.ok(r.same, 'same seed, same result'); assert.ok(r.p99 < 800, 'p99 ' + r.p99); assert.ok(r.err < 0.01);
});
test('more regions for users far away: global Deploy is slower for checkout (cross-region writes)', () => {
  const r = E(`(() => { const out = []; for (const d of deps) { normalizeDeploy(d); const M = compileModel(B, A, d, validateDeploy(B, A, d)); out.push(evaluateRate(M, B.scenarios[0], { N: 1500, seed: 11 }).p99); } return out; })()`);
  assert.ok(r[1] > r[0], JSON.stringify(r));
});
test('max throughput finds a limit and ramp playback breaks past it', () => {
  const r = E(`(() => { const d = deps[0]; normalizeDeploy(d); const M = compileModel(B, A, d, validateDeploy(B, A, d)); const st = stressTest(M, B.scenarios[0]); const T = simulateTimeline(M, Object.assign({}, B.scenarios[0], { burst: 'ramp' }), { frames: 24, N: 150 }); return { cap: st.lamCap, first: st.first.label, lastErr: T.frames[T.frames.length - 1].err, events: T.events.length }; })()`);
  assert.ok(r.cap > 100 && isFinite(r.cap)); assert.ok(r.lastErr > 0.01, 'errors at the end of the ramp'); assert.ok(r.events > 0);
});
test('batch: product import finishes; parallel makes it faster', () => {
  const r = E(`(() => { const d = deps[0]; normalizeDeploy(d); const run = b => { const a = analyzeBuild(b); const M = compileModel(b, a, d, validateDeploy(b, a, d)); return evaluateBatch(M, b.scenarios[2]).finishS; }; const b2 = exampleBuild(); const w = b2.workloads.find(x => x.name === 'ProductImport'); w.code = w.code.replace('for each row in file {', 'for each row in file parallel 50 {'); return [run(B), run(b2)]; })()`);
  assert.ok(r[1] < r[0] / 10, JSON.stringify(r));
});
test('single request steps add up to the total', () => {
  const r = E(`(() => { const d = deps[0]; normalizeDeploy(d); const M = compileModel(B, A, d, validateDeploy(B, A, d)); const sc = B.scenarios[0]; const e = entryInfo(A, sc.entry); const o = originsFor(M, sc, e)[0]; const p = enumeratePaths(A, sc.entry, {})[0]; const s = stepRequest(M, sc, p, o, {}); const last = s.steps[s.steps.length - 1]; return [s.total, last.start + last.dur]; })()`);
  assert.ok(Math.abs(r[0] - r[1]) < 1e-6, JSON.stringify(r));
});
test('all system-design examples have valid Builds and Deploys', () => {
  const examples = E('exampleSystems()');
  assert.strictEqual(examples.length, 7);
  for (let i = 0; i < examples.length; i++) {
    const example = examples[i];
    const analysis = E(`analyzeBuild(exampleSystems()[${i}].build)`);
    assert.strictEqual(analysis.valid, true, `${example.name}: ${analysis.problems.map((p) => p.msg).join('; ')}`);
    assert.strictEqual(example.deploys.length, 2, `${example.name} has two designs to compare`);
    for (let j = 0; j < example.deploys.length; j++) {
      const validation = E(`(() => { const x = exampleSystems()[${i}]; const a = analyzeBuild(x.build); const d = x.deploys[${j}]; normalizeDeploy(d); const v = validateDeploy(x.build, a, d); return { valid: v.valid, problems: v.problems.map(p => p.msg) }; })()`);
      assert.strictEqual(validation.valid, true, `${example.name}: ${example.deploys[j].name}: ${validation.problems.join('; ')}`);
    }
  }
});
// URL shortener starter under its redirect rush: links-db overloads, ClickWorker falls behind.
E(`var urlRun = (() => { const x = exampleSystems().find(e => /URL/.test(e.name)); const a = analyzeBuild(x.build); const sc = x.build.scenarios.find(s => /Redirect/.test(s.entry));
  const run = d => { normalizeDeploy(d); const m = compileModel(x.build, a, d, validateDeploy(x.build, a, d)); return { m, r: evaluateRate(m, sc, { seed: 11 }) }; };
  return { sc, starter: run(x.deploys[0]), scaled: run(x.deploys[1]) }; })()`);
test('failed requests do not count toward latency percentiles', () => {
  const r = E(`(() => { const r = urlRun.starter.r; return { sysErr: r.sysErr, ok: r.ok, samples: r.samples }; })()`);
  assert.ok(r.sysErr > 0.05, 'starter fails under the rush');
  assert.strictEqual(r.ok + Math.round(r.sysErr * r.samples), r.samples);
  // an overloaded run's percentiles only describe finished requests: lighter load never reports a higher p50 than the overloaded one
  const light = E(`(() => { const s = Object.assign({}, urlRun.sc, { count: urlRun.sc.count / 50 }); return evaluateRate(urlRun.starter.m, s, { seed: 11 }).p50; })()`);
  assert.ok(light <= E('urlRun.starter.r.p50'), 'light load is not slower than overload');
});
test('request path limits are separate from async consumers', () => {
  const r = E(`(() => { const r = urlRun.starter.r; return { path: r.pathRanked.map(([k, s]) => s.ref && s.ref.name), async: r.asyncRanked.map(([k, s]) => s.ref && s.ref.name), lag: Object.values(r.lags).map(l => l.lagS) }; })()`);
  assert.strictEqual(r.path[0], 'links-db');
  assert.ok(r.async.includes('analytics-db'), 'analytics-db is behind the queue');
  assert.ok(!r.path.includes('analytics-db'));
  assert.ok(r.lag.some(v => v > 60), 'click consumer falls behind');
});
test('verdict and suggestions explain a failing run', () => {
  const v = E(`rateVerdict(urlRun.sc, urlRun.starter.r)`);
  assert.strictEqual(v.status, 'fail');
  assert.ok(/links-db/.test(v.head));
  const tips = E(`suggestionsFor(urlRun.starter.m, urlRun.sc, urlRun.starter.r)`);
  const hot = tips.find(t => t.id === 'hot');
  assert.ok(hot && /links-db/.test(hot.text) && hot.target.kind === 'store');
  assert.ok(tips.some(t => t.id.startsWith('lag:')), 'backlog suggestion');
  assert.ok(tips.some(t => t.id === 'pop'), 'far users suggestion');
  assert.strictEqual(E(`rateVerdict(urlRun.sc, urlRun.scaled.r).status === 'fail'`), false);
});
test('max throughput is set by the request path, not by consumers behind a queue', () => {
  const st = E(`(() => { const s = stressTest(urlRun.starter.m, urlRun.sc); return { first: s.first.ref.name, cap: s.lamCap }; })()`);
  assert.strictEqual(st.first, 'links-db');
  assert.ok(st.cap > 1000);
});

test('system-design examples simulate a rate scenario and a batch scenario', () => {
  const results = E(`exampleSystems().map(x => {
    const a = analyzeBuild(x.build), d = x.deploys[0];
    normalizeDeploy(d);
    const m = compileModel(x.build, a, d, validateDeploy(x.build, a, d));
    const rate = x.build.scenarios.find(s => scenarioMode(a, s) === 'rate');
    const batch = x.build.scenarios.find(s => scenarioMode(a, s) === 'batch');
    return {
      name: x.name,
      rate: rate ? evaluateRate(m, rate, { N: 100, seed: 11 }).p99 : null,
      batch: batch ? evaluateBatch(m, batch).finishS : null
    };
  })`);
  assert.strictEqual(results.length, 7);
  for (const result of results) {
    assert.ok(Number.isFinite(result.rate) && result.rate >= 0, `${result.name} rate simulation`);
    if (result.batch != null) assert.ok(Number.isFinite(result.batch) && result.batch >= 0, `${result.name} batch simulation`);
  }
});
test('checked-in example files match the in-app examples', () => {
  const examplesDir = path.join(__dirname, '..', '..', 'examples');
  for (const example of E('exampleSystems()')) {
    const slug = example.id;
    const build = JSON.parse(fs.readFileSync(path.join(examplesDir, `${slug}.build.json`), 'utf8'));
    const simple = JSON.parse(fs.readFileSync(path.join(examplesDir, `${slug}-simple.deploy.json`), 'utf8'));
    const scaled = JSON.parse(fs.readFileSync(path.join(examplesDir, `${slug}-scaled.deploy.json`), 'utf8'));
    assert.strictEqual(build.id, example.build.id, `${example.name} Build export`);
    assert.strictEqual(simple.id, example.deploys[0].id, `${example.name} starter Deploy export`);
    assert.strictEqual(scaled.id, example.deploys[1].id, `${example.name} scaled Deploy export`);
  }
});
test('deployGraph shows every placed resource per region with wires from the code', () => {
  const r = E(`(() => { const d = deps[1]; normalizeDeploy(d); const g = deployGraph(B, A, d); const keys = g.nodes.map(n => n.key); return { regions: g.regions.length === d.regions.length, nodes: d.compute.every(c => c.regions.every(r => keys.includes('c:' + c.id + '@' + r))) && d.stores.every(s => s.regions.every(r => keys.includes('s:' + s.id + '@' + r))), entry: d.regions.every(r => keys.includes('e:' + r)), edges: g.edges.some(e => e.kind === 'read' || e.kind === 'write'), ids: g.edges.every(e => g.byKey[e.from] && g.byKey[e.to])}; })()`);
  assert.ok(Object.values(r).every(Boolean), JSON.stringify(r));
});
test('layout is optional, only positions, and wins over automatic placement', () => {
  const r = E(`(() => { const d = JSON.parse(JSON.stringify(deps[0])); delete d.layout; normalizeDeploy(d); const before = validateDeploy(B, A, d).valid; const k = 'c:' + d.compute[0].id + '@' + d.regions[0]; d.layout[k] = { x: 400, y: 300 }; const n = deployGraph(B, A, d).byKey[k]; return [d.layout !== undefined, before === validateDeploy(B, A, d).valid, n.x, n.y]; })()`);
  assert.strictEqual(JSON.stringify(r), '[true,true,400,300]');
});
test('placing, moving and adding from the canvas keeps the Deploy valid', () => {
  const r = E(`(() => { const d = JSON.parse(JSON.stringify(deps[0])); normalizeDeploy(d); const c2 = addInRegion(d, 'compute', 'fn', d.regions[0]); placeWorkloadOn(d, 'FraudCheck', c2.id); const refused = placeDataIn(d, B, 'OrderEvents', d.stores.find(s => s.type === 'redis').id); const kafka = d.stores.find(s => s.type === 'kafka'); const ok = placeDataIn(d, B, 'OrderEvents', kafka.id); return [c2.regions.join(), d.compute.find(c => c.id === c2.id).workloads.join(), refused.ok, ok.ok, validateDeploy(B, A, d).valid]; })()`);
  assert.strictEqual(r[0], E('deps[0].regions[0]'));
  assert.strictEqual(r[1], 'FraudCheck');
  assert.strictEqual(r[3], true);
  assert.strictEqual(r[4], false); // Functions can't reach the private database until it is connected: the fix is surfaced by validation
});
test('a table cannot be dropped on Kafka, and moving between regions updates the store', () => {
  const r = E(`(() => { const d = JSON.parse(JSON.stringify(deps[1])); normalizeDeploy(d); const kafka = d.stores.find(s => s.type === 'kafka'); const t = placeDataIn(d, B, 'Customers', kafka.id); const s = d.stores.find(x => x.repl === 'single'); const to = d.regions.find(x => !s.regions.includes(x)); moveToRegion(d, 'stores', s.id, s.regions[0], to); return [t.ok, s.regions.join() === to, s.primary === to]; })()`);
  assert.strictEqual(JSON.stringify(r), '[false,true,true]');
});
test('traffic and heat map onto canvas wires and nodes', () => {
  const r = E(`(() => { const d = deps[0]; normalizeDeploy(d); const M = compileModel(B, A, d, validateDeploy(B, A, d)); const res = evaluateRate(M, B.scenarios[0], { N: 300, seed: 11 }); const g = deployGraph(B, A, d, { origins: res.origins.filter(o => o.pop), links: res.links }); const t = trafficFor(g, res); const sum = Object.values(t).reduce((a, b) => a + b, 0); const top = res.ranked[0][0]; const h = heatFor(top.replace(/^g:/, 'e:'), res.R); return [sum > 0, Object.keys(t).every(id => g.edges.some(e => e.id === id)), !!h, heatLevel(2), g.nodes.some(n => n.kind === 'user')]; })()`);
  assert.strictEqual(JSON.stringify(r), '[true,true,true,"over",true]');
});
test('auto layout never overlaps and is deterministic on every example', () => {
  const r = E(`(() => { const bad = []; exampleSystems().forEach(ex => { const A2 = analyzeBuild(ex.build); ex.deploys.forEach(d => { normalizeDeploy(d); const run = () => deployGraph(ex.build, A2, d, { origins: [{ pop: 'na', region: d.regions[0] }, { pop: 'eu', region: d.regions[d.regions.length - 1] }] });
    const g = run(); const g2 = run(); if (JSON.stringify(g.nodes.map(n => [n.x, n.y])) !== JSON.stringify(g2.nodes.map(n => [n.x, n.y]))) bad.push(d.name + ' not deterministic');
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    g.regions.forEach(rg => { const ns = g.nodes.filter(n => n.region === rg.id); ns.forEach((a, i) => { if (a.x + a.w > rg.w || a.y + a.h > rg.h) bad.push(d.name + ' node outside region'); ns.slice(i + 1).forEach(b => { if (hit(a, b)) bad.push(d.name + ' ' + a.key + ' overlaps ' + b.key); }); }); });
    g.regions.forEach((a, i) => g.regions.slice(i + 1).forEach(b => { if (hit(a, b)) bad.push(d.name + ' regions overlap'); }));
  }); }); return bad; })()`);
  assert.strictEqual(JSON.stringify(r), '[]');
});

// ---------- experiments: break one thing and compare ----------
E(`var xp = (deployIndex, fault, edit) => { const d = JSON.parse(JSON.stringify(deps[deployIndex])); normalizeDeploy(d); if (edit) edit(d); const sc = B.scenarios[0]; const V = validateDeploy(B, A, d); const m = compileModel(B, A, d, V); const before = evaluateRate(m, sc, { N: 600, seed: 11 }); const f = applyFault(B, A, d, sc, fault); const after = evaluateRate(f.M, f.sc, { N: 600, seed: 11 }); return { d, before, after, f, sc }; }`);
test('experiments list traffic, region, zone and slow-down options for a Deploy', () => {
  const ids = E(`faultOptions(B, deps[1]).map(o => o.id)`);
  for (const id of ['traffic', 'region:use1', 'zone:euw1']) assert.ok(ids.includes(id), id);
  assert.ok(ids.some(id => id.startsWith('slow:s:')));
});
test('losing a region: single-region stores go down, replicated ones fail over, the Deploy is untouched', () => {
  const r = E(`(() => { const x = xp(1, { kind: 'region', region: 'use1' }); return { notes: x.f.notes, err: x.after.sysErr, why: Object.keys(x.after.why), regions: x.d.regions, beforeErr: x.before.sysErr }; })()`);
  assert.ok(r.notes.some(n => /payments-db lives only in us-east-1/.test(n)), r.notes.join(' | '));
  assert.ok(r.notes.some(n => /edge-cluster .*moves to/.test(n)));
  assert.ok(r.err > r.beforeErr, 'more failures after');
  assert.ok(r.why.some(w => /payments-(db|cluster) is (unavailable|down)/.test(w)), r.why.join(','));
  assert.strictEqual(JSON.stringify(r.regions), JSON.stringify(['use1', 'euw1', 'apse1']), 'original Deploy unchanged');
});
test('losing a zone: one-zone database fails, a standby in a second zone survives at higher cost', () => {
  const one = E(`(() => { const x = xp(0, { kind: 'zone', region: 'use1' }); return { err: x.after.sysErr, notes: x.f.notes }; })()`);
  assert.ok(one.err > 0.5, 'main-db in one zone takes requests down: ' + one.err);
  assert.ok(one.notes.some(n => /app-cluster loses 1 of its 3 zones/.test(n)), one.notes.join(' | '));
  const two = E(`(() => { const x = xp(0, { kind: 'zone', region: 'use1' }, d => d.stores.forEach(s => { if (zonesEditable(s, true)) s.zones = 2; })); return { err: x.after.sysErr, cost: x.before.cost, notes: x.f.notes }; })()`);
  const base = E(`xp(0, { kind: 'traffic', factor: 1 }).before.cost`);
  assert.ok(two.err < 0.01, 'survives with standbys: ' + two.err);
  assert.ok(two.cost > base, 'standbys cost more');
  assert.ok(two.notes.some(n => /fails over to its standby/.test(n)));
});
test('slowing a store raises latency and doubling traffic raises the rate', () => {
  const slow = E(`(() => { const d = deps[0]; const x = xp(0, { kind: 'slow', store: d.stores[0].id, ms: 100 }); return [x.before.p50, x.after.p50]; })()`);
  assert.ok(slow[1] > slow[0] + 50, JSON.stringify(slow));
  const t = E(`(() => { const x = xp(0, { kind: 'traffic', factor: 2 }); return [x.before.lambda, x.after.lambda]; })()`);
  assert.ok(Math.abs(t[1] / t[0] - 2) < 1e-6);
  assert.ok(/does not survive|survives|rides through|goal|fail/.test(E(`(() => { const x = xp(1, { kind: 'region', region: 'use1' }); return compareExperiment(x.sc, x.before, x.after); })()`)));
});
test('playback can break the design halfway and says what happened', () => {
  const r = E(`(() => { const d = JSON.parse(JSON.stringify(deps[1])); normalizeDeploy(d); const sc = B.scenarios[0]; const V = validateDeploy(B, A, d); const m = compileModel(B, A, d, V); const f = applyFault(B, A, d, sc, { kind: 'region', region: 'use1' }); const tl = simulateTimeline(m, sc, { frames: 10, N: 80, fault: { at: 0.5, M: f.M, label: 'us-east-1 goes down', notes: f.notes } }); return { broken: tl.frames.map(x => x.broken), ev: tl.events.filter(e => e.fault).map(e => e.msg), early: tl.frames[2].err, late: tl.frames[8].err }; })()`);
  assert.strictEqual(JSON.stringify(r.broken), JSON.stringify([false, false, false, false, false, true, true, true, true, true]));
  assert.strictEqual(r.ev[0], 'us-east-1 goes down');
  assert.ok(r.late > r.early);
});

// ---------- caches, hot keys, retries and timeouts ----------
E(`var sysRun = (sysId, dIndex, scIndex, edit, scEdit) => { const x = exampleSystems().find(s => s.id === sysId); const b = x.build; const a = analyzeBuild(b); const d = JSON.parse(JSON.stringify(x.deploys[dIndex])); normalizeDeploy(d); if (edit) edit(d); const sc = Object.assign({}, b.scenarios[scIndex || 0]); if (scEdit) scEdit(sc); const V = validateDeploy(b, a, d); const m = compileModel(b, a, d, V); return { b, a, d, sc, m, r: evaluateRate(m, sc, { N: 600, seed: 11 }) }; }`);
test('a cache in front takes reads off the database and costs a little', () => {
  const r = E(`(() => { const plain = sysRun('url-shortener', 0); const cached = sysRun('url-shortener', 0, 0, d => { d.stores[0].cache = { hit: 0.95 }; }); const k = Object.keys(plain.r.R).find(k => k.startsWith('s:' + plain.d.stores[0].id)); return { rho0: plain.r.R[k].rho, rho1: cached.r.R[k].rho, err0: plain.r.sysErr, err1: cached.r.sysErr, cost0: plain.r.cost, cost1: cached.r.cost }; })()`);
  assert.ok(r.rho1 < r.rho0 * 0.2, JSON.stringify(r));
  assert.ok(r.err1 < r.err0);
  assert.ok(r.cost1 > r.cost0);
});
test('a cold cache sends every read to the database again', () => {
  const r = E(`(() => { const x = sysRun('url-shortener', 0, 0, d => { d.stores[0].cache = { hit: 0.95 }; }); const ids = faultOptions(x.b, x.d).map(o => o.id); const f = applyFault(x.b, x.a, x.d, x.sc, { kind: 'cold' }); const after = evaluateRate(f.M, f.sc, { N: 600, seed: 11 }); return { ids, before: x.r.sysErr, after: after.sysErr, warm: f.warm }; })()`);
  assert.ok(r.ids.includes('cold'));
  assert.ok(r.after > r.before + 0.05, JSON.stringify(r));
  assert.strictEqual(r.warm[0].hit, 0.95);
});
test('a hot key overloads one shard however many shards there are', () => {
  const r = E(`(() => { const even = sysRun('url-shortener', 0, 0, d => { d.stores[0].shards = 8; }); const hot = sysRun('url-shortener', 0, 0, d => { d.stores[0].shards = 8; }, sc => { sc.hot = { ShortLinks: 0.4 }; }); const k = Object.keys(even.r.R).find(k => k.startsWith('s:' + even.d.stores[0].id)); const kv = sysRun('url-shortener', 1, 0, null, sc => { sc.hot = { ShortLinks: 0.4 }; }); const kk = Object.keys(kv.r.R).find(k => k.startsWith('s:' + kv.d.stores[0].id)); return { even: even.r.R[k].rho, hot: hot.r.R[k].rho, what: hot.r.R[k].what, kvWhat: kv.r.R[kk].what }; })()`);
  assert.ok(r.hot > r.even * 2, JSON.stringify(r));
  assert.strictEqual(r.what, 'one hot key');
  assert.strictEqual(r.kvWhat, 'one hot key');
});
test('timeouts cut slow calls short and retries recover some of them', () => {
  const run = (retries) => E(`(() => { const d = JSON.parse(JSON.stringify(deps[0])); normalizeDeploy(d); d.network.timeoutMs = 300; d.network.retries = ${retries}; const sc = B.scenarios[0]; const V = validateDeploy(B, A, d); const m = compileModel(B, A, d, V); const r = evaluateRate(m, sc, { N: 1500, seed: 11 }); return { err: r.sysErr, why: Object.keys(r.why) }; })()`);
  const none = run(0), two = run(2);
  assert.ok(none.why.some(w => /PaymentGateway.*timed out after 300 ms/.test(w)), none.why.join(','));
  assert.ok(two.err < none.err, JSON.stringify([none.err, two.err]));
});
test('retries add load to an overloaded resource', () => {
  const r = E(`(() => { const x = sysRun('url-shortener', 0, 0, d => { d.network = Object.assign({}, d.network, { retries: 2 }); }); return Object.values(x.r.R).filter(s => s.retryAmp > 1).length; })()`);
  assert.ok(r > 0);
});
console.log(`\n${n} passed${process.exitCode ? ', some failed' : ''}`);
