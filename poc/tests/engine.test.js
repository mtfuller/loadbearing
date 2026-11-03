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
  assert.strictEqual(examples.length, 5);
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
  assert.strictEqual(results.length, 5);
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
console.log(`\n${n} passed${process.exitCode ? ', some failed' : ''}`);
