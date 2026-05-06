import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CesiumWidget as CesiumWidgetType, Cesium3DTileset } from '@cesium/engine';
import ArcType from '@cesium/engine/Source/Core/ArcType.js';
import BoundingSphere from '@cesium/engine/Source/Core/BoundingSphere.js';
import Cartesian2 from '@cesium/engine/Source/Core/Cartesian2.js';
import Cartesian3 from '@cesium/engine/Source/Core/Cartesian3.js';
import Cartographic from '@cesium/engine/Source/Core/Cartographic.js';
import Color from '@cesium/engine/Source/Core/Color.js';
import CallbackPositionProperty from '@cesium/engine/Source/DataSources/CallbackPositionProperty.js';
import CallbackProperty from '@cesium/engine/Source/DataSources/CallbackProperty.js';
import ConstantPositionProperty from '@cesium/engine/Source/DataSources/ConstantPositionProperty.js';
import ConstantProperty from '@cesium/engine/Source/DataSources/ConstantProperty.js';
import Quaternion from '@cesium/engine/Source/Core/Quaternion.js';
import DistanceDisplayCondition from '@cesium/engine/Source/Core/DistanceDisplayCondition.js';
import GoogleMaps from '@cesium/engine/Source/Core/GoogleMaps.js';
import HeadingPitchRange from '@cesium/engine/Source/Core/HeadingPitchRange.js';
import HeadingPitchRoll from '@cesium/engine/Source/Core/HeadingPitchRoll.js';
import Ion from '@cesium/engine/Source/Core/Ion.js';
import CesiumMath from '@cesium/engine/Source/Core/Math.js';
import Matrix4 from '@cesium/engine/Source/Core/Matrix4.js';
import NearFarScalar from '@cesium/engine/Source/Core/NearFarScalar.js';
import PolygonHierarchy from '@cesium/engine/Source/Core/PolygonHierarchy.js';
import Resource from '@cesium/engine/Source/Core/Resource.js';
import ScreenSpaceEventHandler from '@cesium/engine/Source/Core/ScreenSpaceEventHandler.js';
import ScreenSpaceEventType from '@cesium/engine/Source/Core/ScreenSpaceEventType.js';
import Transforms from '@cesium/engine/Source/Core/Transforms.js';
import buildModuleUrl from '@cesium/engine/Source/Core/buildModuleUrl.js';
import ClassificationType from '@cesium/engine/Source/Scene/ClassificationType.js';
import HeightReference from '@cesium/engine/Source/Scene/HeightReference.js';
import HorizontalOrigin from '@cesium/engine/Source/Scene/HorizontalOrigin.js';
import LabelStyle from '@cesium/engine/Source/Scene/LabelStyle.js';
import VerticalOrigin from '@cesium/engine/Source/Scene/VerticalOrigin.js';
import createGooglePhotorealistic3DTileset from '@cesium/engine/Source/Scene/createGooglePhotorealistic3DTileset.js';
import CesiumWidget from '@cesium/engine/Source/Widget/CesiumWidget.js';
import '@cesium/engine/Source/Widget/CesiumWidget.css';
import type { SimulationDevice, SimulationGoal, SimulationTask, WorldObject, WorldSnapshot } from '../types';
import {
  AREA_COLORS,
  MARKER_COLORS,
  type ActiveTool,
  type GeoPoint,
  type SceneArea,
  type SceneLayerState,
  type SceneMarker,
  type SceneMeasurement,
  type SceneSettings,
} from './sceneOverlay/sceneTypes';
import type { SceneOverlaySelection } from './sceneOverlay/useSceneTools';
import djiMavicUrl from '../../assets/models/DJI_Mavic.glb';
import unitreeG1Glb from '../../assets/models/baked/unitree_g1.glb';
import unitreeGo2Glb from '../../assets/models/baked/unitree_go2.glb';

function deviceModelUri(kind: SimulationDevice['kind']): string | undefined {
  switch (kind) {
    case 'drone':
      return djiMavicUrl;
    case 'humanoid':
      return unitreeG1Glb;
    case 'quadruped':
    case 'unitree_robot':
      return unitreeGo2Glb;
    default:
      return undefined;
  }
}

const MODEL_NEAR_FAR_M = 1500;

export interface WorldSceneCameraPose {
  heading: number;
  pitch: number;
  roll: number;
  height: number;
}

export interface WorldSceneFocusTarget {
  key: string;
  lon: number;
  lat: number;
  height: number;
  range?: number;
}

export interface HumanRoamStart {
  lon: number;
  lat: number;
  headingDeg?: number;
}

export interface WorldSceneProps {
  children?: ReactNode;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  cameraMode?: 'orbit' | 'first_person' | 'human_roam';
  humanRoamStart?: HumanRoamStart | null;
  onHumanRoamStartPlace?: (geo: { lon: number; lat: number }) => void;
  onHumanRoamPoseChange?: (pose: { lon: number; lat: number; height: number; headingDeg: number }) => void;
  devicePosition?: [number, number, number];
  deviceRotation?: [number, number, number];
  worldAxesSize?: number;
  deviceAxesSize?: number;
  deviceName?: string;
  deviceKind?: SimulationDevice['kind'];
  worldLabel?: string;
  deviceLabel?: string;
  minHeight?: number | string;
  objects?: WorldObject[];
  devices?: SimulationDevice[];
  weather?: WorldSnapshot['terrain'];
  showAxes?: boolean;
  hidePrimaryDevice?: boolean;
  tickIntervalMs?: number;
  googleMapsApiKey?: string;
  cesiumIonToken?: string;
  layers?: SceneLayerState[];
  sceneSettings?: SceneSettings;
  activeTool?: ActiveTool;
  onScenePick?: (point: GeoPoint) => void;
  markers?: SceneMarker[];
  measurements?: SceneMeasurement[];
  areas?: SceneArea[];
  goals?: SimulationGoal[];
  tasks?: SimulationTask[];
  draftMeasurementStart?: GeoPoint | null;
  draftAreaVertices?: GeoPoint[];
  selection?: SceneOverlaySelection | null;
  onSelectOverlay?: (selection: SceneOverlaySelection | null) => void;
  onCameraPoseChange?: (pose: WorldSceneCameraPose) => void;
  focusTarget?: WorldSceneFocusTarget | null;
}

interface GeoCenter {
  lat: number;
  lon: number;
  radiusM: number;
}

interface SceneStatus {
  tone: 'loading' | 'ready' | 'error';
  message: string;
}

type SceneWidget = CesiumWidgetType;

const FALLBACK_CENTER: GeoCenter = {
  lat: 34.05369,
  lon: -118.24277,
  radiusM: 500,
};
const DEFAULT_CESIUM_BASE_URL = './cesium/';
const GOOGLE_KEY_ENV_NAMES = ['PUBLIC_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY'];
const DEVICE_COLORS: Record<SimulationDevice['kind'], Color> = {
  drone: Color.fromCssColorString('#1a73e8'),
  wheeled_robot: Color.fromCssColorString('#1e8e3e'),
  humanoid: Color.fromCssColorString('#f9ab00'),
  quadruped: Color.fromCssColorString('#a142f4'),
  unitree_robot: Color.fromCssColorString('#7c4dff'),
  sensor_node: Color.fromCssColorString('#00acc1'),
};

export function mapDeviceTelemetryPosition(position: SimulationDevice['telemetry']['position']): [number, number, number] {
  return [
    position[0] / 10 - 6,
    Math.max(-0.6, position[1] / 10 - 0.6),
    position[2] / 10 - 6,
  ];
}

function readImportMetaEnv(name: string): string | undefined {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const value = env?.[name]?.trim();
  return value || undefined;
}

