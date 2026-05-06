import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LAYERS,
  DEFAULT_SCENE_SETTINGS,
  type ActiveTool,
  type AreaKind,
  type GeoPoint,
  type MarkerKind,
  type MeasureMode,
  type SceneArea,
  type SceneLayerId,
  type SceneLayerState,
  type SceneMarker,
  type SceneMeasurement,
  type SceneSettings,
} from './sceneTypes';

const LAYERS_STORAGE_KEY = 'world-scale-simulator.scene.layers';

function loadStoredLayers(): SceneLayerState[] {
  if (typeof window === 'undefined') {
    return DEFAULT_LAYERS;
  }
  try {
    const raw = window.localStorage.getItem(LAYERS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_LAYERS;
    }
    const parsed = JSON.parse(raw) as Partial<Record<SceneLayerId, boolean>>;
    return DEFAULT_LAYERS.map((layer) =>
      typeof parsed[layer.id] === 'boolean' ? { ...layer, enabled: parsed[layer.id] as boolean } : layer,
    );
  } catch {
    return DEFAULT_LAYERS;
  }
}

function planarDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const metersPerLat = 111_320;
  const metersPerLon = Math.cos((a.lat * Math.PI) / 180) * 111_320;
  const dy = (b.lat - a.lat) * metersPerLat;
  const dx = (b.lon - a.lon) * metersPerLon;
  return Math.sqrt(dx * dx + dy * dy);
}

