const { chromium } = require('playwright');

const baseUrl = process.env.WORLD_SIM_BASE_URL ?? 'http://127.0.0.1:1432/';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitFor(page, probe, expected, label) {
  const startedAt = Date.now();
  let lastValue;

  while (Date.now() - startedAt < 7000) {
    lastValue = await page.evaluate(probe);
    if (lastValue === expected) {
      return lastValue;
    }
    await page.waitForTimeout(100);
  }

  throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(lastValue)}`);
}

async function readState(page) {
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('world-scale-simulator.state') ?? 'null'));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const consoleMessages = [];
  const pageErrors = [];

  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleMessages.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
  });

  const world = await context.newPage();
  await world.goto(baseUrl);
  await world.evaluate(() => {
    window.localStorage.removeItem('world-scale-simulator.state');
    window.localStorage.removeItem('world-scale-simulator.state-sync');
    window.localStorage.removeItem('world-scale-simulator.snapshots');
  });
  await world.goto(`${baseUrl}#/world`);
  await world.waitForSelector('text=City Digital Twin');

  const settings = await context.newPage();
  await settings.goto(`${baseUrl}#/settings`);
  await settings.waitForSelector('text=快捷切换');

  await settings.getByRole('button', { name: '深色', exact: true }).click();
  await waitFor(world, () => document.documentElement.dataset.theme, 'dark', 'world theme after settings dark');

  await world.getByRole('button', { name: '推进仿真' }).click();
  const worldStep = await world.evaluate(() => {
    const state = JSON.parse(window.localStorage.getItem('world-scale-simulator.state') ?? 'null');
    return state?.clock?.step ?? -1;
  });
  await waitFor(settings, () => {
    const state = JSON.parse(window.localStorage.getItem('world-scale-simulator.state') ?? 'null');
    return state?.clock?.step ?? -1;
  }, worldStep, 'settings clock after world tick');

  await settings.getByRole('button', { name: '中文', exact: true }).click();
  await waitFor(world, () => document.documentElement.lang, 'zh-CN', 'world lang after settings locale');

  const createDevice = await context.newPage();
  await createDevice.goto(`${baseUrl}#/create-device`);
  await createDevice.waitForSelector('text=创建智能终端设备');
  await createDevice.getByRole('button', { name: '注册智能终端设备' }).click();
  await createDevice.waitForSelector('text=/已提交/');
  await waitFor(world, () => {
    const state = JSON.parse(window.localStorage.getItem('world-scale-simulator.state') ?? 'null');
    return state?.devices?.length ?? 0;
  }, 1, 'world device count after create-device');

  const state = await readState(world);
  const syncMessage = await world.evaluate(() => JSON.parse(window.localStorage.getItem('world-scale-simulator.state-sync') ?? 'null'));
  const hasOldCssEntry = await world.evaluate(() =>
    Array.from(document.styleSheets)
      .map((sheet) => sheet.href ?? '')
      .some((href) => href.includes('app.css') || href.includes('theme.css')),
  );
  const tailwindLinked = await world.evaluate(() =>
    Array.from(document.styleSheets)
      .map((sheet) => sheet.href ?? '')
      .some((href) => href.includes('/static/css/index.')),
  );

  assert(state.settings.theme.mode === 'dark', 'persisted state theme should be dark');
  assert(state.devices.length === 1, 'persisted state should include created device');
  assert(syncMessage && typeof syncMessage.revision === 'number', 'state-sync message should carry numeric revision');
  assert(syncMessage && typeof syncMessage.createdAt === 'string', 'state-sync message should carry createdAt');
  assert(!hasOldCssEntry, 'runtime should not link app.css/theme.css');
  assert(tailwindLinked, 'runtime should link built Tailwind stylesheet');
  assert(consoleMessages.length === 0, `console errors: ${consoleMessages.join('\n')}`);
  assert(pageErrors.length === 0, `page errors: ${pageErrors.join('\n')}`);

  console.log(JSON.stringify({
    baseUrl,
    theme: state.settings.theme,
    step: state.clock.step,
    devices: state.devices.map((device) => device.name),
    syncRevision: syncMessage.revision,
    linkedTailwindCss: tailwindLinked,
  }, null, 2));

  await context.close();
  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