function trimOptionalCredential(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function resolveGoogleMapsApiKey(configuredKey?: string) {
  return trimOptionalCredential(configuredKey) ?? GOOGLE_KEY_ENV_NAMES.map(readImportMetaEnv).find(Boolean);
}

function resolveCesiumIonToken(configuredToken?: string) {
  return trimOptionalCredential(configuredToken)
    ?? readImportMetaEnv('PUBLIC_CESIUM_ION_TOKEN')
    ?? readImportMetaEnv('CESIUM_ION_TOKEN');
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveWorldCenter(objects: WorldObject[]): GeoCenter {
  const metadata = objects.find((object) => object.properties?.world_metadata === 'true')?.properties ?? {};
  const lat = parseNumber(metadata.center_lat);
  const lon = parseNumber(metadata.center_lon);
  const radiusM = parseNumber(metadata.radius_m);
  if (lat !== undefined && lon !== undefined) {
    return {
      lat,
      lon,
      radiusM: radiusM ?? FALLBACK_CENTER.radiusM,
    };
  }

  const firstLocatedObject = objects.find((object) => parseNumber(object.properties?.lat) !== undefined && parseNumber(object.properties?.lon) !== undefined);
  const objectLat = parseNumber(firstLocatedObject?.properties?.lat);
  const objectLon = parseNumber(firstLocatedObject?.properties?.lon);
  if (objectLat !== undefined && objectLon !== undefined) {
    return {
      lat: objectLat,
      lon: objectLon,
      radiusM: radiusM ?? FALLBACK_CENTER.radiusM,
    };
  }

  return FALLBACK_CENTER;
}

function worldOffsetToLonLat(center: GeoCenter, offset: readonly [number, number, number], altitudeM = 0) {
  const metersPerLat = 111_320;
  const metersPerLon = Math.max(0.2, Math.abs(Math.cos(CesiumMath.toRadians(center.lat)))) * 111_320;
  const eastM = offset[0] * 10;
  const northM = -offset[2] * 10;
  return {
    lon: center.lon + eastM / metersPerLon,
    lat: center.lat + northM / metersPerLat,
    height: Math.max(0, altitudeM),
  };
}

function entityPositionFromGeo(geo: { lon: number; lat: number; height: number }) {
  return Cartesian3.fromDegrees(geo.lon, geo.lat, geo.height);
}

function deviceGeoPosition(center: GeoCenter, device: SimulationDevice) {
  const altitude = device.kind === 'drone'
    ? Math.max(20, device.telemetry.position[1])
    : Math.max(1.5, device.telemetry.position[1] * 0.08);
  return worldOffsetToLonLat(center, mapDeviceTelemetryPosition(device.telemetry.position), altitude);
}

// 客户端插值：每条 device 维护一段从 from→to 的位姿 motion，
// 由 Cesium CallbackProperty 在每帧实时求值得到平滑过渡，
// 解决"后端 5 Hz tick + 直接 set ConstantPositionProperty"造成的肉眼跳格。
type DeviceMotion = {
  fromLon: number;
  fromLat: number;
  fromHeight: number;
  toLon: number;
  toLat: number;
  toHeight: number;
  fromHeading: number; // 弧度
  toHeading: number;   // 弧度，已 normalize 到与 from 最短角差
  startMs: number;
  durationMs: number;
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// 让 toHeading 与 fromHeading 走最短角差，避免 359° → 1° 时绕一圈。
function normalizeHeadingTarget(from: number, target: number): number {
  let delta = target - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta;
}

function buildHeadingRadFromDevice(device: SimulationDevice): number {
  return CesiumMath.toRadians(90 - device.telemetry.headingDeg);
}

function sampleMotionPosition(
  motion: DeviceMotion,
  nowMs: number,
  result?: Cartesian3,
): Cartesian3 {
  const t = motion.durationMs > 0
    ? clamp01((nowMs - motion.startMs) / motion.durationMs)
    : 1;
  const e = easeInOutQuad(t);
  const lon = lerp(motion.fromLon, motion.toLon, e);
  const lat = lerp(motion.fromLat, motion.toLat, e);
  const height = lerp(motion.fromHeight, motion.toHeight, e);
  return Cartesian3.fromDegrees(lon, lat, height, undefined, result);
}

function sampleMotionHeading(motion: DeviceMotion, nowMs: number): number {
  const t = motion.durationMs > 0
    ? clamp01((nowMs - motion.startMs) / motion.durationMs)
    : 1;
  const e = easeInOutQuad(t);
  return lerp(motion.fromHeading, motion.toHeading, e);
}

const HPR_SCRATCH = new HeadingPitchRoll();
const POS_SCRATCH = new Cartesian3();

function sampleMotionOrientation(
  motion: DeviceMotion,
  nowMs: number,
  result?: Quaternion,
): Quaternion {
  const heading = sampleMotionHeading(motion, nowMs);
  const position = sampleMotionPosition(motion, nowMs, POS_SCRATCH);
  HPR_SCRATCH.heading = heading;
  HPR_SCRATCH.pitch = 0;
  HPR_SCRATCH.roll = 0;
  return Transforms.headingPitchRollQuaternion(position, HPR_SCRATCH, undefined, undefined, result);
}

function snapshotMotion(motion: DeviceMotion, nowMs: number): {
  lon: number; lat: number; height: number; heading: number;
} {
  const t = motion.durationMs > 0
    ? clamp01((nowMs - motion.startMs) / motion.durationMs)
    : 1;
  const e = easeInOutQuad(t);
  return {
    lon: lerp(motion.fromLon, motion.toLon, e),
    lat: lerp(motion.fromLat, motion.toLat, e),
    height: lerp(motion.fromHeight, motion.toHeight, e),
    heading: lerp(motion.fromHeading, motion.toHeading, e),
  };
}

function makeMotionFromDevice(
  device: SimulationDevice,
  center: GeoCenter,
  nowMs: number,
  durationMs: number,
): DeviceMotion {
  const geo = deviceGeoPosition(center, device);
  const heading = buildHeadingRadFromDevice(device);
  return {
    fromLon: geo.lon,
    fromLat: geo.lat,
    fromHeight: geo.height,
    toLon: geo.lon,
    toLat: geo.lat,
    toHeight: geo.height,
    fromHeading: heading,
    toHeading: heading,
    startMs: nowMs,
    durationMs,
  };
}

function advanceMotionTo(
  motion: DeviceMotion,
  device: SimulationDevice,
  center: GeoCenter,
  nowMs: number,
  durationMs: number,
): DeviceMotion {
  const snapshot = snapshotMotion(motion, nowMs);
  const geo = deviceGeoPosition(center, device);
  const targetHeading = buildHeadingRadFromDevice(device);
  return {
    fromLon: snapshot.lon,
    fromLat: snapshot.lat,
    fromHeight: snapshot.height,
    toLon: geo.lon,
    toLat: geo.lat,
    toHeight: geo.height,
    fromHeading: snapshot.heading,
    toHeading: normalizeHeadingTarget(snapshot.heading, targetHeading),
    startMs: nowMs,
    durationMs,
  };
}

function cameraGeoFromScenePosition(center: GeoCenter, position: [number, number, number]) {
  return worldOffsetToLonLat(center, position, Math.max(0.4, position[1] * 10 + 6));
}

export function deviceModelScale(device: Pick<SimulationDevice, 'kind' | 'name'>): number {
  const name = (device.name || '').toLowerCase();
  if (name.includes('b2')) return 1.55;
  if (name.includes('matrice 30')) return 1.6;
  if (name.includes('autel') || name.includes('evo max')) return 1.3;
  return 1.0;
}

export function deviceEyeHeightM(device: Pick<SimulationDevice, 'kind' | 'name'>): number {
  const name = (device.name || '').toLowerCase();
  if (name.includes('b2')) return 0.65;
  if (name.includes('g1')) return 1.30;
  if (name.includes('go2')) return 0.40;
  switch (device.kind) {
    case 'drone':
      return 0.0;
    case 'sensor_node':
      return 0.40;
    case 'humanoid':
      return 1.30;
    case 'quadruped':
    case 'unitree_robot':
      return 0.40;
    case 'wheeled_robot':
      return 0.55;
    default:
      return 0.80;
  }
}

function makePegmanIcon(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  const w = 56;
  const h = 80;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = 'rgba(11, 31, 84, 0.28)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h - 4, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbbc04';
  ctx.beginPath();
  ctx.arc(w / 2, 14, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#202124';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#1a73e8';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 12, 28);
  ctx.lineTo(w / 2 + 12, 28);
  ctx.lineTo(w / 2 + 8, 54);
  ctx.lineTo(w / 2 - 8, 54);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#0b1f54';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.strokeStyle = '#202124';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, 54);
  ctx.lineTo(w / 2 - 8, 72);
  ctx.moveTo(w / 2 + 6, 54);
  ctx.lineTo(w / 2 + 8, 72);
  ctx.stroke();
  return canvas;
}

function makeDeviceCanvas(device: SimulationDevice, selected: boolean) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
  canvas.width = 96 * dpr;
  canvas.height = 96 * dpr;
  const context = canvas.getContext('2d');
  if (!context) {
    return canvas;
  }
  context.scale(dpr, dpr);

  const color = DEVICE_COLORS[device.kind].toCssColorString();
  context.clearRect(0, 0, 96, 96);
  context.fillStyle = selected ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.86)';
  context.beginPath();
  context.arc(48, 48, 39, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = selected ? 5 : 3;
  context.strokeStyle = color;
  context.stroke();
  context.fillStyle = color;
  if (device.kind === 'drone') {
    context.fillRect(22, 44, 52, 8);
    context.fillRect(44, 22, 8, 52);
    [24, 72].forEach((x) => [24, 72].forEach((y) => {
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.stroke();
    }));
  } else if (device.kind === 'quadruped') {
    context.fillRect(30, 34, 36, 18);
    context.fillRect(25, 56, 10, 16);
    context.fillRect(61, 56, 10, 16);
    context.fillRect(25, 22, 10, 14);
    context.fillRect(61, 22, 10, 14);
  } else if (device.kind === 'humanoid') {
    context.beginPath();
    context.arc(48, 28, 10, 0, Math.PI * 2);
    context.fill();
    context.fillRect(40, 41, 16, 28);
    context.fillRect(24, 42, 48, 8);
  } else {
    context.fillRect(26, 34, 44, 28);
    context.beginPath();
    context.arc(34, 66, 7, 0, Math.PI * 2);
    context.arc(62, 66, 7, 0, Math.PI * 2);
    context.fill();
  }
  return canvas;
}

function addPolylineForObject(widget: SceneWidget, object: WorldObject) {
  const points = object.properties?.geometry
    ?.split(';')
    .map((pair) => pair.split(',').map((value) => Number.parseFloat(value.trim())))
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  if (!points || points.length < 2) {
    return;
  }

  widget.entities.add({
    id: `osm-${object.id}`,
    name: object.name,
    polyline: {
      positions: Cartesian3.fromDegreesArray(points.flatMap(([lat, lon]) => [lon, lat])),
      width: object.kind.includes('road') ? 4 : 2,
      material: object.kind.includes('road')
        ? Color.fromCssColorString('#fbbc04').withAlpha(0.78)
        : Color.fromCssColorString('#34a853').withAlpha(0.58),
      clampToGround: true,
      arcType: ArcType.GEODESIC,
      classificationType: ClassificationType.BOTH,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 4200),
    },
  });
}

function addPointForObject(widget: SceneWidget, object: WorldObject) {
  const lat = parseNumber(object.properties?.lat);
  const lon = parseNumber(object.properties?.lon);
  if (lat === undefined || lon === undefined || object.properties?.world_metadata === 'true') {
    return;
  }

  const isPoi = object.kind.includes('poi') || object.kind.includes('landmark');
  if (!isPoi) {
    return;
  }

  widget.entities.add({
    id: `poi-${object.id}`,
    name: object.name,
    position: Cartesian3.fromDegrees(lon, lat, 6),
    point: {
      pixelSize: 9,
      color: Color.fromCssColorString('#1a73e8'),
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      heightReference: HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 2600),
    },
    label: {
      text: object.name,
      font: '600 12px Google Sans, Arial, sans-serif',
      style: LabelStyle.FILL_AND_OUTLINE,
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#1f1f1f'),
      outlineWidth: 3,
      pixelOffset: new Cartesian2(0, -18),
      verticalOrigin: VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 1600),
    },
  });
}

