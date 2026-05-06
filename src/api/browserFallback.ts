import {
  createDefaultSimulationState,
  createSimulationLogEntry,
  type DeviceKind,
  type SimulationDevice,
  type SimulationGoal,
  type SimulationState,
  type SimulationTask,
  type WorldObject,
  type WorldSnapshot,
  type WorldSnapshotRecord,
} from '../types';
import { appendDeviceToState, appendGoalToState, replaceWorldInState, touchStateClock } from '../state/simulationStore';

type BrowserInvokeArgs = Record<string, unknown> | undefined;
type BrowserInvokeHandler = (args: BrowserInvokeArgs) => unknown | Promise<unknown>;

const STORAGE_KEY = 'world-scale-simulator.state';
const SNAPSHOT_KEY = 'world-scale-simulator.snapshots';
const browserHandlers = new Map<string, BrowserInvokeHandler>();

let memoryState = createDefaultSimulationState();
let memorySnapshots: Record<string, SimulationState> = {};

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function resolveBrowserTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredState(): SimulationState {
  if (!canUseLocalStorage()) {
    return memoryState;
  }

  const rawState = window.localStorage.getItem(STORAGE_KEY);
  if (!rawState) {
    return memoryState;
  }

  try {
    const parsed = JSON.parse(rawState) as SimulationState;
    memoryState = parsed;
    return parsed;
  } catch {
    return memoryState;
  }
}

function writeStoredState(state: SimulationState) {
  memoryState = state;

  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function readStoredSnapshots(): Record<string, SimulationState> {
  if (!canUseLocalStorage()) {
    return memorySnapshots;
  }

  const rawSnapshots = window.localStorage.getItem(SNAPSHOT_KEY);
  if (!rawSnapshots) {
    return memorySnapshots;
  }

  try {
    memorySnapshots = JSON.parse(rawSnapshots) as Record<string, SimulationState>;
    return memorySnapshots;
  } catch {
    return memorySnapshots;
  }
}

function writeStoredSnapshots(snapshots: Record<string, SimulationState>) {
  memorySnapshots = snapshots;

  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
}

function cloneState(state: SimulationState): SimulationState {
  return JSON.parse(JSON.stringify(state)) as SimulationState;
}

function extractSimulationState(args: BrowserInvokeArgs): SimulationState {
  if (!args || typeof args !== 'object') {
    return readStoredState();
  }

  const candidate = args.state;
  if (candidate && typeof candidate === 'object') {
    return candidate as SimulationState;
  }

  return readStoredState();
}

function extractDeviceId(args: BrowserInvokeArgs): string {
  if (!args || typeof args !== 'object' || typeof args.deviceId !== 'string') {
    throw new Error('browser fallback 需要 deviceId 参数');
  }

  return args.deviceId;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function weatherPhysics(weather: WorldSnapshot['terrain']['weather']) {
  if (weather === 'stormy') {
    return {
      precipitationMmH: 18,
      windMps: 16,
      visibilityM: 140,
      surfaceFrictionScale: 0.55,
    };
  }
  if (weather === 'rainy') {
    return {
      precipitationMmH: 8,
      windMps: 6,
      visibilityM: 420,
      surfaceFrictionScale: 0.72,
    };
  }
  if (weather === 'foggy') {
    return {
      precipitationMmH: 0.8,
      windMps: 2,
      visibilityM: 90,
      surfaceFrictionScale: 0.86,
    };
  }
  if (weather === 'windy') {
    return {
      precipitationMmH: 0,
      windMps: 11,
      visibilityM: 900,
      surfaceFrictionScale: 0.94,
    };
  }
  if (weather === 'cloudy') {
    return {
      precipitationMmH: 0,
      windMps: 4,
      visibilityM: 1200,
      surfaceFrictionScale: 1,
    };
  }
  return {
    precipitationMmH: 0,
    windMps: 1.5,
    visibilityM: 1600,
    surfaceFrictionScale: 1,
  };
}

interface BrowserOsmPoint {
  lat: number;
  lon: number;
}

interface BrowserNominatimPlace {
  lat: string;
  lon: string;
  display_name: string;
}

interface BrowserOverpassElement {
  id: number;
  type: string;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: BrowserOsmPoint[];
}

interface BrowserOverpassResponse {
  elements?: BrowserOverpassElement[];
}

function lonLatToWorld(lon: number, lat: number, centerLon: number, centerLat: number, radiusM: number): [number, number] {
  const metersPerLat = 111_320;
  const metersPerLon = Math.max(0.2, Math.abs(Math.cos((centerLat / 180) * Math.PI))) * 111_320;
  const dxM = (lon - centerLon) * metersPerLon;
  const dzM = (lat - centerLat) * metersPerLat;
  const scale = 100 / (radiusM * 2);
  const x = Math.max(0, Math.min(100, 50 + dxM * scale));
  const z = Math.max(0, Math.min(100, 50 - dzM * scale));
  return [x, z];
}

function geometryBBox(points: BrowserOsmPoint[]) {
  if (!points.length) {
    return undefined;
  }

  return points.reduce(
    (bbox, point) => ({
      minLat: Math.min(bbox.minLat, point.lat),
      maxLat: Math.max(bbox.maxLat, point.lat),
      minLon: Math.min(bbox.minLon, point.lon),
      maxLon: Math.max(bbox.maxLon, point.lon),
    }),
    {
      minLat: points[0].lat,
      maxLat: points[0].lat,
      minLon: points[0].lon,
      maxLon: points[0].lon,
    },
  );
}

function parseOsmHeightM(tags: Record<string, string>, fallback: number) {
  const height = Number.parseFloat(tags.height?.replace(/m$/i, '').trim() ?? '');
  if (Number.isFinite(height)) {
    return Math.max(3, Math.min(120, height));
  }

  const levels = Number.parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels)) {
    return Math.max(3, Math.min(120, levels * 3.2));
  }

  return fallback;
}

