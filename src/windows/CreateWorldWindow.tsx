import { getCurrentWindow } from '@tauri-apps/api/window';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import {
  FiCalendar,
  FiCloud,
  FiCloudDrizzle,
  FiCloudRain,
  FiCompass,
  FiInfo,
  FiMinus,
  FiPlus,
  FiSave,
  FiSearch,
  FiSun,
  FiWind,
  FiX,
} from 'react-icons/fi';
import { useSimulation } from '../state';
import type { GenerateWorldInput } from '../api';
import { getConfiguredGoogleMapsApiKey, loadGoogleMapsLibraries } from '../utils';
import terminalLogoMarkUrl from '../../assets/design/logo.png';
import terminalMapReferenceUrl from '../../assets/design/terminal-map-reference.png';

type WeatherPreset = 'sunny' | 'cloudy' | 'overcast' | 'light_rain' | 'heavy_rain' | 'foggy';
type TerrainSource = 'srtm' | 'aster' | 'custom_dem';
type ViewMode = 'satellite' | 'street' | 'terrain' | 'building' | 'night';

const defaultStreetSpec = {
  name: '陆家嘴街区世界-20240524',
  description: '',
  searchText: '上海陆家嘴、深圳南山科技园',
  streetAddress: '上海市浦东新区陆家嘴',
  district: '上海市浦东新区',
  latitude: 31.230416,
  longitude: 121.473701,
  radiusM: 860,
  dataSource: 'Google Photorealistic 3D Tiles',
  previewQuality: 'high' as const,
  worldTime: '2024-05-24 14:32:18',
  weather: 'sunny' as WeatherPreset,
  terrainSource: 'srtm' as TerrainSource,
};

const layerGroups = [
  {
    title: '基础图层',
    items: ['道路', '建筑物', '水域', '绿地', '地形'],
  },
  {
    title: '语义图层（可选）',
    items: ['人行道', '自行车道', '交通标志', 'POI 设施'],
  },
  {
    title: '3D 增强（可选）',
    items: ['3D 建筑模型', '3D 树木', '3D 道路设施'],
  },
];

const viewModes: Array<{ id: ViewMode; label: string }> = [
  { id: 'satellite', label: '卫星影像' },
  { id: 'street', label: '街道地图' },
  { id: 'terrain', label: '地形' },
  { id: 'building', label: '3D 建筑' },
  { id: 'night', label: '夜景' },
];

const terrainSources: Array<{ id: TerrainSource; label: string }> = [
  { id: 'srtm', label: 'SRTM 30m' },
  { id: 'aster', label: 'ASTER 30m' },
  { id: 'custom_dem', label: '自定义 DEM' },
];

const weatherPresets: Array<{ id: WeatherPreset; label: string; icon: ReactElement }> = [
  { id: 'sunny', label: '晴天', icon: <FiSun /> },
  { id: 'cloudy', label: '多云', icon: <FiCloud /> },
  { id: 'overcast', label: '阴天', icon: <FiCloud /> },
  { id: 'light_rain', label: '小雨', icon: <FiCloudDrizzle /> },
  { id: 'heavy_rain', label: '大雨', icon: <FiCloudRain /> },
  { id: 'foggy', label: '雾天', icon: <FiWind /> },
];

const steps = ['选择区域', '世界设置', '确认创建'];
const METERS_PER_LAT_DEGREE = 111_320;
const MIN_RADIUS_M = 120;
const MAX_RADIUS_M = 3_000;

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
  return clamp(Math.round(20 - Math.log2(radiusM / 160)), 12, 19);
}

function googleMapsSizeLabel() {
  return getConfiguredGoogleMapsApiKey() ? 'Google Maps API 已配置' : '缺少 Google Maps API key';
}