function addDeviceEntity(
  widget: SceneWidget,
  center: GeoCenter,
  device: SimulationDevice,
  selected: boolean,
  showPath = true,
  motionGetter?: () => DeviceMotion | undefined,
) {
  const geo = deviceGeoPosition(center, device);
  const heading = CesiumMath.toRadians(90 - device.telemetry.headingDeg);
  const position = entityPositionFromGeo(geo);
  const isDrone = device.kind === 'drone';
  const modelUri = deviceModelUri(device.kind);

  // 设备实体（不是主标记）走 CallbackProperty 插值；
  // 主标记 / fallback 路径走 Constant 路径，保持原行为。
  const animatedPosition = motionGetter
    ? new CallbackPositionProperty((_time: unknown, result?: Cartesian3) => {
        const motion = motionGetter();
        if (!motion) {
          return Cartesian3.clone(position, result);
        }
        return sampleMotionPosition(motion, Date.now(), result);
      }, false)
    : undefined;
  const animatedOrientation = motionGetter
    ? new CallbackProperty((_time: unknown, result?: Quaternion) => {
        const motion = motionGetter();
        if (!motion) {
          return Transforms.headingPitchRollQuaternion(
            position,
            new HeadingPitchRoll(heading, 0, 0),
            undefined,
            undefined,
            result,
          );
        }
        return sampleMotionOrientation(motion, Date.now(), result);
      }, false)
    : undefined;
  const polylineCallback = motionGetter && isDrone
    ? new CallbackProperty(() => {
        const motion = motionGetter();
        const snapshot = motion ? snapshotMotion(motion, Date.now()) : { lon: geo.lon, lat: geo.lat, height: geo.height };
        return [
          Cartesian3.fromDegrees(snapshot.lon, snapshot.lat, 0),
          Cartesian3.fromDegrees(snapshot.lon, snapshot.lat, snapshot.height),
        ];
      }, false)
    : undefined;

  widget.entities.add({
    id: `device-${device.id}`,
    name: device.name,
    position: animatedPosition ?? new ConstantPositionProperty(position),
    orientation: animatedOrientation
      ?? new ConstantProperty(
        Transforms.headingPitchRollQuaternion(position, new HeadingPitchRoll(heading, 0, 0)),
      ),
    model: modelUri ? {
      uri: modelUri,
      scale: deviceModelScale(device),
      minimumPixelSize: 0,
      heightReference: isDrone ? HeightReference.NONE : HeightReference.CLAMP_TO_GROUND,
      distanceDisplayCondition: new DistanceDisplayCondition(0, MODEL_NEAR_FAR_M),
      runAnimations: true,
    } : undefined,
    billboard: {
      image: makeDeviceCanvas(device, selected),
      width: selected ? 46 : 38,
      height: selected ? 46 : 38,
      heightReference: isDrone ? HeightReference.NONE : HeightReference.CLAMP_TO_GROUND,
      verticalOrigin: VerticalOrigin.CENTER,
      horizontalOrigin: HorizontalOrigin.CENTER,
      scaleByDistance: new NearFarScalar(60, 1.2, 2200, 0.45),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: modelUri
        ? new DistanceDisplayCondition(MODEL_NEAR_FAR_M, Number.POSITIVE_INFINITY)
        : undefined,
    },
    label: {
      text: device.name,
      font: '700 12px Google Sans, Arial, sans-serif',
      style: LabelStyle.FILL_AND_OUTLINE,
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString('#0b1f54'),
      outlineWidth: 3,
      pixelOffset: new Cartesian2(0, isDrone ? -38 : -32),
      verticalOrigin: VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new DistanceDisplayCondition(0, 1800),
    },
    polyline: isDrone ? {
      positions: polylineCallback ?? [
        Cartesian3.fromDegrees(geo.lon, geo.lat, 0),
        Cartesian3.fromDegrees(geo.lon, geo.lat, geo.height),
      ],
      width: 2,
      material: DEVICE_COLORS[device.kind].withAlpha(0.55),
      arcType: ArcType.NONE,
      show: showPath,
    } : undefined,
  });
}

