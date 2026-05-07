import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import {
  checkPermissions as checkGeolocationPermissions,
  getCurrentPosition as getTauriCurrentPosition,
  requestPermissions as requestGeolocationPermissions,
} from '@tauri-apps/plugin-geolocation';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiArrowLeft,
  FiArrowRight,
  FiCamera,
  FiCheck,
  FiCompass,
  FiCpu,
  FiCrosshair,
  FiEye,
  FiLoader,
  FiNavigation,
  FiPlus,
  FiSearch,
  FiTruck,
  FiX,
  FiZap,
} from 'react-icons/fi';
import { MdCheckCircle } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../state';
import { resolveIpLocation, resolveNativeLocation } from '../api';
import type { DeviceKind, SimulationDevice, TaskKind } from '../types';
import { createDevice, defaultProfile, getDeviceKindLabel } from './deviceFormUtils';
import { getConfiguredGoogleMapsApiKey, loadGoogleMapsLibraries } from '../utils';
import { DeviceModelPreview } from '../components/DeviceModelPreview';
import { resolveWorldCenter } from '../components/WorldScene';
import terminalLogoMarkUrl from '../../assets/design/logo.png';
import terminalMapReferenceUrl from '../../assets/design/terminal-map-reference.png';
import thumbDjiMavicUrl from '../../assets/design/device-thumb-dji-mavic-3e.png';
import thumbWheeledRobotUrl from '../../assets/design/device-thumb-wheeled-robot-w3.png';
import thumbUnitreeG1Url from '../../assets/design/device-thumb-unitree-g1.png';
import thumbUnitreeGo2Url from '../../assets/design/device-thumb-unitree-go2.png';
import thumbUnitreeB2Url from '../../assets/design/device-thumb-unitree-b2.png';
import thumbDjiMatriceUrl from '../../assets/design/device-thumb-dji-matrice-30t.png';

type StepId = 1 | 2 | 3 | 4;
type PositionMode = 'recommended' | 'custom' | 'current';

interface DeviceKindMeta {
  kind: DeviceKind;
  thumbnail: string;
  brandLabel?: 'DJI' | 'Unitree';
  defaultName: string;
  defaultLoadKg: number;
  defaultMinAngleDeg: number;
  defaultMaxAngleDeg: number;
  defaultAltitudeM: number;
  defaultCapabilityTags: string[];
  defaultTaskKinds: TaskKind[];
  scenarioKeys: string[];
}

const taskIconMap: Record<TaskKind, ReactElement> = {
  inspect: <FiSearch />,
  photo: <FiCamera />,
  search: <FiCrosshair />,
  move: <FiNavigation />,
  deliver: <FiTruck />,
  observe: <FiEye />,
  custom: <FiZap />,
};

const taskKinds: TaskKind[] = ['inspect', 'photo', 'search', 'move', 'deliver', 'observe', 'custom'];

const DEFAULT_LATITUDE = 31.230416;
const DEFAULT_LONGITUDE = 121.473701;
const DRONE_ALTITUDE_BUFFER_M = 5;
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isDroneKind(kind: DeviceKind) {
  return kind === 'drone';
}

function parseOsmHeightMeters(tags: Record<string, string>): number {
  const heightStr = tags.height ?? tags['building:height'];
  const heightNum = Number.parseFloat(heightStr?.replace(/m$/i, '').trim() ?? '');
  if (Number.isFinite(heightNum) && heightNum > 0) {
    return heightNum;
  }
  const levels = Number.parseFloat(tags['building:levels'] ?? '');
  if (Number.isFinite(levels) && levels > 0) {
    return levels * 3.2;
  }
  return 0;
}

interface PointGroundContext {
  isLand: boolean;
  buildingHeightM: number;
  groundElevationM: number;
  hasGroundElevation: boolean;
}

// 查询点的地表高程（相对海平面，米）。优先 Open-Meteo（基于 Copernicus DEM 30m），
// 失败时回落到 USGS 公共代理或返回 null。海洋点通常返回 0。
async function fetchPointElevation(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    const response = await fetch(url, { signal });
    if (response.ok) {
      const data = await response.json() as { elevation?: number[] };
      const value = data.elevation?.[0];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
  }
  return null;
}

interface OsmSurfaceSignals {
  hasWaterTag: boolean;
  hasLandTag: boolean;
  hasCoastline: boolean;
  buildingHeightM: number;
}

