import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  FiBell,
  FiBox,
  FiArrowDown,
  FiCloudRain,
  FiCpu,
  FiCrosshair,
  FiDroplet,
  FiGlobe,
  FiMapPin,
  FiMaximize2,
  FiMic,
  FiNavigation,
  FiPause,
  FiPlay,
  FiPlus,
  FiSend,
  FiSettings,
  FiShield,
  FiSkipForward,
  FiSliders,
  FiSun,
  FiTarget,
  FiThermometer,
  FiTrash2,
  FiUser,
  FiWind,
  FiWifi,
} from 'react-icons/fi';
import {
  GiDeliveryDrone,
  GiMovementSensor,
  GiRobotGolem,
  GiRobotLeg,
  GiTrackedRobot,
} from 'react-icons/gi';
import {
  TbAdjustmentsHorizontal,
  TbDeviceFloppy,
  TbStereoGlasses,
  TbWorldPlus,
} from 'react-icons/tb';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../components/IconButton';
import type { TerminalEntry } from '../components/TerminalLog';
import { WorldScene, mapDeviceTelemetryPosition } from '../components/WorldScene';
import { formatTime } from '../i18n';
import { useSimulation } from '../state';
import type { GoalPriority, SimulationDevice, SimulationGoal, SimulationTask } from '../types';
import thumbAutelEvoMaxUrl from '../../assets/design/device-thumb-autel-evo-max-4t.png';
import thumbDjiMatriceUrl from '../../assets/design/device-thumb-dji-matrice-30t.png';
import thumbDjiMavicUrl from '../../assets/design/device-thumb-dji-mavic-3e.png';
import thumbSensorHubUrl from '../../assets/design/device-thumb-wheeled-robot-w3.png';
import thumbUnitreeB2Url from '../../assets/design/device-thumb-unitree-b2.png';
import thumbUnitreeGo2Url from '../../assets/design/device-thumb-unitree-go2.png';
import thumbWalkerXUrl from '../../assets/design/device-thumb-walker-x.png';
import thumbWheeledRobotUrl from '../../assets/design/device-thumb-wheeled-robot-w3.png';
import terminalLogoMarkUrl from '../../assets/design/logo.png';

type ViewMode = 'global' | 'device' | 'human';
type DecisionStageId = 'intent' | 'decompose' | 'dispatch' | 'monitor' | 'evaluate';

const taskExamples = [
  '巡检解放路沿线并回传异常热区',
  '对桥面和主楼入口执行无人机外立面复核',
  '四足机器狗跟随地面机器人扫描低矮遮挡区',
];
const DESIGN_CLOCK = '14:32:18';
const DESIGN_CLOCK_SHORT = '14:32';
const DECISION_STAGES: Array<{ id: DecisionStageId; label: string }> = [
  { id: 'intent', label: '意图解析' },
  { id: 'decompose', label: '任务拆解' },
  { id: 'dispatch', label: '任务分发' },
  { id: 'monitor', label: '执行监控' },
  { id: 'evaluate', label: '结果评估' },
];
const DEVICE_THUMBS_BY_ID: Record<string, string> = {
  'default-dji-mavic-3e': thumbDjiMavicUrl,
  'default-autel-evo-max': thumbAutelEvoMaxUrl,
  'default-unitree-go2': thumbUnitreeGo2Url,
  'default-unitree-b2': thumbUnitreeB2Url,
  'default-walker-x': thumbWalkerXUrl,
  'default-wheeled-w3': thumbWheeledRobotUrl,
  'default-matrice-30t': thumbDjiMatriceUrl,
  'default-sensor-hub-a1': thumbSensorHubUrl,
};
const DEVICE_THUMBS_BY_NAME: Array<[RegExp, string]> = [
  [/mavic\s*3e/i, thumbDjiMavicUrl],
  [/evo\s*max\s*4t/i, thumbAutelEvoMaxUrl],
  [/unitree\s*go2/i, thumbUnitreeGo2Url],
  [/unitree\s*b2/i, thumbUnitreeB2Url],
  [/walker\s*x/i, thumbWalkerXUrl],
  [/(wheeled\s*robot\s*w3|keenon\s*w3)/i, thumbWheeledRobotUrl],
  [/matrice\s*30t/i, thumbDjiMatriceUrl],
];
const DEVICE_THUMBS_BY_KIND: Record<SimulationDevice['kind'], string> = {
  drone: thumbDjiMavicUrl,
  wheeled_robot: thumbWheeledRobotUrl,
  humanoid: thumbWalkerXUrl,
  quadruped: thumbUnitreeGo2Url,
  unitree_robot: thumbUnitreeGo2Url,
  sensor_node: thumbSensorHubUrl,
};

function weatherLabel(weather: string) {
  const labels: Record<string, string> = {
    sunny: '晴朗',
    cloudy: '多云',
    rainy: '降雨',
    foggy: '雾天',
    windy: '大风',
    stormy: '风暴',
  };
  return labels[weather] ?? '晴朗';
}

