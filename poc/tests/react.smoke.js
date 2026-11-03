// Browser coverage for the React app: drag a node, edit Build, configure Deploy, and simulate.
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|ERR_/.test(message.text())) errors.push(message.text());
  });

  try {
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173');
    await page.getByRole('heading', { name: 'System logic' }).waitFor();
    await page.locator('.react-flow__node').first().waitFor();
    if (!(await page.getByText('Build valid').count())) throw new Error('Sample Build should start valid.');

    const before = await page.locator('.react-flow__node').count();
    await page.locator('[data-palette="table"]').dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 570, y: 430 }
    });
    await page.getByText('New table', { exact: true }).waitFor();
    await page.locator('[data-palette="workload"]').dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 720, y: 500 }
    });
    await page.getByText('New workload', { exact: true }).waitFor();
    const after = await page.locator('.react-flow__node').count();
    if (after !== before + 2) throw new Error(`Expected dropped table and workload nodes, saw ${before} -> ${after}.`);

    await page.locator('.react-flow__node').filter({ hasText: 'Storefront' }).click();
    const code = page.getByLabel('Workload code');
    await code.waitFor();
    await code.fill(`${await code.inputValue()}\n# React app smoke test`);
    await code.blur();
    await page.getByRole('button', { name: 'Deploy' }).click();

    await page.getByRole('heading', { name: 'Map logic to infrastructure' }).waitFor();
    const canvas = page.getByTestId('infra-canvas');
    await canvas.locator('[data-node-key^="c:"]').first().waitFor();
    if (!(await canvas.locator('.region-box').count())) throw new Error('Deploy canvas should show regions.');
    // drag a Build data node onto a store, then refuse an invalid drop
    await page.locator('[data-tray="data:New table"]').dragTo(canvas.locator('[data-kind="store"]', { hasText: 'main-db' }));
    await page.getByRole('status').filter({ hasText: 'New table is stored in main-db' }).waitFor();
    await page.locator('[data-tray="data:New table"]').dragTo(canvas.locator('[data-kind="store"]', { hasText: 'events' }));
    await page.getByRole('status').filter({ hasText: /can.t hold New table/ }).waitFor();
    // add compute from the palette, then drag a workload onto it
    const computeBefore = await canvas.locator('[data-kind="compute"]').count();
    await page.locator('[data-palette="compute:fn"]').dragTo(canvas.locator('.region-box').first(), { targetPosition: { x: 40, y: 400 } });
    await page.waitForFunction((count) => document.querySelectorAll('[data-testid="infra-canvas"] [data-kind="compute"]').length === count + 1, computeBefore);
    const fnNode = canvas.locator('[data-kind="compute"]').filter({ hasText: 'Functions' }).last();
    await page.locator('[data-tray="workload:New workload"]').dragTo(fnNode);
    await fnNode.locator('.chip', { hasText: 'New workload' }).waitFor();
    // the inspector still exposes every setting
    await fnNode.click();
    await page.getByLabel('Compute type').waitFor();
    await page.getByLabel(/^Run New workload on /).isChecked();
    // world map view of the same deployment: regions at their locations, add a region from the map
    await page.getByRole('group', { name: 'Canvas view' }).getByRole('button', { name: 'World map' }).click();
    const worldMap = page.getByTestId('world-map');
    await worldMap.locator('.map-pin-region i').first().click();
    await worldMap.locator('.map-region').first().waitFor();
    await worldMap.getByRole('button', { name: 'Add region eu-west-1' }).click();
    await worldMap.locator('.map-pin-region[data-region="euw1"]').waitFor({ state: 'attached' });
    await worldMap.getByRole('button', { name: 'Zoom in' }).click();
    await worldMap.getByRole('button', { name: 'Fit map' }).click();
    await page.getByRole('group', { name: 'Canvas view' }).getByRole('button', { name: 'Diagram' }).click();
    await page.getByTestId('infra-canvas').locator('[data-region="euw1"]').first().waitFor();
    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('heading', { name: 'See what happens under load' }).waitFor();
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await page.getByText('p99 latency').waitFor();
    const simCanvas = page.getByTestId('infra-canvas');
    await simCanvas.locator('.heat-readout strong', { hasText: '%' }).first().waitFor();
    await page.getByRole('button', { name: 'Find max throughput' }).click();
    await page.getByText('Maximum throughput').waitFor();
    await page.getByRole('button', { name: 'Play full scenario' }).click();
    await page.getByText('Scenario playback').waitFor();
    await simCanvas.locator('.edge-live').first().waitFor({ state: 'attached' });
    await page.getByLabel('Playback position').waitFor();
    await page.locator('.playback-panel').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Trace request' }).first().click();
    await page.getByText('Single-request trace', { exact: true }).waitFor();
    await simCanvas.locator('.infra-node.trace-active').first().waitFor();
    await page.locator('.trace-panel').getByRole('button', { name: 'Step' }).click();
    await page.locator('.trace-panel').getByRole('button', { name: 'Close' }).click();

    // live playground: changing a scenario value updates the metrics with no Run
    const p50 = page.locator('.metric-grid').first().locator('strong').first();
    const p50Before = await p50.innerText();
    await page.getByLabel('Latency goal (ms)').first().waitFor();
    await page.locator('.sim-sidebar').getByText('Requests', { exact: true }).locator('input').fill('900000000');
    await page.waitForFunction((before) => document.querySelector('.metric-grid strong')?.textContent !== before, p50Before);
    // live edits must not re-fit or zoom the canvas
    const viewportBefore = await page.locator('.react-flow__viewport').first().getAttribute('style');
    await page.locator('.sim-sidebar').getByText('Requests', { exact: true }).locator('input').fill('800000000');
    await page.waitForTimeout(900);
    const viewportAfter = await page.locator('.react-flow__viewport').first().getAttribute('style');
    if (viewportBefore !== viewportAfter) throw new Error('The canvas viewport moved after a live edit.');
    await page.getByRole('group', { name: 'Canvas view' }).getByRole('button', { name: 'World map' }).click();
    await page.getByTestId('world-map').locator('.map-pin-region i').first().click();
    await page.getByTestId('world-map').locator('.map-region').first().waitFor();
    await page.getByRole('button', { name: /^Take .* offline$/ }).first().click();
    await page.getByText(/stops working/).first().waitFor();
    await page.getByRole('button', { name: /^Bring .* back online$/ }).first().click();
    const pin = page.getByTestId('world-map').locator('.map-pin-region i').first();
    if (!(await page.getByTestId('world-map').locator('.map-row .map-heat').count())) await pin.click();
    await page.getByTestId('world-map').locator('.map-row .map-heat').first().waitFor();
    await page.getByRole('group', { name: 'Canvas view' }).getByRole('button', { name: 'Diagram' }).click();

    await page.getByLabel('Select scenario').selectOption({ label: 'Product feed import' });
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await page.getByText('Finish time').waitFor();

    await page.getByRole('button', { name: 'Build' }).click();
    await page.getByRole('button', { name: 'call', exact: true }).waitFor();
    await page.getByLabel('Entry point to step through').selectOption({ index: 1 });
    await page.getByRole('heading', { name: 'Step through behavior' }).waitFor();
    for (let index = 0; index < 60; index += 1) {
      if (await page.getByText('Execution finished', { exact: false }).count()) break;
      const chance = page.getByRole('button', { name: /Use chance/ });
      if (await chance.count()) await chance.click();
      else {
        const step = page.getByRole('button', { name: 'Step', exact: true });
        if (!(await step.count())) break;
        await step.click();
      }
    }
    await page.getByText('Execution finished', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Step', exact: true }).click();
    await page.getByText('Execution finished', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Save & load' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save current Build' }).click();
    await page.getByText('Saved in this browser').waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Explore examples' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Open example' }).first().click();
    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('button', { name: 'Compare designs' }).click();
    await page.getByRole('region', { name: 'Design comparison' }).waitFor();
    await page.getByText('Same scenario, two Deploys').waitFor();

    await page.getByRole('button', { name: 'Build' }).click();
    await page.setViewportSize({ width: 400, height: 860 });
    await page.getByRole('heading', { name: 'System logic' }).waitFor();
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflows) throw new Error('React app overflows horizontally at 400 px.');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('React UI smoke passed: drag/drop, Build, Deploy, rate simulation, batch simulation, and phone width.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
