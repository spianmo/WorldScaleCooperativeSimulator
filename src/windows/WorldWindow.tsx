import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  FiBell,
  FiBox,
  FiArrowDown,
  FiCheck,
  FiChevronDown,
  FiChevronLeft,
  FiChevronRight,
  FiCloudRain,
  FiCpu,
  FiCrosshair,
  FiDroplet,
  FiEdit2,
  FiFolder,
  FiGlobe,
  FiMapPin,
  FiMaximize2,
  FiMic,
  FiMoon,
  FiNavigation,
  FiPause,
  FiPlay,
  FiPlus,
  FiSend,
  FiSettings,
  FiShield,
  FiSkipBack,
  FiSkipForward,
  FiSliders,
  FiSun,
  FiTag,
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
import { WorldScene, mapDeviceTelemetryPosition, deviceEyeHeightM } from '../components/WorldScene';
import type { WorldSceneFocusTarget } from '../components/WorldScene';
import { SceneOverlay, useSceneTools } from '../components/sceneOverlay';
import { formatTime } from '../i18n';
import { useSimulation, useDeviceGroups, DEVICE_GROUP_COLOR_PALETTE } from '../state';
import type { DeviceGroup } from '../state';
import type { GoalPriority, SimulationDevice, SimulationGoal, SimulationTask } from '../types';
import thumbAutelEvoMaxUrl from '../../assets/design/device-thumb-autel-evo-max-4t.png';
import thumbDjiMatriceUrl from '../../assets/design/device-thumb-dji-matrice-30t.png';
import thumbDjiMavicUrl from '../../assets/design/device-thumb-dji-mavic-3e.png';
import thumbSensorHubUrl from '../../assets/design/device-thumb-wheeled-robot-w3.png';
import thumbUnitreeB2Url from '../../assets/design/device-thumb-unitree-b2.png';
import thumbUnitreeG1Url from '../../assets/design/device-thumb-unitree-g1.png';
import thumbUnitreeGo2Url from '../../assets/design/device-thumb-unitree-go2.png';
import thumbWheeledRobotUrl from '../../assets/design/device-thumb-wheeled-robot-w3.png';
import terminalLogoMarkUrl from '../../assets/design/logo.png';

type ViewMode = 'global' | 'device' | 'human';
type DecisionStageId = 'intent' | 'decompose' | 'dispatch' | 'monitor' | 'evaluate';

const TASK_EXAMPLE_KEYS = [
  'worldWindowExtra.defaultGoals.patrol',
  'worldWindowExtra.defaultGoals.uavReview',
  'worldWindowExtra.defaultGoals.quadrupedFollow',
] as const;
const DESIGN_CLOCK = '14:32:18';
const DESIGN_CLOCK_SHORT = '14:32';
const DECISION_STAGE_IDS: DecisionStageId[] = ['intent', 'decompose', 'dispatch', 'monitor', 'evaluate'];
const DEVICE_THUMBS_BY_ID: Record<string, string> = {
  'default-dji-mavic-3e': thumbDjiMavicUrl,
  'default-autel-evo-max': thumbAutelEvoMaxUrl,
  'default-unitree-go2': thumbUnitreeGo2Url,
  'default-unitree-b2': thumbUnitreeB2Url,
  'default-unitree-g1': thumbUnitreeG1Url,
  'default-wheeled-w3': thumbWheeledRobotUrl,
  'default-matrice-30t': thumbDjiMatriceUrl,
  'default-sensor-hub-a1': thumbSensorHubUrl,
};
const DEVICE_THUMBS_BY_NAME: Array<[RegExp, string]> = [
  [/mavic\s*3e/i, thumbDjiMavicUrl],
  [/evo\s*max\s*4t/i, thumbAutelEvoMaxUrl],
  [/unitree\s*g1/i, thumbUnitreeG1Url],
  [/unitree\s*go2/i, thumbUnitreeGo2Url],
  [/unitree\s*b2/i, thumbUnitreeB2Url],
  [/(wheeled\s*robot\s*w3|keenon\s*w3)/i, thumbWheeledRobotUrl],
  [/matrice\s*30t/i, thumbDjiMatriceUrl],
];
const DEVICE_THUMBS_BY_KIND: Record<SimulationDevice['kind'], string> = {
  drone: thumbDjiMavicUrl,
  wheeled_robot: thumbWheeledRobotUrl,
  humanoid: thumbUnitreeG1Url,
  quadruped: thumbUnitreeGo2Url,
  unitree_robot: thumbUnitreeGo2Url,
  sensor_node: thumbSensorHubUrl,
};

