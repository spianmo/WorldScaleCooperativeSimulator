import { useState } from 'react';
import { FiMic, FiSend, FiEye, FiRefreshCw } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { WorldScene } from '../components/WorldScene';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';
import type { SimulationGoal } from '../types';

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
      priority: /立即|紧急|最高|urgent/i.test(trimmed) ? 'urgent' : 'high',
      status: 'queued',
      childTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };
    submitGoal(goal);
  };

  return (
    <div className="sim-page sim-page-grid">
      <Toolbar
        title={t('glassesWindow.title')}
        subtitle={t('glassesWindow.subtitle')}
        actions={[
          { id: 'mic', icon: <FiMic />, label: t('glassesWindow.mic'), onClick: () => appendLog({ level: 'info', scope: 'glasses', message: t('glassesWindow.micReady') }) },
          { id: 'mirror', icon: <FiRefreshCw />, label: t('glassesWindow.refreshMirror'), onClick: () => appendLog({ level: 'info', scope: 'glasses', message: t('glassesWindow.mirrorRefreshed') }) },
          { id: 'send', icon: <FiSend />, label: t('glassesWindow.sendGoal'), onClick: submitInput },
        ]}
      >
        <span className="sim-chip">ASR</span>
        <span className="sim-chip">GlassesMirror</span>
        <span className="sim-chip">{t('glassesWindow.gateway')}</span>
        <span className="sim-chip">{t('glassesWindow.planning')}</span>
      </Toolbar>

      <div
        className="sim-responsive-grid sim-glasses-layout grid grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)] items-stretch gap-4"
      >
        <section className="sim-panel sim-panel-scroll">
          <div className="sim-section-title">
            <FiEye />
            <span>{t('glassesWindow.asrTitle')}</span>
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={5}
            placeholder={t('glassesWindow.placeholder')}
            className="sim-field resize-y leading-normal"
          />

          <div className="border border-[rgba(246,211,125,0.24)] bg-sim-panel-alt px-3 py-2.5 text-[13px] leading-normal text-sim-text">
            {t('glassesWindow.hint')}
          </div>

          <button type="button" onClick={submitInput} className="sim-primary-button">
            <FiSend />
            {t('glassesWindow.sendToGateway')}
          </button>

          <div className="sim-scroll-list grid gap-2.5">
            {(mirrorLines.length ? mirrorLines : resolvedTranscript).map((line, index) => (
              <div key={`${index}-${line}`} className="sim-row grid grid-cols-[28px_1fr] items-start gap-2.5 px-3 py-2.5">
                <span className="inline-grid h-6 w-6 place-items-center rounded-full bg-sim-primary text-xs font-medium text-white">{index + 1}</span>
                <span className="text-sm leading-[1.6]">{line}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="sim-window-column grid-rows-[minmax(0,1fr)_280px]">
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
          />
          <TerminalLog
            title={t('glassesWindow.logTitle')}
            entries={logs === defaultLogs && state.logs.length ? toTerminalEntries(state.logs) : logs.map((entry) => ({
              ...entry,
              message: entry.message === '__default_log_awake__'
                ? t('glassesWindow.defaultLogAwake')
                : entry.message === '__default_log_mirror__'
                  ? t('glassesWindow.defaultLogMirror')
                  : entry.message === '__default_log_gateway__'
                    ? t('glassesWindow.defaultLogGateway')
                    : entry.message,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
