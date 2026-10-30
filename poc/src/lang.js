/* ===================== Workload language =====================
   when <Trigger> { ... }
     Trigger: Name | message Data | file Data | schedule "text" | change Data
   Statements:
     call Workload.Handler
     read|insert|update|upsert|delete Data [by field|where field] [many N]
     publish Data
     if Condition [@12%] { ... } [else { ... }]
     for each item in Source [~N] [parallel N] { ... }      (Source "file" = rows of the file)
     parallel { ... }
     compute 15ms
     error [code]
     return
*/
const DATA_KINDS = {
  table: { label: 'Table', ops: ['read', 'insert', 'update', 'upsert', 'delete'], soft: { publish: 'Publishing to a table works as an “outbox” that something else polls. A stream or queue is the usual choice.' } },
  document: { label: 'Documents', ops: ['read', 'insert', 'update', 'upsert', 'delete'], soft: { publish: 'Publishing to a collection works as an outbox. A stream or queue is the usual choice.' } },
  kv: { label: 'Key-value', ops: ['read', 'insert', 'update', 'upsert', 'delete'], soft: { publish: 'Publishing to a key-value store works as an outbox. A stream or queue is the usual choice.' } },
  queue: { label: 'Queue', ops: ['publish', 'insert'], trigger: 'message', soft: { read: 'Reading a queue directly takes messages off it. Usually a “when message” handler processes them.', delete: 'Deleting from a queue acknowledges a message. Usually handled for you.' } },
  stream: { label: 'Event stream', ops: ['publish', 'insert'], trigger: 'message', soft: { read: 'Reading a stream directly replays events. Usually a “when message” handler consumes them.' } },
  topic: { label: 'Pub/sub topic', ops: ['publish', 'insert'], trigger: 'message', soft: {} },
  file: { label: 'Files', ops: ['read', 'insert', 'delete'], trigger: 'file', soft: { update: 'Files are written whole, so this rewrites the file.', upsert: 'Files are written whole, so this rewrites the file.' } },
  blob: { label: 'Objects', ops: ['read', 'insert', 'delete', 'upsert'], soft: { update: 'Objects are written whole, so this rewrites the object.' } }
};
const KW = ['when', 'call', 'read', 'insert', 'update', 'upsert', 'delete', 'publish', 'if', 'else', 'for', 'each', 'in', 'parallel', 'compute', 'error', 'return', 'by', 'where', 'many', 'message', 'file', 'schedule', 'change'];

