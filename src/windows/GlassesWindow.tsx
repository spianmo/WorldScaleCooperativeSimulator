import { useState } from 'react';
import { FiEye, FiMic, FiRefreshCw, FiSend, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { WorldScene } from '../components/WorldScene';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';
import type { SimulationGoal } from '../types';
import { closeDialogWindow, startDialogWindowDrag } from '../utils';
import terminalLogoMarkUrl from '../../assets/design/logo.png';

export interface GlassesWindowProps {
  transcript?: string[];
  logs?: TerminalEntry[];
}

const defaultTranscript = ['__default_glasses_transcript__'];

const defaultLogs: TerminalEntry[] = [
  { timestamp: new Date(Date.now() - 20_000), level: 'info', source: 'ASR', message: '__default_log_awake__' },
  { timestamp: new Date(Date.now() - 13_000), level: 'success', source: 'Mirror', message: '__default_log_mirror__' },
  { timestamp: new Date(Date.now() - 6_000), level: 'debug', source: 'Gateway', message: '__default_log_gateway__' },
];

function toTerminalEntries(entries: ReturnType<typeof useSimulation>['state']['logs']): TerminalEntry[] {
  return entries.slice(-30).map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level === 'trace' ? 'debug' : entry.level,
    source: entry.scope,
    message: entry.message,
  }));
}

export function GlassesWindow({ transcript = defaultTranscript, logs = defaultLogs }: GlassesWindowProps) {
  const { t } = useTranslation();
  const { state, submitGoal, appendLog } = useSimulation();
  const resolvedTranscript = transcript === defaultTranscript ? [t('glassesWindow.defaultTranscript')] : transcript;
  const [input, setInput] = useState(resolvedTranscript[0] ?? '');
  const mirrorLines = state.goals.slice(-5).map((goal) => `${goal.priority} · ${goal.title} · ${goal.status}`);
  const gazePosition = [1.8, 0.18, 0.8] as [number, number, number];

  const submitInput = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    const now = new Date().toISOString();
    const goal: SimulationGoal = {
      id: `goal-${Date.now()}`,
      title: trimmed.length > 32 ? `${trimmed.slice(0, 32)}...` : trimmed,
      description: trimmed,
      sourceText: trimmed,
      priority: /立即|紧急|最高|urgent|asap|immediate/i.test(trimmed) ? 'urgent' : 'high',
      status: 'queued',
      childTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };
    submitGoal(goal);
  };

  const renderedLogs = logs === defaultLogs && state.logs.length
    ? toTerminalEntries(state.logs)
    : logs.map((entry) => ({
        ...entry,
        message: entry.message === '__default_log_awake__'
          ? t('glassesWindow.defaultLogAwake')
          : entry.message === '__default_log_mirror__'
            ? t('glassesWindow.defaultLogMirror')
            : entry.message === '__default_log_gateway__'
              ? t('glassesWindow.defaultLogGateway')
              : entry.message,
      }));

  return (
    <div className="terminal-detail-page">
      <section
        className="terminal-detail-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="glasses-window-title"
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
            <h1 id="glasses-window-title">{t('glassesWindow.title')}</h1>
            <p>{t('glassesWindow.subtitle')}</p>
          </div>
          <div className="terminal-detail-chip-row">
            <span className="terminal-detail-chip">ASR</span>
            <span className="terminal-detail-chip">GlassesMirror</span>
            <span className="terminal-detail-chip">{t('glassesWindow.gateway')}</span>
            <span className="terminal-detail-chip">{t('glassesWindow.planning')}</span>
          </div>
          <div className="terminal-detail-actions">
            <button
              type="button"
              className="terminal-detail-action"
              onClick={() =>
                appendLog({ level: 'info', scope: 'glasses', message: t('glassesWindow.micReady') })
              }
            >
              <FiMic />
              {t('glassesWindow.mic')}
            </button>
            <button
              type="button"
              className="terminal-detail-action"
              onClick={() =>
                appendLog({ level: 'info', scope: 'glasses', message: t('glassesWindow.mirrorRefreshed') })
              }
            >
              <FiRefreshCw />
              {t('glassesWindow.refreshMirror')}
            </button>
            <button
              type="button"
              className="terminal-detail-action terminal-detail-action-primary"
              onClick={submitInput}
            >
              <FiSend />
              {t('glassesWindow.sendGoal')}
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

        <main className="terminal-detail-body" data-cols="2">
          <section className="terminal-detail-panel terminal-detail-panel-stack">
            <div className="terminal-detail-section-header">
              <h2>
                <FiEye />
                <span>{t('glassesWindow.asrTitle')}</span>
              </h2>
              <span>{mirrorLines.length || resolvedTranscript.length}</span>
            </div>

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={5}
              placeholder={t('glassesWindow.placeholder')}
              className="terminal-detail-textarea"
            />

            <div className="terminal-detail-panel-body">
              <div className="terminal-detail-hint">{t('glassesWindow.hint')}</div>

              <button
                type="button"
                onClick={submitInput}
                className="terminal-detail-action terminal-detail-action-primary"
              >
                <FiSend />
                {t('glassesWindow.sendToGateway')}
              </button>

              {(mirrorLines.length ? mirrorLines : resolvedTranscript).map((line, index) => (
                <div key={`${index}-${line}`} className="terminal-detail-mirror">
                  <b>{index + 1}</b>
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="terminal-detail-panel-column" data-rows="split-bottom">
            <WorldScene
              deviceName="Glasses Mirror"
              devicePosition={gazePosition}
              deviceRotation={[0, -0.9, 0]}
              cameraPosition={[2.1, 0.72, 1.05]}
              cameraTarget={[5.2, 0.58, -2.9]}
              cameraMode="first_person"
              minHeight="100%"
              objects={state.world.objects}
              devices={state.devices}
              weather={state.world.terrain}
              showAxes={state.world.coordinateSystemVisible}
              hidePrimaryDevice
              tickIntervalMs={state.settings.tickIntervalMs}
              googleMapsApiKey={state.settings.maps.googleMaps.apiKey}
              cesiumIonToken={state.settings.maps.cesiumIon.token}
            />
            <TerminalLog title={t('glassesWindow.logTitle')} entries={renderedLogs} />
          </div>
        </main>
      </section>
    </div>
  );
}
