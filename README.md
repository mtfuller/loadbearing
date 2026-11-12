# Loadbearing

Loadbearing is a sandbox for learning system design by experiment: write a system's
logic, map it onto realistic cloud infrastructure, and watch how it behaves at scale.
It is an educational tool for understanding and exploring architectures, not a way to
validate a real implementation before it ships.

The main app is a React interface with a drag-and-drop Build canvas. A pure JavaScript
engine handles workload analysis, deployment validation, and simulation. The original
standalone proof of concept is retained under `poc/` for reference.

| Start here | What it is |
| --- | --- |
| `src/main.jsx` | React app shell: Build canvas and Simulate views. |
| `src/deploy-mode.jsx`, `src/infra-canvas.jsx`, `src/world-map.jsx`, `src/simulate-canvas.jsx` | Visual Deploy editor, the shared infrastructure canvas (box-line diagram or world map), and the Simulate traffic view. |
| `poc/src/` | Pure system model and simulation engine, plus the retained standalone prototype UI. |
| `docs/DESIGN.md` | The single design doc: product (purpose, users, learning features, requirements, metrics, roadmap) and technical design (schemas, language, interpreter, validation, simulation engine, UI, cloud coverage). Exported from the shared Claude Doc "Loadbearing — Design Doc"; diagrams rendered as Mermaid. |
| `AGENTS.md` | Short working rules for coding agents: commands, invariants, conventions, where to change what. |
| `poc/loadbearing.html` | The original standalone proof of concept. Open it directly in a browser. |
| `poc/tests/` | Engine regressions plus Playwright smoke tests for the React app and original prototype. |
| `mockups/` | 7 static HTML screens of the v1 design (`index.html` lists them); `source/` holds the Claude Design canvas originals. |
| `examples/` | The checkout example and seven system-design examples (URL shortener, search engine, social network, streaming service, food delivery, product catalog, concert ticket sale), each with a Build and two Deploys. |
| `catalog/aws.sample.json` | Sample entries in the planned v1 provider catalog format. |

## Quick start

```sh
npm install
npm run dev                               # start the React app at http://127.0.0.1:5173
npm run build                             # build React app and standalone prototype
npm test                                  # engine regression suite
npx playwright install chromium
npm run test:ui                           # React app browser walkthrough
npm run test:legacy-ui                    # standalone prototype browser walkthrough
```

## Try this first

The app opens on an example gallery, simplest first. **Run it** jumps straight to a live simulation; **Look inside** opens the Build. While an example is open, a "Try this" bar suggests one experiment at a time (hide it, and the Tips button brings it back).

In Simulate, **Experiments** break or change one thing on a copy of the design: double the traffic, lose a whole region or one availability zone, or slow down a database or outside service. **Compare before and after** shows both runs side by side with what each resource did about it; **Play it** runs the scenario and breaks the design halfway through. Zones are set per compute and database in Deploy.

Deploy can also put a **cache in front** of a database (with a hit ratio) and set a **timeout and retries** for every call. Scenarios can make one key **hot** (a viral link, a sold-out concert), which piles that share of the work onto one shard. The product catalog and concert ticket sale examples are built around these.

1. **Build:** drag workload and data nodes onto the canvas; edit workload code, data fields, and positions. Use the entry-point step-through to see interpreter events and choose conditional branches.
2. **Deploy:** build your infrastructure on a canvas. Add regions, compute, stores and network from the palette, drag your Build workloads and data onto them, edit details in the inspector, then apply validation fixes.
3. **Simulate:** it is a live playground: changing requests, load shape, origins, branch odds, instance limits or shards recomputes the canvas heat, traffic and metrics straight away, and any region can be taken offline to see what survives (this only affects the simulation, never the saved Deploy). Run, Find max throughput, playback and trace stay explicit. Deploy and Simulate can show the infrastructure as a box-line diagram or a world map with regions at their locations and arcs carrying traffic and round-trip latency. edit scenarios, traffic origins and branch odds; run rate or batch workloads, find max throughput, play a timeline, and trace a single request. The same infrastructure canvas shows traffic flowing through every region, wire thickness for load, and how busy each resource is (in words as well as color).
4. **Compare designs:** open a system from **Explore examples**, run a scenario, and compare the same traffic against its alternative Deploy. The table shows latency or finish time, failures and estimated cost.
5. **Save and load:** keep separate Build and Deploy documents in the browser library, or import/export either as JSON. The active workspace saves automatically; Undo/Redo and the light/dark theme are available in the header.

## Status

- The React interface is an incremental port: its Build, Deploy, and Simulate flows use the existing pure engine. It also reads the original `loadbearing-work` and `meridian-v3-work` browser-storage keys. The standalone proof of concept remains available at `poc/loadbearing.html`.
- The app includes five ready-to-run system examples, each with a starter and scaled Deploy, plus side-by-side what-if comparisons. Next is phase 1 (§15): provider catalogs for AWS and GCP, availability zones, and quota checks. After that come the learning features (§4): guided challenges and failure drills.
- Facts about cloud products were checked on 2026-10-29. Sources are listed at the end of `docs/DESIGN.md`.
