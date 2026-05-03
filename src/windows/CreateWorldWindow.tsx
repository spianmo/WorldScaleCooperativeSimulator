import { useState } from 'react';
import { FiRefreshCw, FiSave, FiSliders } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { useSimulation } from '../state';
import type { GenerateWorldInput } from '../api';

export function CreateWorldWindow() {
  const { t } = useTranslation();
  const { state, generateWorld } = useSimulation();
  const createDefaultName = () => t('createWorldWindow.defaultName', { suffix: Date.now().toString().slice(-4) });
  const [name, setName] = useState(createDefaultName);
  const [seed, setSeed] = useState(Date.now());
  const [objectDensity, setObjectDensity] = useState(0.22);
  const [sizeX, setSizeX] = useState(140);
  const [sizeY, setSizeY] = useState(80);
  const [sizeZ, setSizeZ] = useState(140);
  const [status, setStatus] = useState(t('createWorldWindow.statusWaiting'));

  const submit = () => {
    const input: GenerateWorldInput['input'] = {
      name: name.trim() || createDefaultName(),
      seed,
      object_density: objectDensity,
      size: { x: sizeX, y: sizeY, z: sizeZ },
    };

    setStatus(t('createWorldWindow.statusCreating'));
    void generateWorld(input)
      .then(() => setStatus(t('createWorldWindow.statusCreated', { name: input.name })))
      .catch((error) => setStatus(error instanceof Error ? error.message : t('createWorldWindow.statusFailed')));
  };

  return (
    <div className="sim-page sim-page-grid">
      <Toolbar
        title={t('createWorldWindow.title')}
        subtitle={t('createWorldWindow.subtitle')}
        actions={[
          { id: 'reset', icon: <FiRefreshCw />, label: t('createWorldWindow.reset'), onClick: () => {
            setName(createDefaultName());
            setSeed(Date.now());
            setObjectDensity(0.22);
            setSizeX(140);
            setSizeY(80);
            setSizeZ(140);
            setStatus(t('createWorldWindow.statusReset'));
          } },
          { id: 'create', icon: <FiSave />, label: t('createWorldWindow.create'), onClick: submit },
        ]}
      >
        <span className="sim-chip">{t('createWorldWindow.currentWorld', { name: state.world.name })}</span>
        <span className="sim-chip">{t('createWorldWindow.objects', { count: state.world.objects.length })}</span>
      </Toolbar>

      <section className="sim-panel sim-dialog-panel">
        <div className="sim-section-title">
          <FiSliders />
          <span>{t('createWorldWindow.section')}</span>
        </div>

        <div className="sim-scroll-list grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <label className="grid gap-1.5 text-xs text-sim-muted">
            {t('createWorldWindow.name')}
            <input value={name} onChange={(event) => setName(event.target.value)} className="sim-field" />
          </label>
          <NumberField label={t('createWorldWindow.seed')} value={seed} onChange={setSeed} min={1} max={9999999999999} />
          <NumberField label={t('createWorldWindow.objectDensity')} value={objectDensity} onChange={setObjectDensity} min={0.05} max={0.65} step={0.01} />
          <NumberField label={t('createWorldWindow.widthX')} value={sizeX} onChange={setSizeX} min={40} max={500} />
          <NumberField label={t('createWorldWindow.heightY')} value={sizeY} onChange={setSizeY} min={20} max={240} />
          <NumberField label={t('createWorldWindow.depthZ')} value={sizeZ} onChange={setSizeZ} min={40} max={500} />
        </div>

        <div className="sim-row flex justify-between gap-3 px-3.5 py-3">
          <span>{t('createWorldWindow.status')}</span>
          <strong>{status}</strong>
        </div>

        <button type="button" className="sim-primary-button justify-self-start" onClick={submit}>
          {t('createWorldWindow.create')}
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
