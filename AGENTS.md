# AGENTS.md: working on Loadbearing

Read `docs/DESIGN.md` before making product or architecture decisions. This file is
the short version for day-to-day changes.

## What this app is for

Loadbearing teaches system design. Learners explore how architectures behave at scale
by changing logic or infrastructure and re-running scenarios. It is **not** a tool for
validating or load-testing a real production system. When you're unsure about a
feature, choose what helps a learner see **why** a result happened over what makes
the number more precise.

## Commands

```sh
npm run dev                           # run the React app on localhost:5173
npm run build                         # build React app and standalone prototype
npm test                              # engine tests; must pass before any commit
npm run test:ui                       # Playwright smoke tests for React changes
npm run test:legacy-ui                # smoke test the original standalone UI
```

The current UI uses React, Vite, and React Flow. The original standalone proof of
concept remains in `poc/`; `poc/build.sh` concatenates its modules in a fixed order.
The React app loads the pure engine modules from `poc/src/` through `scripts/copy-engine.mjs`.

## Where to change what

| To change… | Edit |
| --- | --- |
| The workload language, checks, path enumeration | `poc/src/lang.js` |
| Step-through behavior or mock data | `poc/src/run.js`, React presentation in `src/main.jsx` |
| Products, regions, network rules, Deploy validation | `poc/src/infra.js` (v1 moves products to `catalog/*.json`) |
| Latency, capacity, queueing, playback, stress, batch | `poc/src/sim.js` |
| Example Build and Deploys | `poc/src/starter.js` (regenerate `examples/` after) |
| React UI and canvas | `src/main.jsx` |
| React UI styles | `src/styles.css` |
| Original Build, Deploy, and Simulate UI | `poc/src/ui-*.js` (parity reference) |

## Invariants (don't break these)

- **Engine modules are pure.** `lang`, `run`, `infra` and `sim` never touch the DOM. Results are deterministic for a given seed. Tests load these modules in a Node `vm` context.
- **Logic and infrastructure stay separate.** A Build never names a product. A Deploy never edits logic.
- **Every document edit goes through the React app's `commit()`**, so undo and redo keep working. Engine functions remain pure.
- **Every number shown has an explanation path:** the step, the resource and the assumption behind it. If you add a metric, add its "why".
- **Document kinds** are `loadbearing-build` and `loadbearing-deploy`. Old `meridian-*` documents must keep loading. Add a migration whenever you change a schema.
- **React owns the interface state and events.** Keep app mutations in state transactions rather than mutating rendered nodes directly.
- **Keep Build and Deploy documents separate.** The library persists them independently; workspace persistence keeps both together, and older `meridian-*` document kinds/keys remain readable.
- **Colors come from CSS tokens** with light and dark values. Heat and status always carry text too, never color alone.
- **The UI speaks plain language.** No internal ids in visible text. Use short sentences and sentence case, and tell the learner what to do next.

## Conventions

- Keep engine modules in plain JavaScript and free of UI dependencies. Existing modules export CommonJS APIs for the Node vm tests and are loaded as classic browser scripts for the React app.
- Keep functions small and named for what they return (`planPath`, `resourceStates`).
- New model constants go in one place with a comment naming the source or assumption. They will appear on the Assumptions page (`DESIGN.md` L7).
- Cloud facts (limits, regions, modes) need a source URL and a "checked" date. Put them in catalog data, never in UI strings.
- Add or extend a test in `engine.test.js` for any engine change. Compare objects from the vm context with JSON, not `deepStrictEqual`.

## Good first tasks

1. Assumptions page (L7): list every constant in `sim.js` and `infra.js` with an editable value and a reset.
2. Compare runs (S8): keep the last two results per scenario and show them side by side, with differences explained.
3. Catalog loader (D7, step 1): express today's `COMPUTE`, `STORES` and `NET` in the `catalog/` format, then load from it with no behavior change. The tests must still pass.
4. Availability zones (D8): add `zones` to the Deploy schema, show them collapsed on the region boxes, and add a zone-loss event to playback.
