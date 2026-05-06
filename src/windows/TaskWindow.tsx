import { FiCheckCircle, FiClock, FiList, FiX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { TelemetryChart, type TelemetrySeries } from '../components/TelemetryChart';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';
import { closeDialogWindow, startDialogWindowDrag } from '../utils';
import terminalLogoMarkUrl from '../../assets/design/logo.png';

export interface TaskWindowProps {
  taskId: string;
  taskName?: string;
  telemetry?: TelemetrySeries[];
  logs?: TerminalEntry[];
}

const defaultTelemetry: TelemetrySeries[] = [
  {
    id: 'progress',
    label: 'Progress',
    color: '#1a73e8',
    points: [
      { x: Date.now() - 60_000, y: 18 },
      { x: Date.now() - 45_000, y: 28 },
      { x: Date.now() - 30_000, y: 46 },
      { x: Date.now() - 15_000, y: 64 },
      { x: Date.now(), y: 81 },
    ],
  },
];

const defaultLogs: TerminalEntry[] = [];

export function TaskWindow({ taskId, taskName = 'Task', telemetry = defaultTelemetry, logs = defaultLogs }: TaskWindowProps) {
  const { t } = useTranslation();
  const { state, appendLog } = useSimulation();
  const task = state.tasks.find((item) => item.id === taskId);
  const goalTasks = task?.goalId ? state.tasks.filter((item) => item.goalId === task.goalId) : state.tasks.slice(0, 4);
  const resolvedTelemetry = task
    ? [
        {
          id: 'progress',
          label: t('chart.series.progress'),
          color: '#1a73e8',
          points: [
            { x: Date.now() - 45_000, y: Math.max(0, task.progress * 100 - 20) },
            { x: Date.now() - 20_000, y: Math.max(0, task.progress * 100 - 8) },
            { x: Date.now(), y: Math.round(task.progress * 100) },
          ],
        },
      ]
    : telemetry;
  const resolvedLogs = logs === defaultLogs
    ? state.logs.slice(-30).map((entry) => ({
        id: entry.id,
        timestamp: entry.timestamp,
        level: entry.level === 'trace' ? 'debug' : entry.level,
        source: entry.scope,
        message: entry.message,
      }))
    : logs;

  return (
    <div className="terminal-detail-page">
      <section
        className="terminal-detail-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-window-title"
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
            <h1 id="task-window-title">
              {t('taskWindow.title', { title: task?.title ?? taskName, id: taskId || 'unknown' })}
            </h1>
            <p>{t('taskWindow.subtitle', { status: task?.status ?? t('common.unknown') })}</p>
          </div>
          <div className="terminal-detail-chip-row">
            <span className="terminal-detail-chip">TaskWindow</span>
            <span className="terminal-detail-chip">Subtasks</span>
            <span className="terminal-detail-chip">Timeline</span>
          </div>
          <div className="terminal-detail-actions">
            <button
              type="button"
              className="terminal-detail-action terminal-detail-action-primary"
              onClick={() =>
                appendLog({
                  level: 'info',
                  scope: 'task',
                  message: t('taskWindow.completeLog', { title: task?.title ?? taskId }),
                  details: taskId,
                })
              }
            >
              <FiCheckCircle />
              {t('taskWindow.markComplete')}
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
          <section className="terminal-detail-panel">
            <div className="terminal-detail-section-header">
              <h2>
                <FiList />
                <span>{t('taskWindow.list')}</span>
              </h2>
              <span>{goalTasks.length}</span>
            </div>

            <div className="terminal-detail-panel-body">
              {goalTasks.length ? (
                goalTasks.map((item) => (
                  <div
                    key={item.id}
                    className="terminal-detail-task-row"
                    data-status={item.status}
                  >
                    <span className="terminal-detail-task-status">{item.status}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.description || item.kind}</small>
                    </div>
                    <FiClock />
                  </div>
                ))
              ) : (
                <div className="terminal-detail-hint">{t('taskWindow.empty')}</div>
              )}
            </div>
          </section>

          <div className="terminal-detail-panel-column" data-rows="split-double">
            <TelemetryChart
              title={t('taskWindow.telemetryTitle')}
              subtitle={t('taskWindow.telemetrySubtitle')}
              unit="%"
              targetValue={100}
              series={resolvedTelemetry}
            />
            <TerminalLog title={t('taskWindow.logTitle')} entries={resolvedLogs} />
          </div>
        </main>
      </section>
    </div>
  );
}