function parseCode(src) {
  const lines = String(src || '').split('\n');
  const handlers = [], errors = [];
  const stack = []; // frames: {type, node, body}
  const push = st => { if (!stack.length) { errors.push({ line: st.line, msg: 'Statements must be inside a “when … { }” block.' }); return false; } stack[stack.length - 1].body.push(st); return true; };
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    let line = lines[i].replace(/(#|\/\/).*$/, '').trim();
    if (!line) continue;
    // closing braces, possibly followed by else
    while (line.startsWith('}')) {
      line = line.slice(1).trim();
      if (!stack.length) { errors.push({ line: ln, msg: 'There’s an extra “}”.' }); continue; }
      const top = stack.pop();
      if (/^else\b/i.test(line)) {
        if (top.type !== 'if') { errors.push({ line: ln, msg: '“else” must follow an “if” block.' }); line = ''; break; }
        let rest = line.replace(/^else\s*/i, '');
        if (rest === '{') { top.node.else = []; stack.push({ type: 'else', node: top.node, body: top.node.else }); line = ''; }
        else if (/^if\b/i.test(rest)) { top.node.else = []; const st = parseIf(rest, ln, errors); if (st) { top.node.else.push(st); stack.push({ type: 'if', node: st, body: st.then }); } line = ''; }
        else { errors.push({ line: ln, msg: 'Write “} else {” or “} else if Condition {”.' }); line = ''; }
      }
    }
    if (!line) continue;
    let m;
    if ((m = line.match(/^when\s+(.+?)\s*\{$/i))) {
      if (stack.length) { errors.push({ line: ln, msg: '“when” blocks can’t be nested. Close the previous block first.' }); continue; }
      const spec = m[1].trim(); let trig;
      let mm;
      if ((mm = spec.match(/^(message|event)\s+([A-Za-z_][\w]*)$/i))) trig = { type: 'message', data: mm[2], name: 'message ' + mm[2] };
      else if ((mm = spec.match(/^file\s+([A-Za-z_][\w]*)$/i))) trig = { type: 'file', data: mm[1], name: 'file ' + mm[1] };
      else if ((mm = spec.match(/^change\s+([A-Za-z_][\w]*)$/i))) trig = { type: 'change', data: mm[1], name: 'change ' + mm[1] };
      else if ((mm = spec.match(/^schedule\s+"?([^"]+)"?$/i))) trig = { type: 'schedule', text: mm[1], name: 'schedule ' + mm[1] };
      else if ((mm = spec.match(/^([A-Za-z_][\w]*)$/))) trig = { type: 'call', name: mm[1] };
      else { errors.push({ line: ln, msg: `Don’t understand the trigger “${spec}”. Use a name, “message Data”, “file Data”, “change Data” or “schedule "daily 02:00"”.` }); trig = { type: 'call', name: 'Unnamed' + ln }; }
      const h = Object.assign({ line: ln, body: [] }, trig);
      handlers.push(h); stack.push({ type: 'when', node: h, body: h.body });
      continue;
    }
    if (/^if\b/i.test(line)) { const st = parseIf(line, ln, errors); if (st && push(st)) stack.push({ type: 'if', node: st, body: st.then }); continue; }
    if ((m = line.match(/^for\s+each\s+(\w+)\s+in\s+(\w+)(.*)\{$/i))) {
      const rest = m[3]; const n = (rest.match(/~\s*([\d_,.]+[kKmM]?)/) || [])[1]; const par = (rest.match(/parallel\s+(\d+)/i) || [])[1];
      const st = { t: 'loop', line: ln, item: m[1], src: m[2], n: n ? num(n) : null, par: par ? +par : 1, body: [] };
      if (push(st)) stack.push({ type: 'loop', node: st, body: st.body }); continue;
    }
    if (/^parallel\s*\{$/i.test(line)) { const st = { t: 'par', line: ln, body: [] }; if (push(st)) stack.push({ type: 'par', node: st, body: st.body }); continue; }
    if ((m = line.match(/^call\s+([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/i))) { push({ t: 'call', line: ln, w: m[1], h: m[2] }); continue; }
    if ((m = line.match(/^(read|insert|update|upsert|delete)\s+([A-Za-z_]\w*)(.*)$/i))) {
      const rest = m[3]; const by = (rest.match(/\b(?:by|where)\s+(\w+)/i) || [])[1]; const many = (rest.match(/\bmany\s+([\d_,.]+[kKmM]?)/i) || rest.match(/~\s*([\d_,.]+[kKmM]?)/) || [])[1];
      push({ t: 'data', line: ln, op: m[1].toLowerCase(), data: m[2], by: by || null, rows: many ? num(many) : 1 }); continue;
    }
    if ((m = line.match(/^(publish|send)\s+([A-Za-z_]\w*)$/i))) { push({ t: 'publish', line: ln, data: m[2] }); continue; }
    if ((m = line.match(/^compute\s+([\d.]+)\s*ms$/i))) { push({ t: 'compute', line: ln, ms: +m[1] }); continue; }
    if ((m = line.match(/^error\b\s*(.*)$/i))) { push({ t: 'error', line: ln, code: m[1].trim() || 'error' }); continue; }
    if (/^return$/i.test(line)) { push({ t: 'return', line: ln }); continue; }
    errors.push({ line: ln, msg: `Don’t understand “${line.length > 40 ? line.slice(0, 40) + '…' : line}”.` });
  }
  if (stack.length) errors.push({ line: stack[stack.length - 1].node.line, msg: 'This block is never closed. Add a “}”.' });
  return { handlers, errors };
}
function parseIf(line, ln, errors) {
  const m = line.match(/^if\s+(.+?)\s*(?:@\s*([\d.]+)\s*%)?\s*\{$/i);
  if (!m) { errors.push({ line: ln, msg: 'Write “if Condition {” or “if Condition @10% {”.' }); return null; }
  return { t: 'if', line: ln, cond: m[1].trim(), p: m[2] != null ? Math.max(0, Math.min(100, +m[2])) / 100 : null, then: [], else: null };
}
function num(s) { s = String(s).replace(/[_,]/g, ''); const m = s.match(/^([\d.]+)([kKmM]?)$/); if (!m) return +s || 1; return +m[1] * (m[2].toLowerCase() === 'k' ? 1e3 : m[2].toLowerCase() === 'm' ? 1e6 : 1); }

/* syntax highlighting (returns HTML) */
function highlightCode(src, errLines) {
  const e = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(src).split('\n').map((line, i) => {
    let out = '', rest = line, cm = '';
    const ci = rest.search(/(#|\/\/)/); if (ci >= 0) { cm = rest.slice(ci); rest = rest.slice(0, ci); }
    out = e(rest)
      .replace(/("[^"]*")/g, '<span class="tk-s">$1</span>')
      .replace(/(@\s*[\d.]+\s*%|~\s*[\d_,.]+[kKmM]?|\b\d+(?:\.\d+)?\s*ms\b|\bparallel\s+\d+)/g, '<span class="tk-n">$1</span>')
      .replace(/\b(when|call|read|insert|update|upsert|delete|publish|send|if|else|for|each|in|parallel|compute|error|return|by|where|many|message|file|schedule|change)\b/g, '<span class="tk-k">$1</span>')
      .replace(/\b([A-Z][A-Za-z0-9_]*)(\.([A-Za-z_]\w*))?/g, (m0, a, b, c) => b ? `<span class="tk-w">${a}</span>.<span class="tk-h">${c}</span>` : `<span class="tk-d">${a}</span>`);
    if (cm) out += `<span class="tk-c">${e(cm)}</span>`;
    return errLines && errLines.has(i + 1) ? `<span class="tk-err">${out || ' '}</span>` : out;
  }).join('\n') + '\n';
}

/* ---------- Build analysis ---------- */
function analyzeBuild(B) {
  const P = []; // problems
  const W = {}, Dn = {};
  B.data.forEach(d => { if (Dn[d.name]) P.push({ sev: 'error', kind: 'data', id: d.id, msg: `Two data nodes are named ${d.name}.` }); Dn[d.name] = d; });
  B.workloads.forEach(w => {
    if (W[w.name]) P.push({ sev: 'error', kind: 'workload', id: w.id, msg: `Two workloads are named ${w.name}.` });
    const parsed = parseCode(w.code);
    W[w.name] = { node: w, parsed, handlers: {} };
    parsed.errors.forEach(er => P.push({ sev: 'error', kind: 'workload', id: w.id, line: er.line, msg: er.msg }));
    parsed.handlers.forEach(h => {
      const key = h.name;
      if (W[w.name].handlers[key]) P.push({ sev: 'error', kind: 'workload', id: w.id, line: h.line, msg: `${w.name} has two handlers named “${key}”.` });
      W[w.name].handlers[key] = h;
    });
    if (!parsed.handlers.length && !parsed.errors.length) P.push({ sev: 'warn', kind: 'workload', id: w.id, msg: `${w.name} has no “when” blocks, so nothing runs it.` });
  });
  const calls = [], dataOps = {}, triggers = [], refs = [];
  const calledHandlers = new Set();
  const opKey = (w, d) => w + '>' + d;
  const visit = (w, h, body, inFile) => body.forEach(st => {
    if (st.t === 'call') {
      const T = W[st.w];
      if (!T) P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: st.line, msg: `No workload named ${st.w}.` });
      else if (!T.handlers[st.h]) P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: st.line, msg: `${st.w} has no handler “${st.h}”. Add “when ${st.h} { }” to ${st.w}.` });
      else { calls.push({ from: w.node.name, fromH: h.name, to: st.w, h: st.h }); calledHandlers.add(st.w + '.' + st.h); if (T.handlers[st.h].type !== 'call') P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: st.line, msg: `${st.w}.${st.h} is triggered by an event and can’t be called directly.` }); }
    } else if (st.t === 'data' || st.t === 'publish') {
      const d = Dn[st.data];
      if (!d) { P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: st.line, msg: `No data node named ${st.data}. Add it, or fix the name.` }); return; }
      const op = st.t === 'publish' ? 'publish' : st.op;
      const K = DATA_KINDS[d.kind];
      if (!K.ops.includes(op)) { if (K.soft && K.soft[op]) P.push({ sev: 'warn', kind: 'workload', id: w.node.id, line: st.line, msg: `${op} ${d.name}: ${K.soft[op]}` }); else P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: st.line, msg: `You can’t ${op} ${d.name}: it’s ${K.label.toLowerCase()}. Try: ${K.ops.concat(Object.keys(K.soft || {})).join(', ')}.` }); }
      const k = opKey(w.node.name, d.name); const o = (dataOps[k] || (dataOps[k] = { w: w.node.name, d: d.name, ops: new Set(), hs: new Set() })); o.ops.add(op); o.hs.add(h.name);
      if (st.by && d.fields) {
        const f = d.fields.find(x => x.name === st.by);
        if (!f) P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: st.line, msg: `${d.name} has no field “${st.by}”.` });
        else if (!f.key && !f.index && st.op !== 'insert') P.push({ sev: 'warn', kind: 'workload', id: w.node.id, line: st.line, msg: `${d.name}.${st.by} isn’t indexed, so this ${st.op} scans every row.`, fix: { label: `Index ${d.name}.${st.by}`, data: d.id, field: st.by } });
      }
    } else if (st.t === 'if') { visit(w, h, st.then, inFile); if (st.else) visit(w, h, st.else, inFile); }
    else if (st.t === 'loop') {
      if (st.src.toLowerCase() === 'file' && h.type !== 'file') P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: st.line, msg: '“for each … in file” only works inside “when file …”.' });
      else if (st.src.toLowerCase() !== 'file' && !st.n) P.push({ sev: 'warn', kind: 'workload', id: w.node.id, line: st.line, msg: `How many times does this loop run? Add “~3” after ${st.src}. Using 1.` });
      visit(w, h, st.body, inFile);
    }
    else if (st.t === 'par') visit(w, h, st.body, inFile);
  });
  Object.values(W).forEach(w => w.parsed.handlers.forEach(h => {
    if (h.data) {
      const d = Dn[h.data];
      if (!d) P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: h.line, msg: `No data node named ${h.data}.` });
      else {
        triggers.push({ d: d.name, w: w.node.name, type: h.type, h: h.name });
        if (h.type === 'message' && DATA_KINDS[d.kind].trigger !== 'message') P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: h.line, msg: `${d.name} is ${DATA_KINDS[d.kind].label.toLowerCase()}; only queues, streams and topics deliver messages.` });
        if (h.type === 'file' && DATA_KINDS[d.kind].trigger !== 'file') P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: h.line, msg: `${d.name} isn’t a file store, so “when file” never fires.` });
        if (h.type === 'change' && !['table', 'kv', 'document'].includes(d.kind)) P.push({ sev: 'error', kind: 'workload', id: w.node.id, line: h.line, msg: `“when change” needs a table or key-value data node.` });
      }
    }
    visit(w, h, h.body, h.type === 'file');
  }));
  // references between data
  B.data.forEach(d => (d.fields || []).forEach(f => {
    if (!f.ref) return; const [dn, fn] = f.ref.split('.'); const T = Dn[dn];
    if (!T) P.push({ sev: 'error', kind: 'data', id: d.id, msg: `${d.name}.${f.name} points to ${dn}, which doesn’t exist.` });
    else if (!(T.fields || []).some(x => x.name === fn)) P.push({ sev: 'error', kind: 'data', id: d.id, msg: `${d.name}.${f.name} points to ${f.ref}, which doesn’t exist.` });
    else refs.push({ from: d.name, field: f.name, to: dn, toField: fn });
  }));
  // unused data, missing keys
  B.data.forEach(d => {
    const used = Object.values(dataOps).some(o => o.d === d.name) || triggers.some(t => t.d === d.name);
    if (!used) P.push({ sev: 'warn', kind: 'data', id: d.id, msg: `${d.name} isn’t used by any workload.` });
    if (['table', 'kv', 'document'].includes(d.kind) && !(d.fields || []).some(f => f.key)) P.push({ sev: 'error', kind: 'data', id: d.id, msg: `${d.name} needs a key field.` });
  });
  // entries
  const entries = [];
  Object.values(W).forEach(w => w.parsed.handlers.forEach(h => {
    if (w.node.external) return;
    if (h.type === 'call' && !calledHandlers.has(w.node.name + '.' + h.name)) entries.push({ key: w.node.name + '.' + h.name, w: w.node.name, h: h.name, type: 'request', label: `${h.name}` });
    if (h.type === 'message') entries.push({ key: w.node.name + '.' + h.name, w: w.node.name, h: h.name, type: 'message', label: `${w.node.name}: ${h.name}` });
    if (h.type === 'file') entries.push({ key: w.node.name + '.' + h.name, w: w.node.name, h: h.name, type: 'file', label: `${w.node.name}: ${h.name}` });
    if (h.type === 'schedule') entries.push({ key: w.node.name + '.' + h.name, w: w.node.name, h: h.name, type: 'schedule', label: `${w.node.name}: ${h.name}` });
    if (h.type === 'change') entries.push({ key: w.node.name + '.' + h.name, w: w.node.name, h: h.name, type: 'change', label: `${w.node.name}: ${h.name}` });
  }));
  // call cycles
  const seen = {}; let cyc = null;
  const dfs = (k, stackSet) => {
    if (cyc) return; if (stackSet.has(k)) { cyc = k; return; } if (seen[k]) return; seen[k] = 1; stackSet.add(k);
    const [wn, hn] = k.split('.'); const h = W[wn] && W[wn].handlers[hn]; if (h) walkCalls(h.body, c => dfs(c.w + '.' + c.h, stackSet));
    stackSet.delete(k);
  };
  Object.values(W).forEach(w => w.parsed.handlers.forEach(h => dfs(w.node.name + '.' + h.name, new Set())));
  if (cyc) { const w = W[cyc.split('.')[0]]; P.push({ sev: 'error', kind: 'workload', id: w.node.id, msg: `${cyc} ends up calling itself. Calls can’t loop.` }); }
  const errors = P.filter(p => p.sev === 'error').length;
  return { W, D: Dn, problems: P, errors, warnings: P.length - errors, calls, dataOps: Object.values(dataOps).map(o => ({ w: o.w, d: o.d, ops: [...o.ops], hs: [...o.hs] })), triggers, refs, entries, valid: errors === 0 };
}
function walkCalls(body, fn) { body.forEach(st => { if (st.t === 'call') fn(st); else if (st.t === 'if') { walkCalls(st.then, fn); if (st.else) walkCalls(st.else, fn); } else if (st.t === 'loop' || st.t === 'par') walkCalls(st.body, fn); }); }