function weatherLabel(weather: string, t: (key: string) => string) {
  const validWeather = ['sunny', 'cloudy', 'rainy', 'foggy', 'windy', 'stormy'];
  return validWeather.includes(weather)
    ? t(`worldWindowExtra.weather.${weather}`)
    : t('worldWindowExtra.weather.sunny');
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

function deviceBrandLabel(kind: SimulationDevice['kind']) {
  if (kind === 'drone') {
    return 'DJI';
  }
  if (kind === 'humanoid' || kind === 'quadruped' || kind === 'unitree_robot') {
    return 'Unitree';
  }
  return null;
}

function deviceShortType(kind: SimulationDevice['kind'], t: (key: string) => string) {
  return t(`worldWindowExtra.deviceLabel.${kind}`);
}

function statusLabel(status: SimulationDevice['status'], t: (key: string) => string) {
  return t(`worldWindowExtra.deviceStatus.${status}`);
}

function taskStatusLabel(status: SimulationTask['status'], t: (key: string) => string) {
  return t(`task.${status}`);
}

function taskRuntimeLabel(task: SimulationTask, t: (key: string) => string) {
  const designKeys = ['default-task-uav-scan', 'default-task-ground-scan', 'default-task-verify'];
  if (designKeys.includes(task.id)) {
    return t(`worldWindowExtra.defaultTaskRuntime.${task.id}`);
  }
  return taskStatusLabel(task.status, t);
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
  const eyeHeightM = deviceEyeHeightM(device);
  const eyeScene = eyeHeightM / 10;
  const position = [
    scenePosition[0],
    scenePosition[1] + eyeScene,
    scenePosition[2],
  ] as [number, number, number];

  const lookDistanceScene = 5.0;
  return {
    position,
    target: [
      position[0] + forward[0] * lookDistanceScene,
      position[1] - 0.05,
      position[2] + forward[1] * lookDistanceScene,
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

function decisionStageCopy(
  stage: DecisionStageId,
  goal: SimulationGoal | undefined,
  goalTasks: SimulationTask[],
  devices: SimulationDevice[],
  t: (key: string, params?: Record<string, unknown>) => string,
) {
  const assignedCount = goalTasks.filter((task) => task.assigneeDeviceId).length;
  const activeCount = goalTasks.filter((task) => task.status === 'active').length;
  const completedCount = goalTasks.filter((task) => task.status === 'completed').length;
  const deviceCount = new Set(goalTasks.map((task) => task.assigneeDeviceId).filter(Boolean)).size;

  if (stage === 'intent') {
    return {
      status: goal ? `${goal.priority} · ${goal.status}` : t('worldWindowExtra.intent.waitingPending'),
      description: goal?.sourceText || goal?.description || t('worldWindowExtra.intent.waitingDescription'),
      metrics: [
        t('worldWindowExtra.intent.metricGoal', { count: goal ? 1 : 0 }),
        t('worldWindowExtra.intent.metricKeyword', {
          count: goal ? Math.max(1, goal.sourceText.split(/\s+|，|,|。/).filter(Boolean).length) : 0,
        }),
        t('worldWindowExtra.intent.metricPriority', { value: goal?.priority ?? 'none' }),
      ],
    };
  }

  if (stage === 'decompose') {
    return {
      status: t('worldWindowExtra.decompose.status', { count: goalTasks.length }),
      description: t('worldWindowExtra.decompose.description'),
      metrics: [
        t('worldWindowExtra.decompose.metricTasks', { count: goalTasks.length }),
        t('worldWindowExtra.decompose.metricTypes', {
          count: new Set(goalTasks.map((task) => task.kind)).size,
        }),
        t('worldWindowExtra.decompose.metricBlocked', {
          count: goalTasks.filter((task) => task.status === 'blocked').length,
        }),
      ],
    };
  }

  if (stage === 'dispatch') {
    return {
      status: t('worldWindowExtra.dispatch.status', {
        assigned: assignedCount,
        total: goalTasks.length,
      }),
      description: t('worldWindowExtra.dispatch.description'),
      metrics: [
        t('worldWindowExtra.dispatch.metricDevices', { count: deviceCount || devices.length }),
        t('worldWindowExtra.dispatch.metricUnassigned', {
          count: Math.max(0, goalTasks.length - assignedCount),
        }),
        t('worldWindowExtra.dispatch.metricOnline', {
          count: devices.filter((device) => device.status !== 'offline').length,
        }),
      ],
    };
  }

  if (stage === 'monitor') {
    return {
      status: t('worldWindowExtra.monitor.status', { count: activeCount }),
      description: t('worldWindowExtra.monitor.description'),
      metrics: [
        t('worldWindowExtra.monitor.metricActive', { count: activeCount }),
        t('worldWindowExtra.monitor.metricAvg', { value: activeStageProgress(stage, goalTasks) }),
        t('worldWindowExtra.monitor.metricError', {
          count: devices.filter((device) => device.status === 'error').length,
        }),
      ],
    };
  }

  return {
    status: t('worldWindowExtra.evaluate.status', {
      completed: completedCount,
      total: goalTasks.length,
    }),
    description: t('worldWindowExtra.evaluate.description'),
    metrics: [
      t('worldWindowExtra.evaluate.metricCompleted', { count: completedCount }),
      t('worldWindowExtra.evaluate.metricRemaining', {
        count: Math.max(0, goalTasks.length - completedCount),
      }),
      t('worldWindowExtra.evaluate.metricConvergence', { value: activeStageProgress(stage, goalTasks) }),
    ],
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
    setLocale,
    setThemeMode,
  } = useSimulation();
  const [selectedDeviceId, setSelectedDeviceId] = useState(state.devices[0]?.id ?? '');
  const [viewMode, setViewMode] = useState<ViewMode>('global');
  const [humanRoamStart, setHumanRoamStart] = useState<{ lon: number; lat: number; headingDeg?: number } | null>(null);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | 'unassigned' | string>('all');
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [groupDraftName, setGroupDraftName] = useState('');
  const [groupDraftColor, setGroupDraftColor] = useState<string>(DEVICE_GROUP_COLOR_PALETTE[0]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const {
    groups: deviceGroups,
    createGroup,
    renameGroup,
    setGroupColor,
    deleteGroup,
    toggleDeviceInGroup,
  } = useDeviceGroups();
  const decisionStages = useMemo(
    () => DECISION_STAGE_IDS.map((id) => ({ id, label: t(`worldWindowExtra.decisionStages.${id}`) })),
    [t],
  );
  const [taskInput, setTaskInput] = useState(() => t(TASK_EXAMPLE_KEYS[0]));
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('high');
  const [activeDecisionStage, setActiveDecisionStage] = useState<DecisionStageId>('dispatch');
  const [snapshotStatus, setSnapshotStatus] = useState(() => t('worldWindowExtra.snapshot.unread'));
  const [pendingReset, setPendingReset] = useState(false);
  const [clearedLogScopes, setClearedLogScopes] = useState<Record<string, string>>({});
  const [localeMenuOpen, setLocaleMenuOpen] = useState(false);
  const localeMenuRef = useRef<HTMLDivElement | null>(null);
  const [gatewayEvents, setGatewayEvents] = useState<TerminalEntry[]>(() => [
    {
      id: 'gateway-ready',
      timestamp: new Date(),
      level: 'info',
      source: 'gateway',
      message: t('worldWindowExtra.gateway.ready'),
    },
  ]);
  const sceneTools = useSceneTools();
  const [cameraHeadingDeg, setCameraHeadingDeg] = useState(0);
  const [cameraPitchDeg, setCameraPitchDeg] = useState(-30);
  const [focusTarget, setFocusTarget] = useState<WorldSceneFocusTarget | null>(null);
  const handleScenePoseChange = useCallback((pose: { heading: number; pitch: number }) => {
    setCameraHeadingDeg(pose.heading);
    setCameraPitchDeg(pose.pitch);
  }, []);
  const selectedDevice = state.devices.find((device) => device.id === selectedDeviceId) ?? state.devices[0];
  const timelineRows = useMemo(() => buildTimelineRows(state.devices, state.tasks), [state.devices, state.tasks]);
  const currentGoal = useMemo(() => pickCurrentGoal(state.goals), [state.goals]);
  const currentGoalTasks = useMemo(() => tasksForGoal(currentGoal, state.tasks), [currentGoal, state.tasks]);
  const activeDecisionStageMeta = decisionStages.find((stage) => stage.id === activeDecisionStage) ?? decisionStages[2];
  const activeDecisionStageCopy = useMemo(
    () => decisionStageCopy(activeDecisionStage, currentGoal, currentGoalTasks, state.devices, t),
    [activeDecisionStage, currentGoal, currentGoalTasks, state.devices, t],
  );
  const activeDecisionStagePercent = activeStageProgress(activeDecisionStage, currentGoalTasks);
  const groupOfDeviceMap = useMemo(() => {
    const map = new Map<string, DeviceGroup>();
    deviceGroups.forEach((group) => {
      group.deviceIds.forEach((deviceId) => map.set(deviceId, group));
    });
    return map;
  }, [deviceGroups]);
  const filteredDevices = state.devices.filter((device) => {
    if (groupFilter === 'unassigned') {
      if (groupOfDeviceMap.has(device.id)) {
        return false;
      }
    } else if (groupFilter !== 'all') {
      const group = groupOfDeviceMap.get(device.id);
      if (!group || group.id !== groupFilter) {
        return false;
      }
    }
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return true;
    }
    return `${device.name} ${device.kind} ${device.capabilityTags.join(' ')}`.toLowerCase().includes(keyword);
  });
  const focusGeoFromDevice = useCallback(
    (deviceId: string) => {
      const device = state.devices.find((entry) => entry.id === deviceId);
      const metadata = state.world.objects.find((object) => object.properties?.world_metadata === 'true')?.properties;
      const lat = metadata?.center_lat ? Number.parseFloat(metadata.center_lat) : Number.NaN;
      const lon = metadata?.center_lon ? Number.parseFloat(metadata.center_lon) : Number.NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }
      const altitude = device?.kind === 'drone' ? Math.max(20, device.telemetry.position[1]) : 1.6;
      setFocusTarget({
        key: `device-${deviceId}-${Date.now()}`,
        lon,
        lat,
        height: altitude,
        range: 280,
      });
    },
    [state.devices, state.world.objects],
  );

  const focusGeoFromObject = useCallback(
    (objectId: string) => {
      const object = state.world.objects.find((entry) => entry.id === objectId);
      if (!object) return;
      const lat = object.properties?.lat ? Number.parseFloat(object.properties.lat) : undefined;
      const lon = object.properties?.lon ? Number.parseFloat(object.properties.lon) : undefined;
      if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }
      setFocusTarget({
        key: `object-${objectId}-${Date.now()}`,
        lon,
        lat,
        height: 12,
        range: 220,
      });
    },
    [state.world.objects],
  );

  const handleResetNorth = useCallback(() => {
    const metadata = state.world.objects.find((object) => object.properties?.world_metadata === 'true')?.properties;
    const lat = metadata?.center_lat ? Number.parseFloat(metadata.center_lat) : Number.NaN;
    const lon = metadata?.center_lon ? Number.parseFloat(metadata.center_lon) : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }
    const radius = metadata?.radius_m ? Number.parseFloat(metadata.radius_m) : 500;
    setFocusTarget({
      key: `north-${Date.now()}`,
      lon,
      lat,
      height: 0,
      range: Math.max(420, radius * 1.3),
    });
  }, [state.world.objects]);

  const unassignedDeviceCount = state.devices.filter((device) => !groupOfDeviceMap.has(device.id)).length;
  const activeGroupFilterLabel = groupFilter === 'all'
    ? t('worldWindowExtra.sidebar.allGroup')
    : groupFilter === 'unassigned'
      ? t('worldWindowExtra.sidebar.ungroupedGroup')
      : deviceGroups.find((group) => group.id === groupFilter)?.name ?? t('worldWindowExtra.sidebar.allGroup');
  const camera = useMemo(() => {
    if (viewMode === 'device') {
      return cameraForDevice(selectedDevice);
    }
    if (viewMode === 'human') {
      return {
        position: [3.4, 1.2, 5.1] as [number, number, number],
        target: [0.1, 0.28, -2.8] as [number, number, number],
      };
    }
    return {
      position: [10.8, 10.2, 10.6] as [number, number, number],
      target: [0, -0.2, 0] as [number, number, number],
    };
  }, [viewMode, selectedDevice]);
  const devicesInScene = useMemo(
    () => (viewMode === 'device' && selectedDevice
      ? state.devices.filter((device) => device.id !== selectedDevice.id)
      : state.devices),
    [viewMode, selectedDevice, state.devices],
  );
  const systemLogs = toTerminalEntries(state.logs);
  const gatewayLogs = [...systemLogs.slice(-7), ...gatewayEvents].slice(-10);
  const missionId = 'MISSION-2024-0517-01';
  const worldMetadata = state.world.metadata ?? {};
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
    if (groupFilter === 'all' || groupFilter === 'unassigned') {
      return;
    }
    if (!deviceGroups.some((group) => group.id === groupFilter)) {
      setGroupFilter('all');
    }
  }, [deviceGroups, groupFilter]);

  useEffect(() => {
    if (!localeMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (!localeMenuRef.current) {
        return;
      }
      if (!localeMenuRef.current.contains(event.target as Node)) {
        setLocaleMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [localeMenuOpen]);

  useEffect(() => {
    void listWorldSnapshots()
      .then((records) => {
        setSnapshotStatus(
          records.length
            ? t('worldWindowExtra.snapshot.readCount', { count: records.length })
            : t('worldWindowExtra.snapshot.empty'),
        );
      })
      .catch((error) => {
        setSnapshotStatus(error instanceof Error ? error.message : t('worldWindowExtra.snapshot.readFailed'));
      });
  }, [listWorldSnapshots, t]);

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
      message: t('worldWindowExtra.gateway.accepted', { input }),
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
        message: t('worldWindowExtra.gateway.resetWarning'),
      });
      return;
    }

    resetState();
    setPendingReset(false);
    setSnapshotStatus(t('worldWindowExtra.snapshot.reset'));
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
        <div className="terminal-brand-block" aria-label={t('worldWindowExtra.topbar.brandTitle')}>
          <img src={terminalLogoMarkUrl} alt="" aria-hidden="true" />
          <div className="terminal-brand-copy">
            <strong className="brand-wordmark">
              <span className="brand-wordmark-prefix">Terminal</span>
              <span className="brand-wordmark-suffix">Link</span>
            </strong>
            <span>{t('worldWindowExtra.topbar.brandSubtitle')}</span>
          </div>
        </div>

        <div className="terminal-status-strip" aria-label={t('worldWindowExtra.topbar.statusStripAria')}>
          <StatusMetric
            label={t('worldWindowExtra.topbar.worldStatusLabel')}
            value={t('worldWindowExtra.topbar.temperatureValue', { weather: weatherLabel(state.world.terrain.weather, t), temp: temperature })}
            icon={<FiSun />}
          />
          <StatusMetric label={t('worldWindowExtra.topbar.timeLabel')} value={worldClock} note={worldDate} />
          <div className="terminal-speed-control" aria-label={t('worldWindowExtra.topbar.simSpeedAria')}>
            <span>{t('worldWindowExtra.topbar.simSpeed')}</span>
            <button type="button" className="terminal-speed-pill" aria-label={t('worldWindowExtra.topbar.step')} onClick={() => void tickSimulation(1)}>
              <strong>1.0x</strong>
              <FiPlay />
            </button>
            <button type="button" className="terminal-speed-round" aria-label={t('worldWindowExtra.topbar.pause')} onClick={toggleSimulationPhase}><FiPause /></button>
            <button type="button" className="terminal-speed-round" aria-label={t('worldWindowExtra.topbar.fastForward')} onClick={() => void tickSimulation(2)}><FiSkipForward /></button>
          </div>
          <StatusMetric label={t('worldWindowExtra.topbar.windLabel')} value={t('worldWindowExtra.topbar.windValue', { value: state.world.terrain.windMps ?? 3.2 })} icon={<FiWind />} iconFirst />
        </div>

        <div className="terminal-operator-tools" aria-label={t('worldWindowExtra.topbar.operatorAria')}>
          <button type="button" className="terminal-top-icon-button" aria-label={t('worldWindowExtra.topbar.notification')}>
            <FiBell />
            <span className="terminal-notification-badge">12</span>
          </button>
          <div className="terminal-top-icon-wrapper" ref={localeMenuRef}>
            <button
              type="button"
              className="terminal-top-icon-button"
              aria-label={t('topbar.language')}
              aria-haspopup="menu"
              aria-expanded={localeMenuOpen}
              onClick={() => setLocaleMenuOpen((open) => !open)}
            >
              <FiGlobe />
            </button>
            {localeMenuOpen ? (
              <div className="terminal-top-menu" role="menu">
                {(['zh-CN', 'en-US'] as const).map((code) => {
                  const labelKey = code === 'zh-CN' ? 'locale.zhCN' : 'locale.enUS';
                  const isActive = state.settings.locale === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      className={`terminal-top-menu-item${isActive ? ' is-active' : ''}`}
                      role="menuitemradio"
                      aria-checked={isActive}
                      onClick={() => {
                        setLocale(code);
                        setLocaleMenuOpen(false);
                      }}
                    >
                      <span>{t(labelKey)}</span>
                      {isActive ? <FiCheck aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="terminal-top-icon-button"
            aria-label={t('topbar.theme')}
            onClick={() => setThemeMode(state.settings.theme.resolvedMode === 'dark' ? 'light' : 'dark')}
          >
            {state.settings.theme.resolvedMode === 'dark' ? <FiSun /> : <FiMoon />}
          </button>
          <button
            type="button"
            className="terminal-top-icon-button"
            aria-label={t('worldWindowExtra.topbar.settings')}
            onClick={() =>
              void openWindow({
                label: 'sim-settings',
                kind: 'settings',
                route: '/settings',
                title: t('worldWindowExtra.topbar.settingsTitle'),
                width: 720,
                height: 640,
              })
            }
          >
            <FiSettings />
          </button>
          <button type="button" className="terminal-operator-card" aria-label={t('worldWindowExtra.topbar.operatorOnline')}>
            <span className="terminal-operator-copy">
              <strong>Operator</strong>
              <small>{t('worldWindowExtra.topbar.online')}</small>
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
            <h2>{t('worldWindowExtra.sidebar.deviceListHeading')}</h2>
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
              {t('worldWindowExtra.sidebar.registerDevice')}
            </button>
          </div>

          <div className="terminal-device-filters" aria-label={t('worldWindowExtra.sidebar.deviceFiltersAria')}>
            <span className="terminal-filter-chip terminal-filter-chip-active">{t('worldWindowExtra.sidebar.allDevices', { count: state.devices.length })}</span>
            <span>
              <img src={DEVICE_THUMBS_BY_KIND.drone} alt="" aria-hidden="true" className="terminal-filter-thumb" />
              {state.devices.filter((device) => device.kind === 'drone').length}
            </span>
            <span>
              <img src={DEVICE_THUMBS_BY_KIND.wheeled_robot} alt="" aria-hidden="true" className="terminal-filter-thumb" />
              {state.devices.filter((device) => device.kind === 'wheeled_robot').length}
            </span>
            <span>
              <img src={DEVICE_THUMBS_BY_KIND.quadruped} alt="" aria-hidden="true" className="terminal-filter-thumb" />
              {state.devices.filter((device) => device.kind === 'quadruped').length}
            </span>
            <span aria-label={t('worldWindowExtra.sidebar.unitreeAria')}>
              <img src={DEVICE_THUMBS_BY_KIND.unitree_robot} alt="" aria-hidden="true" className="terminal-filter-thumb" />
              {state.devices.filter((device) => device.kind === 'unitree_robot').length}
            </span>
            <span>
              <img src={DEVICE_THUMBS_BY_KIND.humanoid} alt="" aria-hidden="true" className="terminal-filter-thumb" />
              {state.devices.filter((device) => device.kind === 'humanoid').length}
            </span>
            <span>
              <img src={DEVICE_THUMBS_BY_KIND.sensor_node} alt="" aria-hidden="true" className="terminal-filter-thumb" />
              {state.devices.filter((device) => device.kind === 'sensor_node').length}
            </span>
          </div>

          <label className="terminal-search">
            <FiCrosshair />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('worldWindowExtra.sidebar.searchPlaceholder')}
            />
          </label>

          <div className="terminal-group-filters" aria-label={t('worldWindowExtra.sidebar.groupFiltersAria')}>
            <button
              type="button"
              className={`terminal-group-chip ${groupFilter === 'all' ? 'terminal-group-chip-active' : ''}`}
              onClick={() => setGroupFilter('all')}
            >
              <FiTag />
              {t('worldWindowExtra.sidebar.allGroup')}
              <span>{state.devices.length}</span>
            </button>
            <button
              type="button"
              className={`terminal-group-chip ${groupFilter === 'unassigned' ? 'terminal-group-chip-active' : ''}`}
              onClick={() => setGroupFilter('unassigned')}
            >
              <FiFolder />
              {t('worldWindowExtra.sidebar.ungroupedGroup')}
              <span>{unassignedDeviceCount}</span>
            </button>
            {deviceGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`terminal-group-chip ${groupFilter === group.id ? 'terminal-group-chip-active' : ''}`}
                onClick={() => setGroupFilter(group.id)}
                style={groupFilter === group.id
                  ? { borderColor: group.color, color: group.color }
                  : undefined}
              >
                <span className="terminal-group-color-dot" style={{ background: group.color }} aria-hidden="true" />
                {group.name}
                <span>{group.deviceIds.length}</span>
              </button>
            ))}
          </div>

          <div className="terminal-device-list">
            {filteredDevices.length ? filteredDevices.map((device) => {
              const thumbUrl = deviceThumbUrl(device);
              const ownerGroup = groupOfDeviceMap.get(device.id);
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
                      title: t('worldWindowExtra.sidebar.deviceTerminalTitle', { name: device.name }),
                      width: 980,
                      height: 760,
                    })
                  }
                >
                  <span className="terminal-device-thumb">
                    <img src={thumbUrl} alt="" aria-hidden="true" />
                    {deviceBrandLabel(device.kind) ? (
                      <span className="device-brand-badge">{deviceBrandLabel(device.kind)}</span>
                    ) : null}
                  </span>
                  <span className="terminal-device-copy">
                    <strong>{device.name}</strong>
                    <small>{deviceShortType(device.kind, t)}</small>
                    <small>{t('worldWindowExtra.sidebar.batteryShort', { value: Math.round(device.telemetry.batteryPercent) })}</small>
                    <small><FiMapPin /> {t('worldWindowExtra.sidebar.positionShort', { value: formatPosition(device) })}</small>
                  </span>
                  <span className="terminal-device-meta">
                    {ownerGroup ? (
                      <span
                        className="terminal-device-group-tag"
                        style={{ background: ownerGroup.color }}
                        title={t('worldWindowExtra.sidebar.groupAssignedTitle', { name: ownerGroup.name })}
                      >
                        {ownerGroup.name}
                      </span>
                    ) : (
                      <FiWifi />
                    )}
                    <b>{statusLabel(device.status, t)}</b>
                  </span>
                </button>
              );
            }) : (
              <div className="terminal-empty-state">
                {groupFilter === 'all'
                  ? t('worldWindowExtra.sidebar.emptyAll')
                  : t('worldWindowExtra.sidebar.emptyGroupFiltered', { name: activeGroupFilterLabel })}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`terminal-device-group-toggle ${groupPanelOpen ? 'terminal-device-group-toggle-open' : ''}`}
            aria-expanded={groupPanelOpen}
            onClick={() => setGroupPanelOpen((current) => !current)}
          >
            <FiSliders />
            {t('worldWindowExtra.sidebar.groupManagement')}
            <FiChevronDown style={{ transform: groupPanelOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }} />
          </button>

          {groupPanelOpen ? (
            <div className="terminal-device-group-panel" role="region" aria-label={t('worldWindowExtra.sidebar.groupPanelAria')}>
              <form
                className="terminal-group-create-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  const created = createGroup(groupDraftName, groupDraftColor);
                  if (created) {
                    setGroupDraftName('');
                    const nextDefault = DEVICE_GROUP_COLOR_PALETTE[(deviceGroups.length + 1)
                      % DEVICE_GROUP_COLOR_PALETTE.length];
                    setGroupDraftColor(nextDefault);
                    setGroupFilter(created.id);
                  }
                }}
              >
                <span className="terminal-group-color-picker" role="listbox" aria-label={t('worldWindowExtra.sidebar.colorPickerAria')}>
                  {DEVICE_GROUP_COLOR_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      role="option"
                      aria-selected={groupDraftColor === color}
                      className={`terminal-group-color-swatch ${groupDraftColor === color ? 'terminal-group-color-swatch-active' : ''}`}
                      style={{ background: color }}
                      onClick={() => setGroupDraftColor(color)}
                      aria-label={t('worldWindowExtra.sidebar.colorAriaLabel', { color })}
                    />
                  ))}
                </span>
                <input
                  type="text"
                  value={groupDraftName}
                  onChange={(event) => setGroupDraftName(event.target.value)}
                  placeholder={t('worldWindowExtra.sidebar.newGroupPlaceholder')}
                  maxLength={24}
                />
                <button type="submit" className="terminal-compact-button" disabled={!groupDraftName.trim()}>
                  <FiPlus />
                  {t('worldWindowExtra.sidebar.createGroup')}
                </button>
              </form>

              {deviceGroups.length === 0 ? (
                <div className="terminal-empty-state">{t('worldWindowExtra.sidebar.emptyGroups')}</div>
              ) : (
                <div className="terminal-group-list">
                  {deviceGroups.map((group) => {
                    const isEditing = editingGroupId === group.id;
                    return (
                      <div key={group.id} className="terminal-group-item">
                        <div className="terminal-group-item-header">
                          <span className="terminal-group-color-dot" style={{ background: group.color }} aria-hidden="true" />
                          {isEditing ? (
                            <input
                              autoFocus
                              type="text"
                              value={editingGroupName}
                              onChange={(event) => setEditingGroupName(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  renameGroup(group.id, editingGroupName);
                                  setEditingGroupId(null);
                                } else if (event.key === 'Escape') {
                                  setEditingGroupId(null);
                                }
                              }}
                              onBlur={() => {
                                renameGroup(group.id, editingGroupName);
                                setEditingGroupId(null);
                              }}
                              maxLength={24}
                            />
                          ) : (
                            <strong>{group.name}</strong>
                          )}
                          <span className="terminal-group-count">{group.deviceIds.length}</span>
                          <span className="terminal-group-item-actions">
                            <span className="terminal-group-color-picker terminal-group-color-picker-compact" role="listbox" aria-label={t('worldWindowExtra.sidebar.groupColorPickerAria', { name: group.name })}>
                              {DEVICE_GROUP_COLOR_PALETTE.map((color) => (
                                <button
                                  key={color}
                                  type="button"
                                  role="option"
                                  aria-selected={group.color === color}
                                  className={`terminal-group-color-swatch ${group.color === color ? 'terminal-group-color-swatch-active' : ''}`}
                                  style={{ background: color }}
                                  onClick={() => setGroupColor(group.id, color)}
                                  aria-label={t('worldWindowExtra.sidebar.changeGroupColor', { name: group.name, color })}
                                />
                              ))}
                            </span>
                            <button
                              type="button"
                              className="terminal-group-icon-button"
                              aria-label={t('worldWindowExtra.sidebar.renameGroupAria', { name: group.name })}
                              onClick={() => {
                                setEditingGroupId(group.id);
                                setEditingGroupName(group.name);
                              }}
                            >
                              <FiEdit2 />
                            </button>
                            <button
                              type="button"
                              className="terminal-group-icon-button terminal-group-icon-button-danger"
                              aria-label={t('worldWindowExtra.sidebar.deleteGroupAria', { name: group.name })}
                              onClick={() => {
                                deleteGroup(group.id);
                                if (groupFilter === group.id) {
                                  setGroupFilter('all');
                                }
                              }}
                            >
                              <FiTrash2 />
                            </button>
                          </span>
                        </div>
                        <div className="terminal-group-device-grid">
                          {state.devices.length === 0 ? (
                            <span className="terminal-group-device-empty">{t('worldWindowExtra.sidebar.groupDeviceEmpty')}</span>
                          ) : state.devices.map((device) => {
                            const isMember = group.deviceIds.includes(device.id);
                            const otherOwner = !isMember ? groupOfDeviceMap.get(device.id) : undefined;
                            return (
                              <label
                                key={device.id}
                                className={`terminal-group-device-chip ${isMember ? 'terminal-group-device-chip-active' : ''}`}
                                title={otherOwner ? t('worldWindowExtra.sidebar.deviceCurrentGroupTooltip', { name: otherOwner.name }) : undefined}
                              >
                                <input
                                  type="checkbox"
                                  checked={isMember}
                                  onChange={() => toggleDeviceInGroup(group.id, device.id)}
                                />
                                <span>{device.name}</span>
                                {otherOwner ? (
                                  <small style={{ color: otherOwner.color }}>· {otherOwner.name}</small>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </aside>

        <section className="terminal-scene-panel">
          <div className="terminal-scene-tabs" aria-label={t('worldWindowExtra.scene.tabsAria')}>
            {[
              ['global', t('worldWindowExtra.scene.globalView'), <FiGlobe key="global" />],
              ['device', t('worldWindowExtra.scene.deviceView'), <FiNavigation key="device" />],
              ['human', t('worldWindowExtra.scene.humanView'), <FiCpu key="human" />],
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
            cameraMode={viewMode === 'global' ? 'orbit' : viewMode === 'human' ? 'human_roam' : 'first_person'}
            humanRoamStart={viewMode === 'human' ? humanRoamStart : null}
            onHumanRoamStartPlace={(geo) => {
              setHumanRoamStart({ ...geo });
              setViewMode('human');
            }}
            minHeight="100%"
            objects={state.world.objects}
            devices={devicesInScene}
            weather={state.world.terrain}
            showAxes={false}
            hidePrimaryDevice
            tickIntervalMs={state.settings.tickIntervalMs}
            googleMapsApiKey={state.settings.maps.googleMaps.apiKey}
            cesiumIonToken={state.settings.maps.cesiumIon.token}
            layers={sceneTools.layers}
            sceneSettings={sceneTools.settings}
            activeTool={sceneTools.activeTool}
            onScenePick={sceneTools.handleScenePick}
            markers={sceneTools.markers}
            measurements={sceneTools.measurements}
            areas={sceneTools.areas}
            goals={state.goals}
            tasks={state.tasks}
            draftMeasurementStart={sceneTools.draftMeasurement}
            draftAreaVertices={sceneTools.draftArea}
            selection={sceneTools.selection}
            onSelectOverlay={sceneTools.selectOverlay}
            onCameraPoseChange={handleScenePoseChange}
            focusTarget={focusTarget}
          />

          <SceneOverlay
            tools={sceneTools}
            cameraHeadingDeg={cameraHeadingDeg}
            cameraPitchDeg={cameraPitchDeg}
            worldObjects={state.world.objects}
            devices={state.devices}
            goals={state.goals}
            tasks={state.tasks}
            onResetNorth={handleResetNorth}
            onFocusDevice={focusGeoFromDevice}
            onFocusObject={focusGeoFromObject}
          />

        </section>

        <aside className="terminal-gateway-panel">
          <div className="terminal-panel-header">
            <div>
              <h2>{t('worldWindowExtra.gatewayPanel.heading')}</h2>
              <span>{t('worldWindowExtra.gatewayPanel.aiOnline')}</span>
            </div>
            <span className="terminal-online-dot">{t('worldWindowExtra.gatewayPanel.online')}</span>
          </div>

          <section className="terminal-command-box">
            <div className="terminal-section-caption">{t('worldWindowExtra.gatewayPanel.inputCaption')}</div>
            <textarea
              value={taskInput}
              onChange={(event) => setTaskInput(event.target.value)}
              placeholder={t('worldWindowExtra.gatewayPanel.inputPlaceholder')}
            />
            <button type="button" aria-label={t('worldWindowExtra.gatewayPanel.micAria')} className="terminal-mic-button"><FiMic /></button>
            <div className="terminal-priority-row">
              {([
                ['normal', t('worldWindowExtra.gatewayPanel.priority.normal')],
                ['high', t('worldWindowExtra.gatewayPanel.priority.high')],
                ['urgent', t('worldWindowExtra.gatewayPanel.priority.urgent')],
              ] as const).map(([value, label]) => (
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
              {t('worldWindowExtra.gatewayPanel.send')}
            </button>
          </section>

          <section className="terminal-task-panel">
            <div className="terminal-section-header">
              <strong>{t('worldWindowExtra.gatewayPanel.taskPanelTitle')}</strong>
              <span>{activeDecisionStageMeta.label}</span>
            </div>
            <div className="terminal-mission-title">
              <strong>{currentGoal?.title ?? t('worldWindowExtra.intent.waitingTitle')}</strong>
              <span>{currentGoal?.status ?? t('worldWindowExtra.intent.waitingStatus')}</span>
              <small>ID: {missionId}</small>
            </div>
            <div className="terminal-stage-tabs" role="tablist" aria-label={t('worldWindowExtra.gatewayPanel.stageTabsAria')}>
              {decisionStages.map((stage) => (
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
                <div className="terminal-empty-state">{t('worldWindowExtra.gatewayPanel.empty')}</div>
              ) : null}
              {activeDecisionStage !== 'intent' && currentGoalTasks.length ? currentGoalTasks.map((task) => {
                const assignee = state.devices.find((device) => device.id === task.assigneeDeviceId);
                const progress = taskProgress(task);
                const stageLine = activeDecisionStage === 'decompose'
                  ? `${task.kind} · ${task.description}`
                  : activeDecisionStage === 'dispatch'
                    ? assignee?.capabilityTags.join(' / ') ?? t('worldWindowExtra.gatewayPanel.waitingDevice')
                    : activeDecisionStage === 'monitor'
                      ? assignee
                        ? t('worldWindowExtra.gatewayPanel.taskRuntimeOk', {
                            runtime: taskRuntimeLabel(task, t),
                            value: Math.round(assignee.telemetry.batteryPercent),
                          })
                        : t('worldWindowExtra.gatewayPanel.taskRuntimeNoTelemetry', {
                            runtime: taskRuntimeLabel(task, t),
                          })
                      : t('worldWindowExtra.gatewayPanel.taskNotesWithStatus', {
                          status: taskStatusLabel(task.status, t),
                          notes: task.notes || t('worldWindowExtra.gatewayPanel.taskNotesFallback'),
                        });
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
                      <small>{activeDecisionStage === 'decompose' ? task.description : assignee?.name ?? t('worldWindowExtra.gatewayPanel.unassigned')}</small>
                      <small>{stageLine}</small>
                    </div>
                    <b>{progress}%</b>
                    <i style={{ width: `${Math.round(progress * 0.92)}px` }} />
                  </button>
                );
              }) : null}
              {activeDecisionStage !== 'intent' && !currentGoalTasks.length ? (
                <div className="terminal-empty-state">{t('worldWindowExtra.gatewayPanel.emptyTasks')}</div>
              ) : null}
            </div>
          </section>

          <DashboardLogPanel
            title={t('worldWindowExtra.gatewayPanel.decisionLog')}
            entries={gatewayLogs}
            compact
            clearedAt={clearedLogScopes.gateway}
            onClear={() => clearDisplayedLogs('gateway')}
          />
        </aside>
      </main>

      <section className="terminal-playback-strip" aria-label={t('worldWindowExtra.playback.stripAria')}>
        <button type="button" aria-label={t('worldWindowExtra.playback.gotoStart')}><FiSkipBack /></button>
        <button type="button" aria-label={t('worldWindowExtra.playback.stepBack')}><FiChevronLeft /></button>
        <button type="button" aria-label={t('worldWindowExtra.playback.play')} className="terminal-play-active" onClick={() => void tickSimulation(1)}><FiPlay /></button>
        <button type="button" aria-label={t('worldWindowExtra.playback.stepForward')}><FiChevronRight /></button>
        <button type="button" aria-label={t('worldWindowExtra.playback.gotoEnd')}><FiSkipForward /></button>
        <span>1.0x</span>
        <button type="button" aria-label={t('worldWindowExtra.playback.fullscreen')}><FiMaximize2 /></button>
      </section>

      <footer className="terminal-bottom-grid">
        <DashboardLogPanel
          title={t('worldWindowExtra.playback.systemLog')}
          entries={systemLogs}
          clearedAt={clearedLogScopes.system}
          onClear={() => clearDisplayedLogs('system')}
        />

        <section className="terminal-timeline-panel">
          <div className="terminal-section-header">
            <strong>{t('worldWindowExtra.playback.taskTimeline')}</strong>
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
            <strong>{t('worldWindowExtra.playback.worldEnvironment')}</strong>
          </div>
          <div className="terminal-env-grid">
            <div className="terminal-env-metric">
              <FiThermometer aria-hidden="true" />
              <span><em>{t('worldWindowExtra.playback.temperature')}</em><b>{t('worldWindowExtra.playback.temperatureValue', { value: temperature })}</b></span>
            </div>
            <div className="terminal-env-metric">
              <FiDroplet aria-hidden="true" />
              <span><em>{t('worldWindowExtra.playback.humidity')}</em><b>{t('worldWindowExtra.playback.humidityValue', { value: humidity })}</b></span>
            </div>
            <div className="terminal-env-metric">
              <FiWind aria-hidden="true" />
              <span><em>{t('worldWindowExtra.playback.wind')}</em><b>{t('worldWindowExtra.playback.windValue', { value: state.world.terrain.windMps ?? 3.2 })}</b></span>
            </div>
            <div className="terminal-env-metric">
              <FiCloudRain aria-hidden="true" />
              <span><em>{t('worldWindowExtra.playback.rain')}</em><b>{t('worldWindowExtra.playback.rainValue', { value: state.world.terrain.precipitationMmH ?? 0 })}</b></span>
            </div>
          </div>
        </section>

        <section className="terminal-controls-panel">
          <div className="terminal-section-header">
            <strong>{t('worldWindowExtra.playback.simControl')}</strong>
          </div>
          <button type="button" onClick={toggleSimulationPhase}>
            {state.phase === 'paused' ? <FiPlay /> : <FiPause />}
            {state.phase === 'paused' ? t('worldWindowExtra.playback.startSim') : t('worldWindowExtra.playback.pauseSim')}
          </button>
          <button type="button" onClick={requestResetWorld}>
            <FiShield />
            {pendingReset ? t('worldWindowExtra.playback.confirmReset') : t('worldWindowExtra.playback.reset')}
          </button>
          <button
            type="button"
            className="terminal-save-world"
            onClick={() =>
              void saveWorldSnapshot(`world_${state.world.id}_${Date.now()}`)
                .then((result) => setSnapshotStatus(t('worldWindowExtra.snapshot.savedPath', { path: result.path })))
                .catch((error) => setSnapshotStatus(error instanceof Error ? error.message : t('worldWindowExtra.snapshot.saveFailed')))
            }
          >
            {t('worldWindowExtra.playback.saveWorld')}
          </button>
          <small>{snapshotStatus}</small>
        </section>
      </footer>

      <div className="terminal-floating-actions">
        <IconButton
          icon={<TbWorldPlus />}
          label={t('worldWindowExtra.playback.newWorldLabel')}
          onClick={() =>
            void openWindow({
              label: 'create-world',
              kind: 'create_world',
              route: '/create-world',
              title: t('worldWindowExtra.playback.newWorldTitle'),
              width: 940,
              height: 760,
            })
          }
        />
        <IconButton
          icon={<TbAdjustmentsHorizontal />}
          label={t('worldWindowExtra.playback.controlPanelLabel')}
          onClick={() =>
            void openWindow({
              label: 'sim-control',
              kind: 'control',
              route: '/control',
              title: t('worldWindowExtra.playback.controlPanelTitle'),
              width: 1120,
              height: 760,
            })
          }
        />
        <IconButton
          icon={<TbStereoGlasses />}
          label={t('worldWindowExtra.playback.glassesLabel')}
          onClick={() =>
            void openWindow({
              label: 'sim-glasses',
              kind: 'glasses',
              route: '/glasses',
              title: t('worldWindowExtra.playback.glassesTitle'),
              width: 980,
              height: 720,
            })
          }
        />
        <IconButton icon={<TbDeviceFloppy />} label={t('worldWindowExtra.playback.saveSnapshot')} onClick={() => void saveWorldSnapshot(`world_${state.world.id}_${Date.now()}`)} />
        <IconButton
          icon={<FiSettings />}
          label={t('worldWindowExtra.playback.settingsLabel')}
          onClick={() =>
            void openWindow({
              label: 'sim-settings',
              kind: 'settings',
              route: '/settings',
              title: t('worldWindowExtra.playback.settingsTitle'),
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
  const { t } = useTranslation();
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
          <span>{t('worldWindowExtra.terminalLog.countLabel', { count: filteredEntries.length })}</span>
          <select
            aria-label={t('worldWindowExtra.terminalLog.levelFilterAria', { title })}
            value={levelFilter}
            title={t('worldWindowExtra.terminalLog.allLevelsTitle')}
            onChange={(event) => setLevelFilter(event.target.value as typeof levelFilter)}
          >
            <option value="all">{t('worldWindowExtra.terminalLog.allLevels')}</option>
            <option value="debug">DEBUG</option>
            <option value="info">INFO</option>
            <option value="success">SUCCESS</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>
          <button
            type="button"
            className={compact ? 'terminal-light-icon-button' : undefined}
            aria-label={autoScroll
              ? t('worldWindowExtra.terminalLog.autoScrollPause', { title })
              : t('worldWindowExtra.terminalLog.autoScrollEnable', { title })}
            aria-pressed={autoScroll}
            title={autoScroll
              ? t('worldWindowExtra.terminalLog.autoScrollPauseTitle')
              : t('worldWindowExtra.terminalLog.autoScrollEnableTitle')}
            onClick={() => setAutoScroll((current) => !current)}
          >
            {autoScroll ? <FiPlay /> : <FiPause />}
            {compact ? null : <span>{autoScroll
              ? t('worldWindowExtra.terminalLog.autoScrollOn')
              : t('worldWindowExtra.terminalLog.autoScrollPaused')}</span>}
          </button>
          <button
            type="button"
            className="terminal-light-icon-button"
            aria-label={t('worldWindowExtra.terminalLog.scrollToBottom', { title })}
            title={t('worldWindowExtra.terminalLog.scrollToBottomTitle')}
            onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })}
          >
            <FiArrowDown />
          </button>
          {onClear ? (
            <button
              type="button"
              className={compact ? 'terminal-light-icon-button' : undefined}
              aria-label={t('worldWindowExtra.terminalLog.clearLogs', { title })}
              title={t('worldWindowExtra.terminalLog.clearLogs', { title })}
              onClick={onClear}
            >
              {compact ? <FiTrash2 /> : <span>{t('worldWindowExtra.terminalLog.clear')}</span>}
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
          <div className="terminal-empty-state">{t('worldWindowExtra.terminalLog.empty')}</div>
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
      <span className="terminal-status-label">{label}</span>
      {icon ? <span className="terminal-status-icon" aria-hidden="true">{icon}</span> : null}
      <span className="terminal-status-value-stack">
        <strong>{value}</strong>
        {note ? <small>{note}</small> : null}
      </span>
    </div>
  );
}
