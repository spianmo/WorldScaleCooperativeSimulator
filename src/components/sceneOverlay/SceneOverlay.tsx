import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Compass } from './Compass';
import { CoordinateAxes } from './CoordinateAxes';
import { SceneEditToolbar } from './SceneEditToolbar';
import { SceneRail, type RailPanelId } from './SceneRail';
import { SceneSettingsPanel } from './SceneSettingsPanel';
import type { WorldSceneCameraController } from './sceneTypes';
import type { UseSceneToolsReturn } from './useSceneTools';
import type { SimulationDevice, SimulationGoal, SimulationTask, WorldObject } from '../../types';

export interface SceneOverlayProps {
  tools: UseSceneToolsReturn;
  cameraHeadingDeg: number;
  cameraPitchDeg: number;
  worldObjects: WorldObject[];
  devices: SimulationDevice[];
  goals: SimulationGoal[];
  tasks: SimulationTask[];
  onResetNorth: () => void;
  onFocusDevice: (deviceId: string) => void;
  onFocusObject: (objectId: string) => void;
  cameraControllerRef?: MutableRefObject<WorldSceneCameraController | null>;
}

export function SceneOverlay({
  tools,
  cameraHeadingDeg,
  cameraPitchDeg,
  worldObjects,
  devices,
  goals,
  tasks,
  onResetNorth,
  onFocusDevice,
  onFocusObject,
  cameraControllerRef,
}: SceneOverlayProps) {
  const [activePanel, setActivePanel] = useState<RailPanelId | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);

  const togglePanel = (panel: RailPanelId) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  useEffect(() => {
    if (!tools.selection) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      tools.removeSelected();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tools.selection, tools.removeSelected]);

  return (
    <>
      <div className="scene-overlay-top-right">
        <Compass headingDeg={cameraHeadingDeg} onResetNorth={onResetNorth} />
        <SceneRail
          activePanel={activePanel}
          onTogglePanel={togglePanel}
          layers={tools.layers}
          onToggleLayer={tools.toggleLayer}
          worldObjects={worldObjects}
          devices={devices}
          goals={goals}
          tasks={tasks}
          markers={tools.markers}
          measurements={tools.measurements}
          areas={tools.areas}
          onFocusDevice={onFocusDevice}
          onFocusObject={onFocusObject}
          measureActive={tools.activeTool === 'measure'}
          onActivateMeasure={() => tools.setActiveTool('measure')}
        />
      </div>

      {tools.settings.showAxes ? (
        <div className="scene-overlay-bottom-right">
          <CoordinateAxes
            headingDeg={cameraHeadingDeg}
            pitchDeg={cameraPitchDeg}
            controllerRef={cameraControllerRef}
          />
        </div>
      ) : null}

      <SceneEditToolbar
        activeTool={tools.activeTool}
        markerKind={tools.markerKind}
        areaKind={tools.areaKind}
        measureMode={tools.measureMode}
        draftAreaPointCount={tools.draftArea.length}
        awaitingMeasureSecond={Boolean(tools.draftMeasurement)}
        selection={tools.selection}
        onSelectTool={tools.setActiveTool}
        onPickMarkerKind={tools.setMarkerKind}
        onPickAreaKind={tools.setAreaKind}
        onPickMeasureMode={tools.setMeasureMode}
        onFinishArea={tools.finishArea}
        onClear={tools.clearAll}
        onRemoveSelected={tools.removeSelected}
        onClearSelection={() => tools.selectOverlay(null)}
        onOpenSettings={() => setSettingsOpen((open) => !open)}
        settingsOpen={settingsOpen}
        settingsButtonRef={settingsButtonRef}
      />

      <SceneSettingsPanel
        open={settingsOpen}
        settings={tools.settings}
        onChange={tools.updateSettings}
        onClose={() => setSettingsOpen(false)}
        triggerRef={settingsButtonRef}
      />
    </>
  );
}
