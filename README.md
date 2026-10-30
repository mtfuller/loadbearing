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
| `src/main.jsx` | React app: Build canvas, Deploy configuration, and Simulate views. |
| `poc/src/` | Pure system model and simulation engine, plus the retained standalone prototype UI. |
| `docs/DESIGN.md` | The single design doc: product (purpose, users, learning features, requirements, metrics, roadmap) and technical design (schemas, language, interpreter, validation, simulation engine, UI, cloud coverage). Exported from the shared Claude Doc "Loadbearing — Design Doc"; diagrams rendered as Mermaid. |
| `AGENTS.md` | Short working rules for coding agents: commands, invariants, conventions, where to change what. |
| `poc/loadbearing.html` | The original standalone proof of concept. Open it directly in a browser. |
| `poc/tests/` | Engine regressions plus Playwright smoke tests for the React app and original prototype. |
| `mockups/` | 7 static HTML screens of the v1 design (`index.html` lists them); `source/` holds the Claude Design canvas originals. |
| `examples/` | The checkout Build and two Deploy configs as JSON. Import them in the app with Save & load → Import file. |
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

1. **Build:** drag workload and data nodes onto the canvas; edit workload code, data fields, and positions. Use the entry-point step-through to see interpreter events and choose conditional branches.
2. **Deploy:** configure regions and networking, size compute, choose store replication and partitioning, place workloads and data, then apply validation fixes.
3. **Simulate:** edit scenarios, traffic origins and branch odds; run rate or batch workloads, find max throughput, play a timeline, and trace a single request.
4. **Save and load:** keep separate Build and Deploy documents in the browser library, or import/export either as JSON. The active workspace saves automatically; Undo/Redo and the light/dark theme are available in the header.

## Status

- The React interface is an incremental port: its Build, Deploy, and Simulate flows use the existing pure engine. It also reads the original `loadbearing-work` and `meridian-v3-work` browser-storage keys. The standalone proof of concept remains available at `poc/loadbearing.html`.
- Next is phase 1 (§15): provider catalogs for AWS and GCP, availability zones, quota checks, and side-by-side comparison. After that come the learning features (§4): guided challenges, a pattern library and failure drills.
- Facts about cloud products were checked on 2026-10-29. Sources are listed at the end of `docs/DESIGN.md`.
