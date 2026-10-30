/* ===================== Infrastructure catalog ===================== */
const REGIONS = {
  use1: { code: 'us-east-1', city: 'N. Virginia', lat: 38.9, lon: -77.4 },
  usw2: { code: 'us-west-2', city: 'Oregon', lat: 45.8, lon: -119.7 },
  sae1: { code: 'sa-east-1', city: 'São Paulo', lat: -23.5, lon: -46.6 },
  euw1: { code: 'eu-west-1', city: 'Ireland', lat: 53.3, lon: -6.3 },
  euc1: { code: 'eu-central-1', city: 'Frankfurt', lat: 50.1, lon: 8.7 },
  aps1: { code: 'ap-south-1', city: 'Mumbai', lat: 19.1, lon: 72.9 },
  apse1: { code: 'ap-southeast-1', city: 'Singapore', lat: 1.35, lon: 103.8 },
  apne1: { code: 'ap-northeast-1', city: 'Tokyo', lat: 35.7, lon: 139.7 }
};
const POPS = {
  na: { label: 'North America', lat: 40, lon: -95 },
  latam: { label: 'Latin America', lat: -15, lon: -55 },
  eu: { label: 'Europe', lat: 50, lon: 10 },
  india: { label: 'South Asia', lat: 22, lon: 78 },
  asia: { label: 'East & Southeast Asia', lat: 22, lon: 114 },
  oceania: { label: 'Oceania', lat: -28, lon: 140 }
};
function distKm(a, b) {
  const R = 6371, t = Math.PI / 180; const dLat = (b.lat - a.lat) * t, dLon = (b.lon - a.lon) * t;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// Round trip: light in fiber (~200 km/ms) with a 1.35 routing factor, plus 4 ms. Approximate.
const _rtt = {};
function rtt(a, b) { if (!a || !b || a === b) return 0; const k = a < b ? a + b : b + a; if (_rtt[k] == null) _rtt[k] = Math.round(2 * distKm(REGIONS[a], REGIONS[b]) / 200 * 1.35 + 4); return _rtt[k]; }
function popRtt(p, r) { return Math.round(2 * distKm(POPS[p], REGIONS[r]) / 200 * 1.35 + 12); } // +last mile
function nearestRegion(regs, from) { if (!regs || !regs.length) return null; return regs.reduce((b, r) => rtt(from, r) < rtt(from, b) ? r : b); }
function nearestForPop(regs, p) { if (!regs || !regs.length) return null; return regs.reduce((b, r) => popRtt(p, r) < popRtt(p, b) ? r : b); }

const COMPUTE = {
  k8s: { label: 'Kubernetes cluster', short: 'Kubernetes', net: 'vpc', sizes: { Small: 1, Medium: 2, Large: 4 }, usd: 0.048, pool: 10, def: { size: 'Medium', min: 3, max: 60 }, scaleLag: 'minutes', note: 'Pods scale in seconds; new machines take a few minutes. Private network by default.' },
  vm: { label: 'VM group', short: 'VMs', net: 'vpc', sizes: { Small: 2, Medium: 4, Large: 8 }, usd: 0.045, pool: 20, def: { size: 'Medium', min: 2, max: 20 }, note: 'Long-lived machines. Slowest to scale; cheapest for flat load.' },
  fn: { label: 'Functions', short: 'Functions', net: 'public', usd: 0, pool: 1, maxDurMs: 900000, def: { concurrency: 1000, memory: 1024, vpc: false }, note: 'Scales per request up to a concurrency limit. Each run is capped at 15 minutes. Cold starts add ~250 ms.' },
  ctr: { label: 'Containers (scale to zero)', short: 'Containers', net: 'public', sizes: { Small: 1, Medium: 2, Large: 4 }, usd: 0.06, pool: 5, def: { size: 'Small', min: 0, max: 100, vpc: false }, note: 'Request-driven containers that cost nothing when idle. The first request after idle waits for a cold start.' }
};
const STORES = {
  postgres: { label: 'PostgreSQL', kinds: ['table'], fits: { kv: 'Works as a two-column table. A key-value store is faster and cheaper per lookup.', document: 'Works using JSON columns (jsonb). Queries inside documents need their own indexes.', queue: 'Works as a jobs table that workers poll (SELECT … FOR UPDATE SKIP LOCKED). Polling adds load and a little delay.' }, net: 'vpc', repl: ['single', 'read-replicas'], shards: true, read: [1.2, 6], write: [3, 15], cap: { Small: 8000, Medium: 20000, Large: 50000 }, conn: { Small: 200, Medium: 500, Large: 1000 }, usd: { Small: 0.5, Medium: 1.2, Large: 3 } },
  distsql: { label: 'Distributed SQL', kinds: ['table'], fits: { kv: 'Works as a two-column table.', document: 'Works using JSON columns.' }, net: 'public', repl: ['consensus'], autoShard: true, read: [2, 9], write: [5, 20], cap: { Small: 15000, Medium: 30000, Large: 60000 }, usd: { Small: 1.5, Medium: 3, Large: 6 }, note: 'Spanner or CockroachDB style. Splits data into ranges by key automatically. Writes wait for a majority of regions to agree.' },
  kv: { label: 'Key-value (serverless)', kinds: ['kv', 'document'], fits: { table: 'Works if rows are looked up by key. Other lookups need secondary indexes (extra cost per write) or full scans.' }, net: 'public', repl: ['single', 'multi-primary'], autoShard: true, read: [3, 10], write: [5, 16], cap: null, perM: [0.25, 1.25], note: 'DynamoDB style. Partitions by key automatically. Scales without sizing; you pay per request.' },
  doc: { label: 'Document database', kinds: ['document', 'kv'], fits: { table: 'Works, but references between collections aren’t enforced and joins happen in your code.' }, net: 'vpc', repl: ['single', 'read-replicas'], shards: true, read: [2, 10], write: [4, 18], cap: { Small: 8000, Medium: 22000, Large: 55000 }, conn: { Small: 500, Medium: 1500, Large: 3000 }, usd: { Small: 0.6, Medium: 1.4, Large: 3.2 }, note: 'MongoDB style.' },
  redis: { label: 'In-memory (Redis)', kinds: ['kv'], fits: { table: 'Works with hashes, but only key lookups are fast and there’s no query language.', document: 'Works as JSON values. Everything is held in memory, so large data gets expensive.', queue: 'Works with Redis lists. Messages can be lost if a node fails.', stream: 'Works with Redis Streams. Less durable than Kafka.' }, net: 'vpc', repl: ['single', 'read-replicas'], shards: true, read: [0.4, 2], write: [0.5, 2.5], cap: { Small: 60000, Medium: 150000, Large: 400000 }, usd: { Small: 0.2, Medium: 0.5, Large: 1.3 }, note: 'Very fast, held in memory. Data can be lost on failure.' },
  kafka: { label: 'Event stream (Kafka)', kinds: ['stream', 'topic', 'queue'], fits: {}, net: 'vpc', repl: ['single'], pub: [3, 12], read: [3, 12], write: [3, 12], partitions: true, usd: { Small: 0.6, Medium: 1.5, Large: 3.5 }, note: 'Ordered log split into partitions. A cluster lives in one region.' },
  queue: { label: 'Queue (SQS style)', kinds: ['queue'], fits: { stream: 'Works, but order isn’t kept and messages can’t be replayed.' }, net: 'public', repl: ['single'], pub: [8, 30], read: [8, 30], write: [8, 30], perM: [0.4, 0.4], note: 'Regional service. Each message goes to one consumer at least once.' },
  pubsub: { label: 'Pub/sub (SNS style)', kinds: ['topic'], fits: { queue: 'Works with one subscriber, but there’s no retry backlog to work through.' }, net: 'public', repl: ['single'], pub: [10, 40], read: [10, 40], write: [10, 40], perM: [0.5, 0.5], note: 'Regional service. Copies each message to every subscriber.' },
  objects: { label: 'Object storage', kinds: ['file', 'blob'], fits: { document: 'Works as one object per document. Each read takes tens of ms and there are no queries.' }, net: 'public', repl: ['single', 'crr'], read: [15, 60], write: [25, 90], cap: null, perM: [0.4, 5], note: 'S3 style. Regional, with optional copies to other regions.' }
};
// how well a store holds a kind of data: 'native', 'works' (with a note) or 'no'
function storeFit(type, kind) { const T = STORES[type]; if (!T) return { fit: 'no' }; if (T.kinds.includes(kind)) return { fit: 'native' }; if (T.fits && T.fits[kind]) return { fit: 'works', note: T.fits[kind] }; return { fit: 'no' }; }
const NET = {
  entry: { lb: { label: 'Load balancer', short: 'LB', ms: 1, note: 'Spreads requests across your compute. Adds about 1 ms.' }, apigw: { label: 'API gateway', short: 'API GW', ms: 6, note: 'Adds auth, request limits and routing. Adds about 6 ms and rejects requests over its limit.' }, none: { label: 'No public entry', short: 'none', ms: 0, note: 'Nothing outside can reach compute on the private network.' } },
  nat: { ms: 2, usd: 0.045, cap: 50000, note: 'Lets private compute reach the internet and public cloud services. Adds about 2 ms.' },
  endpoints: { ms: 0.3, usd: 0.01, note: 'Private links to the provider’s managed services (key-value, queues, object storage) without leaving the private network.' },
  link: { peering: { label: 'Network peering', ms: 0, usd: 0.01, note: 'Direct links between each pair of region networks.' }, transit: { label: 'Transit hub', ms: 1, usd: 0.02, note: 'All regions join one hub. Easier to manage; adds about 1 ms per hop.' } },
  steering: { nearest: { label: 'Nearest region', note: 'DNS sends each user to the closest region that runs the entry workload.' }, primary: { label: 'One region only', note: 'Every user goes to the first region, wherever they are. Other regions only serve internal work.' } }
};
function netRegion(Dp, r) { const n = Dp.network || {}; return (n.regions && n.regions[r]) || { entry: 'lb', limit: 10000, nat: true, endpoints: false }; }
function normalizeDeploy(Dp) {
  if (!Dp) return Dp;
  Dp.network = Dp.network || {}; const N = Dp.network;
  N.link = N.link || 'peering'; N.steering = N.steering || 'nearest'; N.regions = N.regions || {};
  Dp.regions.forEach(r => { N.regions[r] = Object.assign({ entry: 'lb', limit: 10000, nat: true, endpoints: false }, N.regions[r] || {}); });
  Dp.stores.forEach(s => { if (s.shards == null) s.shards = 1; s.dataCfg = s.dataCfg || {}; });
  return Dp;
}
const PUBLIC_MANAGED = t => STORES[t].net === 'public';
function partitionKeyOf(S, d) { const c = S && S.dataCfg && S.dataCfg[d.name]; if (c && c.pk) return c.pk; if (d.partitionKey) return d.partitionKey; const k = (d.fields || []).find(f => f.key); return k ? k.name : null; }
function shardCount(S) { const T = STORES[S.type]; return T.shards ? Math.max(1, S.shards || 1) : 1; }

const REPL = {
  single: { label: 'One region', short: 'one region' },
  'read-replicas': { label: 'Primary + read copies', short: 'read copies' },
  'multi-primary': { label: 'Writable in every region', short: 'multi-region writes' },
  consensus: { label: 'Majority vote across regions', short: 'consensus' },
  crr: { label: 'Primary + copies', short: 'copies' }
};

function uid(p) { return (p || 'x') + Math.random().toString(36).slice(2, 8); }
function storeTarget(S, op, cur) {
  const regs = S.regions; const write = op !== 'read';
  if (!regs.length) return null;
  switch (S.repl) {
    case 'single': return regs[0];
    case 'read-replicas': case 'crr':
      if (!write && S.readFrom !== 'primary') return regs.includes(cur) ? cur : nearestRegion(regs, cur);
      return regs.includes(S.primary) ? S.primary : regs[0];
    case 'multi-primary': return regs.includes(cur) ? cur : nearestRegion(regs, cur);
    case 'consensus': if (!write && S.readFrom !== 'primary') return regs.includes(cur) ? cur : nearestRegion(regs, cur); return regs.includes(S.primary) ? S.primary : regs[0];
  }
  return regs[0];
}
function quorumRtt(S) {
  if (S.repl !== 'consensus' || S.regions.length < 2) return 0;
  const lead = S.regions.includes(S.primary) ? S.primary : S.regions[0];
  const others = S.regions.filter(r => r !== lead).map(r => rtt(lead, r)).sort((a, b) => a - b);
  const need = Math.floor(S.regions.length / 2); return others[need - 1] || 0;
}
function canUseVpc(C) { return COMPUTE[C.type].net === 'vpc' || !!C.vpc; }

/* ---------- Deploy validation ---------- */
function validateDeploy(B, A, Dp) {
  const P = []; const err = (m, at, fix) => P.push({ sev: 'error', msg: m, at, fix }); const warn = (m, at, fix) => P.push({ sev: 'warn', msg: m, at, fix });
  if (!Dp.regions.length) err('Pick at least one region.', { kind: 'region' });
  const comp = {}, store = {};
  Dp.compute.forEach(c => {
    const bad = c.regions.filter(r => !Dp.regions.includes(r));
    if (bad.length) err(`${c.name} is set to ${bad.map(r => REGIONS[r].code).join(', ')}, which isn’t one of your regions.`, { kind: 'compute', id: c.id }, { label: 'Remove those regions', apply: d => { const x = d.compute.find(y => y.id === c.id); x.regions = x.regions.filter(r => d.regions.includes(r)); } });
    if (!c.regions.length) err(`${c.name} doesn’t run in any region.`, { kind: 'compute', id: c.id }, { label: 'Run it in every region', apply: d => { d.compute.find(y => y.id === c.id).regions = d.regions.slice(); } });
    c.workloads.forEach(w => {
      if (!A.W[w]) warn(`${c.name} lists ${w}, which isn’t in this Build.`, { kind: 'compute', id: c.id }, { label: `Remove ${w}`, apply: d => { const x = d.compute.find(y => y.id === c.id); x.workloads = x.workloads.filter(z => z !== w); } });
      else if (comp[w]) err(`${w} is placed on both ${comp[w].name} and ${c.name}. Pick one.`, { kind: 'workload', id: w });
      else comp[w] = c;
    });
  });
  Dp.stores.forEach(s => {
    const T = STORES[s.type];
    const bad = s.regions.filter(r => !Dp.regions.includes(r));
    if (bad.length) err(`${s.name} is set to ${bad.map(r => REGIONS[r].code).join(', ')}, which isn’t one of your regions.`, { kind: 'store', id: s.id }, { label: 'Remove those regions', apply: d => { const x = d.stores.find(y => y.id === s.id); x.regions = x.regions.filter(r => d.regions.includes(r)); if (!x.regions.includes(x.primary)) x.primary = x.regions[0]; } });
    if (!s.regions.length) err(`${s.name} isn’t in any region.`, { kind: 'store', id: s.id }, { label: `Put it in ${REGIONS[Dp.regions[0]] ? REGIONS[Dp.regions[0]].code : 'a region'}`, apply: d => { const x = d.stores.find(y => y.id === s.id); x.regions = [d.regions[0]]; x.primary = d.regions[0]; } });
    if (!T.repl.includes(s.repl)) err(`${T.label} doesn’t support “${REPL[s.repl].label}”.`, { kind: 'store', id: s.id }, { label: `Use “${REPL[T.repl[0]].label}”`, apply: d => { d.stores.find(y => y.id === s.id).repl = T.repl[0]; } });
    if (s.repl === 'single' && s.regions.length > 1) err(`${s.name} (${T.label}) lives in one region but is set to ${s.regions.length}. ${T.repl.length > 1 ? `Turn on “${REPL[T.repl[1]].label}” or remove regions.` : 'This product is regional: use one region per copy.'}`, { kind: 'store', id: s.id },
      T.repl.length > 1 ? { label: `Use “${REPL[T.repl[1]].label}”`, apply: d => { d.stores.find(y => y.id === s.id).repl = T.repl[1]; } } : { label: `Keep only ${REGIONS[s.primary] ? REGIONS[s.primary].code : 'the first region'}`, apply: d => { const x = d.stores.find(y => y.id === s.id); x.regions = [x.regions.includes(x.primary) ? x.primary : x.regions[0]]; x.primary = x.regions[0]; } });
    if (s.repl !== 'single' && s.repl !== 'multi-primary' && s.regions.length && !s.regions.includes(s.primary)) err(`${s.name}’s primary region isn’t one of its regions.`, { kind: 'store', id: s.id }, { label: 'Use the first region as primary', apply: d => { const x = d.stores.find(y => y.id === s.id); x.primary = x.regions[0]; } });
    if (s.repl === 'consensus' && s.regions.length > 0 && s.regions.length < 3) warn(`${s.name} uses majority vote across ${s.regions.length} region${s.regions.length > 1 ? 's' : ''}. It needs 3 to keep working if a region fails.`, { kind: 'store', id: s.id });
    s.data.forEach(dn => {
      const d = A.D[dn];
      if (!d) { warn(`${s.name} lists ${dn}, which isn’t in this Build.`, { kind: 'store', id: s.id }, { label: `Remove ${dn}`, apply: x => { const y = x.stores.find(z => z.id === s.id); y.data = y.data.filter(q => q !== dn); } }); return; }
      if (store[dn]) { err(`${dn} is stored in both ${store[dn].name} and ${s.name}. Pick one.`, { kind: 'data', id: dn }); return; }
      store[dn] = s;
      const F = storeFit(s.type, d.kind);
      if (F.fit === 'no') err(`${s.name} (${T.label}) can’t hold ${dn}, which is ${DATA_KINDS[d.kind].label.toLowerCase()}.`, { kind: 'store', id: s.id });
      else if (F.fit === 'works') warn(`${dn} (${DATA_KINDS[d.kind].label.toLowerCase()}) in ${s.name}: ${F.note}`, { kind: 'store', id: s.id });
      // sharding: lookups that don't use the shard key ask every shard
      const n = shardCount(s); if (n > 1) { const pk = partitionKeyOf(s, d); const fl = (d.fields || []).find(f => f.name === pk); if (pk && !fl) warn(`${s.name} splits ${dn} by “${pk}”, which isn’t a field of ${dn}.`, { kind: 'store', id: s.id }); }
    });
  });
  // everything placed
  B.workloads.forEach(w => {
    if (w.external) return;
    if (!comp[w.name]) err(`${w.name} isn’t running anywhere. Place it on compute.`, { kind: 'workload', id: w.name }, { label: 'Place automatically', apply: d => autoPlace(B, A, d) });
  });
  B.data.forEach(d => { if (!store[d.name]) err(`${d.name} isn’t stored anywhere. Place it in a store.`, { kind: 'data', id: d.name }, { label: 'Place automatically', apply: x => autoPlace(B, A, x) }); });
  // reachability
  const seen = new Set();
  const peerFix = { label: 'Connect the region networks', apply: d => { d.peering = true; } };
  const vpcFix = C => ({ label: `Give ${C.name} private network access`, apply: d => { d.compute.find(y => y.id === C.id).vpc = true; } });
  A.calls.forEach(c => {
    const W2 = A.W[c.to]; if (!W2 || W2.node.external) return;
    const C1 = comp[c.from], C2 = comp[c.to]; if (!C1 || !C2 || C1 === C2) return;
    C1.regions.forEach(r => {
      const k = 'call|' + C1.id + '|' + C2.id + '|' + r; if (seen.has(k)) return; seen.add(k);
      const local = C2.regions.includes(r); const r2 = local ? r : nearestRegion(C2.regions, r);
      if (!r2) return;
      if (COMPUTE[C2.type].net === 'vpc' && !canUseVpc(C1)) err(`${c.from} on ${C1.name} can’t reach ${c.to} on ${C2.name}: ${C2.name} is on a private network.`, { kind: 'compute', id: C1.id }, vpcFix(C1));
      else if (!local && COMPUTE[C2.type].net === 'vpc' && !Dp.peering) err(`${c.from} in ${REGIONS[r].code} can’t reach ${c.to}, which only runs in ${REGIONS[r2].code}: the region networks aren’t connected.`, { kind: 'compute', id: C1.id }, peerFix);
      else if (!local) warn(`${c.from} in ${REGIONS[r].code} calls ${c.to} in ${REGIONS[r2].code}, about ${rtt(r, r2)} ms away.`, { kind: 'compute', id: C1.id });
    });
  });
  const dataUse = (wn, dn, ops) => {
    const C = comp[wn], S = store[dn]; if (!C || !S || !S.regions.length) return;
    C.regions.forEach(r => ops.forEach(op => {
      const k = 'data|' + C.id + '|' + S.id + '|' + r + '|' + (op === 'read' ? 'r' : 'w'); if (seen.has(k)) return; seen.add(k);
      const t = storeTarget(S, op, r); if (!t) return;
      if (STORES[S.type].net === 'vpc' && !canUseVpc(C)) err(`${wn} on ${C.name} can’t reach ${dn} in ${S.name}: it’s on a private network.`, { kind: 'compute', id: C.id }, vpcFix(C));
      else if (t !== r && STORES[S.type].net === 'vpc' && !Dp.peering) err(`${wn} in ${REGIONS[r].code} can’t ${op === 'read' ? 'read' : 'write'} ${dn}: ${S.name} ${op === 'read' ? 'has no copy' : 'takes writes only'} in ${REGIONS[t].code}, and the region networks aren’t connected.`, { kind: 'compute', id: C.id }, peerFix);
    }));
  };
  A.dataOps.forEach(o => dataUse(o.w, o.d, o.ops.map(x => x === 'publish' ? 'insert' : x)));
  A.triggers.forEach(t => dataUse(t.w, t.d, ['read']));
  // cross-store references
  A.refs.forEach(r => { const a = store[r.from], b = store[r.to]; const tk = k => k === 'table' || k === 'kv'; if (a && b && a !== b && tk(A.D[r.from].kind) && tk(A.D[r.to].kind)) warn(`${r.from}.${r.field} points to ${r.to}, but they’re in different stores (${a.name}, ${b.name}). Nothing checks that the ${r.to} row exists.`, { kind: 'store', id: a.id }); });
  // functions doing big file work
  A.entries.filter(e => e.type === 'file' || e.type === 'schedule').forEach(e => { const C = comp[e.w]; if (C && C.type === 'fn') warn(`${e.w} runs on Functions, which stop after 15 minutes. Check the run time in Simulate.`, { kind: 'compute', id: C.id }); });
  // network products
  normalizeDeploy(Dp);
  const N = Dp.network;
  const entryFix = (r, kind) => ({ label: `Add a ${NET.entry[kind].label.toLowerCase()} in ${REGIONS[r].code}`, apply: d => { normalizeDeploy(d); d.network.regions[r].entry = kind; } });
  const natFix = r => ({ label: `Add a NAT gateway in ${REGIONS[r].code}`, apply: d => { normalizeDeploy(d); d.network.regions[r].nat = true; } });
  const epFix = r => ({ label: `Add private endpoints in ${REGIONS[r].code}`, apply: d => { normalizeDeploy(d); d.network.regions[r].endpoints = true; } });
  const entrySeen = new Set();
  A.entries.filter(e => e.type === 'request').forEach(e => {
    const C = comp[e.w]; if (!C) return;
    const regs = N.steering === 'primary' ? [C.regions.includes(Dp.regions[0]) ? Dp.regions[0] : C.regions[0]] : C.regions;
    regs.forEach(r => { if (!r || entrySeen.has(C.id + r)) return; entrySeen.add(C.id + r);
      if (COMPUTE[C.type].net === 'vpc' && netRegion(Dp, r).entry === 'none') err(`Users can’t reach ${e.w} in ${REGIONS[r].code}: ${C.name} is on the private network and the region has no load balancer or API gateway.`, { kind: 'region', id: r }, entryFix(r, 'lb'));
    });
  });
  if (N.steering === 'primary') A.entries.filter(e => e.type === 'request').forEach(e => { const C = comp[e.w]; if (C && !C.regions.includes(Dp.regions[0])) warn(`Traffic goes to ${REGIONS[Dp.regions[0]].code} only, but ${e.w} doesn’t run there; users go to ${REGIONS[C.regions[0]].code} instead.`, { kind: 'region', id: Dp.regions[0] }); });
  const outSeen = new Set();
  const privOut = (C, r, what, managed) => { // private compute reaching something public
    if (!canUseVpc(C) || (C.type === 'fn' && !C.vpc) || (C.type === 'ctr' && !C.vpc)) return;
    const R = netRegion(Dp, r); const k = C.id + r + (managed ? 'm' : 'x'); if (outSeen.has(k)) return; outSeen.add(k);
    if (managed ? !(R.nat || R.endpoints) : !R.nat) err(`${C.name} in ${REGIONS[r].code} can’t reach ${what}: private compute needs a NAT gateway${managed ? ' or private endpoints' : ''} to leave the private network.`, { kind: 'region', id: r }, managed ? epFix(r) : natFix(r));
  };
  A.calls.forEach(c => { const W2 = A.W[c.to]; if (!W2 || !W2.node.external) return; const C1 = comp[c.from]; if (C1) C1.regions.forEach(r => privOut(C1, r, `${c.to} (outside your system)`, false)); });
  A.dataOps.forEach(o => { const C = comp[o.w], S = store[o.d]; if (C && S && PUBLIC_MANAGED(S.type)) C.regions.forEach(r => privOut(C, r, `${S.name}`, true)); });
  A.triggers.forEach(t => { const C = comp[t.w], S = store[t.d]; if (C && S && PUBLIC_MANAGED(S.type)) C.regions.forEach(r => privOut(C, r, `${S.name}`, true)); });
  // scatter-gather reads on sharded stores
  const sgSeen = new Set();
  Object.values(A.W).forEach(W => Object.values(W.handlers).forEach(H => { const walk = b => b.forEach(st => { if (st.t === 'data' && st.op === 'read' && st.by) { const S = store[st.data], d = A.D[st.data]; if (S && d && shardCount(S) > 1) { const pk = partitionKeyOf(S, d); const k = S.id + st.data + st.by; if (pk && st.by !== pk && !sgSeen.has(k)) { sgSeen.add(k); warn(`${W.node.name}.${H.name} reads ${st.data} by ${st.by}, but ${S.name} splits it by ${pk}. Each read asks all ${shardCount(S)} shards.`, { kind: 'store', id: S.id }, { label: `Split ${st.data} by ${st.by}`, apply: d2 => { const x = d2.stores.find(y => y.id === S.id); x.dataCfg = x.dataCfg || {}; x.dataCfg[st.data] = { pk: st.by }; } }); } } } ['then', 'else', 'body'].forEach(f => { if (Array.isArray(st[f])) walk(st[f]); }); }); walk(H.body); }));
  const errors = P.filter(p => p.sev === 'error').length;
  return { problems: P, errors, warnings: P.length - errors, valid: errors === 0 && B.workloads.length > 0, comp, store };
}

function defaultStoreFor(kind) { return { table: 'postgres', document: 'doc', kv: 'redis', queue: 'queue', stream: 'kafka', topic: 'pubsub', file: 'objects', blob: 'objects' }[kind]; }
function newCompute(Dp, type, name) {
  const T = COMPUTE[type]; const c = Object.assign({ id: uid('c'), name: name || ({ k8s: 'cluster', vm: 'vms', fn: 'functions', ctr: 'containers' })[type], type, regions: Dp.regions.slice(), workloads: [] }, JSON.parse(JSON.stringify(T.def)));
  let n = c.name, i = 1; while (Dp.compute.some(x => x.name === n)) n = c.name + '-' + (++i); c.name = n; return c;
}
function newStore(Dp, type, name) {
  const T = STORES[type]; const r0 = Dp.regions[0];
  const s = { id: uid('s'), name: name || ({ postgres: 'postgres', distsql: 'dist-sql', kv: 'kv-store', doc: 'docdb', redis: 'redis', kafka: 'kafka', queue: 'queue', pubsub: 'topics', objects: 'objects' })[type], type, regions: T.repl.includes('single') ? [r0] : Dp.regions.slice(), primary: r0, repl: T.repl.includes('single') ? 'single' : T.repl[0], readFrom: 'nearest', size: 'Medium', partitions: 12, shards: 1, dataCfg: {}, data: [] };
  let n = s.name, i = 1; while (Dp.stores.some(x => x.name === n)) n = s.name + '-' + (++i); s.name = n; return s;
}
function autoPlace(B, A, Dp) {
  if (!Dp.regions.length) Dp.regions.push('use1');
  const placedW = new Set(); Dp.compute.forEach(c => c.workloads.forEach(w => placedW.add(w)));
  const unW = B.workloads.filter(w => !w.external && !placedW.has(w.name));
  if (unW.length) { let c = Dp.compute.find(x => x.type === 'k8s'); if (!c) { c = newCompute(Dp, 'k8s', 'app-cluster'); Dp.compute.push(c); } unW.forEach(w => c.workloads.push(w.name)); }
  const placedD = new Set(); Dp.stores.forEach(s => s.data.forEach(d => placedD.add(d)));
  B.data.filter(d => !placedD.has(d.name)).forEach(d => {
    let s = Dp.stores.find(x => STORES[x.type].kinds.includes(d.kind) && x.type === defaultStoreFor(d.kind)) || Dp.stores.find(x => STORES[x.type].kinds.includes(d.kind));
    if (!s) { s = newStore(Dp, defaultStoreFor(d.kind)); Dp.stores.push(s); }
    s.data.push(d.name);
  });
}
if (typeof module !== 'undefined') module.exports = { NET, storeFit, normalizeDeploy, netRegion, partitionKeyOf, shardCount, REGIONS, POPS, COMPUTE, STORES, REPL, rtt, popRtt, nearestRegion, nearestForPop, storeTarget, quorumRtt, validateDeploy, autoPlace, newCompute, newStore, uid, canUseVpc };
