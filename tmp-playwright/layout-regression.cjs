let chromium;

try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/private/tmp/worldsim-npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright'));
}

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const baseUrl = process.env.WORLD_SIM_BASE_URL ?? 'http://127.0.0.1:1421/';
const screenshotDir = process.env.WORLD_SIM_SCREENSHOT_DIR ?? '/tmp/worldsim-layout-regression-screenshots';
const stressState = makeState();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nowIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

function makeDevice(index) {
  const kinds = ['wheeled_robot', 'drone', 'humanoid', 'quadruped', 'sensor_node'];
  const kind = kinds[index % kinds.length];
  const id = `device-layout-${index + 1}`;

  return {
    id,
    kind,
    name: `布局压力设备-${index + 1}`,
    status: index % 3 === 0 ? 'working' : 'idle',
    capabilityTags: kind === 'drone' ? ['aerial_move', 'photo', 'search'] : ['ground_move', 'inspect', 'report'],
    physicalProfile: {
      minWorkAltitudeM: kind === 'drone' ? 3 : 0,
      maxWorkAltitudeM: kind === 'drone' ? 60 : 2,
      maxSlopeDeg: kind === 'quadruped' ? 28 : 12,
      supportedMaterials: kind === 'drone' ? ['air'] : ['asphalt', 'concrete', 'grass'],
      nominalPowerW: 18 + index,
      workingPowerW: 90 + index * 8,
      maxSpeedMps: 1.5 + index * 0.2,
      jointCount: kind === 'humanoid' ? 24 : 4,
    },
    currentTaskId: `task-layout-${(index % 18) + 1}`,
    telemetry: {
      position: [index * 4 + 2, index % 2 === 0 ? 0.2 : 4.5, index * 3 + 1],
      velocity: [0.2, 0, 0.1],
      headingDeg: (index * 23) % 360,
      batteryPercent: Math.max(12, 96 - index * 4),
      powerW: 60 + index * 11,
      signalStrength: Math.max(35, 96 - index * 3),
      temperatureC: 30 + index,
      speedMps: 0.8 + index * 0.1,
      jointAnglesDeg: [0, 8, 16, 24, 32, 40, 48, 56],
      jointQuaternion: [0, 0, 0, 1],
      lastSeenAt: nowIso(-index * 1000),
    },
    createdAt: nowIso(-index * 2000),
    updatedAt: nowIso(-index * 1000),
  };
}

function makeTask(index) {
  const statuses = ['queued', 'active', 'blocked', 'completed'];
  return {
    id: `task-layout-${index + 1}`,
    goalId: 'goal-layout-1',
    kind: index % 2 === 0 ? 'inspect' : 'photo',
    title: `复杂协同任务-${index + 1}-包含较长标题用于验证窄窗口换行`,
    description: '用于验证任务清单在复杂内容下仍可滚动到底部。',
    status: statuses[index % statuses.length],
    assigneeDeviceId: `device-layout-${(index % 14) + 1}`,
    progress: Math.min(1, (index + 1) / 18),
    notes: 'layout regression',
    createdAt: nowIso(-index * 3000),
    updatedAt: nowIso(-index * 1200),
  };
}

