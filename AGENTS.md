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
cd poc && ./build.sh                 # concatenates src/ into loadbearing.html, syntax-checks it
node poc/tests/engine.test.js        # must pass before any commit
node poc/tests/ui.smoke.js           # needs Playwright; run for any UI change
```

There is no bundler, framework or package to install for the app itself. Keep it that
way until the planned TypeScript port (`docs/DESIGN.md` §13). The build is plain
concatenation in a fixed order: engine modules first, then UI, then `main.js`.

## Where to change what

| To change… | Edit |
| --- | --- |
| The workload language, checks, path enumeration | `poc/src/lang.js` |
| Step-through behavior or mock data | `poc/src/run.js`, UI in `ui-debug.js` |
| Products, regions, network rules, Deploy validation | `poc/src/infra.js` (v1 moves products to `catalog/*.json`) |
| Latency, capacity, queueing, playback, stress, batch | `poc/src/sim.js` |
| Example Build and Deploys | `poc/src/starter.js` (regenerate `examples/` after) |
| Build canvas and editor | `poc/src/ui-build.js` |
| Deploy board, drag and drop, inspectors | `poc/src/ui-deploy.js` |
| Scenario editor and results | `poc/src/ui-sim.js`; playback and single-request stepping in `ui-play.js` |
| State, undo, saving, events | `poc/src/ui-core.js` |
| Styles and tokens (light and dark) | `poc/src/shell.html` |

## Invariants (don't break these)

- **Engine modules are pure.** `lang`, `run`, `infra` and `sim` never touch the DOM. Results are deterministic for a given seed. Tests load these modules in a Node `vm` context.
- **Logic and infrastructure stay separate.** A Build never names a product. A Deploy never edits logic.
- **Every edit goes through `commit(mutate)`**, so undo and redo keep working. A Deploy fix is a function `apply(deploy)` run through `commit`.
- **Every number shown has an explanation path:** the step, the resource and the assumption behind it. If you add a metric, add its "why".
- **Document kinds** are `loadbearing-build` and `loadbearing-deploy`. Old `meridian-*` documents must keep loading. Add a migration whenever you change a schema.
- **Events use attributes:** `data-act` (click), `data-ch` (change), `data-in` (input), handled by the `ACT`, `CH` and `IN` tables. Don't bind listeners to elements that get re-rendered.
- **Colors come from CSS tokens** with light and dark values. Heat and status always carry text too, never color alone.
- **The UI speaks plain language.** No internal ids in visible text. Use short sentences and sentence case, and tell the learner what to do next.

## Conventions

- Plain ES2020, no imports. Each module is top-level functions and constants. The last line may export for Node: `if (typeof module !== 'undefined') module.exports = …` (the build strips it).
- Keep functions small and named for what they return (`planPath`, `resourceStates`).
- New model constants go in one place with a comment naming the source or assumption. They will appear on the Assumptions page (`DESIGN.md` L7).
- Cloud facts (limits, regions, modes) need a source URL and a "checked" date. Put them in catalog data, never in UI strings.
- Add or extend a test in `engine.test.js` for any engine change. Compare objects from the vm context with JSON, not `deepStrictEqual`.

## Good first tasks

1. Assumptions page (L7): list every constant in `sim.js` and `infra.js` with an editable value and a reset.
2. Compare runs (S8): keep the last two results per scenario and show them side by side, with differences explained.
3. Catalog loader (D7, step 1): express today's `COMPUTE`, `STORES` and `NET` in the `catalog/` format, then load from it with no behavior change. The tests must still pass.
4. Availability zones (D8): add `zones` to the Deploy schema, show them collapsed on the region boxes, and add a zone-loss event to playback.
