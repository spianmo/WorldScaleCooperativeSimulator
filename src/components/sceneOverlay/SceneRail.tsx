import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCrosshair, FiLayers, FiMapPin, FiNavigation, FiShare2, FiTarget, FiBox } from 'react-icons/fi';
import { TbRulerMeasure } from 'react-icons/tb';
import type { SceneArea, SceneLayerId, SceneLayerState, SceneMarker, SceneMeasurement } from './sceneTypes';
import type { SimulationDevice, SimulationGoal, SimulationTask, WorldObject } from '../../types';

export type RailPanelId = 'layers' | 'objects' | 'topology' | 'measure' | 'locate' | 'goal';

export interface SceneRailProps {
  activePanel: RailPanelId | null;
  onTogglePanel: (panel: RailPanelId) => void;
  layers: SceneLayerState[];
  onToggleLayer: (id: SceneLayerId) => void;
  worldObjects: WorldObject[];
  devices: SimulationDevice[];
  goals: SimulationGoal[];
  tasks: SimulationTask[];
  markers: SceneMarker[];
  measurements: SceneMeasurement[];
  areas: SceneArea[];
  onFocusDevice: (deviceId: string) => void;
  onFocusObject: (objectId: string) => void;
  onActivateMeasure: () => void;
  measureActive: boolean;
}

const RAIL_BUTTONS: Array<{ id: RailPanelId; iconKey: 'layers' | 'box' | 'share' | 'ruler' | 'crosshair' | 'target' }> = [
  { id: 'layers', iconKey: 'layers' },
  { id: 'objects', iconKey: 'box' },
  { id: 'topology', iconKey: 'share' },
  { id: 'measure', iconKey: 'ruler' },
  { id: 'locate', iconKey: 'crosshair' },
  { id: 'goal', iconKey: 'target' },
];

function railIcon(iconKey: string) {
  if (iconKey === 'layers') return <FiLayers />;
  if (iconKey === 'box') return <FiBox />;
  if (iconKey === 'share') return <FiShare2 />;
  if (iconKey === 'ruler') return <TbRulerMeasure />;
  if (iconKey === 'crosshair') return <FiCrosshair />;
  return <FiTarget />;
}