/* ---------- path enumeration ---------- */
// Steps: {k:'enter', w, h} {k:'call', from, w, h} {k:'ret', w} {k:'data', w, d, op, by, rows} {k:'publish', w, d}
//        {k:'compute', w, ms} {k:'error', code}   with mult (loop multiplier) and pg/pi (parallel group/branch)
function condKey(w, h, cond) { return `${w}.${h}: ${cond}`; }
function enumeratePaths(A, entryKey, odds, opts) {
  opts = opts || {};
  const [wn, hn] = entryKey.split('.');
  const MAX = opts.max || 128;
  let gid = 0;
  const expandHandler = (w, h, depth, ctx) => {
    const H = A.W[w] && A.W[w].handlers[h]; if (!H) return [{ steps: [], dec: [], p: 1, term: null }];
    const ext = A.W[w].node.external;
    const start = [{ steps: [{ k: 'enter', w, h, mult: ctx.mult, par: ctx.par || 1, pg: ctx.pg, pi: ctx.pi, ext }], dec: [], p: 1, term: null }];
    const res = seq(H.body, w, h, depth, ctx, start);
    // 'return' inside a callee ends only the callee
    return res.map(r => r.term === 'return' ? Object.assign({}, r, { term: null }) : r);
  };
  const seq = (body, w, h, depth, ctx, partials) => {
    for (const st of body) {
      const next = [];
      for (const pt of partials) {
        if (pt.term) { next.push(pt); continue; }
        const alts = stmt(st, w, h, depth, ctx);
        for (const al of alts) next.push({ steps: pt.steps.concat(al.steps), dec: pt.dec.concat(al.dec), p: pt.p * al.p, term: al.term });
      }
      partials = prune(next);
    }
    return partials;
  };
  const prune = arr => { if (arr.length <= MAX) return arr; return arr.sort((a, b) => b.p - a.p).slice(0, MAX); };
  const stmt = (st, w, h, depth, ctx) => {
    const base = { mult: ctx.mult, par: ctx.par || 1, pg: ctx.pg, pi: ctx.pi };
    switch (st.t) {
      case 'call': {
        if (depth > 12) return [{ steps: [], dec: [], p: 1, term: null }];
        const inner = expandHandler(st.w, st.h, depth + 1, ctx);
        return inner.map(r => ({ steps: [Object.assign({ k: 'call', from: w, w: st.w, h: st.h, line: st.line }, base)].concat(r.steps, [Object.assign({ k: 'ret', w: st.w, to: w }, base)]), dec: r.dec, p: r.p, term: r.term === 'error' ? 'error' : null }));
      }
      case 'data': return [{ steps: [Object.assign({ k: 'data', w, d: st.data, op: st.op, by: st.by, rows: st.rows, line: st.line }, base)], dec: [], p: 1, term: null }];
      case 'publish': return [{ steps: [Object.assign({ k: 'publish', w, d: st.data, line: st.line }, base)], dec: [], p: 1, term: null }];
      case 'compute': return [{ steps: [Object.assign({ k: 'compute', w, ms: st.ms, line: st.line }, base)], dec: [], p: 1, term: null }];
      case 'error': return [{ steps: [Object.assign({ k: 'error', w, code: st.code, line: st.line }, base)], dec: [], p: 1, term: 'error' }];
      case 'return': return [{ steps: [], dec: [], p: 1, term: 'return' }];
      case 'if': {
        const key = condKey(w, h, st.cond);
        let p = odds && odds[key] != null ? odds[key] : (st.p != null ? st.p : 0.5);
        if (ctx.mult !== 1 || ctx.inLoop) { // inside loops: follow the likelier branch only (averaged)
          const body = p >= 0.5 ? st.then : (st.else || []);
          return seq(body, w, h, depth, ctx, [{ steps: [], dec: [], p: 1, term: null }]).slice(0, 1).map(r => Object.assign(r, { p: 1 }));
        }
        const a = seq(st.then, w, h, depth, ctx, [{ steps: [], dec: [[key, true, st.cond, w]], p, term: null }]);
        const b = seq(st.else || [], w, h, depth, ctx, [{ steps: [], dec: [[key, false, st.cond, w]], p: 1 - p, term: null }]);
        return a.concat(b).filter(x => x.p > 0);
      }
      case 'loop': {
        const isFile = st.src.toLowerCase() === 'file';
        const n = isFile ? (opts.fileRows || 1) : (st.n || 1);
        const c2 = { mult: ctx.mult * n, par: (ctx.par || 1) * Math.max(1, st.par || 1), pg: ctx.pg, pi: ctx.pi, inLoop: true, isFileLoop: isFile || ctx.isFileLoop };
        const r = seq(st.body, w, h, depth, c2, [{ steps: [], dec: [], p: 1, term: null }])[0] || { steps: [] };
        r.steps.forEach(s => { s.loop = { n, par: st.par, file: isFile, line: st.line }; });
        return [{ steps: r.steps, dec: [], p: 1, term: null }];
      }
      case 'par': {
        const g = ++gid; let outs = [{ steps: [], dec: [], p: 1, term: null }];
        st.body.forEach((child, i) => {
          const c2 = Object.assign({}, ctx, { pg: g, pi: i });
          const alts = stmt(child, w, h, depth, c2);
          const nx = []; outs.forEach(o => alts.forEach(al => nx.push({ steps: o.steps.concat(al.steps), dec: o.dec.concat(al.dec), p: o.p * al.p, term: o.term || al.term })));
          outs = prune(nx);
        });
        return outs;
      }
    }
    return [{ steps: [], dec: [], p: 1, term: null }];
  };
  const res = expandHandler(wn, hn, 0, { mult: 1, pg: 0, pi: 0 });
  const tot = res.reduce((s, r) => s + r.p, 0) || 1;
  return res.map((r, i) => ({ id: entryKey + '#' + i, steps: r.steps, dec: r.dec, p: r.p / tot, outcome: r.term === 'error' ? 'error' : 'ok', label: pathLabel(r) })).sort((a, b) => b.p - a.p);
}
function pathLabel(r) {
  const errStep = r.steps.find(s => s.k === 'error');
  const yes = r.dec.filter(d => d[1]).map(d => humanCond(d[2]));
  let t = yes.length ? yes.join(', ') : (r.dec.length ? 'Main path' : 'Only path');
  if (errStep) t += ` → error ${errStep.code}`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function humanCond(c) { return c.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(); }
// conditions reachable from an entry (for odds editing)
function conditionsFor(A, entryKey) {
  const out = []; const seen = new Set();
  const go = (w, h, depth) => {
    const H = A.W[w] && A.W[w].handlers[h]; if (!H || depth > 12) return;
    const walk = body => body.forEach(st => {
      if (st.t === 'if') { const k = condKey(w, h, st.cond); if (!seen.has(k)) { seen.add(k); out.push({ key: k, cond: st.cond, w, h, def: st.p != null ? st.p : 0.5, line: st.line }); } walk(st.then); if (st.else) walk(st.else); }
      else if (st.t === 'call') go(st.w, st.h, depth + 1);
      else if (st.t === 'loop' || st.t === 'par') walk(st.body);
    });
    walk(H.body);
  };
  const [w, h] = entryKey.split('.'); go(w, h, 0); return out;
}
if (typeof module !== 'undefined') module.exports = { parseCode, analyzeBuild, enumeratePaths, conditionsFor, highlightCode, DATA_KINDS };