function overpassElementToWorldObject(element: BrowserOverpassElement, centerLat: number, centerLon: number, radiusM: number): WorldObject | undefined {
  const tags = element.tags ?? {};
  const hasHighway = Boolean(tags.highway);
  const hasBuilding = Boolean(tags.building);
  const hasGreen = Boolean(tags.leisure) || tags.landuse === 'grass' || tags.landuse === 'park';
  const hasWater = tags.natural === 'water';
  const hasPoi = Boolean(tags.amenity) || Boolean(tags.shop) || Boolean(tags.tourism);

  if (!hasHighway && !hasBuilding && !hasGreen && !hasWater && !hasPoi) {
    return undefined;
  }

  const points = element.geometry?.length
    ? element.geometry
    : typeof element.lat === 'number' && typeof element.lon === 'number'
      ? [{ lat: element.lat, lon: element.lon }]
      : [];
  const bbox = geometryBBox(points);
  if (!bbox) {
    return undefined;
  }

  const centerPoint = {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lon: (bbox.minLon + bbox.maxLon) / 2,
  };
  const [centerX, centerZ] = lonLatToWorld(centerPoint.lon, centerPoint.lat, centerLon, centerLat, radiusM);
  const [minX, minZ] = lonLatToWorld(bbox.minLon, bbox.maxLat, centerLon, centerLat, radiusM);
  const [maxX, maxZ] = lonLatToWorld(bbox.maxLon, bbox.minLat, centerLon, centerLat, radiusM);
  const width = Math.max(2.2, Math.abs(maxX - minX));
  const depth = Math.max(2.2, Math.abs(maxZ - minZ));
  const fallbackName = hasHighway
    ? 'OpenStreetMap 道路'
    : hasBuilding
      ? 'OpenStreetMap 建筑'
      : hasPoi
        ? 'OpenStreetMap 兴趣点'
        : 'OpenStreetMap 图层';
  const name = tags.name ?? `${fallbackName} ${element.id}`;
  const properties: Record<string, string> = {
    source: 'openstreetmap',
    source_name: 'OpenStreetMap',
    osm_id: String(element.id),
    osm_type: element.type,
    lat: centerPoint.lat.toFixed(6),
    lon: centerPoint.lon.toFixed(6),
  };

  for (const key of ['name', 'highway', 'building', 'amenity', 'shop', 'tourism', 'landuse', 'leisure', 'natural', 'height', 'building:levels']) {
    const value = tags[key];
    if (value) {
      properties[`osm_tag_${key}`] = value;
    }
  }

  if (hasHighway) {
    const first = points[0];
    const last = points[points.length - 1];
    const [firstX, firstZ] = lonLatToWorld(first.lon, first.lat, centerLon, centerLat, radiusM);
    const [lastX, lastZ] = lonLatToWorld(last.lon, last.lat, centerLon, centerLat, radiusM);
    const dx = lastX - firstX;
    const dz = lastZ - firstZ;
    const orientationRad = Math.atan2(dz, dx);
    const length = Math.max(3, Math.hypot(dx, dz), width, depth);
    properties.material = 'asphalt';
    properties.orientation_rad = String(orientationRad);
    return {
      id: randomId('osm-road'),
      kind: 'road_segment',
      name,
      description: 'OpenStreetMap 在线道路数据，作为真实街区可通行路径。',
      position: [centerX, 0, centerZ],
      rotation: [0, orientationRad, 0],
      scale: [length, 0.2, 3.2],
      materialId: 'mat-asphalt',
      tags: ['road_segment', 'osm', 'real_street'],
      properties,
    };
  }

  if (hasBuilding) {
    const height = parseOsmHeightM(tags, 14 + (Math.abs(element.id) % 12) * 2.2);
    properties.material = 'concrete';
    properties.height_m = height.toFixed(1);
    return {
      id: randomId('osm-building'),
      kind: 'building',
      name,
      description: 'OpenStreetMap 在线建筑轮廓拉伸形成的 3D 建筑体量。',
      position: [centerX, 0, centerZ],
      rotation: [0, 0, 0],
      scale: [Math.max(3, width), height, Math.max(3, depth)],
      materialId: 'mat-concrete',
      tags: ['building', 'osm', 'real_street'],
      properties,
    };
  }

  properties.material = hasWater ? 'water' : 'grass';
  return {
    id: randomId(hasPoi ? 'osm-poi' : 'osm-terrain'),
    kind: hasPoi ? 'landmark' : hasWater ? 'water' : 'terrain_patch',
    name,
    description: hasPoi ? 'OpenStreetMap 在线兴趣点。' : 'OpenStreetMap 在线地表语义图层。',
    position: [centerX, 0, centerZ],
    rotation: [0, 0, 0],
    scale: [Math.max(2.4, width), hasPoi ? 8 : 0.2, Math.max(2.4, depth)],
    materialId: hasWater ? 'mat-water' : 'mat-grass',
    tags: ['osm', hasPoi ? 'poi' : 'terrain_patch'],
    properties,
  };
}

