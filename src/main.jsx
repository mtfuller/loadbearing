import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';

const E = window.Loadbearing;
const STORAGE_KEY = 'loadbearing-react-work';
const DATA_TYPES = ['table', 'kv', 'document', 'queue', 'stream', 'topic', 'file', 'blob'];
const duplicate = (value) => JSON.parse(JSON.stringify(value));
const shortType = (type) => type === 'kv' ? 'Key-value' : type[0].toUpperCase() + type.slice(1);
const makeId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10)}`;
const isBuildKind = (kind) => kind === 'loadbearing-build' || kind === 'meridian-build';
const isDeployKind = (kind) => kind === 'loadbearing-deploy' || kind === 'meridian-deploy';
const upgradeDocument = (doc) => ({ ...doc, kind: isBuildKind(doc?.kind) ? 'loadbearing-build' : 'loadbearing-deploy' });

function initialDocs() {
  try {
    for (const key of [STORAGE_KEY, 'loadbearing-work', 'meridian-v3-work']) {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (isBuildKind(saved?.build?.kind) && isDeployKind(saved?.deploy?.kind)) {
        saved.build = upgradeDocument(saved.build);
        saved.deploy = upgradeDocument(saved.deploy);
        E.normalizeDeploy(saved.deploy);
        return saved;
      }
    }
  } catch (error) {
    console.warn('Could not restore the saved workspace.', error);
  }
  return { build: E.exampleBuild(), deploy: E.exampleDeploys()[0] };
}

function App() {
  const [docs, setDocs] = useState(initialDocs);
  const [mode, setMode] = useState('build');
  const [selection, setSelection] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [scenarioId, setScenarioId] = useState('');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(false);
  const [library, setLibrary] = useState(() => {
    try { return JSON.parse(localStorage.getItem('loadbearing-react-library') || '{"builds":[],"deploys":[]}'); }
    catch { return { builds: [], deploys: [] }; }
  });
  const [stepSession, setStepSession] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [trace, setTrace] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('loadbearing-theme') || 'light');
  const analysis = useMemo(() => E.analyzeBuild(docs.build), [docs.build]);
  const deploy = useMemo(() => {
    const copy = duplicate(docs.deploy);
    E.normalizeDeploy(copy);
    return copy;
  }, [docs.deploy]);
  const deployCheck = useMemo(
    () => analysis.valid ? E.validateDeploy(docs.build, analysis, deploy) : null,
    [docs.build, analysis, deploy]
  );
  const canSimulate = !!deployCheck?.valid;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
    } catch (error) {
      console.warn('Could not save the workspace in this browser.', error);
      setMessage('Could not save this workspace in browser storage.');
    }
  }, [docs]);

  useEffect(() => {
    setResult(null);
    setPlayback(null);
    setTrace(null);
    setStepSession(null);
  }, [docs]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('loadbearing-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!docs.build.scenarios.some((scenario) => scenario.id === scenarioId)) {
      setScenarioId(docs.build.scenarios[0]?.id || '');
      setResult(null);
    }
  }, [docs.build.scenarios, scenarioId]);

  const commit = useCallback((update) => {
    setHistory((items) => [...items.slice(-49), docs]);
    setFuture([]);
    setDocs((current) => update(duplicate(current)) || current);
    setResult(null);
  }, [docs]);

  const undo = () => {
    if (!history.length) return;
    setFuture((items) => [docs, ...items]);
    setDocs(history[history.length - 1]);
    setHistory((items) => items.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((items) => [...items, docs]);
    setDocs(future[0]);
    setFuture((items) => items.slice(1));
  };

  const addWorkload = useCallback((position = { x: 100, y: 120 }) => {
    let name = 'New workload', suffix = 2;
    while (docs.build.workloads.some((item) => item.name === name)) name = `New workload ${suffix++}`;
    const workload = {
      id: makeId('w'),
      name,
      x: Math.round(position.x),
      y: Math.round(position.y),
      code: 'when HandleRequest {\n  return\n}'
    };
    commit((next) => {
      next.build.workloads.push(workload);
      return next;
    });
    setSelection({ type: 'workload', id: workload.id });
  }, [commit, docs.build.workloads]);

  const addData = useCallback((kind, position = { x: 440, y: 120 }) => {
    let name = `New ${shortType(kind).toLowerCase()}`, suffix = 2;
    while (docs.build.data.some((item) => item.name === name)) name = `New ${shortType(kind).toLowerCase()} ${suffix++}`;
    const needsKey = ['table', 'kv', 'document'].includes(kind);
    const data = {
      id: makeId('d'),
      name,
      kind,
      x: Math.round(position.x),
      y: Math.round(position.y),
      rows: 0,
      rowKB: 1,
      fields: needsKey ? [{ name: 'id', type: 'uuid', key: true }] : []
    };
    commit((next) => {
      next.build.data.push(data);
      return next;
    });
    setSelection({ type: 'data', id: data.id });
  }, [commit, docs.build.data]);

  const updateBuild = (updater) => commit((next) => {
    updater(next.build);
    return next;
  });
  const updateDeploy = (updater) => commit((next) => {
    updater(next.deploy);
    E.normalizeDeploy(next.deploy);
    return next;
  });

  const updateScenario = (id, updater) => commit((next) => {
    const scenario = next.build.scenarios.find((item) => item.id === id);
    if (scenario) updater(scenario);
    return next;
  });
  const selectScenario = (id) => {
    setScenarioId(id);
    setResult(null);
    setPlayback(null);
    setTrace(null);
  };

  const runScenario = (stress = false) => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !canSimulate) return;
    const model = E.compileModel(docs.build, analysis, deploy, deployCheck);
    if (E.scenarioMode(analysis, scenario) === 'batch') {
      setResult(E.evaluateBatch(model, scenario));
      return;
    }
    const rate = E.evaluateRate(model, scenario, { N: 1500, seed: 11 });
    const stressResult = stress ? E.stressTest(model, scenario) : null;
    setResult(stressResult ? { ...rate, stress: stressResult } : rate);
  };

  const startPlayback = () => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !canSimulate || E.scenarioMode(analysis, scenario) !== 'rate') return;
    const model = E.compileModel(docs.build, analysis, deploy, deployCheck);
    setPlayback({ timeline: E.simulateTimeline(model, scenario, { frames: 48, N: 200 }), index: 0, speed: 1, playing: true });
    setTrace(null);
  };

  const startTrace = (pathIndex) => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !canSimulate) return;
    const model = E.compileModel(docs.build, analysis, deploy, deployCheck);
    const paths = E.enumeratePaths(analysis, scenario.entry, scenario.odds || {}, {
      fileRows: E.entryInfo(analysis, scenario.entry)?.type === 'file' ? scenario.rows || 1 : 1
    });
    const path = paths[pathIndex];
    if (!path) return;
    const entry = E.entryInfo(analysis, scenario.entry);
    const origins = E.originsFor(model, scenario, entry).filter((origin) => origin.region);
    if (!origins.length) return;
    const origin = origins.reduce((best, item, index) => item.share > origins[best].share ? index : best, 0);
    const rate = entry.type === 'file' || entry.type === 'schedule' ? null : E.evaluateRate(model, scenario, { N: 200, seed: 3 });
    const steps = E.stepRequest(model, scenario, path, origins[origin], rate?.R || {}).steps;
    setTrace({ label: path.label, steps, index: 0 });
    setPlayback(null);
  };

  const startBuildStep = (key) => {
    if (!analysis.valid) return;
    const entry = key || analysis.entries[0]?.key;
    if (!entry) return;
    const db = E.mockDB(docs.build, 7);
    setStepSession({ key: entry, seed: 7, db, generator: E.runEntry(analysis, docs.build, db, entry, { maxIter: 6 }), events: [], commands: [], pendingAsk: null, finished: false });
  };
  const advanceBuildStep = (answer) => {
    setStepSession((current) => {
      if (!current || current.finished) return current;
      const step = current.generator.next(answer);
      const commands = [...current.commands, answer];
      if (step.done) return { ...current, commands, pendingAsk: null, finished: true };
      if (step.value.t === 'ask') return { ...current, commands, pendingAsk: step.value };
      const event = { ...step.value, context: duplicate(current.db._ctx || {}) };
      if (event.d && current.db[event.d]) event.table = duplicate(current.db[event.d]);
      return { ...current, commands, events: [...current.events, event], pendingAsk: null, finished: step.value.t === 'done' };
    });
  };
  const rewindBuildStep = () => {
    setStepSession((current) => {
      if (!current || !current.commands.length) return current;
      const commands = current.commands.slice(0, -1);
      const db = E.mockDB(docs.build, current.seed);
      const generator = E.runEntry(analysis, docs.build, db, current.key, { maxIter: 6 });
      const events = [];
      let pendingAsk = null, finished = false;
      commands.forEach((answer) => {
        const step = generator.next(answer);
        if (step.done) { finished = true; pendingAsk = null; }
        else if (step.value.t === 'ask') pendingAsk = step.value;
        else {
          pendingAsk = null;
          events.push({ ...step.value, context: duplicate(db._ctx || {}), ...(step.value.d && db[step.value.d] ? { table: duplicate(db[step.value.d]) } : {}) });
          finished = step.value.t === 'done';
        }
      });
      return { ...current, db, generator, commands, events, pendingAsk, finished };
    });
  };

  const startNewScenario = () => {
    const entry = analysis.entries.find((item) => item.type === 'request') || analysis.entries[0];
    if (!entry) {
      setMessage('Add a valid entry point to the Build before creating a scenario.');
      return;
    }
    const id = makeId('sc');
    commit((next) => {
      next.build.scenarios.push({
        id, name: 'New scenario', entry: entry.key, count: 60000, durationMin: 60,
        burst: 'steady', rows: 100000, origins: { na: 60, eu: 40 }, odds: {}, goalMs: 300, goalMin: 30
      });
      return next;
    });
    setScenarioId(id);
  };

  const duplicateScenario = () => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;
    const copy = { ...duplicate(scenario), id: makeId('sc'), name: `${scenario.name} copy` };
    commit((next) => { next.build.scenarios.push(copy); return next; });
    setScenarioId(copy.id);
  };

  const deleteScenario = () => {
    commit((next) => {
      next.build.scenarios = next.build.scenarios.filter((item) => item.id !== scenarioId);
      return next;
    });
    setScenarioId('');
  };

  const saveDoc = (kind, name) => {
    const key = kind === 'builds' ? 'build' : 'deploy';
    const doc = { ...duplicate(docs[key]), name: name.trim() || docs[key].name };
    const nextLibrary = {
      ...library,
      [kind]: [{ id: makeId('lib'), name: doc.name, json: JSON.stringify(doc), savedAt: Date.now() },
        ...library[kind].filter((item) => item.name !== doc.name)]
    };
    setLibrary(nextLibrary);
    localStorage.setItem('loadbearing-react-library', JSON.stringify(nextLibrary));
    setMessage(`Saved ${kind === 'builds' ? 'Build' : 'Deploy'} “${doc.name}”.`);
  };

  const deleteSavedDoc = (kind, id) => {
    const nextLibrary = { ...library, [kind]: library[kind].filter((item) => item.id !== id) };
    setLibrary(nextLibrary);
    localStorage.setItem('loadbearing-react-library', JSON.stringify(nextLibrary));
  };

  const loadDoc = (kind, json) => {
    try {
      const doc = JSON.parse(json);
      if (isBuildKind(doc?.build?.kind) && isDeployKind(doc?.deploy?.kind)
        && Array.isArray(doc.build.workloads) && Array.isArray(doc.build.data)
        && Array.isArray(doc.deploy.compute) && Array.isArray(doc.deploy.stores)) {
        commit((next) => {
          next.build = upgradeDocument(doc.build);
          next.deploy = upgradeDocument(doc.deploy);
          E.normalizeDeploy(next.deploy);
          return next;
        });
        setDialog(false);
        return;
      }
      const valid = kind === 'builds'
        ? isBuildKind(doc?.kind) && Array.isArray(doc.workloads) && Array.isArray(doc.data)
        : isDeployKind(doc?.kind) && Array.isArray(doc.compute) && Array.isArray(doc.stores);
      if (!valid) throw new Error('That file is not a valid Loadbearing document.');
      const compatibleDoc = upgradeDocument(doc);
      if (kind === 'builds') commit((next) => { next.build = compatibleDoc; return next; });
      else commit((next) => { next.deploy = compatibleDoc; E.normalizeDeploy(next.deploy); return next; });
      setResult(null);
      setDialog(false);
    } catch (error) {
      setMessage(error.message || 'Could not load this document.');
    }
  };

  const exportDoc = (kind) => {
    const doc = docs[kind === 'builds' ? 'build' : 'deploy'];
    const suffix = kind === 'builds' ? '.build.json' : '.deploy.json';
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${suffix}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const switchMode = (nextMode) => {
    if (nextMode === 'deploy' && !analysis.valid) return;
    if (nextMode === 'simulate' && !canSimulate) return;
    setMode(nextMode);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" aria-label="Loadbearing home">
          <span className="brand-mark">L</span>
          <span>Loadbearing</span>
        </a>
        <nav className="mode-tabs" aria-label="Design workflow">
          {['build', 'deploy', 'simulate'].map((item, index) => {
            const disabled = (item === 'deploy' && !analysis.valid) || (item === 'simulate' && !canSimulate);
            return (
              <button
                type="button"
                key={item}
                className={`mode-tab ${mode === item ? 'active' : ''}`}
                disabled={disabled}
                onClick={() => switchMode(item)}
              >
                <span className="mode-number">{index + 1}</span>
                <span>{item[0].toUpperCase() + item.slice(1)}</span>
                {item === 'build' && <span className={`status-dot ${analysis.valid ? 'ok' : 'error'}`} />}
                {item === 'deploy' && <span className={`status-dot ${deployCheck?.valid ? 'ok' : deployCheck ? 'error' : ''}`} />}
              </button>
            );
          })}
        </nav>
        <div className="header-actions">
          <button type="button" className="button quiet" onClick={() => setDialog(true)}>Save &amp; load</button>
          <button type="button" className="button quiet" onClick={undo} disabled={!history.length}>Undo</button>
          <button type="button" className="button quiet" onClick={redo} disabled={!future.length}>Redo</button>
          <button type="button" className="button quiet" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
        </div>
      </header>

      {message && <div className="notice" role="status">{message}<button type="button" onClick={() => setMessage('')}>Dismiss</button></div>}
      {mode === 'build' && (
        <BuildMode
          build={docs.build}
          analysis={analysis}
          selection={selection}
          setSelection={setSelection}
          addWorkload={addWorkload}
          addData={addData}
          updateBuild={updateBuild}
          stepSession={stepSession}
          startBuildStep={startBuildStep}
          advanceBuildStep={advanceBuildStep}
          rewindBuildStep={rewindBuildStep}
        />
      )}
      {mode === 'deploy' && <DeployMode build={docs.build} deploy={deploy} check={deployCheck} updateDeploy={updateDeploy} />}
      {mode === 'simulate' && (
        <SimulateMode
          build={docs.build}
          analysis={analysis}
          deploy={deploy}
          check={deployCheck}
          scenarioId={scenarioId}
          setScenarioId={selectScenario}
          result={result}
          runScenario={runScenario}
          updateScenario={updateScenario}
          startNewScenario={startNewScenario}
          duplicateScenario={duplicateScenario}
          deleteScenario={deleteScenario}
          startPlayback={startPlayback}
          playback={playback}
          setPlayback={setPlayback}
          trace={trace}
          setTrace={setTrace}
          startTrace={startTrace}
        />
      )}
      {dialog && <LibraryDialog
        docs={docs}
        library={library}
        onClose={() => setDialog(false)}
        onSave={saveDoc}
        onLoad={loadDoc}
        onExport={exportDoc}
        onDelete={deleteSavedDoc}
      />}
      <footer className="app-footer">
        <span>Learning model only · results are approximate, not production capacity estimates.</span>
        <span>Saved automatically in this browser.</span>
      </footer>
    </main>
  );
}

function WorkloadNode({ data, selected }) {
  return (
    <div className={`graph-node workload-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="graph-node-title">
        <span className="node-icon">ƒ</span>
        <strong>{data.name}</strong>
        {data.external && <span className="node-badge">External</span>}
      </div>
      <div className="graph-node-body">
        {data.handlers.length
          ? data.handlers.map((handler) => <div className="handler-row" key={handler.name}><span>when</span> {handler.name}</div>)
          : <span className="muted">No handlers yet</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function DataNode({ data, selected }) {
  return (
    <div className={`graph-node data-node ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="graph-node-title">
        <span className="node-icon data-icon">▤</span>
        <strong>{data.name}</strong>
        <span className="node-badge">{shortType(data.kind)}</span>
      </div>
      <div className="graph-node-body">
        {data.fields.length
          ? data.fields.slice(0, 4).map((field) => <div className="field-row" key={field.name}>{field.name}<span>{field.key ? 'key' : field.type || 'text'}</span></div>)
          : <span className="muted">No fields</span>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { workload: WorkloadNode, data: DataNode };

function BuildMode({ build, analysis, selection, setSelection, addWorkload, addData, updateBuild, stepSession, startBuildStep, advanceBuildStep, rewindBuildStep }) {
  const [nodes, setNodes] = useState([]);
  const [buildName, setBuildName] = useState(build.name);
  const { screenToFlowPosition } = useReactFlow();
  useEffect(() => setBuildName(build.name), [build.name]);
  const graphNodes = useMemo(() => [
    ...build.workloads.map((workload) => ({
      id: `w:${workload.id}`,
      type: 'workload',
      position: { x: workload.x || 0, y: workload.y || 0 },
      data: { name: workload.name, external: !!workload.external, handlers: analysis.W[workload.name]?.parsed.handlers || [] }
    })),
    ...build.data.map((data) => ({
      id: `d:${data.id}`,
      type: 'data',
      position: { x: data.x || 0, y: data.y || 0 },
      data: { name: data.name, kind: data.kind, fields: data.fields || [] }
    }))
  ], [analysis, build]);

  useEffect(() => setNodes(graphNodes), [graphNodes]);

  const edges = useMemo(() => {
    const workloadIds = Object.fromEntries(build.workloads.map((item) => [item.name, `w:${item.id}`]));
    const dataIds = Object.fromEntries(build.data.map((item) => [item.name, `d:${item.id}`]));
    const result = [];
    analysis.calls.forEach((call, index) => {
      if (workloadIds[call.from] && workloadIds[call.to]) result.push({
        id: `call-${index}`, source: workloadIds[call.from], target: workloadIds[call.to],
        label: 'calls', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#5c61db' }
      });
    });
    analysis.dataOps.forEach((op, index) => {
      if (workloadIds[op.w] && dataIds[op.d]) result.push({
        id: `data-${index}`, source: workloadIds[op.w], target: dataIds[op.d],
        label: op.ops.join(', '), markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#bb6b19' }
      });
    });
    analysis.triggers.forEach((trigger, index) => {
      if (dataIds[trigger.d] && workloadIds[trigger.w]) result.push({
        id: `trigger-${index}`, source: dataIds[trigger.d], target: workloadIds[trigger.w],
        label: `triggers ${trigger.type}`, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#21805c', strokeDasharray: '5 4' }
      });
    });
    analysis.refs.forEach((ref, index) => {
      if (dataIds[ref.from] && dataIds[ref.to]) result.push({
        id: `ref-${index}`, source: dataIds[ref.from], target: dataIds[ref.to],
        label: 'points to', markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#787b83', strokeDasharray: '2 4' }
      });
    });
    return result;
  }, [analysis, build]);

  const selectedNode = selection?.type === 'workload'
    ? build.workloads.find((item) => item.id === selection.id)
    : selection?.type === 'data' ? build.data.find((item) => item.id === selection.id) : null;

  const handleDrop = (event) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('application/loadbearing-node');
    if (!kind) return;
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (kind === 'workload') addWorkload(point);
    else addData(kind, point);
  };

  const moveNode = (_event, node) => {
    const [type, id] = node.id.split(':');
    updateBuild((doc) => {
      const item = (type === 'w' ? doc.workloads : doc.data).find((candidate) => candidate.id === id);
      if (item) {
        item.x = Math.round(node.position.x);
        item.y = Math.round(node.position.y);
      }
    });
  };

  const deleteSelected = () => {
    if (!selection || !selectedNode) return;
    updateBuild((doc) => {
      if (selection.type === 'workload') doc.workloads = doc.workloads.filter((item) => item.id !== selection.id);
      else doc.data = doc.data.filter((item) => item.id !== selection.id);
    });
    setSelection(null);
  };

  return (
    <section className="workspace">
      <aside className="sidebar">
        <div className="sidebar-heading"><div><p className="eyebrow">Build</p><h1>System logic</h1></div></div>
        <p className="sidebar-copy">Drag nodes onto the canvas. Connections are discovered from the workload code.</p>
        <div className="palette-section">
          <h2>Workloads</h2>
          <PaletteItem kind="workload" label="Workload" description="Service or worker" onClick={() => addWorkload()} />
        </div>
        <div className="palette-section">
          <h2>Data and messaging</h2>
          {DATA_TYPES.map((kind) => (
            <PaletteItem key={kind} kind={kind} label={shortType(kind)} description={kind === 'table' ? 'Rows with fields and keys' : E.DATA_KINDS[kind].label} onClick={() => addData(kind)} />
          ))}
        </div>
        <div className="palette-section">
          <h2>In this Build</h2>
          {build.workloads.map((item) => <button className="list-item" type="button" key={item.id} onClick={() => setSelection({ type: 'workload', id: item.id })}>{item.name}<span>Workload</span></button>)}
          {build.data.map((item) => <button className="list-item" type="button" key={item.id} onClick={() => setSelection({ type: 'data', id: item.id })}>{item.name}<span>{shortType(item.kind)}</span></button>)}
        </div>
        <div className="palette-section">
          <h2>Scenarios</h2>
          <label className="field-label">Step through an entry point
            <select aria-label="Entry point to step through" defaultValue="" onChange={(event) => {
              if (event.target.value) startBuildStep(event.target.value);
              event.target.value = '';
            }}>
              <option value="">Choose entry point</option>
              {analysis.entries.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
            </select>
          </label>
        </div>
      </aside>

      <div className="canvas-column">
        <div className="canvas-toolbar">
          <div><input aria-label="Build name" className="build-name-input" value={buildName} onChange={(event) => setBuildName(event.target.value)} onBlur={() => {
            const name = buildName.trim() || 'Untitled Build';
            if (name !== build.name) updateBuild((doc) => { doc.name = name; });
          }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /><span>{build.workloads.length} workloads · {build.data.length} data nodes</span></div>
          <div className="toolbar-status">
            <span className={`pill ${analysis.valid ? 'success' : 'danger'}`}>{analysis.valid ? 'Build valid' : `${analysis.errors} error${analysis.errors === 1 ? '' : 's'}`}</span>
            {analysis.warnings > 0 && <span className="pill warning">{analysis.warnings} notes</span>}
          </div>
        </div>
        <div className="canvas-wrap" data-testid="build-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={(changes) => setNodes((items) => applyNodeChanges(changes, items))}
            onNodeDragStop={moveNode}
            onNodeClick={(_event, node) => {
              const [type, id] = node.id.split(':');
              setSelection({ type: type === 'w' ? 'workload' : 'data', id });
            }}
            onPaneClick={() => setSelection(null)}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={handleDrop}
            fitView
            minZoom={0.12}
            maxZoom={1.5}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#d7d7d0" gap={22} />
            <MiniMap pannable zoomable nodeColor={(node) => node.type === 'data' ? '#e5b35d' : '#8588e9'} />
            <Controls />
          </ReactFlow>
          {build.workloads.length === 0 && build.data.length === 0 && (
            <div className="canvas-empty"><strong>Start with a node</strong><span>Drag one from the left panel, or click a node type to add it.</span></div>
          )}
        </div>
        <Problems problems={analysis.problems} />
        <BuildStepThrough session={stepSession} onAdvance={advanceBuildStep} onBack={rewindBuildStep} onClose={() => setStepSession(null)} />
      </div>

      <aside className="inspector">
        {selectedNode ? (
          <NodeInspector
            key={`${selection.type}:${selection.id}`}
            type={selection.type}
            node={selectedNode}
            updateBuild={updateBuild}
            onDelete={deleteSelected}
          />
        ) : (
          <div className="inspector-empty"><span className="inspector-mark">↖</span><strong>Select a node</strong><span>Inspect its details here. Drag nodes to arrange your design.</span></div>
        )}
      </aside>
    </section>
  );
}

function BuildStepThrough({ session, onAdvance, onBack, onClose }) {
  if (!session) return null;
  const describe = (event) => {
    const who = [event.w, event.h].filter(Boolean).join('.');
    switch (event.t) {
      case 'enter': return `Start ${who}`;
      case 'call': return `Call ${event.to}.${event.th}`;
      case 'back': return `Return from ${event.from}.${event.fh}${event.outcome ? ` (${event.outcome})` : ''}`;
      case 'data': return `${event.op} ${event.d}${event.count != null ? ` · ${event.count} row(s)` : ''}`;
      case 'publish': return `Publish ${event.d} · ${event.queued} queued`;
      case 'compute': return `Compute for ${event.ms} ms`;
      case 'error': return `Error ${event.code}`;
      case 'return': return 'Return from handler';
      case 'branch': return `Condition “${event.cond}” was ${event.taken ? 'true' : 'false'}`;
      case 'iter': return `Loop ${event.i} of ${event.n}`;
      case 'done': return 'Entry point finished';
      default: return `${event.t}${who ? ` · ${who}` : ''}`;
    }
  };
  return (
    <section className="step-through" aria-label="Build step-through">
      <div className="card-heading"><div><p className="eyebrow">Build interpreter</p><h2>Step through behavior</h2></div><button className="text-button" type="button" onClick={onClose}>Close</button></div>
      <p className="helper-text">Runs the existing workload interpreter against a seeded mock database. Each step shows the effect of the selected path.</p>
      {session.pendingAsk && <div className="branch-choice"><strong>Is “{session.pendingAsk.cond}” true?</strong><button className="button primary" type="button" onClick={() => onAdvance(true)}>Yes</button><button className="button quiet" type="button" onClick={() => onAdvance(false)}>No</button><button className="button quiet" type="button" onClick={() => onAdvance(undefined)}>Use chance ({Math.round(session.pendingAsk.p * 100)}%)</button></div>}
      <div className="build-step-controls"><button className="button quiet" type="button" disabled={!session.commands.length} onClick={onBack}>Back</button>{!session.pendingAsk && !session.finished && <button className="button primary" type="button" onClick={() => onAdvance()}>Step</button>}</div>
      <ol className="step-events">{session.events.map((event, index) => <li key={`${event.line || 0}-${index}`}><span>{index + 1}</span><div><strong>{describe(event)}</strong><small>{event.line ? `Line ${event.line}` : 'Runtime event'}{event.w ? ` · ${event.w}` : ''}</small>{(Object.keys(event.context || {}).length > 0 || event.table) && <details><summary>Inspect context{event.table ? ' and data' : ''}</summary>{Object.keys(event.context || {}).length > 0 && <pre>{JSON.stringify(event.context, null, 2)}</pre>}{event.table && <pre>{JSON.stringify(event.table.slice(0, 8), null, 2)}</pre>}</details>}</div></li>)}</ol>
      {session.finished && <p className="helper-text">Execution finished. Choose another entry point to start again.</p>}
    </section>
  );
}

function PaletteItem({ kind, label, description, onClick }) {
  return (
    <button
      type="button"
      className="palette-item"
      draggable
      data-palette={kind}
      onClick={onClick}
      onDragStart={(event) => event.dataTransfer.setData('application/loadbearing-node', kind)}
    >
      <span className={`palette-icon ${kind === 'workload' ? 'workload-color' : 'data-color'}`}>{kind === 'workload' ? 'ƒ' : '▤'}</span>
      <span className="palette-text"><strong>{label}</strong><small>{description}</small></span>
      <span className="drag-grip" aria-hidden="true">⠿</span>
    </button>
  );
}

function NodeInspector({ type, node, updateBuild, onDelete }) {
  const isWorkload = type === 'workload';
  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code || '');
  const codeRef = useRef(null);
  useEffect(() => setName(node.name), [node.name]);
  useEffect(() => setCode(node.code || ''), [node.code]);
  const flushName = () => {
    if (name === node.name) return;
    updateBuild((doc) => {
      const list = isWorkload ? doc.workloads : doc.data;
      const item = list.find((candidate) => candidate.id === node.id);
      if (item) item.name = name;
    });
  };
  const flushCode = () => {
    if (code === node.code) return;
    updateBuild((doc) => {
      const item = doc.workloads.find((candidate) => candidate.id === node.id);
      if (item) item.code = code;
    });
  };
  const insertSnippet = (snippet) => {
    const textarea = codeRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${code.slice(0, start)}${snippet}${code.slice(end)}`;
    setCode(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };
  const indentCode = (event) => {
    const textarea = codeRef.current;
    if (!textarea) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      insertSnippet('  ');
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const lineStart = code.lastIndexOf('\n', start - 1) + 1;
      const line = code.slice(lineStart, start);
      const indent = (line.match(/^\s*/) || [''])[0] + (/\{\s*$/.test(line) ? '  ' : '');
      insertSnippet(`\n${indent}`);
    }
  };
  return (
    <div className="inspector-content">
      <div className="inspector-header">
        <div><p className="eyebrow">Node details</p><h2>{isWorkload ? 'Workload' : shortType(node.kind)}</h2></div>
        <button type="button" className="button danger-quiet" onClick={onDelete}>Delete</button>
      </div>
      <label className="field-label">Name
        <input value={name} onChange={(event) => setName(event.target.value)} onBlur={flushName} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      </label>
      {isWorkload ? (
        <>
          <label className="toggle-field"><input type="checkbox" checked={!!node.external} onChange={(event) => updateBuild((doc) => {
            const item = doc.workloads.find((candidate) => candidate.id === node.id);
            if (item) item.external = event.target.checked;
          })} /> Runs outside your system</label>
          <label className="field-label">Workload code
            <textarea ref={codeRef} className="code-input" value={code} spellCheck="false" onChange={(event) => setCode(event.target.value)} onKeyDown={indentCode} onBlur={flushCode} />
          </label>
          <div className="snippet-tools" aria-label="Insert code statement">
            {['call', 'read', 'insert', 'update', 'publish', 'if', 'for each', 'parallel', 'compute', 'error', 'when'].map((snippet) => <button key={snippet} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSnippet(({
              call: 'call Workload.Handler\n', read: 'read Data by field\n', insert: 'insert Data\n', update: 'update Data by id\n',
              publish: 'publish Data\n', if: 'if Condition @50% {\n  \n}\n', 'for each': 'for each item in Data parallel 10 {\n  \n}\n',
              parallel: 'parallel {\n  \n}\n', compute: 'compute 15ms\n', error: 'error 500\n', when: 'when Handler {\n  \n}\n'
            })[snippet])}>{snippet}</button>)}
          </div>
          <p className="helper-text">Connections update from <code>call</code>, data operations, and event triggers. Use the statement chips for syntax patterns; press Tab to indent.</p>
          <details className="language-reference"><summary>Language reference</summary><p><code>when Name {'{ }'}</code> handles requests. Use <code>when message Data {'{ }'}</code>, <code>when file Data {'{ }'}</code>, or <code>when schedule "daily 02:00" {'{ }'}</code> for background work.</p><p><code>call Service.Handler</code> waits for another workload. <code>read Data by field many 20</code> reads rows; <code>insert</code>, <code>update</code>, <code>upsert</code>, and <code>delete</code> write data. <code>publish Data</code> sends a message.</p><p><code>if Condition @10% {'{ }'} else {'{ }'}</code> branches. <code>for each item in File parallel 50 {'{ }'}</code> repeats in batches. <code>parallel {'{ }'}</code> runs statements concurrently. <code>compute 15ms</code> models CPU time; <code>error 402</code> and <code>return</code> end a request.</p></details>
        </>
      ) : (
        <>
          <label className="field-label">Data kind
            <select value={node.kind} onChange={(event) => updateBuild((doc) => {
              const item = doc.data.find((candidate) => candidate.id === node.id);
              if (item) item.kind = event.target.value;
            })}>{DATA_TYPES.map((kind) => <option key={kind} value={kind}>{shortType(kind)}</option>)}</select>
          </label>
          <div className="fields-title"><strong>Fields</strong><button type="button" className="text-button" onClick={() => updateBuild((doc) => {
            const item = doc.data.find((candidate) => candidate.id === node.id);
            if (item) item.fields.push({ name: `field${item.fields.length + 1}`, type: 'text' });
          })}>Add field</button></div>
          {(node.fields || []).map((field, index) => (
            <div className="field-editor" key={`${index}-${field.name}`}>
              <input aria-label={`Field ${index + 1} name`} value={field.name} onChange={(event) => updateBuild((doc) => {
                const item = doc.data.find((candidate) => candidate.id === node.id);
                if (item?.fields[index]) item.fields[index].name = event.target.value;
              })} />
              <input aria-label={`Field ${index + 1} type`} value={field.type || 'text'} onChange={(event) => updateBuild((doc) => {
                const item = doc.data.find((candidate) => candidate.id === node.id);
                if (item?.fields[index]) item.fields[index].type = event.target.value;
              })} />
              <label><input type="checkbox" aria-label={`${field.name} is key`} checked={!!field.key} onChange={(event) => updateBuild((doc) => {
                const item = doc.data.find((candidate) => candidate.id === node.id);
                if (item?.fields[index]) {
                  if (event.target.checked) item.fields.forEach((entry, fieldIndex) => { entry.key = fieldIndex === index; });
                  else item.fields[index].key = false;
                }
              })} /> key</label>
              <label><input type="checkbox" aria-label={`${field.name} is indexed`} checked={!!field.index} onChange={(event) => updateBuild((doc) => {
                const item = doc.data.find((candidate) => candidate.id === node.id);
                if (item?.fields[index]) item.fields[index].index = event.target.checked;
              })} /> index</label>
              <button type="button" className="text-button" aria-label={`Delete field ${field.name}`} onClick={() => updateBuild((doc) => {
                const item = doc.data.find((candidate) => candidate.id === node.id);
                if (item) item.fields.splice(index, 1);
              })}>×</button>
            </div>
          ))}
          <label className="field-label">Approximate rows
            <input type="number" min="0" value={node.rows || 0} onChange={(event) => updateBuild((doc) => {
              const item = doc.data.find((candidate) => candidate.id === node.id);
              if (item) item.rows = Number(event.target.value);
            })} />
          </label>
          <label className="field-label">Average row size (KB)
            <input type="number" min="0" step="0.1" value={node.rowKB ?? 1} onChange={(event) => updateBuild((doc) => {
              const item = doc.data.find((candidate) => candidate.id === node.id);
              if (item) item.rowKB = Math.max(0, Number(event.target.value) || 0);
            })} />
          </label>
          <label className="field-label">Partition key
            <input value={node.partitionKey || ''} placeholder="Optional" onChange={(event) => updateBuild((doc) => {
              const item = doc.data.find((candidate) => candidate.id === node.id);
              if (item) item.partitionKey = event.target.value;
            })} />
          </label>
        </>
      )}
    </div>
  );
}

function Problems({ problems }) {
  return (
    <section className="problems-panel" aria-label="Build checks">
      <h2>Checks <span>{problems.length}</span></h2>
      {problems.length ? (
        <ul>{problems.map((problem, index) => <li key={`${problem.id || 'global'}-${problem.line || 0}-${index}`} className={problem.sev}>
          <span className="problem-mark">{problem.sev === 'error' ? '!' : 'i'}</span>
          <span>{problem.msg}{problem.line ? <small>Line {problem.line}</small> : null}</span>
        </li>)}</ul>
      ) : <p className="muted">No issues found. Add or connect nodes to explore your system.</p>}
    </section>
  );
}

function LibraryDialog({ docs, library, onClose, onSave, onLoad, onExport, onDelete }) {
  const [kind, setKind] = useState('builds');
  const [name, setName] = useState(docs.build.name);
  const current = kind === 'builds' ? docs.build : docs.deploy;
  const importFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onLoad(kind, String(reader.result));
    reader.onerror = () => window.alert('Could not read the selected file.');
    reader.readAsText(file);
    event.target.value = '';
  };
  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-title">
        <div className="card-heading"><div><p className="eyebrow">Document library</p><h2 id="library-title">Save and load designs</h2></div><button className="text-button" type="button" onClick={onClose}>Close</button></div>
        <div className="segmented-control" role="tablist">
          {['builds', 'deploys'].map((value) => <button key={value} type="button" role="tab" aria-selected={kind === value} className={kind === value ? 'selected' : ''} onClick={() => { setKind(value); setName((value === 'builds' ? docs.build : docs.deploy).name); }}>{value === 'builds' ? 'Builds' : 'Deploy configs'}</button>)}
        </div>
        <div className="library-save">
          <label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <button type="button" className="button primary" onClick={() => onSave(kind, name)}>Save current {kind === 'builds' ? 'Build' : 'Deploy'}</button>
          <button type="button" className="button quiet" onClick={() => onExport(kind)}>Export JSON</button>
          <label className="button quiet file-button">Import JSON<input type="file" accept=".json,application/json" onChange={importFile} /></label>
        </div>
        <h3>Saved in this browser</h3>
        <div className="library-list">
          {library[kind].length ? library[kind].map((item) => <div className="library-row" key={item.id}>
            <div><strong>{item.name}</strong><small>{new Date(item.savedAt).toLocaleString()}</small></div>
            <div className="library-row-actions"><button type="button" className="button quiet" onClick={() => onLoad(kind, item.json)}>Load</button><button type="button" className="text-button" onClick={() => onDelete(kind, item.id)}>Delete</button></div>
          </div>) : <p className="muted">No saved {kind === 'builds' ? 'Builds' : 'Deploy configs'} yet.</p>}
        </div>
        <p className="helper-text">Your current workspace is also saved automatically in this browser. Importing replaces only the selected document.</p>
      </section>
    </div>
  );
}

