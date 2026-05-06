import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CesiumWidget as CesiumWidgetType } from '@cesium/engine';
import ArcType from '@cesium/engine/Source/Core/ArcType.js';
import BoundingSphere from '@cesium/engine/Source/Core/BoundingSphere.js';
import Cartesian2 from '@cesium/engine/Source/Core/Cartesian2.js';
import Cartesian3 from '@cesium/engine/Source/Core/Cartesian3.js';
import Color from '@cesium/engine/Source/Core/Color.js';
import DistanceDisplayCondition from '@cesium/engine/Source/Core/DistanceDisplayCondition.js';
import GoogleMaps from '@cesium/engine/Source/Core/GoogleMaps.js';
import HeadingPitchRange from '@cesium/engine/Source/Core/HeadingPitchRange.js';
import HeadingPitchRoll from '@cesium/engine/Source/Core/HeadingPitchRoll.js';
import Ion from '@cesium/engine/Source/Core/Ion.js';
import CesiumMath from '@cesium/engine/Source/Core/Math.js';
import NearFarScalar from '@cesium/engine/Source/Core/NearFarScalar.js';
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
import type { SimulationDevice, WorldObject, WorldSnapshot } from '../types';
import djiMavicUrl from '../../assets/models/DJI_Mavic.glb';

