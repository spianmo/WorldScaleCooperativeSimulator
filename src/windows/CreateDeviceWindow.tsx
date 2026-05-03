import { useMemo, useState } from 'react';
import { FiCpu, FiRefreshCw, FiSave } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { useSimulation } from '../state';
import type { DeviceKind } from '../types';
import { createDevice, defaultProfile, deviceKinds, getDeviceKindLabel } from './deviceFormUtils';

export function CreateDeviceWindow() {
  const { t } = useTranslation();
  const { state, registerDevice } = useSimulation();
  const [selectedKind, setSelectedKind] = useState<DeviceKind>('wheeled_robot');
  const selectedProfile = useMemo(() => defaultProfile(selectedKind, state.physicalRules), [selectedKind, state.physicalRules]);
  const [batteryPercent, setBatteryPercent] = useState(100);
  const [nominalPowerW, setNominalPowerW] = useState(selectedProfile.nominalPowerW);
  const [workingPowerW, setWorkingPowerW] = useState(selectedProfile.workingPowerW);
  const [maxSpeedMps, setMaxSpeedMps] = useState(selectedProfile.maxSpeedMps);
  const [maxSlopeDeg, setMaxSlopeDeg] = useState(selectedProfile.maxSlopeDeg);
  const [status, setStatus] = useState(t('createDeviceWindow.statusWaiting'));

  const resetByKind = (kind: DeviceKind) => {
    const nextProfile = defaultProfile(kind, state.physicalRules);
    setSelectedKind(kind);
    setNominalPowerW(nextProfile.nominalPowerW);
    setWorkingPowerW(nextProfile.workingPowerW);
    setMaxSpeedMps(nextProfile.maxSpeedMps);
    setMaxSlopeDeg(nextProfile.maxSlopeDeg);
  };

  const submit = () => {
    const profile = {
      ...selectedProfile,
      nominalPowerW,
      workingPowerW,
      maxSpeedMps,
      maxSlopeDeg,
    };
    const device = createDevice(selectedKind, state.devices.length + 1, profile, batteryPercent);
    registerDevice(device);
    setStatus(t('createDeviceWindow.statusSubmitted', { name: device.name }));
  };

  return (
    <div className="sim-page sim-page-grid">
      <Toolbar
        title={t('createDeviceWindow.title')}
        subtitle={t('createDeviceWindow.subtitle')}
        actions={[
          { id: 'reset', icon: <FiRefreshCw />, label: t('createDeviceWindow.reset'), onClick: () => {
            resetByKind(selectedKind);
            setBatteryPercent(100);
            setStatus(t('createDeviceWindow.statusReset'));
          } },
          { id: 'create', icon: <FiSave />, label: t('createDeviceWindow.create'), onClick: submit },
        ]}
      >
        <span className="sim-chip">{t('createDeviceWindow.registered', { count: state.devices.length })}</span>
        <span className="sim-chip">{t('createDeviceWindow.rulesSynced')}</span>
      </Toolbar>

      <section className="sim-panel sim-dialog-panel">
        <div className="sim-section-title">
          <FiCpu />
          <span>{t('createDeviceWindow.section')}</span>
        </div>

        <div className="sim-scroll-list grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <label className="grid gap-1.5 text-xs text-sim-muted">
            {t('createDeviceWindow.deviceType')}
            <select
              value={selectedKind}
              onChange={(event) => resetByKind(event.target.value as DeviceKind)}
              className="sim-field"
            >
              {deviceKinds.map((kind) => <option key={kind} value={kind}>{getDeviceKindLabel(kind)}</option>)}
            </select>
          </label>
          <NumberField label={t('createDeviceWindow.battery')} value={batteryPercent} onChange={setBatteryPercent} min={1} max={100} />
          <NumberField label={t('createDeviceWindow.standbyPower')} value={nominalPowerW} onChange={setNominalPowerW} min={1} max={500} />
          <NumberField label={t('createDeviceWindow.workPower')} value={workingPowerW} onChange={setWorkingPowerW} min={1} max={900} />
          <NumberField label={t('createDeviceWindow.speed')} value={maxSpeedMps} onChange={setMaxSpeedMps} min={0} max={30} step={0.1} />
          <NumberField label={t('createDeviceWindow.maxSlope')} value={maxSlopeDeg} onChange={setMaxSlopeDeg} min={0} max={90} />
        </div>

        <div className="sim-row flex justify-between gap-3 px-3.5 py-3">
          <span>{t('createDeviceWindow.capabilityTags')}</span>
          <strong>{selectedKind === 'drone' ? 'aerial_move / photo / search' : selectedKind === 'sensor_node' ? 'sense / report' : 'ground_move / inspect / transport'}</strong>
        </div>
        <div className="sim-row flex justify-between gap-3 px-3.5 py-3">
          <span>{t('createDeviceWindow.status')}</span>
          <strong>{status}</strong>
        </div>

        <button type="button" className="sim-primary-button justify-self-start" onClick={submit}>
          {t('createDeviceWindow.submit')}
        </button>
      </section>
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
