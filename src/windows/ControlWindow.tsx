import { FiFilter, FiPlus, FiSettings, FiZap } from 'react-icons/fi';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { IconButton } from '../components/IconButton';
import { TelemetryChart, type TelemetrySeries } from '../components/TelemetryChart';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';
import { getDeviceKindLabel } from './deviceFormUtils';

export interface ControlWindowProps {
  telemetry?: TelemetrySeries[];
  logs?: TerminalEntry[];
}

const defaultTelemetry: TelemetrySeries[] = [
  {
    id: 'cpu',
    label: 'CPU',
    color: '#1a73e8',
    points: [
      { x: Date.now() - 60_000, y: 34 },
      { x: Date.now() - 45_000, y: 42 },
      { x: Date.now() - 30_000, y: 47 },
      { x: Date.now() - 15_000, y: 45 },
      { x: Date.now(), y: 51 },
    ],
  },
  {
    id: 'latency',
    label: 'Latency',
    color: '#f9ab00',
    points: [
      { x: Date.now() - 60_000, y: 18 },
      { x: Date.now() - 45_000, y: 21 },
      { x: Date.now() - 30_000, y: 19 },
      { x: Date.now() - 15_000, y: 24 },
      { x: Date.now(), y: 20 },
    ],
  },
];

const defaultLogs: TerminalEntry[] = [];
function toTerminalEntries(entries: ReturnType<typeof useSimulation>['state']['logs']): TerminalEntry[] {
  return entries.slice(-40).map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level === 'trace' ? 'debug' : entry.level,
    source: entry.scope,
    message: entry.message,
  }));
}

