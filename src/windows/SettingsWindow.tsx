import { useState } from 'react';
import { FiClock, FiFileText, FiGlobe, FiInfo, FiMoon, FiRotateCcw, FiSave } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { useSimulation } from '../state';
import type { LogLevel } from '../types';

export interface SettingsWindowProps {
  title?: string;
}

const logLevelOrder: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
const tickIntervals = [500, 1000, 2000, 5000];
const densities = ['compact', 'normal', 'verbose'] as const;

interface SwitchControlProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

function SwitchControl({ label, checked, onChange }: SwitchControlProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="sim-switch"
      onClick={onChange}
    >
      <span className="sim-switch-thumb" />
    </button>
  );
}

interface ValueButtonProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

function ValueButton({ label, active, onClick }: ValueButtonProps) {
  return (
    <button
      type="button"
      className="sim-value-button"
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function SettingsWindow({ title = 'Settings' }: SettingsWindowProps) {
  const { t } = useTranslation();
  const { state, setThemeMode, setLocale, setSettings, setWorld, saveWorldSnapshot, resetState, appendLog } = useSimulation();
  const [snapshotStatus, setSnapshotStatus] = useState(t('settingsWindow.status.unsaved'));

  const toggleCoordinateSystem = () => {
    setWorld({
      ...state.world,
      coordinateSystemVisible: !state.world.coordinateSystemVisible,
    });
  };

  const saveSnapshot = () => {
    void saveWorldSnapshot(`settings_${state.world.id}_${Date.now()}`)
      .then((result) => setSnapshotStatus(t('settingsWindow.status.savedPath', { path: result.path })))
      .catch((error) => setSnapshotStatus(error instanceof Error ? error.message : t('settingsWindow.status.saveFailed')));
  };

  const markSettingsSaved = () => {
    appendLog({ level: 'info', scope: 'settings', message: t('settingsWindow.status.savedLog') });
  };

  const nextLogLevel = () => {
    const index = logLevelOrder.indexOf(state.settings.logLevel);
    setSettings({ logLevel: logLevelOrder[(index + 1) % logLevelOrder.length] });
  };

  const nextTickInterval = () => {
    const index = tickIntervals.indexOf(state.settings.tickIntervalMs);
    setSettings({ tickIntervalMs: tickIntervals[(index + 1) % tickIntervals.length] });
  };

  const nextDensity = () => {
    const index = densities.indexOf(state.settings.terminalLogDensity);
    setSettings({ terminalLogDensity: densities[(index + 1) % densities.length] });
  };

  const settingsGroups = [
    {
      title: t('settingsWindow.groups.interface'),
      icon: <FiGlobe />,
      items: [
        {
          label: t('settingsWindow.items.darkMode'),
          value: state.settings.theme.mode === 'dark' ? t('common.enabled') : t('common.disabled'),
          active: state.settings.theme.mode === 'dark',
          onClick: () => setThemeMode(state.settings.theme.mode === 'dark' ? 'light' : 'dark'),
          control: 'switch',
        },
        {
          label: t('settingsWindow.items.language'),
          value: state.settings.locale,
          active: state.settings.locale === 'zh-CN',
          onClick: () => setLocale(state.settings.locale === 'zh-CN' ? 'en-US' : 'zh-CN'),
        },
        {
          label: t('settingsWindow.items.logDensity'),
          value: state.settings.terminalLogDensity,
          active: state.settings.terminalLogDensity !== 'normal',
          onClick: nextDensity,
        },
      ],
    },
    {
      title: t('settingsWindow.groups.simulation'),
      icon: <FiClock />,
      items: [
        {
          label: t('settingsWindow.items.autosave'),
          value: state.settings.autosaveEnabled ? t('common.enabled') : t('common.disabled'),
          active: state.settings.autosaveEnabled,
          onClick: () => setSettings({ autosaveEnabled: !state.settings.autosaveEnabled }),
          control: 'switch',
        },
        {
          label: t('settingsWindow.items.tickInterval'),
          value: `${state.settings.tickIntervalMs} ms`,
          active: state.settings.tickIntervalMs !== 1000,
          onClick: nextTickInterval,
        },
        {
          label: t('settingsWindow.items.saveSnapshot'),
          value: snapshotStatus,
          active: snapshotStatus !== t('settingsWindow.status.unsaved'),
          onClick: saveSnapshot,
        },
      ],
    },
    {
      title: t('settingsWindow.groups.debug'),
      icon: <FiInfo />,
      items: [
        {
          label: t('settingsWindow.items.showAxes'),
          value: state.world.coordinateSystemVisible ? t('common.enabled') : t('common.disabled'),
          active: state.world.coordinateSystemVisible,
          onClick: toggleCoordinateSystem,
          control: 'switch',
        },
        {
          label: t('settingsWindow.items.logLevel'),
          value: state.settings.logLevel,
          active: state.settings.logLevel !== 'info',
          onClick: nextLogLevel,
        },
        {
          label: t('settingsWindow.items.recordD3Refresh'),
          value: t('settingsWindow.actions.writeLog'),
          active: false,
          onClick: () => appendLog({ level: 'debug', scope: 'settings', message: t('settingsWindow.status.d3Logged') }),
        },
      ],
    },
  ];

  return (
    <div className="sim-page sim-page-grid">
      <Toolbar
        title={title === 'Settings' ? t('settingsWindow.title') : title}
        subtitle={t('settingsWindow.subtitle')}
        actions={[
          { id: 'save', icon: <FiSave />, label: t('settingsWindow.saveSettings'), onClick: markSettingsSaved },
          { id: 'reset', icon: <FiRotateCcw />, label: t('settingsWindow.resetSettings'), onClick: resetState },
        ]}
      >
        <span className="sim-chip">SettingsWindow</span>
        <span className="sim-chip">{t('settingsWindow.chipTheme', { mode: state.settings.theme.mode })}</span>
        <span className="sim-chip">{t('settingsWindow.chipLocale', { locale: state.settings.locale })}</span>
      </Toolbar>

      <div
        className="sim-responsive-grid sim-settings-grid grid items-stretch gap-4"
      >
        {settingsGroups.map((group) => (
          <section key={group.title} className="sim-panel sim-panel-scroll">
            <div className="sim-section-title">
              {group.icon}
              <span>{group.title}</span>
            </div>

            <div className="sim-scroll-list grid gap-2.5">
              {group.items.map((item) => (
                <div key={item.label} className="sim-row flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="grid min-w-0 gap-1">
                    <span className="text-sm">{item.label}</span>
                    <span className="break-words text-xs text-sim-muted">{item.value}</span>
                  </span>
                  {item.control === 'switch' ? (
                    <SwitchControl label={item.label} checked={item.active} onChange={item.onClick} />
                  ) : (
                    <ValueButton label={t('common.switch')} active={item.active} onClick={item.onClick} />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="sim-panel sim-settings-actions">
          <div className="sim-section-title">
            <FiMoon />
            <span>{t('settingsWindow.actions.quickSwitch')}</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button className="sim-primary-button" onClick={() => setLocale('en-US')}>{t('locale.enUS')}</button>
            <button className="sim-primary-button" onClick={() => setLocale('zh-CN')}>{t('locale.zhCN')}</button>
            <button className="sim-primary-button" onClick={() => setThemeMode('light')}>{t('theme.light')}</button>
            <button className="sim-primary-button" onClick={() => setThemeMode('dark')}>{t('theme.dark')}</button>
            <button className="sim-primary-button" onClick={() => setThemeMode('system')}>{t('theme.system')}</button>
          </div>
        </section>

        <section className="sim-panel sim-settings-current">
          <div className="sim-section-title">
            <FiFileText />
            <span>{t('settingsWindow.actions.currentSettings')}</span>
          </div>
          <div className="sim-scroll-area max-h-[220px]">
            <pre className="m-0 whitespace-pre-wrap break-words text-xs leading-[1.55] text-sim-text">
{JSON.stringify({
  theme: state.settings.theme,
  locale: state.settings.locale,
  autosaveEnabled: state.settings.autosaveEnabled,
  tickIntervalMs: state.settings.tickIntervalMs,
  logLevel: state.settings.logLevel,
  terminalLogDensity: state.settings.terminalLogDensity,
  coordinateSystemVisible: state.world.coordinateSystemVisible,
}, null, 2)}
            </pre>
          </div>
        </section>
      </div>
    </div>
  );
}
