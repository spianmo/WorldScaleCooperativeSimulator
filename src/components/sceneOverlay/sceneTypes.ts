export type ActiveTool = null | 'marker' | 'measure' | 'area';

export type MarkerKind = 'task' | 'observation' | 'anomaly';
export type AreaKind = 'patrol' | 'no_go' | 'risk' | 'scan';
export type MeasureMode = 'planar' | 'three_d';

export interface GeoPoint {
  lon: number;
  lat: number;
  height: number;
}

export interface SceneMarker {
  id: string;
  kind: MarkerKind;
  position: GeoPoint;
  label?: string;
  createdAt: string;
}

export interface SceneMeasurement {
  id: string;
  mode: MeasureMode;
  start: GeoPoint;
  end: GeoPoint;
  totalMeters: number;
  planarMeters: number;
  verticalMeters: number;
}

export interface SceneArea {
  id: string;
  kind: AreaKind;
  vertices: GeoPoint[];
  closed: boolean;
}

export type SceneLayerId =
  | 'tiles3d'
  | 'devices'
  | 'paths'
  | 'pois'
  | 'topology'
  | 'markers'
  | 'measurements'
  | 'areas';

export interface SceneLayerState {
  id: SceneLayerId;
  enabled: boolean;
}

export interface SceneSettings {
  shadows: boolean;
  hdr: boolean;
  highQualityMaterials: boolean;
  showGrid: boolean;
  showAxes: boolean;
  showDevicePaths: boolean;
  showPerformance: boolean;
  maxScreenSpaceError: number;
}

export interface CameraPose {
  heading: number;
  pitch: number;
  roll: number;
  height: number;
}

export const MARKER_COLORS: Record<MarkerKind, string> = {
  task: '#1a73e8',
  observation: '#34a853',
  anomaly: '#ea4335',
};

export const AREA_COLORS: Record<AreaKind, string> = {
  patrol: '#1a73e8',
  no_go: '#ea4335',
  risk: '#fbbc04',
  scan: '#a142f4',
};

export const DEFAULT_LAYERS: SceneLayerState[] = [
  { id: 'tiles3d', enabled: true },
  { id: 'devices', enabled: true },
  { id: 'paths', enabled: true },
  { id: 'pois', enabled: true },
  { id: 'topology', enabled: false },
  { id: 'markers', enabled: true },
  { id: 'measurements', enabled: true },
  { id: 'areas', enabled: true },
];

export const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  shadows: false,
  hdr: true,
  highQualityMaterials: true,
  showGrid: false,
  showAxes: true,
  showDevicePaths: true,
  showPerformance: false,
  maxScreenSpaceError: 8,
};