function totalDistanceMeters(a: GeoPoint, b: GeoPoint, mode: MeasureMode): number {
  const planar = planarDistanceMeters(a, b);
  if (mode === 'planar') {
    return planar;
  }
  const dz = b.height - a.height;
  return Math.sqrt(planar * planar + dz * dz);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000).toString(36)}`;
}

export type SceneOverlayKind = 'marker' | 'measurement' | 'area';

export interface SceneOverlaySelection {
  kind: SceneOverlayKind;
  id: string;
}

export interface UseSceneToolsReturn {
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  markerKind: MarkerKind;
  setMarkerKind: (kind: MarkerKind) => void;
  areaKind: AreaKind;
  setAreaKind: (kind: AreaKind) => void;
  measureMode: MeasureMode;
  setMeasureMode: (mode: MeasureMode) => void;
  markers: SceneMarker[];
  measurements: SceneMeasurement[];
  areas: SceneArea[];
  draftMeasurement: GeoPoint | null;
  draftArea: GeoPoint[];
  layers: SceneLayerState[];
  settings: SceneSettings;
  selection: SceneOverlaySelection | null;
  toggleLayer: (id: SceneLayerId) => void;
  updateSettings: (patch: Partial<SceneSettings>) => void;
  handleScenePick: (point: GeoPoint) => void;
  finishArea: () => void;
  clearTransient: () => void;
  clearAll: () => void;
  removeMarker: (id: string) => void;
  removeMeasurement: (id: string) => void;
  removeArea: (id: string) => void;
  selectOverlay: (selection: SceneOverlaySelection | null) => void;
  removeSelected: () => void;
}

const TOOL_LAYER_DEPENDENCIES: Record<Exclude<ActiveTool, null>, SceneLayerId> = {
  marker: 'markers',
  measure: 'measurements',
  area: 'areas',
};

export function useSceneTools(): UseSceneToolsReturn {
  const [activeTool, setActiveToolState] = useState<ActiveTool>(null);
  const [markerKind, setMarkerKind] = useState<MarkerKind>('task');
  const [areaKind, setAreaKind] = useState<AreaKind>('patrol');
  const [measureMode, setMeasureMode] = useState<MeasureMode>('planar');
  const [markers, setMarkers] = useState<SceneMarker[]>([]);
  const [measurements, setMeasurements] = useState<SceneMeasurement[]>([]);
  const [areas, setAreas] = useState<SceneArea[]>([]);
  const [draftMeasurement, setDraftMeasurement] = useState<GeoPoint | null>(null);
  const [draftArea, setDraftArea] = useState<GeoPoint[]>([]);
  const [layers, setLayers] = useState<SceneLayerState[]>(loadStoredLayers);
  const [settings, setSettings] = useState<SceneSettings>(DEFAULT_SCENE_SETTINGS);
  const [selection, setSelection] = useState<SceneOverlaySelection | null>(null);

  const ensureLayerEnabled = useCallback((id: SceneLayerId) => {
    setLayers((prev) => {
      const found = prev.find((layer) => layer.id === id);
      if (!found || found.enabled) {
        return prev;
      }
      return prev.map((layer) => (layer.id === id ? { ...layer, enabled: true } : layer));
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const payload = layers.reduce<Record<string, boolean>>((acc, layer) => {
        acc[layer.id] = layer.enabled;
        return acc;
      }, {});
      window.localStorage.setItem(LAYERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // localStorage may be unavailable (private mode / quota); ignore
    }
  }, [layers]);

  const setActiveTool = useCallback(
    (tool: ActiveTool) => {
      setActiveToolState((prev) => {
        if (prev === tool) {
          setDraftMeasurement(null);
          setDraftArea([]);
          return null;
        }
        setDraftMeasurement(null);
        setDraftArea([]);
        return tool;
      });
      if (tool) {
        setSelection(null);
        ensureLayerEnabled(TOOL_LAYER_DEPENDENCIES[tool]);
      }
    },
    [ensureLayerEnabled],
  );

  const handleScenePick = useCallback(
    (point: GeoPoint) => {
      if (activeTool === 'marker') {
        setMarkers((prev) => [
          ...prev,
          {
            id: makeId('marker'),
            kind: markerKind,
            position: point,
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      if (activeTool === 'measure') {
        if (!draftMeasurement) {
          setDraftMeasurement(point);
          return;
        }
        const planar = planarDistanceMeters(draftMeasurement, point);
        const total = totalDistanceMeters(draftMeasurement, point, measureMode);
        const vertical = Math.abs(point.height - draftMeasurement.height);
        setMeasurements((prev) => [
          ...prev,
          {
            id: makeId('measure'),
            mode: measureMode,
            start: draftMeasurement,
            end: point,
            totalMeters: total,
            planarMeters: planar,
            verticalMeters: vertical,
          },
        ]);
        setDraftMeasurement(null);
        return;
      }

      if (activeTool === 'area') {
        setDraftArea((prev) => [...prev, point]);
      }
    },
    [activeTool, draftMeasurement, markerKind, measureMode],
  );

  const finishArea = useCallback(() => {
    setDraftArea((prev) => {
      if (prev.length < 3) {
        return prev;
      }
      setAreas((current) => [
        ...current,
        {
          id: makeId('area'),
          kind: areaKind,
          vertices: prev,
          closed: true,
        },
      ]);
      return [];
    });
  }, [areaKind]);

  const clearTransient = useCallback(() => {
    setDraftMeasurement(null);
    setDraftArea([]);
  }, []);

  const clearAll = useCallback(() => {
    setMarkers([]);
    setMeasurements([]);
    setAreas([]);
    setDraftMeasurement(null);
    setDraftArea([]);
    setSelection(null);
  }, []);

  const toggleLayer = useCallback((id: SceneLayerId) => {
    setLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, enabled: !layer.enabled } : layer)));
  }, []);

  const updateSettings = useCallback((patch: Partial<SceneSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearSelectionIfMatch = useCallback((kind: SceneOverlayKind, id: string) => {
    setSelection((prev) => (prev && prev.kind === kind && prev.id === id ? null : prev));
  }, []);

  const removeMarker = useCallback(
    (id: string) => {
      setMarkers((prev) => prev.filter((marker) => marker.id !== id));
      clearSelectionIfMatch('marker', id);
    },
    [clearSelectionIfMatch],
  );

  const removeMeasurement = useCallback(
    (id: string) => {
      setMeasurements((prev) => prev.filter((entry) => entry.id !== id));
      clearSelectionIfMatch('measurement', id);
    },
    [clearSelectionIfMatch],
  );

  const removeArea = useCallback(
    (id: string) => {
      setAreas((prev) => prev.filter((area) => area.id !== id));
      clearSelectionIfMatch('area', id);
    },
    [clearSelectionIfMatch],
  );

  const selectOverlay = useCallback((next: SceneOverlaySelection | null) => {
    setSelection(next);
  }, []);

  const removeSelected = useCallback(() => {
    setSelection((prev) => {
      if (!prev) {
        return prev;
      }
      if (prev.kind === 'marker') {
        setMarkers((items) => items.filter((item) => item.id !== prev.id));
      } else if (prev.kind === 'measurement') {
        setMeasurements((items) => items.filter((item) => item.id !== prev.id));
      } else {
        setAreas((items) => items.filter((item) => item.id !== prev.id));
      }
      return null;
    });
  }, []);

  return useMemo(
    () => ({
      activeTool,
      setActiveTool,
      markerKind,
      setMarkerKind,
      areaKind,
      setAreaKind,
      measureMode,
      setMeasureMode,
      markers,
      measurements,
      areas,
      draftMeasurement,
      draftArea,
      layers,
      settings,
      selection,
      toggleLayer,
      updateSettings,
      handleScenePick,
      finishArea,
      clearTransient,
      clearAll,
      removeMarker,
      removeMeasurement,
      removeArea,
      selectOverlay,
      removeSelected,
    }),
    [
      activeTool,
      areaKind,
      areas,
      clearAll,
      clearTransient,
      draftArea,
      draftMeasurement,
      finishArea,
      handleScenePick,
      layers,
      markerKind,
      markers,
      measureMode,
      measurements,
      removeArea,
      removeMarker,
      removeMeasurement,
      removeSelected,
      selection,
      selectOverlay,
      setActiveTool,
      settings,
      toggleLayer,
      updateSettings,
    ],
  );
}
