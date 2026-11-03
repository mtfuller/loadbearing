import React, { useMemo, useState } from 'react';
import { InfraCanvas, Legend, HEAT_WORDS } from './infra-canvas.jsx';

const E = window.Loadbearing;

// Which canvas nodes and wires the current trace step is using. Steps without a start box continue from the last known one.
function traceHighlight(graph, trace) {
  if (!trace?.steps?.length) return null;
  const nodes = new Set(); const edges = new Set();
  let previous = null;
  trace.steps.slice(0, trace.index + 1).forEach((step, index) => {
    const from = step.fromBox || previous;
    const to = step.toBox || step.box;
    const current = index === trace.index;
    if (to) previous = to;
    if (!current) return;
    [from, to, step.box].filter(Boolean).forEach((key) => { if (graph.byKey[key]) nodes.add(key); });
    if (from && to) {
      const id = `${from}|${to}`;
      if (graph.edges.some((edge) => edge.id === id)) edges.add(id);
    }
  });
  return { nodes: [...nodes], edges };
}

export function SimulateCanvas({ build, analysis, deploy, result, playback, trace }) {
  const [focusKey, setFocusKey] = useState(null);
  const frame = playback?.timeline.frames[playback.index];
  const snap = frame || (result?.mode === 'rate' ? result : null);
  const states = frame ? frame.res : result?.R;
  const graph = useMemo(
    () => E.deployGraph(build, analysis, deploy, { origins: snap?.origins || [], links: snap?.links || {} }),
    [build, analysis, deploy, snap]
  );
  const traffic = useMemo(() => (snap ? E.trafficFor(graph, snap) : {}), [graph, snap]);
  const highlight = useMemo(() => traceHighlight(graph, trace), [graph, trace]);
  const focused = focusKey ? graph.byKey[focusKey] : null;
  const state = focused ? E.heatFor(focused.key, states) : null;
  const rate = focused ? graph.edges.filter((edge) => edge.to === focused.key).reduce((sum, edge) => sum + (traffic[edge.id] || 0), 0) : 0;
  const level = state ? E.heatLevel(state.rho) : null;

  return (
    <section className="sim-canvas-panel" aria-label="Traffic through your infrastructure">
      <div className="canvas-toolbar">
        <div>
          <strong>Traffic through your infrastructure</strong>
          <span>{highlight ? 'The highlighted path is the step you are viewing.' : snap ? 'Line thickness shows requests per second; node bars show how busy each resource is.' : 'Run a scenario to see traffic and load on each resource.'}</span>
        </div>
      </div>
      <InfraCanvas
        label="Infrastructure traffic view"
        graph={graph} build={build} deploy={deploy} states={states} traffic={traffic}
        trace={highlight} motion={!!snap} speed={playback?.speed || 1}
        selectedKey={focusKey} onSelect={setFocusKey}
      />
      <Legend showHeat />
      <div className="sim-why" role="status">
        {focused
          ? <><strong>{focused.name}</strong>{state ? <> is {Math.round(state.rho * 100)}% {state.what || 'busy'} ({HEAT_WORDS[level].toLowerCase()}){state.inst != null && state.type === 'compute' ? `, running ${state.inst} ${state.inst === 1 ? 'instance' : 'instances'}` : ''}.</> : rate > 0 ? <> receives about {E.fmtN(rate)} requests per second.</> : <> has no measured load in this run.</>}</>
          : 'Select a node to see why it is busy.'}
      </div>
    </section>
  );
}
