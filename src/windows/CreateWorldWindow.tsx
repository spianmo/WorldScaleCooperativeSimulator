import { getCurrentWindow } from '@tauri-apps/api/window';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiCloud,
  FiCloudDrizzle,
  FiCloudRain,
  FiCompass,
  FiCrop,
  FiInfo,
  FiMinus,
  FiPlus,
  FiSave,
  FiSearch,
  FiSun,
  FiWind,
  FiX,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../state';
import type { GenerateWorldInput, UpdateWorldSettingsInput } from '../api';
import type { WorldSnapshot } from '../types';
import { getConfiguredGoogleMapsApiKey, loadGoogleMapsLibraries } from '../utils';
import terminalLogoMarkUrl from '../../assets/design/logo.png';
import terminalMapReferenceUrl from '../../assets/design/terminal-map-reference.png';

type WeatherPreset = 'sunny' | 'cloudy' | 'overcast' | 'light_rain' | 'heavy_rain' | 'foggy';
type TerrainSource = 'srtm' | 'aster' | 'custom_dem';
type ViewMode = 'satellite' | 'street' | 'terrain' | 'building' | 'night';

function buildDefaultStreetSpec(t: (key: string) => string) {
  return {
    name: t('createWorldWindow.defaultSpec.name'),
    description: '',
    searchText: t('createWorldWindow.defaultSpec.searchText'),
    streetAddress: t('createWorldWindow.defaultSpec.streetAddress'),
    district: t('createWorldWindow.defaultSpec.district'),
    latitude: 22.293410,
    longitude: 114.169920,
    radiusM: 150,
    dataSource: 'Google Photorealistic 3D Tiles',
    previewQuality: 'high' as const,
    worldTime: '2024-05-24 14:32:18',
    weather: 'sunny' as WeatherPreset,
    terrainSource: 'srtm' as TerrainSource,
  };
}

const layerGroupConfig = [
  {
    titleKey: 'createWorldWindow.layerGroups.base',
    items: ['road', 'building', 'water', 'green', 'terrain'],
  },
  {
    titleKey: 'createWorldWindow.layerGroups.semantic',
    items: ['sidewalk', 'bike', 'trafficSign', 'poi'],
  },
  {
    titleKey: 'createWorldWindow.layerGroups.enhanced',
    items: ['building3d', 'tree3d', 'roadFurniture3d'],
  },
] as const;

const viewModeIds: ViewMode[] = ['satellite', 'street', 'terrain', 'building', 'night'];

const terrainSourceIds: TerrainSource[] = ['srtm', 'aster', 'custom_dem'];

const weatherPresetConfig: Array<{ id: WeatherPreset; icon: ReactElement }> = [
  { id: 'sunny', icon: <FiSun /> },
  { id: 'cloudy', icon: <FiCloud /> },
  { id: 'overcast', icon: <FiCloud /> },
  { id: 'light_rain', icon: <FiCloudDrizzle /> },
  { id: 'heavy_rain', icon: <FiCloudRain /> },
  { id: 'foggy', icon: <FiWind /> },
];

type StepId = 1 | 2 | 3;

const stepIds: StepId[] = [1, 2, 3];
const stepKeyById: Record<StepId, string> = {
  1: 'createWorldWindow.steps.select',
  2: 'createWorldWindow.steps.settings',
  3: 'createWorldWindow.steps.confirm',
};
const METERS_PER_LAT_DEGREE = 111_320;
const MIN_RADIUS_M = 50;
const MAX_RADIUS_M = 3_000;
const ZOOM_STEP_FACTOR = 0.82;
const VIEWPORT_PADDING = { top: 56, right: 56, bottom: 56, left: 56 };

