const { test, expect } = require('@playwright/test');

const baseUrl = process.env.WORLD_SIM_BASE_URL ?? 'http://127.0.0.1:1431/';

async function noHorizontalOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test('window routes, theme sync, tooltips and overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  const world = await context.newPage();
  const settings = await context.newPage();

  await world.goto(baseUrl + '#/world');
  await settings.goto(baseUrl + '#/settings');
  await expect(world.locator('text=City Digital Twin')).toBeVisible();
  await expect(settings.locator('text=快捷切换')).toBeVisible();

  await settings.getByRole('button', { name: '深色', exact: true }).click();
  await expect(settings.locator('html')).toHaveAttribute('data-theme', 'dark');
  await world.bringToFront();
  await expect.poll(() => world.evaluate(() => document.documentElement.dataset.theme), { timeout: 5000 }).toBe('dark');

  const createWorld = await context.newPage();
  await createWorld.goto(baseUrl + '#/create-world');
  await expect(createWorld.getByRole('heading', { name: '创建世界' })).toBeVisible();
  await createWorld.getByRole('button', { name: '创建世界' }).last().click();
  await expect(createWorld.locator('text=/已创建|正在创建世界/')).toBeVisible();

  const createDevice = await context.newPage();
  await createDevice.goto(baseUrl + '#/create-device');
  await expect(createDevice.getByText('创建智能终端设备')).toBeVisible();
  await createDevice.getByRole('button', { name: '注册智能终端设备' }).click();
  await expect(createDevice.locator('text=/已提交/')).toBeVisible();

  await world.goto(baseUrl + '#/world');
  const firstIcon = world.locator('.sim-icon-button-wrap').first();
  await firstIcon.hover();
  await expect(firstIcon.locator('.sim-icon-tooltip')).toBeVisible();

  for (const route of ['#/world', '#/control', '#/settings', '#/create-world', '#/create-device']) {
    await world.goto(baseUrl + route);
    await expect.poll(() => noHorizontalOverflow(world), { timeout: 5000 }).toBe(true);
  }

  await context.close();
});