function addPrimaryMarker(widget: SceneWidget, center: GeoCenter, props: {
  deviceName: string;
  deviceKind: SimulationDevice['kind'];
  devicePosition: [number, number, number];
}) {
  const markerDevice: SimulationDevice = {
    id: 'primary-device',
    kind: props.deviceKind,
    name: props.deviceName,
    status: 'working',
    capabilityTags: [],
    physicalProfile: {
      minWorkAltitudeM: 0,
      maxWorkAltitudeM: 60,
      maxSlopeDeg: 90,
      supportedMaterials: [],
      nominalPowerW: 0,
      workingPowerW: 0,
      maxSpeedMps: 0,
      jointCount: 0,
    },
    telemetry: {
      position: [
        (props.devicePosition[0] + 6) * 10,
        (props.devicePosition[1] + 0.6) * 10,
        (props.devicePosition[2] + 6) * 10,
      ],
      velocity: [0, 0, 0],
      headingDeg: 0,
      batteryPercent: 100,
      powerW: 0,
      signalStrength: 100,
      temperatureC: 25,
      speedMps: 0,
      jointAnglesDeg: [],
      lastSeenAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addDeviceEntity(widget, center, markerDevice, true);
}

function flyToSceneCamera(widget: SceneWidget, center: GeoCenter, cameraPosition: [number, number, number], cameraTarget?: [number, number, number]) {
  const position = cameraGeoFromScenePosition(center, cameraPosition);
  const destination = Cartesian3.fromDegrees(position.lon, position.lat, position.height);
  if (!cameraTarget) {
    widget.camera.flyTo({
      destination,
      orientation: {
        heading: CesiumMath.toRadians(28),
        pitch: CesiumMath.toRadians(-16),
        roll: 0,
      },
      duration: 0.8,
    });
    return;
  }

  const target = cameraGeoFromScenePosition(center, cameraTarget);
  const targetEcef = Cartesian3.fromDegrees(target.lon, target.lat, target.height);
  const enuFrame = Transforms.eastNorthUpToFixedFrame(destination);
  const inverseEnu = Matrix4.inverseTransformation(enuFrame, new Matrix4());
  const dirEcef = Cartesian3.subtract(targetEcef, destination, new Cartesian3());
  const dirEnu = Matrix4.multiplyByPointAsVector(inverseEnu, dirEcef, new Cartesian3());
  const horizontal = Math.hypot(dirEnu.x, dirEnu.y);
  const heading = horizontal < 1e-6 ? 0 : Math.atan2(dirEnu.x, dirEnu.y);
  const pitch = Math.atan2(dirEnu.z, Math.max(horizontal, 1e-6));
  widget.camera.flyTo({
    destination,
    orientation: {
      heading,
      pitch,
      roll: 0,
    },
    duration: 0.8,
  });
}

function applyWorldCamera(widget: SceneWidget, center: GeoCenter, mode: WorldSceneProps['cameraMode'], cameraPosition?: [number, number, number], cameraTarget?: [number, number, number]) {
  if (mode === 'human_roam') {
    return;
  }
  if (mode === 'first_person' && cameraPosition) {
    flyToSceneCamera(widget, center, cameraPosition, cameraTarget);
    return;
  }

  const range = mode === 'first_person' ? Math.max(120, center.radiusM * 0.46) : Math.max(520, center.radiusM * 1.28);
  widget.camera.flyToBoundingSphere(
    new BoundingSphere(Cartesian3.fromDegrees(center.lon, center.lat, 0), range),
    {
      offset: new HeadingPitchRange(CesiumMath.toRadians(28), CesiumMath.toRadians(mode === 'first_person' ? -14 : -42), range),
      duration: 0.9,
    },
  );
}

const USER_ENTITY_PREFIX = 'user-';
const GRID_ENTITY_PREFIX = 'grid-';

function isLayerEnabled(layers: SceneLayerState[] | undefined, id: SceneLayerState['id']): boolean {
  if (!layers) {
    return true;
  }
  const found = layers.find((entry) => entry.id === id);
  return found ? found.enabled : true;
}

function geoToCartesian(point: GeoPoint) {
  return Cartesian3.fromDegrees(point.lon, point.lat, point.height);
}

function pickGeoFromCanvas(widget: SceneWidget, position: Cartesian2): GeoPoint | null {
  const cartesian = widget.scene.pickPosition(position);
  if (!cartesian) {
    return null;
  }
  const carto = Cartographic.fromCartesian(cartesian);
  if (!carto) {
    return null;
  }
  return {
    lon: CesiumMath.toDegrees(carto.longitude),
    lat: CesiumMath.toDegrees(carto.latitude),
    height: carto.height,
  };
}

function clearDraftEntities(widget: SceneWidget) {
  const draftPrefix = `${USER_ENTITY_PREFIX}draft-`;
  const toRemove = widget.entities.values.filter((entity) => entity.id?.toString().startsWith(draftPrefix));
  toRemove.forEach((entity) => widget.entities.remove(entity));
}

function cssWithAlpha(hex: string, alpha: number) {
  return Color.fromCssColorString(hex).withAlpha(alpha);
}

const MARKER_FONT_FAMILY = '"Google Sans", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
const MARKER_FONT_SIZE = 13;
const MARKER_PILL_HEIGHT = 30;
const MARKER_TAIL_HEIGHT = 9;
const MARKER_TAIL_WIDTH = 12;
const MARKER_PADDING_X = 14;
const MARKER_MIN_WIDTH = 60;
const MARKER_MAX_WIDTH = 180;

function makeMarkerBillboard(kind: SceneMarker['kind'], label: string, selected = false): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const dpr = Math.max(window.devicePixelRatio || 1, 2);
  const measure = document.createElement('canvas').getContext('2d');
  let textWidth = MARKER_MIN_WIDTH;
  if (measure) {
    measure.font = `700 ${MARKER_FONT_SIZE}px ${MARKER_FONT_FAMILY}`;
    textWidth = Math.ceil(measure.measureText(label).width);
  }
  const width = Math.min(MARKER_MAX_WIDTH, Math.max(MARKER_MIN_WIDTH, textWidth + MARKER_PADDING_X * 2));
  const height = MARKER_PILL_HEIGHT + MARKER_TAIL_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { canvas, width, height };
  }
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const radius = MARKER_PILL_HEIGHT / 2;
  const pillBottom = MARKER_PILL_HEIGHT;
  const tailHalf = MARKER_TAIL_WIDTH / 2;

  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(width - radius, 0);
  ctx.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(width / 2 + tailHalf, pillBottom);
  ctx.lineTo(width / 2, pillBottom + MARKER_TAIL_HEIGHT);
  ctx.lineTo(width / 2 - tailHalf, pillBottom);
  ctx.lineTo(radius, pillBottom);
  ctx.arc(radius, radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();

  ctx.fillStyle = MARKER_COLORS[kind];
  ctx.shadowColor = 'rgba(11, 31, 84, 0.35)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.lineJoin = 'round';
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? '#fbbc04' : 'rgba(255, 255, 255, 0.95)';
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${MARKER_FONT_SIZE}px ${MARKER_FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, width / 2, MARKER_PILL_HEIGHT / 2 + 0.5);

  return { canvas, width, height };
}

const SELECTION_COLOR = '#fbbc04';
const TOPOLOGY_COLORS = ['#1a73e8', '#34a853', '#ea4335', '#fbbc04', '#a142f4', '#00acc1'];
const TOPOLOGY_PREFIX = `${USER_ENTITY_PREFIX}topology-`;

function parseUserOverlayId(id: string | undefined): SceneOverlaySelection | null {
  if (!id || !id.startsWith(USER_ENTITY_PREFIX) || id.startsWith(TOPOLOGY_PREFIX)) {
    return null;
  }
  const rest = id.slice(USER_ENTITY_PREFIX.length);
  if (rest.startsWith('marker-')) {
    return { kind: 'marker', id: rest.slice('marker-'.length) };
  }
  if (rest.startsWith('measure-')) {
    const trimmed = rest.slice('measure-'.length).replace(/-(line|label)$/, '');
    return { kind: 'measurement', id: trimmed };
  }
  if (rest.startsWith('area-')) {
    const trimmed = rest.slice('area-'.length).replace(/-(poly|edge)$/, '');
    return { kind: 'area', id: trimmed };
  }
  return null;
}

function addMarkerEntity(widget: SceneWidget, marker: SceneMarker, selected = false) {
  const labelText = marker.label ?? marker.kind;
  const { canvas, width, height } = makeMarkerBillboard(marker.kind, labelText, selected);
  const scale = selected ? 1.15 : 1;
  widget.entities.add({
    id: `${USER_ENTITY_PREFIX}marker-${marker.id}`,
    name: labelText,
    position: Cartesian3.fromDegrees(
      marker.position.lon,
      marker.position.lat,
      marker.position.height + 0.4,
    ),
    billboard: {
      image: canvas,
      width: width * scale,
      height: height * scale,
      verticalOrigin: VerticalOrigin.BOTTOM,
      horizontalOrigin: HorizontalOrigin.CENTER,
      pixelOffset: new Cartesian2(0, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function addMeasurementEntity(widget: SceneWidget, entry: SceneMeasurement, selected = false) {
  const start = geoToCartesian(entry.start);
  const end = geoToCartesian(entry.end);
  const clampToGround = entry.mode === 'planar';
  const lineColor = selected ? SELECTION_COLOR : '#0f56e8';
  widget.entities.add({
    id: `${USER_ENTITY_PREFIX}measure-${entry.id}-line`,
    polyline: {
      positions: [start, end],
      width: selected ? 5 : 3,
      material: cssWithAlpha(lineColor, 0.95),
      arcType: clampToGround ? ArcType.GEODESIC : ArcType.NONE,
      depthFailMaterial: cssWithAlpha(lineColor, 0.55),
      clampToGround,
    },
  });
  const midLon = (entry.start.lon + entry.end.lon) / 2;
  const midLat = (entry.start.lat + entry.end.lat) / 2;
  const midHeight = (entry.start.height + entry.end.height) / 2 + 4;
  widget.entities.add({
    id: `${USER_ENTITY_PREFIX}measure-${entry.id}-label`,
    position: Cartesian3.fromDegrees(midLon, midLat, midHeight),
    label: {
      text: `${entry.totalMeters.toFixed(1)} m`,
      font: '700 13px Google Sans, Arial, sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.fromCssColorString(selected ? '#7a5b00' : '#0b1f54'),
      outlineWidth: 3,
      style: LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: VerticalOrigin.CENTER,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function addAreaEntity(widget: SceneWidget, area: SceneArea, selected = false) {
  const positions = area.vertices.map(geoToCartesian);
  if (positions.length < 3) {
    return;
  }
  const colorHex = AREA_COLORS[area.kind];
  widget.entities.add({
    id: `${USER_ENTITY_PREFIX}area-${area.id}-poly`,
    polygon: {
      hierarchy: new PolygonHierarchy(positions),
      material: cssWithAlpha(colorHex, selected ? 0.5 : 0.32),
      outline: false,
      classificationType: ClassificationType.BOTH,
    },
  });
  widget.entities.add({
    id: `${USER_ENTITY_PREFIX}area-${area.id}-edge`,
    polyline: {
      positions: [...positions, positions[0]],
      width: selected ? 5 : 3,
      material: cssWithAlpha(selected ? SELECTION_COLOR : colorHex, 0.95),
      clampToGround: true,
      arcType: ArcType.GEODESIC,
    },
  });
}

function addTopologyEntities(
  widget: SceneWidget,
  center: GeoCenter,
  goals: SimulationGoal[],
  tasks: SimulationTask[],
  devices: SimulationDevice[],
  markers: SceneMarker[],
) {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const markerByTaskId = new Map<string, SceneMarker>();
  markers.forEach((marker) => {
    const taskId = (marker.label ?? '').match(/task[-:\s]*(\S+)/i)?.[1];
    if (taskId) {
      markerByTaskId.set(taskId, marker);
    }
  });
  const tasksByGoal = new Map<string, SimulationTask[]>();
  tasks.forEach((task) => {
    if (!task.goalId) {
      return;
    }
    const list = tasksByGoal.get(task.goalId) ?? [];
    list.push(task);
    tasksByGoal.set(task.goalId, list);
  });

  goals.forEach((goal, goalIndex) => {
    const goalTasks = tasksByGoal.get(goal.id) ?? [];
    const points: GeoPoint[] = [];
    goalTasks.forEach((task) => {
      const markerForTask = markerByTaskId.get(task.id);
      if (markerForTask) {
        points.push(markerForTask.position);
        return;
      }
      if (task.assigneeDeviceId) {
        const device = deviceById.get(task.assigneeDeviceId);
        if (device) {
          points.push(deviceGeoPosition(center, device));
        }
      }
    });
    if (points.length === 0) {
      return;
    }

    const colorHex = TOPOLOGY_COLORS[goalIndex % TOPOLOGY_COLORS.length];
    const centroid: GeoPoint = points.reduce(
      (acc, point) => ({
        lon: acc.lon + point.lon / points.length,
        lat: acc.lat + point.lat / points.length,
        height: acc.height + (point.height + 12) / points.length,
      }),
      { lon: 0, lat: 0, height: 0 },
    );

    points.forEach((point, index) => {
      widget.entities.add({
        id: `${TOPOLOGY_PREFIX}goal-${goal.id}-link-${index}`,
        polyline: {
          positions: [geoToCartesian(centroid), geoToCartesian(point)],
          width: 2,
          material: cssWithAlpha(colorHex, 0.85),
          arcType: ArcType.NONE,
        },
      });
    });

    if (points.length >= 2) {
      widget.entities.add({
        id: `${TOPOLOGY_PREFIX}goal-${goal.id}-hub`,
        polyline: {
          positions: [...points, points[0]].map(geoToCartesian),
          width: 1.5,
          material: cssWithAlpha(colorHex, 0.45),
          arcType: ArcType.GEODESIC,
          clampToGround: true,
        },
      });
    }

    widget.entities.add({
      id: `${TOPOLOGY_PREFIX}goal-${goal.id}-label`,
      position: Cartesian3.fromDegrees(centroid.lon, centroid.lat, centroid.height),
      point: {
        pixelSize: 10,
        color: Color.fromCssColorString(colorHex),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: goal.title,
        font: '700 12px Google Sans, Arial, sans-serif',
        fillColor: Color.WHITE,
        outlineColor: Color.fromCssColorString(colorHex),
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cartesian2(0, -16),
        verticalOrigin: VerticalOrigin.BOTTOM,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  });
}

function addDraftMeasurementMarker(widget: SceneWidget, point: GeoPoint) {
  widget.entities.add({
    id: `${USER_ENTITY_PREFIX}draft-measure-start`,
    position: Cartesian3.fromDegrees(point.lon, point.lat, point.height + 0.3),
    point: {
      pixelSize: 12,
      color: Color.fromCssColorString('#0f56e8'),
      outlineColor: Color.WHITE,
      outlineWidth: 3,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function addDraftAreaEntities(widget: SceneWidget, vertices: GeoPoint[]) {
  if (vertices.length === 0) {
    return;
  }
  vertices.forEach((vertex, index) => {
    widget.entities.add({
      id: `${USER_ENTITY_PREFIX}draft-area-vertex-${index}`,
      position: Cartesian3.fromDegrees(vertex.lon, vertex.lat, vertex.height + 0.3),
      point: {
        pixelSize: 10,
        color: Color.fromCssColorString('#5f6368'),
        outlineColor: Color.WHITE,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  });
  if (vertices.length >= 2) {
    widget.entities.add({
      id: `${USER_ENTITY_PREFIX}draft-area-line`,
      polyline: {
        positions: vertices.map(geoToCartesian),
        width: 2,
        material: cssWithAlpha('#5f6368', 0.85),
        clampToGround: true,
        arcType: ArcType.GEODESIC,
      },
    });
  }
}

function statusForWeather(weather: WorldSnapshot['terrain'], t: (key: string, params?: Record<string, unknown>) => string) {
  const visibility = weather.visibilityM
    ? t('worldScene.weather.visibility', { value: Math.round(weather.visibilityM) })
    : t('worldScene.weather.visibilityNormal');
  const wind = weather.windMps
    ? t('worldScene.weather.windWith', { value: weather.windMps.toFixed(1) })
    : t('worldScene.weather.breeze');
  return `${visibility} / ${wind}`;
}

export function WorldScene({
  cameraPosition,
  cameraTarget,
  cameraMode = 'orbit',
  devicePosition = [2.4, 0.05, 1.2],
  deviceName = 'Device',
  deviceKind = 'humanoid',
  minHeight = 420,
  objects = [],
  devices = [],
  weather = { slopeDeg: 0, weather: 'sunny' },
  showAxes = true,
  hidePrimaryDevice = false,
  tickIntervalMs = 200,
  googleMapsApiKey,
  cesiumIonToken,
  layers,
  sceneSettings,
  activeTool = null,
  onScenePick,
  markers = [],
  measurements = [],
  areas = [],
  goals = [],
  tasks = [],
  draftMeasurementStart = null,
  draftAreaVertices = [],
  selection = null,
  onSelectOverlay,
  onCameraPoseChange,
  focusTarget,
  humanRoamStart,
  onHumanRoamStartPlace,
  onHumanRoamPoseChange,
}: WorldSceneProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<SceneWidget | undefined>(undefined);
  const eventHandlerRef = useRef<ScreenSpaceEventHandler | undefined>(undefined);
  const tilesetRef = useRef<Cesium3DTileset | undefined>(undefined);
  const cameraListenerRef = useRef<(() => void) | undefined>(undefined);
  const activeToolRef = useRef<ActiveTool>(activeTool);
  const onScenePickRef = useRef<typeof onScenePick>(onScenePick);
  const onSelectOverlayRef = useRef<typeof onSelectOverlay>(onSelectOverlay);
  const onCameraPoseChangeRef = useRef<typeof onCameraPoseChange>(onCameraPoseChange);
  const userOverlaySignaturesRef = useRef<{
    markers: Map<string, string>;
    measurements: Map<string, string>;
    areas: Map<string, string>;
  }>({ markers: new Map(), measurements: new Map(), areas: new Map() });
  const topologySignatureRef = useRef<string>('');
  const deviceMotionsRef = useRef<Map<string, DeviceMotion>>(new Map());
  const [status, setStatus] = useState<SceneStatus>(() => ({
    tone: 'loading',
    message: t('worldScene.loadingTiles'),
  }));
  const [selectedEntityName, setSelectedEntityName] = useState<string>();
  const center = useMemo(() => resolveWorldCenter(objects), [objects]);
  const centerKey = `${center.lat.toFixed(6)},${center.lon.toFixed(6)},${Math.round(center.radiusM)}`;
  const cameraKey = `${cameraMode}|${cameraPosition?.join(',') ?? ''}|${cameraTarget?.join(',') ?? ''}|${centerKey}`;
  const minHeightStyle = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
  const resolvedGoogleMapsApiKey = resolveGoogleMapsApiKey(googleMapsApiKey);
  const resolvedCesiumIonToken = resolveCesiumIonToken(cesiumIonToken);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    onScenePickRef.current = onScenePick;
  }, [onScenePick]);

  useEffect(() => {
    onSelectOverlayRef.current = onSelectOverlay;
  }, [onSelectOverlay]);

  useEffect(() => {
    onCameraPoseChangeRef.current = onCameraPoseChange;
  }, [onCameraPoseChange]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    (buildModuleUrl as typeof buildModuleUrl & { setBaseUrl: (value: string) => void }).setBaseUrl(DEFAULT_CESIUM_BASE_URL);
    const googleApiKey = resolvedGoogleMapsApiKey;
    const ionToken = resolvedCesiumIonToken;
    if (googleApiKey) {
      GoogleMaps.defaultApiKey = googleApiKey;
    }
    if (ionToken) {
      Ion.defaultAccessToken = ionToken;
    }

    const widget = new CesiumWidget(containerRef.current, {
      baseLayer: false,
      globe: false,
      scene3DOnly: true,
      shouldAnimate: true,
      skyAtmosphere: false,
      skyBox: false,
      requestRenderMode: false,
      useBrowserRecommendedResolution: false,
    });

    widgetRef.current = widget;
    widget.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
    widget.scene.backgroundColor = Color.fromCssColorString('#d8e7fa');
    widget.scene.screenSpaceCameraController.enableCollisionDetection = true;
    widget.camera.percentageChanged = 0.0005;

    const handler = new ScreenSpaceEventHandler(widget.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const tool = activeToolRef.current;
      if (tool && onScenePickRef.current) {
        const picked = pickGeoFromCanvas(widget, movement.position);
        if (picked) {
          onScenePickRef.current(picked);
          return;
        }
      }
      const pickedEntity = widget.scene.pick(movement.position) as { id?: { id?: string; name?: string } } | undefined;
      const entityId = pickedEntity?.id?.id?.toString();
      setSelectedEntityName(pickedEntity?.id?.name);
      if (!tool && onSelectOverlayRef.current) {
        const overlay = parseUserOverlayId(entityId);
        onSelectOverlayRef.current(overlay);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    eventHandlerRef.current = handler;

    const removeCameraListener = widget.camera.changed.addEventListener(() => {
      if (widget.isDestroyed()) {
        return;
      }
      onCameraPoseChangeRef.current?.({
        heading: CesiumMath.toDegrees(widget.camera.heading),
        pitch: CesiumMath.toDegrees(widget.camera.pitch),
        roll: CesiumMath.toDegrees(widget.camera.roll),
        height: widget.camera.positionCartographic.height,
      });
    });
    cameraListenerRef.current = removeCameraListener;

    let cancelled = false;
    const cleanupCesium = () => {
      cancelled = true;
      if (eventHandlerRef.current && !eventHandlerRef.current.isDestroyed()) {
        eventHandlerRef.current.destroy();
      }
      eventHandlerRef.current = undefined;
      cameraListenerRef.current?.();
      cameraListenerRef.current = undefined;
      tilesetRef.current = undefined;
      widgetRef.current = undefined;
      if (!widget.isDestroyed()) {
        widget.destroy();
      }
    };

    setStatus({
      tone: googleApiKey || ionToken ? 'loading' : 'error',
      message: googleApiKey
        ? t('worldScene.loadingTilesViaGoogle')
        : ionToken
          ? t('worldScene.loadingTilesViaCesium')
          : t('worldScene.missingTileCredential'),
    });

    if (!googleApiKey && !ionToken) {
      return cleanupCesium;
    }

    void createGooglePhotorealistic3DTileset(
      {
        key: googleApiKey,
        onlyUsingWithGoogleGeocoder: true,
      },
      {
        cacheBytes: 768 * 1024 * 1024,
        maximumCacheOverflowBytes: 512 * 1024 * 1024,
        maximumScreenSpaceError: 8,
        dynamicScreenSpaceError: true,
        enableCollision: true,
      },
    )
      .then((tileset) => {
        if (cancelled || widget.isDestroyed()) {
          return;
        }
        widget.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
        setStatus({
          tone: 'ready',
          message: t('worldScene.tilesReady'),
        });
        applyWorldCamera(widget, center, cameraMode, cameraPosition, cameraTarget);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus({
          tone: 'error',
          message: error instanceof Error
            ? t('worldScene.tilesFailedWithMessage', { message: error.message })
            : t('worldScene.tilesFailed'),
        });
      });

    return cleanupCesium;
  }, [resolvedGoogleMapsApiKey, resolvedCesiumIonToken]);

  const showDevicePaths = sceneSettings?.showDevicePaths ?? true;
  const layersKey = useMemo(
    () => (layers ? layers.map((layer) => `${layer.id}:${layer.enabled ? 1 : 0}`).join('|') : 'all'),
    [layers],
  );

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return;
    }

    const pathsOn = isLayerEnabled(layers, 'paths');
    const poisOn = isLayerEnabled(layers, 'pois');
    const devicesOn = isLayerEnabled(layers, 'devices');

    const visibleObjects = pathsOn || poisOn ? objects.slice(0, 160) : [];
    const visibleDevices = devicesOn ? devices.slice(0, 36) : [];

    const desired = new Set<string>();
    if (pathsOn) {
      visibleObjects.forEach((object) => desired.add(`osm-${object.id}`));
    }
    if (poisOn) {
      visibleObjects.forEach((object) => desired.add(`poi-${object.id}`));
    }
    if (devicesOn) {
      visibleDevices.forEach((device) => desired.add(`device-${device.id}`));
      if (!hidePrimaryDevice) {
        desired.add('device-primary-device');
      }
    }

    const toRemove = widget.entities.values.filter((entity) => {
      const id = entity.id?.toString();
      if (!id || id.startsWith(USER_ENTITY_PREFIX) || id.startsWith(GRID_ENTITY_PREFIX)) {
        return false;
      }
      return !desired.has(id);
    });
    toRemove.forEach((entity) => widget.entities.remove(entity));

    if (pathsOn || poisOn) {
      visibleObjects.forEach((object) => {
        if (pathsOn && !widget.entities.getById(`osm-${object.id}`)) {
          addPolylineForObject(widget, object);
        }
        if (poisOn && !widget.entities.getById(`poi-${object.id}`)) {
          addPointForObject(widget, object);
        }
      });
    }
    if (devicesOn) {
      const nowMs = Date.now();
      // 比 tick 间隔略长，确保 CallbackProperty 在下一次 tick 之前完成插值，无视觉断点。
      const motionDurationMs = Math.min(1500, Math.max(200, Math.round(tickIntervalMs * 1.05)));
      const seenIds = new Set<string>();
      visibleDevices.forEach((device, index) => {
        seenIds.add(device.id);
        const selected = cameraMode === 'first_person' && index === 0;
        const existing = widget.entities.getById(`device-${device.id}`);
        const motions = deviceMotionsRef.current;
        if (!existing) {
          motions.set(device.id, makeMotionFromDevice(device, center, nowMs, motionDurationMs));
          addDeviceEntity(
            widget,
            center,
            device,
            selected,
            showDevicePaths,
            () => deviceMotionsRef.current.get(device.id),
          );
          return;
        }
        const prev = motions.get(device.id);
        if (prev) {
          motions.set(device.id, advanceMotionTo(prev, device, center, nowMs, motionDurationMs));
        } else {
          motions.set(device.id, makeMotionFromDevice(device, center, nowMs, motionDurationMs));
        }
        if (existing.polyline) {
          existing.polyline.show = new ConstantProperty(showDevicePaths);
        }
      });
      // 清理已经移除的 device 对应的 motion，避免泄漏。
      deviceMotionsRef.current.forEach((_value, key) => {
        if (!seenIds.has(key)) {
          deviceMotionsRef.current.delete(key);
        }
      });
      if (!hidePrimaryDevice && !widget.entities.getById('device-primary-device')) {
        addPrimaryMarker(widget, center, { deviceName, deviceKind, devicePosition });
      }
    }
    widget.scene.requestRender();
  }, [
    cameraMode,
    centerKey,
    deviceKind,
    deviceName,
    devicePosition,
    devices,
    hidePrimaryDevice,
    layersKey,
    objects,
    resolvedCesiumIonToken,
    resolvedGoogleMapsApiKey,
    showDevicePaths,
    tickIntervalMs,
  ]);

  const showGrid = sceneSettings?.showGrid ?? false;
  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return;
    }

    const stale = widget.entities.values.filter((entity) =>
      entity.id?.toString().startsWith(GRID_ENTITY_PREFIX),
    );
    stale.forEach((entity) => widget.entities.remove(entity));

    if (showGrid) {
      const metersPerLat = 111_320;
      const metersPerLon = Math.max(0.2, Math.cos(CesiumMath.toRadians(center.lat))) * 111_320;
      const stepM = 100;
      const halfLines = 10;
      const halfSpanLat = (halfLines * stepM) / metersPerLat;
      const halfSpanLon = (halfLines * stepM) / metersPerLon;
      const gridMajor = Color.fromCssColorString('#1a73e8').withAlpha(0.55);
      const gridMinor = Color.fromCssColorString('#1a73e8').withAlpha(0.22);

      for (let i = -halfLines; i <= halfLines; i += 1) {
        const isMajor = i === 0;
        const lonOffset = (i * stepM) / metersPerLon;
        widget.entities.add({
          id: `${GRID_ENTITY_PREFIX}ns-${i}`,
          polyline: {
            positions: Cartesian3.fromDegreesArray([
              center.lon + lonOffset, center.lat - halfSpanLat,
              center.lon + lonOffset, center.lat + halfSpanLat,
            ]),
            width: isMajor ? 2 : 1,
            material: isMajor ? gridMajor : gridMinor,
            clampToGround: true,
            classificationType: ClassificationType.BOTH,
            arcType: ArcType.GEODESIC,
          },
        });
        const latOffset = (i * stepM) / metersPerLat;
        widget.entities.add({
          id: `${GRID_ENTITY_PREFIX}ew-${i}`,
          polyline: {
            positions: Cartesian3.fromDegreesArray([
              center.lon - halfSpanLon, center.lat + latOffset,
              center.lon + halfSpanLon, center.lat + latOffset,
            ]),
            width: isMajor ? 2 : 1,
            material: isMajor ? gridMajor : gridMinor,
            clampToGround: true,
            classificationType: ClassificationType.BOTH,
            arcType: ArcType.GEODESIC,
          },
        });
      }
    }

    widget.scene.requestRender();
  }, [showGrid, centerKey]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return;
    }

    const markersOn = isLayerEnabled(layers, 'markers');
    const measurementsOn = isLayerEnabled(layers, 'measurements');
    const areasOn = isLayerEnabled(layers, 'areas');

    const sigs = userOverlaySignaturesRef.current;

    const markerSig = (marker: SceneMarker, isSelected: boolean) =>
      `${marker.kind}|${marker.position.lon.toFixed(7)},${marker.position.lat.toFixed(7)},${marker.position.height.toFixed(3)}|${marker.label ?? ''}|${isSelected ? 1 : 0}`;
    const measurementSig = (entry: SceneMeasurement, isSelected: boolean) =>
      `${entry.mode}|${entry.start.lon.toFixed(7)},${entry.start.lat.toFixed(7)},${entry.start.height.toFixed(3)}|${entry.end.lon.toFixed(7)},${entry.end.lat.toFixed(7)},${entry.end.height.toFixed(3)}|${entry.totalMeters.toFixed(3)}|${isSelected ? 1 : 0}`;
    const areaSig = (area: SceneArea, isSelected: boolean) =>
      `${area.kind}|${area.vertices.map((v) => `${v.lon.toFixed(7)},${v.lat.toFixed(7)},${v.height.toFixed(3)}`).join('-')}|${isSelected ? 1 : 0}`;

    const removeEntity = (entityId: string) => {
      const existing = widget.entities.getById(entityId);
      if (existing) {
        widget.entities.remove(existing);
      }
    };

    const desiredMarkers = new Set<string>();
    if (markersOn) {
      markers.forEach((marker) => {
        const isSelected = selection?.kind === 'marker' && selection.id === marker.id;
        const sig = markerSig(marker, isSelected);
        desiredMarkers.add(marker.id);
        if (sigs.markers.get(marker.id) !== sig) {
          removeEntity(`${USER_ENTITY_PREFIX}marker-${marker.id}`);
          addMarkerEntity(widget, marker, isSelected);
          sigs.markers.set(marker.id, sig);
        }
      });
    }
    Array.from(sigs.markers.keys()).forEach((markerId) => {
      if (!desiredMarkers.has(markerId)) {
        removeEntity(`${USER_ENTITY_PREFIX}marker-${markerId}`);
        sigs.markers.delete(markerId);
      }
    });

    const desiredMeasurements = new Set<string>();
    if (measurementsOn) {
      measurements.forEach((entry) => {
        const isSelected = selection?.kind === 'measurement' && selection.id === entry.id;
        const sig = measurementSig(entry, isSelected);
        desiredMeasurements.add(entry.id);
        if (sigs.measurements.get(entry.id) !== sig) {
          removeEntity(`${USER_ENTITY_PREFIX}measure-${entry.id}-line`);
          removeEntity(`${USER_ENTITY_PREFIX}measure-${entry.id}-label`);
          addMeasurementEntity(widget, entry, isSelected);
          sigs.measurements.set(entry.id, sig);
        }
      });
    }
    Array.from(sigs.measurements.keys()).forEach((entryId) => {
      if (!desiredMeasurements.has(entryId)) {
        removeEntity(`${USER_ENTITY_PREFIX}measure-${entryId}-line`);
        removeEntity(`${USER_ENTITY_PREFIX}measure-${entryId}-label`);
        sigs.measurements.delete(entryId);
      }
    });

    const desiredAreas = new Set<string>();
    if (areasOn) {
      areas.forEach((area) => {
        const isSelected = selection?.kind === 'area' && selection.id === area.id;
        const sig = areaSig(area, isSelected);
        desiredAreas.add(area.id);
        if (sigs.areas.get(area.id) !== sig) {
          removeEntity(`${USER_ENTITY_PREFIX}area-${area.id}-poly`);
          removeEntity(`${USER_ENTITY_PREFIX}area-${area.id}-edge`);
          addAreaEntity(widget, area, isSelected);
          sigs.areas.set(area.id, sig);
        }
      });
    }
    Array.from(sigs.areas.keys()).forEach((areaId) => {
      if (!desiredAreas.has(areaId)) {
        removeEntity(`${USER_ENTITY_PREFIX}area-${areaId}-poly`);
        removeEntity(`${USER_ENTITY_PREFIX}area-${areaId}-edge`);
        sigs.areas.delete(areaId);
      }
    });

    clearDraftEntities(widget);
    if (draftMeasurementStart) {
      addDraftMeasurementMarker(widget, draftMeasurementStart);
    }
    if (draftAreaVertices && draftAreaVertices.length > 0) {
      addDraftAreaEntities(widget, draftAreaVertices);
    }

    widget.scene.requestRender();
  }, [
    layersKey,
    markers,
    measurements,
    areas,
    selection,
    draftMeasurementStart,
    draftAreaVertices,
  ]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return;
    }

    const topologyOn = isLayerEnabled(layers, 'topology');
    const sig = topologyOn
      ? `${goals.map((g) => `${g.id}:${g.title}`).join(';')}|${tasks
          .map((task) => `${task.id}:${task.goalId ?? ''}:${task.assigneeDeviceId ?? ''}`)
          .join(';')}|${devices
          .map((device) => {
            const geo = deviceGeoPosition(center, device);
            return `${device.id}:${geo.lon.toFixed(6)},${geo.lat.toFixed(6)},${geo.height.toFixed(2)}`;
          })
          .join(';')}|${markers
          .map((marker) => `${marker.id}:${marker.label ?? ''}:${marker.position.lon.toFixed(6)},${marker.position.lat.toFixed(6)},${marker.position.height.toFixed(2)}`)
          .join(';')}`
      : '';

    if (sig === topologySignatureRef.current) {
      return;
    }

    const toRemove = widget.entities.values.filter((entity) => {
      const id = entity.id?.toString();
      return !!id && id.startsWith(TOPOLOGY_PREFIX);
    });
    toRemove.forEach((entity) => widget.entities.remove(entity));

    if (topologyOn) {
      addTopologyEntities(widget, center, goals, tasks, devices, markers);
    }
    topologySignatureRef.current = sig;
    widget.scene.requestRender();
  }, [layersKey, goals, tasks, devices, markers, centerKey]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed() || !sceneSettings) {
      return;
    }
    widget.scene.shadowMap.enabled = sceneSettings.shadows;
    if ('highDynamicRange' in widget.scene) {
      (widget.scene as { highDynamicRange?: boolean }).highDynamicRange = sceneSettings.hdr;
    }
    widget.scene.debugShowFramesPerSecond = sceneSettings.showPerformance;
    if (tilesetRef.current) {
      tilesetRef.current.maximumScreenSpaceError = sceneSettings.maxScreenSpaceError;
    }
    widget.scene.requestRender();
  }, [sceneSettings]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed() || !focusTarget) {
      return;
    }
    const range = focusTarget.range ?? 320;
    widget.camera.flyToBoundingSphere(
      new BoundingSphere(Cartesian3.fromDegrees(focusTarget.lon, focusTarget.lat, focusTarget.height), range),
      {
        offset: new HeadingPitchRange(CesiumMath.toRadians(28), CesiumMath.toRadians(-32), range),
        duration: 0.9,
      },
    );
  }, [focusTarget]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return;
    }
    applyWorldCamera(widget, center, cameraMode, cameraPosition, cameraTarget);
  }, [cameraKey, resolvedCesiumIonToken, resolvedGoogleMapsApiKey]);

  const onHumanRoamPoseChangeRef = useRef(onHumanRoamPoseChange);
  useEffect(() => {
    onHumanRoamPoseChangeRef.current = onHumanRoamPoseChange;
  }, [onHumanRoamPoseChange]);

  useEffect(() => {
    if (cameraMode !== 'human_roam' || !humanRoamStart) {
      return undefined;
    }
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return undefined;
    }
    const ssc = widget.scene.screenSpaceCameraController;
    const prev = {
      enableRotate: ssc.enableRotate,
      enableTranslate: ssc.enableTranslate,
      enableZoom: ssc.enableZoom,
      enableTilt: ssc.enableTilt,
      enableLook: ssc.enableLook,
    };
    ssc.enableRotate = false;
    ssc.enableTranslate = false;
    ssc.enableZoom = false;
    ssc.enableTilt = false;
    ssc.enableLook = false;

    const eyeHeight = 1.65;
    const pos = { lon: humanRoamStart.lon, lat: humanRoamStart.lat, height: eyeHeight };
    let yawRad = CesiumMath.toRadians(humanRoamStart.headingDeg ?? 0);
    let pitchRad = 0;

    widget.camera.flyTo({
      destination: Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height),
      orientation: { heading: yawRad, pitch: pitchRad, roll: 0 },
      duration: 0.4,
    });

    const pegmanEntity = widget.entities.add({
      id: 'human-roam-pegman',
      position: Cartesian3.fromDegrees(pos.lon, pos.lat, 0),
      billboard: {
        image: makePegmanIcon(),
        width: 28,
        height: 40,
        verticalOrigin: VerticalOrigin.BOTTOM,
        horizontalOrigin: HorizontalOrigin.CENTER,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(8, 1500),
      },
    });

    const keys = new Set<string>();
    const canvas = widget.scene.canvas;
    let dragging = false;
    let lastClientX = 0;
    let lastClientY = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) {
          return;
        }
      }
      keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.delete(event.code);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return;
      dragging = true;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastClientX;
      const dy = event.clientY - lastClientY;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      const sens = 0.005;
      yawRad -= dx * sens;
      pitchRad -= dy * sens;
      const limit = Math.PI / 2 - 0.01;
      if (pitchRad > limit) pitchRad = limit;
      if (pitchRad < -limit) pitchRad = -limit;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      canvas.releasePointerCapture?.(event.pointerId);
      canvas.style.cursor = 'grab';
    };
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    let lastTime = performance.now();
    const onPreRender = () => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      let forward = 0;
      let strafe = 0;
      let lift = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
      if (keys.has('KeyE') || keys.has('Space')) lift += 1;
      if (keys.has('KeyQ')) lift -= 1;
      const running = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = running ? 8.5 : 2.8;
      const move = dt * speed;

      if (forward !== 0 || strafe !== 0 || lift !== 0) {
        const sin = Math.sin(yawRad);
        const cos = Math.cos(yawRad);
        const east = strafe * cos + forward * sin;
        const north = forward * cos - strafe * sin;
        const metersPerLat = 111_320;
        const metersPerLon = Math.max(0.2, Math.abs(Math.cos(CesiumMath.toRadians(pos.lat)))) * 111_320;
        pos.lon += (east * move) / metersPerLon;
        pos.lat += (north * move) / metersPerLat;
        pos.height = Math.max(0.5, pos.height + lift * move);
      }

      const dest = Cartesian3.fromDegrees(pos.lon, pos.lat, pos.height);
      widget.camera.setView({
        destination: dest,
        orientation: { heading: yawRad, pitch: pitchRad, roll: 0 },
      });
      pegmanEntity.position = Cartesian3.fromDegrees(pos.lon, pos.lat, 0) as unknown as typeof pegmanEntity.position;
      onHumanRoamPoseChangeRef.current?.({
        lon: pos.lon,
        lat: pos.lat,
        height: pos.height,
        headingDeg: CesiumMath.toDegrees(yawRad),
      });
    };

    canvas.style.cursor = 'grab';
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    const removePreRender = widget.scene.preRender.addEventListener(onPreRender);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.style.cursor = '';
      removePreRender();
      widget.entities.remove(pegmanEntity);
      ssc.enableRotate = prev.enableRotate;
      ssc.enableTranslate = prev.enableTranslate;
      ssc.enableZoom = prev.enableZoom;
      ssc.enableTilt = prev.enableTilt;
      ssc.enableLook = prev.enableLook;
    };
  }, [cameraMode, humanRoamStart?.lon, humanRoamStart?.lat, humanRoamStart?.headingDeg]);

  return (
    <div className="cesium-world-scene" style={{ minHeight: minHeightStyle }}>
      <div ref={containerRef} className="cesium-world-scene-canvas" />
      {status.tone !== 'ready' ? (
        <div className={`cesium-world-scene-status cesium-world-scene-status-${status.tone}`} role="status">
          <strong>{status.message}</strong>
          <span>{center.lat.toFixed(5)}, {center.lon.toFixed(5)} / {statusForWeather(weather, t)}</span>
        </div>
      ) : null}
      {showAxes ? (
        <div className="cesium-world-scene-coordinate" aria-label={t('worldScene.coordSystemAria')}>
          <span>WGS84</span>
          <span>3D Tiles</span>
        </div>
      ) : null}
      {selectedEntityName ? (
        <div className="cesium-world-scene-picked">
          {selectedEntityName}
        </div>
      ) : null}
      {onHumanRoamStartPlace ? (
        <PegmanDraggable
          onDrop={(clientX, clientY) => {
            const widget = widgetRef.current;
            if (!widget || widget.isDestroyed()) return;
            const rect = widget.scene.canvas.getBoundingClientRect();
            const localX = clientX - rect.left;
            const localY = clientY - rect.top;
            if (localX < 0 || localY < 0 || localX > rect.width || localY > rect.height) return;
            const picked = widget.scene.pickPosition(new Cartesian2(localX, localY));
            if (!picked) return;
            const carto = Cartographic.fromCartesian(picked);
            if (!carto) return;
            onHumanRoamStartPlace({
              lon: CesiumMath.toDegrees(carto.longitude),
              lat: CesiumMath.toDegrees(carto.latitude),
            });
          }}
        />
      ) : null}
      {sceneSettings?.showPerformance ? <PerformanceHud /> : null}
      {cameraMode === 'human_roam' && humanRoamStart ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 14,
            zIndex: 6,
            transform: 'translateX(-50%)',
            border: '1px solid #d7e3fb',
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.92)',
            padding: '6px 14px',
            color: '#1a1f3c',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 18px rgba(11, 31, 84, 0.12)',
            pointerEvents: 'none',
          }}
        >
          WSAD 行走 · Q/E 升降 · Space 跳 · Shift 跑 · 按住鼠标拖拽看四周
        </div>
      ) : null}
    </div>
  );
}