const viewModeToGoogleMapTypeId: Record<ViewMode, GoogleMapsMapTypeId> = {
  satellite: 'satellite',
  street: 'roadmap',
  terrain: 'terrain',
  building: 'hybrid',
  night: 'roadmap',
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseWorldTime(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return null;
  }
  const [, y, mo, d, h, mi, s = '0'] = match;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

function formatWorldTime(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeLongitude(value: number) {
  if (value > 180) {
    return value - 360;
  }

  if (value < -180) {
    return value + 360;
  }

  return value;
}

function estimateRadiusFromBounds(bounds: GoogleMapsLatLngBounds) {
  const center = bounds.getCenter();
  const northEast = bounds.getNorthEast();
  const southWest = bounds.getSouthWest();
  const centerLatRad = center.lat() * Math.PI / 180;
  const halfLatM = Math.abs(northEast.lat() - southWest.lat()) * METERS_PER_LAT_DEGREE / 2;
  const halfLonM = Math.abs(northEast.lng() - southWest.lng()) * METERS_PER_LAT_DEGREE * Math.cos(centerLatRad) / 2;
  return clamp(Math.round(Math.max(halfLatM, halfLonM)), MIN_RADIUS_M, MAX_RADIUS_M);
}

function createBoundsFromRadius(lat: number, lon: number, radiusM: number): GoogleMapsBoundsLiteral {
  const latDelta = radiusM / METERS_PER_LAT_DEGREE;
  const lonDelta = radiusM / (METERS_PER_LAT_DEGREE * Math.max(0.18, Math.cos(lat * Math.PI / 180)));

  return {
    north: clamp(lat + latDelta, -89.99, 89.99),
    south: clamp(lat - latDelta, -89.99, 89.99),
    east: normalizeLongitude(lon + lonDelta),
    west: normalizeLongitude(lon - lonDelta),
  };
}

function zoomFromRadius(radiusM: number) {
  return clamp(Math.round(21 - Math.log2(radiusM / 60)), 12, 21);
}

function googleMapsSizeLabel(t: (key: string) => string) {
  return getConfiguredGoogleMapsApiKey()
    ? t('createWorldWindow.statusGoogleMapsConfigured')
    : t('createWorldWindow.statusGoogleMapsMissing');
}

function buildStaticMapThumbnailUrl(mode: ViewMode, lat: number, lon: number, apiKey: string) {
  const center = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const base = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=160x80&scale=2&key=${encodeURIComponent(apiKey)}`;
  switch (mode) {
    case 'satellite':
      return `${base}&maptype=satellite`;
    case 'street':
      return `${base}&maptype=roadmap`;
    case 'terrain':
      return `${base}&maptype=terrain`;
    case 'building':
      return `${base}&maptype=hybrid`;
    case 'night':
      return `${base}&maptype=roadmap&style=invert_lightness:true`;
  }
}

function detectMode(): 'create' | 'edit' {
  if (typeof window === 'undefined') return 'create';
  const hash = window.location.hash;
  const queryStart = hash.indexOf('?');
  if (queryStart < 0) return 'create';
  const params = new URLSearchParams(hash.slice(queryStart + 1));
  return params.get('mode') === 'edit' ? 'edit' : 'create';
}

function weatherFromSnapshot(weather: WorldSnapshot['terrain']['weather']): WeatherPreset {
  switch (weather) {
    case 'cloudy':
      return 'cloudy';
    case 'rainy':
      return 'light_rain';
    case 'foggy':
      return 'foggy';
    case 'stormy':
      return 'heavy_rain';
    case 'windy':
    case 'sunny':
    default:
      return 'sunny';
  }
}

function parseFloatSafe(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function CreateWorldWindow() {
  const { t } = useTranslation();
  const { state, generateWorld, updateWorldSettings, appendLog } = useSimulation();
  const mode = useMemo<'create' | 'edit'>(() => detectMode(), []);
  const isEditMode = mode === 'edit';
  const defaultStreetSpec = useMemo(() => buildDefaultStreetSpec(t), [t]);
  const initialSpec = useMemo(() => {
    if (!isEditMode) return defaultStreetSpec;
    const meta = state.world.metadata ?? {};
    return {
      ...defaultStreetSpec,
      name: state.world.name || defaultStreetSpec.name,
      description: state.world.description || defaultStreetSpec.description,
      searchText: meta.street_address || defaultStreetSpec.searchText,
      streetAddress: meta.street_address || defaultStreetSpec.streetAddress,
      district: meta.district || defaultStreetSpec.district,
      latitude: parseFloatSafe(meta.center_lat, defaultStreetSpec.latitude),
      longitude: parseFloatSafe(meta.center_lon, defaultStreetSpec.longitude),
      radiusM: parseFloatSafe(meta.radius_m, defaultStreetSpec.radiusM),
      dataSource: meta.data_source || defaultStreetSpec.dataSource,
      worldTime: meta.world_time || defaultStreetSpec.worldTime,
      weather: weatherFromSnapshot(state.world.terrain.weather),
      terrainSource: (meta.terrain_source as TerrainSource) || defaultStreetSpec.terrainSource,
    };
    // 仅在挂载时一次性吸收当前世界（编辑窗口是独立子窗口）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);
  const initialPhysicsSpec = useMemo(() => {
    if (!isEditMode) return { weatherStrength: 20, timeSpeed: 1, windSpeed: 5, lightHour: 14.53 };
    const meta = state.world.metadata ?? {};
    return {
      weatherStrength: Math.round(parseFloatSafe(meta.weather_strength_pct, 20)),
      timeSpeed: parseFloatSafe(meta.time_speed, 1),
      windSpeed: parseFloatSafe(meta.wind_speed_mps, state.world.terrain.windMps ?? 5),
      lightHour: parseFloatSafe(meta.light_hour, 14.53),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);
  const [name, setName] = useState(initialSpec.name);
  const [description, setDescription] = useState(initialSpec.description);
  const [searchText, setSearchText] = useState(initialSpec.searchText);
  const [streetAddress, setStreetAddress] = useState(initialSpec.streetAddress);
  const [district, setDistrict] = useState(initialSpec.district);
  const [latitude, setLatitude] = useState(initialSpec.latitude);
  const [longitude, setLongitude] = useState(initialSpec.longitude);
  const [radiusM, setRadiusM] = useState(initialSpec.radiusM);
  const [dataSource] = useState(initialSpec.dataSource);
  const [previewQuality] = useState(initialSpec.previewQuality);
  const [worldTime, setWorldTime] = useState(initialSpec.worldTime);
  const [terrainSource, setTerrainSource] = useState(initialSpec.terrainSource);
  const [weather, setWeather] = useState(initialSpec.weather);
  const [viewMode, setViewMode] = useState<ViewMode>('satellite');
  const [weatherStrength, setWeatherStrength] = useState(initialPhysicsSpec.weatherStrength);
  const [timeSpeed, setTimeSpeed] = useState(initialPhysicsSpec.timeSpeed);
  const [windSpeed, setWindSpeed] = useState(initialPhysicsSpec.windSpeed);
  const [lightHour, setLightHour] = useState(initialPhysicsSpec.lightHour);
  const [status, setStatus] = useState(() => t('createWorldWindow.statusGoogleMapsLoading'));
  const [mapStatus, setMapStatus] = useState(() => googleMapsSizeLabel(t));
  const [isMapReady, setIsMapReady] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepId>(1);
  const [submitted, setSubmitted] = useState(false);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [errorDetail, setErrorDetail] = useState<{ summary: string; detail: string } | null>(null);
  const [currentZoom, setCurrentZoom] = useState<number>(() => zoomFromRadius(150));
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<GoogleMapsMap | null>(null);
  const selectionRectangleRef = useRef<GoogleMapsRectangle | null>(null);
  const geocoderRef = useRef<GoogleMapsGeocoder | null>(null);
  const drawingManagerRef = useRef<GoogleMapsDrawingManager | null>(null);
  const drawingOverlayTypeRef = useRef<string>('rectangle');
  const isSyncingRectangleRef = useRef(false);
  const isRectangleDrivenUpdateRef = useRef(false);

  const preview = useMemo(() => {
    const areaKm2 = Math.max(0.1, Math.PI * (radiusM / 1000) ** 2);
    const density = radiusM <= 400 ? 0.18 : radiusM <= 1_000 ? 0.24 : 0.32;
    return {
      areaKm2,
      roads: Math.round(radiusM / 62),
      buildings: Math.round(radiusM * density),
      pois: Math.max(4, Math.round(radiusM / 130)),
      density,
      zoomLevel: zoomFromRadius(radiusM),
      altitudeM: Math.max(6, Math.round(radiusM / 70)),
    };
  }, [radiusM]);

  const mapThumbnailUrls = useMemo(() => {
    const apiKey = getConfiguredGoogleMapsApiKey();
    if (!apiKey) {
      return null;
    }
    return viewModeIds.reduce<Record<ViewMode, string>>((acc, modeId) => {
      acc[modeId] = buildStaticMapThumbnailUrl(modeId, latitude, longitude, apiKey);
      return acc;
    }, {} as Record<ViewMode, string>);
  }, [latitude, longitude]);

  useEffect(() => {
    let isDisposed = false;
    const listeners: GoogleMapsListener[] = [];

    async function initializeMap() {
      if (!mapContainerRef.current) {
        return;
      }

      try {
        const maps = await loadGoogleMapsLibraries(['maps', 'geocoding']);
        if (isDisposed || !mapContainerRef.current) {
          return;
        }

        const initialCenter = { lat: latitude, lng: longitude };
        const initialBounds = createBoundsFromRadius(latitude, longitude, radiusM);
        const map = new maps.Map(mapContainerRef.current, {
          center: initialCenter,
          zoom: preview.zoomLevel,
          mapTypeId: viewModeToGoogleMapTypeId[viewMode],
          clickableIcons: true,
          disableDefaultUI: true,
          fullscreenControl: false,
          gestureHandling: 'greedy',
          mapTypeControl: false,
          scaleControl: true,
          streetViewControl: false,
          zoomControl: false,
        });
        const selectionRectangle = new maps.Rectangle({
          bounds: initialBounds,
          draggable: true,
          editable: true,
          fillColor: '#1a73e8',
          fillOpacity: 0.18,
          map,
          strokeColor: '#1a73e8',
          strokeOpacity: 0.94,
          strokeWeight: 3,
        });
        // 让初始选区在视口内留出 padding，保证选框始终小于视口
        map.fitBounds(initialBounds, VIEWPORT_PADDING);

        googleMapRef.current = map;
        selectionRectangleRef.current = selectionRectangle;
        geocoderRef.current = new maps.Geocoder();

        // Rectangle 是真实选择区域。拖动、缩放或编辑边界时同步中心点和半径。
        listeners.push(selectionRectangle.addListener('bounds_changed', () => {
          if (isSyncingRectangleRef.current) {
            return;
          }

          const bounds = selectionRectangle.getBounds();
          if (!bounds) {
            return;
          }

          const center = bounds.getCenter();
          isRectangleDrivenUpdateRef.current = true;
          setLatitude(Number(center.lat().toFixed(6)));
          setLongitude(Number(center.lng().toFixed(6)));
          setRadiusM(estimateRadiusFromBounds(bounds));
          setStatus(t('createWorldWindow.statusRectangleUpdated'));
        }));
        listeners.push(map.addListener('click', (event?: GoogleMapsMapMouseEvent) => {
          if (!event?.latLng) {
            return;
          }

          const lat = Number(event.latLng.lat().toFixed(6));
          const lng = Number(event.latLng.lng().toFixed(6));
          setLatitude(lat);
          setLongitude(lng);
          setStatus(t('createWorldWindow.statusMapClicked'));
        }));
        listeners.push(map.addListener('zoom_changed', () => {
          const z = map.getZoom();
          if (typeof z === 'number') {
            setCurrentZoom(z);
          }
        }));

        // 异步加载 drawing 库，加载失败不阻断主流程，仅禁用拖拉绘制
        try {
          const drawingLib = (await maps.importLibrary('drawing')) as GoogleMapsDrawingLibrary;
          if (!isDisposed && drawingLib?.DrawingManager) {
            drawingOverlayTypeRef.current = drawingLib.OverlayType?.RECTANGLE ?? 'rectangle';
            const drawingManager = new drawingLib.DrawingManager({
              drawingMode: null,
              drawingControl: false,
              rectangleOptions: {
                draggable: false,
                editable: false,
                clickable: false,
                fillColor: '#1a73e8',
                fillOpacity: 0.18,
                strokeColor: '#1a73e8',
                strokeOpacity: 0.94,
                strokeWeight: 3,
              },
            });
            drawingManager.setMap(map);
            drawingManagerRef.current = drawingManager;

            listeners.push(drawingManager.addListener('rectanglecomplete', (drawnRect) => {
              const drawnBounds = drawnRect.getBounds();
              drawnRect.setMap(null);
              drawingManager.setDrawingMode(null);
              setIsDrawingMode(false);
              if (!drawnBounds) {
                return;
              }
              const ne = drawnBounds.getNorthEast();
              const sw = drawnBounds.getSouthWest();
              const newBoundsLiteral: GoogleMapsBoundsLiteral = {
                north: ne.lat(),
                south: sw.lat(),
                east: ne.lng(),
                west: sw.lng(),
              };
              const center = drawnBounds.getCenter();
              isRectangleDrivenUpdateRef.current = true;
              selectionRectangleRef.current?.setBounds(newBoundsLiteral);
              setLatitude(Number(center.lat().toFixed(6)));
              setLongitude(Number(center.lng().toFixed(6)));
              setRadiusM(estimateRadiusFromBounds(drawnBounds));
              setStatus(t('createWorldWindow.statusRectangleDrawn'));
            }));
          }
        } catch {
          // Drawing 库不可用时静默回退到基本编辑能力
        }

        setIsMapReady(true);
        setMapStatus(t('createWorldWindow.statusGoogleMapsReady'));
        setStatus(t('createWorldWindow.statusRectangleHint'));
      } catch (error) {
        const message = error instanceof Error ? error.message : t('createWorldWindow.statusGoogleMapsLoadFailed');
        setIsMapReady(false);
        setMapStatus(message);
        setStatus(message);
      }
    }

    void initializeMap();

    return () => {
      isDisposed = true;
      listeners.forEach((listener) => listener.remove());
      if (selectionRectangleRef.current && window.google?.maps.event) {
        window.google.maps.event.clearInstanceListeners(selectionRectangleRef.current);
      }
      if (googleMapRef.current && window.google?.maps.event) {
        window.google.maps.event.clearInstanceListeners(googleMapRef.current);
      }
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        if (window.google?.maps.event) {
          window.google.maps.event.clearInstanceListeners(drawingManagerRef.current);
        }
        drawingManagerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    googleMapRef.current?.setMapTypeId(viewModeToGoogleMapTypeId[viewMode]);
  }, [viewMode]);

  useEffect(() => {
    const map = googleMapRef.current;
    const rectangle = selectionRectangleRef.current;
    if (!map || !rectangle) {
      return;
    }

    if (isRectangleDrivenUpdateRef.current) {
      isRectangleDrivenUpdateRef.current = false;
      return;
    }

    isSyncingRectangleRef.current = true;
    const nextBounds = createBoundsFromRadius(latitude, longitude, radiusM);
    rectangle.setBounds(nextBounds);
    // fitBounds 自动选择合适的 zoom，让矩形带 padding 完全位于视口内
    map.fitBounds(nextBounds, VIEWPORT_PADDING);
    window.setTimeout(() => {
      isSyncingRectangleRef.current = false;
    }, 0);
  }, [latitude, longitude, radiusM]);

  const locateCurrentPosition = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus(t('createWorldWindow.statusGeoUnavailable'));
      return;
    }

    setStatus(t('createWorldWindow.statusGeoResolving'));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude.toFixed(6));
        const lng = Number(position.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        googleMapRef.current?.setCenter({ lat, lng });
        if (geocoderRef.current) {
          void geocoderRef.current.geocode({ location: { lat, lng } })
            .then(({ results }) => {
              const address = results[0]?.formatted_address;
              if (address) {
                setStreetAddress(address);
                setDistrict(address);
              }
            })
            .catch(() => undefined);
        }
        setStatus(t('createWorldWindow.statusGeoResolved', { lat: lat.toFixed(6), lon: lng.toFixed(6) }));
      },
      (error) => {
        setStatus(t('createWorldWindow.statusGeoFailed', {
          message: error.message || t('createWorldWindow.statusGeoFailedFallback'),
        }));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  };

  const searchRegion = () => {
    const query = searchText.trim();
    if (!query) {
      setStatus(t('createWorldWindow.statusEmptyQuery'));
      return;
    }

    if (!geocoderRef.current) {
      setStatus(t('createWorldWindow.statusGeocoderNotReady'));
      return;
    }

    setStatus(t('createWorldWindow.statusSearching', { query }));
    void geocoderRef.current.geocode({ address: query })
      .then(({ results }) => {
        const firstResult = results[0];
        if (!firstResult) {
          setStatus(t('createWorldWindow.statusSearchEmpty', { query }));
          return;
        }

        const nextLat = Number(firstResult.geometry.location.lat().toFixed(6));
        const nextLon = Number(firstResult.geometry.location.lng().toFixed(6));
        const nextRadius = firstResult.geometry.viewport
          ? estimateRadiusFromBounds(firstResult.geometry.viewport)
          : radiusM;

        setStreetAddress(firstResult.formatted_address ?? query);
        setDistrict(firstResult.formatted_address ?? query);
        setLatitude(nextLat);
        setLongitude(nextLon);
        setRadiusM(nextRadius);
        setStatus(t('createWorldWindow.statusSearchSelected', {
          place: firstResult.formatted_address ?? query,
        }));
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : t('createWorldWindow.statusSearchFailed')));
  };

  const submit = () => {
    const resolvedName = name.trim() || t('createWorldWindow.defaultWorldName', { place: streetAddress || searchText });
    setErrorDetail(null);

    if (isEditMode) {
      const editInput: UpdateWorldSettingsInput['input'] = {
        name: resolvedName,
        description: description.trim() || undefined,
        street_address: streetAddress.trim() || searchText.trim() || undefined,
        district: district.trim() || undefined,
        center_lat: latitude,
        center_lon: longitude,
        radius_m: radiusM,
        data_source: dataSource || undefined,
        weather,
        wind_speed_mps: windSpeed,
        weather_strength_pct: weatherStrength,
        light_hour: lightHour,
        world_time: worldTime,
        time_speed: timeSpeed,
        terrain_source: terrainSource,
      };
      setStatus(t('createWorldWindow.statusUpdating'));
      void updateWorldSettings(editInput)
        .then(() => {
          setStatus(t('createWorldWindow.statusUpdated', { name: resolvedName }));
          setSubmitted(true);
          appendLog({
            level: 'info',
            scope: 'world',
            message: t('createWorldWindow.logUpdated', {
              name: resolvedName,
              lat: latitude.toFixed(6),
              lon: longitude.toFixed(6),
              radius: radiusM,
            }),
          });
          closeDialog();
        })
        .catch((error) => {
          const summary = error instanceof Error ? error.message : String(error);
          const detail = error instanceof Error
            ? error.stack && error.stack.includes(summary)
              ? error.stack
              : `${error.name}: ${summary}${error.stack ? `\n${error.stack}` : ''}`
            : summary;
          console.error('[edit-world] update world settings failed', error);
          appendLog({
            level: 'error',
            scope: 'world',
            message: t('createWorldWindow.logUpdateFailed', { message: summary }),
            details: detail,
          });
          setStatus(t('createWorldWindow.statusUpdateFailed'));
          setErrorDetail({ summary, detail });
        });
      return;
    }

    const input: GenerateWorldInput['input'] = {
      name: resolvedName,
      seed: Date.now(),
      object_density: preview.density,
      street_address: streetAddress.trim() || searchText.trim(),
      district: district.trim(),
      center_lat: latitude,
      center_lon: longitude,
      radius_m: radiusM,
      data_source: 'OpenStreetMap',
      preview_quality: previewQuality,
    };

    setStatus(t('createWorldWindow.statusGenerating'));
    void generateWorld(input)
      .then(() => {
        setStatus(t('createWorldWindow.statusGenerated', { name: input.name }));
        setSubmitted(true);
        appendLog({
          level: 'info',
          scope: 'world',
          message: t('createWorldWindow.logCreated', {
            name: input.name,
            lat: latitude.toFixed(6),
            lon: longitude.toFixed(6),
            radius: radiusM,
          }),
        });
        closeDialog();
      })
      .catch((error) => {
        const summary = error instanceof Error ? error.message : String(error);
        const detail = error instanceof Error
          ? error.stack && error.stack.includes(summary)
            ? error.stack
            : `${error.name}: ${summary}${error.stack ? `\n${error.stack}` : ''}`
          : summary;
        console.error('[create-world] generate world failed', error);
        appendLog({
          level: 'error',
          scope: 'world',
          message: t('createWorldWindow.logFailed', { message: summary }),
          details: detail,
        });
        setStatus(t('createWorldWindow.statusFailed'));
        setErrorDetail({ summary, detail });
      });
  };

  const goToStep = (next: StepId) => {
    setCurrentStep(next);
    setStatus(t('createWorldWindow.statusEntered', { name: t(stepKeyById[next]) }));
  };

  const handleNext = () => {
    if (currentStep < 3) {
      goToStep((currentStep + 1) as StepId);
      return;
    }

    submit();
  };

  const handlePrev = () => {
    if (currentStep <= 1) {
      return;
    }

    goToStep((currentStep - 1) as StepId);
  };

  const previewWorld = () => {
    setStatus(t('createWorldWindow.statusPreview', {
      place: streetAddress,
      buildings: preview.buildings,
      roads: preview.roads,
    }));
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

  return (
    <div className="create-world-dialog-page">
      <section className="create-world-dialog" role="dialog" aria-modal="true" aria-labelledby="create-world-title">
        <header className="create-world-dialog-header" onMouseDown={(event) => {
          if (event.button === 0 && event.target === event.currentTarget) {
            startWindowDrag();
          }
        }}>
          <div className="create-world-brand" onMouseDown={startWindowDrag}>
            <img src={terminalLogoMarkUrl} alt="" />
            <span className="brand-wordmark">
              <span className="brand-wordmark-prefix">Terminal</span>
              <span className="brand-wordmark-suffix">Link</span>
            </span>
          </div>
          <div className="create-world-title-block" onMouseDown={startWindowDrag}>
            <h1 id="create-world-title">
              {isEditMode ? t('createWorldWindow.editTitle') : t('createWorldWindow.headerTitle')}
            </h1>
            <p>
              {isEditMode ? t('createWorldWindow.editSubtitle') : t('createWorldWindow.headerSubtitle')}
            </p>
          </div>
          <nav className="create-world-stepper" aria-label={t('createWorldWindow.stepperAria')}>
            {stepIds.map((stepId) => (
              <button
                key={stepId}
                type="button"
                className={`create-world-step ${
                  stepId === currentStep
                    ? 'create-world-step-active'
                    : stepId < currentStep
                      ? 'create-world-step-done'
                      : ''
                }`}
                onClick={() => goToStep(stepId)}
              >
                <b>{stepId < currentStep ? <FiCheck /> : stepId}</b>
                <span>{t(stepKeyById[stepId])}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="create-world-close-button" aria-label={t('createWorldWindow.closeAria')} onClick={closeDialog}>
            <FiX />
          </button>
        </header>

        <main className="create-world-dialog-body">
          <section className="create-world-map-panel" data-active={currentStep === 1 ? 'true' : 'false'}>
            <StepTitle index={1} title={t('createWorldWindow.steps.select')} />
            <div className="create-world-search">
              <FiSearch />
              <input
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setStreetAddress(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    searchRegion();
                  }
                }}
                placeholder={t('createWorldWindow.searchPlaceholder')}
              />
              <button type="button" onClick={searchRegion}>{t('createWorldWindow.searchButton')}</button>
            </div>

            <div className="create-world-map-canvas">
              <div ref={mapContainerRef} className="create-world-google-map" aria-label={t('createWorldWindow.mapAria')} />
              {!isMapReady ? (
                <div className="create-world-map-fallback">
                  <img src={terminalMapReferenceUrl} alt={t('createWorldWindow.mapFallbackAlt')} />
                  <strong>{mapStatus}</strong>
                  <span>{t('createWorldWindow.mapFallbackHint')}</span>
                </div>
              ) : null}
              <div className="create-world-map-toolbar" aria-label={t('createWorldWindow.mapToolbarAria')}>
                <button
                  type="button"
                  aria-label={t('createWorldWindow.zoomInAria')}
                  onClick={() => {
                    setRadiusM((value) => Math.max(MIN_RADIUS_M, Math.round(value * ZOOM_STEP_FACTOR)));
                    setStatus(t('createWorldWindow.statusZoomedIn'));
                  }}
                >
                  <FiPlus />
                  <span>{t('createWorldWindow.zoomIn')}</span>
                </button>
                <button
                  type="button"
                  aria-label={t('createWorldWindow.zoomOutAria')}
                  onClick={() => {
                    setRadiusM((value) => Math.min(MAX_RADIUS_M, Math.round(value / ZOOM_STEP_FACTOR)));
                    setStatus(t('createWorldWindow.statusZoomedOut'));
                  }}
                >
                  <FiMinus />
                  <span>{t('createWorldWindow.zoomOut')}</span>
                </button>
                <button
                  type="button"
                  aria-label={t('createWorldWindow.locateAria')}
                  onClick={locateCurrentPosition}
                >
                  <FiCompass />
                  <span>{t('createWorldWindow.locate')}</span>
                </button>
                <button
                  type="button"
                  aria-pressed={isDrawingMode}
                  aria-label={t('createWorldWindow.drawAria')}
                  className={isDrawingMode ? 'create-world-map-tool-active' : undefined}
                  onClick={() => {
                    const dm = drawingManagerRef.current;
                    if (!dm) {
                      setStatus(t('createWorldWindow.statusDrawNotReady'));
                      return;
                    }
                    if (isDrawingMode) {
                      dm.setDrawingMode(null);
                      setIsDrawingMode(false);
                      setStatus(t('createWorldWindow.statusDrawCanceled'));
                    } else {
                      dm.setDrawingMode(drawingOverlayTypeRef.current);
                      setIsDrawingMode(true);
                      setStatus(t('createWorldWindow.statusDrawingHint'));
                    }
                  }}
                >
                  <FiCrop />
                  <span>{isDrawingMode ? t('createWorldWindow.drawActive') : t('createWorldWindow.draw')}</span>
                </button>
              </div>
              <div className="create-world-area-badge">{t('createWorldWindow.currentArea', { value: preview.areaKm2.toFixed(2) })}</div>
              <div className="create-world-map-tabs">
                {viewModeIds.map((modeId) => (
                  <button
                    key={modeId}
                    type="button"
                    className={viewMode === modeId ? 'create-world-map-tab-active' : undefined}
                    onClick={() => setViewMode(modeId)}
                  >
                    <img src={mapThumbnailUrls?.[modeId] ?? terminalMapReferenceUrl} alt="" />
                    <span>{t(`createWorldWindow.viewModes.${modeId}`)}</span>
                  </button>
                ))}
              </div>
              <div className="create-world-map-metrics">
                <Metric label={t('createWorldWindow.metric.centerCoord')} value={t('createWorldWindow.metric.coord', { lat: latitude.toFixed(6), lon: longitude.toFixed(6) })} />
                <Metric label={t('createWorldWindow.metric.zoomLevel')} value={String(currentZoom)} />
                <Metric label={t('createWorldWindow.metric.altitude')} value={t('createWorldWindow.metric.altitudeValue', { value: preview.altitudeM.toFixed(1) })} />
              </div>
            </div>
          </section>

          <section className="create-world-settings-panel" data-active={currentStep === 2 ? 'true' : 'false'}>
            <StepTitle index={2} title={t('createWorldWindow.steps.settings')} />
            <div className="create-world-settings-scroll">
              <label className="create-world-field">
                <span>{t('createWorldWindow.fields.worldName')}</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('createWorldWindow.fields.worldNamePlaceholder')} />
              </label>
              <label className="create-world-field">
                <span>{t('createWorldWindow.fields.worldDescription')}</span>
                <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('createWorldWindow.fields.worldDescriptionPlaceholder')} />
              </label>
              <label className="create-world-field">
                <span>{t('createWorldWindow.fields.worldCrs')}</span>
                <select value="WGS84" disabled>
                  <option value="WGS84">WGS84 (EPSG:4326)</option>
                </select>
              </label>
              <label className="create-world-field">
                <span>{t('createWorldWindow.fields.dataSource')}</span>
                <select value={dataSource} disabled>
                  <option value="Google Photorealistic 3D Tiles">Google Photorealistic 3D Tiles</option>
                </select>
              </label>
              <label className="create-world-field">
                <span>{t('createWorldWindow.fields.worldTime')}</span>
                <DatePicker
                  selected={parseWorldTime(worldTime)}
                  onChange={(date: Date | null) => {
                    if (date) {
                      setWorldTime(formatWorldTime(date));
                    }
                  }}
                  showTimeSelect
                  timeFormat="HH:mm"
                  timeIntervals={5}
                  dateFormat="yyyy-MM-dd HH:mm"
                  showPopperArrow={false}
                  popperPlacement="bottom-start"
                  shouldCloseOnSelect
                  portalId="rdp-portal"
                  wrapperClassName="create-world-datepicker"
                />
              </label>
              <div className="create-world-field">
                <span>{t('createWorldWindow.fields.terrainSource')}</span>
                <div className="create-world-segmented">
                  {terrainSourceIds.map((sourceId) => (
                    <button
                      key={sourceId}
                      type="button"
                      className={terrainSource === sourceId ? 'create-world-segmented-active' : undefined}
                      onClick={() => setTerrainSource(sourceId)}
                    >
                      {t(`createWorldWindow.terrainSources.${sourceId}`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="create-world-field">
                <span>{t('createWorldWindow.fields.environmentPreset')}</span>
                <div className="create-world-weather-grid">
                  {weatherPresetConfig.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={weather === preset.id ? 'create-world-weather-active' : undefined}
                      onClick={() => setWeather(preset.id)}
                    >
                      {preset.icon}
                      <span>{t(`createWorldWindow.weather.${preset.id}`)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <SliderField label={t('createWorldWindow.fields.weatherStrength')} value={weatherStrength} min={0} max={100} suffix="%" onChange={setWeatherStrength} />
              <SliderField label={t('createWorldWindow.fields.timeSpeed')} value={timeSpeed} min={0.2} max={4} step={0.1} suffix="x" onChange={setTimeSpeed} />
              <SliderField label={t('createWorldWindow.fields.windSpeed')} value={windSpeed} min={0} max={30} step={0.5} suffix="m/s" onChange={setWindSpeed} />
              <TimeSliderField label={t('createWorldWindow.fields.lightHour')} value={lightHour} min={0} max={24} step={0.1} onChange={setLightHour} />
              <div className="create-world-hidden-fields" aria-label={t('createWorldWindow.hiddenFieldsAria')}>
                <NumberField label={t('createWorldWindow.fields.latitude')} value={latitude} onChange={setLatitude} min={-90} max={90} step={0.000001} />
                <NumberField label={t('createWorldWindow.fields.longitude')} value={longitude} onChange={setLongitude} min={-180} max={180} step={0.000001} />
                <NumberField label={t('createWorldWindow.fields.radius')} value={radiusM} onChange={setRadiusM} min={MIN_RADIUS_M} max={MAX_RADIUS_M} step={50} />
              </div>
            </div>
          </section>

          <aside className="create-world-layers-panel" data-active={currentStep === 3 ? 'true' : 'false'}>
            <h2>{t('createWorldWindow.layersTitle')}</h2>
            <div className="create-world-layer-scroll">
              <label className="create-world-layer-item create-world-layer-all">
                <input type="checkbox" checked readOnly />
                <span>{t('createWorldWindow.allLayers')}</span>
              </label>
              {layerGroupConfig.map((group) => (
                <div key={group.titleKey} className="create-world-layer-group">
                  <h3>{t(group.titleKey)}</h3>
                  {group.items.map((itemKey) => (
                    <label key={itemKey} className="create-world-layer-item">
                      <input type="checkbox" checked readOnly />
                      <span>{t(`createWorldWindow.layers.${itemKey}`)}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="create-world-data-note">
              <div>
                <FiInfo />
                <strong>{t('createWorldWindow.dataNoteTitle')}</strong>
              </div>
              <p>{t('createWorldWindow.dataNoteBody')}</p>
            </div>
          </aside>
        </main>

        <footer className="create-world-dialog-footer">
          <button type="button" className="create-world-secondary-button" onClick={closeDialog}>
            {t('createWorldWindow.cancel')}
          </button>
          <span className="create-world-status" role="status">{status}</span>
          <div className="create-world-footer-actions">
            <button
              type="button"
              className="create-world-secondary-button"
              onClick={handlePrev}
              disabled={currentStep === 1}
            >
              <FiArrowLeft />
              {t('createWorldWindow.prevStep')}
            </button>
            <button type="button" className="create-world-secondary-button" onClick={previewWorld}>
              {t('createWorldWindow.previewWorld')}
            </button>
            <button
              type="button"
              className="create-world-primary-button"
              onClick={handleNext}
              disabled={submitted && currentStep === 3}
            >
              {currentStep === 3 ? <FiSave /> : null}
              {currentStep === 3
                ? (isEditMode ? t('createWorldWindow.update') : t('createWorldWindow.create'))
                : t('createWorldWindow.nextStep', { name: t(stepKeyById[(currentStep + 1) as StepId]) })}
              {currentStep < 3 ? <FiArrowRight /> : null}
            </button>
          </div>
        </footer>

        {errorDetail ? (
          <div
            className="create-world-error-overlay"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="create-world-error-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setErrorDetail(null);
              }
            }}
          >
            <div className="create-world-error-card">
              <div className="create-world-error-header">
                <strong id="create-world-error-title">{t('createWorldWindow.errorTitle')}</strong>
                <button
                  type="button"
                  className="create-world-error-close"
                  aria-label={t('createWorldWindow.errorClose')}
                  onClick={() => setErrorDetail(null)}
                >
                  <FiX />
                </button>
              </div>
              <p className="create-world-error-summary">{errorDetail.summary}</p>
              <pre className="create-world-error-detail">{errorDetail.detail}</pre>
              <div className="create-world-error-actions">
                <button
                  type="button"
                  className="create-world-secondary-button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(errorDetail.detail).catch(() => undefined);
                  }}
                >
                  {t('createWorldWindow.errorCopy')}
                </button>
                <button
                  type="button"
                  className="create-world-primary-button"
                  onClick={() => setErrorDetail(null)}
                >
                  {t('createWorldWindow.errorClose')}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StepTitle({ index, title, compact = false }: { index: number; title: string; compact?: boolean }) {
  return (
    <div className={compact ? 'create-world-step-title create-world-step-title-compact' : 'create-world-step-title'}>
      <b>{index}</b>
      <span>{title}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}

function NumberField({ label, value, onChange, min, max, step = 1 }: NumberFieldProps) {
  return (
    <label className="create-world-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const displayValue = `${Number(value.toFixed(step < 1 ? 1 : 0))}${suffix ? ` ${suffix}` : ''}`;

  return (
    <label className="create-world-slider">
      <span>{label}</span>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{displayValue}</strong>
    </label>
  );
}

function TimeSliderField({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  const clampedValue = Math.max(min, Math.min(max, value));
  const percent = ((clampedValue - min) / (max - min)) * 100;
  const hours = Math.floor(clampedValue);
  const minutes = Math.round((clampedValue - hours) * 60);
  const display = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  const startLabel = `${Math.floor(min).toString().padStart(2, '0')}:00`;
  const endLabel = `${Math.floor(max).toString().padStart(2, '0')}:00`;

  return (
    <div className="create-world-time-slider">
      <span className="create-world-time-slider-label">{label}</span>
      <div className="create-world-time-slider-track">
        <span
          className="create-world-time-slider-bubble"
          style={{ left: `${percent}%` }}
        >
          {display}
        </span>
        <input
          type="range"
          value={clampedValue}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      <div className="create-world-time-slider-endpoints">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