export function CreateWorldWindow() {
  const { generateWorld, appendLog } = useSimulation();
  const [name, setName] = useState(defaultStreetSpec.name);
  const [description, setDescription] = useState(defaultStreetSpec.description);
  const [searchText, setSearchText] = useState(defaultStreetSpec.searchText);
  const [streetAddress, setStreetAddress] = useState(defaultStreetSpec.streetAddress);
  const [district, setDistrict] = useState(defaultStreetSpec.district);
  const [latitude, setLatitude] = useState(defaultStreetSpec.latitude);
  const [longitude, setLongitude] = useState(defaultStreetSpec.longitude);
  const [radiusM, setRadiusM] = useState(defaultStreetSpec.radiusM);
  const [dataSource] = useState(defaultStreetSpec.dataSource);
  const [previewQuality] = useState(defaultStreetSpec.previewQuality);
  const [worldTime, setWorldTime] = useState(defaultStreetSpec.worldTime);
  const [terrainSource, setTerrainSource] = useState(defaultStreetSpec.terrainSource);
  const [weather, setWeather] = useState(defaultStreetSpec.weather);
  const [viewMode, setViewMode] = useState<ViewMode>('satellite');
  const [weatherStrength, setWeatherStrength] = useState(20);
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [windSpeed, setWindSpeed] = useState(5);
  const [lightHour, setLightHour] = useState(14.53);
  const [status, setStatus] = useState('正在加载 Google Maps 区域选择器...');
  const [mapStatus, setMapStatus] = useState(googleMapsSizeLabel);
  const [isMapReady, setIsMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const googleMapRef = useRef<GoogleMapsMap | null>(null);
  const selectionRectangleRef = useRef<GoogleMapsRectangle | null>(null);
  const geocoderRef = useRef<GoogleMapsGeocoder | null>(null);
  const isSyncingRectangleRef = useRef(false);

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
          bounds: createBoundsFromRadius(latitude, longitude, radiusM),
          draggable: true,
          editable: true,
          fillColor: '#1a73e8',
          fillOpacity: 0.18,
          map,
          strokeColor: '#1a73e8',
          strokeOpacity: 0.94,
          strokeWeight: 3,
        });

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
          setLatitude(Number(center.lat().toFixed(6)));
          setLongitude(Number(center.lng().toFixed(6)));
          setRadiusM(estimateRadiusFromBounds(bounds));
          setStatus('已更新 Google Maps 实际选择区域');
        }));
        listeners.push(map.addListener('click', (event?: GoogleMapsMapMouseEvent) => {
          if (!event?.latLng) {
            return;
          }

          const lat = Number(event.latLng.lat().toFixed(6));
          const lng = Number(event.latLng.lng().toFixed(6));
          setLatitude(lat);
          setLongitude(lng);
          setStatus('已将选择区域中心移动到地图点击位置');
        }));

        setIsMapReady(true);
        setMapStatus('Google Maps API 区域选择器已就绪');
        setStatus('拖动蓝色矩形或搜索地点来选取真实区域');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Google Maps API 加载失败';
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

    isSyncingRectangleRef.current = true;
    map.setCenter({ lat: latitude, lng: longitude });
    map.setZoom(preview.zoomLevel);
    rectangle.setBounds(createBoundsFromRadius(latitude, longitude, radiusM));
    window.setTimeout(() => {
      isSyncingRectangleRef.current = false;
    }, 0);
  }, [latitude, longitude, radiusM, preview.zoomLevel]);

  const searchRegion = () => {
    const query = searchText.trim();
    if (!query) {
      setStatus('请输入要选取的真实地点或街区名称');
      return;
    }

    if (!geocoderRef.current) {
      setStatus('Google Maps API 尚未就绪，无法搜索区域');
      return;
    }

    setStatus(`正在通过 Google Maps API 搜索：${query}`);
    void geocoderRef.current.geocode({ address: query })
      .then(({ results }) => {
        const firstResult = results[0];
        if (!firstResult) {
          setStatus(`Google Maps 未找到区域：${query}`);
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
        setStatus(`已选取 Google Maps 区域：${firstResult.formatted_address ?? query}`);
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : 'Google Maps 搜索失败'));
  };

  const submit = () => {
    const input: GenerateWorldInput['input'] = {
      name: name.trim() || `${streetAddress || searchText} 实景世界`,
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

    setStatus('正在生成 Google Photorealistic 3D Tiles 视角所需的街区坐标与仿真语义...');
    void generateWorld(input)
      .then(() => {
        setStatus(`已创建世界：${input.name}`);
        appendLog({
          level: 'info',
          scope: 'world',
          message: `已创建 Google Maps 选区世界：${input.name}，中心 ${latitude.toFixed(6)},${longitude.toFixed(6)}，半径 ${radiusM}m`,
        });
      })
      .catch((error) => setStatus(error instanceof Error ? error.message : '创建世界失败'));
  };

  const previewWorld = () => {
    setStatus(`预览世界：${streetAddress}，预计 ${preview.buildings} 栋建筑、${preview.roads} 条道路`);
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
            <span>TerminalLink</span>
          </div>
          <div className="create-world-title-block" onMouseDown={startWindowDrag}>
            <h1 id="create-world-title">新建世界</h1>
            <p>选择区域并创建你的真实街区世界（Google Maps API 负责真实选区）</p>
          </div>
          <button type="button" className="create-world-close-button" aria-label="关闭创建世界" onClick={closeDialog}>
            <FiX />
          </button>
        </header>

        <main className="create-world-dialog-body">
          <section className="create-world-map-panel">
            <StepTitle index={1} title="选择区域" />
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
                placeholder="搜索地点，例如：上海陆家嘴、深圳南山科技园"
              />
              <button type="button" onClick={searchRegion}>搜索</button>
            </div>

            <div className="create-world-map-canvas">
              <div ref={mapContainerRef} className="create-world-google-map" aria-label="Google Maps 实际区域选择器" />
              {!isMapReady ? (
                <div className="create-world-map-fallback">
                  <img src={terminalMapReferenceUrl} alt="城市实景区域预览" />
                  <strong>{mapStatus}</strong>
                  <span>配置有效 key 后会直接加载 Google Maps，拖动蓝色矩形即可选取真实区域。</span>
                </div>
              ) : null}
              <div className="create-world-map-toolbar" aria-label="地图缩放定位">
                <button
                  type="button"
                  aria-label="放大区域"
                  onClick={() => {
                    setRadiusM((value) => Math.max(MIN_RADIUS_M, value - 80));
                    setStatus('已放大 Google Maps 选择区域');
                  }}
                >
                  <FiPlus />
                  <span>放大</span>
                </button>
                <button
                  type="button"
                  aria-label="缩小区域"
                  onClick={() => {
                    setRadiusM((value) => Math.min(MAX_RADIUS_M, value + 80));
                    setStatus('已缩小 Google Maps 选择区域');
                  }}
                >
                  <FiMinus />
                  <span>缩小</span>
                </button>
                <button
                  type="button"
                  aria-label="定位区域"
                  onClick={() => {
                    googleMapRef.current?.setCenter({ lat: latitude, lng: longitude });
                    setStatus('已定位到当前 Google Maps 选区中心');
                  }}
                >
                  <FiCompass />
                  <span>定位</span>
                </button>
              </div>
              <div className="create-world-area-badge">当前选择区域：{preview.areaKm2.toFixed(2)} km²</div>
              <div className="create-world-map-tabs">
                {viewModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={viewMode === mode.id ? 'create-world-map-tab-active' : undefined}
                    onClick={() => setViewMode(mode.id)}
                  >
                    <img src={terminalMapReferenceUrl} alt="" />
                    <span>{mode.label}</span>
                  </button>
                ))}
              </div>
              <div className="create-world-map-metrics">
                <Metric label="中心坐标" value={`${latitude.toFixed(6)}° N, ${longitude.toFixed(6)}° E`} />
                <Metric label="缩放级别" value={String(preview.zoomLevel)} />
                <Metric label="海拔高度" value={`${preview.altitudeM.toFixed(1)} m`} />
              </div>
            </div>

            <StepTitle index={2} title="世界设置" compact />
          </section>

          <section className="create-world-settings-panel">
            <h2>世界设置</h2>
            <div className="create-world-settings-scroll">
              <label className="create-world-field">
                <span>世界名称</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：陆家嘴街区世界-20240524" />
              </label>
              <label className="create-world-field">
                <span>世界描述（可选）</span>
                <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="请输入世界描述信息" />
              </label>
              <label className="create-world-field">
                <span>世界坐标系</span>
                <select value="WGS84" disabled>
                  <option value="WGS84">WGS84 (EPSG:4326)</option>
                </select>
              </label>
              <label className="create-world-field">
                <span>数据源</span>
                <select value={dataSource} disabled>
                  <option value="Google Photorealistic 3D Tiles">Google Photorealistic 3D Tiles</option>
                </select>
              </label>
              <label className="create-world-field">
                <span>世界时间</span>
                <div className="create-world-input-icon">
                  <input value={worldTime} onChange={(event) => setWorldTime(event.target.value)} />
                  <FiCalendar />
                </div>
              </label>
              <div className="create-world-field">
                <span>地形数据源</span>
                <div className="create-world-segmented">
                  {terrainSources.map((source) => (
                    <button
                      key={source.id}
                      type="button"
                      className={terrainSource === source.id ? 'create-world-segmented-active' : undefined}
                      onClick={() => setTerrainSource(source.id)}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="create-world-field">
                <span>环境预设</span>
                <div className="create-world-weather-grid">
                  {weatherPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={weather === preset.id ? 'create-world-weather-active' : undefined}
                      onClick={() => setWeather(preset.id)}
                    >
                      {preset.icon}
                      <span>{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <SliderField label="天气强度" value={weatherStrength} min={0} max={100} suffix="%" onChange={setWeatherStrength} />
              <SliderField label="时间流速" value={timeSpeed} min={0.2} max={4} step={0.1} suffix="x" onChange={setTimeSpeed} />
              <SliderField label="风速" value={windSpeed} min={0} max={30} step={0.5} suffix="m/s" onChange={setWindSpeed} />
              <SliderField label="光照时间" value={lightHour} min={0} max={24} step={0.1} suffix="" onChange={setLightHour} timeLabel />
              <div className="create-world-hidden-fields" aria-label="在线区域参数">
                <NumberField label="纬度" value={latitude} onChange={setLatitude} min={-90} max={90} step={0.000001} />
                <NumberField label="经度" value={longitude} onChange={setLongitude} min={-180} max={180} step={0.000001} />
                <NumberField label="半径（m）" value={radiusM} onChange={setRadiusM} min={MIN_RADIUS_M} max={MAX_RADIUS_M} step={50} />
              </div>
            </div>
          </section>

          <aside className="create-world-layers-panel">
            <h2>数据图层</h2>
            <div className="create-world-layer-scroll">
              <label className="create-world-layer-item create-world-layer-all">
                <input type="checkbox" checked readOnly />
                <span>全部图层</span>
              </label>
              {layerGroups.map((group) => (
                <div key={group.title} className="create-world-layer-group">
                  <h3>{group.title}</h3>
                  {group.items.map((item) => (
                    <label key={item} className="create-world-layer-item">
                      <input type="checkbox" checked readOnly />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="create-world-data-note">
              <div>
                <FiInfo />
                <strong>数据说明</strong>
              </div>
              <p>选择区域直接使用 Google Maps API；Google 3D Tiles 负责真实城市网格，OSM 仅用于任务路径和 POI 语义。</p>
            </div>
          </aside>
        </main>

        <footer className="create-world-dialog-footer">
          <button type="button" className="create-world-secondary-button" onClick={closeDialog}>
            取消
          </button>
          <div className="create-world-footer-steps" aria-label="创建步骤">
            {steps.map((step, index) => (
              <span key={step} className={index === 0 ? 'create-world-footer-step-active' : undefined}>
                <b>{index + 1}</b>
                {step}
              </span>
            ))}
          </div>
          <div className="create-world-footer-actions">
            <button type="button" className="create-world-secondary-button" onClick={previewWorld}>
              预览世界
            </button>
            <button type="button" className="create-world-primary-button" onClick={submit}>
              <FiSave />
              创建世界
            </button>
          </div>
        </footer>

        <div className="create-world-status" role="status">{status}</div>
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
  timeLabel = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  timeLabel?: boolean;
  onChange: (value: number) => void;
}) {
  const displayValue = timeLabel
    ? `${Math.floor(value).toString().padStart(2, '0')}:${Math.round((value % 1) * 60).toString().padStart(2, '0')}`
    : `${Number(value.toFixed(step < 1 ? 1 : 0))}${suffix ? ` ${suffix}` : ''}`;

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