function PerformanceHud() {
  const [stats, setStats] = useState<{ fps: number; memMb: number }>({ fps: 0, memMb: 0 });
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let lastUpdate = performance.now();
    const tick = (now: number) => {
      frames += 1;
      const elapsed = now - lastUpdate;
      if (elapsed >= 500) {
        const fps = (frames * 1000) / elapsed;
        const mem = (performance as { memory?: { usedJSHeapSize: number } }).memory;
        const memMb = mem ? mem.usedJSHeapSize / 1024 / 1024 : 0;
        setStats({ fps, memMb });
        frames = 0;
        lastUpdate = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="cesium-world-scene-perfhud" role="status" aria-live="off">
      <span>FPS {stats.fps.toFixed(0)}</span>
      {stats.memMb > 0 ? <span>JS {stats.memMb.toFixed(0)} MB</span> : null}
    </div>
  );
}

interface PegmanDraggableProps {
  onDrop: (clientX: number, clientY: number) => void;
}

function PegmanDraggable({ onDrop }: PegmanDraggableProps) {
  const [dragging, setDragging] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event: PointerEvent) => {
      setPointer({ x: event.clientX, y: event.clientY });
    };
    const onUp = (event: PointerEvent) => {
      setDragging(false);
      setPointer(null);
      onDrop(event.clientX, event.clientY);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, onDrop]);
  return (
    <>
      <button
        type="button"
        title="拖拽小人到地图任意位置进入街景漫游"
        style={{
          position: 'absolute',
          right: 22,
          bottom: 220,
          zIndex: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 44,
          height: 56,
          border: '1px solid #d7e3fb',
          borderRadius: 10,
          background: 'rgba(255, 255, 255, 0.95)',
          boxShadow: '0 8px 22px rgba(11, 31, 84, 0.18)',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          padding: 0,
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          setPointer({ x: event.clientX, y: event.clientY });
          setDragging(true);
        }}
      >
        <PegmanGlyph />
      </button>
      {dragging && pointer ? (
        <div
          style={{
            position: 'fixed',
            left: pointer.x,
            top: pointer.y,
            zIndex: 9999,
            pointerEvents: 'none',
            transform: 'translate(-50%, -90%)',
            filter: 'drop-shadow(0 6px 10px rgba(0, 0, 0, 0.3))',
          }}
        >
          <PegmanGlyph />
        </div>
      ) : null}
    </>
  );
}

function PegmanGlyph() {
  return (
    <svg width="28" height="40" viewBox="0 0 56 80" aria-hidden="true">
      <ellipse cx="28" cy="76" rx="14" ry="4" fill="rgba(11,31,84,0.28)" />
      <circle cx="28" cy="14" r="10" fill="#fbbc04" stroke="#202124" strokeWidth="1.6" />
      <path d="M16 28 L40 28 L36 54 L20 54 Z" fill="#1a73e8" stroke="#0b1f54" strokeWidth="1.4" />
      <path d="M22 54 L20 72 M34 54 L36 72" stroke="#202124" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
