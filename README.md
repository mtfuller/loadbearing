# Loadbearing

Loadbearing is a sandbox for learning system design by experiment: write a system's
logic, map it onto realistic cloud infrastructure, and watch how it behaves at scale.
It is an educational tool for understanding and exploring architectures, not a way to
validate a real implementation before it ships.

The app is a self-contained browser prototype with no runtime dependencies. Its source,
design docs, examples, and tests are included in this repository.

| Start here | What it is |
| --- | --- |
| `docs/DESIGN.md` | The single design doc: product (purpose, users, learning features, requirements, metrics, roadmap) and technical design (schemas, language, interpreter, validation, simulation engine, UI, cloud coverage). Exported from the shared Claude Doc "Loadbearing — Design Doc"; diagrams rendered as Mermaid. |
| `AGENTS.md` | Short working rules for coding agents: commands, invariants, conventions, where to change what. |
| `poc/loadbearing.html` | The working proof of concept. Open it in any modern browser; no server or install. |
| `poc/src/` | Its source: 13 plain JavaScript modules plus `shell.html` (CSS and layout). |
| `poc/tests/` | `engine.test.js` (Node, no dependencies) and `ui.smoke.js` (Playwright). |
| `mockups/` | 7 static HTML screens of the v1 design (`index.html` lists them); `source/` holds the Claude Design canvas originals. |
| `examples/` | The checkout Build and two Deploy configs as JSON. Import them in the app with Save & load → Import file. |
| `catalog/aws.sample.json` | Sample entries in the planned v1 provider catalog format. |

## Quick start

```sh
open poc/loadbearing.html                 # or double-click it
cd poc && ./build.sh                      # rebuild after editing src/
node tests/engine.test.js                 # 17 engine tests, no install needed
npm i -D playwright && npx playwright install chromium
node tests/ui.smoke.js                    # walks all three modes headless
```

## Try this first

1. **Build:** press **Step through** and answer the branch prompts. Watch the mock rows link up.
2. **Deploy:** drag `Carts` from `cart-cache` into `main-db`. Read the warning, then undo.
3. **Simulate:** pick **Keeps rising**, press **Watch it run**, and see what breaks first.
4. Load the **Global services** Deploy (Save & load → Examples) and run the same scenario. Compare.

## Status

- The proof of concept covers everything marked "POC: Yes" in `docs/DESIGN.md` §5.
- Next is phase 1 (§15): provider catalogs for AWS and GCP, availability zones, quota checks, and side-by-side comparison. After that come the learning features (§4): guided challenges, a pattern library and failure drills.
- Facts about cloud products were checked on 2026-10-29. Sources are listed at the end of `docs/DESIGN.md`.
