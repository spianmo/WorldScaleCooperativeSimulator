import { FiArrowLeft, FiMapPin, FiRotateCcw } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { WorldScene } from '../components/WorldScene';
import { TelemetryChart, type TelemetrySeries } from '../components/TelemetryChart';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';

export interface DeviceWindowProps {
  deviceId: string;
  deviceName?: string;
  telemetry?: TelemetrySeries[];
  logs?: TerminalEntry[];
}

const defaultTelemetry: TelemetrySeries[] = [
  {
    id: 'battery',
    label: 'Battery',
    color: '#1e8e3e',
    points: [
      { x: Date.now() - 60_000, y: 92 },
      { x: Date.now() - 45_000, y: 91 },
      { x: Date.now() - 30_000, y: 89 },
      { x: Date.now() - 15_000, y: 88 },
      { x: Date.now(), y: 87 },
    ],
  },
  {
    id: 'signal',
    label: 'Signal',
    color: '#1a73e8',
    points: [
      { x: Date.now() - 60_000, y: 62 },
      { x: Date.now() - 45_000, y: 58 },
      { x: Date.now() - 30_000, y: 65 },
      { x: Date.now() - 15_000, y: 68 },
      { x: Date.now(), y: 70 },
    ],
  },
];

const defaultLogs: TerminalEntry[] = [
  { timestamp: new Date(Date.now() - 21_000), level: 'info', source: 'Device', message: '__device_log_camera__' },
  { timestamp: new Date(Date.now() - 14_000), level: 'debug', source: 'Pose', message: '__device_log_pose__' },
  { timestamp: new Date(Date.now() - 8_000), level: 'success', source: 'Link', message: '__device_log_link__' },
];

