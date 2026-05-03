import { useEffect, useState } from 'react';
import { FiActivity, FiCpu, FiEye, FiFolder, FiRefreshCw, FiSave, FiSettings, FiTarget } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { WorldScene } from '../components/WorldScene';
import { TelemetryChart, type TelemetrySeries } from '../components/TelemetryChart';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';
import type { WorldSnapshotRecord } from '../types';

export interface WorldWindowProps {
  worldName?: string;
  deviceName?: string;
  telemetry?: TelemetrySeries[];
  logs?: TerminalEntry[];
}

function toTerminalEntries(entries: ReturnType<typeof useSimulation>['state']['logs']): TerminalEntry[] {
  return entries.slice(-40).map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level === 'trace' ? 'debug' : entry.level,
    source: entry.scope,
    message: entry.message,
  }));
}

function buildTelemetry(state: ReturnType<typeof useSimulation>['state']): TelemetrySeries[] {
  const now = Date.now();
  const points = state.devices.map((device, index) => ({
    x: now - (state.devices.length - index) * 10_000,
    y: device.telemetry.batteryPercent,
  }));
  return [
    {
      id: 'battery',
      label: 'Battery',
      color: '#1a73e8',
      points: points.length ? points : [{ x: now, y: 0 }],
    },
    {
      id: 'task-progress',
      label: 'Progress',
      color: '#1e8e3e',
      points: state.tasks.length
        ? state.tasks.map((task, index) => ({ x: now - (state.tasks.length - index) * 10_000, y: Math.round(task.progress * 100) }))
        : [{ x: now, y: 0 }],
    },
  ];
}