function makeState() {
  const timestamp = nowIso();
  const devices = Array.from({ length: 14 }, (_, index) => makeDevice(index));
  const tasks = Array.from({ length: 18 }, (_, index) => makeTask(index));
  const logs = Array.from({ length: 72 }, (_, index) => ({
    id: `log-layout-${index + 1}`,
    level: ['trace', 'debug', 'info', 'warn', 'error'][index % 5],
    scope: ['world', 'control', 'device', 'task', 'settings'][index % 5],
    message: `布局压力日志第 ${index + 1} 条，包含足够长的内容用于验证日志行换行和滚动底部可达。`,
    details: index % 4 === 0 ? `device-layout-${(index % 14) + 1}` : undefined,
    timestamp: nowIso(-index * 800),
  }));

  return {
    version: 1,
    phase: 'running',
    clock: {
      step: 42,
      simulationTimeMs: 42000,
      wallClockAt: timestamp,
    },
    settings: {
      theme: { mode: 'light', resolvedMode: 'light' },
      locale: 'zh-CN',
      logLevel: 'trace',
      autosaveEnabled: true,
      tickIntervalMs: 1000,
      terminalLogDensity: 'normal',
    },
    world: {
      id: 'world-layout',
      name: '布局压力世界',
      description: '用于前端窗口自适应与滚动回归验证的世界。',
      seed: 'layout-regression',
      coordinateSystemVisible: true,
      terrain: { slopeDeg: 8, weather: 'cloudy' },
      materials: [
        { id: 'mat-asphalt', name: '沥青', color: '#2b2f33', friction: 0.84, tags: ['road', 'ground'] },
        { id: 'mat-concrete', name: '混凝土', color: '#d8dadd', friction: 0.78, tags: ['structure', 'ground'] },
      ],
      objects: Array.from({ length: 36 }, (_, index) => ({
        id: `world-object-${index + 1}`,
        kind: index % 4 === 0 ? 'road_segment' : index % 3 === 0 ? 'landmark' : 'building',
        name: `对象-${index + 1}`,
        description: '布局测试对象',
        position: [(index * 7) % 100, 0, (index * 11) % 100],
        rotation: [0, 0, 0],
        scale: [8, index % 4 === 0 ? 0.2 : 12 + index, 8],
        materialId: index % 4 === 0 ? 'mat-asphalt' : 'mat-concrete',
        tags: ['layout', 'test'],
      })),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    physicalRules: {
      droneMinAltitudeM: 3,
      droneMaxAltitudeM: 60,
      roverMaxSlopeDeg: 12,
      humanoidMaxSlopeDeg: 18,
      quadrupedMaxSlopeDeg: 28,
      groundAllowedMaterials: ['asphalt', 'concrete', 'grass', 'packed_soil'],
    },
    devices,
    goals: [
      {
        id: 'goal-layout-1',
        title: '开放园区多设备协同巡检',
        description: '布局压力目标',
        sourceText: '请执行开放园区多设备协同巡检。',
        priority: 'urgent',
        status: 'active',
        childTaskIds: tasks.map((task) => task.id),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    tasks,
    logs,
    windows: [],
  };
}

async function installStressState(context, page) {
  await context.addInitScript((state) => {
    window.localStorage.setItem('world-scale-simulator.state', JSON.stringify(state));
    window.localStorage.setItem('world-scale-simulator.state-sync', JSON.stringify({
      revision: Date.now(),
      createdAt: new Date().toISOString(),
      state,
    }));
  }, stressState);
  await page.addInitScript((state) => {
    window.localStorage.setItem('world-scale-simulator.state', JSON.stringify(state));
    window.localStorage.setItem('world-scale-simulator.state-sync', JSON.stringify({
      revision: Date.now(),
      createdAt: new Date().toISOString(),
      state,
    }));
  }, stressState);

  await page.goto(baseUrl);
  await page.evaluate((state) => {
    window.localStorage.setItem('world-scale-simulator.state', JSON.stringify(state));
    window.localStorage.setItem('world-scale-simulator.state-sync', JSON.stringify({
      revision: Date.now(),
      createdAt: new Date().toISOString(),
      state,
    }));
  }, stressState);
}

function readPngChunk(buffer, offset) {
  return {
    length: buffer.readUInt32BE(offset),
    type: buffer.toString('ascii', offset + 4, offset + 8),
    dataOffset: offset + 8,
    nextOffset: offset + 12 + buffer.readUInt32BE(offset),
  };
}

function inspectScreenshotPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const chunk = readPngChunk(buffer, offset);
    if (chunk.type === 'IHDR') {
      width = buffer.readUInt32BE(chunk.dataOffset);
      height = buffer.readUInt32BE(chunk.dataOffset + 4);
    } else if (chunk.type === 'IDAT') {
      idatChunks.push(buffer.subarray(chunk.dataOffset, chunk.dataOffset + chunk.length));
    } else if (chunk.type === 'IEND') {
      break;
    }
    offset = chunk.nextOffset;
  }

  return {
    width,
    height,
    byteSize: buffer.length,
    idatByteSize: Buffer.concat(idatChunks).length,
  };
}

function decodeScreenshotPng(filePath) {
  const buffer = fs.readFileSync(filePath);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const chunk = readPngChunk(buffer, offset);
    if (chunk.type === 'IHDR') {
      width = buffer.readUInt32BE(chunk.dataOffset);
      height = buffer.readUInt32BE(chunk.dataOffset + 4);
      bitDepth = buffer.readUInt8(chunk.dataOffset + 8);
      colorType = buffer.readUInt8(chunk.dataOffset + 9);
    } else if (chunk.type === 'IDAT') {
      idatChunks.push(buffer.subarray(chunk.dataOffset, chunk.dataOffset + chunk.length));
    } else if (chunk.type === 'IEND') {
      break;
    }
    offset = chunk.nextOffset;
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`不支持的 PNG 格式: bitDepth=${bitDepth}, colorType=${colorType}`);
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(width * height * 4);
  let readOffset = 0;
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated.readUInt8(readOffset);
    readOffset += 1;
    const raw = Buffer.from(inflated.subarray(readOffset, readOffset + stride));
    readOffset += stride;
    const row = Buffer.alloc(stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let value = raw[x];

      if (filter === 1) {
        value = (value + left) & 0xff;
      } else if (filter === 2) {
        value = (value + up) & 0xff;
      } else if (filter === 3) {
        value = (value + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (value + predictor) & 0xff;
      } else if (filter !== 0) {
        throw new Error(`不支持的 PNG filter: ${filter}`);
      }

      row[x] = value;
    }

    for (let x = 0; x < width; x += 1) {
      const src = x * bytesPerPixel;
      const dst = (y * width + x) * 4;
      pixels[dst] = row[src];
      pixels[dst + 1] = row[src + 1];
      pixels[dst + 2] = row[src + 2];
      pixels[dst + 3] = colorType === 6 ? row[src + 3] : 255;
    }

    previous = row;
  }

  return {
    width,
    height,
    pixels,
  };
}

