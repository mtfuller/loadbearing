/* ===================== Step-through interpreter with mock data =====================
   Runs one entry point statement by statement. Yields events; an "ask" event
   expects the caller to answer true/false for a branch. Mock rows are linked:
   a field that points to another data node takes a real id from that node. */
const MOCK = {
  first: ['Ana', 'Bilal', 'Chen', 'Dana', 'Eli', 'Femi', 'Grace', 'Hiro', 'Ines', 'Jon'],
  products: ['Trail shoes', 'Rain jacket', 'Water bottle', 'Headlamp', 'Wool socks', 'Day pack', 'Camp mug', 'Trekking poles'],
  status: ['pending', 'paid', 'shipped', 'delivered'], pstatus: ['authorized', 'captured', 'declined'], carrier: ['UPS', 'DHL', 'FedEx'], country: ['US', 'DE', 'SG', 'GB', 'BR', 'JP'], type: ['checkout.completed', 'checkout.paid']
};
function mkRng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function pickR(r, arr) { return arr[Math.floor(r() * arr.length)]; }
function idFor(dn, r) { return dn.toLowerCase().replace(/s$/, '').slice(0, 4) + '_' + Math.floor(r() * 0xffff).toString(16).padStart(4, '0'); }
function genValue(f, d, db, B, r, i) {
  const n = f.name.toLowerCase(), t = (f.type || '').toLowerCase();
  if (f.ref) { const [rd, rf] = f.ref.split('.'); const rows = db[rd]; if (rows && rows.length) return pickR(r, rows)[rf]; }
  if (f.key) return idFor(d.name, r);
  if (/uuid|^id$/.test(t) || /_id$/.test(n)) return idFor(n.replace(/_id$/, ''), r);
  if (n === 'email') return pickR(r, MOCK.first).toLowerCase() + (i != null ? i : Math.floor(r() * 90)) + '@example.com';
  if (n === 'name') return d.name === 'Products' || /product/i.test(d.name) ? pickR(r, MOCK.products) : pickR(r, MOCK.first);
  if (n === 'status') return /pay/i.test(d.name) ? pickR(r, MOCK.pstatus) : pickR(r, MOCK.status);
  if (n === 'carrier') return pickR(r, MOCK.carrier);
  if (n === 'country' || /char\(2\)/.test(t)) return pickR(r, MOCK.country);
  if (n === 'type') return pickR(r, MOCK.type);
  if (/decimal|money|price|amount|total/.test(t + n)) return +(5 + r() * 195).toFixed(2);
  if (/int/.test(t)) return Math.floor(r() * 200);
  if (/timestamp|time/.test(t)) return new Date(Date.UTC(2026, 9, 29, Math.floor(r() * 24), Math.floor(r() * 60))).toISOString().slice(0, 16).replace('T', ' ');
  if (/date/.test(t)) return '2026-10-29';
  if (/json/.test(t)) { if (n === 'items' && db.Products && db.Products.length) return Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ product_id: pickR(r, db.Products).product_id, qty: 1 + Math.floor(r() * 3) })); return {}; }
  if (/file/.test(t)) return 'report-2026-10-29.csv';
  return n.slice(0, 3) + '-' + Math.floor(r() * 1000);
}
function keyOf(d) { const k = (d.fields || []).find(f => f.key); return k ? k.name : null; }
function mockDB(B, seed) {
  const r = mkRng(seed || 7); const db = {};
  // fill referenced data first
  const order = []; const seen = new Set();
  const visit = d => { if (seen.has(d.name)) return; seen.add(d.name); (d.fields || []).forEach(f => { if (/json/i.test(f.type || '') && f.name === 'items') { const t = B.data.find(x => x.name === 'Products'); if (t && t !== d) visit(t); } if (f.ref) { const t = B.data.find(x => x.name === f.ref.split('.')[0]); if (t && t !== d) visit(t); } }); order.push(d); };
  B.data.forEach(visit);
  order.forEach(d => {
    const n = ['queue', 'stream', 'topic'].includes(d.kind) ? 0 : d.kind === 'file' ? 5 : d.kind === 'blob' ? 1 : 6;
    db[d.name] = Array.from({ length: n }, (_, i) => { const row = {}; (d.fields || []).forEach(f => { row[f.name] = genValue(f, d, db, B, r, i); }); return row; });
  });
  db._r = r; return db;
}
function nextVal(f, d, db, B, r, old) {
  const n = f.name.toLowerCase();
  if (n === 'status') { const L = /pay/i.test(d.name) ? MOCK.pstatus : MOCK.status; const i = L.indexOf(old); return L[Math.min(L.length - 1, i + 1)] || L[1]; }
  return genValue(f, d, db, B, r);
}

