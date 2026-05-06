import { useEffect, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FiX } from 'react-icons/fi';
import type { SceneSettings } from './sceneTypes';

export interface SceneSettingsPanelProps {
  open: boolean;
  settings: SceneSettings;
  onClose: () => void;
  onChange: (patch: Partial<SceneSettings>) => void;
  triggerRef?: RefObject<HTMLElement | null>;
}

interface ToggleRow {
  key: keyof SceneSettings;
  group: 'lighting' | 'materials' | 'grid' | 'axes' | 'paths' | 'performance';
}

const TOGGLES: ToggleRow[] = [
  { key: 'shadows', group: 'lighting' },
  { key: 'hdr', group: 'lighting' },
  { key: 'highQualityMaterials', group: 'materials' },
  { key: 'showGrid', group: 'grid' },
  { key: 'showAxes', group: 'axes' },
  { key: 'showDevicePaths', group: 'paths' },
  { key: 'showPerformance', group: 'performance' },
];

export function SceneSettingsPanel({ open, settings, onClose, onChange, triggerRef }: SceneSettingsPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current && panelRef.current.contains(target)) {
        return;
      }
      if (triggerRef?.current && triggerRef.current.contains(target)) {
        return;
      }
      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, onClose, triggerRef]);

  if (!open) {
    return null;
  }

  return (
    <aside
      ref={panelRef}
      className="scene-settings-panel"
      aria-label={t('worldWindowExtra.scene.settings.aria')}
      role="dialog"
    >
      <header>
        <strong>{t('worldWindowExtra.scene.configure3D')}</strong>
        <button type="button" aria-label={t('common.close')} onClick={onClose}>
          <FiX aria-hidden="true" />
        </button>
      </header>

      <ul className="scene-settings-list">
        {TOGGLES.map((row) => (
          <li key={row.key}>
            <label>
              <span className="scene-settings-row-label">
                <strong>{t(`worldWindowExtra.scene.settings.${row.key}.label`)}</strong>
                <small>{t(`worldWindowExtra.scene.settings.${row.key}.description`)}</small>
              </span>
              <input
                type="checkbox"
                checked={Boolean(settings[row.key])}
                onChange={(event) =>
                  onChange({ [row.key]: event.target.checked } as Partial<SceneSettings>)
                }
              />
            </label>
          </li>
        ))}

        <li className="scene-settings-slider">
          <label>
            <span className="scene-settings-row-label">
              <strong>{t('worldWindowExtra.scene.settings.maxScreenSpaceError.label')}</strong>
              <small>{t('worldWindowExtra.scene.settings.maxScreenSpaceError.description')}</small>
            </span>
            <input
              type="range"
              min={2}
              max={32}
              step={1}
              value={settings.maxScreenSpaceError}
              onChange={(event) => onChange({ maxScreenSpaceError: Number(event.target.value) })}
            />
            <span className="scene-settings-slider-value">{settings.maxScreenSpaceError}</span>
          </label>
        </li>
      </ul>
    </aside>
  );
}
