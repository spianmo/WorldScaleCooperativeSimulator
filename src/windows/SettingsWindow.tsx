import { useEffect, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@tauri-apps/api/core';
import {
  FiClock,
  FiDatabase,
  FiFileText,
  FiGlobe,
  FiInfo,
  FiMoon,
  FiRotateCcw,
  FiSave,
  FiShare2,
  FiTrash2,
  FiX,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../state';
import type { LocaleCode, LogLevel, SimulationSettings, ThemeMode } from '../types';
import {
  clearTileCache,
  getTileCacheConfig,
  getTileCacheStats,
  setTileCacheConfig,
  type TileCacheStats,
} from '../api';
import terminalLogoMarkUrl from '../../assets/design/logo.png';

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
      className={`create-settings-switch ${checked ? 'create-settings-switch-on' : ''}`}
      onClick={onChange}
    >
      <span className="create-settings-switch-thumb" />
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
    <div className="create-settings-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-pressed={active}
            className={active ? 'create-settings-segmented-active' : undefined}
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
      className={`create-settings-value-button ${active ? 'create-settings-value-button-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 2 : 1)} ${units[unitIndex]}`;
}

const cacheActionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const proxyInputStyle: React.CSSProperties = {
  width: 360,
  maxWidth: '100%',
  fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
};

interface SettingItem {
  label: string;
  value: string;
  active?: boolean;
  control: ReactNode;
}

interface SettingGroup {
  title: string;
  hint: string;
  icon: ReactNode;
  items: SettingItem[];
}

export function SettingsWindow({ title = 'Settings' }: SettingsWindowProps) {
  const { t } = useTranslation();
  const { state, setThemeMode, setLocale, setSettings, setWorld, saveWorldSnapshot, resetState, appendLog } = useSimulation();
  const [snapshotStatus, setSnapshotStatus] = useState(t('settingsWindow.status.unsaved'));
  const [statusMessage, setStatusMessage] = useState(t('settingsWindow.subtitle'));
  const [cacheStats, setCacheStats] = useState<TileCacheStats | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [maxBytesGbInput, setMaxBytesGbInput] = useState<string>('5');
  const [ttlDaysInput, setTtlDaysInput] = useState<string>('30');
  const [savedMaxBytesGb, setSavedMaxBytesGb] = useState<string>('5');
  const [savedTtlDays, setSavedTtlDays] = useState<string>('30');
  const [proxyUrlInput, setProxyUrlInput] = useState<string>('');
  const [savedProxyUrl, setSavedProxyUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    void Promise.all([getTileCacheStats(), getTileCacheConfig()])
      .then(([stats, config]) => {
        if (!active) return;
        setCacheStats(stats);
        const gb = (config.max_bytes / 1024 ** 3).toFixed(2);
        const ttl = String(config.ttl_days);
        setMaxBytesGbInput(gb);
        setTtlDaysInput(ttl);
        setSavedMaxBytesGb(gb);
        setSavedTtlDays(ttl);
        const proxy = config.proxy_url ?? '';
        setProxyUrlInput(proxy);
        setSavedProxyUrl(proxy);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const refreshCacheStats = () => {
    if (cacheBusy) return;
    setCacheBusy(true);
    void getTileCacheStats()
      .then(setCacheStats)
      .catch(() => undefined)
      .finally(() => setCacheBusy(false));
  };

  const handleClearCache = () => {
    if (cacheBusy) return;
    setCacheBusy(true);
    void clearTileCache()
      .then((stats) => {
        setCacheStats(stats);
        appendLog({ level: 'info', scope: 'cache', message: t('settingsWindow.cache.cleared') });
        setStatusMessage(t('settingsWindow.cache.cleared'));
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(t('settingsWindow.cache.clearFailed', { error: message }));
      })
      .finally(() => setCacheBusy(false));
  };

  const isProxyUrlValid = (raw: string) => {
    if (raw === '') return true;
    return /^(https?|socks5h?):\/\/[^\s]+$/i.test(raw);
  };

  const toggleCoordinateSystem = () => {
    setWorld({
      ...state.world,
      coordinateSystemVisible: !state.world.coordinateSystemVisible,
    });
  };

  const saveSnapshot = () => {
    void saveWorldSnapshot(`settings_${state.world.id}_${Date.now()}`)
      .then((result) => {
        const text = t('settingsWindow.status.savedPath', { path: result.path });
        setSnapshotStatus(text);
        setStatusMessage(text);
      })
      .catch((error) => {
        const text = error instanceof Error ? error.message : t('settingsWindow.status.saveFailed');
        setSnapshotStatus(text);
        setStatusMessage(text);
      });
  };

  const markSettingsSaved = () => {
    const trimmedProxy = proxyUrlInput.trim();
    if (!isProxyUrlValid(trimmedProxy)) {
      setStatusMessage(t('settingsWindow.proxy.invalidUrl'));
      return;
    }
    const parsedGb = Number.parseFloat(maxBytesGbInput);
    const parsedTtl = Number.parseInt(ttlDaysInput, 10);
    if (!Number.isFinite(parsedGb) || parsedGb <= 0 || !Number.isFinite(parsedTtl) || parsedTtl < 0) {
      setStatusMessage(t('settingsWindow.cache.invalidInput'));
      return;
    }
    const proxyChanged = trimmedProxy !== savedProxyUrl;
    const cacheChanged = maxBytesGbInput !== savedMaxBytesGb || ttlDaysInput !== savedTtlDays;
    if (!proxyChanged && !cacheChanged) {
      appendLog({ level: 'info', scope: 'settings', message: t('settingsWindow.status.savedLog') });
      setStatusMessage(t('settingsWindow.status.savedLog'));
      return;
    }
    setCacheBusy(true);
    void setTileCacheConfig({
      max_bytes: Math.round(parsedGb * 1024 ** 3),
      ttl_days: parsedTtl,
      proxy_url: trimmedProxy === '' ? undefined : trimmedProxy,
    })
      .then((stats) => {
        setCacheStats(stats);
        setSavedProxyUrl(trimmedProxy);
        setSavedMaxBytesGb(maxBytesGbInput);
        setSavedTtlDays(ttlDaysInput);
        if (proxyChanged) {
          appendLog({
            level: 'info',
            scope: 'settings',
            message: trimmedProxy === ''
              ? t('settingsWindow.proxy.savedEmpty')
              : t('settingsWindow.proxy.savedWith', { url: trimmedProxy }),
          });
          setStatusMessage(t('settingsWindow.proxy.savedRestartHint'));
        } else {
          appendLog({ level: 'info', scope: 'settings', message: t('settingsWindow.cache.saved') });
          setStatusMessage(t('settingsWindow.cache.saved'));
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setStatusMessage(proxyChanged
          ? t('settingsWindow.proxy.saveFailed', { error: message })
          : t('settingsWindow.cache.saveFailed', { error: message }));
      })
      .finally(() => setCacheBusy(false));
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
      hint: `${t('settingsWindow.items.themeMode')} · ${t('settingsWindow.items.language')} · ${t('settingsWindow.items.logDensity')}`,
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
      hint: `${t('settingsWindow.items.autosave')} · ${t('settingsWindow.items.tickInterval')} · ${t('settingsWindow.items.saveSnapshot')}`,
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
      hint: `${t('settingsWindow.items.showAxes')} · ${t('settingsWindow.items.logLevel')} · ${t('settingsWindow.items.recordD3Refresh')}`,
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
              onClick={() => {
                appendLog({ level: 'debug', scope: 'settings', message: t('settingsWindow.status.d3Logged') });
                setStatusMessage(t('settingsWindow.status.d3Logged'));
              }}
            />
          ),
        },
      ],
    },
    {
      title: t('settingsWindow.groups.proxy'),
      hint: t('settingsWindow.proxy.hint'),
      icon: <FiShare2 />,
      items: [
        {
          label: t('settingsWindow.proxy.url'),
          value: proxyUrlInput.trim() !== savedProxyUrl
            ? t('settingsWindow.proxy.pendingApply')
            : savedProxyUrl === ''
              ? t('settingsWindow.proxy.notConfigured')
              : t('settingsWindow.proxy.savedValue', { url: savedProxyUrl }),
          active: savedProxyUrl !== '' || proxyUrlInput.trim() !== savedProxyUrl,
          control: (
            <input
              type="text"
              className="create-settings-input"
              style={proxyInputStyle}
              value={proxyUrlInput}
              placeholder="http://127.0.0.1:7890 / socks5://127.0.0.1:1080"
              onChange={(event) => setProxyUrlInput(event.target.value)}
              aria-label={t('settingsWindow.proxy.url')}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
            />
          ),
        },
      ],
    },
    {
      title: t('settingsWindow.groups.tileCache'),
      hint: t('settingsWindow.cache.hint'),
      icon: <FiDatabase />,
      items: [
        {
          label: t('settingsWindow.cache.usage'),
          value: cacheStats
            ? t('settingsWindow.cache.usageValue', {
                size: formatBytes(cacheStats.sizeBytes),
                files: cacheStats.fileCount,
              })
            : t('settingsWindow.cache.loading'),
          active: cacheStats ? cacheStats.sizeBytes > 0 : false,
          control: (
            <div style={cacheActionRowStyle}>
              <button
                type="button"
                className="create-settings-secondary-button"
                onClick={refreshCacheStats}
                disabled={cacheBusy}
              >
                {t('settingsWindow.cache.refresh')}
              </button>
              <button
                type="button"
                className="create-settings-secondary-button"
                onClick={handleClearCache}
                disabled={cacheBusy}
              >
                <FiTrash2 />
                {t('settingsWindow.cache.clear')}
              </button>
            </div>
          ),
        },
        {
          label: t('settingsWindow.cache.maxSize'),
          value: maxBytesGbInput !== savedMaxBytesGb
            ? t('settingsWindow.cache.pendingApply')
            : t('settingsWindow.cache.maxSizeValue', { gb: maxBytesGbInput }),
          active: maxBytesGbInput !== savedMaxBytesGb,
          control: (
            <input
              type="number"
              min="0.1"
              step="0.5"
              className="create-settings-input"
              value={maxBytesGbInput}
              onChange={(event) => setMaxBytesGbInput(event.target.value)}
              aria-label={t('settingsWindow.cache.maxSize')}
            />
          ),
        },
        {
          label: t('settingsWindow.cache.ttl'),
          value: ttlDaysInput !== savedTtlDays
            ? t('settingsWindow.cache.pendingApply')
            : t('settingsWindow.cache.ttlValue', { days: ttlDaysInput }),
          active: ttlDaysInput !== savedTtlDays,
          control: (
            <input
              type="number"
              min="0"
              step="1"
              className="create-settings-input"
              value={ttlDaysInput}
              onChange={(event) => setTtlDaysInput(event.target.value)}
              aria-label={t('settingsWindow.cache.ttl')}
            />
          ),
        },
      ],
    },
  ];

  const closeDialog = () => {
    if (isTauri()) {
      void getCurrentWindow().close().catch(() => {
        window.location.hash = '#/world';
      });
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.hash = '#/world';
  };

  const startWindowDrag = () => {
    if (!isTauri()) {
      return;
    }

    void getCurrentWindow().startDragging().catch(() => undefined);
  };

  const dialogTitle = title === 'Settings' ? t('settingsWindow.title') : title;

  return (
    <div className="create-settings-dialog-page">
      <section
        className="create-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-settings-title"
      >
        <header
          className="create-settings-dialog-header"
          onMouseDown={(event) => {
            if (event.button === 0 && event.target === event.currentTarget) {
              startWindowDrag();
            }
          }}
        >
          <div className="create-settings-brand" onMouseDown={startWindowDrag}>
            <img src={terminalLogoMarkUrl} alt="" />
            <span className="brand-wordmark">
              <span className="brand-wordmark-prefix">Terminal</span>
              <span className="brand-wordmark-suffix">Link</span>
            </span>
          </div>
          <div className="create-settings-title-block" onMouseDown={startWindowDrag}>
            <h1 id="create-settings-title">{dialogTitle}</h1>
            <p>{t('settingsWindow.subtitle')}</p>
          </div>
          <div className="create-settings-context-chips" aria-label="settings-context">
            <span>{t('settingsWindow.chipTheme', { mode: selectedThemeLabel })}</span>
            <span>{t('settingsWindow.chipLocale', { locale: selectedLocaleLabel })}</span>
          </div>
          <button
            type="button"
            className="create-settings-close-button"
            aria-label={t('common.close')}
            onClick={closeDialog}
          >
            <FiX />
          </button>
        </header>

        <main className="create-settings-dialog-body">
          <section className="create-settings-form-panel">
            <div className="create-settings-form-scroll">
              {settingsGroups.map((group) => (
                <article key={group.title} className="create-settings-section">
                  <header className="create-settings-section-header">
                    <h2>
                      {group.icon}
                      <span>{group.title}</span>
                    </h2>
                    <span>{group.hint}</span>
                  </header>
                  <div className="create-settings-section-body">
                    {group.items.map((item) => (
                      <div key={item.label} className="create-settings-row">
                        <div className="create-settings-row-copy">
                          <span>{item.label}</span>
                          <em>{item.value}</em>
                        </div>
                        <div className="create-settings-row-control">{item.control}</div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <aside className="create-settings-summary-panel">
            <article className="create-settings-summary-card">
              <header>
                <FiFileText />
                <span>{t('settingsWindow.actions.currentSettings')}</span>
              </header>
              <pre className="create-settings-summary-pre">
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
            </article>

            <article className="create-settings-summary-card">
              <header>
                <FiMoon />
                <span>{t('settingsWindow.actions.quickSwitch')}</span>
              </header>
              <div className="create-settings-quick-switch">
                <button type="button" onClick={() => setLocale('zh-CN')}>{t('locale.zhCN')}</button>
                <button type="button" onClick={() => setLocale('en-US')}>{t('locale.enUS')}</button>
                <button type="button" onClick={() => setThemeMode('light')}>{t('theme.light')}</button>
                <button type="button" onClick={() => setThemeMode('dark')}>{t('theme.dark')}</button>
                <button type="button" onClick={() => setThemeMode('system')}>{t('theme.system')}</button>
              </div>
            </article>
          </aside>
        </main>

        <footer className="create-settings-dialog-footer">
          <button
            type="button"
            className="create-settings-secondary-button"
            onClick={closeDialog}
          >
            {t('common.cancel')}
          </button>
          <span className="create-settings-status" role="status">{statusMessage}</span>
          <div className="create-settings-footer-actions">
            <button
              type="button"
              className="create-settings-secondary-button"
              onClick={resetState}
            >
              <FiRotateCcw />
              {t('settingsWindow.resetSettings')}
            </button>
            <button
              type="button"
              className="create-settings-primary-button"
              onClick={markSettingsSaved}
            >
              <FiSave />
              {t('settingsWindow.saveSettings')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