function* runEntry(A, B, db, entryKey, opts) {
  opts = opts || {}; const r = db._r;
  const [wn, hn] = [entryKey.slice(0, entryKey.indexOf('.')), entryKey.slice(entryKey.indexOf('.') + 1)];
  const H = A.W[wn] && A.W[wn].handlers[hn]; if (!H) return 'missing';
  const ctx = Object.assign({}, opts.ctx || {}); db._ctx = ctx;
  if (H.type === 'file') { ctx._file = (db[H.data] || []).slice(); ctx._fileTotal = opts.fileRows || ctx._file.length; }
  if (H.type === 'message' && !opts.ctx) { const msgs = db[H.data] || []; const m = msgs[msgs.length - 1]; if (m) Object.assign(ctx, m); }
  yield { t: 'start', w: wn, h: hn, type: H.type, ctx: Object.assign({}, ctx), data: H.data };
  const res = yield* runHandler(A, B, db, r, wn, hn, ctx, 0, opts);
  yield { t: 'done', outcome: res === 'error' ? 'error' : 'ok', ctx };
  return res;
}
function* runHandler(A, B, db, r, w, h, ctx, depth, opts) {
  const H = A.W[w].handlers[h];
  yield { t: 'enter', w, h, line: H.line, depth, ext: A.W[w].node.external };
  const res = yield* runBody(A, B, db, r, H.body, w, h, ctx, depth, opts);
  yield { t: 'exit', w, h, depth, outcome: res };
  return res;
}
function* runBody(A, B, db, r, body, w, h, ctx, depth, opts) {
  for (const st of body) { const x = yield* runStmt(A, B, db, r, st, w, h, ctx, depth, opts); if (x) return x; }
  return null;
}
function* runStmt(A, B, db, r, st, w, h, ctx, depth, opts) {
  const base = { w, h, line: st.line, depth };
  switch (st.t) {
    case 'call': {
      yield Object.assign({ t: 'call', to: st.w, th: st.h }, base);
      const x = yield* runHandler(A, B, db, r, st.w, st.h, ctx, depth + 1, opts);
      yield Object.assign({ t: 'back', from: st.w, fh: st.h, outcome: x }, base);
      return x === 'error' ? 'error' : null;
    }
    case 'data': {
      const d = A.D[st.data]; if (!d) return null;
      if (['queue', 'stream', 'topic'].includes(d.kind) && st.op === 'insert') return yield* runStmt(A, B, db, r, { t: 'publish', data: st.data, line: st.line }, w, h, ctx, depth, opts);
      const res = mockOp(db, B, d, st, ctx, r);
      yield Object.assign({ t: 'data', op: st.op, d: d.name, by: st.by, many: st.rows }, res, base);
      return null;
    }
    case 'publish': {
      const d = A.D[st.data]; if (!d) return null;
      const msg = {}; (d.fields || []).forEach(f => { msg[f.name] = ctx[f.name] != null ? ctx[f.name] : genValue(f, d, db, B, r); });
      (db[d.name] || (db[d.name] = [])).push(msg);
      const consumers = A.triggers.filter(t => t.d === d.name && t.type === 'message').map(t => t.w + '.' + t.h);
      yield Object.assign({ t: 'publish', d: d.name, msg, consumers, queued: db[d.name].length }, base);
      return null;
    }
    case 'compute': yield Object.assign({ t: 'compute', ms: st.ms, ext: A.W[w].node.external }, base); return null;
    case 'error': yield Object.assign({ t: 'error', code: st.code }, base); return 'error';
    case 'return': yield Object.assign({ t: 'return' }, base); return 'return';
    case 'if': {
      const key = condKey(w, h, st.cond); const p = opts.odds && opts.odds[key] != null ? opts.odds[key] : (st.p != null ? st.p : 0.5);
      const ans = yield Object.assign({ t: 'ask', cond: st.cond, p, key, hasElse: !!st.else }, base);
      const taken = ans === true || ans === false ? ans : r() < p;
      yield Object.assign({ t: 'branch', cond: st.cond, taken, p }, base);
      return yield* runBody(A, B, db, r, taken ? st.then : (st.else || []), w, h, ctx, depth, opts);
    }
    case 'loop': {
      const isFile = st.src.toLowerCase() === 'file';
      let n = isFile ? (ctx._fileTotal || (ctx._file || []).length) : (st.n || 1);
      const rows = isFile ? (ctx._file || []) : null;
      // a loop over something read earlier walks that row's list (e.g. a cart's items)
      let items = null; if (!isFile) { const arrs = Object.keys(ctx).filter(k => Array.isArray(ctx[k]) && k[0] !== '_'); if (arrs.length) items = ctx[arrs[arrs.length - 1]]; }
      if (items && items.length) n = items.length;
      const shown = Math.min(n, isFile ? rows.length : (opts.maxIter || 6));
      for (let i = 0; i < shown; i++) {
        const snap = Object.assign({}, ctx);
        if (isFile && rows[i]) Object.assign(ctx, rows[i]);
        if (!isFile && items && items[i]) Object.assign(ctx, items[i]);
        yield Object.assign({ t: 'iter', item: st.item, i: i + 1, n, shown, par: st.par || 1, file: isFile }, base);
        const x = yield* runBody(A, B, db, r, st.body, w, h, ctx, depth, opts);
        Object.keys(ctx).forEach(k => { if (!(k in snap)) delete ctx[k]; else ctx[k] = snap[k]; });
        if (x) return x;
      }
      yield Object.assign({ t: 'loopend', item: st.item, n, shown, par: st.par || 1, file: isFile }, base);
      return null;
    }
    case 'par': {
      yield Object.assign({ t: 'par', phase: 'start', n: st.body.length }, base);
      for (const c of st.body) { const x = yield* runStmt(A, B, db, r, c, w, h, ctx, depth, opts); if (x) return x; }
      yield Object.assign({ t: 'par', phase: 'end' }, base);
      return null;
    }
  }
  return null;
}
function mockOp(db, B, d, st, ctx, r) {
  const rows = db[d.name] || (db[d.name] = []); const key = keyOf(d);
  const fieldsOf = () => (d.fields || []);
  if (st.op === 'read') {
    const f = st.by || key; let note = '';
    let matches = [];
    if (f && ctx[f] !== undefined) matches = rows.filter(x => x[f] === ctx[f]);
    if (!matches.length && f && ctx[f] !== undefined) return { rows: [], count: 0, note: `No ${d.name} row has ${f} = ${ctx[f]} yet, so this read finds nothing.`, scan: false };
    if (!matches.length && rows.length) { const pick = rows[Math.floor(r() * rows.length)]; matches = [pick]; if (f && ctx[f] !== undefined && f === key) note = `No row has ${f} = ${ctx[f]}; picked another row.`; else if (f) note = ctx[f] === undefined ? `Picked a ${d.name} row (no ${f} known yet).` : ''; }
    const want = Math.max(1, st.rows || 1);
    let out = matches.slice(0, Math.min(want, 3));
    if (want > out.length && rows.length) { while (out.length < Math.min(want, 3)) out.push(rows[Math.floor(r() * rows.length)]); }
    if (out[0]) fieldsOf().forEach(fl => { if ((fl.key || fl.ref || fl.name === f || Array.isArray(out[0][fl.name])) && ctx[fl.name] === undefined) ctx[fl.name] = out[0][fl.name]; });
    const f0 = d.fields && d.fields.find(x => x.name === f);
    return { rows: out.map(x => Object.assign({}, x)), count: want, note, scan: !!(f0 && !f0.key && !f0.index) };
  }
  if (st.op === 'insert' || (st.op === 'upsert' && !(key && ctx[key] !== undefined && rows.some(x => x[key] === ctx[key])))) {
    const row = {}; fieldsOf().forEach(fl => { row[fl.name] = fl.key ? (st.op === 'upsert' && ctx[fl.name] !== undefined ? ctx[fl.name] : idFor(d.name, r)) : ctx[fl.name] !== undefined && fl.name !== 'status' ? ctx[fl.name] : fl.name === 'status' ? (/pay/i.test(d.name) ? 'authorized' : 'pending') : genValue(fl, d, db, B, r); });
    rows.push(row); if (key) ctx[key] = row[key];
    return { rows: [Object.assign({}, row)], change: 'new', total: rows.length };
  }
  if (st.op === 'update' || st.op === 'upsert') {
    let row = key && ctx[key] !== undefined ? rows.find(x => x[key] === ctx[key]) : null; if (!row) row = rows[rows.length - 1];
    if (!row) return { rows: [], note: 'Nothing to update.' };
    const before = Object.assign({}, row); const changed = [];
    fieldsOf().forEach(fl => { if (fl.key) return; if (ctx[fl.name] !== undefined && ctx[fl.name] !== row[fl.name] && st.op === 'upsert') { row[fl.name] = ctx[fl.name]; changed.push(fl.name); } });
    if (!changed.length) { const fl = fieldsOf().find(x => x.name === 'status') || fieldsOf().find(x => !x.key && !x.ref); if (fl) { row[fl.name] = nextVal(fl, d, db, B, r, row[fl.name]); changed.push(fl.name); } }
    if (key) ctx[key] = row[key];
    return { rows: [Object.assign({}, row)], before, changed, change: 'update', total: rows.length };
  }
  if (st.op === 'delete') {
    const i = key && ctx[key] !== undefined ? rows.findIndex(x => x[key] === ctx[key]) : rows.length - 1;
    const gone = i >= 0 ? rows.splice(i, 1)[0] : null; return { rows: gone ? [gone] : [], change: 'delete', total: rows.length };
  }
  return { rows: [] };
}
if (typeof module !== 'undefined') module.exports = { mockDB, runEntry };
