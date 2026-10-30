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
    await page.getByLabel('Store New table in main-db').check();
    await page.getByLabel('Add compute').selectOption('fn');
    await page.getByLabel('Run New workload on functions').check();
    await page.getByRole('button', { name: 'Simulate' }).click();
    await page.getByRole('heading', { name: 'See what happens under load' }).waitFor();
    await page.getByRole('button', { name: 'Run simulation' }).click();
    await page.getByText('p99 latency').waitFor();
    await page.getByRole('button', { name: 'Find max throughput' }).click();
    await page.getByText('Maximum throughput').waitFor();
    await page.getByRole('button', { name: 'Play full scenario' }).click();
    await page.getByText('Scenario playback').waitFor();
    await page.getByLabel('Playback position').waitFor();
    await page.locator('.playback-panel').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Trace request' }).first().click();
    await page.getByText('Single-request trace', { exact: true }).waitFor();
    await page.locator('.trace-panel').getByRole('button', { name: 'Step' }).click();
    await page.locator('.trace-panel').getByRole('button', { name: 'Close' }).click();

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