async function fetchOsmWorldObjects(streetAddress: string, centerLatInput: number | undefined, centerLonInput: number | undefined, radiusM: number) {
  let centerLat = centerLatInput;
  let centerLon = centerLonInput;
  let displayName = streetAddress;

  if (typeof centerLat !== 'number' || typeof centerLon !== 'number') {
    const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
    searchUrl.searchParams.set('format', 'jsonv2');
    searchUrl.searchParams.set('limit', '1');
    searchUrl.searchParams.set('q', streetAddress);
    const response = await fetch(searchUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Nominatim HTTP ${response.status}`);
    }
    const places = await response.json() as BrowserNominatimPlace[];
    const place = places[0];
    if (!place) {
      throw new Error(`Nominatim 未找到地点：${streetAddress}`);
    }
    centerLat = Number.parseFloat(place.lat);
    centerLon = Number.parseFloat(place.lon);
    displayName = place.display_name;
  }

  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) {
    throw new Error('街区中心经纬度无效');
  }

  const query = `
    [out:json][timeout:18];
    (
      way["highway"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      way["building"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      relation["building"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      way["leisure"~"park|garden"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      way["landuse"~"grass|park|recreation_ground"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      way["natural"="water"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      node["amenity"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      node["shop"](around:${Math.round(radiusM)},${centerLat},${centerLon});
      node["tourism"](around:${Math.round(radiusM)},${centerLat},${centerLon});
    );
    out geom 160;
  `;
  const overpassResponse = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query,
  });
  if (!overpassResponse.ok) {
    throw new Error(`Overpass HTTP ${overpassResponse.status}`);
  }

  const overpass = await overpassResponse.json() as BrowserOverpassResponse;
  const objects = (overpass.elements ?? [])
    .map((element) => overpassElementToWorldObject(element, centerLat, centerLon, radiusM))
    .filter((object): object is WorldObject => Boolean(object))
    .sort((left, right) => {
      const rank = (object: WorldObject) => object.kind === 'road_segment' ? 0 : object.kind === 'building' ? 1 : 2;
      return rank(left) - rank(right);
    })
    .slice(0, 180);

  const roadCount = objects.filter((object) => object.kind === 'road_segment').length;
  const buildingCount = objects.filter((object) => object.kind === 'building' || object.kind === 'landmark').length;
  if (roadCount < 2 || buildingCount < 2) {
    throw new Error('Overpass 返回的道路或建筑数量不足');
  }

  return {
    centerLat,
    centerLon,
    displayName,
    objects,
    roadCount,
    buildingCount,
    poiCount: objects.filter((object) => object.tags.includes('poi')).length,
  };
}

async function createGeneratedWorld(args: BrowserInvokeArgs): Promise<WorldSnapshot> {
  const current = readStoredState();
  const input = args && typeof args === 'object' && args.input && typeof args.input === 'object'
    ? (args.input as {
        name?: string;
        seed?: number;
        object_density?: number;
        street_address?: string;
        district?: string;
        center_lat?: number;
        center_lon?: number;
        radius_m?: number;
        data_source?: string;
      })
    : {};
  const timestamp = nowIso();
  const streetAddress = input.street_address?.trim() || '解放路城市演示街区';
  const district = input.district?.trim() || '示范行政区';
  const radiusM = Math.max(120, Math.min(3000, input.radius_m ?? 500));
  const dataSource = input.data_source?.trim() || 'OpenStreetMap';
  if (!/^openstreetmap$/i.test(dataSource)) {
    throw new Error(`只支持在线 OpenStreetMap 3D 地图渠道，当前数据源不受支持：${dataSource}`);
  }
  const weather = 'sunny' as WorldSnapshot['terrain']['weather'];
  const dataset = await fetchOsmWorldObjects(streetAddress, input.center_lat, input.center_lon, radiusM);
  const objects = [...dataset.objects];

  objects.unshift({
    id: randomId('metadata'),
    kind: 'boundary',
    name: `${streetAddress} 元数据`,
    description: `指定街道 3D 建筑街景：${streetAddress}，中心 ${dataset.centerLat.toFixed(6)},${dataset.centerLon.toFixed(6)}，半径 ${radiusM}m，来源 ${dataSource}。`,
    position: [50, 0, 50],
    rotation: [0, 0, 0],
    scale: [100, 0.05, 100],
    materialId: 'mat-grass',
    tags: ['world_metadata', 'real_street', 'osm'],
    properties: {
      world_metadata: 'true',
      description: `指定街道 3D 建筑街景：${streetAddress}，中心 ${dataset.centerLat.toFixed(6)},${dataset.centerLon.toFixed(6)}，半径 ${radiusM}m，来源 ${dataSource}。`,
      street_address: streetAddress,
      district,
      center_lat: dataset.centerLat.toFixed(6),
      center_lon: dataset.centerLon.toFixed(6),
      radius_m: String(Math.round(radiusM)),
      data_source: dataSource,
      data_status: 'online_osm',
      source: 'openstreetmap',
      osm_display_name: dataset.displayName,
      building_count: String(dataset.buildingCount),
      road_count: String(dataset.roadCount),
      poi_count: String(dataset.poiCount),
      license: 'OpenStreetMap contributors / ODbL',
      created_by: 'TerminalLink browser fallback',
      created_at: timestamp,
    },
  });

  return {
    ...current.world,
    id: randomId('world'),
    name: input.name ?? `${streetAddress} 实景世界`,
    description: `指定街道 3D 建筑街景：${streetAddress}，中心 ${dataset.centerLat.toFixed(6)},${dataset.centerLon.toFixed(6)}，半径 ${radiusM}m。`,
    seed: String(input.seed ?? Date.now()),
    metadata: {
      street_address: streetAddress,
      district,
      center_lat: dataset.centerLat.toFixed(6),
      center_lon: dataset.centerLon.toFixed(6),
      radius_m: String(Math.round(radiusM)),
      data_source: dataSource,
      data_status: 'online_osm',
      osm_display_name: dataset.displayName,
      building_count: String(dataset.buildingCount),
      road_count: String(dataset.roadCount),
      poi_count: String(dataset.poiCount),
      license: 'OpenStreetMap contributors / ODbL',
    },
    terrain: {
      slopeDeg: 4,
      weather,
      ...weatherPhysics(weather),
    },
    objects,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function rustKindToUi(kind?: string): DeviceKind {
  if (kind === 'drone') {
    return 'drone';
  }
  if (kind === 'humanoid') {
    return 'humanoid';
  }
  if (kind === 'quadruped') {
    return 'quadruped';
  }
  if (kind === 'sensor_hub') {
    return 'sensor_node';
  }
  return 'wheeled_robot';
}

function defaultPhysicalProfile(kind: DeviceKind, state = readStoredState()) {
  const rules = state.physicalRules;

  if (kind === 'drone') {
    return {
      minWorkAltitudeM: rules.droneMinAltitudeM,
      maxWorkAltitudeM: rules.droneMaxAltitudeM,
      maxSlopeDeg: 90,
      supportedMaterials: ['air'],
      nominalPowerW: 36,
      workingPowerW: 180,
      maxSpeedMps: 12,
      jointCount: 4,
    };
  }

  if (kind === 'humanoid') {
    return {
      minWorkAltitudeM: 0,
      maxWorkAltitudeM: 2.4,
      maxSlopeDeg: rules.humanoidMaxSlopeDeg,
      supportedMaterials: [...rules.groundAllowedMaterials],
      nominalPowerW: 42,
      workingPowerW: 260,
      maxSpeedMps: 1.4,
      jointCount: 24,
    };
  }

  if (kind === 'quadruped') {
    return {
      minWorkAltitudeM: 0,
      maxWorkAltitudeM: 1.4,
      maxSlopeDeg: rules.quadrupedMaxSlopeDeg,
      supportedMaterials: [...rules.groundAllowedMaterials],
      nominalPowerW: 30,
      workingPowerW: 180,
      maxSpeedMps: 2.2,
      jointCount: 12,
    };
  }

  return {
    minWorkAltitudeM: 0,
    maxWorkAltitudeM: 2,
    maxSlopeDeg: rules.roverMaxSlopeDeg,
    supportedMaterials: rules.groundAllowedMaterials.filter((material) => material !== 'grass'),
    nominalPowerW: 18,
    workingPowerW: 90,
    maxSpeedMps: 2,
    jointCount: 4,
  };
}

function createDeviceFromArgs(args: BrowserInvokeArgs): SimulationDevice {
  if (args && typeof args === 'object' && args.device) {
    return args.device as SimulationDevice;
  }
  if (!args || typeof args !== 'object' || !args.input || typeof args.input !== 'object') {
    throw new Error('browser fallback 需要 input 或 device 参数');
  }

  const input = args.input as {
    name?: string;
    kind?: string;
    battery?: number;
    position?: { x: number; y: number; z: number };
    capabilities?: string[];
    physical_profile?: {
      min_work_altitude_m: number;
      max_work_altitude_m: number;
      max_slope_deg: number;
      supported_materials: string[];
      nominal_power_w: number;
      working_power_w: number;
      max_speed_mps: number;
      joint_count: number;
    };
  };
  const now = nowIso();
  const kind = rustKindToUi(input.kind);
  const profile = input.physical_profile
    ? {
        minWorkAltitudeM: input.physical_profile.min_work_altitude_m,
        maxWorkAltitudeM: input.physical_profile.max_work_altitude_m,
        maxSlopeDeg: input.physical_profile.max_slope_deg,
        supportedMaterials: input.physical_profile.supported_materials,
        nominalPowerW: input.physical_profile.nominal_power_w,
        workingPowerW: input.physical_profile.working_power_w,
        maxSpeedMps: input.physical_profile.max_speed_mps,
        jointCount: input.physical_profile.joint_count,
      }
    : defaultPhysicalProfile(kind);
  return {
    id: randomId('device'),
    kind,
    name: input.name ?? '模拟设备',
    status: 'idle',
    capabilityTags: input.capabilities ?? (kind === 'drone' ? ['aerial_move', 'photo'] : ['ground_move', 'inspect']),
    physicalProfile: profile,
    telemetry: {
      position: input.position ? [input.position.x, input.position.y, input.position.z] : [0, kind === 'drone' ? 8 : 0, 0],
      velocity: [0, 0, 0],
      headingDeg: 0,
      batteryPercent: input.battery ?? 100,
      powerW: profile.nominalPowerW,
      signalStrength: 96,
      temperatureC: 30,
      speedMps: 0,
      jointAnglesDeg: Array.from({ length: Math.min(profile.jointCount, 8) }, () => 0),
      jointQuaternion: [0, 0, 0, 1],
      lastSeenAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createGatewayGoalAndTasksFromArgs(args: BrowserInvokeArgs): { goal: SimulationGoal; tasks: SimulationTask[] } {
  if (args && typeof args === 'object' && args.goal) {
    return {
      goal: args.goal as SimulationGoal,
      tasks: [],
    };
  }
  if (!args || typeof args !== 'object' || !args.input || typeof args.input !== 'object') {
    throw new Error('browser fallback 需要 input 或 goal 参数');
  }

  const input = args.input as { title?: string; description?: string; priority?: number };
  const now = nowIso();
  const goalId = randomId('goal');
  const title = input.title ?? '协同目标';
  const devices = readStoredState().devices;
  const taskTitles = [
    'intent_agent 解析 AR 眼镜目标',
    'dispatch_agent 选择可用异构终端',
    'safety_agent 校验执行边界并下发',
  ];
  const tasks: SimulationTask[] = taskTitles.map((taskTitle, index) => ({
    id: randomId('task'),
    goalId,
    kind: index === 0 ? 'custom' : index === 1 ? 'inspect' : 'custom',
    title: taskTitle,
    description: input.description ?? title,
    status: devices.length ? 'active' : 'blocked',
    progress: devices.length ? 0.04 : 0,
    notes: 'browser fallback agent plan',
    createdAt: now,
    updatedAt: now,
    assigneeDeviceId: devices[index % Math.max(1, devices.length)]?.id,
  }));
  return {
    goal: {
      id: goalId,
      title,
      description: input.description ?? title,
      sourceText: input.description ?? title,
      priority: (input.priority ?? 5) >= 9 ? 'urgent' : (input.priority ?? 5) >= 7 ? 'high' : 'normal',
      status: 'active',
      childTaskIds: tasks.map((task) => task.id),
      createdAt: now,
      updatedAt: now,
    },
    tasks,
  };
}

function createBrowserLlmSseLogs(goal: SimulationGoal, tasks: SimulationTask[]) {
  const taskSummary = tasks.length
    ? tasks.map((task, index) => `${index + 1}. ${task.title}`).join('；')
    : '无可执行任务';

  return [
    createSimulationLogEntry({
      level: 'info',
      scope: 'llm_sse',
      message: '浏览器 fallback: LLM SSE 请求开始，使用模拟 agents 规划流。',
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'debug',
      scope: 'llm_sse',
      message: `浏览器 fallback: LLM SSE delta #1: intent_agent 已解析目标「${goal.title}」。`,
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'debug',
      scope: 'llm_sse',
      message: `浏览器 fallback: LLM SSE delta #2: dispatch_agent 生成任务：${taskSummary}`,
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'debug',
      scope: 'llm_sse',
      message: '浏览器 fallback: LLM SSE delta #3: safety_agent 已校验执行边界。',
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'info',
      scope: 'llm_sse',
      message: `浏览器 fallback: LLM SSE 结果解析完成，tasks=${tasks.length}。`,
      details: goal.id,
    }),
  ];
}

function extractSteps(args: BrowserInvokeArgs): number {
  if (!args || typeof args !== 'object') {
    return 1;
  }
  const input = args.input;
  if (input && typeof input === 'object' && typeof (input as { steps?: unknown }).steps === 'number') {
    return Math.max(1, (input as { steps: number }).steps);
  }
  return typeof args.deltaMs === 'number' ? 1 : 1;
}

function sanitizeSnapshotName(name: string) {
  return name.replace(/[^A-Za-z0-9_-]/g, '_');
}

function registerDefaultHandlers() {
  browserHandlers.set('load_state', () => cloneState(readStoredState()));
  browserHandlers.set('save_state', (args) => {
    const nextState = extractSimulationState(args);
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('generate_world', (args) => {
    const currentState = readStoredState();
    return createGeneratedWorld(args).then((nextWorld) => {
      const nextState = {
        ...replaceWorldInState(currentState, nextWorld),
        logs: currentState.logs.concat(
          createSimulationLogEntry({
            level: 'info',
            scope: 'world',
            message: `浏览器 fallback 已创建在线实景世界：${nextWorld.name}，来源 ${nextWorld.metadata?.data_source ?? 'OpenStreetMap'}`,
          }),
        ),
      };
      writeStoredState(nextState);
      return cloneState(nextState);
    });
  });
  browserHandlers.set('register_device', (args) => {
    const currentState = readStoredState();
    const nextState = appendDeviceToState(currentState, createDeviceFromArgs(args));
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('remove_device', (args) => {
    const currentState = readStoredState();
    const nextState = currentState.devices.length
      ? {
          ...currentState,
          devices: currentState.devices.filter((device) => device.id !== extractDeviceId(args)),
          clock: touchStateClock(currentState.clock),
        }
      : currentState;
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('update_settings', (args) => {
    const currentState = readStoredState();
    const patch = args && typeof args === 'object' && args.patch && typeof args.patch === 'object'
      ? args.patch as {
          drone_min_altitude_m?: number;
          drone_max_altitude_m?: number;
          rover_max_slope_deg?: number;
          humanoid_max_slope_deg?: number;
          quadruped_max_slope_deg?: number;
          ground_allowed_materials?: string[];
          language?: 'zh-CN' | 'en-US';
          theme?: 'light' | 'dark' | 'system';
          auto_save?: boolean;
          auto_save_every_tick?: boolean;
          default_tick_seconds?: number;
          log_level?: SimulationState['settings']['logLevel'];
          terminal_log_density?: SimulationState['settings']['terminalLogDensity'];
        }
      : {};
    const nextState: SimulationState = {
      ...currentState,
      clock: touchStateClock(currentState.clock),
      settings: {
        ...currentState.settings,
        locale: patch.language ?? currentState.settings.locale,
        logLevel: patch.log_level ?? currentState.settings.logLevel,
        autosaveEnabled: patch.auto_save_every_tick ?? patch.auto_save ?? currentState.settings.autosaveEnabled,
        terminalLogDensity: patch.terminal_log_density ?? currentState.settings.terminalLogDensity,
        tickIntervalMs: patch.default_tick_seconds === undefined
          ? currentState.settings.tickIntervalMs
          : Math.round(patch.default_tick_seconds * 1000),
        theme: {
          mode: patch.theme ?? currentState.settings.theme.mode,
          resolvedMode: patch.theme === 'dark'
            ? 'dark'
            : patch.theme === 'light'
              ? 'light'
              : resolveBrowserTheme(),
        },
      },
      physicalRules: {
        ...currentState.physicalRules,
        droneMinAltitudeM: patch.drone_min_altitude_m ?? currentState.physicalRules.droneMinAltitudeM,
        droneMaxAltitudeM: patch.drone_max_altitude_m ?? currentState.physicalRules.droneMaxAltitudeM,
        roverMaxSlopeDeg: patch.rover_max_slope_deg ?? currentState.physicalRules.roverMaxSlopeDeg,
        humanoidMaxSlopeDeg: patch.humanoid_max_slope_deg ?? currentState.physicalRules.humanoidMaxSlopeDeg,
        quadrupedMaxSlopeDeg: patch.quadruped_max_slope_deg ?? currentState.physicalRules.quadrupedMaxSlopeDeg,
        groundAllowedMaterials: patch.ground_allowed_materials ?? currentState.physicalRules.groundAllowedMaterials,
      },
      logs: currentState.logs.concat(
        createSimulationLogEntry({
          level: 'info',
          scope: 'rules',
          message: '浏览器 fallback 已更新物理规则。',
        }),
      ),
    };
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('submit_goal', (args) => {
    const currentState = readStoredState();
    const { goal, tasks } = createGatewayGoalAndTasksFromArgs(args);
    const nextState = {
      ...appendGoalToState(currentState, goal),
      devices: currentState.devices.map((device) => {
        const activeTask = tasks.find((task) => task.assigneeDeviceId === device.id);
        return activeTask
          ? {
              ...device,
              status: 'working' as const,
              currentTaskId: activeTask.id,
              updatedAt: nowIso(),
            }
          : device;
      }),
      tasks: currentState.tasks.concat(tasks),
      logs: currentState.logs.concat(
        ...createBrowserLlmSseLogs(goal, tasks),
        createSimulationLogEntry({
          level: 'info',
          scope: 'gateway',
          message: `浏览器 fallback: AR 眼镜目标已进入中枢 agents 计划，并立即指派 ${tasks.filter((task) => task.assigneeDeviceId).length} 个任务。`,
          details: goal.id,
        }),
      ),
    };
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('tick_simulation', (args) => {
    const currentState = readStoredState();
    const steps = extractSteps(args);
    const weather = currentState.world.terrain.weather;
    const frictionScale = currentState.world.terrain.surfaceFrictionScale ?? weatherPhysics(weather).surfaceFrictionScale;
    const windMps = currentState.world.terrain.windMps ?? weatherPhysics(weather).windMps;
    const activeTaskByDevice = new Map<string, SimulationTask>();
    currentState.tasks.forEach((task) => {
      if (task.assigneeDeviceId && task.status !== 'completed' && task.status !== 'canceled' && task.status !== 'failed') {
        activeTaskByDevice.set(task.assigneeDeviceId, task);
      }
    });
    const nextState = {
      ...currentState,
      phase: currentState.phase === 'booting' ? 'idle' : currentState.phase,
      clock: {
        step: currentState.clock.step + steps,
        simulationTimeMs: currentState.clock.simulationTimeMs + steps * currentState.settings.tickIntervalMs,
        wallClockAt: new Date().toISOString(),
      },
      devices: currentState.devices.map((device) => {
        const activeTask = activeTaskByDevice.get(device.id);
        const working = Boolean(activeTask);
        const profile = device.physicalProfile ?? defaultPhysicalProfile(device.kind, currentState);
        const weatherSpeedScale = device.kind === 'drone'
          ? Math.max(0.35, 1 - windMps / 34)
          : Math.max(0.35, frictionScale);
        const speed = working ? profile.maxSpeedMps * weatherSpeedScale : 0;
        const distance = speed * steps * Math.max(0.2, currentState.settings.tickIntervalMs / 1000);
        const taskHash = activeTask
          ? [...activeTask.id].reduce((acc, char) => acc + char.charCodeAt(0), 0)
          : 0;
        const nextHeading = working ? (device.telemetry.headingDeg + steps * (7 + taskHash % 9)) % 360 : device.telemetry.headingDeg;
        const headingRad = (nextHeading / 180) * Math.PI;
        const drift = device.kind === 'drone' ? windMps * 0.04 * steps : windMps * 0.006 * steps;
        const nextPosition: [number, number, number] = [
          Number((device.telemetry.position[0] + Math.cos(headingRad) * distance + drift).toFixed(2)),
          device.kind === 'drone'
            ? Math.min(Math.max(device.telemetry.position[1], currentState.physicalRules.droneMinAltitudeM), currentState.physicalRules.droneMaxAltitudeM)
            : device.telemetry.position[1],
          Number((device.telemetry.position[2] + Math.sin(headingRad) * distance + drift * 0.35).toFixed(2)),
        ];
        const nextVelocity: [number, number, number] = [
          Number((Math.cos(headingRad) * speed + drift).toFixed(2)),
          0,
          Number((Math.sin(headingRad) * speed + drift * 0.35).toFixed(2)),
        ];
        const jointQuaternion: [number, number, number, number] = [0, Math.sin(headingRad / 2), 0, Math.cos(headingRad / 2)];
        return {
          ...device,
          status: working ? 'working' : device.status,
          currentTaskId: activeTask?.id ?? device.currentTaskId,
          telemetry: {
            ...device.telemetry,
            position: nextPosition,
            velocity: nextVelocity,
            headingDeg: nextHeading,
            batteryPercent: Math.max(0, device.telemetry.batteryPercent - (working ? steps * 1.4 : steps * 0.2)),
            powerW: working ? profile.workingPowerW : profile.nominalPowerW,
            temperatureC: working ? Math.min(72, device.telemetry.temperatureC + steps * 0.8) : Math.max(28, device.telemetry.temperatureC - steps * 0.2),
            speedMps: speed,
            jointAnglesDeg: Array.from({ length: Math.min(profile.jointCount, 8) }, (_, index) => Math.round((nextHeading + index * 13 + currentState.clock.step * 7) % 90)),
            jointQuaternion,
            lastSeenAt: nowIso(),
          },
          updatedAt: nowIso(),
        };
      }),
      tasks: currentState.tasks.map((task): SimulationTask => {
        if (task.status === 'completed') {
          return task;
        }
        const progress = Math.min(1, task.progress + steps * 0.18);
        return {
          ...task,
          status: progress >= 1 ? 'completed' : 'active',
          progress,
          updatedAt: nowIso(),
        };
      }),
    };
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('save_world_snapshot', (args) => {
    const input = args && typeof args === 'object' && args.input && typeof args.input === 'object'
      ? args.input as { snapshot_name?: string }
      : {};
    const snapshotName = sanitizeSnapshotName(input.snapshot_name ?? `world_${readStoredState().world.id}`);
    const snapshots = readStoredSnapshots();
    writeStoredSnapshots({
      ...snapshots,
      [snapshotName]: cloneState(readStoredState()),
    });
    return { path: `localStorage://${SNAPSHOT_KEY}/${snapshotName}.toml` };
  });
  browserHandlers.set('list_world_snapshots', () => {
    const snapshots = readStoredSnapshots();
    const records: WorldSnapshotRecord[] = Object.entries(snapshots).map(([snapshotName, state]) => ({
      snapshotName,
      path: `localStorage://${SNAPSHOT_KEY}/${snapshotName}.toml`,
      modifiedAt: state.world.updatedAt,
    }));
    return records.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  });
  browserHandlers.set('open_world_snapshot', (args) => {
    const input = args && typeof args === 'object' && args.input && typeof args.input === 'object'
      ? args.input as { snapshot_name?: string }
      : {};
    const snapshotName = sanitizeSnapshotName(input.snapshot_name ?? '');
    const snapshot = readStoredSnapshots()[snapshotName];
    if (!snapshot) {
      throw new Error(`浏览器 fallback 未找到世界快照: ${snapshotName}`);
    }
    writeStoredState(snapshot);
    return cloneState(snapshot);
  });
}

registerDefaultHandlers();

export function registerBrowserInvokeHandler(command: string, handler: BrowserInvokeHandler) {
  browserHandlers.set(command, handler);
}

export function resetBrowserSimulationState() {
  writeStoredState(createDefaultSimulationState());
}

export function getBrowserSimulationState() {
  return cloneState(readStoredState());
}

export function setBrowserSimulationState(state: SimulationState) {
  writeStoredState(cloneState(state));
}

export async function invokeBrowserCommand<T>(command: string, args?: BrowserInvokeArgs): Promise<T> {
  const handler = browserHandlers.get(command);
  if (!handler) {
    throw new Error(`浏览器 fallback 未注册命令: ${command}`);
  }

  return handler(args) as Promise<T> | T;
}
