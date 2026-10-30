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
console.log(`\n${n} passed${process.exitCode ? ', some failed' : ''}`);