function DeployMode({ build, deploy, check, updateDeploy }) {
  const assignedWorkloads = Object.fromEntries(deploy.compute.flatMap((item) => item.workloads.map((name) => [name, item.id])));
  const assignedData = Object.fromEntries(deploy.stores.flatMap((item) => item.data.map((name) => [name, item.id])));
  const moveWorkload = (workload, computeId) => updateDeploy((doc) => {
    doc.compute.forEach((item) => { item.workloads = item.workloads.filter((name) => name !== workload); });
    if (computeId) doc.compute.find((item) => item.id === computeId)?.workloads.push(workload);
  });
  const moveData = (data, storeId) => updateDeploy((doc) => {
    doc.stores.forEach((item) => { item.data = item.data.filter((name) => name !== data); });
    if (storeId) doc.stores.find((item) => item.id === storeId)?.data.push(data);
  });
  const addCompute = (event) => {
    const type = event.target.value;
    if (!type) return;
    updateDeploy((doc) => { doc.compute.push(E.newCompute(doc, type)); });
    event.target.value = '';
  };
  const addStore = (event) => {
    const type = event.target.value;
    if (!type) return;
    updateDeploy((doc) => { doc.stores.push(E.newStore(doc, type)); });
    event.target.value = '';
  };

  const updateResource = (key, id, prop, value) => updateDeploy((doc) => {
    const item = doc[key].find((candidate) => candidate.id === id);
    if (item) item[prop] = value;
  });
  const toggleRegions = (key, id, region) => updateDeploy((doc) => {
    const item = doc[key].find((candidate) => candidate.id === id);
    if (!item) return;
    item.regions = item.regions.includes(region) ? item.regions.filter((value) => value !== region) : [...item.regions, region];
    if (key === 'stores' && !item.regions.includes(item.primary)) item.primary = item.regions[0];
  });
  const regionChoices = (selected, onToggle, options = Object.keys(E.REGIONS)) => (
    <div className="region-options">{options.map((region) => <label key={region}><input type="checkbox" checked={selected.includes(region)} onChange={() => onToggle(region)} />{E.REGIONS[region].code}</label>)}</div>
  );
  const autoPlace = () => updateDeploy((doc) => {
    E.autoPlace(build, E.analyzeBuild(build), doc);
  });
  const applyProblemFix = (problem) => {
    if (!problem.fix?.apply) return;
    updateDeploy((doc) => problem.fix.apply(doc));
  };
  const updateComputeType = (compute, type) => updateDeploy((doc) => {
    const item = doc.compute.find((candidate) => candidate.id === compute.id);
    item.type = type;
    Object.entries(E.COMPUTE[type].def).forEach(([key, value]) => {
      if (item[key] == null || (key === 'size' && E.COMPUTE[type].sizes && !E.COMPUTE[type].sizes[item.size])) item[key] = value;
    });
  });
  const updateStoreType = (store, type) => updateDeploy((doc) => {
    const item = doc.stores.find((candidate) => candidate.id === store.id);
    item.type = type;
    const catalog = E.STORES[type];
    if (!catalog.repl.includes(item.repl)) item.repl = catalog.repl[0];
    if (catalog.usd && !catalog.usd[item.size]) item.size = 'Medium';
  });

  return (
    <section className="mode-page deploy-page">
      <div className="page-heading"><div><p className="eyebrow">Deploy</p><h1>Map logic to infrastructure</h1><p>Choose where workloads run, where data lives, and how regions connect.</p></div><span className={`pill ${check?.valid ? 'success' : 'danger'}`}>{check?.valid ? 'Deployment works' : `${check?.errors || 0} issues`}</span></div>
      <section className="deploy-card deploy-global">
        <div className="card-heading"><div><h2>{deploy.name}</h2><p>Global placement, networking, and region settings</p></div><button className="button quiet" type="button" onClick={autoPlace}>Auto-place everything</button></div>
        <label className="field-label">Deploy name<input value={deploy.name} onChange={(event) => updateDeploy((doc) => { doc.name = event.target.value || 'Untitled deploy'; })} /></label>
        <h3>Regions</h3>
        {regionChoices(deploy.regions, (region) => updateDeploy((doc) => { doc.regions = doc.regions.includes(region) ? doc.regions.filter((value) => value !== region) : [...doc.regions, region]; E.normalizeDeploy(doc); }))}
        <div className="deploy-global-grid">
          <label className="field-label">User routing
            <select value={deploy.network.steering} onChange={(event) => updateDeploy((doc) => { doc.network.steering = event.target.value; })}>
              {Object.entries(E.NET.steering).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
            </select>
          </label>
          <label className="toggle-field"><input type="checkbox" checked={deploy.peering} onChange={(event) => updateDeploy((doc) => { doc.peering = event.target.checked; })} />Connect private networks across regions</label>
          {deploy.peering && <label className="field-label">Inter-region link
            <select value={deploy.network.link} onChange={(event) => updateDeploy((doc) => { doc.network.link = event.target.value; })}>
              {Object.entries(E.NET.link).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
            </select>
          </label>}
        </div>
        <div className="region-network-list">{deploy.regions.map((region) => <div className="region-network" key={region}>
          <strong>{E.REGIONS[region]?.code || region}</strong>
          <label>Public entry<select value={deploy.network.regions[region]?.entry || 'lb'} onChange={(event) => updateDeploy((doc) => { E.normalizeDeploy(doc); doc.network.regions[region].entry = event.target.value; })}>{Object.entries(E.NET.entry).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
          <label>Request limit/s<input type="number" min="1" value={deploy.network.regions[region]?.limit || 10000} onChange={(event) => updateDeploy((doc) => { E.normalizeDeploy(doc); doc.network.regions[region].limit = Math.max(1, Number(event.target.value) || 1); })} /></label>
          <label className="toggle-field"><input type="checkbox" checked={!!deploy.network.regions[region]?.nat} onChange={(event) => updateDeploy((doc) => { E.normalizeDeploy(doc); doc.network.regions[region].nat = event.target.checked; })} />NAT for outbound traffic</label>
          <label className="toggle-field"><input type="checkbox" checked={!!deploy.network.regions[region]?.endpoints} onChange={(event) => updateDeploy((doc) => { E.normalizeDeploy(doc); doc.network.regions[region].endpoints = event.target.checked; })} />Private service endpoints</label>
        </div>)}</div>
      </section>
      <div className="deploy-grid">
        <section className="deploy-card">
          <div className="card-heading"><div><h2>Compute</h2><p>Configure size, capacity, network, and workload placement</p></div><select aria-label="Add compute" className="compact-select" defaultValue="" onChange={addCompute}><option value="">+ Add compute</option>{Object.entries(E.COMPUTE).map(([type, value]) => <option key={type} value={type}>{value.label}</option>)}</select></div>
          {deploy.compute.map((compute) => <article className="resource-editor" key={compute.id}>
            <div className="resource-editor-heading"><strong>{compute.name}</strong><button className="text-button" type="button" onClick={() => updateDeploy((doc) => { doc.compute = doc.compute.filter((item) => item.id !== compute.id); })}>Delete</button></div>
            <label className="field-label">Name<input value={compute.name} onChange={(event) => updateResource('compute', compute.id, 'name', event.target.value || 'compute')} /></label>
            <label className="field-label">Compute type<select value={compute.type} onChange={(event) => updateComputeType(compute, event.target.value)}>{Object.entries(E.COMPUTE).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            {E.COMPUTE[compute.type].sizes && <label className="field-label">Size<select value={compute.size} onChange={(event) => updateResource('compute', compute.id, 'size', event.target.value)}>{Object.keys(E.COMPUTE[compute.type].sizes).map((size) => <option key={size}>{size}</option>)}</select></label>}
            {compute.type !== 'fn' && <div className="deploy-global-grid"><label className="field-label">Minimum instances<input type="number" min="0" value={compute.min ?? 0} onChange={(event) => updateDeploy((doc) => { const item = doc.compute.find((entry) => entry.id === compute.id); item.min = Math.max(0, Number(event.target.value) || 0); if (item.max < item.min) item.max = item.min; })} /></label><label className="field-label">Maximum instances<input type="number" min="1" value={compute.max ?? 1} onChange={(event) => updateDeploy((doc) => { const item = doc.compute.find((entry) => entry.id === compute.id); item.max = Math.max(item.min || 0, Number(event.target.value) || 1); })} /></label></div>}
            {compute.type === 'fn' && <label className="field-label">Concurrency<input type="number" min="1" value={compute.concurrency || 1000} onChange={(event) => updateResource('compute', compute.id, 'concurrency', Math.max(1, Number(event.target.value) || 1))} /></label>}
            {compute.type === 'fn' && <label className="field-label">Memory (MB)<input type="number" min="128" step="128" value={compute.memory || 1024} onChange={(event) => updateResource('compute', compute.id, 'memory', Math.max(128, Number(event.target.value) || 128))} /></label>}
            <label className="toggle-field"><input type="checkbox" checked={!!compute.vpc} onChange={(event) => updateResource('compute', compute.id, 'vpc', event.target.checked)} />Private network access</label>
            <div><span className="field-label">Regions</span>{regionChoices(compute.regions, (region) => toggleRegions('compute', compute.id, region), deploy.regions)}</div>
            <div><span className="field-label">Workloads</span>{build.workloads.map((workload) => <label className="toggle-field" key={workload.id}><input type="checkbox" aria-label={`Run ${workload.name} on ${compute.name}`} checked={compute.workloads.includes(workload.name)} onChange={(event) => moveWorkload(workload.name, event.target.checked ? compute.id : '')} />{workload.name}</label>)}</div>
          </article>)}
        </section>
        <section className="deploy-card">
          <div className="card-heading"><div><h2>Data stores</h2><p>Configure product, copies, partitioning, and placement</p></div><select aria-label="Add store" className="compact-select" defaultValue="" onChange={addStore}><option value="">+ Add store</option>{Object.entries(E.STORES).map(([type, value]) => <option key={type} value={type}>{value.label}</option>)}</select></div>
          {deploy.stores.map((store) => <article className="resource-editor" key={store.id}>
            <div className="resource-editor-heading"><strong>{store.name}</strong><button className="text-button" type="button" onClick={() => updateDeploy((doc) => { doc.stores = doc.stores.filter((item) => item.id !== store.id); })}>Delete</button></div>
            <label className="field-label">Name<input value={store.name} onChange={(event) => updateResource('stores', store.id, 'name', event.target.value || 'store')} /></label>
            <label className="field-label">Store type<select value={store.type} onChange={(event) => updateStoreType(store, event.target.value)}>{Object.entries(E.STORES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
            {E.STORES[store.type].usd && <label className="field-label">Size<select value={store.size || 'Medium'} onChange={(event) => updateResource('stores', store.id, 'size', event.target.value)}>{Object.keys(E.STORES[store.type].usd).map((size) => <option key={size}>{size}</option>)}</select></label>}
            <label className="field-label">Copies across regions<select value={store.repl} onChange={(event) => updateResource('stores', store.id, 'repl', event.target.value)}>{E.STORES[store.type].repl.map((value) => <option key={value} value={value}>{E.REPL[value].label}</option>)}</select></label>
            <label className="field-label">Read from<select value={store.readFrom || 'nearest'} onChange={(event) => updateResource('stores', store.id, 'readFrom', event.target.value)}><option value="nearest">Nearest copy</option><option value="primary">Primary only</option></select></label>
            <div><span className="field-label">Regions</span>{regionChoices(store.regions, (region) => toggleRegions('stores', store.id, region), deploy.regions)}</div>
            {store.repl !== 'single' && store.repl !== 'multi-primary' && <label className="field-label">Primary region<select value={store.primary} onChange={(event) => updateResource('stores', store.id, 'primary', event.target.value)}>{store.regions.map((region) => <option key={region} value={region}>{E.REGIONS[region]?.code || region}</option>)}</select></label>}
            {E.STORES[store.type].shards && <label className="field-label">Shards<input type="number" min="1" max="64" value={store.shards || 1} onChange={(event) => updateResource('stores', store.id, 'shards', Math.max(1, Math.min(64, Number(event.target.value) || 1)))} /></label>}
            {E.STORES[store.type].partitions && <label className="field-label">Partitions<input type="number" min="1" value={store.partitions || 12} onChange={(event) => updateResource('stores', store.id, 'partitions', Math.max(1, Number(event.target.value) || 1))} /></label>}
            <div><span className="field-label">Data</span>{build.data.map((data) => <React.Fragment key={data.id}><label className="toggle-field"><input type="checkbox" aria-label={`Store ${data.name} in ${store.name}`} checked={store.data.includes(data.name)} disabled={E.storeFit(store.type, data.kind).fit === 'no' && !store.data.includes(data.name)} onChange={(event) => moveData(data.name, event.target.checked ? store.id : '')} />{data.name} <small>{shortType(data.kind)}</small></label>{store.data.includes(data.name) && (E.STORES[store.type].shards || E.STORES[store.type].autoShard) && data.fields?.length > 0 && <label className="field-label">Partition {data.name} by<select value={store.dataCfg?.[data.name]?.pk || data.partitionKey || data.fields.find((field) => field.key)?.name || data.fields[0].name} onChange={(event) => updateDeploy((doc) => { const item = doc.stores.find((entry) => entry.id === store.id); item.dataCfg = item.dataCfg || {}; item.dataCfg[data.name] = { pk: event.target.value }; })}>{data.fields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}</select></label>}</React.Fragment>)}</div>
          </article>)}
        </section>
      </div>
      {build.workloads.filter((item) => item.external).map((workload) => <section className="deploy-card external-region" key={workload.id}><strong>{workload.name}</strong><label className="field-label">External service region<select value={deploy.externals?.[workload.name]?.region || deploy.regions[0]} onChange={(event) => updateDeploy((doc) => { doc.externals = doc.externals || {}; doc.externals[workload.name] = { region: event.target.value }; })}>{Object.keys(E.REGIONS).map((region) => <option key={region} value={region}>{E.REGIONS[region].code}</option>)}</select></label></section>)}
      <section className="deploy-card"><div className="card-heading"><div><h2>Deployment checks</h2><p>Issues below can block simulation; fixes update the configuration.</p></div></div>{(check?.problems || []).map((problem, index) => <div className={`deploy-problem ${problem.sev}`} key={`${problem.msg}-${index}`}><span>{problem.msg}</span>{problem.fix?.apply && <button className="button quiet" type="button" onClick={() => applyProblemFix(problem)}>{problem.fix.label}</button>}</div>)}{!check?.problems?.length && <p className="muted">No deployment problems found.</p>}</section>
    </section>
  );
}

function SimulateMode({
  build, analysis, deploy, check, scenarioId, setScenarioId, result, runScenario,
  updateScenario, startNewScenario, duplicateScenario, deleteScenario, startPlayback,
  playback, setPlayback, trace, setTrace, startTrace
}) {
  const scenario = build.scenarios.find((item) => item.id === scenarioId);
  const mode = scenario ? E.scenarioMode(analysis, scenario) : null;
  const limiting = result?.mode === 'rate' ? result.ranked?.[0]?.[1] : result?.limits?.[0];
  const entry = scenario ? E.entryInfo(analysis, scenario.entry) : null;
  const conditions = scenario ? E.conditionsFor(analysis, scenario.entry) : [];
  useEffect(() => {
    if (!playback?.playing) return undefined;
    const timer = window.setInterval(() => setPlayback((state) => {
      if (!state?.playing) return state;
      if (state.index >= state.timeline.frames.length - 1) return { ...state, playing: false };
      return { ...state, index: state.index + 1 };
    }), Math.max(100, 500 / playback.speed));
    return () => window.clearInterval(timer);
  }, [playback?.playing, playback?.speed, playback?.timeline, setPlayback]);
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
      if (playback && (event.key === ' ' || event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        if (event.key === ' ') setPlayback((state) => ({ ...state, playing: !state.playing }));
        else setPlayback((state) => ({ ...state, playing: false, index: Math.max(0, Math.min(state.timeline.frames.length - 1, state.index + (event.key === 'ArrowRight' ? 1 : -1))) }));
      } else if (trace && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        setTrace((state) => ({ ...state, index: Math.max(0, Math.min(state.steps.length - 1, state.index + (event.key === 'ArrowRight' ? 1 : -1))) }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playback, trace, setPlayback, setTrace]);
  const setField = (key, value) => updateScenario(scenario.id, (item) => { item[key] = value; });
  const frame = playback?.timeline.frames[playback.index];
  const traceStep = trace?.steps[trace.index];
  return (
    <section className="mode-page simulate-page">
      <div className="page-heading"><div><p className="eyebrow">Simulate</p><h1>See what happens under load</h1><p>Shape a workload scenario, model its bottlenecks, then inspect playback or one request.</p></div><span className={`pill ${check?.valid ? 'success' : 'danger'}`}>{check?.valid ? 'Ready to simulate' : 'Fix Deploy issues first'}</span></div>
      <div className="scenario-card">
        <div className="scenario-controls">
          <label className="field-label">Select scenario
            <select value={scenarioId} onChange={(event) => setScenarioId(event.target.value)}>
              {!build.scenarios.length && <option value="">No scenarios yet</option>}
              {build.scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field-label">Scenario name<input aria-label="Scenario name" value={scenario?.name || ''} disabled={!scenario} onChange={(event) => setField('name', event.target.value || 'Scenario')} /></label>
          <div className="scenario-actions"><button type="button" className="button quiet" onClick={startNewScenario}>New</button><button type="button" className="button quiet" disabled={!scenario} onClick={duplicateScenario}>Duplicate</button><button type="button" className="button quiet" disabled={!scenario} onClick={deleteScenario}>Delete</button></div>
          <button type="button" className="button primary" disabled={!scenario || !check?.valid} onClick={() => runScenario(false)}>Run simulation</button>
          {mode === 'rate' && <button type="button" className="button quiet" disabled={!scenario || !check?.valid} onClick={() => runScenario(true)}>Find max throughput</button>}
        </div>
        {scenario && <div className="scenario-editor">
          <label className="field-label">Entry point<select value={scenario.entry} onChange={(event) => setField('entry', event.target.value)}>{analysis.entries.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
          {mode === 'batch' ? <>
            <label className="field-label">Rows<input type="number" min="1" value={scenario.rows || 1} onChange={(event) => setField('rows', Math.max(1, Number(event.target.value) || 1))} /></label>
            <label className="field-label">Finish goal (minutes)<input type="number" min="1" value={scenario.goalMin || 30} onChange={(event) => setField('goalMin', Math.max(1, Number(event.target.value) || 1))} /></label>
          </> : <>
            <label className="field-label">Requests<input type="number" min="1" value={scenario.count || 1} onChange={(event) => setField('count', Math.max(1, Number(event.target.value) || 1))} /></label>
            <label className="field-label">Over duration (minutes)<input type="number" min="1" value={scenario.durationMin || 60} onChange={(event) => setField('durationMin', Math.max(1, Number(event.target.value) || 1))} /></label>
            <label className="field-label">Load shape<select value={scenario.burst || 'steady'} onChange={(event) => setField('burst', event.target.value)}><option value="steady">Steady</option><option value="peak">Peak burst</option><option value="ramp">Ramp up</option></select></label>
            <label className="field-label">Latency goal (ms)<input type="number" min="1" value={scenario.goalMs || 300} onChange={(event) => setField('goalMs', Math.max(1, Number(event.target.value) || 1))} /></label>
          </>}
        </div>}
        {scenario && mode === 'rate' && <section className="scenario-subsection"><h3>Where requests come from</h3><div className="scenario-editor origin-editor">{Object.entries(E.POPS).map(([key, pop]) => <label className="field-label" key={key}>{pop.label} (%)<input type="number" min="0" max="100" value={scenario.origins?.[key] || 0} onChange={(event) => updateScenario(scenario.id, (item) => { item.origins = { ...(item.origins || {}), [key]: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }; })} /></label>)}</div></section>}
        {conditions.length > 0 && <section className="scenario-subsection"><h3>Branch choices</h3><p className="helper-text">Override the chance that each condition is true for this scenario.</p>{conditions.map((condition) => <label className="odds-control" key={condition.key}><span>{condition.w}.{condition.h}: {condition.cond}</span><input type="range" min="0" max="100" step="1" value={Math.round((scenario.odds?.[condition.key] ?? condition.def) * 100)} onChange={(event) => updateScenario(scenario.id, (item) => { item.odds = { ...(item.odds || {}), [condition.key]: Number(event.target.value) / 100 }; })} /><strong>{Math.round((scenario.odds?.[condition.key] ?? condition.def) * 100)}%</strong><button className="text-button" type="button" onClick={() => updateScenario(scenario.id, (item) => { delete item.odds?.[condition.key]; })}>Reset</button></label>)}</section>}
      </div>
      {result ? (
        <div className="results">
          {result.mode === 'rate' ? (
            <>
              <div className="metric-grid">
                <Metric label="p50 latency" value={`${Math.round(result.p50)} ms`} hint="Half of sampled requests finish faster." />
                <Metric label="p99 latency" value={`${Math.round(result.p99)} ms`} hint="99% of sampled requests finish faster." />
                <Metric label="System failures" value={`${(result.sysErr * 100).toFixed(2)}%`} hint="Requests that failed due to a system limit." />
                <Metric label="Estimated cost" value={`$${result.cost.toFixed(2)}/h`} hint="Directional estimate from model assumptions." />
              </div>
              <section className="explanation-card">
                <p className="eyebrow">What limits this run</p>
                <h2>{limiting?.ref?.name || limiting?.name || 'No single resource is saturated'}</h2>
                <p>{limiting ? `${Math.round((limiting.rho || 0) * 100)}% utilized at approximately ${Math.round(result.lambda)} requests per second.` : 'Try a higher request rate or a different design to reveal a bottleneck.'}</p>
                {Object.entries(result.why || {}).slice(0, 3).map(([reason, count]) => <div className="reason-row" key={reason}><span>{reason}</span><strong>{Math.round(count / 6)}% of sampled requests</strong></div>)}
              </section>
              <section className="explanation-card">
                <p className="eyebrow">By request path</p>
                {result.pathStats.map((item, index) => <div className="path-row" key={item.path.id}><div><strong>{item.path.label}</strong><small>{(item.share * 100).toFixed(1)}% of traffic</small></div><span>p99 {Math.round(item.p99)} ms</span><span>{(item.err * 100).toFixed(2)}% errors</span><button type="button" className="text-button" onClick={() => startTrace(index)}>Trace request</button></div>)}
              </section>
              <section className="explanation-card"><div className="card-heading"><div><p className="eyebrow">Request timeline</p><h2>Playback and single-request trace</h2></div><button className="button quiet" type="button" disabled={!check?.valid} onClick={startPlayback}>Play full scenario</button></div><p>Use a trace above to step through the calls, compute, and data operations for one path, or play the traffic shape over time.</p></section>
              {result.stress && <section className="explanation-card"><p className="eyebrow">Maximum throughput</p><h2>{result.stress.slo ? `Within goal up to about ${Math.round(result.stress.slo)} requests/s` : `Misses the goal at light load`}</h2><p>{result.stress.first ? `${result.stress.first.label} fills first: ${result.stress.first.what}.` : `Scenario load: ${Math.round(E.scenarioRate(scenario))} requests/s.`}</p><div className="stress-points">{result.stress.pts.map((point) => <span key={point.lam}>{Math.round(point.lam)}/s · p99 {Math.round(point.p99)} ms · {(point.err * 100).toFixed(1)}% errors</span>)}</div></section>}
            </>
          ) : (
            <>
              <div className="metric-grid batch-metrics">
                <Metric label="Finish time" value={`${Math.ceil(result.finishS / 60)} min`} hint={`${(result.done || 0).toLocaleString()} rows completed.`} />
                <Metric label="Limiting factor" value={limiting?.what || 'Workload path'} hint={limiting?.detail || 'Based on model capacity.'} />
                <Metric label="Timeout" value={result.timeout ? 'Yes' : 'No'} hint={result.timeout ? 'Some work may not finish.' : 'Within the modeled function limit.'} />
              </div>
              <section className="explanation-card"><p className="eyebrow">How to improve it</p><h2>Change one design choice and run again</h2><p>For file and scheduled jobs, declared parallelism and the capacity of compute or storage determine how quickly the work finishes.</p></section>
            </>
          )}
        </div>
      ) : (
        <div className="simulation-empty"><span className="simulation-symbol">◷</span><strong>Run a scenario to see the bottleneck</strong><span>Results are deterministic for the same design and seed, and every value is an approximate learning estimate.</span></div>
      )}
      {playback && frame && <section className="playback-panel">
        <div className="card-heading"><div><p className="eyebrow">Scenario playback</p><h2>{Math.round(frame.t / 60)} min · {Math.round(frame.lam)} req/s</h2></div><button type="button" className="text-button" onClick={() => setPlayback(null)}>Close</button></div>
        <div className="playback-controls"><button className="button quiet" type="button" onClick={() => setPlayback((state) => ({ ...state, playing: !state.playing }))}>{playback.playing ? 'Pause' : 'Play'}</button><button className="button quiet" type="button" onClick={() => setPlayback((state) => ({ ...state, playing: false, index: Math.max(0, state.index - 1) }))}>Back</button><button className="button quiet" type="button" onClick={() => setPlayback((state) => ({ ...state, playing: false, index: Math.min(state.timeline.frames.length - 1, state.index + 1) }))}>Step</button><label>Speed<select value={playback.speed} onChange={(event) => setPlayback((state) => ({ ...state, speed: Number(event.target.value) }))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><span>p50 {Math.round(frame.p50)} ms · p99 {Math.round(frame.p99)} ms · {(frame.err * 100).toFixed(2)}% errors</span></div>
        <input aria-label="Playback position" className="playback-seek" type="range" min="0" max={playback.timeline.frames.length - 1} value={playback.index} onChange={(event) => setPlayback((state) => ({ ...state, playing: false, index: Number(event.target.value) }))} />
        <div className="playback-resources">{Object.entries(frame.res).map(([key, resource]) => <div key={key}><span>{resource.label}</span><strong>{Math.round(resource.rho * 100)}% busy</strong><small>{resource.inst ? `${resource.inst} instances` : resource.what || ''}</small><i><b style={{ width: `${Math.min(100, resource.rho * 100)}%` }} /></i></div>)}</div>
        <div className="playback-events">{playback.timeline.events.filter((event) => event.i <= playback.index).slice(-5).map((event, index) => <p key={`${event.i}-${index}`}>{event.msg}</p>)}</div>
      </section>}
      {trace && traceStep && <section className="playback-panel trace-panel">
        <div className="card-heading"><div><p className="eyebrow">Single-request trace</p><h2>{trace.label}</h2></div><button type="button" className="text-button" onClick={() => setTrace(null)}>Close</button></div>
        <div className="playback-controls"><button className="button quiet" disabled={trace.index <= 0} onClick={() => setTrace((state) => ({ ...state, index: state.index - 1 }))}>Back</button><button className="button quiet" disabled={trace.index >= trace.steps.length - 1} onClick={() => setTrace((state) => ({ ...state, index: state.index + 1 }))}>Step</button><span>Step {trace.index + 1} of {trace.steps.length} · {Math.round(traceStep.start + traceStep.dur)} ms of {Math.round(trace.steps.at(-1)?.start + trace.steps.at(-1)?.dur || 0)} ms</span></div>
        <div className="trace-step"><strong>{traceStep.label}</strong><p>{traceStep.why || traceStep.kind}</p><small>{Math.round(traceStep.dur)} ms{traceStep.wait > 0.5 ? ` · ${Math.round(traceStep.wait)} ms waiting` : ''}{traceStep.rho != null ? ` · ${Math.round(traceStep.rho * 100)}% busy` : ''}</small></div>
        <ol className="trace-steps">{trace.steps.map((item, index) => <li className={index === trace.index ? 'current' : index < trace.index ? 'complete' : ''} key={`${item.label}-${index}`}><button type="button" onClick={() => setTrace((state) => ({ ...state, index }))}><span>{item.label}</span><strong>{index <= trace.index ? `${Math.round(item.dur)} ms` : '—'}</strong></button></li>)}</ol>
      </section>}
    </section>
  );
}

function Metric({ label, value, hint }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function Root() {
  return <ReactFlowProvider><App /></ReactFlowProvider>;
}

createRoot(document.getElementById('root')).render(<Root />);
