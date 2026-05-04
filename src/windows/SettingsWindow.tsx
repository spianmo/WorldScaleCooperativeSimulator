import { useState, type ReactNode } from 'react';
import { FiClock, FiFileText, FiGlobe, FiInfo, FiMoon, FiRotateCcw, FiSave } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { useSimulation } from '../state';
import type { LocaleCode, LogLevel, SimulationSettings, ThemeMode } from '../types';

export interface SettingsWindowProps {
  title?: string;
}

const logLevelOrder: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
const tickIntervals = [500, 1000, 2000, 5000];
type TerminalLogDensity = SimulationSettings['terminalLogDensity'];
const densities: TerminalLogDensity[] = ['compact', 'normal', 'verbose'];

interface SettingOption<T extends string | number> {
  value: T;
  label: string;
}

interface OptionGroupProps<T extends string | number> {
  label: string;
  value: T;
  options: SettingOption<T>[];
  onChange: (value: T) => void;
}

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

function OptionGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: OptionGroupProps<T>) {
  return (
    <div className="sim-segmented-control" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            className="sim-segmented-option"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
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

interface SettingItem {
  label: string;
  value: string;
  active?: boolean;
  control: ReactNode;
}

interface SettingGroup {
  title: string;
  icon: ReactNode;
  items: SettingItem[];
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

  const themeOptions: SettingOption<ThemeMode>[] = [
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
    { value: 'system', label: t('theme.system') },
  ];
  const localeOptions: SettingOption<LocaleCode>[] = [
    { value: 'zh-CN', label: t('locale.zhCN') },
    { value: 'en-US', label: t('locale.enUS') },
  ];
  const densityOptions: SettingOption<TerminalLogDensity>[] = densities.map((density) => ({
    value: density,
    label: t(`settingsWindow.values.${density}`),
  }));
  const tickIntervalOptions: SettingOption<number>[] = tickIntervals.map((interval) => ({
    value: interval,
    label: `${interval} ms`,
  }));
  const logLevelOptions: SettingOption<LogLevel>[] = logLevelOrder.map((level) => ({
    value: level,
    label: t(`log.${level}`),
  }));
  const selectedThemeLabel = themeOptions.find((option) => option.value === state.settings.theme.mode)?.label ?? state.settings.theme.mode;
  const selectedLocaleLabel = localeOptions.find((option) => option.value === state.settings.locale)?.label ?? state.settings.locale;
  const selectedDensityLabel = densityOptions.find((option) => option.value === state.settings.terminalLogDensity)?.label ?? state.settings.terminalLogDensity;
  const selectedLogLevelLabel = logLevelOptions.find((option) => option.value === state.settings.logLevel)?.label ?? state.settings.logLevel;

  const settingsGroups: SettingGroup[] = [
    {
      title: t('settingsWindow.groups.interface'),
      icon: <FiGlobe />,
      items: [
        {
          label: t('settingsWindow.items.themeMode'),
          value: selectedThemeLabel,
          active: state.settings.theme.mode !== 'system',
          control: (
            <OptionGroup
              label={t('settingsWindow.items.themeMode')}
              value={state.settings.theme.mode}
              options={themeOptions}
              onChange={setThemeMode}
            />
          ),
        },
        {
          label: t('settingsWindow.items.language'),
          value: selectedLocaleLabel,
          active: state.settings.locale === 'zh-CN',
          control: (
            <OptionGroup
              label={t('settingsWindow.items.language')}
              value={state.settings.locale}
              options={localeOptions}
              onChange={setLocale}
            />
          ),
        },
        {
          label: t('settingsWindow.items.logDensity'),
          value: selectedDensityLabel,
          active: state.settings.terminalLogDensity !== 'normal',
          control: (
            <OptionGroup
              label={t('settingsWindow.items.logDensity')}
              value={state.settings.terminalLogDensity}
              options={densityOptions}
              onChange={(terminalLogDensity) => setSettings({ terminalLogDensity })}
            />
          ),
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
          control: (
            <SwitchControl
              label={t('settingsWindow.items.autosave')}
              checked={state.settings.autosaveEnabled}
              onChange={() => setSettings({ autosaveEnabled: !state.settings.autosaveEnabled })}
            />
          ),
        },
        {
          label: t('settingsWindow.items.tickInterval'),
          value: `${state.settings.tickIntervalMs} ms`,
          active: state.settings.tickIntervalMs !== 1000,
          control: (
            <OptionGroup
              label={t('settingsWindow.items.tickInterval')}
              value={state.settings.tickIntervalMs}
              options={tickIntervalOptions}
              onChange={(tickIntervalMs) => setSettings({ tickIntervalMs })}
            />
          ),
        },
        {
          label: t('settingsWindow.items.saveSnapshot'),
          value: snapshotStatus,
          active: snapshotStatus !== t('settingsWindow.status.unsaved'),
          control: (
            <ValueButton
              label={t('settingsWindow.actions.saveNow')}
              active={snapshotStatus !== t('settingsWindow.status.unsaved')}
              onClick={saveSnapshot}
            />
          ),
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
          control: (
            <SwitchControl
              label={t('settingsWindow.items.showAxes')}
              checked={state.world.coordinateSystemVisible}
              onChange={toggleCoordinateSystem}
            />
          ),
        },
        {
          label: t('settingsWindow.items.logLevel'),
          value: selectedLogLevelLabel,
          active: state.settings.logLevel !== 'info',
          control: (
            <OptionGroup
              label={t('settingsWindow.items.logLevel')}
              value={state.settings.logLevel}
              options={logLevelOptions}
              onChange={(logLevel) => setSettings({ logLevel })}
            />
          ),
        },
        {
          label: t('settingsWindow.items.recordD3Refresh'),
          value: t('settingsWindow.actions.writeLog'),
          active: false,
          control: (
            <ValueButton
              label={t('settingsWindow.actions.writeLog')}
              active={false}
              onClick={() => appendLog({ level: 'debug', scope: 'settings', message: t('settingsWindow.status.d3Logged') })}
            />
          ),
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
                <div key={item.label} className="sim-row sim-setting-row px-3 py-2.5">
                  <span className="sim-setting-copy grid min-w-0 gap-1">
                    <span className="text-sm">{item.label}</span>
                    <span className="break-words text-xs text-sim-muted">{item.value}</span>
                  </span>
                  <span className="sim-setting-control">{item.control}</span>
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