function formatClock(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return DESIGN_CLOCK;
  }
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '2024-05-27 MON';
  }
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][date.getDay()];
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${weekday}`;
}

function toTerminalEntries(entries: ReturnType<typeof useSimulation>['state']['logs']): TerminalEntry[] {
  return entries.slice(-48).map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    level: entry.level === 'trace' ? 'debug' : entry.level,
    source: entry.scope,
    message: entry.message,
  }));
}

function formatPosition(device: SimulationDevice) {
  return device.telemetry.position.map((value) => value.toFixed(1)).join(', ');
}

function deviceIcon(kind: SimulationDevice['kind']) {
  if (kind === 'drone') {
    return <GiDeliveryDrone />;
  }
  if (kind === 'quadruped' || kind === 'unitree_robot') {
    return <GiRobotLeg />;
  }
  if (kind === 'humanoid') {
    return <GiRobotGolem />;
  }
  if (kind === 'sensor_node') {
    return <GiMovementSensor />;
  }
  return <GiTrackedRobot />;
}

function deviceThumbUrl(device: SimulationDevice) {
  const directThumb = DEVICE_THUMBS_BY_ID[device.id];
  if (directThumb) {
    return directThumb;
  }

  // 新建同型号设备时没有默认 ID，通过名称兜底匹配真实设备缩略图。
  return DEVICE_THUMBS_BY_NAME.find(([pattern]) => pattern.test(device.name))?.[1] ?? DEVICE_THUMBS_BY_KIND[device.kind];
}

function deviceShortType(kind: SimulationDevice['kind']) {
  const labels: Record<SimulationDevice['kind'], string> = {
    drone: 'UAV | 无人机',
    wheeled_robot: '轮式机器人 | 迭代科技',
    humanoid: '人形机器人 | 优必选',
    quadruped: '四足机器人 | 宇树科技',
    unitree_robot: '宇树机器人 | 宇树科技',
    sensor_node: '传感节点 | 边缘感知',
  };
  return labels[kind];
}

function statusLabel(status: SimulationDevice['status']) {
  const labels: Record<SimulationDevice['status'], string> = {
    offline: '离线',
    idle: '待命',
    working: '执行中',
    error: '异常',
  };
  return labels[status];
}

function taskStatusLabel(status: SimulationTask['status']) {
  const labels: Record<SimulationTask['status'], string> = {
    queued: '排队中',
    active: '执行中',
    blocked: '阻塞',
    completed: '已完成',
    failed: '失败',
    canceled: '已取消',
  };
  return labels[status];
}

function taskRuntimeLabel(task: SimulationTask) {
  const designLabels: Record<string, string> = {
    'default-task-uav-scan': '巡检中',
    'default-task-ground-scan': '巡检中',
    'default-task-verify': '等待中',
  };
  return designLabels[task.id] ?? taskStatusLabel(task.status);
}

function priorityFromUi(value: 'normal' | 'high' | 'urgent'): GoalPriority {
  if (value === 'urgent') {
    return 'urgent';
  }
  if (value === 'high') {
    return 'high';
  }
  return 'normal';
}

function buildGatewayGoal(input: string, priority: GoalPriority): SimulationGoal {
  const now = new Date().toISOString();
  return {
    id: `goal-${Date.now()}`,
    title: input.length > 36 ? `${input.slice(0, 36)}...` : input,
    description: input,
    sourceText: input,
    priority,
    status: 'queued',
    childTaskIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function cameraForDevice(device: SimulationDevice | undefined): {
  position: [number, number, number];
  target: [number, number, number];
} {
  if (!device) {
    return {
      position: [8.6, 6.8, 8.2],
      target: [0, 0.2, 0],
    };
  }

  const scenePosition = mapDeviceTelemetryPosition(device.telemetry.position);
  const headingRad = (device.telemetry.headingDeg / 180) * Math.PI;
  const forward = [Math.cos(headingRad), Math.sin(headingRad)] as [number, number];
  const eyeHeight = device.kind === 'drone' ? 0.58 : device.kind === 'sensor_node' ? 0.3 : 0.82;
  const position = [
    scenePosition[0] + forward[0] * 0.38,
    scenePosition[1] + eyeHeight,
    scenePosition[2] + forward[1] * 0.38,
  ] as [number, number, number];

  return {
    position,
    target: [
      position[0] + forward[0] * 6.8,
      position[1] - 0.08,
      position[2] + forward[1] * 6.8,
    ],
  };
}

function taskProgress(task: SimulationTask) {
  const designProgress: Record<string, number> = {
    'default-task-uav-scan': 75,
    'default-task-ground-scan': 48,
    'default-task-verify': 0,
  };
  return designProgress[task.id] ?? Math.round(task.progress * 100);
}

function buildTimelineRows(devices: SimulationDevice[], tasks: SimulationTask[]) {
  return devices.slice(0, 3).map((device, index) => {
    const assigned = tasks.find((task) => task.assigneeDeviceId === device.id);
    const progress = assigned ? taskProgress(assigned) : device.status === 'working' ? 42 : 18 + index * 8;
    return {
      id: device.id,
      name: device.name,
      color: index === 0 ? '#1a73e8' : index === 1 ? '#f9ab00' : '#8e44ec',
      progress: Math.min(100, Math.max(8, progress)),
    };
  });
}

function pickCurrentGoal(goals: SimulationGoal[]) {
  for (let index = goals.length - 1; index >= 0; index -= 1) {
    const goal = goals[index];
    if (goal.status === 'active' || goal.status === 'queued') {
      return goal;
    }
  }

  return goals.at(-1);
}

function tasksForGoal(goal: SimulationGoal | undefined, tasks: SimulationTask[]) {
  if (!goal) {
    return tasks.filter((task) => task.status !== 'canceled' && task.status !== 'failed').slice(0, 4);
  }

  const goalTasks = tasks.filter((task) => task.goalId === goal.id || goal.childTaskIds.includes(task.id));
  return goalTasks.length ? goalTasks : tasks.filter((task) => task.status !== 'canceled' && task.status !== 'failed').slice(0, 4);
}

function activeStageProgress(stage: DecisionStageId, goalTasks: SimulationTask[]) {
  if (stage === 'intent') {
    return 100;
  }

  if (stage === 'decompose') {
    return goalTasks.length ? 100 : 0;
  }

  if (stage === 'dispatch') {
    return goalTasks.length ? Math.round((goalTasks.filter((task) => task.assigneeDeviceId).length / goalTasks.length) * 100) : 0;
  }

  if (stage === 'monitor') {
    return goalTasks.length ? Math.round((goalTasks.reduce((sum, task) => sum + task.progress, 0) / goalTasks.length) * 100) : 0;
  }

  return goalTasks.length ? Math.round((goalTasks.filter((task) => task.status === 'completed').length / goalTasks.length) * 100) : 0;
}

function decisionStageCopy(stage: DecisionStageId, goal: SimulationGoal | undefined, goalTasks: SimulationTask[], devices: SimulationDevice[]) {
  const assignedCount = goalTasks.filter((task) => task.assigneeDeviceId).length;
  const activeCount = goalTasks.filter((task) => task.status === 'active').length;
  const completedCount = goalTasks.filter((task) => task.status === 'completed').length;
  const deviceCount = new Set(goalTasks.map((task) => task.assigneeDeviceId).filter(Boolean)).size;

  if (stage === 'intent') {
    return {
      status: goal ? `${goal.priority} · ${goal.status}` : '等待目标',
      description: goal?.sourceText || goal?.description || '等待 AI 眼镜或控制台提交自然语言目标。',
      metrics: [`目标 ${goal ? 1 : 0}`, `关键词 ${goal ? Math.max(1, goal.sourceText.split(/\s+|，|,|。/).filter(Boolean).length) : 0}`, `优先级 ${goal?.priority ?? 'none'}`],
    };
  }

  if (stage === 'decompose') {
    return {
      status: `${goalTasks.length} 个子任务`,
      description: '展示群体智能网关把人类目标拆成可执行任务后的结构。',
      metrics: [`任务 ${goalTasks.length}`, `类型 ${new Set(goalTasks.map((task) => task.kind)).size}`, `阻塞 ${goalTasks.filter((task) => task.status === 'blocked').length}`],
    };
  }

  if (stage === 'dispatch') {
    return {
      status: `${assignedCount}/${goalTasks.length} 已分配`,
      description: '展示每个子任务与异构终端的绑定关系，分发依据来自设备能力标签和任务类型。',
      metrics: [`设备 ${deviceCount || devices.length}`, `未分配 ${Math.max(0, goalTasks.length - assignedCount)}`, `在线 ${devices.filter((device) => device.status !== 'offline').length}`],
    };
  }

  if (stage === 'monitor') {
    return {
      status: `${activeCount} 个执行中`,
      description: '展示当前任务进度、执行状态和对应终端的实时遥测入口。',
      metrics: [`执行中 ${activeCount}`, `平均 ${activeStageProgress(stage, goalTasks)}%`, `异常 ${devices.filter((device) => device.status === 'error').length}`],
    };
  }

  return {
    status: `${completedCount}/${goalTasks.length} 已完成`,
    description: '展示阶段性结果、完成率和未收敛任务，便于复盘协同闭环。',
    metrics: [`完成 ${completedCount}`, `未完成 ${Math.max(0, goalTasks.length - completedCount)}`, `收敛 ${activeStageProgress(stage, goalTasks)}%`],
  };
}

export function WorldWindow() {
  const { t } = useTranslation();
  const {
    state,
    openWindow,
    saveWorldSnapshot,
    listWorldSnapshots,
    appendLog,
    submitGoal,
    tickSimulation,
    resetState,
    setPhase,
  } = useSimulation();
  const [selectedDeviceId, setSelectedDeviceId] = useState(state.devices[0]?.id ?? '');
  const [viewMode, setViewMode] = useState<ViewMode>('global');
  const [query, setQuery] = useState('');
  const [taskInput, setTaskInput] = useState(taskExamples[0]);
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('high');
  const [activeDecisionStage, setActiveDecisionStage] = useState<DecisionStageId>('dispatch');
  const [snapshotStatus, setSnapshotStatus] = useState('未读取快照');
  const [pendingReset, setPendingReset] = useState(false);
  const [clearedLogScopes, setClearedLogScopes] = useState<Record<string, string>>({});
  const [gatewayEvents, setGatewayEvents] = useState<TerminalEntry[]>([
    {
      id: 'gateway-ready',
      timestamp: new Date(),
      level: 'info',
      source: 'gateway',
      message: '群体智能网关在线，等待自然语言目标。',
    },
  ]);
  const selectedDevice = state.devices.find((device) => device.id === selectedDeviceId) ?? state.devices[0];
  const timelineRows = useMemo(() => buildTimelineRows(state.devices, state.tasks), [state.devices, state.tasks]);
  const currentGoal = useMemo(() => pickCurrentGoal(state.goals), [state.goals]);
  const currentGoalTasks = useMemo(() => tasksForGoal(currentGoal, state.tasks), [currentGoal, state.tasks]);
  const activeDecisionStageMeta = DECISION_STAGES.find((stage) => stage.id === activeDecisionStage) ?? DECISION_STAGES[2];
  const activeDecisionStageCopy = useMemo(
    () => decisionStageCopy(activeDecisionStage, currentGoal, currentGoalTasks, state.devices),
    [activeDecisionStage, currentGoal, currentGoalTasks, state.devices],
  );
  const activeDecisionStagePercent = activeStageProgress(activeDecisionStage, currentGoalTasks);
  const filteredDevices = state.devices.filter((device) => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return `${device.name} ${device.kind} ${device.capabilityTags.join(' ')}`.toLowerCase().includes(keyword);
  });
  const camera = viewMode === 'device'
    ? cameraForDevice(selectedDevice)
    : viewMode === 'human'
      ? { position: [3.4, 1.2, 5.1] as [number, number, number], target: [0.1, 0.28, -2.8] as [number, number, number] }
      : { position: [10.8, 10.2, 10.6] as [number, number, number], target: [0, -0.2, 0] as [number, number, number] };
  const devicesInScene = viewMode === 'device' && selectedDevice
    ? state.devices.filter((device) => device.id !== selectedDevice.id)
    : state.devices;
  const systemLogs = toTerminalEntries(state.logs);
  const gatewayLogs = [...systemLogs.slice(-7), ...gatewayEvents].slice(-10);
  const missionId = 'MISSION-2024-0517-01';
  const worldMetadata = state.world.metadata ?? {};
  const worldStatus = 'Google 真实 3D 城市';
  const worldSource = 'Photorealistic 3D Tiles';
  const worldClock = formatClock(state.clock.wallClockAt);
  const worldDate = formatDateLabel(state.clock.wallClockAt);
  const temperature = worldMetadata.temperature_c ?? '26';
  const humidity = worldMetadata.humidity_percent ?? '45';
  useEffect(() => {
    if (!selectedDeviceId && state.devices[0]) {
      setSelectedDeviceId(state.devices[0].id);
    }
  }, [selectedDeviceId, state.devices]);

  useEffect(() => {
    void listWorldSnapshots()
      .then((records) => {
        setSnapshotStatus(records.length ? `已读取 ${records.length} 个快照` : '暂无已保存快照');
      })
      .catch((error) => {
        setSnapshotStatus(error instanceof Error ? error.message : '读取快照失败');
      });
  }, [listWorldSnapshots]);

  const sendGoal = () => {
    const input = taskInput.trim();
    if (!input) {
      return;
    }

    submitGoal(buildGatewayGoal(input, priorityFromUi(priority)));
    setGatewayEvents((current) => current.concat({
      id: `gateway-event-${Date.now()}`,
      timestamp: new Date(),
      level: priority === 'urgent' ? 'warn' : 'success',
      source: 'gateway',
      message: `群体智能网关已接收自然语言目标：${input}`,
    }).slice(-6));
    setTaskInput('');
  };

  const toggleSimulationPhase = () => {
    setPhase(state.phase === 'paused' ? 'running' : 'paused');
  };

  const requestResetWorld = () => {
    if (!pendingReset) {
      setPendingReset(true);
      appendLog({
        level: 'warn',
        scope: 'world',
        message: '重置世界需要确认：再次点击会恢复默认世界、设备、任务和设置。',
      });
      return;
    }

    resetState();
    setPendingReset(false);
    setSnapshotStatus('世界已重置为默认演示状态');
  };

  const clearDisplayedLogs = (scope: string) => {
    setClearedLogScopes((current) => ({
      ...current,
      [scope]: new Date().toISOString(),
    }));
  };

  return (
    <div className="sim-page terminal-dashboard">
      <header className="terminal-topbar">
        <div className="terminal-brand-block" aria-label="TerminalLink 群体智能协同仿真系统">
          <img src={terminalLogoMarkUrl} alt="" aria-hidden="true" />
          <div className="terminal-brand-copy">
            <strong>TerminalLink</strong>
            <span>群体智能协同仿真系统</span>
          </div>
        </div>

        <div className="terminal-status-strip" aria-label="世界状态与仿真控制">
          <StatusMetric label="世界状态" value={`${weatherLabel(state.world.terrain.weather)} ${temperature}°C`} icon={<FiSun />} />
          <StatusMetric label="时间" value={worldClock} note={worldDate} />
          <div className="terminal-speed-control" aria-label="仿真速度">
            <span>仿真速度</span>
            <button type="button" className="terminal-speed-pill" aria-label="推进仿真" onClick={() => void tickSimulation(1)}>
              <strong>1.0x</strong>
              <FiPlay />
            </button>
            <button type="button" className="terminal-speed-round" aria-label="暂停仿真" onClick={toggleSimulationPhase}><FiPause /></button>
            <button type="button" className="terminal-speed-round" aria-label="快进仿真" onClick={() => void tickSimulation(2)}><FiSkipForward /></button>
          </div>
          <StatusMetric label="风速" value={`${state.world.terrain.windMps ?? 3.2} m/s`} icon={<FiWind />} iconFirst />
        </div>

        <div className="terminal-operator-tools" aria-label="系统工具与操作员状态">
          <button type="button" className="terminal-top-icon-button" aria-label="通知">
            <FiBell />
            <span className="terminal-notification-badge">12</span>
          </button>
          <button type="button" className="terminal-top-icon-button" aria-label="全局语言与区域">
            <FiGlobe />
          </button>
          <button
            type="button"
            className="terminal-top-icon-button"
            aria-label="设置"
            onClick={() =>
              void openWindow({
                label: 'sim-settings',
                kind: 'settings',
                route: '/settings',
                title: '模拟器设置',
                width: 720,
                height: 640,
              })
            }
          >
            <FiSettings />
          </button>
          <button type="button" className="terminal-operator-card" aria-label="当前操作员在线">
            <span className="terminal-operator-copy">
              <strong>Operator</strong>
              <small>在线</small>
            </span>
            <span className="terminal-operator-avatar">
              <FiUser />
            </span>
          </button>
        </div>
      </header>

      <main className="terminal-main-grid">
        <aside className="terminal-device-panel">
          <div className="terminal-panel-header">
            <div>
              <h2>设备列表</h2>
              <span>全部 ({state.devices.length})</span>
            </div>
            <button
              type="button"
              className="terminal-compact-button"
              onClick={() =>
                void openWindow({
                  label: 'create-device',
                  kind: 'create_device',
                  route: '/create-device',
                  title: t('controlWindow.createDeviceTitle'),
                  width: 760,
                  height: 720,
                })
              }
            >
              <FiPlus />
              注册设备
            </button>
          </div>

          <div className="terminal-device-filters" aria-label="设备类型筛选统计">
            <span className="terminal-filter-chip terminal-filter-chip-active">全部 ({state.devices.length})</span>
            <span><GiDeliveryDrone /> {state.devices.filter((device) => device.kind === 'drone').length}</span>
            <span><GiTrackedRobot /> {state.devices.filter((device) => device.kind === 'wheeled_robot').length}</span>
            <span><GiRobotLeg /> {state.devices.filter((device) => device.kind === 'quadruped').length}</span>
            <span aria-label="宇树机器人">
              <img src={thumbUnitreeGo2Url} alt="" aria-hidden="true" className="terminal-filter-thumb" />
              {state.devices.filter((device) => device.kind === 'unitree_robot').length}
            </span>
            <span><GiRobotGolem /> {state.devices.filter((device) => device.kind === 'humanoid').length}</span>
            <span><GiMovementSensor /> {state.devices.filter((device) => device.kind === 'sensor_node').length}</span>
          </div>

          <label className="terminal-search">
            <FiCrosshair />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索设备..."
            />
          </label>

          <div className="terminal-device-list">
            {filteredDevices.length ? filteredDevices.map((device) => {
              const thumbUrl = deviceThumbUrl(device);
              return (
                <button
                  key={device.id}
                  type="button"
                  className={`terminal-device-card ${selectedDevice?.id === device.id ? 'terminal-device-card-active' : ''}`}
                  onClick={() => {
                    setSelectedDeviceId(device.id);
                    setViewMode('device');
                  }}
                  onDoubleClick={() =>
                    void openWindow({
                      label: `device-${device.id}`,
                      kind: 'device',
                      route: `/device/${device.id}`,
                      title: `${device.name} 终端`,
                      width: 980,
                      height: 760,
                    })
                  }
                >
                  <span className="terminal-device-thumb">
                    <img src={thumbUrl} alt="" aria-hidden="true" />
                  </span>
                  <span className="terminal-device-copy">
                    <strong>{device.name}</strong>
                    <small>{deviceShortType(device.kind)}</small>
                    <small>电量 {Math.round(device.telemetry.batteryPercent)}%</small>
                    <small><FiMapPin /> 位置: {formatPosition(device)}</small>
                  </span>
                  <span className="terminal-device-meta">
                    <FiWifi />
                    <b>{statusLabel(device.status)}</b>
                  </span>
                </button>
              );
            }) : (
              <div className="terminal-empty-state">没有匹配设备</div>
            )}
          </div>

          <button type="button" className="terminal-device-group-toggle">
            <FiSliders />
            设备分组管理
            <span>⌄</span>
          </button>
        </aside>

        <section className="terminal-scene-panel">
          <div className="terminal-scene-tabs" aria-label="视角切换">
            {[
              ['global', '全局视角', <FiGlobe key="global" />],
              ['device', '设备视角', <FiNavigation key="device" />],
              ['human', '人类视角', <FiCpu key="human" />],
            ].map(([mode, label, icon]) => (
              <button
                key={mode as string}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode as ViewMode)}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <WorldScene
            deviceName={selectedDevice?.name ?? t('worldWindow.noDevice')}
            deviceKind={selectedDevice?.kind}
            cameraPosition={camera.position}
            cameraTarget={camera.target}
            cameraMode={viewMode === 'global' ? 'orbit' : 'first_person'}
            minHeight="100%"
            objects={state.world.objects}
            devices={devicesInScene}
            weather={state.world.terrain}
            showAxes
            hidePrimaryDevice
            tickIntervalMs={state.settings.tickIntervalMs}
            googleMapsApiKey={state.settings.maps.googleMaps.apiKey}
            cesiumIonToken={state.settings.maps.cesiumIon.token}
          />

          <div className="terminal-world-chip-row" aria-label="世界数据来源">
            <span>{worldStatus}</span>
            <span>{worldSource}</span>
            <span>{worldMetadata.radius_m ? `${worldMetadata.radius_m}m` : '500m'}</span>
          </div>

          <div className="terminal-scene-tools" aria-label="场景工具">
            <button type="button"><FiMapPin /> 添加标记</button>
            <button type="button"><FiSliders /> 测量距离</button>
            <button type="button"><FiBox /> 绘制区域</button>
            <button type="button" onClick={() => appendLog({ level: 'info', scope: 'world', message: '3D 街景设置已切换。' })}>
              <FiSettings /> 3D 设置
            </button>
          </div>

          <div className="terminal-scene-rail">
            <IconButton icon={<FiNavigation />} label="罗盘" />
            <IconButton icon={<FiBox />} label="图层" />
            <IconButton icon={<FiCrosshair />} label="编队" />
            <IconButton icon={<FiTarget />} label="目标" />
            <IconButton
              icon={<FiMaximize2 />}
              label="独立世界窗口"
              onClick={() =>
                void openWindow({
                  label: 'world-expanded',
                  kind: 'world',
                  route: '/world',
                  title: '3D 实景世界',
                  width: 1280,
                  height: 820,
                })
              }
            />
          </div>
        </section>

        <aside className="terminal-gateway-panel">
          <div className="terminal-panel-header">
            <div>
              <h2>群体智能网关</h2>
              <span>AI 在线</span>
            </div>
            <span className="terminal-online-dot">在线</span>
          </div>

          <section className="terminal-command-box">
            <div className="terminal-section-caption">自然语言指令（AI 眼镜输入）</div>
            <textarea
              value={taskInput}
              onChange={(event) => setTaskInput(event.target.value)}
              placeholder="请输入您的指令，例如：对前方区域进行热成像扫描"
            />
            <button type="button" aria-label="语音输入" className="terminal-mic-button"><FiMic /></button>
            <div className="terminal-priority-row">
              {[
                ['normal', '普通'],
                ['high', '高优先级'],
                ['urgent', '紧急（中断任务）'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={priority === value}
                  onClick={() => setPriority(value as typeof priority)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="terminal-send-button" onClick={sendGoal}>
              <FiSend />
              发送指令
            </button>
          </section>

          <section className="terminal-task-panel">
            <div className="terminal-section-header">
              <strong>任务与决策</strong>
              <span>{activeDecisionStageMeta.label}</span>
            </div>
            <div className="terminal-mission-title">
              <strong>{currentGoal?.title ?? '等待自然语言目标'}</strong>
              <span>{currentGoal?.status ?? '待提交'}</span>
              <small>ID: {missionId}</small>
            </div>
            <div className="terminal-stage-tabs" role="tablist" aria-label="任务与决策阶段切换">
              {DECISION_STAGES.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  role="tab"
                  aria-selected={activeDecisionStage === stage.id}
                  aria-pressed={activeDecisionStage === stage.id}
                  className={activeDecisionStage === stage.id ? 'terminal-stage-active' : undefined}
                  onClick={() => setActiveDecisionStage(stage.id)}
                >
                  {stage.label}
                </button>
              ))}
            </div>
            <div className="terminal-stage-detail" role="tabpanel" aria-label={activeDecisionStageMeta.label}>
              <div>
                <strong>{activeDecisionStageCopy.status}</strong>
                <span>{activeDecisionStagePercent}%</span>
              </div>
              <p>{activeDecisionStageCopy.description}</p>
              <div className="terminal-stage-metrics">
                {activeDecisionStageCopy.metrics.map((metric) => (
                  <span key={metric}>{metric}</span>
                ))}
              </div>
            </div>
            <div className="terminal-task-list">
              {(activeDecisionStage === 'intent' && currentGoal) ? (
                <button
                  type="button"
                  className="terminal-task-row"
                  onClick={() => setActiveDecisionStage('decompose')}
                >
                  <span><FiMic /></span>
                  <div>
                    <strong>{currentGoal.title}</strong>
                    <small>{currentGoal.sourceText || currentGoal.description}</small>
                    <small>{currentGoal.priority} · {currentGoal.status}</small>
                  </div>
                  <b>100%</b>
                  <i style={{ width: '92px' }} />
                </button>
              ) : null}
              {(activeDecisionStage === 'intent' && !currentGoal) ? (
                <div className="terminal-empty-state">暂无目标，请先通过 AI 眼镜输入自然语言指令。</div>
              ) : null}
              {activeDecisionStage !== 'intent' && currentGoalTasks.length ? currentGoalTasks.map((task) => {
                const assignee = state.devices.find((device) => device.id === task.assigneeDeviceId);
                const progress = taskProgress(task);
                const stageLine = activeDecisionStage === 'decompose'
                  ? `${task.kind} · ${task.description}`
                  : activeDecisionStage === 'dispatch'
                    ? `${assignee?.capabilityTags.join(' / ') ?? '等待可用设备'}`
                    : activeDecisionStage === 'monitor'
                      ? `${taskRuntimeLabel(task)} · ${assignee ? `遥测 ${Math.round(assignee.telemetry.batteryPercent)}%` : '无遥测'}`
                      : `${taskStatusLabel(task.status)} · ${task.notes || '等待评估'}`;
                return (
                  <button
                    key={task.id}
                    type="button"
                    className="terminal-task-row"
                    onClick={() =>
                      void openWindow({
                        label: `task-${task.id}`,
                        kind: 'task',
                        route: `/task/${task.id}`,
                        title: task.title,
                        width: 980,
                        height: 720,
                      })
                    }
                    >
                    <span>{assignee ? deviceIcon(assignee.kind) : <FiTarget />}</span>
                    <div>
                      <strong>{task.title}</strong>
                      <small>{activeDecisionStage === 'decompose' ? task.description : assignee?.name ?? '未分配'}</small>
                      <small>{stageLine}</small>
                    </div>
                    <b>{progress}%</b>
                    <i style={{ width: `${Math.round(progress * 0.92)}px` }} />
                  </button>
                );
              }) : null}
              {activeDecisionStage !== 'intent' && !currentGoalTasks.length ? (
                <div className="terminal-empty-state">暂无任务，下发指令后将在这里显示。</div>
              ) : null}
            </div>
          </section>

          <DashboardLogPanel
            title="决策日志（实时）"
            entries={gatewayLogs}
            compact
            clearedAt={clearedLogScopes.gateway}
            onClear={() => clearDisplayedLogs('gateway')}
          />
        </aside>
      </main>

      <section className="terminal-playback-strip" aria-label="回放控制">
        <button type="button" aria-label="回到开头"><FiSkipForward /></button>
        <button type="button" aria-label="上一步"><FiSkipForward /></button>
        <button type="button" aria-label="播放" className="terminal-play-active" onClick={() => void tickSimulation(1)}><FiPlay /></button>
        <button type="button" aria-label="下一步"><FiSkipForward /></button>
        <button type="button" aria-label="跳到结尾"><FiSkipForward /></button>
        <span>1.0x</span>
        <button type="button" aria-label="全屏"><FiMaximize2 /></button>
      </section>

      <footer className="terminal-bottom-grid">
        <DashboardLogPanel
          title="系统日志"
          entries={systemLogs}
          clearedAt={clearedLogScopes.system}
          onClear={() => clearDisplayedLogs('system')}
        />

        <section className="terminal-timeline-panel">
          <div className="terminal-section-header">
            <strong>任务时间轴</strong>
            <span>{DESIGN_CLOCK_SHORT}</span>
          </div>
          <div className="terminal-timeline-axis">
            <span>14:31:00</span>
            <span>14:31:30</span>
            <span>14:32:00</span>
            <span>14:32:30</span>
            <span>14:33:00</span>
          </div>
          <div className="terminal-timeline-rows">
            {timelineRows.map((row) => (
              <div key={row.id} className="terminal-timeline-row">
                <span style={{ color: row.color }}>◆</span>
                <strong>{row.name}</strong>
                <i style={{ '--terminal-row-color': row.color, width: `${row.progress}%` } as CSSProperties} />
              </div>
            ))}
          </div>
        </section>

        <section className="terminal-environment-panel">
          <div className="terminal-section-header">
            <strong>世界环境</strong>
          </div>
          <div className="terminal-env-grid">
            <div className="terminal-env-metric">
              <FiThermometer aria-hidden="true" />
              <span><em>温度</em><b>{temperature}°C</b></span>
            </div>
            <div className="terminal-env-metric">
              <FiDroplet aria-hidden="true" />
              <span><em>湿度</em><b>{humidity}%</b></span>
            </div>
            <div className="terminal-env-metric">
              <FiWind aria-hidden="true" />
              <span><em>风速</em><b>{state.world.terrain.windMps ?? 3.2} m/s</b></span>
            </div>
            <div className="terminal-env-metric">
              <FiCloudRain aria-hidden="true" />
              <span><em>降水</em><b>{state.world.terrain.precipitationMmH ?? 0}%</b></span>
            </div>
          </div>
        </section>

        <section className="terminal-controls-panel">
          <div className="terminal-section-header">
            <strong>仿真控制</strong>
          </div>
          <button type="button" onClick={toggleSimulationPhase}>
            {state.phase === 'paused' ? <FiPlay /> : <FiPause />}
            {state.phase === 'paused' ? '开始仿真' : '暂停仿真'}
          </button>
          <button type="button" onClick={requestResetWorld}>
            <FiShield />
            {pendingReset ? '确认重置世界' : '重置世界'}
          </button>
          <button
            type="button"
            className="terminal-save-world"
            onClick={() =>
              void saveWorldSnapshot(`world_${state.world.id}_${Date.now()}`)
                .then((result) => setSnapshotStatus(`已保存 ${result.path}`))
                .catch((error) => setSnapshotStatus(error instanceof Error ? error.message : '保存世界失败'))
            }
          >
            保存世界
          </button>
          <small>{snapshotStatus}</small>
        </section>
      </footer>

      <div className="terminal-floating-actions">
        <IconButton
          icon={<TbWorldPlus />}
          label="新建实景世界"
          onClick={() =>
            void openWindow({
              label: 'create-world',
              kind: 'create_world',
              route: '/create-world',
              title: '新建实景世界',
              width: 940,
              height: 760,
            })
          }
        />
        <IconButton
          icon={<TbAdjustmentsHorizontal />}
          label="控制面板"
          onClick={() =>
            void openWindow({
              label: 'sim-control',
              kind: 'control',
              route: '/control',
              title: '群体智能控制面板',
              width: 1120,
              height: 760,
            })
          }
        />
        <IconButton
          icon={<TbStereoGlasses />}
          label="AI 眼镜"
          onClick={() =>
            void openWindow({
              label: 'sim-glasses',
              kind: 'glasses',
              route: '/glasses',
              title: 'AI 眼镜输入',
              width: 980,
              height: 720,
            })
          }
        />
        <IconButton icon={<TbDeviceFloppy />} label="保存快照" onClick={() => void saveWorldSnapshot(`world_${state.world.id}_${Date.now()}`)} />
        <IconButton
          icon={<FiSettings />}
          label="设置"
          onClick={() =>
            void openWindow({
              label: 'sim-settings',
              kind: 'settings',
              route: '/settings',
              title: '模拟器设置',
              width: 720,
              height: 640,
            })
          }
        />
      </div>
    </div>
  );
}

function DashboardLogPanel({
  title,
  entries,
  compact = false,
  clearedAt,
  onClear,
}: {
  title: string;
  entries: TerminalEntry[];
  compact?: boolean;
  clearedAt?: string;
  onClear?: () => void;
}) {
  const [levelFilter, setLevelFilter] = useState<'all' | NonNullable<TerminalEntry['level']>>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scopedEntries = clearedAt
    ? entries.filter((entry) => {
        if (!entry.timestamp) {
          return true;
        }
        return new Date(entry.timestamp).getTime() > new Date(clearedAt).getTime();
      })
    : entries;
  const filteredEntries = levelFilter === 'all'
    ? scopedEntries
    : scopedEntries.filter((entry) => (entry.level ?? 'info') === levelFilter);
  const visibleEntries = filteredEntries.slice(compact ? -5 : -4);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }
    const list = listRef.current;
    list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [autoScroll, visibleEntries.length]);

  return (
    <section className={`terminal-light-log ${compact ? 'terminal-light-log-compact' : ''}`}>
      <div className="terminal-light-log-header">
        <strong>{title}</strong>
        <div className="terminal-light-log-actions">
          <span>{filteredEntries.length} 条</span>
          <select
            aria-label={`${title}级别过滤`}
            value={levelFilter}
            title="全部级别"
            onChange={(event) => setLevelFilter(event.target.value as typeof levelFilter)}
          >
            <option value="all">全部</option>
            <option value="debug">DEBUG</option>
            <option value="info">INFO</option>
            <option value="success">SUCCESS</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>
          <button
            type="button"
            className={compact ? 'terminal-light-icon-button' : undefined}
            aria-label={autoScroll ? `${title}暂停自动滚动` : `${title}开启自动滚动`}
            aria-pressed={autoScroll}
            title={autoScroll ? '暂停自动滚动' : '开启自动滚动'}
            onClick={() => setAutoScroll((current) => !current)}
          >
            {autoScroll ? <FiPlay /> : <FiPause />}
            {compact ? null : <span>{autoScroll ? '自动滚动' : '已暂停'}</span>}
          </button>
          <button
            type="button"
            className="terminal-light-icon-button"
            aria-label={`${title}滚动到底部`}
            title="滚动到底部"
            onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })}
          >
            <FiArrowDown />
          </button>
          {onClear ? (
            <button
              type="button"
              className={compact ? 'terminal-light-icon-button' : undefined}
              aria-label={`清空${title}`}
              title={`清空${title}`}
              onClick={onClear}
            >
              {compact ? <FiTrash2 /> : <span>清空</span>}
            </button>
          ) : null}
        </div>
      </div>
      <div className="terminal-light-log-list" ref={listRef}>
        {visibleEntries.length ? visibleEntries.map((entry, index) => {
          const level = entry.level ?? 'info';
          const timestamp = entry.timestamp ? formatTime(new Date(entry.timestamp)) : '';
          return (
            <div key={entry.id ?? `${timestamp}-${index}`} className="terminal-light-log-row">
              <span>{timestamp}</span>
              <b className={`terminal-light-level-${level}`}>[{level.toUpperCase()}]</b>
              <em>{entry.message}</em>
            </div>
          );
        }) : (
          <div className="terminal-empty-state">暂无日志</div>
        )}
      </div>
    </section>
  );
}

function StatusMetric({
  label,
  value,
  note,
  icon,
  iconFirst = false,
}: {
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
  iconFirst?: boolean;
}) {
  const metricClassName = [
    'terminal-status-metric',
    icon ? 'terminal-status-metric-with-icon' : 'terminal-status-metric-plain',
    iconFirst ? 'terminal-status-metric-icon-first' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={metricClassName}>
      {icon ? <span className="terminal-status-icon" aria-hidden="true">{icon}</span> : null}
      <span className="terminal-status-label">{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}