function inspectRegionPixels(decodedPng, region) {
  if (!region) {
    return null;
  }

  const left = Math.max(0, Math.floor(region.x));
  const top = Math.max(0, Math.floor(region.y));
  const right = Math.min(decodedPng.width, Math.ceil(region.x + region.width));
  const bottom = Math.min(decodedPng.height, Math.ceil(region.y + region.height));
  const stepX = Math.max(1, Math.floor((right - left) / 24));
  const stepY = Math.max(1, Math.floor((bottom - top) / 24));
  const unique = new Set();
  let nonTransparent = 0;
  let samples = 0;

  for (let y = top; y < bottom; y += stepY) {
    for (let x = left; x < right; x += stepX) {
      const offset = (y * decodedPng.width + x) * 4;
      const r = decodedPng.pixels[offset];
      const g = decodedPng.pixels[offset + 1];
      const b = decodedPng.pixels[offset + 2];
      const a = decodedPng.pixels[offset + 3];
      unique.add(`${r},${g},${b},${a}`);
      if (a > 0) {
        nonTransparent += 1;
      }
      samples += 1;
    }
  }

  return {
    samples,
    nonTransparent,
    uniqueColors: unique.size,
  };
}

function screenshotName(route, viewport) {
  return `${route.replace(/^#\//, '').replace(/[^a-z0-9-]+/gi, '-')}-${viewport.width}x${viewport.height}.png`;
}

