import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
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
  const [roamActive, setRoamActive] = useState(false);
  const roamRafRef = useRef<number | null>(null);
  const cameraHeadingRef = useRef(cameraHeadingDeg);
  const cameraPitchRef = useRef(cameraPitchDeg);

  useEffect(() => {
    cameraHeadingRef.current = cameraHeadingDeg;
  }, [cameraHeadingDeg]);
  useEffect(() => {
    cameraPitchRef.current = cameraPitchDeg;
  }, [cameraPitchDeg]);

  const togglePanel = (panel: RailPanelId) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const stopRoam = useCallback(() => {
    if (roamRafRef.current !== null) {
      cancelAnimationFrame(roamRafRef.current);
      roamRafRef.current = null;
    }
    cameraControllerRef?.current?.endOrbit();
    setRoamActive(false);
  }, [cameraControllerRef]);

  const startRoam = useCallback(() => {
    const controller = cameraControllerRef?.current;
    if (!controller) {
      return;
    }
    if (!controller.beginOrbit()) {
      return;
    }
    let heading = cameraHeadingRef.current;
    const initialPitch = cameraPitchRef.current;
    const pitch = initialPitch >= -5 ? -25 : initialPitch;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      heading = (heading + dt * 8 + 360) % 360;
      controller.setOrbit(heading, pitch);
      roamRafRef.current = requestAnimationFrame(tick);
    };
    roamRafRef.current = requestAnimationFrame(tick);
    setRoamActive(true);
  }, [cameraControllerRef]);

  const toggleRoam = useCallback(() => {
    if (roamActive) {
      stopRoam();
    } else {
      startRoam();
    }
  }, [roamActive, startRoam, stopRoam]);

  useEffect(() => {
    return () => {
      if (roamRafRef.current !== null) {
        cancelAnimationFrame(roamRafRef.current);
        roamRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!roamActive) {
      return undefined;
    }
    const interrupt = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLCanvasElement) {
        stopRoam();
      }
    };
    window.addEventListener('wheel', interrupt, { capture: true, passive: true });
    window.addEventListener('pointerdown', interrupt, true);
    return () => {
      window.removeEventListener('wheel', interrupt, true);
      window.removeEventListener('pointerdown', interrupt, true);
    };
  }, [roamActive, stopRoam]);

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
          onActivateMeasure={() => {
            if (roamActive) {
              stopRoam();
            }
            tools.setActiveTool('measure');
          }}
          roamActive={roamActive}
          onToggleRoam={toggleRoam}
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