export interface WorldSceneProps {
  children?: ReactNode;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  cameraMode?: 'orbit' | 'first_person';
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
const MISSING_TILE_CREDENTIAL_MESSAGE = '缺少 Google Maps API key；请在 config/maps.toml 的 [google_maps].api_key 或 PUBLIC_GOOGLE_MAPS_API_KEY 环境变量配置。PUBLIC_CESIUM_ION_TOKEN 仅为可选备用。';
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

function cameraGeoFromScenePosition(center: GeoCenter, position: [number, number, number]) {
  return worldOffsetToLonLat(center, position, Math.max(4, position[1] * 10 + 8));
}

function makeDeviceCanvas(device: SimulationDevice, selected: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (!context) {
    return canvas;
  }

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

function addDeviceEntity(widget: SceneWidget, center: GeoCenter, device: SimulationDevice, selected: boolean) {
  const geo = deviceGeoPosition(center, device);
  const heading = CesiumMath.toRadians(90 - device.telemetry.headingDeg);
  const position = entityPositionFromGeo(geo);
  const isDrone = device.kind === 'drone';
  widget.entities.add({
    id: `device-${device.id}`,
    name: device.name,
    position,
    orientation: Transforms.headingPitchRollQuaternion(position, new HeadingPitchRoll(heading, 0, 0)),
    model: isDrone ? {
      uri: djiMavicUrl,
      scale: 0.7,
      minimumPixelSize: 42,
      maximumScale: 80,
      heightReference: HeightReference.NONE,
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
      positions: [
        Cartesian3.fromDegrees(geo.lon, geo.lat, 0),
        Cartesian3.fromDegrees(geo.lon, geo.lat, geo.height),
      ],
      width: 2,
      material: DEVICE_COLORS[device.kind].withAlpha(0.55),
      arcType: ArcType.NONE,
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
  widget.camera.flyTo({
    destination,
    orientation: {
      direction: Cartesian3.normalize(
        Cartesian3.subtract(Cartesian3.fromDegrees(target.lon, target.lat, target.height), destination, new Cartesian3()),
        new Cartesian3(),
      ),
      up: Cartesian3.UNIT_Z,
    },
    duration: 0.8,
  });
}

function applyWorldCamera(widget: SceneWidget, center: GeoCenter, mode: WorldSceneProps['cameraMode'], cameraPosition?: [number, number, number], cameraTarget?: [number, number, number]) {
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

function statusForWeather(weather: WorldSnapshot['terrain']) {
  const visibility = weather.visibilityM ? `能见度 ${Math.round(weather.visibilityM)}m` : '能见度正常';
  const wind = weather.windMps ? `风速 ${weather.windMps.toFixed(1)}m/s` : '微风';
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
  googleMapsApiKey,
  cesiumIonToken,
}: WorldSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<SceneWidget | undefined>(undefined);
  const eventHandlerRef = useRef<ScreenSpaceEventHandler | undefined>(undefined);
  const [status, setStatus] = useState<SceneStatus>({
    tone: 'loading',
    message: '正在加载 Google Photorealistic 3D Tiles...',
  });
  const [selectedEntityName, setSelectedEntityName] = useState<string>();
  const center = useMemo(() => resolveWorldCenter(objects), [objects]);
  const centerKey = `${center.lat.toFixed(6)},${center.lon.toFixed(6)},${Math.round(center.radiusM)}`;
  const cameraKey = `${cameraMode}|${cameraPosition?.join(',') ?? ''}|${cameraTarget?.join(',') ?? ''}|${centerKey}`;
  const minHeightStyle = typeof minHeight === 'number' ? `${minHeight}px` : minHeight;
  const resolvedGoogleMapsApiKey = resolveGoogleMapsApiKey(googleMapsApiKey);
  const resolvedCesiumIonToken = resolveCesiumIonToken(cesiumIonToken);

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
      useBrowserRecommendedResolution: true,
    });

    widgetRef.current = widget;
    widget.scene.backgroundColor = Color.fromCssColorString('#d8e7fa');
    widget.scene.screenSpaceCameraController.enableCollisionDetection = true;

    const handler = new ScreenSpaceEventHandler(widget.scene.canvas);
    handler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = widget.scene.pick(movement.position) as { id?: { name?: string } } | undefined;
      setSelectedEntityName(picked?.id?.name);
    }, ScreenSpaceEventType.LEFT_CLICK);
    eventHandlerRef.current = handler;

    let cancelled = false;
    const cleanupCesium = () => {
      cancelled = true;
      if (eventHandlerRef.current && !eventHandlerRef.current.isDestroyed()) {
        eventHandlerRef.current.destroy();
      }
      eventHandlerRef.current = undefined;
      widgetRef.current = undefined;
      if (!widget.isDestroyed()) {
        widget.destroy();
      }
    };

    setStatus({
      tone: googleApiKey || ionToken ? 'loading' : 'error',
      message: googleApiKey
        ? '正在通过 Google Maps API 加载真实 3D 城市网格...'
        : ionToken
          ? '未配置 Google Maps API key，尝试通过 Cesium ion 加载 Google 3D Tiles...'
          : MISSING_TILE_CREDENTIAL_MESSAGE,
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
        setStatus({
          tone: 'ready',
          message: 'Google Photorealistic 3D Tiles 已接入',
        });
        applyWorldCamera(widget, center, cameraMode, cameraPosition, cameraTarget);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus({
          tone: 'error',
          message: error instanceof Error ? `Google 3D Tiles 加载失败：${error.message}` : 'Google 3D Tiles 加载失败',
        });
      });

    return cleanupCesium;
  }, [resolvedGoogleMapsApiKey, resolvedCesiumIonToken]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return;
    }

    widget.entities.removeAll();
    objects.slice(0, 160).forEach((object) => {
      addPolylineForObject(widget, object);
      addPointForObject(widget, object);
    });
    devices.slice(0, 36).forEach((device, index) => addDeviceEntity(widget, center, device, cameraMode === 'first_person' && index === 0));
    if (!hidePrimaryDevice) {
      addPrimaryMarker(widget, center, { deviceName, deviceKind, devicePosition });
    }
    widget.scene.requestRender();
  }, [cameraMode, center, deviceKind, deviceName, devicePosition, devices, hidePrimaryDevice, objects, resolvedCesiumIonToken, resolvedGoogleMapsApiKey]);

  useEffect(() => {
    const widget = widgetRef.current;
    if (!widget || widget.isDestroyed()) {
      return;
    }
    applyWorldCamera(widget, center, cameraMode, cameraPosition, cameraTarget);
  }, [cameraKey, resolvedCesiumIonToken, resolvedGoogleMapsApiKey]);

  return (
    <div className="cesium-world-scene" style={{ minHeight: minHeightStyle }}>
      <div ref={containerRef} className="cesium-world-scene-canvas" />
      <div className={`cesium-world-scene-status cesium-world-scene-status-${status.tone}`} role="status">
        <strong>{status.message}</strong>
        <span>{center.lat.toFixed(5)}, {center.lon.toFixed(5)} / {statusForWeather(weather)}</span>
      </div>
      {showAxes ? (
        <div className="cesium-world-scene-coordinate" aria-label="地理坐标系">
          <span>WGS84</span>
          <span>3D Tiles</span>
        </div>
      ) : null}
      {selectedEntityName ? (
        <div className="cesium-world-scene-picked">
          {selectedEntityName}
        </div>
      ) : null}
    </div>
  );
}
