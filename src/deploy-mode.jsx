import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GLOSSARY, REPL_NOTES } from './examples-meta.js';
import { WorldMap, ViewToggle, useCanvasView } from './world-map.jsx';
import { InfraCanvas, Legend, resourceFor, startDrag, endDrag } from './infra-canvas.jsx';

const E = window.Loadbearing;
const shortType = (type) => type === 'kv' ? 'Key-value' : type[0].toUpperCase() + type.slice(1);

function DragItem({ payload, icon, label, description, onClick, testId }) {
  return (
    <button type="button" className="palette-item" draggable data-palette={testId} onClick={onClick} onDragStart={(event) => startDrag(event, payload)} onDragEnd={endDrag}>
      <span className="palette-icon infra-color" aria-hidden="true">{icon}</span>
      <span className="palette-text"><strong>{label}</strong><small>{description}</small></span>
      <span className="drag-grip" aria-hidden="true">⠿</span>
    </button>
  );
}

function Placement({ items, placedOn, kind, onPlace }) {
  return items.map((item) => {
    const home = placedOn[item.name];
    return (
      <div
        className={`tray-item ${home ? 'placed' : 'unplaced'}`}
        key={item.id}
        draggable
        data-tray={`${kind}:${item.name}`}
        onDragStart={(event) => startDrag(event, { type: kind, name: item.name })}
        onDragEnd={endDrag}
      >
        <span className={`palette-icon ${kind === 'workload' ? 'workload-color' : 'data-color'}`} aria-hidden="true">{kind === 'workload' ? 'ƒ' : '▤'}</span>
        <span className="palette-text"><strong>{item.name}</strong><small>{home ? `${kind === 'workload' ? 'Runs on' : 'Stored in'} ${home}` : 'Not placed yet · drag onto the canvas'}</small></span>
        {!home && onPlace && <button type="button" className="text-button" onClick={() => onPlace(item)}>Place</button>}
      </div>
    );
  });
}