async function fetchOsmSurfaceSignals(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<OsmSurfaceSignals> {
  // OSM 中开放海洋/大型海湾通常不存在显式 natural=water polygon，
  // 它们由 natural=coastline 围出的「负空间」表示。所以仅靠 is_in/水体标签
  // 会把维港、外海等点错判为陆地；反之内陆某些没显式 landuse 的点又会被错判为水。
  // 本查询广泛采集陆地/水体/海岸线信号，最终判定交由调用者结合 DEM 高程综合处理。
  const query = `[out:json][timeout:10];`
    + `is_in(${lat},${lon})->.a;`
    + `(`
    + `  .a;`
    + `  way(around:8,${lat},${lon})["building"];`
    + `  way(around:8,${lat},${lon})["highway"];`
    + `  way(around:8,${lat},${lon})["railway"];`
    + `  way(around:8,${lat},${lon})["natural"="water"];`
    + `  relation(around:8,${lat},${lon})["natural"="water"];`
    + `  way(around:8,${lat},${lon})["water"];`
    + `  way(around:8,${lat},${lon})["waterway"];`
    + `  way(around:300,${lat},${lon})["natural"="coastline"];`
    + `  way(around:60,${lat},${lon})["landuse"];`
    + `  way(around:60,${lat},${lon})["leisure"];`
    + `  way(around:60,${lat},${lon})["place"~"city|town|village|hamlet|suburb|neighbourhood|island|islet|locality"];`
    + `  relation(around:60,${lat},${lon})["place"~"city|town|village|hamlet|suburb|neighbourhood|island|islet|locality"];`
    + `);`
    + `out tags;`;
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'application/json' },
    body: query,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Overpass HTTP ${response.status}`);
  }

  const data = await response.json() as { elements?: Array<{ tags?: Record<string, string> }> };
  const elements = data.elements ?? [];

  let hasWaterTag = false;
  let hasLandTag = false;
  let hasCoastline = false;
  let buildingHeightM = 0;

  const landPlaces = new Set([
    'city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood',
    'island', 'islet', 'farm', 'allotments', 'locality', 'isolated_dwelling',
  ]);
  const landNatural = new Set([
    'wood', 'forest', 'beach', 'sand', 'scrub', 'grassland', 'heath',
    'moor', 'fell', 'tundra', 'bare_rock', 'rock', 'shingle', 'cliff',
    'glacier', 'volcano', 'peak', 'ridge', 'saddle',
  ]);

  for (const element of elements) {
    const tags = element.tags ?? {};

    if (
      tags.natural === 'water'
      || tags.natural === 'wetland'
      || tags.natural === 'bay'
      || tags.natural === 'strait'
      || tags.natural === 'fjord'
      || tags.water === 'lake' || tags.water === 'river' || tags.water === 'pond'
      || tags.water === 'reservoir' || tags.water === 'basin' || tags.water === 'sea'
      || tags.water === 'lagoon' || tags.water === 'canal'
      || tags.waterway === 'riverbank' || tags.waterway === 'dock'
      || tags.landuse === 'reservoir' || tags.landuse === 'basin'
      || tags.place === 'sea' || tags.place === 'ocean'
    ) {
      hasWaterTag = true;
    }

    if (tags.natural === 'coastline') {
      hasCoastline = true;
    }

    if (
      (tags.building && tags.building !== 'no')
      || (tags.highway && tags.highway !== 'no')
      || (tags.railway && tags.railway !== 'no')
      || (tags.landuse && tags.landuse !== 'reservoir' && tags.landuse !== 'basin')
      || (tags.leisure && tags.leisure !== 'swimming_pool' && tags.leisure !== 'water_park')
      || (tags.place && landPlaces.has(tags.place))
      || (tags.natural && landNatural.has(tags.natural))
    ) {
      hasLandTag = true;
    }

    if (tags.building && tags.building !== 'no') {
      const h = parseOsmHeightMeters(tags);
      if (h > buildingHeightM) {
        buildingHeightM = h;
      }
    }
  }

  return {
    hasWaterTag,
    hasLandTag,
    hasCoastline,
    buildingHeightM,
  };
}

// 把 OSM 标签信号与 DEM 高程组合判定 land/water。
// Open-Meteo / Copernicus DEM 在海洋上几乎全部返回 0，在陆地上 > 0（含海平面附近的低洼陆地通常也 > 0.3m）。
// 内陆湖泊高程不为 0（lake 表面海拔），因此 OSM 显式 water tag 仍是首选信号。
async function fetchPointSurfaceContext(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<PointGroundContext> {
  const [osmResult, elevation] = await Promise.all([
    fetchOsmSurfaceSignals(lat, lon, signal),
    fetchPointElevation(lat, lon, signal).catch(() => null),
  ]);

  const SEA_LEVEL_EPS_M = 0.5;
  const isAtSeaLevel = elevation !== null && elevation <= SEA_LEVEL_EPS_M;

  let isLand: boolean;
  if (osmResult.hasWaterTag) {
    isLand = false;
  } else if (osmResult.hasLandTag) {
    // 当显式陆地标签和「极低高程 + 海岸线」冲突时，仍以 OSM 陆地标签为准
    // （能避免海岸边缘低洼地被高程信号反向误判为水）。
    isLand = true;
  } else if (osmResult.hasCoastline) {
    // 海岸线附近且无陆地特征：用 DEM 高程作仲裁——海平面附近视作水，否则陆地。
    isLand = elevation === null ? false : !isAtSeaLevel;
  } else if (elevation !== null) {
    // 没有任何 OSM 信号：开放海洋 / 远海点。海平面附近视作水，否则陆地。
    isLand = !isAtSeaLevel;
  } else {
    // OSM 无信号且高程查询失败：保守按陆地处理。
    isLand = true;
  }

  return {
    isLand,
    buildingHeightM: osmResult.buildingHeightM,
    groundElevationM: elevation ?? 0,
    hasGroundElevation: elevation !== null,
  };
}

type GroundCtxStatus = 'idle' | 'loading' | 'ready' | 'error';

interface GroundContextState {
  status: GroundCtxStatus;
  isLand: boolean | null;
  buildingHeightM: number;
  groundElevationM: number;
  hasGroundElevation: boolean;
  error?: string;
}

type PositionState =
  | 'unknown'           // 地面情况尚未查询完成
  | 'land'              // 在陆地（含建筑物顶部，可视为可着地）
  | 'underground'       // 在地下
  | 'air-over-land'     // 在陆地上空
  | 'water-surface'     // 在水面
  | 'underwater'        // 在水底
  | 'air-over-water';   // 在水面上空

const POSITION_GROUND_EPS_M = 0.5;          // 离地表 ±0.5m 视为贴地/水面
const POSITION_LAND_SURFACE_BAND_M = 5;     // 离地 0~5m 视为「在地面上」（覆盖各类地面单位身高）
const POSITION_ROOFTOP_EPS_M = 1.5;         // 离地楼顶 ±1.5m 视为停在楼顶（仍作为 land）

// 海拔（绝对）→ 位置状态。判断基于「相对地表高度」而非绝对海拔。
function classifyPosition(
  ctx: GroundContextState,
  altitudeM: number,
): PositionState {
  if (ctx.status !== 'ready' || ctx.isLand === null) {
    return 'unknown';
  }
  // 地表高程：陆地用 DEM 高程，水体（海/湖）若拿不到则按海平面 0 处理。
  const surfaceElevationM = ctx.hasGroundElevation ? ctx.groundElevationM : 0;
  const aboveSurface = altitudeM - surfaceElevationM;

  if (ctx.isLand) {
    if (aboveSurface < -POSITION_GROUND_EPS_M) {
      return 'underground';
    }
    if (aboveSurface <= POSITION_LAND_SURFACE_BAND_M) {
      return 'land';
    }
    if (
      ctx.buildingHeightM > 0
      && aboveSurface >= ctx.buildingHeightM - POSITION_ROOFTOP_EPS_M
      && aboveSurface <= ctx.buildingHeightM + POSITION_ROOFTOP_EPS_M
    ) {
      return 'land';
    }
    return 'air-over-land';
  }
  if (aboveSurface < -POSITION_GROUND_EPS_M) {
    return 'underwater';
  }
  if (aboveSurface <= POSITION_GROUND_EPS_M) {
    return 'water-surface';
  }
  return 'air-over-water';
}

function isPositionAllowed(state: PositionState, isFlying: boolean): boolean {
  if (state === 'unknown') {
    return false;
  }
  if (isFlying) {
    return state === 'land' || state === 'air-over-land' || state === 'air-over-water';
  }
  return state === 'land';
}

const deviceKindMetas: Record<DeviceKind, DeviceKindMeta> = {
  drone: {
    kind: 'drone',
    thumbnail: thumbDjiMavicUrl,
    brandLabel: 'DJI',
    defaultName: 'Aerial Drone',
    defaultLoadKg: 5,
    defaultMinAngleDeg: 0,
    defaultMaxAngleDeg: 90,
    defaultAltitudeM: 60,
    defaultCapabilityTags: ['aerial_move', 'photo', 'search'],
    defaultTaskKinds: ['inspect', 'photo', 'search', 'observe'],
    scenarioKeys: ['outdoor_patrol', 'aerial_camera', 'wide_search', 'broad_observation'],
  },
  wheeled_robot: {
    kind: 'wheeled_robot',
    thumbnail: thumbWheeledRobotUrl,
    defaultName: 'Wheeled Rover',
    defaultLoadKg: 30,
    defaultMinAngleDeg: 0,
    defaultMaxAngleDeg: 12,
    defaultAltitudeM: 1.2,
    defaultCapabilityTags: ['ground_move', 'inspect', 'transport'],
    defaultTaskKinds: ['inspect', 'move', 'deliver'],
    scenarioKeys: ['urban_inspection', 'cargo_delivery', 'paved_inspection'],
  },
  humanoid: {
    kind: 'humanoid',
    thumbnail: thumbUnitreeG1Url,
    brandLabel: 'Unitree',
    defaultName: 'Unitree G1',
    defaultLoadKg: 15,
    defaultMinAngleDeg: 0,
    defaultMaxAngleDeg: 18,
    defaultAltitudeM: 2.4,
    defaultCapabilityTags: ['ground_move', 'inspect', 'delivery'],
    defaultTaskKinds: ['inspect', 'observe', 'deliver', 'move'],
    scenarioKeys: ['indoor_inspection', 'human_interaction', 'service_delivery'],
  },
  quadruped: {
    kind: 'quadruped',
    thumbnail: thumbUnitreeGo2Url,
    brandLabel: 'Unitree',
    defaultName: 'Quadruped Robot',
    defaultLoadKg: 12,
    defaultMinAngleDeg: 0,
    defaultMaxAngleDeg: 28,
    defaultAltitudeM: 1.4,
    defaultCapabilityTags: ['ground_move', 'inspect', 'rough_terrain'],
    defaultTaskKinds: ['inspect', 'observe', 'move', 'search'],
    scenarioKeys: ['rough_terrain', 'industrial_inspection', 'follow_mission'],
  },
  unitree_robot: {
    kind: 'unitree_robot',
    thumbnail: thumbUnitreeB2Url,
    brandLabel: 'Unitree',
    defaultName: 'Unitree Carrier',
    defaultLoadKg: 25,
    defaultMinAngleDeg: 0,
    defaultMaxAngleDeg: 28,
    defaultAltitudeM: 1.4,
    defaultCapabilityTags: ['ground_move', 'inspect', 'rough_terrain', 'payload'],
    defaultTaskKinds: ['inspect', 'deliver', 'move', 'search'],
    scenarioKeys: ['heavy_payload', 'industrial_patrol', 'emergency_response'],
  },
  sensor_node: {
    kind: 'sensor_node',
    thumbnail: thumbDjiMatriceUrl,
    defaultName: 'Sensor Hub',
    defaultLoadKg: 0,
    defaultMinAngleDeg: 0,
    defaultMaxAngleDeg: 8,
    defaultAltitudeM: 4,
    defaultCapabilityTags: ['sense', 'thermal', 'report'],
    defaultTaskKinds: ['observe', 'inspect'],
    scenarioKeys: ['fixed_monitoring', 'environmental_sense', 'edge_alerting'],
  },
};

const orderedDeviceKinds: DeviceKind[] = ['drone', 'wheeled_robot', 'humanoid', 'quadruped', 'unitree_robot', 'sensor_node'];

const baseCapabilityCatalog = [
  'aerial_move',
  'ground_move',
  'photo',
  'thermal',
  'search',
  'mapping',
  'inspect',
  'transport',
  'rough_terrain',
  'payload',
  'sense',
  'report',
  'delivery',
  'zoom',
];

export interface CreateDeviceWindowProps {
  editingDeviceId?: string;
}

export function CreateDeviceWindow({ editingDeviceId }: CreateDeviceWindowProps = {}) {
  const { t } = useTranslation();
  const { state, registerDevice, updateDevice, appendLog } = useSimulation();
  const editingDevice = editingDeviceId
    ? state.devices.find((device) => device.id === editingDeviceId)
    : undefined;
  const isEditMode = Boolean(editingDevice);

  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [selectedKind, setSelectedKind] = useState<DeviceKind>('drone');
  const [deviceName, setDeviceName] = useState('');
  const [batteryPercent, setBatteryPercent] = useState(100);
  const [nominalPowerW, setNominalPowerW] = useState(36);
  const [workingPowerW, setWorkingPowerW] = useState(180);
  const [maxSpeedMps, setMaxSpeedMps] = useState(12);
  const [maxLoadKg, setMaxLoadKg] = useState(deviceKindMetas.drone.defaultLoadKg);
  const [maxAltitudeM, setMaxAltitudeM] = useState(deviceKindMetas.drone.defaultAltitudeM);
  const [minAngleDeg, setMinAngleDeg] = useState(deviceKindMetas.drone.defaultMinAngleDeg);
  const [maxAngleDeg, setMaxAngleDeg] = useState(deviceKindMetas.drone.defaultMaxAngleDeg);
  const [supportedTasks, setSupportedTasks] = useState<TaskKind[]>(deviceKindMetas.drone.defaultTaskKinds);
  const [capabilityTags, setCapabilityTags] = useState<string[]>(deviceKindMetas.drone.defaultCapabilityTags);
  const [customTagInput, setCustomTagInput] = useState('');
  const [positionMode, setPositionMode] = useState<PositionMode>('recommended');
  const [latitude, setLatitude] = useState(() => {
    const worldMeta = state.world.metadata ?? {};
    return Number(worldMeta.center_lat) || DEFAULT_LATITUDE;
  });
  const [longitude, setLongitude] = useState(() => {
    const worldMeta = state.world.metadata ?? {};
    return Number(worldMeta.center_lon) || DEFAULT_LONGITUDE;
  });
  const [altitudeM, setAltitudeM] = useState(120);
  const [groundCtx, setGroundCtx] = useState<GroundContextState>({
    status: 'idle',
    isLand: null,
    buildingHeightM: 0,
    groundElevationM: 0,
    hasGroundElevation: false,
  });
  const [status, setStatus] = useState<string>(t('createDeviceWindow.statusWaiting'));
  const [submitted, setSubmitted] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<GoogleMapsMap | null>(null);
  const markerRef = useRef<GoogleMapsMarker | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState<string>(() =>
    getConfiguredGoogleMapsApiKey() ? t('createDeviceWindow.mapApiReady') : t('createDeviceWindow.mapApiMissing'),
  );

  const meta = deviceKindMetas[selectedKind];

  const editingInitializedRef = useRef(false);
  useEffect(() => {
    if (!editingDevice || editingInitializedRef.current) {
      return;
    }
    editingInitializedRef.current = true;

    const profile = editingDevice.physicalProfile;
    const metaForKind = deviceKindMetas[editingDevice.kind];
    setSelectedKind(editingDevice.kind);
    setDeviceName(editingDevice.name);
    setBatteryPercent(Math.round(editingDevice.telemetry.batteryPercent));
    setNominalPowerW(profile.nominalPowerW);
    setWorkingPowerW(profile.workingPowerW);
    setMaxSpeedMps(profile.maxSpeedMps);
    setMaxAltitudeM(profile.maxWorkAltitudeM);
    setMinAngleDeg(metaForKind.defaultMinAngleDeg);
    setMaxAngleDeg(profile.maxSlopeDeg);
    setMaxLoadKg(metaForKind.defaultLoadKg);
    setSupportedTasks(metaForKind.defaultTaskKinds);
    setCapabilityTags(editingDevice.capabilityTags.slice());

    const center = resolveWorldCenter(state.world.objects, state.world.metadata);
    const metersPerLat = 111_320;
    const metersPerLon = Math.max(0.2, Math.abs(Math.cos((center.lat * Math.PI) / 180))) * 111_320;
    const halfWorldX = 60;
    const halfWorldZ = 60;
    const [px, py, pz] = editingDevice.telemetry.position;
    const eastM = px - halfWorldX;
    const northM = halfWorldZ - pz;
    setLongitude(Number((center.lon + eastM / metersPerLon).toFixed(6)));
    setLatitude(Number((center.lat + northM / metersPerLat).toFixed(6)));
    setAltitudeM(Number(py.toFixed(2)));
    setPositionMode('custom');
  }, [editingDevice, state.world.objects, state.world.metadata]);

  const isFlyingDevice = isDroneKind(selectedKind);

  // 在编辑模式下，避免首轮自动海拔覆盖既有设备的位置；其余情形允许自动重置。
  const skipFirstAutoAltitudeRef = useRef<boolean>(Boolean(editingDeviceId));

  // 查询当前经纬度的 OSM 环境上下文（陆地/水面 + 建筑物高度）。
  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    const controller = new AbortController();
    let canceled = false;
    setGroundCtx((prev) => ({
      status: 'loading',
      isLand: prev.isLand,
      buildingHeightM: prev.buildingHeightM,
      groundElevationM: prev.groundElevationM,
      hasGroundElevation: prev.hasGroundElevation,
      error: undefined,
    }));
    const timer = window.setTimeout(async () => {
      try {
        const ctx = await fetchPointSurfaceContext(latitude, longitude, controller.signal);
        if (canceled) {
          return;
        }
        setGroundCtx({
          status: 'ready',
          isLand: ctx.isLand,
          buildingHeightM: ctx.buildingHeightM,
          groundElevationM: ctx.groundElevationM,
          hasGroundElevation: ctx.hasGroundElevation,
        });
      } catch (error) {
        if (canceled || (error instanceof DOMException && error.name === 'AbortError')) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setGroundCtx({
          status: 'error',
          isLand: null,
          buildingHeightM: 0,
          groundElevationM: 0,
          hasGroundElevation: false,
          error: message,
        });
      }
    }, 600);
    return () => {
      canceled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [latitude, longitude]);

  // 根据设备类型与位置上下文，自动调整海拔默认值。
  // 海拔为相对海平面的绝对值，地表海拔来自 DEM 查询：
  // - 陆地设备：地表海拔 + 设备身高（贴地）
  // - 飞行设备：地表海拔 + max(默认作业高度, 建筑高度 + 缓冲)（飞越建筑）
  useEffect(() => {
    if (skipFirstAutoAltitudeRef.current) {
      skipFirstAutoAltitudeRef.current = false;
      return;
    }
    if (groundCtx.status !== 'ready') {
      return;
    }
    const surfaceElev = groundCtx.hasGroundElevation ? groundCtx.groundElevationM : 0;
    if (!isFlyingDevice) {
      const deviceHeight = meta.defaultAltitudeM > 0 ? meta.defaultAltitudeM : 0;
      setAltitudeM(Number((surfaceElev + deviceHeight).toFixed(2)));
      return;
    }
    {
      const fallback = meta.defaultAltitudeM > 0 ? meta.defaultAltitudeM : 60;
      const aboveBuilding = groundCtx.buildingHeightM + DRONE_ALTITUDE_BUFFER_M;
      const next = surfaceElev + Math.max(fallback, Math.round(aboveBuilding));
      setAltitudeM(Number(next.toFixed(2)));
    }
  }, [
    isFlyingDevice,
    meta.defaultAltitudeM,
    groundCtx.status,
    groundCtx.buildingHeightM,
    groundCtx.groundElevationM,
    groundCtx.hasGroundElevation,
    latitude,
    longitude,
  ]);

  const applyKindDefaults = (kind: DeviceKind) => {
    const profile = defaultProfile(kind, state.physicalRules);
    const metaForKind = deviceKindMetas[kind];
    setSelectedKind(kind);
    setNominalPowerW(profile.nominalPowerW);
    setWorkingPowerW(profile.workingPowerW);
    setMaxSpeedMps(profile.maxSpeedMps);
    setMaxLoadKg(metaForKind.defaultLoadKg);
    setMaxAltitudeM(metaForKind.defaultAltitudeM);
    setMinAngleDeg(metaForKind.defaultMinAngleDeg);
    setMaxAngleDeg(metaForKind.defaultMaxAngleDeg);
    setSupportedTasks(metaForKind.defaultTaskKinds);
    setCapabilityTags(metaForKind.defaultCapabilityTags);
  };

  const orderedDevices = useMemo(() => orderedDeviceKinds, []);
  const totalRegistered = state.devices.length;

  const finalDeviceName = useMemo(() => {
    const trimmed = deviceName.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }

    const sameKindCount = state.devices.filter((device) => device.kind === selectedKind).length;
    return `${getDeviceKindLabel(selectedKind)}-${sameKindCount + 1}`;
  }, [deviceName, selectedKind, state.devices]);

  // Google Maps preview for initial position.
  useEffect(() => {
    let isDisposed = false;

    async function initializeMap() {
      if (!mapContainerRef.current) {
        return;
      }

      try {
        const maps = await loadGoogleMapsLibraries(['maps']);
        if (isDisposed || !mapContainerRef.current) {
          return;
        }

        const center = { lat: latitude, lng: longitude };
        const map = new maps.Map(mapContainerRef.current, {
          center,
          zoom: 16,
          mapTypeId: 'satellite',
          clickableIcons: false,
          disableDefaultUI: true,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: true,
          gestureHandling: 'greedy',
        });
        const marker = new maps.Marker({
          map,
          position: center,
          draggable: true,
        });

        marker.addListener('dragend', () => {
          const position = marker.getPosition();
          if (!position) {
            return;
          }

          setLatitude(Number(position.lat().toFixed(6)));
          setLongitude(Number(position.lng().toFixed(6)));
          setPositionMode('custom');
          setStatus(t('createDeviceWindow.statusPositionUpdated'));
        });

        map.addListener('click', (event?: GoogleMapsMapMouseEvent) => {
          if (!event?.latLng) {
            return;
          }

          const lat = Number(event.latLng.lat().toFixed(6));
          const lng = Number(event.latLng.lng().toFixed(6));
          marker.setPosition({ lat, lng });
          setLatitude(lat);
          setLongitude(lng);
          setPositionMode('custom');
          setStatus(t('createDeviceWindow.statusPositionUpdated'));
        });

        googleMapRef.current = map;
        markerRef.current = marker;
        setIsMapReady(true);
        setMapStatus(t('createDeviceWindow.mapApiReady'));
      } catch (error) {
        const message = error instanceof Error ? error.message : t('createDeviceWindow.mapApiMissing');
        setIsMapReady(false);
        setMapStatus(message);
      }
    }

    void initializeMap();

    return () => {
      isDisposed = true;
      const existingMarker = markerRef.current;
      const existingMap = googleMapRef.current;
      if (existingMarker && window.google?.maps.event) {
        window.google.maps.event.clearInstanceListeners(existingMarker);
      }
      if (existingMap && window.google?.maps.event) {
        window.google.maps.event.clearInstanceListeners(existingMap);
      }
    };
  }, [t]);

  useEffect(() => {
    const map = googleMapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) {
      return;
    }

    const center = { lat: latitude, lng: longitude };
    marker.setPosition(center);
    map.panTo(center);
  }, [latitude, longitude]);

  const toggleTask = (taskKind: TaskKind) => {
    setSupportedTasks((current) => (
      current.includes(taskKind)
        ? current.filter((value) => value !== taskKind)
        : [...current, taskKind]
    ));
  };

  const toggleTag = (tag: string) => {
    setCapabilityTags((current) => (
      current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]
    ));
  };

  const addCustomTag = () => {
    const trimmed = customTagInput.trim().toLowerCase().replace(/\s+/g, '_');
    if (!trimmed) {
      return;
    }

    setCapabilityTags((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
    setCustomTagInput('');
  };

  const setRecommendedPosition = () => {
    const worldMeta = state.world.metadata ?? {};
    const lat = Number(worldMeta.center_lat) || DEFAULT_LATITUDE;
    const lon = Number(worldMeta.center_lon) || DEFAULT_LONGITUDE;
    setLatitude(lat);
    setLongitude(lon);
    setAltitudeM(meta.defaultAltitudeM === 0 ? 1.4 : meta.defaultAltitudeM);
    setPositionMode('recommended');
    setStatus(t('createDeviceWindow.statusPositionRecommended'));
  };

  const fallbackToMapCenter = (reason: string) => {
    const map = googleMapRef.current;
    const center = map?.getCenter();
    if (center) {
      const lat = Number(center.lat().toFixed(6));
      const lon = Number(center.lng().toFixed(6));
      setLatitude(lat);
      setLongitude(lon);
      setStatus(t('createDeviceWindow.statusPositionFromMapCenter', { reason }));
    } else {
      const worldMeta = state.world.metadata ?? {};
      setLatitude(Number(worldMeta.center_lat) || DEFAULT_LATITUDE);
      setLongitude(Number(worldMeta.center_lon) || DEFAULT_LONGITUDE);
      setStatus(t('createDeviceWindow.statusPositionFallbackWorld', { reason }));
    }
    setPositionMode('custom');
  };

  const tryGoogleGeolocation = async (): Promise<{ lat: number; lon: number; accuracyM?: number } | null> => {
    const apiKey = getConfiguredGoogleMapsApiKey();
    if (!apiKey) {
      return null;
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/geolocation/v1/geolocate?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ considerIp: true }),
        },
      );
      if (!response.ok) {
        return null;
      }

      const data = await response.json() as { location?: { lat?: number; lng?: number }; accuracy?: number };
      const lat = data.location?.lat;
      const lng = data.location?.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return null;
      }

      return { lat, lon: lng, accuracyM: typeof data.accuracy === 'number' ? data.accuracy : undefined };
    } catch {
      return null;
    }
  };

  const localizeGeolocationError = (error: GeolocationPositionError): string => {
    if (error.code === error.PERMISSION_DENIED) {
      return t('createDeviceWindow.geoError.permissionDenied');
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return t('createDeviceWindow.geoError.unavailable');
    }
    if (error.code === error.TIMEOUT) {
      return t('createDeviceWindow.geoError.timeout');
    }
    return error.message || t('createDeviceWindow.geoError.unknown');
  };

  const acceptCoords = (
    latValue: number,
    lonValue: number,
    altitude: number | null | undefined,
    statusMessage: string,
  ) => {
    setLatitude(Number(latValue.toFixed(6)));
    setLongitude(Number(lonValue.toFixed(6)));
    if (typeof altitude === 'number' && Number.isFinite(altitude)) {
      setAltitudeM(Math.round(altitude));
    }
    setStatus(statusMessage);
  };

  const tryTauriGeolocation = async (): Promise<{ ok: true; reason?: undefined } | { ok: false; reason: string }> => {
    if (!isTauri()) {
      return { ok: false, reason: t('createDeviceWindow.geoError.unavailable') };
    }

    try {
      let permissions = await checkGeolocationPermissions();
      if (permissions.location === 'prompt' || permissions.location === 'prompt-with-rationale') {
        permissions = await requestGeolocationPermissions(['location']);
      }

      if (permissions.location !== 'granted') {
        return { ok: false, reason: t('createDeviceWindow.geoError.permissionDenied') };
      }

      const position = await getTauriCurrentPosition({
        enableHighAccuracy: false,
        timeout: 8_000,
        maximumAge: 60_000,
      });
      if (!position?.coords) {
        return { ok: false, reason: t('createDeviceWindow.geoError.unavailable') };
      }

      acceptCoords(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.altitude,
        t('createDeviceWindow.statusPositionFromCurrent'),
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : t('createDeviceWindow.geoError.unknown');
      return { ok: false, reason: message };
    }
  };

  const tryBrowserGeolocation = (): Promise<{ ok: true; reason?: undefined } | { ok: false; reason: string }> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({ ok: false, reason: t('createDeviceWindow.geoError.unavailable') });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (geo) => {
          acceptCoords(
            geo.coords.latitude,
            geo.coords.longitude,
            geo.coords.altitude,
            t('createDeviceWindow.statusPositionFromCurrent'),
          );
          resolve({ ok: true });
        },
        (error) => {
          resolve({ ok: false, reason: localizeGeolocationError(error) });
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 },
      );
    });
  };

  const tryNativeMacOsLocation = async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    if (!isTauri()) {
      return { ok: false, reason: t('createDeviceWindow.geoError.unavailable') };
    }

    try {
      const native = await resolveNativeLocation();
      if (typeof native.latitude !== 'number' || typeof native.longitude !== 'number') {
        return { ok: false, reason: t('createDeviceWindow.geoError.unavailable') };
      }
      const accuracy = typeof native.accuracy_m === 'number' && Number.isFinite(native.accuracy_m)
        ? Math.round(native.accuracy_m)
        : null;
      acceptCoords(
        native.latitude,
        native.longitude,
        native.altitude_m,
        accuracy === null
          ? t('createDeviceWindow.statusPositionFromNative', { source: native.source })
          : t('createDeviceWindow.statusPositionFromNativeWithAccuracy', { source: native.source, accuracy }),
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : t('createDeviceWindow.geoError.unknown');
      return { ok: false, reason: message };
    }
  };

  const tryRustIpLocation = async (): Promise<{ ok: true } | { ok: false; reason: string }> => {
    try {
      const ip = await resolveIpLocation();
      if (typeof ip.latitude !== 'number' || typeof ip.longitude !== 'number') {
        return { ok: false, reason: t('createDeviceWindow.geoError.unavailable') };
      }
      const placeLabel = [ip.city, ip.region, ip.country].filter(Boolean).join(' / ') || ip.source;
      acceptCoords(
        ip.latitude,
        ip.longitude,
        null,
        t('createDeviceWindow.statusPositionFromIp', { source: ip.source, place: placeLabel }),
      );
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : t('createDeviceWindow.geoError.unknown');
      return { ok: false, reason: message };
    }
  };

  const setCurrentPosition = async () => {
    setPositionMode('current');
    setStatus(t('createDeviceWindow.statusPositionResolving'));

    const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform ?? '');

    let nativeReason: string | undefined;
    if (isMac) {
      const nativeResult = await tryNativeMacOsLocation();
      if (nativeResult.ok) {
        return;
      }
      nativeReason = nativeResult.reason;
    }

    const tauriResult = await tryTauriGeolocation();
    if (tauriResult.ok) {
      return;
    }

    const browserResult = await tryBrowserGeolocation();
    if (browserResult.ok) {
      return;
    }

    const ipResult = await tryRustIpLocation();
    if (ipResult.ok) {
      return;
    }

    const remote = await tryGoogleGeolocation();
    if (remote) {
      acceptCoords(
        remote.lat,
        remote.lon,
        null,
        t('createDeviceWindow.statusPositionFromGoogle', {
          accuracy: remote.accuracyM ? Math.round(remote.accuracyM) : '?',
        }),
      );
      return;
    }

    fallbackToMapCenter(
      ipResult.reason
        ?? browserResult.reason
        ?? tauriResult.reason
        ?? nativeReason
        ?? t('createDeviceWindow.geoError.unknown'),
    );
  };

  const goToStep = (next: StepId) => {
    setCurrentStep(next);
    setStatus(t(`createDeviceWindow.steps.step${next}`));
  };

  const positionState = classifyPosition(groundCtx, altitudeM);
  const isGroundContextPending = groundCtx.status !== 'ready';
  const isPositionInvalid = positionState !== 'unknown' && !isPositionAllowed(positionState, isFlyingDevice);

  const positionRejectKey = (() => {
    if (!isPositionInvalid) {
      return undefined;
    }
    if (isFlyingDevice) {
      switch (positionState) {
        case 'water-surface':
          return 'createDeviceWindow.groundContext.rejectDroneOnWater';
        case 'underwater':
          return 'createDeviceWindow.groundContext.rejectDroneUnderwater';
        case 'underground':
          return 'createDeviceWindow.groundContext.rejectDroneUnderground';
        default:
          return 'createDeviceWindow.groundContext.rejectInvalid';
      }
    }
    switch (positionState) {
      case 'water-surface':
      case 'underwater':
        return 'createDeviceWindow.groundContext.rejectGroundOnWater';
      case 'air-over-land':
      case 'air-over-water':
        return 'createDeviceWindow.groundContext.rejectGroundInAir';
      case 'underground':
        return 'createDeviceWindow.groundContext.rejectGroundUnderground';
      default:
        return 'createDeviceWindow.groundContext.rejectInvalid';
    }
  })();

  const handleNext = () => {
    if (currentStep >= 3 && isPositionInvalid && positionRejectKey) {
      setStatus(t(positionRejectKey));
      return;
    }
    if (currentStep >= 3 && isGroundContextPending) {
      setStatus(t('createDeviceWindow.groundContext.waitingResult'));
      return;
    }
    if (currentStep < 4) {
      goToStep((currentStep + 1) as StepId);
      return;
    }

    void submit();
  };

  const handlePrev = () => {
    if (currentStep <= 1) {
      return;
    }

    goToStep((currentStep - 1) as StepId);
  };

  const submit = async () => {
    if (capabilityTags.length === 0) {
      setStatus(t('createDeviceWindow.statusMissingCapabilities'));
      return;
    }
    if (isPositionInvalid && positionRejectKey) {
      setStatus(t(positionRejectKey));
      return;
    }
    if (isGroundContextPending) {
      setStatus(t('createDeviceWindow.groundContext.waitingResult'));
      return;
    }

    const baseProfile = defaultProfile(selectedKind, state.physicalRules);
    const profile = {
      ...baseProfile,
      nominalPowerW,
      workingPowerW,
      maxSpeedMps,
      maxSlopeDeg: maxAngleDeg,
      minWorkAltitudeM: Math.max(0, Math.min(baseProfile.minWorkAltitudeM, maxAltitudeM)),
      maxWorkAltitudeM: Math.max(maxAltitudeM, baseProfile.minWorkAltitudeM),
    };

    const draft: SimulationDevice = createDevice(selectedKind, totalRegistered + 1, profile, batteryPercent);
    const center = resolveWorldCenter(state.world.objects, state.world.metadata);
    const metersPerLat = 111_320;
    const metersPerLon = Math.max(0.2, Math.abs(Math.cos((center.lat * Math.PI) / 180))) * 111_320;
    const eastM = (longitude - center.lon) * metersPerLon;
    const northM = (latitude - center.lat) * metersPerLat;
    // 世界中心位于 (world.size.x / 2, _, world.size.z / 2)，默认 world.size = (120, 80, 120)；
    // 与 WorldScene mapDeviceTelemetryPosition 中的 -6 偏移（即 60 米/10）相对应。
    const halfWorldX = 60;
    const halfWorldZ = 60;
    const nextPosition: [number, number, number] = [
      Number((halfWorldX + eastM).toFixed(2)),
      Number(altitudeM.toFixed(2)),
      Number((halfWorldZ - northM).toFixed(2)),
    ];
    const enriched: SimulationDevice = editingDevice
      ? {
          ...editingDevice,
          kind: selectedKind,
          name: finalDeviceName,
          capabilityTags: capabilityTags.slice(),
          physicalProfile: profile,
          telemetry: {
            ...editingDevice.telemetry,
            position: nextPosition,
            batteryPercent,
            powerW: profile.nominalPowerW,
          },
          updatedAt: new Date().toISOString(),
        }
      : {
          ...draft,
          name: finalDeviceName,
          capabilityTags: capabilityTags.slice(),
          telemetry: {
            ...draft.telemetry,
            position: nextPosition,
          },
        };

    if (editingDevice) {
      await updateDevice(enriched);
    } else {
      await registerDevice(enriched);
    }
    appendLog({
      level: 'info',
      scope: 'device',
      message: t(
        editingDevice ? 'createDeviceWindow.statusUpdated' : 'createDeviceWindow.statusSubmitted',
        { name: enriched.name },
      ),
      details: `kind=${enriched.kind} tags=${enriched.capabilityTags.join(',')} tasks=${supportedTasks.join(',')}`,
    });
    setStatus(t(
      editingDevice ? 'createDeviceWindow.statusUpdated' : 'createDeviceWindow.statusSubmitted',
      { name: enriched.name },
    ));
    setSubmitted(true);
    closeDialog();
  };

  const closeDialog = () => {
    if (isTauri()) {
      void getCurrentWindow().close().catch(() => {
        window.location.hash = '#/world';
      });
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.hash = '#/world';
  };

  const startWindowDrag = () => {
    if (!isTauri()) {
      return;
    }

    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const stepLabels: Array<{ id: StepId; label: string }> = [
    { id: 1, label: t('createDeviceWindow.steps.step1') },
    { id: 2, label: t('createDeviceWindow.steps.step2') },
    { id: 3, label: t('createDeviceWindow.steps.step3') },
    { id: 4, label: t('createDeviceWindow.steps.step4') },
  ];

  const nextLabel = currentStep === 4
    ? t(isEditMode ? 'createDeviceWindow.actions.save' : 'createDeviceWindow.actions.create')
    : t('createDeviceWindow.actions.nextTo', { name: stepLabels[currentStep]?.label ?? '' });

  return (
    <div className="create-device-dialog-page">
      <section
        className="create-device-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-device-title"
      >
        <header
          className="create-device-dialog-header"
          onMouseDown={(event) => {
            if (event.button === 0 && event.target === event.currentTarget) {
              startWindowDrag();
            }
          }}
        >
          <div className="create-device-brand" onMouseDown={startWindowDrag}>
            <img src={terminalLogoMarkUrl} alt="" />
            <span className="brand-wordmark">
              <span className="brand-wordmark-prefix">Terminal</span>
              <span className="brand-wordmark-suffix">Link</span>
            </span>
          </div>
          <div className="create-device-title-block" onMouseDown={startWindowDrag}>
            <h1 id="create-device-title">
              {isEditMode
                ? t('createDeviceWindow.editTitle', { name: editingDevice?.name ?? '' })
                : t('createDeviceWindow.title')}
            </h1>
            <p>{isEditMode ? t('createDeviceWindow.editSubtitle') : t('createDeviceWindow.subtitle')}</p>
          </div>
          <nav className="create-device-stepper" aria-label={t('createDeviceWindow.stepperAria')}>
            {stepLabels.map((step) => (
              <button
                key={step.id}
                type="button"
                className={`create-device-step ${
                  step.id === currentStep
                    ? 'create-device-step-active'
                    : step.id < currentStep
                      ? 'create-device-step-done'
                      : ''
                }`}
                onClick={() => goToStep(step.id)}
              >
                <b>{step.id < currentStep ? <FiCheck /> : step.id}</b>
                <span>{step.label}</span>
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="create-device-close-button"
            aria-label={t('common.close')}
            onClick={closeDialog}
          >
            <FiX />
          </button>
        </header>

        <main className="create-device-dialog-body">
          <aside className="create-device-kinds-panel" data-active={currentStep === 1 ? 'true' : 'false'}>
            <h2>{t('createDeviceWindow.section.kinds')}</h2>
            <div className="create-device-kind-list">
              {orderedDevices.map((kind) => {
                const kindMeta = deviceKindMetas[kind];
                const isSelected = kind === selectedKind;
                return (
                  <button
                    key={kind}
                    type="button"
                    className={`create-device-kind-card ${isSelected ? 'create-device-kind-card-active' : ''}`}
                    onClick={() => applyKindDefaults(kind)}
                  >
                    <div className="create-device-kind-thumb">
                      <img src={kindMeta.thumbnail} alt="" />
                      {kindMeta.brandLabel ? (
                        <span className="device-brand-badge">{kindMeta.brandLabel}</span>
                      ) : null}
                    </div>
                    <div className="create-device-kind-meta">
                      <strong>{kind}</strong>
                      <span>{getDeviceKindLabel(kind)}</span>
                      <em>{t(`createDeviceWindow.kindDescription.${kind}`)}</em>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="create-device-form-panel">
            <div className="create-device-form-scroll">
              <div className="create-device-section" data-active={currentStep === 2 ? 'true' : 'false'}>
                <header className="create-device-form-section-header">
                  <h2>{t('createDeviceWindow.section.basics')}</h2>
                  <span>{t('createDeviceWindow.section.basicsHint')}</span>
                </header>
                <div className="create-device-section-body">
                  <div className="create-device-form-grid create-device-form-grid-2">
                    <label className="create-device-field">
                      <span>{t('createDeviceWindow.fields.name')}</span>
                      <input
                        value={deviceName}
                        placeholder={t('createDeviceWindow.fields.namePlaceholder', { kind: getDeviceKindLabel(selectedKind) })}
                        onChange={(event) => setDeviceName(event.target.value)}
                        maxLength={64}
                      />
                      <small>{t('createDeviceWindow.fields.nameHint', { fallback: finalDeviceName })}</small>
                    </label>
                    <label className="create-device-field">
                      <span>{t('createDeviceWindow.fields.kind')}</span>
                      <select
                        value={selectedKind}
                        onChange={(event) => applyKindDefaults(event.target.value as DeviceKind)}
                      >
                        {orderedDevices.map((kind) => (
                          <option key={kind} value={kind}>
                            {getDeviceKindLabel(kind)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="create-device-form-grid create-device-form-grid-3">
                    <SliderField
                      label={t('createDeviceWindow.fields.battery')}
                      suffix="%"
                      value={batteryPercent}
                      min={0}
                      max={100}
                      onChange={(value) => setBatteryPercent(clamp(Math.round(value), 0, 100))}
                    />
                    <NumberField
                      label={t('createDeviceWindow.fields.standbyPower')}
                      suffix="W"
                      value={nominalPowerW}
                      min={1}
                      max={500}
                      onChange={(value) => setNominalPowerW(value)}
                    />
                    <NumberField
                      label={t('createDeviceWindow.fields.workPower')}
                      suffix="W"
                      value={workingPowerW}
                      min={1}
                      max={2_000}
                      onChange={(value) => setWorkingPowerW(value)}
                    />
                  </div>

                  <div className="create-device-form-grid create-device-form-grid-3">
                    <NumberField
                      label={t('createDeviceWindow.fields.maxLoad')}
                      suffix="kg"
                      value={maxLoadKg}
                      min={0}
                      max={500}
                      onChange={setMaxLoadKg}
                    />
                    <NumberField
                      label={t('createDeviceWindow.fields.maxAltitude')}
                      suffix="m"
                      value={maxAltitudeM}
                      min={0}
                      max={2_000}
                      step={selectedKind === 'drone' ? 5 : 0.1}
                      onChange={setMaxAltitudeM}
                    />
                    <RangeField
                      label={t('createDeviceWindow.fields.angleRange')}
                      suffix="°"
                      min={-90}
                      max={180}
                      startValue={minAngleDeg}
                      endValue={maxAngleDeg}
                      onChange={(start, end) => {
                        setMinAngleDeg(start);
                        setMaxAngleDeg(end);
                      }}
                    />
                  </div>

                  <div className="create-device-form-grid create-device-form-grid-1">
                    <NumberField
                      label={t('createDeviceWindow.fields.maxSpeed')}
                      suffix="m/s"
                      value={maxSpeedMps}
                      min={0}
                      max={60}
                      step={0.1}
                      onChange={setMaxSpeedMps}
                    />
                  </div>
                </div>
              </div>

              <div className="create-device-section" data-active={currentStep === 3 ? 'true' : 'false'}>
                <header className="create-device-form-section-header">
                  <h2>{t('createDeviceWindow.section.tasks')}</h2>
                  <span>{t('createDeviceWindow.section.tasksHint', { count: supportedTasks.length })}</span>
                </header>
                <div className="create-device-section-body">
                  <div className="create-device-task-grid" role="group">
                    {taskKinds.map((taskKind) => {
                      const isSelected = supportedTasks.includes(taskKind);
                      return (
                        <button
                          key={taskKind}
                          type="button"
                          aria-pressed={isSelected}
                          className={`create-device-task-chip ${isSelected ? 'create-device-task-chip-active' : ''}`}
                          onClick={() => toggleTask(taskKind)}
                        >
                          {taskIconMap[taskKind]}
                          <span>{t(`createDeviceWindow.taskKind.${taskKind}`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="create-device-section" data-active={currentStep === 3 ? 'true' : 'false'}>
                <header className="create-device-form-section-header">
                  <h2>{t('createDeviceWindow.section.capabilities')}</h2>
                  <span>{t('createDeviceWindow.section.capabilitiesHint')}</span>
                </header>
                <div className="create-device-section-body">
                  <div className="create-device-tag-list">
                    {[...new Set([...baseCapabilityCatalog, ...capabilityTags])].map((tag) => {
                      const isSelected = capabilityTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          aria-pressed={isSelected}
                          className={`create-device-tag-chip ${isSelected ? 'create-device-tag-chip-active' : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag}
                        </button>
                      );
                    })}
                    <div className="create-device-tag-input">
                      <input
                        value={customTagInput}
                        placeholder={t('createDeviceWindow.fields.customTagPlaceholder')}
                        onChange={(event) => setCustomTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addCustomTag();
                          }
                        }}
                      />
                      <button type="button" onClick={addCustomTag}>
                        <FiPlus />
                        {t('createDeviceWindow.actions.addCustomTag')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="create-device-section" data-active={currentStep === 3 ? 'true' : 'false'}>
                <header className="create-device-form-section-header">
                  <h2>{t('createDeviceWindow.section.position')}</h2>
                  <span>{t('createDeviceWindow.section.positionHint')}</span>
                </header>
                <div className="create-device-section-body">
                  <div className="create-device-position">
                    <div className="create-device-position-header">
                      <div className="create-device-position-modes">
                        {(['recommended', 'custom', 'current'] as PositionMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={positionMode === mode}
                            className={`create-device-position-mode ${
                              positionMode === mode ? 'create-device-position-mode-active' : ''
                            }`}
                            onClick={() => {
                              if (mode === 'recommended') {
                                setRecommendedPosition();
                              } else if (mode === 'current') {
                                void setCurrentPosition();
                              } else {
                                setPositionMode('custom');
                              }
                            }}
                          >
                            {t(`createDeviceWindow.positionMode.${mode}`)}
                          </button>
                        ))}
                      </div>
                      {(() => {
                        let tone: 'ok' | 'warn' | 'error' | 'info';
                        let message: string;
                        if (groundCtx.status === 'loading' || groundCtx.status === 'idle') {
                          tone = 'info';
                          message = t('createDeviceWindow.groundContext.loading');
                        } else if (groundCtx.status === 'error') {
                          tone = 'warn';
                          message = t('createDeviceWindow.groundContext.queryFailed', {
                            message: groundCtx.error ?? t('createDeviceWindow.geoError.unknown'),
                          });
                        } else {
                          const surfaceElevM = groundCtx.hasGroundElevation ? groundCtx.groundElevationM : 0;
                          const aboveSurfaceText = Math.max(0, altitudeM - surfaceElevM).toFixed(1);
                          const positionMessage = (() => {
                            switch (positionState) {
                              case 'land':
                                return groundCtx.buildingHeightM > 0
                                  ? t('createDeviceWindow.groundContext.positionLandWithBuilding', {
                                      height: groundCtx.buildingHeightM.toFixed(1),
                                    })
                                  : t('createDeviceWindow.groundContext.positionLand');
                              case 'underground':
                                return t('createDeviceWindow.groundContext.positionUnderground');
                              case 'air-over-land':
                                return t('createDeviceWindow.groundContext.positionAirOverLand', { altitude: aboveSurfaceText });
                              case 'water-surface':
                                return t('createDeviceWindow.groundContext.positionWaterSurface');
                              case 'underwater':
                                return t('createDeviceWindow.groundContext.positionUnderwater');
                              case 'air-over-water':
                                return t('createDeviceWindow.groundContext.positionAirOverWater', { altitude: aboveSurfaceText });
                              default:
                                return t('createDeviceWindow.groundContext.loading');
                            }
                          })();
                          if (isPositionInvalid && positionRejectKey) {
                            tone = 'error';
                            message = `${positionMessage} · ${t(positionRejectKey)}`;
                          } else {
                            tone = 'ok';
                            message = positionMessage;
                          }
                        }
                        const Icon =
                          tone === 'ok'
                            ? MdCheckCircle
                            : tone === 'warn'
                              ? FiAlertTriangle
                              : tone === 'error'
                                ? FiAlertCircle
                                : FiLoader;
                        return (
                          <div className="create-device-ground-context" data-tone={tone} title={message}>
                            <Icon aria-hidden="true" className="create-device-ground-context-icon" />
                            <span>{message}</span>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="create-device-position-grid">
                      <NumberField
                        label={t('createDeviceWindow.fields.latitude')}
                        suffix="° N"
                        value={latitude}
                        min={-89.99}
                        max={89.99}
                        step={0.000001}
                        onChange={(value) => {
                          setLatitude(value);
                          setPositionMode('custom');
                        }}
                      />
                      <NumberField
                        label={t('createDeviceWindow.fields.longitude')}
                        suffix="° E"
                        value={longitude}
                        min={-180}
                        max={180}
                        step={0.000001}
                        onChange={(value) => {
                          setLongitude(value);
                          setPositionMode('custom');
                        }}
                      />
                      <NumberField
                        label={t('createDeviceWindow.fields.altitude')}
                        suffix="m"
                        value={altitudeM}
                        min={0}
                        max={2_000}
                        step={0.1}
                        disabled={!isFlyingDevice}
                        hint={
                          !isFlyingDevice
                            ? t('createDeviceWindow.altitudeHint.groundLocked')
                            : groundCtx.status === 'ready'
                              ? groundCtx.buildingHeightM > 0
                                ? t('createDeviceWindow.altitudeHint.aboveBuilding', {
                                    height: groundCtx.buildingHeightM.toFixed(1),
                                    buffer: DRONE_ALTITUDE_BUFFER_M,
                                  })
                                : t('createDeviceWindow.altitudeHint.openSky')
                              : groundCtx.status === 'loading'
                                ? t('createDeviceWindow.altitudeHint.querying')
                                : groundCtx.status === 'error'
                                  ? t('createDeviceWindow.altitudeHint.queryFailed')
                                  : undefined
                        }
                        onChange={setAltitudeM}
                      />
                      <div className="create-device-map-preview">
                        <div ref={mapContainerRef} className="create-device-map" aria-label={t('createDeviceWindow.fields.mapAria')} />
                        {!isMapReady ? (
                          <div className="create-device-map-fallback">
                            <img src={terminalMapReferenceUrl} alt="" />
                            <strong>{mapStatus}</strong>
                            <span>{t('createDeviceWindow.fields.mapHint')}</span>
                          </div>
                        ) : null}
                        <div className="create-device-map-overlay">
                          <FiCompass />
                          <span>{t('createDeviceWindow.fields.mapCenter')}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {currentStep === 4 ? (
                <div className="create-device-confirm" data-active="true">
                  <div className="create-device-confirm-icon">
                    <MdCheckCircle />
                  </div>
                  <div className="create-device-confirm-body">
                    <strong>{t('createDeviceWindow.confirm.title', { name: finalDeviceName })}</strong>
                    <span>{t('createDeviceWindow.confirm.summary', {
                      kind: getDeviceKindLabel(selectedKind),
                      tasks: supportedTasks.length,
                      tags: capabilityTags.length,
                    })}</span>
                    {submitted ? (
                      <em className="create-device-confirm-success">
                        {t('createDeviceWindow.confirm.success', { count: totalRegistered + 1 })}
                      </em>
                    ) : (
                      <em>{t('createDeviceWindow.confirm.hint')}</em>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="create-device-summary-panel">
            <h2>{t('createDeviceWindow.section.summary')}</h2>
            <div className="create-device-summary-hero">
              <DeviceModelPreview kind={selectedKind} />
            </div>
            <dl className="create-device-summary-list">
              <SummaryRow label={t('createDeviceWindow.summary.name')} value={finalDeviceName} />
              <SummaryRow label={t('createDeviceWindow.summary.kind')} value={`${getDeviceKindLabel(selectedKind)} (${selectedKind})`} />
              <SummaryRow label={t('createDeviceWindow.summary.battery')} value={`${batteryPercent}%`} />
              <SummaryRow label={t('createDeviceWindow.summary.standbyPower')} value={`${nominalPowerW} W`} />
              <SummaryRow label={t('createDeviceWindow.summary.workPower')} value={`${workingPowerW} W`} />
              <SummaryRow label={t('createDeviceWindow.summary.maxLoad')} value={`${maxLoadKg} kg`} />
              <SummaryRow label={t('createDeviceWindow.summary.angleRange')} value={`${minAngleDeg}° ~ ${maxAngleDeg}°`} />
              <SummaryRow
                label={t('createDeviceWindow.summary.tasks')}
                value={supportedTasks.length === 0
                  ? t('common.empty')
                  : supportedTasks.map((kind) => t(`createDeviceWindow.taskKind.${kind}`)).join(' / ')}
              />
              <SummaryRow
                label={t('createDeviceWindow.summary.tags')}
                value={capabilityTags.length === 0 ? t('common.empty') : capabilityTags.join(' / ')}
              />
            </dl>
            <div className="create-device-scenarios">
              <strong>{t('createDeviceWindow.summary.recommendedScenarios')}</strong>
              <ul>
                {meta.scenarioKeys.map((key) => (
                  <li key={key}>{t(`createDeviceWindow.scenarios.${key}`)}</li>
                ))}
              </ul>
            </div>
          </aside>
        </main>

        <footer className="create-device-dialog-footer">
          <button type="button" className="create-device-secondary-button" onClick={closeDialog}>
            {t('common.cancel')}
          </button>
          <span className="create-device-status" role="status">
            {status}
            <em>{t('createDeviceWindow.registered', { count: totalRegistered + (submitted ? 1 : 0) })}</em>
          </span>
          <div className="create-device-footer-actions">
            <button
              type="button"
              className="create-device-secondary-button"
              onClick={handlePrev}
              disabled={currentStep === 1}
            >
              <FiArrowLeft />
              {t('createDeviceWindow.actions.prev')}
            </button>
            <button
              type="button"
              className="create-device-primary-button"
              onClick={handleNext}
              disabled={
                (submitted && currentStep === 4)
                || (currentStep >= 3 && (isPositionInvalid || isGroundContextPending))
              }
              title={
                currentStep >= 3
                  ? isPositionInvalid && positionRejectKey
                    ? t(positionRejectKey)
                    : isGroundContextPending
                      ? t('createDeviceWindow.groundContext.waitingResult')
                      : undefined
                  : undefined
              }
            >
              {currentStep === 4 ? <FiCpu /> : null}
              {nextLabel}
              {currentStep < 4 ? <FiArrowRight /> : null}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  suffix?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  hint?: string;
  onChange: (value: number) => void;
}

function NumberField({ label, suffix, value, min, max, step = 1, disabled, hint, onChange }: NumberFieldProps) {
  return (
    <label className="create-device-field" data-disabled={disabled ? 'true' : 'false'}>
      <span>{label}</span>
      <div className="create-device-field-input">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          readOnly={disabled}
          onChange={(event) => {
            if (disabled) {
              return;
            }
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(clamp(next, min, max));
            }
          }}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
      {hint ? <small className="create-device-field-hint">{hint}</small> : null}
    </label>
  );
}

interface SliderFieldProps {
  label: string;
  suffix?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

function SliderField({ label, suffix, value, min, max, step = 1, onChange }: SliderFieldProps) {
  return (
    <label className="create-device-field">
      <span>{label}</span>
      <div className="create-device-field-slider">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <strong>
          {value}
          {suffix ? <em>{suffix}</em> : null}
        </strong>
      </div>
    </label>
  );
}

interface RangeFieldProps {
  label: string;
  suffix?: string;
  startValue: number;
  endValue: number;
  min: number;
  max: number;
  onChange: (start: number, end: number) => void;
}

function RangeField({ label, suffix, startValue, endValue, min, max, onChange }: RangeFieldProps) {
  return (
    <label className="create-device-field">
      <span>{label}</span>
      <div className="create-device-field-range">
        <input
          type="number"
          value={startValue}
          min={min}
          max={max}
          step={1}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(clamp(next, min, max), Math.max(endValue, clamp(next, min, max)));
            }
          }}
        />
        {suffix ? <em>{suffix}</em> : null}
        <i>~</i>
        <input
          type="number"
          value={endValue}
          min={min}
          max={max}
          step={1}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) {
              onChange(Math.min(startValue, clamp(next, min, max)), clamp(next, min, max));
            }
          }}
        />
        {suffix ? <em>{suffix}</em> : null}
      </div>
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="create-device-summary-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
