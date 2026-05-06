import { FiArrowLeft, FiMapPin, FiRotateCcw, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { WorldScene, mapDeviceTelemetryPosition } from '../components/WorldScene';
import { TelemetryChart, type TelemetrySeries } from '../components/TelemetryChart';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';
import { closeDialogWindow, startDialogWindowDrag } from '../utils';
import terminalLogoMarkUrl from '../../assets/design/logo.png';

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
  const sceneDevicePosition = mapDeviceTelemetryPosition(devicePosition);
  const headingRad = device ? (device.telemetry.headingDeg / 180) * Math.PI : -0.4;
  const forward = [Math.cos(headingRad), 0, Math.sin(headingRad)] as [number, number, number];
  const eyeHeight = device?.kind === 'drone' ? 0.62 : device?.kind === 'sensor_node' ? 0.34 : 0.92;
  const cameraPosition = [
    sceneDevicePosition[0] + forward[0] * 0.32,
    sceneDevicePosition[1] + eyeHeight,
    sceneDevicePosition[2] + forward[2] * 0.32,
  ] as [number, number, number];
  const cameraTarget = [
    cameraPosition[0] + forward[0] * 5.2,
    cameraPosition[1] - 0.08,
    cameraPosition[2] + forward[2] * 5.2,
  ] as [number, number, number];

  const summaryRows: Array<{ label: string; value: string }> = [
    { label: t('deviceWindow.id'), value: deviceId || t('deviceWindow.unknownId') },
    { label: t('deviceWindow.status'), value: device?.status ?? t('common.unknown') },
    { label: t('deviceWindow.battery'), value: `${device?.telemetry.batteryPercent ?? 0}%` },
    {
      label: t('deviceWindow.position'),
      value: device ? device.telemetry.position.map((value) => value.toFixed(1)).join(', ') : t('common.unknown'),
    },
    { label: t('deviceWindow.speed'), value: device ? `${device.telemetry.speedMps.toFixed(1)} m/s` : t('common.unknown') },
    { label: t('deviceWindow.power'), value: device ? `${Math.round(device.telemetry.powerW)} W` : t('common.unknown') },
    { label: t('deviceWindow.task'), value: device?.currentTaskId ?? t('deviceWindow.idle') },
    { label: t('deviceWindow.slopeCapability'), value: device ? `${device.physicalProfile.maxSlopeDeg}°` : t('common.unknown') },
    {
      label: t('deviceWindow.workHeight'),
      value: device ? `${device.physicalProfile.minWorkAltitudeM}-${device.physicalProfile.maxWorkAltitudeM}m` : t('common.unknown'),
    },
    {
      label: t('deviceWindow.material'),
      value: device ? device.physicalProfile.supportedMaterials.join('/') : t('common.unknown'),
    },
    {
      label: t('deviceWindow.jointAngles'),
      value: device ? device.telemetry.jointAnglesDeg.slice(0, 6).join(' / ') : t('common.unknown'),
    },
    {
      label: t('deviceWindow.quaternion'),
      value: device?.telemetry.jointQuaternion?.map((value) => value.toFixed(2)).join(' / ') ?? t('common.unknown'),
    },
  ];

  return (
    <div className="terminal-detail-page">
      <section
        className="terminal-detail-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-window-title"
      >
        <header
          className="terminal-detail-header"
          onMouseDown={(event) => {
            if (event.button === 0 && event.target === event.currentTarget) {
              startDialogWindowDrag();
            }
          }}
        >
          <div className="terminal-detail-brand" onMouseDown={startDialogWindowDrag}>
            <img src={terminalLogoMarkUrl} alt="" />
            <span className="brand-wordmark">
              <span className="brand-wordmark-prefix">Terminal</span>
              <span className="brand-wordmark-suffix">Link</span>
            </span>
          </div>
          <div className="terminal-detail-title-block" onMouseDown={startDialogWindowDrag}>
            <h1 id="device-window-title">
              {t('deviceWindow.title', { name: resolvedDeviceName, id: deviceId || t('deviceWindow.unknownId') })}
            </h1>
            <p>{t('deviceWindow.subtitle', { status: device?.status ?? t('common.unknown') })}</p>
          </div>
          <div className="terminal-detail-chip-row">
            <span className="terminal-detail-chip">DeviceWindow</span>
            <span className="terminal-detail-chip">Cesium 3D Tiles</span>
            <span className="terminal-detail-chip">ID: {deviceId || t('deviceWindow.unknownId')}</span>
          </div>
          <div className="terminal-detail-actions">
            <button
              type="button"
              className="terminal-detail-action"
              onClick={() => window.history.back()}
            >
              <FiArrowLeft />
              {t('common.back')}
            </button>
            <button
              type="button"
              className="terminal-detail-action terminal-detail-action-primary"
              onClick={() =>
                appendLog({
                  level: 'info',
                  scope: 'device',
                  message: t('deviceWindow.pinLog', { name: resolvedDeviceName }),
                  details: deviceId,
                })
              }
            >
              <FiMapPin />
              {t('deviceWindow.pin')}
            </button>
          </div>
          <button
            type="button"
            className="terminal-detail-close"
            aria-label={t('common.close')}
            onClick={() => closeDialogWindow()}
          >
            <FiX />
          </button>
        </header>

        <main className="terminal-detail-body" data-cols="2-wide">
          <div className="terminal-detail-panel-column" data-rows="split-tall-bottom">
            <WorldScene
              deviceName={resolvedDeviceName}
              deviceKind={device?.kind}
              devicePosition={sceneDevicePosition}
              deviceRotation={deviceRotation}
              cameraPosition={cameraPosition}
              cameraTarget={cameraTarget}
              cameraMode="first_person"
              minHeight="100%"
              objects={state.world.objects}
              devices={state.devices.filter((item) => item.id !== deviceId)}
              weather={state.world.terrain}
              showAxes={state.world.coordinateSystemVisible}
              hidePrimaryDevice
              tickIntervalMs={state.settings.tickIntervalMs}
              googleMapsApiKey={state.settings.maps.googleMaps.apiKey}
              cesiumIonToken={state.settings.maps.cesiumIon.token}
            />
            <TelemetryChart
              title={t('deviceWindow.telemetryTitle')}
              subtitle={t('deviceWindow.telemetrySubtitle')}
              unit="%"
              targetValue={75}
              series={resolvedTelemetry}
            />
          </div>

          <div className="terminal-detail-panel-column" data-rows="split-bottom">
            <section className="terminal-detail-panel">
              <div className="terminal-detail-section-header">
                <h2>
                  <FiRotateCcw />
                  <span>{t('deviceWindow.summary')}</span>
                </h2>
              </div>

              <div className="terminal-detail-panel-body">
                {summaryRows.map((row) => (
                  <div key={row.label} className="terminal-detail-row">
                    <em>{row.label}</em>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <TerminalLog title={t('deviceWindow.logTitle')} entries={resolvedLogs} />
          </div>
        </main>
      </section>
    </div>
  );
}