export function DeviceWindow({
  deviceId,
  deviceName = 'Device',
  telemetry = defaultTelemetry,
  logs = defaultLogs,
}: DeviceWindowProps) {
  const { t } = useTranslation();
  const { state, appendLog } = useSimulation();
  const device = state.devices.find((item) => item.id === deviceId);
  const resolvedDeviceName = device?.name ?? deviceName;
  const resolvedTelemetry = device
    ? [
        {
          id: 'battery',
          label: t('chart.series.battery'),
          color: '#1e8e3e',
          points: [
            { x: Date.now() - 40_000, y: Math.max(0, device.telemetry.batteryPercent - 3) },
            { x: Date.now() - 20_000, y: Math.max(0, device.telemetry.batteryPercent - 1) },
            { x: Date.now(), y: device.telemetry.batteryPercent },
          ],
        },
        {
          id: 'signal',
          label: t('chart.series.signal'),
          color: '#1a73e8',
          points: [
            { x: Date.now() - 40_000, y: Math.max(0, device.telemetry.signalStrength - 4) },
            { x: Date.now() - 20_000, y: Math.max(0, device.telemetry.signalStrength - 2) },
            { x: Date.now(), y: device.telemetry.signalStrength },
          ],
        },
      ]
    : telemetry;
  const resolvedLogs = logs === defaultLogs
    ? state.logs
        .filter((entry) => !entry.details || entry.details === deviceId)
        .slice(-30)
        .map((entry) => ({
          id: entry.id,
          timestamp: entry.timestamp,
          level: entry.level === 'trace' ? 'debug' : entry.level,
          source: entry.scope,
          message: entry.message,
        }))
    : logs.map((entry) => ({
        ...entry,
        message: entry.message === '__device_log_camera__'
          ? t('deviceWindow.defaultLogCamera')
          : entry.message === '__device_log_pose__'
            ? t('deviceWindow.defaultLogPose')
            : entry.message === '__device_log_link__'
              ? t('deviceWindow.defaultLogLink')
              : entry.message,
      }));
  const devicePosition = (device?.telemetry.position ?? [1.8, 0.1, -0.4]) as [number, number, number];
  const deviceRotation = [0, device ? (device.telemetry.headingDeg / 180) * Math.PI : -0.4, 0] as [number, number, number];

  return (
    <div className="sim-page sim-page-grid">
      <Toolbar
        title={t('deviceWindow.title', { name: resolvedDeviceName, id: deviceId || t('deviceWindow.unknownId') })}
        subtitle={t('deviceWindow.subtitle', { status: device?.status ?? t('common.unknown') })}
        actions={[
          { id: 'back', icon: <FiArrowLeft />, label: t('common.back'), onClick: () => window.history.back() },
          { id: 'pin', icon: <FiMapPin />, label: t('deviceWindow.pin'), onClick: () => appendLog({ level: 'info', scope: 'device', message: t('deviceWindow.pinLog', { name: resolvedDeviceName }), details: deviceId }) },
        ]}
      >
        <span className="sim-chip">DeviceWindow</span>
        <span className="sim-chip">Local Axes</span>
        <span className="sim-chip">ID: {deviceId}</span>
      </Toolbar>

      <div
        className="sim-responsive-grid sim-device-layout grid grid-cols-[minmax(0,1.35fr)_minmax(340px,0.9fr)] items-stretch gap-4"
      >
        <div className="sim-window-column grid-rows-[minmax(0,1fr)_240px]">
          <WorldScene
            deviceName={resolvedDeviceName}
            deviceKind={device?.kind}
            devicePosition={devicePosition}
            deviceRotation={deviceRotation}
            cameraPosition={[6.8, 4.9, 6.8]}
            worldLabel="World axes"
            deviceLabel={`${resolvedDeviceName} local axes`}
            minHeight="100%"
            objects={state.world.objects}
            devices={state.devices.filter((item) => item.id !== deviceId)}
            showAxes={state.world.coordinateSystemVisible}
          />
          <TelemetryChart title={t('deviceWindow.telemetryTitle')} subtitle={t('deviceWindow.telemetrySubtitle')} unit="%" targetValue={75} series={resolvedTelemetry} />
        </div>

        <div className="sim-window-column grid-rows-[minmax(0,1fr)_280px]">
          <section className="sim-panel sim-panel-scroll">
            <div className="sim-section-title">
              <FiRotateCcw />
              <span>{t('deviceWindow.summary')}</span>
            </div>

            <div className="sim-scroll-list grid gap-2.5">
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.id')}</span>
                <strong>{deviceId}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.status')}</span>
                <strong>{device?.status ?? t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.battery')}</span>
                <strong>{device?.telemetry.batteryPercent ?? 0}%</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.position')}</span>
                <strong>{device ? device.telemetry.position.map((value) => value.toFixed(1)).join(', ') : t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.speed')}</span>
                <strong>{device ? `${device.telemetry.speedMps.toFixed(1)} m/s` : t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.power')}</span>
                <strong>{device ? `${Math.round(device.telemetry.powerW)} W` : t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.task')}</span>
                <strong>{device?.currentTaskId ?? t('deviceWindow.idle')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.slopeCapability')}</span>
                <strong>{device ? `${device.physicalProfile.maxSlopeDeg}°` : t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.workHeight')}</span>
                <strong>{device ? `${device.physicalProfile.minWorkAltitudeM}-${device.physicalProfile.maxWorkAltitudeM}m` : t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.material')}</span>
                <strong>{device ? device.physicalProfile.supportedMaterials.join('/') : t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.jointAngles')}</span>
                <strong>{device ? device.telemetry.jointAnglesDeg.slice(0, 6).join(' / ') : t('common.unknown')}</strong>
              </div>
              <div className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[13px] text-sim-muted">{t('deviceWindow.quaternion')}</span>
                <strong>{device?.telemetry.jointQuaternion?.map((value) => value.toFixed(2)).join(' / ') ?? t('common.unknown')}</strong>
              </div>
            </div>
          </section>

          <TerminalLog title={t('deviceWindow.logTitle')} entries={resolvedLogs} />
        </div>
      </div>
    </div>
  );
}