export function DeployMode({ build, analysis, deploy, check, updateDeploy, focusKey = null }) {
  const [selectedKey, setSelectedKey] = useState(focusKey);
  const [notice, setNotice] = useState('');
  const pendingSelect = useRef(null);
  useEffect(() => { if (pendingSelect.current) { setSelectedKey(pendingSelect.current); pendingSelect.current = null; } }, [deploy]);
  const graph = useMemo(() => E.deployGraph(build, analysis, deploy), [build, analysis, deploy]);
  const selected = selectedKey ? graph.byKey[selectedKey] : null;
  const placedWorkloads = Object.fromEntries(deploy.compute.flatMap((item) => item.workloads.map((name) => [name, item.name])));
  const placedData = Object.fromEntries(deploy.stores.flatMap((item) => item.data.map((name) => [name, item.name])));

  const problemsByNode = useMemo(() => {
    const map = {};
    const add = (key, problem) => { (map[key] = map[key] || []).push(problem); };
    (check?.problems || []).forEach((problem) => {
      const at = problem.at || {};
      graph.nodes.forEach((node) => {
        if ((at.kind === 'compute' && node.kind === 'compute' && node.id === at.id) || (at.kind === 'store' && node.kind === 'store' && node.id === at.id) || (at.kind === 'region' && node.kind === 'entry' && node.region === at.id)) add(node.key, problem);
      });
    });
    return map;
  }, [check, graph]);

  const homeRegion = selected && selected.region !== 'outside' ? selected.region : deploy.regions[0];
  const say = (text) => setNotice(text);
  const [view, setView] = useCanvasView();

  const placeWorkload = (name, computeId) => {
    const target = deploy.compute.find((item) => item.id === computeId);
    updateDeploy((doc) => { E.placeWorkloadOn(doc, name, computeId); });
    if (target) say(`${name} now runs on ${target.name}.`);
  };
  const placeData = (name, storeId) => {
    const store = deploy.stores.find((item) => item.id === storeId);
    const kind = build.data.find((item) => item.name === name)?.kind;
    const fit = E.storeFit(store.type, kind);
    if (fit.fit === 'no') return say(`${store.name} (${E.STORES[store.type].label}) can’t hold ${name}. Pick a store that fits ${E.DATA_KINDS[kind]?.label.toLowerCase() || 'this data'}.`);
    updateDeploy((doc) => { E.placeDataIn(doc, build, name, storeId); });
    say(fit.fit === 'works' ? `${name} is stored in ${store.name}. ${fit.note}` : `${name} is stored in ${store.name}.`);
  };
  const autoPlaceItem = (kind, item) => updateDeploy((doc) => {
    if (kind === 'workload') {
      const compute = doc.compute[0] || E.newCompute(doc, 'k8s', 'app-cluster');
      if (!doc.compute.includes(compute)) doc.compute.push(compute);
      E.placeWorkloadOn(doc, item.name, compute.id);
    } else {
      const stores = doc.stores.filter((store) => E.storeFit(store.type, item.kind).fit !== 'no');
      const store = stores.find((entry) => E.STORES[entry.type].kinds.includes(item.kind)) || stores[0];
      if (store) E.placeDataIn(doc, build, item.name, store.id);
    }
  });

  const dropOnNode = (gnode, payload) => {
    if (gnode.kind === 'compute') {
      if (payload.type === 'workload') placeWorkload(payload.name, gnode.id);
      else say('Data lives in a store. Drop it on a store instead.');
    } else if (gnode.kind === 'store') {
      if (payload.type === 'data') placeData(payload.name, gnode.id);
      else say('Workloads run on compute. Drop it on a compute node instead.');
    }
  };

  const addAt = (payload, regionId) => {
    const region = regionId || homeRegion;
    if (!region) return say('Add a region first.');
    if (payload.type === 'newCompute') updateDeploy((doc) => { const item = E.addInRegion(doc, 'compute', payload.ctype, region); pendingSelect.current = `c:${item.id}@${region}`; });
    else if (payload.type === 'newStore') updateDeploy((doc) => { const item = E.addInRegion(doc, 'stores', payload.stype, region); pendingSelect.current = `s:${item.id}@${region}`; });
    else if (payload.type === 'net') {
      updateDeploy((doc) => { doc.network.regions[region][payload.which] = true; });
      say(`${payload.which === 'nat' ? 'NAT gateway' : 'Private endpoints'} added in ${E.REGIONS[region].code}.`);
    }
  };
  const dropOnRegion = (region, payload) => {
    if (payload.type === 'moveNode') {
      const gnode = graph.byKey[payload.key];
      if (gnode && region && gnode.region !== region.id) moveNode({ gnode, region, position: { x: gnode.x, y: gnode.y } });
      return;
    }
    if (payload.type === 'newCompute' || payload.type === 'newStore' || payload.type === 'net') return addAt(payload, region?.id);
    const kind = payload.type === 'workload' ? 'compute' : 'store';
    const candidates = graph.nodes.filter((node) => node.kind === kind && (!region || node.region === region.id));
    if (candidates.length === 1) return dropOnNode(candidates[0], payload);
    say(candidates.length ? `Drop ${payload.name} directly on the ${kind === 'compute' ? 'compute' : 'store'} node you want.` : `Add ${kind === 'compute' ? 'compute' : 'a store'} first, then drop ${payload.name} on it.`);
  };
  const removeChip = (gnode, name) => updateDeploy((doc) => {
    if (gnode.kind === 'compute') E.placeWorkloadOn(doc, name, null);
    else doc.stores.forEach((store) => { store.data = store.data.filter((item) => item !== name); });
  });
  const moveNode = ({ gnode, region, position }) => {
    if (gnode && gnode.region !== region.id && !['compute', 'store', 'external'].includes(gnode.kind)) {
      say('Network components stay in their own region.');
      return updateDeploy(() => {});
    }
    updateDeploy((doc) => {
      doc.layout = doc.layout || {};
      if (!gnode) { doc.layout[`r:${region.id}`] = position; return; }
      let key = gnode.key;
      if (region.id !== gnode.region) {
        if (gnode.kind === 'external') { doc.externals = doc.externals || {}; doc.externals[gnode.id] = { region: region.id }; }
        else { E.moveToRegion(doc, gnode.kind === 'compute' ? 'compute' : 'stores', gnode.id, gnode.region, region.id); key = `${gnode.kind === 'compute' ? 'c' : 's'}:${gnode.id}@${region.id}`; delete doc.layout[gnode.key]; }
        pendingSelect.current = key;
      }
      doc.layout[key] = position;
    });
    if (gnode && region.id !== gnode.region) say(`${gnode.name} now runs in ${region.code}.`);
  };
  const connect = (sourceKey, targetKey) => {
    const from = graph.byKey[sourceKey], to = graph.byKey[targetKey];
    const src = from && resourceFor(deploy, from), dst = to && resourceFor(deploy, to);
    if (!src || !dst || from.kind !== 'compute') return say('Connect compute to the compute or store it needs. Which calls happen comes from your Build’s code.');
    const net = to.kind === 'store' ? E.STORES[dst.type].net : E.COMPUTE[dst.type].net;
    if (net === 'vpc' && !E.canUseVpc(src)) {
      updateDeploy((doc) => { doc.compute.find((item) => item.id === src.id).vpc = true; });
      return say(`${src.name} joined the private network so it can reach ${dst.name}.`);
    }
    if (from.region !== to.region && !deploy.peering) {
      updateDeploy((doc) => { doc.peering = true; });
      return say(`Region networks are now connected, so ${src.name} can reach ${dst.name} in ${E.REGIONS[to.region].code}.`);
    }
    say(`${src.name} can already reach ${dst.name}. The wires on the canvas show what your code actually calls.`);
  };
  const toggleRegion = (region) => updateDeploy((doc) => {
    if (doc.regions.includes(region)) E.removeRegion(doc, region);
    else doc.regions.push(region);
    E.normalizeDeploy(doc);
  });
  const autoPlace = () => updateDeploy((doc) => { E.autoPlace(build, E.analyzeBuild(build), doc); });
  const applyFix = (problem) => problem.fix?.apply && updateDeploy((doc) => problem.fix.apply(doc));
  const resetLayout = () => updateDeploy((doc) => { doc.layout = {}; });

  return (
    <section className="workspace deploy-workspace">
      <aside className="sidebar">
        <div className="sidebar-heading"><div><p className="eyebrow">Deploy</p><h1>Map logic to infrastructure</h1></div></div>
        <p className="sidebar-copy">Drag infrastructure onto a region, then drag your workloads and data onto it. Click anything to edit it.</p>
        <div className="palette-section">
          <h2>Regions</h2>
          <div className="region-toggles">{Object.entries(E.REGIONS).map(([id, region]) => (
            <button type="button" key={id} className={`region-toggle ${deploy.regions.includes(id) ? 'on' : ''}`} aria-pressed={deploy.regions.includes(id)} onClick={() => toggleRegion(id)} title={region.city}>{deploy.regions.includes(id) ? '✓ ' : '+ '}{region.code}</button>
          ))}</div>
        </div>
        <div className="palette-section">
          <h2>Compute</h2>
          {Object.entries(E.COMPUTE).map(([type, value]) => <DragItem key={type} testId={`compute:${type}`} icon="⚙" payload={{ type: 'newCompute', ctype: type }} label={value.label} description={value.note.split('.')[0]} onClick={() => addAt({ type: 'newCompute', ctype: type })} />)}
        </div>
        <div className="palette-section">
          <h2>Data stores</h2>
          {Object.entries(E.STORES).map(([type, value]) => <DragItem key={type} testId={`store:${type}`} icon="▤" payload={{ type: 'newStore', stype: type }} label={value.label} description={value.kinds.map(shortType).join(', ')} onClick={() => addAt({ type: 'newStore', stype: type })} />)}
        </div>
        <div className="palette-section">
          <h2>Network</h2>
          <DragItem testId="net:nat" icon="⇄" payload={{ type: 'net', which: 'nat' }} label="NAT gateway" description="Outbound traffic from private compute" onClick={() => addAt({ type: 'net', which: 'nat' })} />
          <DragItem testId="net:endpoints" icon="⌁" payload={{ type: 'net', which: 'endpoints' }} label="Private endpoints" description="Private links to managed services" onClick={() => addAt({ type: 'net', which: 'endpoints' })} />
        </div>
        <div className="palette-section">
          <h2>Workloads from Build</h2>
          <Placement items={build.workloads.filter((item) => !item.external)} placedOn={placedWorkloads} kind="workload" onPlace={(item) => autoPlaceItem('workload', item)} />
          {build.workloads.filter((item) => !item.external).length === 0 && <p className="muted">No workloads yet. Add some in Build.</p>}
        </div>
        <div className="palette-section">
          <h2>Data from Build</h2>
          <Placement items={build.data} placedOn={placedData} kind="data" onPlace={(item) => autoPlaceItem('data', item)} />
          {build.data.length === 0 && <p className="muted">No data nodes yet. Add some in Build.</p>}
        </div>
      </aside>

      <div className="canvas-column">
        <div className="canvas-toolbar">
          <div><strong>{deploy.name}</strong><span>{deploy.regions.length} regions · {deploy.compute.length} compute · {deploy.stores.length} stores</span></div>
          <div className="toolbar-status">
            <ViewToggle view={view} onChange={setView} />
            <button className="button quiet" type="button" onClick={autoPlace}>Auto-place everything</button>
            {view === 'diagram' && <button className="button quiet" type="button" onClick={resetLayout}>Tidy layout</button>}
            <span className={`pill ${check?.valid ? 'success' : 'danger'}`}>{check?.valid ? 'Deployment works' : `${check?.errors || 0} issues`}</span>
          </div>
        </div>
        {notice && <div className="deploy-notice" role="status">{notice}<button type="button" className="text-button" onClick={() => setNotice('')}>Dismiss</button></div>}
        {view === 'map'
          ? <WorldMap
            label="Infrastructure map editor"
            graph={graph} build={build} deploy={deploy} editable
            selectedKey={selectedKey} onSelect={setSelectedKey} problemsByNode={problemsByNode}
            onDropOnNode={dropOnNode} onDropOnRegion={dropOnRegion} onToggleRegion={toggleRegion}
          />
          : <InfraCanvas
            label="Infrastructure editor"
            graph={graph} build={build} deploy={deploy} editable
            selectedKey={selectedKey} onSelect={setSelectedKey} problemsByNode={problemsByNode}
            onDropOnNode={dropOnNode} onDropOnRegion={dropOnRegion} onRemoveChip={removeChip} onMoveNode={moveNode} onConnect={connect}
          />}
        <Legend />
        <section className="problems-panel deploy-checks" aria-label="Deployment checks">
          <div className="card-heading"><div><h2>Deployment checks</h2><p>Issues below can block simulation; fixes update the configuration.</p></div></div>
          {(check?.problems || []).map((problem, index) => <div className={`deploy-problem ${problem.sev}`} key={`${problem.msg}-${index}`}><span>{problem.sev === 'error' ? 'Fix: ' : 'Note: '}{problem.msg}</span>{problem.fix?.apply && <button className="button quiet" type="button" onClick={() => applyFix(problem)}>{problem.fix.label}</button>}</div>)}
          {!check?.problems?.length && <p className="muted">No deployment problems found.</p>}
        </section>
      </div>

      <aside className="inspector" aria-label="Deploy inspector">
        <DeployInspector key={selectedKey || 'global'} build={build} deploy={deploy} gnode={selected} problems={selected ? problemsByNode[selected.key] || [] : []} updateDeploy={updateDeploy} onApplyFix={applyFix} onClear={() => setSelectedKey(null)} />
      </aside>
    </section>
  );
}

