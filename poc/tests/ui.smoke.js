// Headless walk through all three modes. Fails on any page error.
// Setup: npm i -D playwright && npx playwright install chromium
// Run:   node poc/tests/ui.smoke.js            (after poc/build.sh)
// Screenshots go to poc/tests/out/.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const page_ = 'file://' + path.join(__dirname, '..', 'loadbearing.html');
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const shot = (p, n) => p.screenshot({ path: path.join(out, n + '.png') });
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
  const check = (cond, msg) => { if (!cond) errs.push('check failed: ' + msg); else console.log('ok  ', msg); };
  await p.goto(page_); await p.evaluate(() => localStorage.clear()); await p.reload(); await p.waitForTimeout(400);
  check(await p.title() === 'Loadbearing', 'title is Loadbearing');
  await shot(p, '01-build');

  // Build: step through Checkout, answer the first branch "no", run to the end.
  await p.click('.ctool button[data-act="dbg-start"]'); await p.waitForTimeout(300);
  for (let i = 0; i < 6; i++) { await p.click('button[data-act="dbg-step"]'); await p.waitForTimeout(80); }
  await p.click('button[data-act="dbg-end"]'); await p.waitForTimeout(200);
  if (await p.$('.askrow button[data-act="dbg-ans"][data-v="0"]')) { await p.keyboard.press('n'); await p.click('button[data-act="dbg-end"]').catch(() => {}); await p.waitForTimeout(200); }
  if (await p.$('.askrow button[data-act="dbg-ans"][data-v="0"]')) { await p.keyboard.press('n'); await p.waitForTimeout(100); await p.click('button[data-act="dbg-end"]').catch(() => {}); await p.waitForTimeout(200); }
  check(await p.$eval('#dbg-log', e => /Done: finished successfully/.test(e.textContent)), 'Build step-through finishes');
  await shot(p, '02-build-stepping');
  await p.click('button[data-act="dbg-stop"]'); await p.waitForTimeout(200);

  // Build: a code error locks Deploy; undo restores.
  await p.click('.bn[data-node="w:w1"]'); await p.waitForTimeout(200);
  await p.click('#code'); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter'); await p.keyboard.type('when Broken {\ncal Nope.X\n}'); await p.waitForTimeout(500);
  check(await p.$eval('button.mode[data-m="deploy"]', e => e.disabled), 'a code error locks Deploy');
  await p.click('button[data-act="undo"]'); await p.waitForTimeout(200);
  check(!(await p.$eval('button.mode[data-m="deploy"]', e => e.disabled)), 'undo unlocks Deploy');

  // Deploy: drag data into a store; remove the load balancer and apply the fix.
  await p.click('button.mode[data-m="deploy"]'); await p.waitForTimeout(500); await shot(p, '03-deploy');
  await p.dragAndDrop('.chip[data-drag="d:Carts"]', '.bx[data-drop^="s:s1"]'); await p.waitForTimeout(300);
  check(await p.evaluate(() => ST.deploy.stores.find(s => s.data.includes('Carts')).id === 's1'), 'drag Carts into main-db');
  await p.click('.nb[data-box="e:use1"]'); await p.waitForTimeout(200);
  await p.click('button[data-act="d-rnet"][data-v="none"]'); await p.waitForTimeout(200);
  check(await p.$eval('button.mode[data-m="simulate"]', e => e.disabled), 'no load balancer locks Simulate');
  await p.click('button[data-act="d-fix"]'); await p.waitForTimeout(200);
  check(!(await p.$eval('button.mode[data-m="simulate"]', e => e.disabled)), 'one-click fix unlocks Simulate');

  // Simulate: run, watch it run, step one request, stress, batch.
  await p.click('button.mode[data-m="simulate"]'); await p.waitForTimeout(300);
  await p.click('#s-panel button[data-act="s-run"]'); await p.waitForTimeout(1200);
  check(await p.$eval('.head1', e => /goal|Fails|Misses/.test(e.textContent)), 'busiest-moment run shows a headline'); await shot(p, '04-sim-run');
  await p.click('.ctool button[data-act="pl-start"]'); await p.waitForTimeout(1500);
  await p.click('button[data-act="pl-speed"][data-i="3"]'); await p.waitForTimeout(2500);
  check(await p.$('#pl-live .tiles'), 'playback shows live tiles'); await shot(p, '05-sim-watch');
  await p.click('#s-rail button[data-act="s-trace"][data-i="0"]'); await p.waitForTimeout(400);
  await p.click('button[data-act="sr-go"][data-k="5"]'); await p.waitForTimeout(700);
  check(await p.$('.nowbox'), 'single-request stepping shows the current step'); await shot(p, '06-sim-step');
  await p.click('#s-panel button[data-act="s-stress"]'); await p.waitForTimeout(2500);
  check(await p.$('svg.chart'), 'max throughput chart');
  await p.click('#s-rail button[data-act="s-sel"]:nth-of-type(3)'); await p.waitForTimeout(200);
  await p.click('#s-panel button[data-act="s-run"]'); await p.waitForTimeout(800);
  check(await p.$eval('.head1', e => /Finishes|Takes|Stops/.test(e.textContent)), 'batch run shows a finish time');

  // Theme and phone width.
  await p.emulateMedia({ colorScheme: 'dark' }); await p.click('button.mode[data-m="deploy"]'); await p.waitForTimeout(400); await shot(p, '07-dark');
  await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(300);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal scroll at 400 px');
  await b.close();
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); } else console.log('\nUI smoke passed');
})();