async function inspectRoute(page, route, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.sim-page');
  await page.waitForTimeout(350);

  const result = await page.evaluate(() => {
    function scrollInfo(element) {
      const before = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      const after = element.scrollTop;
      const rect = element.getBoundingClientRect();
      const lastChild = element.lastElementChild;
      const lastRect = lastChild?.getBoundingClientRect();
      element.scrollTop = before;

      return {
        className: element.className,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        canReachBottom: Math.ceil(after + element.clientHeight) >= element.scrollHeight,
        bottomChildVisible: lastRect ? lastRect.bottom <= rect.bottom + 2 : true,
      };
    }

    const scrollables = Array.from(document.querySelectorAll('.sim-scroll-area, .sim-scroll-list, .sim-responsive-grid, .sim-responsive-world'))
      .filter((element) => element.scrollHeight > element.clientHeight + 2)
      .map(scrollInfo);
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const pageRect = document.querySelector('.sim-page')?.getBoundingClientRect();
    const pageChildren = Array.from(document.querySelector('.sim-page')?.children ?? []).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        className: element.className,
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        withinViewport: rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
      };
    });
    const maxRight = Math.max(
      ...Array.from(document.body.querySelectorAll('*')).map((element) => Math.ceil(element.getBoundingClientRect().right)),
      0,
    );

    return {
      url: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1
        && document.body.scrollWidth <= window.innerWidth + 1
        && maxRight <= window.innerWidth + 1,
      pageHeightOk: pageRect ? pageRect.height <= window.innerHeight + 1 : false,
      pageChildren,
      scrollables,
      hasCanvas: Boolean(canvas),
      canvasCssSize: canvasRect ? { width: Math.round(canvasRect.width), height: Math.round(canvasRect.height) } : null,
      canvasRect: canvasRect ? {
        x: canvasRect.x,
        y: canvasRect.y,
        width: canvasRect.width,
        height: canvasRect.height,
      } : null,
      canvasBufferSize: canvas ? { width: canvas.width, height: canvas.height } : null,
      visibleTexts: document.body.innerText.slice(0, 400),
    };
  });

  fs.mkdirSync(screenshotDir, { recursive: true });
  const screenshotPath = path.join(screenshotDir, screenshotName(route, viewport));
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const screenshotPng = inspectScreenshotPng(screenshotPath);
  const decodedPng = decodeScreenshotPng(screenshotPath);
  const canvasRegionPixels = inspectRegionPixels(decodedPng, result.canvasRect);

  return {
    ...result,
    screenshotPath,
    screenshotPng,
    canvasRegionPixels,
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleEntries = [];
  const pageErrors = [];

  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'warning' && text.includes('GPU stall due to ReadPixels')) {
      return;
    }
    if (['error', 'warning'].includes(message.type())) {
      consoleEntries.push(`${message.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await installStressState(context, page);

  const routes = ['#/world', '#/control', '#/settings', '#/glasses', '#/device/device-layout-14', '#/task/task-layout-18', '#/create-world', '#/create-device'];
  const viewports = [
    { width: 1280, height: 760 },
    { width: 900, height: 560 },
    { width: 430, height: 760 },
  ];
  const results = [];

  for (const viewport of viewports) {
    for (const route of routes) {
      const result = await inspectRoute(page, route, viewport);
      results.push({ route, ...result });
      assert(result.noHorizontalOverflow, `${route} ${viewport.width}x${viewport.height} 存在横向溢出: doc=${result.docScrollWidth}, body=${result.bodyScrollWidth}`);
      assert(result.pageHeightOk, `${route} ${viewport.width}x${viewport.height} .sim-page 高度超过视口`);
      for (const child of result.pageChildren) {
        assert(child.withinViewport, `${route} ${viewport.width}x${viewport.height} 页面直接子容器被裁剪: ${child.className} bottom=${child.bottom}`);
      }
      for (const item of result.scrollables) {
        assert(item.canReachBottom, `${route} ${viewport.width}x${viewport.height} 滚动容器无法到底: ${item.className}`);
      }
      if (route === '#/world' || route === '#/glasses' || route.startsWith('#/device')) {
        assert(result.hasCanvas, `${route} ${viewport.width}x${viewport.height} 缺少 canvas`);
        assert(result.canvasCssSize.width >= 260, `${route} ${viewport.width}x${viewport.height} canvas 宽度过小`);
        assert(result.canvasCssSize.height >= 180, `${route} ${viewport.width}x${viewport.height} canvas 高度过小`);
        assert(result.canvasRegionPixels && result.canvasRegionPixels.nonTransparent > 0, `${route} ${viewport.width}x${viewport.height} canvas 截图区透明`);
        assert(result.canvasRegionPixels.uniqueColors > 12, `${route} ${viewport.width}x${viewport.height} canvas 截图区颜色过少，疑似空白`);
      }
      assert(result.screenshotPng.width === viewport.width, `${route} ${viewport.width}x${viewport.height} 截图宽度异常`);
      assert(result.screenshotPng.height === viewport.height, `${route} ${viewport.width}x${viewport.height} 截图高度异常`);
      assert(result.screenshotPng.idatByteSize > 5000, `${route} ${viewport.width}x${viewport.height} 截图数据过小，疑似空白`);
    }
  }

  assert(consoleEntries.length === 0, `console warnings/errors:\n${consoleEntries.join('\n')}`);
  assert(pageErrors.length === 0, `page errors:\n${pageErrors.join('\n')}`);

  console.log(JSON.stringify({
    baseUrl,
    checked: results.map((item) => ({
      route: item.route,
      viewport: item.viewport,
      scrollableCount: item.scrollables.length,
      canvasCssSize: item.canvasCssSize,
      noHorizontalOverflow: item.noHorizontalOverflow,
      screenshotPath: item.screenshotPath,
      screenshotPng: item.screenshotPng,
      canvasRegionPixels: item.canvasRegionPixels,
    })),
  }, null, 2));

  await browser.close();
})().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
