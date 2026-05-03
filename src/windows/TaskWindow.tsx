import { FiCheckCircle, FiClock, FiList } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { Toolbar } from '../components/Toolbar';
import { TelemetryChart, type TelemetrySeries } from '../components/TelemetryChart';
import { TerminalLog, type TerminalEntry } from '../components/TerminalLog';
import { useSimulation } from '../state';

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
    <div className="sim-page sim-page-grid">
      <Toolbar
        title={t('taskWindow.title', { title: task?.title ?? taskName, id: taskId || 'unknown' })}
        subtitle={t('taskWindow.subtitle', { status: task?.status ?? t('common.unknown') })}
        actions={[
          { id: 'complete', icon: <FiCheckCircle />, label: t('taskWindow.markComplete'), onClick: () => appendLog({ level: 'info', scope: 'task', message: t('taskWindow.completeLog', { title: task?.title ?? taskId }), details: taskId }) },
        ]}
      >
        <span className="sim-chip">TaskWindow</span>
        <span className="sim-chip">Subtasks</span>
        <span className="sim-chip">Timeline</span>
      </Toolbar>

      <div
        className="sim-responsive-grid sim-task-layout grid grid-cols-[minmax(320px,0.92fr)_minmax(0,1.08fr)] items-stretch gap-4"
      >
        <section className="sim-panel sim-panel-scroll">
          <div className="sim-section-title">
            <FiList />
            <span>{t('taskWindow.list')}</span>
          </div>

          <div className="sim-scroll-list grid gap-2.5">
            {goalTasks.length ? goalTasks.map((item) => (
              <div key={item.id} className="sim-row flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className={item.status === 'completed' ? 'sim-status-completed' : 'sim-status-active'}>{item.status}</span>
                <span className="flex-1">{item.title}</span>
                <FiClock />
              </div>
            )) : <div className="text-sm text-sim-muted">{t('taskWindow.empty')}</div>}
          </div>
        </section>

        <div className="sim-window-column grid-rows-[240px_280px]">
          <TelemetryChart title={t('taskWindow.telemetryTitle')} subtitle={t('taskWindow.telemetrySubtitle')} unit="%" targetValue={100} series={resolvedTelemetry} />
          <TerminalLog title={t('taskWindow.logTitle')} entries={resolvedLogs} />
        </div>
      </div>
    </div>
  );
}
