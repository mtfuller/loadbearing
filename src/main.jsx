import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  useReactFlow,
  useNodesInitialized
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { DeployMode } from './deploy-mode.jsx';
import { SimulateCanvas } from './simulate-canvas.jsx';
import { EXAMPLE_META, LEVEL_ORDER } from './examples-meta.js';
import { Term } from './term.jsx';

const E = window.Loadbearing;
const CHECKOUT_EXAMPLE = {
  id: 'checkout', name: 'Checkout system',
  summary: 'A store checkout with carts, payments, fraud scoring, fulfillment events, a product import and a nightly report.',
  lesson: 'Step through a checkout on mock data, then compare a one-region monolith with global services.',
  build: E.exampleBuild(), deploys: E.exampleDeploys()
};
const size = (example) => example.build.workloads.length + example.build.data.length;
// Simplest first: by level, then by how many boxes the Build has.
const SYSTEM_EXAMPLES = [...E.exampleSystems(), CHECKOUT_EXAMPLE].sort((a, b) =>
  (LEVEL_ORDER[EXAMPLE_META[a.id]?.level] ?? 9) - (LEVEL_ORDER[EXAMPLE_META[b.id]?.level] ?? 9) || size(a) - size(b));
const STORAGE_KEY = 'loadbearing-react-work';
const TIPS_KEY = 'loadbearing-tips-hidden';
const hasSavedWork = () => { try { return [STORAGE_KEY, 'loadbearing-work', 'meridian-v3-work'].some((key) => localStorage.getItem(key)); } catch { return false; } };
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
  const [returning] = useState(hasSavedWork);
  const [docs, setDocs] = useState(initialDocs);
  // First visit opens on the example gallery; returning visitors pick up where they left off.
  const [mode, setMode] = useState(() => returning ? 'build' : 'home');
  const [tipsHidden, setTipsHidden] = useState(() => { try { return localStorage.getItem(TIPS_KEY) === '1'; } catch { return false; } });
  const [tipIndex, setTipIndex] = useState(0);
  const [selection, setSelection] = useState(null);
  const [deployFocus, setDeployFocus] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [scenarioId, setScenarioId] = useState('');
  const [result, setResult] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [experiment, setExperiment] = useState(null);
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
  const [offline, setOffline] = useState([]);
  const downRegions = useMemo(() => offline.filter((id) => deploy.regions.includes(id)), [offline, deploy]);
  const simDeploy = useMemo(() => {
    if (!downRegions.length) return deploy;
    const copy = duplicate(deploy);
    downRegions.forEach((id) => E.removeRegion(copy, id));
    E.normalizeDeploy(copy);
    return copy;
  }, [deploy, downRegions]);
  const simCheck = useMemo(
    () => !downRegions.length ? deployCheck : (analysis.valid && simDeploy.regions.length ? E.validateDeploy(docs.build, analysis, simDeploy) : null),
    [downRegions, deployCheck, docs.build, analysis, simDeploy]
  );
  const simOk = !!simCheck?.valid;
  const toggleOffline = (id) => { setOffline((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); setPlayback(null); setTrace(null); setResult(null); setComparison(null); setExperiment(null); };
  const activeExample = SYSTEM_EXAMPLES.find((item) => item.build.id === docs.build.id);

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
    setComparison(null); setExperiment(null);
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
    setComparison(null); setExperiment(null);
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
    setComparison(null); setExperiment(null);
    setPlayback(null);
    setTrace(null);
  };

  const evaluateScenario = (scenario, targetDeploy, stress = false) => {
    const targetAnalysis = E.analyzeBuild(docs.build);
    const targetCheck = E.validateDeploy(docs.build, targetAnalysis, targetDeploy);
    if (!targetCheck.valid) throw new Error(`“${targetDeploy.name}” is not ready to simulate.`);
    const model = E.compileModel(docs.build, targetAnalysis, targetDeploy, targetCheck);
    if (E.scenarioMode(targetAnalysis, scenario) === 'batch') return E.evaluateBatch(model, scenario);
    const rate = E.evaluateRate(model, scenario, { N: 1500, seed: 11 });
    const stressResult = stress ? E.stressTest(model, scenario) : null;
    return stressResult ? { ...rate, stress: stressResult } : rate;
  };

  const runScenario = (stress = false) => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !simOk) return;
    setResult(evaluateScenario(scenario, simDeploy, stress));
    setComparison(null); setExperiment(null);
  };

  const compareDeploys = () => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !canSimulate || !activeExample) return;
    const [first, second] = activeExample.deploys;
    const otherDeploy = deploy.id === first.id ? second : first;
    const other = duplicate(otherDeploy);
    E.normalizeDeploy(other);
    const otherCheck = E.validateDeploy(docs.build, analysis, other);
    if (!otherCheck.valid) {
      setMessage(`“${other.name}” has deployment issues and cannot be compared.`);
      return;
    }
    const currentResult = evaluateScenario(scenario, deploy);
    const otherResult = evaluateScenario(scenario, other);
    setResult(currentResult);
    setExperiment(null);
    setComparison({
      scenarioName: scenario.name,
      goalMs: scenario.goalMs,
      left: { name: deploy.name, result: currentResult },
      right: { name: other.name, result: otherResult }
    });
  };

  const hideTips = (hidden) => { setTipsHidden(hidden); try { localStorage.setItem(TIPS_KEY, hidden ? '1' : '0'); } catch { /* per-viewer convenience only */ } };
  const openExample = (example, target = 'build') => {
    const build = duplicate(example.build);
    const starterDeploy = duplicate(example.deploys[0]);
    E.normalizeDeploy(starterDeploy);
    commit((next) => {
      next.build = build;
      next.deploy = starterDeploy;
      return next;
    });
    setScenarioId(build.scenarios[0]?.id || '');
    setSelection(null);
    setResult(null);
    setComparison(null); setExperiment(null);
    setPlayback(null);
    setTrace(null);
    setTipIndex(0);
    setMode(target);
  };

  // Experiments: break or change one thing on a copy of the design, then compare or watch it happen.
  const runExperiment = (optionId, play) => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !simOk || E.scenarioMode(analysis, scenario) !== 'rate') return;
    const option = E.faultOptions(docs.build, simDeploy).find((item) => item.id === optionId);
    if (!option) return;
    const applied = E.applyFault(docs.build, analysis, simDeploy, scenario, option.fault);
    if (!applied) { setMessage('This design has deployment issues, so the experiment cannot run.'); return; }
    const model = E.compileModel(docs.build, analysis, simDeploy, simCheck);
    if (play) {
      setPlayback({ timeline: E.simulateTimeline(model, scenario, { frames: 48, N: 200, fault: { at: 0.5, M: applied.M, scale: applied.scale, warm: applied.warm, label: `Experiment: ${option.label.charAt(0).toLowerCase()}${option.label.slice(1)}`, notes: applied.notes } }), index: 0, speed: 1, playing: true, experiment: option.label });
      setTrace(null);
      return;
    }
    const before = E.evaluateRate(model, scenario, { N: 1500, seed: 11 });
    const after = E.evaluateRate(applied.M, applied.sc, { N: 1500, seed: 11 });
    setComparison(null);
    setResult(before);
    setExperiment({ label: option.label, notes: applied.notes, before, after, goalMs: scenario.goalMs, summary: E.compareExperiment(scenario, before, after), beforeVerdict: E.rateVerdict(scenario, before), afterVerdict: E.rateVerdict(applied.sc, after) });
  };

  const startPlayback = () => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !simOk || E.scenarioMode(analysis, scenario) !== 'rate') return;
    const model = E.compileModel(docs.build, analysis, simDeploy, simCheck);
    setPlayback({ timeline: E.simulateTimeline(model, scenario, { frames: 48, N: 200 }), index: 0, speed: 1, playing: true });
    setTrace(null);
  };

  const startTrace = (pathIndex) => {
    const scenario = docs.build.scenarios.find((item) => item.id === scenarioId);
    if (!scenario || !simOk) return;
    const model = E.compileModel(docs.build, analysis, simDeploy, simCheck);
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

  // Live playground: any change to the scenario or deployment recomputes a quick result without pressing Run.
  const liveScenario = docs.build.scenarios.find((item) => item.id === scenarioId);
  useEffect(() => {
    if (mode !== 'simulate' || !liveScenario || !simOk || E.scenarioMode(analysis, liveScenario) !== 'rate') return undefined;
    const timer = window.setTimeout(() => {
      const model = E.compileModel(docs.build, analysis, simDeploy, simCheck);
      setResult((current) => (current && !current.live ? current : { ...E.evaluateRate(model, liveScenario, { N: 400, seed: 11 }), live: true }));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mode, liveScenario, docs.build, analysis, simDeploy, simCheck, simOk]);

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

  // Jump from a Simulate suggestion to the thing it names, in Deploy or Build.
  const openTarget = (target) => {
    if (!target) return;
    if (target.kind === 'build') {
      const workload = docs.build.workloads.find((item) => item.name === target.workload);
      if (workload) setSelection({ type: 'workload', id: workload.id });
      setMode('build');
      return;
    }
    const list = target.kind === 'compute' ? deploy.compute : deploy.stores;
    const item = list.find((entry) => entry.id === target.id);
    if (!item) return;
    setDeployFocus(`${target.kind === 'compute' ? 'c' : 's'}:${item.id}@${item.regions?.[0] || deploy.regions[0]}`);
    setMode('deploy');
  };

  const switchMode = (nextMode) => {
    if (nextMode === 'deploy' && !analysis.valid) return;
    if (nextMode === 'simulate' && !canSimulate) return;
    setDeployFocus(null);
    setMode(nextMode);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" aria-label="Loadbearing home" onClick={(event) => { event.preventDefault(); setMode('home'); }}>
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
          <button type="button" className={`button quiet ${mode === 'home' ? 'active' : ''}`} onClick={() => setMode('home')}>Explore examples</button>
          {activeExample && tipsHidden && mode !== 'home' && <button type="button" className="button quiet" onClick={() => hideTips(false)}>Tips</button>}
          <button type="button" className="button quiet" onClick={() => setDialog(true)}>Save &amp; load</button>
          <button type="button" className="button quiet" onClick={undo} disabled={!history.length}>Undo</button>
          <button type="button" className="button quiet" onClick={redo} disabled={!future.length}>Redo</button>
          <button type="button" className="button quiet" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
        </div>
      </header>

      {message && <div className="notice" role="status">{message}<button type="button" onClick={() => setMessage('')}>Dismiss</button></div>}
      {mode !== 'home' && activeExample && !tipsHidden && EXAMPLE_META[activeExample.id] && <TryThis
        example={activeExample}
        tips={EXAMPLE_META[activeExample.id].tries}
        index={tipIndex}
        setIndex={setTipIndex}
        mode={mode}
        goTo={switchMode}
        onHide={() => hideTips(true)}
      />}
      {mode === 'home' && <div className="home-scroll"><HomeGallery
        examples={SYSTEM_EXAMPLES}
        current={returning || history.length ? docs.build : null}
        activeId={activeExample?.id}
        onOpen={openExample}
        onContinue={() => setMode('build')}
      /></div>}
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
      {mode === 'deploy' && <DeployMode build={docs.build} analysis={analysis} deploy={deploy} check={deployCheck} updateDeploy={updateDeploy} focusKey={deployFocus} />}
      {mode === 'simulate' && (
        <SimulateMode
          build={docs.build}
          analysis={analysis}
          deploy={simDeploy}
          check={simCheck}
          offline={downRegions}
          toggleOffline={toggleOffline}
          updateDeploy={updateDeploy}
          scenarioId={scenarioId}
          setScenarioId={selectScenario}
          result={result}
          runScenario={runScenario}
          activeExample={activeExample}
          comparison={comparison}
          compareDeploys={compareDeploys}
          experiment={experiment}
          setExperiment={setExperiment}
          runExperiment={runExperiment}
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
          openTarget={openTarget}
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
  const { screenToFlowPosition, fitView } = useReactFlow();
  useEffect(() => setBuildName(build.name), [build.name]);
  // Fit the whole Build into view when a different Build opens (first load, an example, a library load).
  const nodesReady = useNodesInitialized();
  useEffect(() => { if (nodesReady) fitView({ padding: 0.08 }); }, [nodesReady, build.id, fitView]);
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
  // Names the code editor can complete: request handlers to call, data to touch, and each data node's fields.
  const completionNames = useMemo(() => ({
    handlers: build.workloads.flatMap((workload) => Object.keys(analysis.W[workload.name]?.handlers || {})
      .filter((handler) => !/\s/.test(handler)).map((handler) => `${workload.name}.${handler}`)),
    data: build.data.map((item) => ({ name: item.name, fields: (item.fields || []).map((field) => field.name) }))
  }), [analysis, build]);

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
            {build.workloads.length + build.data.length > 24 && <MiniMap pannable zoomable position="top-right" nodeColor={(node) => node.type === 'data' ? '#e5b35d' : '#8588e9'} />}
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
            names={completionNames}
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

// What the word being typed could become, from the text before the cursor on its line.
function completionsFor(before, names) {
  if (!names) return null;
  const dataNames = names.data.map((item) => item.name);
  let match = before.match(/\bcall\s+([\w.]*)$/);
  if (match) return { partial: match[1], options: names.handlers };
  match = before.match(/\b(?:read|insert|update|upsert|delete|publish)\s+(\w*)$/) || before.match(/\bwhen\s+(?:message|file|change)\s+(\w*)$/) || before.match(/\bin\s+(\w*)$/);
  if (match) return { partial: match[1], options: dataNames };
  match = before.match(/\b(?:read|update|upsert|delete)\s+(\w+)\s+(?:by|where)\s+(\w*)$/);
  if (match) return { partial: match[2], options: names.data.find((item) => item.name === match[1])?.fields || [] };
  return null;
}

const STATEMENT_HELP = {
  call: 'Wait for another workload to handle a request.',
  read: 'Read rows. Add by field to look up by that field, and many N for several rows.',
  insert: 'Write a new row or object.',
  update: 'Change existing rows found by a field.',
  publish: 'Send a message to a queue, stream or topic. Consumers handle it later.',
  if: 'Branch on a condition. @50% is how often it is true in simulations.',
  'for each': 'Repeat for each item. parallel N handles N at once.',
  parallel: 'Run the statements inside at the same time.',
  compute: 'Spend CPU time on the current compute.',
  error: 'End the request with an error code.',
  when: 'Start a new handler: a request, or message, file, change or schedule trigger.'
};

function NodeInspector({ type, node, updateBuild, onDelete, names }) {
  const isWorkload = type === 'workload';
  const [name, setName] = useState(node.name);
  const [code, setCode] = useState(node.code || '');
  const codeRef = useRef(null);
  const [cursor, setCursor] = useState(null);
  // Place the caret in the same commit as a programmatic edit, before the next keystroke can land.
  const pendingCaret = useRef(null);
  useLayoutEffect(() => {
    const textarea = codeRef.current;
    if (pendingCaret.current == null || !textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [code]);
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
  const lineBefore = cursor == null ? '' : code.slice(code.lastIndexOf('\n', cursor - 1) + 1, cursor);
  const completion = completionsFor(lineBefore, names);
  const suggestions = completion ? completion.options.filter((option) => option.toLowerCase().startsWith(completion.partial.toLowerCase()) && option !== completion.partial).slice(0, 8) : [];
  const complete = (option) => {
    const start = cursor - completion.partial.length;
    const next = `${code.slice(0, start)}${option}${code.slice(cursor)}`;
    const at = start + option.length;
    pendingCaret.current = at;
    setCode(next);
    setCursor(at);
  };
  const insertSnippet = (snippet) => {
    const textarea = codeRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${code.slice(0, start)}${snippet}${code.slice(end)}`;
    pendingCaret.current = start + snippet.length;
    setCode(next);
    setCursor(start + snippet.length);
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
            <textarea ref={codeRef} className="code-input" value={code} spellCheck="false"
              onChange={(event) => { setCode(event.target.value); setCursor(event.target.selectionStart); }}
              onSelect={(event) => setCursor(event.target.selectionStart)}
              onKeyDown={(event) => { if (event.key === 'Tab' && suggestions.length) { event.preventDefault(); complete(suggestions[0]); return; } indentCode(event); }}
              onBlur={flushCode} />
          </label>
          {suggestions.length > 0 && <div className="completions" aria-label="Suggestions"><span>Tab to use</span>{suggestions.map((option) => <button type="button" key={option} onMouseDown={(event) => event.preventDefault()} onClick={() => complete(option)}>{option}</button>)}</div>}
          <div className="snippet-tools" aria-label="Insert code statement">
            {['call', 'read', 'insert', 'update', 'publish', 'if', 'for each', 'parallel', 'compute', 'error', 'when'].map((snippet) => <button key={snippet} type="button" title={STATEMENT_HELP[snippet]} onMouseDown={(event) => event.preventDefault()} onClick={() => insertSnippet(({
              call: 'call Workload.Handler\n', read: 'read Data by field\n', insert: 'insert Data\n', update: 'update Data by id\n',
              publish: 'publish Data\n', if: 'if Condition @50% {\n  \n}\n', 'for each': 'for each item in Data parallel 10 {\n  \n}\n',
              parallel: 'parallel {\n  \n}\n', compute: 'compute 15ms\n', error: 'error 500\n', when: 'when Handler {\n  \n}\n'
            })[snippet])}>{snippet}</button>)}
          </div>
          <p className="helper-text">Connections update from <code>call</code>, data operations, and event triggers. Use the statement chips for syntax patterns; press Tab to indent.</p>
          <details className="language-reference" open={!node.code || node.code.trim().length < 40}><summary>Language reference</summary><p><code>when Name {'{ }'}</code> handles requests. Use <code>when message Data {'{ }'}</code>, <code>when file Data {'{ }'}</code>, or <code>when schedule "daily 02:00" {'{ }'}</code> for background work.</p><p><code>call Service.Handler</code> waits for another workload. <code>read Data by field many 20</code> reads rows; <code>insert</code>, <code>update</code>, <code>upsert</code>, and <code>delete</code> write data. <code>publish Data</code> sends a message.</p><p><code>if Condition @10% {'{ }'} else {'{ }'}</code> branches. <code>for each item in File parallel 50 {'{ }'}</code> repeats in batches. <code>parallel {'{ }'}</code> runs statements concurrently. <code>compute 15ms</code> models CPU time; <code>error 402</code> and <code>return</code> end a request.</p></details>
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

function HomeGallery({ examples, current, activeId, onOpen, onContinue }) {
  return (
    <section className="home-page" aria-labelledby="home-title">
      <div className="home-intro">
        <p className="eyebrow">Explore examples</p>
        <h1 id="home-title">Pick a system and see how it behaves under load</h1>
        <p>Each example is a working design: its logic, a starter deployment, a scaled one, and traffic to run. Open one, run it, change one thing, and run it again.</p>
      </div>
      {current && <div className="continue-card"><div><span>Continue where you left off</span><strong>{current.name}</strong></div><button type="button" className="button" onClick={onContinue}>Continue</button></div>}
      <div className="gallery">
        {examples.map((example) => {
          const meta = EXAMPLE_META[example.id] || {};
          const parts = `${example.build.workloads.length} workloads · ${example.build.data.length} data`;
          return (
            <article className={`gallery-card ${example.id === activeId ? 'current' : ''}`} key={example.id}>
              <div className="gallery-top"><span className={`level level-${(meta.level || '').toLowerCase()}`}>{meta.level || 'Example'}</span><small>{parts}</small></div>
              <h2>{example.name}</h2>
              <p>{example.summary}</p>
              {meta.concepts && <ul className="concepts" aria-label="Concepts">{meta.concepts.map((concept) => <li key={concept}>{concept}</li>)}</ul>}
              <p className="gallery-lesson">{example.lesson}</p>
              <div className="gallery-actions">
                <button type="button" className="button primary" onClick={() => onOpen(example, 'simulate')} aria-label={`Run ${example.name}`}>Run it</button>
                <button type="button" className="button" onClick={() => onOpen(example, 'build')} aria-label={`Open ${example.name}`}>Look inside</button>
              </div>
            </article>
          );
        })}
      </div>
      <p className="home-footnote">Everything runs in your browser. Results are approximate and meant for comparing designs, not for sizing a real system.</p>
    </section>
  );
}

// One suggested experiment at a time for the open example. Hidden for good with Hide; the Tips button brings it back.
function TryThis({ example, tips, index, setIndex, mode, goTo, onHide }) {
  const tip = tips[Math.min(index, tips.length - 1)];
  const modeName = { build: 'Build', deploy: 'Deploy', simulate: 'Simulate' };
  return (
    <aside className="try-this" aria-label="Try this">
      <span className="try-label">Try this · {example.name}</span>
      <span className="try-count">{index + 1} of {tips.length}</span>
      <p>{tip.text}</p>
      {tip.mode !== mode && <button type="button" className="text-button" onClick={() => goTo(tip.mode)}>Go to {modeName[tip.mode]}</button>}
      <div className="try-nav">
        <button type="button" className="text-button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Back</button>
        <button type="button" className="text-button" disabled={index >= tips.length - 1} onClick={() => setIndex(index + 1)}>Next idea</button>
        <button type="button" className="text-button quiet" onClick={onHide}>Hide</button>
      </div>
    </aside>
  );
}


function SimulateMode({
  build, analysis, deploy, check, offline = [], toggleOffline, updateDeploy, scenarioId, setScenarioId, result, runScenario,
  activeExample, comparison, compareDeploys, experiment, setExperiment, runExperiment,
  updateScenario, startNewScenario, duplicateScenario, deleteScenario, startPlayback,
  playback, setPlayback, trace, setTrace, startTrace, openTarget
}) {
  const scenario = build.scenarios.find((item) => item.id === scenarioId);
  const mode = scenario ? E.scenarioMode(analysis, scenario) : null;
  const limiting = result?.mode === 'rate' ? (result.pathRanked || result.ranked)?.[0]?.[1] : result?.limits?.[0];
  const verdict = result?.mode === 'rate' && scenario ? E.rateVerdict(scenario, result) : null;
  const tips = result?.mode === 'rate' && scenario && check?.valid ? E.suggestionsFor(E.compileModel(build, analysis, deploy, check), scenario, result) : [];
  const behind = result?.mode === 'rate' ? Object.entries(result.lags || {}) : [];
  const entry = scenario ? E.entryInfo(analysis, scenario.entry) : null;
  const conditions = scenario ? E.conditionsFor(analysis, scenario.entry) : [];
  const hotData = useMemo(() => {
    if (!scenario || mode !== 'rate' || !analysis.valid) return [];
    const names = new Set();
    E.enumeratePaths(analysis, scenario.entry, scenario.odds || {}).forEach((path) => path.steps.forEach((step) => { if ((step.k === 'data' || step.k === 'publish') && step.d) names.add(step.d); }));
    // Queues, topics and files have no keys to be hot; tables, key-value, documents and streams do.
    const kinds = Object.fromEntries(build.data.map((item) => [item.name, item.kind]));
    return [...names].filter((name) => !['queue', 'topic', 'file', 'blob'].includes(kinds[name]));
  }, [analysis, build.data, scenario, mode]);
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
    <section className="workspace sim-workspace">
      <aside className="sidebar sim-sidebar">
        <div className="sidebar-heading"><div><p className="eyebrow">Simulate</p><h1>See what happens under load</h1></div></div>
        <p className="sidebar-copy">Shape a scenario here, then watch traffic move through your infrastructure.</p>
        <span className={`pill ${check?.valid ? 'success' : 'danger'}`}>{check?.valid ? 'Ready to simulate' : 'Fix Deploy issues first'}</span>
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
          {activeExample && <button type="button" className="button quiet" disabled={!scenario || !check?.valid} onClick={compareDeploys}>Compare designs</button>}
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
        {scenario && mode === 'rate' && hotData.length > 0 && <section className="scenario-subsection" aria-label="Hot keys"><h3><Term k="hotKey">Hot keys</Term></h3><p className="helper-text">Share of each data's traffic that goes to one single key. 0% means traffic is spread evenly.</p>{hotData.map((name) => <label className="odds-control" key={name}><span>{name}</span><input type="range" min="0" max="80" step="5" aria-label={`Hot key share for ${name}`} value={Math.round((scenario.hot?.[name] || 0) * 100)} onChange={(event) => updateScenario(scenario.id, (item) => { const next = { ...(item.hot || {}) }; const value = Number(event.target.value) / 100; if (value > 0) next[name] = value; else delete next[name]; item.hot = next; })} /><strong>{Math.round((scenario.hot?.[name] || 0) * 100)}%</strong></label>)}</section>}
        {conditions.length > 0 && <section className="scenario-subsection"><h3>Branch choices</h3><p className="helper-text">Override the chance that each condition is true for this scenario.</p>{conditions.map((condition) => <label className="odds-control" key={condition.key}><span>{condition.w}.{condition.h}: {condition.cond}</span><input type="range" min="0" max="100" step="1" value={Math.round((scenario.odds?.[condition.key] ?? condition.def) * 100)} onChange={(event) => updateScenario(scenario.id, (item) => { item.odds = { ...(item.odds || {}), [condition.key]: Number(event.target.value) / 100 }; })} /><strong>{Math.round((scenario.odds?.[condition.key] ?? condition.def) * 100)}%</strong><button className="text-button" type="button" onClick={() => updateScenario(scenario.id, (item) => { delete item.odds?.[condition.key]; })}>Reset</button></label>)}</section>}
        {scenario && mode === 'rate' && check?.valid && <ExperimentPicker build={build} deploy={deploy} runExperiment={runExperiment} />}
        <section className="scenario-subsection live-tweaks" aria-label="Playground controls">
          <h3>Playground</h3>
          <p className="helper-text">Change anything here and the picture updates right away. Regions can go offline to see what survives.</p>
          <div className="region-toggles">{[...deploy.regions, ...offline].map((id) => {
            const down = offline.includes(id);
            return <button type="button" key={id} className={`region-toggle ${down ? '' : 'on'}`} aria-pressed={!down} aria-label={down ? `Bring ${E.REGIONS[id].code} back online` : `Take ${E.REGIONS[id].code} offline`} onClick={() => toggleOffline(id)}>{down ? '✕ ' : '✓ '}{E.REGIONS[id].code}{down ? ' offline' : ''}</button>;
          })}</div>
          {offline.length > 0 && !check?.valid && <p className="helper-text">With {offline.map((id) => E.REGIONS[id].code).join(', ')} offline this design stops working{check?.problems?.find((item) => item.sev === 'error') ? `: ${check.problems.find((item) => item.sev === 'error').msg}` : '.'}</p>}
          {deploy.compute.filter((item) => item.type !== 'fn').map((item) => (
            <div className="tweak-row" key={item.id}><span>{item.name}</span>
              <label>Max instances<input type="number" min="1" aria-label={`Max instances for ${item.name}`} value={item.max ?? 1} onChange={(event) => updateDeploy((doc) => { const found = doc.compute.find((entry) => entry.id === item.id); if (found) { found.max = Math.max(1, Number(event.target.value) || 1); if ((found.min ?? 0) > found.max) found.min = found.max; } })} /></label>
            </div>
          ))}
          {deploy.stores.filter((item) => item.cache?.hit > 0).map((item) => (
            <div className="tweak-row" key={`cache-${item.id}`}><span>{item.name} cache</span>
              <label>Hit ratio %<input type="number" min="0" max="99" aria-label={`Cache hit ratio for ${item.name}`} value={Math.round(item.cache.hit * 100)} onChange={(event) => updateDeploy((doc) => { const found = doc.stores.find((entry) => entry.id === item.id); if (found) found.cache = { hit: Math.max(0, Math.min(99, Number(event.target.value) || 0)) / 100 }; })} /></label>
            </div>
          ))}
          <div className="tweak-row"><span><Term k="retries">Retries</Term></span>
            <label>Tries again<input type="number" min="0" max="5" aria-label="Retries" value={deploy.network?.retries || 0} onChange={(event) => updateDeploy((doc) => { doc.network.retries = Math.max(0, Math.min(5, Number(event.target.value) || 0)); })} /></label>
          </div>
          {deploy.stores.filter((item) => E.STORES[item.type].shards).map((item) => (
            <div className="tweak-row" key={item.id}><span>{item.name}</span>
              <label>Shards<input type="number" min="1" max="64" aria-label={`Shards for ${item.name}`} value={item.shards || 1} onChange={(event) => updateDeploy((doc) => { const found = doc.stores.find((entry) => entry.id === item.id); if (found) found.shards = Math.max(1, Math.min(64, Number(event.target.value) || 1)); })} /></label>
            </div>
          ))}
        </section>
          {mode === 'rate' && <button type="button" className="button quiet" disabled={!scenario || !check?.valid} onClick={startPlayback}>Play full scenario</button>}
        </div>
      </aside>
      <div className="canvas-column sim-main">
        {check?.valid ? <SimulateCanvas build={build} analysis={analysis} deploy={deploy} result={result} playback={playback} trace={trace} offline={offline} onToggleOffline={toggleOffline} /> : <div className="simulation-empty"><span className="simulation-symbol">!</span><strong>Fix your Deploy first</strong><span>Open Deploy and apply the fixes it suggests, then come back to run a scenario.</span></div>}
      {comparison && <ComparisonPanel comparison={comparison} />}
      {experiment && <ExperimentPanel experiment={experiment} onClose={() => setExperiment(null)} />}
      {playback && frame && <section className="playback-panel">
        <div className="card-heading"><div><p className="eyebrow">Scenario playback</p><h2>{Math.round(frame.t / 60)} min · {Math.round(frame.lam)} req/s</h2>{playback.experiment && <small className={`fault-flag ${frame.broken ? 'on' : ''}`}>{frame.broken ? `Now: ${playback.experiment.charAt(0).toLowerCase()}${playback.experiment.slice(1)}` : `Halfway: ${playback.experiment.charAt(0).toLowerCase()}${playback.experiment.slice(1)}`}</small>}</div><button type="button" className="text-button" onClick={() => setPlayback(null)}>Close</button></div>
        <div className="playback-controls"><button className="button quiet" type="button" onClick={() => setPlayback((state) => ({ ...state, playing: !state.playing }))}>{playback.playing ? 'Pause' : 'Play'}</button><button className="button quiet" type="button" onClick={() => setPlayback((state) => ({ ...state, playing: false, index: Math.max(0, state.index - 1) }))}>Back</button><button className="button quiet" type="button" onClick={() => setPlayback((state) => ({ ...state, playing: false, index: Math.min(state.timeline.frames.length - 1, state.index + 1) }))}>Step</button><label>Speed<select value={playback.speed} onChange={(event) => setPlayback((state) => ({ ...state, speed: Number(event.target.value) }))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><span>{frame.err >= 0.999 ? 'Every request fails' : `p50 ${Math.round(frame.p50)} ms · p99 ${Math.round(frame.p99)} ms`} · {(frame.err * 100).toFixed(2)}% errors</span></div>
        <input aria-label="Playback position" className="playback-seek" type="range" min="0" max={playback.timeline.frames.length - 1} value={playback.index} onChange={(event) => setPlayback((state) => ({ ...state, playing: false, index: Number(event.target.value) }))} />
        <div className="playback-resources">{Object.entries(frame.res).map(([key, resource]) => <div key={key}><span>{resource.label}</span><strong className={resource.down ? 'bad-text' : ''}>{resource.down ? 'Down' : `${Math.round(resource.rho * 100)}% busy`}</strong><small>{resource.down ? 'part of the experiment' : resource.inst ? `${resource.inst} instances` : resource.what || ''}</small><i><b style={{ width: `${Math.min(100, resource.rho * 100)}%` }} /></i></div>)}</div>
        <div className="playback-events">{playback.timeline.events.filter((event) => event.i <= playback.index).slice(playback.experiment && frame.broken ? -8 : -5).map((event, index) => <p key={`${event.i}-${index}`} className={event.fault ? 'fault-event' : ''}>{event.msg}</p>)}</div>
      </section>}
      {trace && traceStep && <section className="playback-panel trace-panel">
        <div className="card-heading"><div><p className="eyebrow">Single-request trace</p><h2>{trace.label}</h2></div><button type="button" className="text-button" onClick={() => setTrace(null)}>Close</button></div>
        <div className="playback-controls"><button className="button quiet" disabled={trace.index <= 0} onClick={() => setTrace((state) => ({ ...state, index: state.index - 1 }))}>Back</button><button className="button quiet" disabled={trace.index >= trace.steps.length - 1} onClick={() => setTrace((state) => ({ ...state, index: state.index + 1 }))}>Step</button><span>Step {trace.index + 1} of {trace.steps.length} · {Math.round(traceStep.start + traceStep.dur)} ms of {Math.round(trace.steps.at(-1)?.start + trace.steps.at(-1)?.dur || 0)} ms</span></div>
        <div className="trace-step"><strong>{traceStep.label}</strong><p>{traceStep.why || traceStep.kind}</p><small>{Math.round(traceStep.dur)} ms{traceStep.wait > 0.5 ? ` · ${Math.round(traceStep.wait)} ms waiting` : ''}{traceStep.rho != null ? ` · ${Math.round(traceStep.rho * 100)}% busy` : ''}</small></div>
        <ol className="trace-steps">{trace.steps.map((item, index) => <li className={index === trace.index ? 'current' : index < trace.index ? 'complete' : ''} key={`${item.label}-${index}`}><button type="button" onClick={() => setTrace((state) => ({ ...state, index }))}><span>{item.label}</span><strong>{index <= trace.index ? `${Math.round(item.dur)} ms` : '—'}</strong></button></li>)}</ol>
      </section>}
      </div>
      <aside className="inspector sim-results" aria-label="Simulation results">
      {result ? (
        <div className="results">
          {result.mode === 'rate' ? (
            <>
              {verdict && <section className={`verdict-card ${verdict.status}`} role="status"><strong>{verdict.head}</strong><small>At {Math.round(result.lambda).toLocaleString()} requests/s, the busiest moment of this scenario.</small></section>}
              <div className="metric-grid">
                <Metric term="p50" label="p50 latency" value={result.ok ? `${Math.round(result.p50)} ms` : '—'} hint="Half of the requests that finished were faster." />
                <Metric term="p99" label="p99 latency" value={result.ok ? `${Math.round(result.p99)} ms` : '—'} hint={`99% of the requests that finished were faster. Goal: ${Math.round(verdict?.goal || 0)} ms.`} />
                <Metric term="failures" label="System failures" value={`${(result.sysErr * 100).toFixed(2)}%`} hint="Requests that failed due to a system limit." />
                <Metric term="cost" label="Estimated cost" value={`$${result.cost.toFixed(2)}/h`} hint="Directional estimate from model assumptions." />
              </div>
              {tips.length > 0 && <section className="explanation-card tips-card" aria-label="What to try next">
                <p className="eyebrow">What to try next</p>
                {tips.map((tip) => <div className="tip-row" key={tip.id}><p>{tip.text}</p>{tip.target && <button type="button" className="text-button" onClick={() => openTarget(tip.target)}>{tip.target.kind === 'build' ? 'Open in Build' : 'Open in Deploy'}</button>}</div>)}
              </section>}
              <section className="explanation-card">
                <p className="eyebrow">What limits this run</p>
                <h2>{limiting?.ref?.name || limiting?.name || 'No single resource is saturated'}</h2>
                <p>{limiting ? `The busiest thing requests wait on: ${Math.round((limiting.rho || 0) * 100)}% busy (${limiting.what || 'load'}) at about ${Math.round(result.lambda).toLocaleString()} requests per second.` : 'Try a higher request rate or a different design to reveal a bottleneck.'}</p>
                {Object.entries(result.why || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, count]) => <div className="reason-row" key={reason}><span>{reason}</span><strong>{(count / (result.samples || 1) * 100).toFixed(1)}% of requests failed here</strong></div>)}
              </section>
              {(Object.keys(result.caches || {}).length > 0 || result.retry?.retries > 0 || result.retry?.timeoutMs > 0) && <section className="explanation-card" aria-label="Caches and retries">
                <p className="eyebrow">Caches and retries</p>
                {Object.values(result.caches || {}).map((cache) => <div className="reason-row" key={`${cache.ref.id}@${cache.region}`}><span>{cache.ref.name} cache ({E.REGIONS[cache.region].code})</span><strong>answers {Math.round(cache.hit * 100)}% of {Math.round(cache.reads).toLocaleString()} reads/s</strong></div>)}
                {(result.retry?.retries > 0 || result.retry?.timeoutMs > 0) && <div className="reason-row"><span>Each call</span><strong>{result.retry.timeoutMs ? `gives up after ${result.retry.timeoutMs} ms` : 'waits as long as it takes'}{result.retry.retries ? `, tries ${result.retry.retries} more ${result.retry.retries === 1 ? 'time' : 'times'}` : ', no retries'}</strong></div>}
                {Object.values(result.R || {}).filter((item) => item.retryAmp > 1.05).map((item) => <div className="reason-row" key={`amp-${item.label}`}><span>{item.label}</span><strong className="bad-text">retries add {Math.round((item.retryAmp - 1) * 100)}% more load</strong></div>)}
              </section>}
              {behind.length > 0 && <section className="explanation-card" aria-label="Work that happens later">
                <p className="eyebrow">Work that happens later</p>
                <p>Messages are handled after the request returns, so a slow consumer builds a backlog instead of failing requests.</p>
                {behind.map(([name, lag]) => <div className="reason-row" key={name}><span>{name} → {lag.consumer.split('.')[0]}</span><strong className={lag.lagS > 60 ? 'bad-text' : ''}>{lag.lagS > 60 ? `falls ${formatDuration(lag.lagS)} behind` : `keeps up (${Math.round(lag.pubRate).toLocaleString()}/s in, room for ${Number.isFinite(lag.capRate) ? Math.round(lag.capRate).toLocaleString() : 'plenty'}/s)`}</strong></div>)}
              </section>}
              {result.stress && <StressCard stress={result.stress} scenario={scenario} />}
              <section className="explanation-card">
                <p className="eyebrow">By request path</p>
                {result.pathStats.map((item, index) => <div className="path-row" key={item.path.id}><div><strong>{item.path.label}</strong><small>{(item.share * 100).toFixed(1)}% of traffic</small></div><span>{item.err < 1 ? `p99 ${Math.round(item.p99)} ms` : 'all failed'}</span><span>{(item.err * 100).toFixed(2)}% errors</span><button type="button" className="text-button" onClick={() => startTrace(index)}>Trace request</button></div>)}
              </section>
              <section className="explanation-card"><div className="card-heading"><div><p className="eyebrow">Request timeline</p><h2>Playback and single-request trace</h2></div></div><p>Use a trace above to step through the calls, compute, and data operations for one path, or play the traffic shape over time.</p></section>
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
      </aside>
    </section>
  );
}

function ExperimentPicker({ build, deploy, runExperiment }) {
  const options = useMemo(() => E.faultOptions(build, deploy), [build, deploy]);
  const [choice, setChoice] = useState('');
  const picked = options.find((item) => item.id === choice) || options[0];
  if (!picked) return null;
  return (
    <section className="scenario-subsection experiments" aria-label="Experiments">
      <h3>Experiments</h3>
      <p className="helper-text">Break or change one thing on a copy of this design. Compare before and after, or watch it happen halfway through the scenario.</p>
      <label className="field-label">What happens if…<select aria-label="Experiment" value={picked.id} onChange={(event) => setChoice(event.target.value)}>{options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <div className="scenario-actions"><button type="button" className="button primary" onClick={() => runExperiment(picked.id, false)}>Compare before and after</button><button type="button" className="button quiet" onClick={() => runExperiment(picked.id, true)}>Play it</button></div>
    </section>
  );
}

function ExperimentPanel({ experiment, onClose }) {
  const { before, after } = experiment;
  const ms = (r, v) => r.ok ? `${Math.round(v)} ms` : '—';
  const rows = [
    { label: 'p50 latency', term: 'p50', a: ms(before, before.p50), b: ms(after, after.p50) },
    { label: 'p99 latency', term: 'p99', a: ms(before, before.p99), b: ms(after, after.p99) },
    { label: 'System failures', term: 'failures', a: `${(before.sysErr * 100).toFixed(2)}%`, b: `${(after.sysErr * 100).toFixed(2)}%`, worse: after.sysErr > Math.max(0.01, before.sysErr * 1.5) },
    { label: 'Estimated cost', term: 'cost', a: `$${before.cost.toFixed(2)}/h`, b: `$${after.cost.toFixed(2)}/h` }
  ];
  const tag = (v) => v.status === 'pass' ? 'Meets goal' : v.status === 'slow' ? 'Misses goal' : 'Failing';
  return (
    <section className="explanation-card comparison-card experiment-card" aria-label="Experiment result">
      <div className="card-heading"><div><p className="eyebrow">Experiment · {experiment.label}</p><h2>{experiment.summary}</h2></div><button type="button" className="text-button" onClick={onClose}>Close</button></div>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead><tr><th scope="col">Measure</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.label}><th scope="row"><Term k={row.term}>{row.label}</Term></th><td>{row.a}</td><td className={row.worse ? 'bad-text' : ''}>{row.b}</td></tr>)}
            <tr><th scope="row">Goal</th><td><span className={`pill ${experiment.beforeVerdict.status === 'pass' ? 'success' : 'danger'}`}>{tag(experiment.beforeVerdict)}</span></td><td><span className={`pill ${experiment.afterVerdict.status === 'pass' ? 'success' : 'danger'}`}>{tag(experiment.afterVerdict)}</span></td></tr>
          </tbody>
        </table>
      </div>
      <p className="eyebrow">What happened</p>
      <ul className="experiment-notes">{experiment.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      <small>Your Deploy is unchanged. The results panel shows the design before the experiment.</small>
    </section>
  );
}

function ComparisonPanel({ comparison }) {
  const { left, right } = comparison;
  const isRate = left.result.mode === 'rate' && right.result.mode === 'rate';
  const metrics = isRate
    ? [
      { label: 'p99 latency', left: `${Math.round(left.result.p99)} ms`, right: `${Math.round(right.result.p99)} ms`, a: left.result.p99, b: right.result.p99 },
      { label: 'System failures', left: `${(left.result.sysErr * 100).toFixed(2)}%`, right: `${(right.result.sysErr * 100).toFixed(2)}%`, a: left.result.sysErr, b: right.result.sysErr },
      { label: 'Estimated cost', left: `$${left.result.cost.toFixed(2)}/h`, right: `$${right.result.cost.toFixed(2)}/h`, a: left.result.cost, b: right.result.cost }
    ]
    : [
      { label: 'Finish time', left: `${Math.ceil(left.result.finishS / 60)} min`, right: `${Math.ceil(right.result.finishS / 60)} min`, a: left.result.finishS, b: right.result.finishS },
      { label: 'Rows completed', left: (left.result.done || 0).toLocaleString(), right: (right.result.done || 0).toLocaleString(), a: left.result.done || 0, b: right.result.done || 0 }
    ];
  const faster = isRate ? compareRate(left, right, comparison.goalMs) : compareBatch(left, right);
  const limiting = (result) => result.mode === 'rate'
    ? (result.pathRanked || result.ranked)?.[0]?.[1]?.ref?.name || 'no single saturated resource'
    : result.limits?.[0]?.what || 'workload path';
  return (
    <section className="explanation-card comparison-card" aria-label="Design comparison">
      <div className="card-heading"><div><p className="eyebrow">What-if comparison · {comparison.scenarioName}</p><h2>Same scenario, two Deploys</h2></div></div>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead><tr><th scope="col">Measure</th><th scope="col">{left.name} (current)</th><th scope="col">{right.name}</th></tr></thead>
          <tbody>{metrics.map((metric) => <tr key={metric.label}><th scope="row">{metric.label}</th><td>{metric.left}</td><td>{metric.right}</td></tr>)}</tbody>
        </table>
      </div>
      <p>{faster}</p>
      <p className="comparison-limits">The first design is mainly limited by {limiting(left.result)}; the second by {limiting(right.result)}. These are directional learning estimates.</p>
    </section>
  );
}

// Compare two rate runs the way an engineer would: dropped requests first, then the goal, then speed and cost.
function compareRate(left, right, goalMs) {
  const a = left.result, b = right.result, goal = goalMs || 300;
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  const costNote = (winner, loser) => {
    const ratio = winner.result.cost / Math.max(0.01, loser.result.cost);
    return ratio > 1.15 ? ` It costs ${ratio.toFixed(ratio < 10 ? 1 : 0)}× as much ($${winner.result.cost.toFixed(2)}/h vs $${loser.result.cost.toFixed(2)}/h).` : ratio < 0.87 ? ` It is also cheaper ($${winner.result.cost.toFixed(2)}/h vs $${loser.result.cost.toFixed(2)}/h).` : '';
  };
  const failA = a.sysErr > 0.01, failB = b.sysErr > 0.01;
  if (failA !== failB) { const [win, lose] = failA ? [right, left] : [left, right]; return `${win.name} handles the load; ${lose.name} fails ${pct(lose.result.sysErr)} of requests.${costNote(win, lose)}`; }
  if (failA && failB) { const [win, lose] = a.sysErr <= b.sysErr ? [left, right] : [right, left]; return `Both designs drop requests: ${win.name} fails ${pct(win.result.sysErr)}, ${lose.name} fails ${pct(lose.result.sysErr)}.`; }
  const metA = a.p99 <= goal, metB = b.p99 <= goal;
  if (metA !== metB) { const [win, lose] = metA ? [left, right] : [right, left]; return `${win.name} meets the ${Math.round(goal)} ms goal; ${lose.name} misses it (p99 ${Math.round(lose.result.p99)} ms).${costNote(win, lose)}`; }
  if (Math.abs(a.p99 - b.p99) / Math.max(1, Math.min(a.p99, b.p99)) < 0.05) return `Both designs ${metA ? 'meet' : 'miss'} the goal with about the same p99 (${Math.round(a.p99)} vs ${Math.round(b.p99)} ms).${a.cost !== b.cost ? ` ${a.cost < b.cost ? left.name : right.name} is cheaper.` : ''}`;
  const [win, lose] = a.p99 < b.p99 ? [left, right] : [right, left];
  return `${win.name} is faster: p99 ${Math.round(win.result.p99)} ms vs ${Math.round(lose.result.p99)} ms.${costNote(win, lose)}`;
}

function compareBatch(left, right) {
  const a = left.result, b = right.result;
  if (a.finishS === b.finishS) return 'Both designs finish in the same modeled time.';
  const [win, lose] = a.finishS < b.finishS ? [left, right] : [right, left];
  return `${win.name} finishes sooner: ${Math.ceil(win.result.finishS / 60)} min vs ${Math.ceil(lose.result.finishS / 60)} min.`;
}

function formatDuration(seconds) {
  if (seconds < 90) return `${Math.round(seconds)} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

// p99 and failures as load rises, with the goal line: where the design stops keeping up.
function StressCard({ stress, scenario }) {
  const goal = scenario?.goalMs || 300;
  const pts = stress.pts;
  const rate = Math.round(E.scenarioRate(scenario || {}));
  const xmax = Math.max(...pts.map((p) => p.lam), rate * 1.05, 1);
  const ymax = Math.max(goal * 1.5, ...pts.map((p) => Math.min(p.p99, goal * 4)));
  const W = 320, H = 170, L = 44, R = 10, T = 12, B = 28;
  const X = (v) => L + v / xmax * (W - L - R);
  const Y = (v) => T + (1 - Math.min(v, ymax) / ymax) * (H - T - B);
  const line = pts.filter((p) => p.err < 1).map((p, i) => `${i ? 'L' : 'M'}${X(p.lam).toFixed(1)} ${Y(p.p99).toFixed(1)}`).join(' ');
  return (
    <section className="explanation-card stress-card" aria-label="Maximum throughput">
      <p className="eyebrow">Maximum throughput</p>
      <h2>{stress.slo ? `Meets the goal up to about ${Math.round(stress.slo).toLocaleString()} requests/s` : `Misses the goal even at light load (p99 ${Math.round(pts[0]?.p99 || 0)} ms)`}</h2>
      <p>{stress.first ? `${stress.first.label} fills first (${stress.first.what}) at about ${Math.round(stress.lamCap).toLocaleString()} requests/s. ` : ''}This scenario peaks at {rate.toLocaleString()} requests/s.</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="stress-chart" role="img" aria-label="p99 latency and failures as requests per second rise">
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis" />
        <text x={L - 6} y={Y(0) + 4} textAnchor="end">0</text>
        <text x={L - 6} y={Y(ymax) + 4} textAnchor="end">{Math.round(ymax)} ms</text>
        <text x={L} y={H - 8}>0/s</text>
        <text x={W - R} y={H - 8} textAnchor="end">{Math.round(xmax).toLocaleString()}/s</text>
        {pts.map((p) => p.err > 0 && <rect key={`e${p.lam}`} x={X(p.lam) - 5} width="10" y={H - B - p.err * (H - T - B)} height={p.err * (H - T - B)} className="fail-bar" />)}
        <line x1={L} x2={W - R} y1={Y(goal)} y2={Y(goal)} className="goal-line" />
        <text x={W - R} y={Y(goal) - 4} textAnchor="end" className="goal-label">goal {Math.round(goal)} ms</text>
        {rate > 0 && <line x1={X(rate)} x2={X(rate)} y1={T} y2={H - B} className="now-line" />}
        <path d={line} className="p99-line" />
        {pts.filter((p) => p.err < 1).map((p) => <circle key={p.lam} cx={X(p.lam)} cy={Y(p.p99)} r="2.5" className="p99-dot" />)}
      </svg>
      <small>Line: p99 of requests that finished. Bars: share that failed.{rate > 0 ? ' Dashed vertical line: this scenario\'s peak.' : ''}</small>
    </section>
  );
}

function Metric({ label, value, hint, term }) {
  return <article className="metric-card"><span>{term ? <Term k={term}>{label}</Term> : label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

function Root() {
  return <ReactFlowProvider><App /></ReactFlowProvider>;
}

createRoot(document.getElementById('root')).render(<Root />);