function RegionChoices({ selected, options, onToggle }) {
  return <div className="region-options">{options.map((region) => <label key={region}><input type="checkbox" checked={selected.includes(region)} onChange={() => onToggle(region)} />{E.REGIONS[region].code}</label>)}</div>;
}

function NodeProblems({ problems, onApplyFix }) {
  if (!problems.length) return null;
  return <div className="inspector-problems">{problems.map((problem, index) => <div className={`deploy-problem ${problem.sev}`} key={index}><span>{problem.msg}</span>{problem.fix?.apply && <button className="button quiet" type="button" onClick={() => onApplyFix(problem)}>{problem.fix.label}</button>}</div>)}</div>;
}

function DeployInspector({ build, deploy, gnode, problems, updateDeploy, onApplyFix, onClear }) {
  if (!gnode) return <GlobalInspector deploy={deploy} updateDeploy={updateDeploy} />;
  const header = (title, onDelete) => <div className="inspector-header"><div><p className="eyebrow">{gnode.kind === 'compute' ? 'Compute' : gnode.kind === 'store' ? 'Data store' : 'Network'}</p><h2>{title}</h2></div><div>{onDelete && <button className="text-button" type="button" onClick={() => { onDelete(); onClear(); }}>Delete</button>}<button className="text-button" type="button" onClick={onClear}>Done</button></div></div>;
  if (gnode.kind === 'compute') return <><ComputeInspector build={build} deploy={deploy} compute={deploy.compute.find((item) => item.id === gnode.id)} updateDeploy={updateDeploy} header={header} /><NodeProblems problems={problems} onApplyFix={onApplyFix} /></>;
  if (gnode.kind === 'store') return <><StoreInspector build={build} deploy={deploy} store={deploy.stores.find((item) => item.id === gnode.id)} updateDeploy={updateDeploy} header={header} /><NodeProblems problems={problems} onApplyFix={onApplyFix} /></>;
  if (gnode.kind === 'external') {
    return <>{header(gnode.name)}<label className="field-label">External service region<select value={deploy.externals?.[gnode.id]?.region || deploy.regions[0]} onChange={(event) => updateDeploy((doc) => { doc.externals = doc.externals || {}; doc.externals[gnode.id] = { region: event.target.value }; })}>{Object.keys(E.REGIONS).map((region) => <option key={region} value={region}>{E.REGIONS[region].code}</option>)}</select></label><p className="helper-text">This service is defined in Build and lives outside your system. Its response time comes from Build.</p></>;
  }
  if (gnode.kind === 'user') return <>{header(gnode.name)}<p className="helper-text">Where requests in the scenario come from.</p></>;
  const net = E.netRegion(deploy, gnode.region);
  const setNet = (prop, value) => updateDeploy((doc) => { doc.network.regions[gnode.region][prop] = value; });
  return (
    <>
      {header(`${E.REGIONS[gnode.region].code} network`)}
      <NodeProblems problems={problems} onApplyFix={onApplyFix} />
      <label className="field-label">Public entry<select value={net.entry} onChange={(event) => setNet('entry', event.target.value)}>{Object.entries(E.NET.entry).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <p className="helper-text">{E.NET.entry[net.entry].note}</p>
      <label className="field-label">Request limit/s<input type="number" min="1" value={net.limit || 10000} onChange={(event) => setNet('limit', Math.max(1, Number(event.target.value) || 1))} /></label>
      <label className="toggle-field"><input type="checkbox" checked={!!net.nat} onChange={(event) => setNet('nat', event.target.checked)} />NAT for outbound traffic</label>
      <label className="toggle-field"><input type="checkbox" checked={!!net.endpoints} onChange={(event) => setNet('endpoints', event.target.checked)} />Private service endpoints</label>
    </>
  );
}

function GlobalInspector({ deploy, updateDeploy }) {
  return (
    <>
      <div className="inspector-header"><div><p className="eyebrow">Deploy</p><h2>Whole deployment</h2></div></div>
      <label className="field-label">Deploy name<input value={deploy.name} onChange={(event) => updateDeploy((doc) => { doc.name = event.target.value || 'Untitled deploy'; })} /></label>
      <label className="field-label">User routing
        <select value={deploy.network.steering} onChange={(event) => updateDeploy((doc) => { doc.network.steering = event.target.value; })}>
          {Object.entries(E.NET.steering).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
      </label>
      <p className="helper-text">{E.NET.steering[deploy.network.steering].note}</p>
      <label className="toggle-field"><input type="checkbox" checked={deploy.peering} onChange={(event) => updateDeploy((doc) => { doc.peering = event.target.checked; })} />Connect private networks across regions</label>
      {deploy.peering && <label className="field-label">Inter-region link
        <select value={deploy.network.link} onChange={(event) => updateDeploy((doc) => { doc.network.link = event.target.value; })}>
          {Object.entries(E.NET.link).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
      </label>}
      <p className="helper-text">Select a node on the canvas to edit it. Drag workloads and data from the left onto compute and stores to place them.</p>
    </>
  );
}

function ComputeInspector({ build, deploy, compute, updateDeploy, header }) {
  if (!compute) return null;
  const update = (prop, value) => updateDeploy((doc) => { const item = doc.compute.find((candidate) => candidate.id === compute.id); if (item) item[prop] = value; });
  const toggle = (region) => updateDeploy((doc) => {
    const item = doc.compute.find((candidate) => candidate.id === compute.id);
    item.regions = item.regions.includes(region) ? item.regions.filter((value) => value !== region) : [...item.regions, region];
  });
  const changeType = (type) => updateDeploy((doc) => {
    const item = doc.compute.find((candidate) => candidate.id === compute.id);
    item.type = type;
    Object.entries(E.COMPUTE[type].def).forEach(([key, value]) => {
      if (item[key] == null || (key === 'size' && E.COMPUTE[type].sizes && !E.COMPUTE[type].sizes[item.size])) item[key] = value;
    });
  });
  const move = (workload, computeId) => updateDeploy((doc) => { E.placeWorkloadOn(doc, workload, computeId); });
  return (
    <>
      {header(compute.name, () => updateDeploy((doc) => { doc.compute = doc.compute.filter((item) => item.id !== compute.id); }))}
      <label className="field-label">Name<input value={compute.name} onChange={(event) => update('name', event.target.value || 'compute')} /></label>
      <label className="field-label">Compute type<select value={compute.type} onChange={(event) => changeType(event.target.value)}>{Object.entries(E.COMPUTE).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      <p className="helper-text">{E.COMPUTE[compute.type].note}</p>
      {E.COMPUTE[compute.type].sizes && <label className="field-label">Size<select value={compute.size} onChange={(event) => update('size', event.target.value)}>{Object.keys(E.COMPUTE[compute.type].sizes).map((size) => <option key={size}>{size}</option>)}</select></label>}
      {compute.type !== 'fn' && <div className="deploy-global-grid"><label className="field-label">Minimum instances<input type="number" min="0" value={compute.min ?? 0} onChange={(event) => updateDeploy((doc) => { const item = doc.compute.find((entry) => entry.id === compute.id); item.min = Math.max(0, Number(event.target.value) || 0); if (item.max < item.min) item.max = item.min; })} /></label><label className="field-label">Maximum instances<input type="number" min="1" value={compute.max ?? 1} onChange={(event) => updateDeploy((doc) => { const item = doc.compute.find((entry) => entry.id === compute.id); item.max = Math.max(item.min || 0, Number(event.target.value) || 1); })} /></label></div>}
      {compute.type !== 'fn' && <p className="helper-text">{GLOSSARY.minMax}</p>}
      {compute.type === 'fn' && <p className="helper-text">{GLOSSARY.concurrency}</p>}
      {compute.type === 'fn' && <label className="field-label">Concurrency<input type="number" min="1" value={compute.concurrency || 1000} onChange={(event) => update('concurrency', Math.max(1, Number(event.target.value) || 1))} /></label>}
      {compute.type === 'fn' && <label className="field-label">Memory (MB)<input type="number" min="128" step="128" value={compute.memory || 1024} onChange={(event) => update('memory', Math.max(128, Number(event.target.value) || 128))} /></label>}
      <label className="toggle-field"><input type="checkbox" checked={!!compute.vpc} onChange={(event) => update('vpc', event.target.checked)} />Private network access</label>
      <div><span className="field-label">Regions</span><RegionChoices selected={compute.regions} options={deploy.regions} onToggle={toggle} /></div>
      <div><span className="field-label">Workloads</span>{build.workloads.filter((workload) => !workload.external).map((workload) => <label className="toggle-field" key={workload.id}><input type="checkbox" aria-label={`Run ${workload.name} on ${compute.name}`} checked={compute.workloads.includes(workload.name)} onChange={(event) => move(workload.name, event.target.checked ? compute.id : null)} />{workload.name}</label>)}</div>
    </>
  );
}

function StoreInspector({ build, deploy, store, updateDeploy, header }) {
  if (!store) return null;
  const T = E.STORES[store.type];
  const update = (prop, value) => updateDeploy((doc) => { const item = doc.stores.find((candidate) => candidate.id === store.id); if (item) item[prop] = value; });
  const toggle = (region) => updateDeploy((doc) => {
    const item = doc.stores.find((candidate) => candidate.id === store.id);
    item.regions = item.regions.includes(region) ? item.regions.filter((value) => value !== region) : [...item.regions, region];
    if (!item.regions.includes(item.primary)) item.primary = item.regions[0];
  });
  const changeType = (type) => updateDeploy((doc) => {
    const item = doc.stores.find((candidate) => candidate.id === store.id);
    item.type = type;
    const catalog = E.STORES[type];
    if (!catalog.repl.includes(item.repl)) item.repl = catalog.repl[0];
    if (catalog.usd && !catalog.usd[item.size]) item.size = 'Medium';
  });
  const move = (data, storeId) => updateDeploy((doc) => { if (storeId) E.placeDataIn(doc, build, data, storeId); else doc.stores.forEach((item) => { item.data = item.data.filter((name) => name !== data); }); });
  return (
    <>
      {header(store.name, () => updateDeploy((doc) => { doc.stores = doc.stores.filter((item) => item.id !== store.id); }))}
      <label className="field-label">Name<input value={store.name} onChange={(event) => update('name', event.target.value || 'store')} /></label>
      <label className="field-label">Store type<select value={store.type} onChange={(event) => changeType(event.target.value)}>{Object.entries(E.STORES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
      {T.note && <p className="helper-text">{T.note}</p>}
      {T.usd && <label className="field-label">Size<select value={store.size || 'Medium'} onChange={(event) => update('size', event.target.value)}>{Object.keys(T.usd).map((size) => <option key={size}>{size}</option>)}</select></label>}
      <label className="field-label">Copies across regions<select value={store.repl} onChange={(event) => update('repl', event.target.value)}>{T.repl.map((value) => <option key={value} value={value}>{E.REPL[value].label}</option>)}</select></label>
      {REPL_NOTES[store.repl] && <p className="helper-text">{REPL_NOTES[store.repl]}</p>}
      <label className="field-label">Read from<select value={store.readFrom || 'nearest'} onChange={(event) => update('readFrom', event.target.value)}><option value="nearest">Nearest copy</option><option value="primary">Primary only</option></select></label>
      {store.regions.length > 1 && store.repl !== 'single' && <p className="helper-text">{GLOSSARY.readFrom}</p>}
      <div><span className="field-label">Regions</span><RegionChoices selected={store.regions} options={deploy.regions} onToggle={toggle} /></div>
      {store.repl !== 'single' && store.repl !== 'multi-primary' && <label className="field-label">Primary region<select value={store.primary} onChange={(event) => update('primary', event.target.value)}>{store.regions.map((region) => <option key={region} value={region}>{E.REGIONS[region]?.code || region}</option>)}</select></label>}
      {T.shards && <label className="field-label">Shards<input type="number" min="1" max="64" value={store.shards || 1} onChange={(event) => update('shards', Math.max(1, Math.min(64, Number(event.target.value) || 1)))} /></label>}
      {T.shards && <p className="helper-text">{GLOSSARY.shards}</p>}
      {T.partitions && <label className="field-label">Partitions<input type="number" min="1" value={store.partitions || 12} onChange={(event) => update('partitions', Math.max(1, Number(event.target.value) || 1))} /></label>}
      {T.partitions && <p className="helper-text">{GLOSSARY.partitions}</p>}
      <div><span className="field-label">Data</span>{build.data.map((data) => <React.Fragment key={data.id}><label className="toggle-field"><input type="checkbox" aria-label={`Store ${data.name} in ${store.name}`} checked={store.data.includes(data.name)} disabled={E.storeFit(store.type, data.kind).fit === 'no' && !store.data.includes(data.name)} onChange={(event) => move(data.name, event.target.checked ? store.id : '')} />{data.name} <small>{shortType(data.kind)}</small></label>{store.data.includes(data.name) && (T.shards || T.autoShard) && data.fields?.length > 0 && <label className="field-label">Partition {data.name} by<select value={store.dataCfg?.[data.name]?.pk || data.partitionKey || data.fields.find((field) => field.key)?.name || data.fields[0].name} onChange={(event) => updateDeploy((doc) => { const item = doc.stores.find((entry) => entry.id === store.id); item.dataCfg = item.dataCfg || {}; item.dataCfg[data.name] = { pk: event.target.value }; })}>{data.fields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}</select></label>}</React.Fragment>)}</div>
    </>
  );
}