export function WorldWindow({ worldName, deviceName, telemetry, logs }: WorldWindowProps) {
  const { t } = useTranslation();
  const { state, hydrated, openWindow, saveWorldSnapshot, listWorldSnapshots, openWorldSnapshot, appendLog } = useSimulation();
  const [snapshots, setSnapshots] = useState<WorldSnapshotRecord[]>([]);
  const [snapshotStatus, setSnapshotStatus] = useState(t('worldWindow.status.unread'));
  const [glassesOpened, setGlassesOpened] = useState(false);
  const primaryDevice = state.devices[0];
  const devicePosition = (primaryDevice?.telemetry.position ?? [2.4, 0.05, 1.2]) as [number, number, number];
  const deviceRotation = [0, primaryDevice ? (primaryDevice.telemetry.headingDeg / 180) * Math.PI : -0.45, 0] as [number, number, number];
  const resolvedWorldName = worldName ?? state.world.name;
  const resolvedDeviceName = deviceName ?? primaryDevice?.name ?? t('worldWindow.noDevice');
  const resolvedTelemetry = telemetry ?? buildTelemetry(state);
  if (!telemetry) {
    resolvedTelemetry[0].label = t('chart.series.battery');
    resolvedTelemetry[1].label = t('chart.series.taskProgress');
  }
  const resolvedLogs = logs ?? toTerminalEntries(state.logs);

  const refreshSnapshots = async () => {
    const records = await listWorldSnapshots();
    setSnapshots(records);
    setSnapshotStatus(records.length ? t('worldWindow.status.readCount', { count: records.length }) : t('worldWindow.status.noSnapshots'));
  };

  useEffect(() => {
    void refreshSnapshots().catch((error) => {
      setSnapshotStatus(error instanceof Error ? error.message : t('worldWindow.status.readFailed'));
    });
  }, []);

  useEffect(() => {
    if (!hydrated || glassesOpened) {
      return;
    }

    setGlassesOpened(true);
    void openWindow({
      label: 'ai-glasses',
      kind: 'glasses',
      route: '/glasses',
      title: t('worldWindow.glassesTitle'),
      width: 960,
      height: 760,
      focus: false,
    }).catch(() => undefined);
  }, [glassesOpened, hydrated, openWindow]);

  return (
    <div className="sim-page sim-page-flex">
      <Toolbar
        title={resolvedWorldName}
        subtitle={t('worldWindow.subtitle', { devices: state.devices.length, tasks: state.tasks.length })}
        actions={[
          {
            id: 'refresh',
            icon: <FiRefreshCw />,
            label: t('worldWindow.createWorld'),
            onClick: () =>
              void openWindow({
                label: 'create-world',
                kind: 'create_world',
                route: '/create-world',
                title: t('worldWindow.createWorld'),
                width: 760,
                height: 680,
              }),
          },
          {
            id: 'save',
            icon: <FiSave />,
            label: t('worldWindow.saveWorld'),
            onClick: () =>
              void saveWorldSnapshot(`world_${state.world.id}_${Date.now()}`)
                .then((result) => {
                  setSnapshotStatus(t('worldWindow.status.savedPath', { path: result.path }));
                  return refreshSnapshots();
                })
                .catch((error) => setSnapshotStatus(error instanceof Error ? error.message : t('worldWindow.status.saveFailed'))),
          },
          {
            id: 'open',
            icon: <FiFolder />,
            label: t('worldWindow.openLatestSnapshot'),
            disabled: snapshots.length === 0,
            onClick: () =>
              snapshots[0]
                ? void openWorldSnapshot(snapshots[0].snapshotName)
                    .then(() => {
                      setSnapshotStatus(t('worldWindow.status.opened', { name: snapshots[0].snapshotName }));
                      return refreshSnapshots();
                    })
                    .catch((error) => setSnapshotStatus(error instanceof Error ? error.message : t('worldWindow.status.openFailed')))
                : undefined,
          },
          {
            id: 'control',
            icon: <FiCpu />,
            label: t('worldWindow.openControl'),
            onClick: () =>
              void openWindow({
                label: 'hive-control',
                kind: 'control',
                route: '/control',
                title: t('worldWindow.controlTitle'),
                width: 1180,
                height: 820,
              }),
          },
          {
            id: 'glasses',
            icon: <FiEye />,
            label: t('worldWindow.openGlasses'),
            onClick: () =>
              void openWindow({
                label: 'ai-glasses',
                kind: 'glasses',
                route: '/glasses',
                title: t('worldWindow.glassesTitle'),
                width: 960,
                height: 760,
              }),
          },
          {
            id: 'settings',
            icon: <FiSettings />,
            label: t('worldWindow.settings'),
            onClick: () =>
              void openWindow({
                label: 'sim-settings',
                kind: 'settings',
                route: '/settings',
                title: t('worldWindow.settingsTitle'),
                width: 720,
                height: 640,
              }),
          },
          { id: 'target', icon: <FiTarget />, label: t('worldWindow.focusTarget'), onClick: () => appendLog({ level: 'info', scope: 'world', message: t('worldWindow.status.focused') }) },
        ]}
      >
        <span className="sim-chip">City Digital Twin</span>
        <span className="sim-chip">{t('worldWindow.slope', { value: state.world.terrain.slopeDeg })}</span>
        <span className="sim-chip">{t('worldWindow.weather', { value: state.world.terrain.weather })}</span>
        <span className="sim-chip">{t('worldWindow.physicalRules', { min: state.physicalRules.droneMinAltitudeM, max: state.physicalRules.droneMaxAltitudeM })}</span>
        <span className="sim-chip">{t('worldWindow.deviceChip', { name: resolvedDeviceName })}</span>
      </Toolbar>

      <div
        className="sim-responsive-world sim-world-layout grid grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)] items-stretch gap-4"
      >
        <div className="sim-window-column grid-rows-[minmax(0,1fr)_240px]">
          <WorldScene
            deviceName={resolvedDeviceName}
            deviceKind={primaryDevice?.kind}
            devicePosition={devicePosition}
            deviceRotation={deviceRotation}
            cameraPosition={[7.5, 5.8, 7.2]}
            minHeight="100%"
            objects={state.world.objects}
            devices={state.devices}
            showAxes={state.world.coordinateSystemVisible}
          />
          <TelemetryChart
            title={t('worldWindow.telemetryTitle')}
            subtitle={t('worldWindow.telemetrySubtitle')}
            unit="%"
            targetValue={75}
            series={resolvedTelemetry}
          />
        </div>

        <div className="sim-window-column grid-rows-[minmax(0,1fr)_280px]">
          <section className="sim-panel sim-panel-scroll sim-mobile-collapsible-panel">
            <div className="sim-section-title">
              <FiActivity />
              <span>{t('worldWindow.overview')}</span>
            </div>
            <div className="sim-scroll-area grid gap-2">
              <div className="flex items-center justify-between gap-3 border-t border-sim-border-soft py-2.5">
                <span className="text-[13px] text-sim-muted">{t('worldWindow.deviceCount')}</span>
                <strong className="text-sm text-sim-text">{state.devices.length}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-sim-border-soft py-2.5">
                <span className="text-[13px] text-sim-muted">{t('worldWindow.goalCount')}</span>
                <strong className="text-sm text-sim-text">{state.goals.length}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-sim-border-soft py-2.5">
                <span className="text-[13px] text-sim-muted">{t('worldWindow.objectCount')}</span>
                <strong className="text-sm text-sim-text">{state.world.objects.length}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-sim-border-soft py-2.5">
                <span className="text-[13px] text-sim-muted">{t('worldWindow.groundSlope')}</span>
                <strong className="text-sm text-sim-text">{state.world.terrain.slopeDeg}°</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-sim-border-soft py-2.5">
                <span className="text-[13px] text-sim-muted">{t('worldWindow.materials')}</span>
                <strong className="text-sm text-sim-text">{state.physicalRules.groundAllowedMaterials.join(' / ')}</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-sim-border-soft py-2.5">
                <span className="text-[13px] text-sim-muted">{t('worldWindow.droneHeight')}</span>
                <strong className="text-sm text-sim-text">{state.physicalRules.droneMinAltitudeM}-{state.physicalRules.droneMaxAltitudeM}m</strong>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-sim-border-soft py-2.5">
                <span className="text-[13px] text-sim-muted">{t('worldWindow.snapshotStatus')}</span>
                <strong className="text-sm text-sim-text">{snapshotStatus}</strong>
              </div>
              {snapshots.length ? (
                <div className="grid gap-2">
                  {snapshots.slice(0, 4).map((snapshot) => (
                    <button
                      type="button"
                      key={snapshot.snapshotName}
                      className="flex w-full cursor-pointer justify-between gap-3 border border-sim-border-soft bg-sim-row px-2.5 py-2 text-left text-xs text-sim-text"
                      onClick={() =>
                        void openWorldSnapshot(snapshot.snapshotName)
                          .then(() => setSnapshotStatus(t('worldWindow.status.opened', { name: snapshot.snapshotName })))
                          .catch((error) => setSnapshotStatus(error instanceof Error ? error.message : t('worldWindow.status.openFailed')))
                      }
                    >
                      <span>{snapshot.snapshotName}</span>
                      <span>{new Date(snapshot.modifiedAt).toLocaleTimeString()}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <TerminalLog title={t('worldWindow.worldLog')} entries={resolvedLogs} />
        </div>
      </div>
    </div>
  );
}