export function ControlWindow({ telemetry = defaultTelemetry, logs = defaultLogs }: ControlWindowProps) {
  const { t } = useTranslation();
  const { state, removeDevice, openWindow, updatePhysicalRules, appendLog } = useSimulation();
  const [droneMinAltitudeM, setDroneMinAltitudeM] = useState(state.physicalRules.droneMinAltitudeM);
  const [droneMaxAltitudeM, setDroneMaxAltitudeM] = useState(state.physicalRules.droneMaxAltitudeM);
  const [roverMaxSlopeDeg, setRoverMaxSlopeDeg] = useState(state.physicalRules.roverMaxSlopeDeg);
  const [humanoidMaxSlopeDeg, setHumanoidMaxSlopeDeg] = useState(state.physicalRules.humanoidMaxSlopeDeg);
  const [quadrupedMaxSlopeDeg, setQuadrupedMaxSlopeDeg] = useState(state.physicalRules.quadrupedMaxSlopeDeg);
  const [groundMaterials, setGroundMaterials] = useState(state.physicalRules.groundAllowedMaterials.join(','));
  const resolvedLogs = logs === defaultLogs ? toTerminalEntries(state.logs) : logs;
  const chartSeries = state.devices.length
    ? [
        {
          id: 'battery',
          label: t('chart.series.battery'),
          color: '#1a73e8',
          points: state.devices.map((device, index) => ({ x: Date.now() - (state.devices.length - index) * 10_000, y: device.telemetry.batteryPercent })),
        },
        {
          id: 'power',
          label: t('chart.series.power'),
          color: '#f9ab00',
          points: state.devices.map((device, index) => ({ x: Date.now() - (state.devices.length - index) * 10_000, y: device.telemetry.powerW })),
        },
      ]
    : telemetry;

  return (
    <div className="sim-page sim-page-flex">
      <Toolbar
        title={t('controlWindow.title')}
        subtitle={t('controlWindow.subtitle', { devices: state.devices.length, goals: state.goals.length, tasks: state.tasks.length })}
        actions={[
          {
            id: 'add',
            icon: <FiPlus />,
            label: t('controlWindow.addDevice'),
            onClick: () =>
              void openWindow({
                label: 'create-device',
                kind: 'create_device',
                route: '/create-device',
                title: t('controlWindow.createDeviceTitle'),
                width: 760,
                height: 720,
              }),
          },
          { id: 'filter', icon: <FiFilter />, label: t('controlWindow.filterView'), onClick: () => appendLog({ level: 'info', scope: 'control', message: t('controlWindow.logFilterRefreshed') }) },
        ]}
      >
        <span className="sim-chip">{t('controlWindow.slopeChip', { value: state.world.terrain.slopeDeg })}</span>
        <span className="sim-chip">{t('controlWindow.materialChip', { value: state.physicalRules.groundAllowedMaterials.join('/') })}</span>
        <span className="sim-chip">{t('controlWindow.taskChip', { count: state.tasks.length })}</span>
        <span className="sim-chip">D3 TelemetryChart</span>
      </Toolbar>

      <div
        className="sim-responsive-grid sim-control-layout grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-stretch gap-4"
      >
        <section className="sim-panel sim-panel-scroll">
          <div className="sim-section-title">
            <FiZap />
            <span>{t('controlWindow.sectionRules')}</span>
          </div>

          <div className="sim-scroll-area grid gap-4">
            <section className="grid gap-4 border-t border-sim-border-soft pt-4">
              <strong className="text-sm font-medium">{t('controlWindow.godRules')}</strong>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5">
                <NumberField label={t('controlWindow.droneMin')} value={droneMinAltitudeM} onChange={setDroneMinAltitudeM} min={0} max={120} />
                <NumberField label={t('controlWindow.droneMax')} value={droneMaxAltitudeM} onChange={setDroneMaxAltitudeM} min={1} max={300} />
                <NumberField label={t('controlWindow.roverSlope')} value={roverMaxSlopeDeg} onChange={setRoverMaxSlopeDeg} min={0} max={90} />
                <NumberField label={t('controlWindow.humanoidSlope')} value={humanoidMaxSlopeDeg} onChange={setHumanoidMaxSlopeDeg} min={0} max={90} />
                <NumberField label={t('controlWindow.quadrupedSlope')} value={quadrupedMaxSlopeDeg} onChange={setQuadrupedMaxSlopeDeg} min={0} max={90} />
                <label className="grid gap-1.5 text-xs text-sim-muted">
                  {t('controlWindow.groundMaterials')}
                  <input value={groundMaterials} onChange={(event) => setGroundMaterials(event.target.value)} className="sim-field" />
                </label>
              </div>
              <button
                type="button"
                className="sim-primary-button justify-self-start"
                onClick={() => void updatePhysicalRules({
                  droneMinAltitudeM,
                  droneMaxAltitudeM,
                  roverMaxSlopeDeg,
                  humanoidMaxSlopeDeg,
                  quadrupedMaxSlopeDeg,
                  groundAllowedMaterials: groundMaterials.split(',').map((item) => item.trim()).filter(Boolean),
                })}
              >
                {t('controlWindow.applyRules')}
              </button>
            </section>

            <div className="grid gap-2.5">
              {state.devices.length ? state.devices.map((device) => (
                <div key={device.id} className="sim-row flex items-center justify-between gap-4 px-3.5 py-3">
                  <div className="grid gap-1">
                    <strong className="text-sm">{device.name}</strong>
                    <span className="text-xs text-sim-muted">
                      {getDeviceKindLabel(device.kind)} · {device.status} · {t('controlWindow.speed', { value: device.telemetry.speedMps.toFixed(1) })}
                    </span>
                    <span className="text-xs text-sim-muted">
                      {t('controlWindow.position', { value: device.telemetry.position.map((value) => value.toFixed(1)).join(', ') })} ·
                      {t('controlWindow.power', { value: Math.round(device.telemetry.powerW) })} · {t('controlWindow.slopeCapability', { value: device.physicalProfile.maxSlopeDeg })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[13px] text-sim-text">{device.telemetry.batteryPercent}%</span>
                    <IconButton
                      icon={<FiSettings />}
                      label={t('controlWindow.openDevice', { name: device.name })}
                      onClick={() => appendLog({ level: 'info', scope: 'control', message: t('controlWindow.deviceTitle', { name: device.name }), details: device.id })}
                    />
                    <button type="button" onClick={() => removeDevice(device.id)} className="min-h-8 cursor-pointer rounded-[4px] border border-sim-danger-border bg-sim-danger-bg px-3 text-xs font-medium text-sim-danger">
                      {t('controlWindow.remove')}
                    </button>
                  </div>
                </div>
              )) : <div className="text-sm text-sim-muted">{t('controlWindow.emptyDevices')}</div>}
            </div>
          </div>
        </section>

        <div className="sim-window-column grid-rows-[minmax(0,0.9fr)_240px_280px]">
          <section className="sim-panel sim-panel-scroll">
            <div className="sim-section-title">
              <FiFilter />
              <span>{t('controlWindow.taskQueue')}</span>
            </div>
            <div className="sim-scroll-list grid gap-2.5">
              {state.tasks.length ? state.tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="sim-row flex w-full cursor-pointer justify-between gap-3 px-3 py-2.5 text-left"
                  onClick={() => appendLog({ level: 'info', scope: 'control', message: t('controlWindow.taskTitle', { title: task.title }), details: task.id })}
                >
                  <span>{task.title}</span>
                  <span>{task.status} · {Math.round(task.progress * 100)}%</span>
                </button>
              )) : <span className="text-sm text-sim-muted">{t('controlWindow.emptyTasks')}</span>}
            </div>
          </section>
          <TelemetryChart title={t('controlWindow.telemetryTitle')} subtitle={t('controlWindow.telemetrySubtitle')} series={chartSeries} unit="%" targetValue={75} />
          <TerminalLog title={t('controlWindow.logTitle')} entries={resolvedLogs} />
        </div>
      </div>
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
    <label className="grid gap-1.5 text-xs text-sim-muted">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="sim-field"
      />
    </label>
  );
}