export function SceneRail({
  activePanel,
  onTogglePanel,
  layers,
  onToggleLayer,
  worldObjects,
  devices,
  goals,
  tasks,
  markers,
  measurements,
  areas,
  onFocusDevice,
  onFocusObject,
  onActivateMeasure,
  measureActive,
}: SceneRailProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activePanel) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) {
        return;
      }
      onTogglePanel(activePanel);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [activePanel, onTogglePanel]);

  const goalTaskIndex = useMemo(() => {
    const map = new Map<string, SimulationTask[]>();
    tasks.forEach((task) => {
      const goalId = task.goalId ?? 'orphan';
      const list = map.get(goalId) ?? [];
      list.push(task);
      map.set(goalId, list);
    });
    return map;
  }, [tasks]);

  const labelFor = (id: RailPanelId) => t(`worldWindowExtra.scene.rail.${id}`);

  return (
    <div
      ref={containerRef}
      className="scene-rail"
      role="toolbar"
      aria-label={t('worldWindowExtra.scene.rail.aria')}
    >
      {RAIL_BUTTONS.map((button, index) => {
        const isActive = activePanel === button.id || (button.id === 'measure' && measureActive);
        return (
          <div key={button.id} className="scene-rail-slot">
            {index > 0 ? <span className="scene-rail-divider" aria-hidden="true" /> : null}
            <button
              type="button"
              className={`scene-rail-button ${isActive ? 'is-active' : ''}`}
              aria-pressed={isActive}
              aria-label={labelFor(button.id)}
              onClick={() => {
                if (button.id === 'measure') {
                  onActivateMeasure();
                  return;
                }
                onTogglePanel(button.id);
              }}
            >
              <span aria-hidden="true">{railIcon(button.iconKey)}</span>
              <span className="scene-rail-tooltip" role="tooltip">{labelFor(button.id)}</span>
            </button>
          </div>
        );
      })}

      {activePanel ? (
        <div className="scene-rail-popover" role="dialog" aria-label={labelFor(activePanel)}>
          <header>
            <strong>{labelFor(activePanel)}</strong>
            <button
              type="button"
              className="scene-rail-popover-close"
              aria-label={t('common.close')}
              onClick={() => onTogglePanel(activePanel)}
            >
              ×
            </button>
          </header>
          <div className="scene-rail-popover-body">
            {activePanel === 'layers' ? (
              <ul className="scene-rail-list">
                {layers.map((layer) => (
                  <li key={layer.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={layer.enabled}
                        onChange={() => onToggleLayer(layer.id)}
                      />
                      <span>{t(`worldWindowExtra.scene.layerLabel.${layer.id}`)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}

            {activePanel === 'objects' ? (
              <ul className="scene-rail-list">
                {worldObjects.length === 0 ? (
                  <li className="scene-rail-empty">{t('worldWindowExtra.scene.rail.emptyObjects')}</li>
                ) : (
                  worldObjects.slice(0, 60).map((object) => (
                    <li key={object.id}>
                      <button
                        type="button"
                        className="scene-rail-row"
                        onClick={() => onFocusObject(object.id)}
                      >
                        <span className="scene-rail-row-tag">{object.kind}</span>
                        <span className="scene-rail-row-name">{object.name}</span>
                      </button>
                    </li>
                  ))
                )}
                {markers.length || measurements.length || areas.length ? (
                  <li className="scene-rail-section">
                    <strong>{t('worldWindowExtra.scene.rail.userObjects')}</strong>
                    <span>
                      {t('worldWindowExtra.scene.rail.userObjectsCount', {
                        markers: markers.length,
                        measurements: measurements.length,
                        areas: areas.length,
                      })}
                    </span>
                  </li>
                ) : null}
              </ul>
            ) : null}

            {activePanel === 'topology' ? (
              <ul className="scene-rail-list">
                {goals.length === 0 ? (
                  <li className="scene-rail-empty">{t('worldWindowExtra.scene.rail.emptyTopology')}</li>
                ) : (
                  goals.map((goal) => {
                    const goalTasks = goalTaskIndex.get(goal.id) ?? [];
                    return (
                      <li key={goal.id} className="scene-rail-topology-item">
                        <strong>{goal.title}</strong>
                        <span>{t('worldWindowExtra.scene.rail.topologyTaskCount', { count: goalTasks.length })}</span>
                        <ul>
                          {goalTasks.map((task) => {
                            const device = devices.find((entry) => entry.id === task.assigneeDeviceId);
                            return (
                              <li key={task.id}>
                                <span className="scene-rail-row-tag">{task.kind}</span>
                                <span>{task.title}</span>
                                {device ? <em>{device.name}</em> : null}
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  })
                )}
              </ul>
            ) : null}

            {activePanel === 'locate' ? (
              <ul className="scene-rail-list">
                {devices.map((device) => (
                  <li key={device.id}>
                    <button
                      type="button"
                      className="scene-rail-row"
                      onClick={() => onFocusDevice(device.id)}
                    >
                      <FiMapPin aria-hidden="true" />
                      <span className="scene-rail-row-name">{device.name}</span>
                      <span className="scene-rail-row-meta">{device.kind}</span>
                    </button>
                  </li>
                ))}
                {devices.length === 0 ? (
                  <li className="scene-rail-empty">{t('worldWindowExtra.scene.rail.emptyLocate')}</li>
                ) : null}
              </ul>
            ) : null}

            {activePanel === 'goal' ? (
              <ul className="scene-rail-list">
                {goals.length === 0 ? (
                  <li className="scene-rail-empty">{t('worldWindowExtra.scene.rail.emptyGoal')}</li>
                ) : (
                  goals.map((goal) => (
                    <li key={goal.id} className="scene-rail-goal-item">
                      <strong>{goal.title}</strong>
                      <span>
                        <FiNavigation aria-hidden="true" /> {goal.priority} · {goal.status}
                      </span>
                      <p>{goal.description}</p>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
