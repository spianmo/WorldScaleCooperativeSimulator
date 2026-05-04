import {
  createDefaultSimulationState,
  createSimulationLogEntry,
  type DeviceKind,
  type SimulationDevice,
  type SimulationGoal,
  type SimulationState,
  type SimulationTask,
  type WorldObject,
  type WorldSnapshot,
  type WorldSnapshotRecord,
} from '../types';
import { appendDeviceToState, appendGoalToState, replaceWorldInState, touchStateClock } from '../state/simulationStore';

type BrowserInvokeArgs = Record<string, unknown> | undefined;
type BrowserInvokeHandler = (args: BrowserInvokeArgs) => unknown | Promise<unknown>;

const STORAGE_KEY = 'world-scale-simulator.state';
const SNAPSHOT_KEY = 'world-scale-simulator.snapshots';
const browserHandlers = new Map<string, BrowserInvokeHandler>();

let memoryState = createDefaultSimulationState();
let memorySnapshots: Record<string, SimulationState> = {};

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function resolveBrowserTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStoredState(): SimulationState {
  if (!canUseLocalStorage()) {
    return memoryState;
  }

  const rawState = window.localStorage.getItem(STORAGE_KEY);
  if (!rawState) {
    return memoryState;
  }

  try {
    const parsed = JSON.parse(rawState) as SimulationState;
    memoryState = parsed;
    return parsed;
  } catch {
    return memoryState;
  }
}

function writeStoredState(state: SimulationState) {
  memoryState = state;

  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function readStoredSnapshots(): Record<string, SimulationState> {
  if (!canUseLocalStorage()) {
    return memorySnapshots;
  }

  const rawSnapshots = window.localStorage.getItem(SNAPSHOT_KEY);
  if (!rawSnapshots) {
    return memorySnapshots;
  }

  try {
    memorySnapshots = JSON.parse(rawSnapshots) as Record<string, SimulationState>;
    return memorySnapshots;
  } catch {
    return memorySnapshots;
  }
}

function writeStoredSnapshots(snapshots: Record<string, SimulationState>) {
  memorySnapshots = snapshots;

  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
}

function cloneState(state: SimulationState): SimulationState {
  return JSON.parse(JSON.stringify(state)) as SimulationState;
}

function extractSimulationState(args: BrowserInvokeArgs): SimulationState {
  if (!args || typeof args !== 'object') {
    return readStoredState();
  }

  const candidate = args.state;
  if (candidate && typeof candidate === 'object') {
    return candidate as SimulationState;
  }

  return readStoredState();
}

function extractDeviceId(args: BrowserInvokeArgs): string {
  if (!args || typeof args !== 'object' || typeof args.deviceId !== 'string') {
    throw new Error('browser fallback 需要 deviceId 参数');
  }

  return args.deviceId;
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function weatherPhysics(weather: WorldSnapshot['terrain']['weather']) {
  if (weather === 'stormy') {
    return {
      precipitationMmH: 18,
      windMps: 16,
      visibilityM: 140,
      surfaceFrictionScale: 0.55,
    };
  }
  if (weather === 'rainy') {
    return {
      precipitationMmH: 8,
      windMps: 6,
      visibilityM: 420,
      surfaceFrictionScale: 0.72,
    };
  }
  if (weather === 'foggy') {
    return {
      precipitationMmH: 0.8,
      windMps: 2,
      visibilityM: 90,
      surfaceFrictionScale: 0.86,
    };
  }
  if (weather === 'windy') {
    return {
      precipitationMmH: 0,
      windMps: 11,
      visibilityM: 900,
      surfaceFrictionScale: 0.94,
    };
  }
  if (weather === 'cloudy') {
    return {
      precipitationMmH: 0,
      windMps: 4,
      visibilityM: 1200,
      surfaceFrictionScale: 1,
    };
  }
  return {
    precipitationMmH: 0,
    windMps: 1.5,
    visibilityM: 1600,
    surfaceFrictionScale: 1,
  };
}

function createGeneratedWorld(args: BrowserInvokeArgs): WorldSnapshot {
  const current = readStoredState();
  const input = args && typeof args === 'object' && args.input && typeof args.input === 'object'
    ? (args.input as { name?: string; seed?: number; object_density?: number })
    : {};
  const timestamp = nowIso();
  const density = input.object_density ?? 0.2;
  const blocksPerAxis = Math.max(4, Math.min(8, Math.round(4 + density * 8)));
  const spacing = 100 / blocksPerAxis;
  const objects: WorldObject[] = [];
  const weather = ['sunny', 'cloudy', 'rainy', 'foggy', 'windy', 'stormy'][Math.floor(Math.random() * 6)] as WorldSnapshot['terrain']['weather'];
  const roadNames = ['解放路', '中轴大道', '滨河路', '科创街', '人民路', '站前大道', '新华路', '云栖路'];
  const buildingNames = ['新华大厦', '城市运行中心', '数字孪生塔', '能源调度站', '市民服务楼', '轨交换乘楼'];

  for (let index = 0; index <= blocksPerAxis; index += 1) {
    const coord = index * spacing;
    objects.push({
      id: randomId('road-x'),
      kind: 'road_segment',
      name: `${roadNames[index % roadNames.length]}-东西向`,
      description: '连续城市路网主干道，承载地面设备巡检和任务路径规划。',
      position: [50, 0, coord],
      rotation: [0, 0, 0],
      scale: [104, 0.2, 2.8],
      materialId: 'mat-asphalt',
      tags: ['road_segment', 'urban_grid', 'continuous'],
    });
    objects.push({
      id: randomId('road-z'),
      kind: 'road_segment',
      name: `${roadNames[(index + 3) % roadNames.length]}-南北向`,
      description: '连续城市路网支路，和主干道形成网格拓扑。',
      position: [coord, 0, 50],
      rotation: [0, Math.PI / 2, 0],
      scale: [104, 0.2, 2.8],
      materialId: 'mat-asphalt',
      tags: ['road_segment', 'urban_grid', 'continuous'],
    });
  }

  for (let x = 0; x < blocksPerAxis; x += 1) {
    for (let z = 0; z < blocksPerAxis; z += 1) {
      const centerX = x * spacing + spacing / 2;
      const centerZ = z * spacing + spacing / 2;
      const district = (x + z) % buildingNames.length;
      const height = 10 + ((x * 7 + z * 11) % 36);
      objects.push({
        id: randomId('building'),
        kind: 'building',
        name: `${buildingNames[district]}-${x + 1}-${z + 1}`,
        description: '数字孪生城市场景建筑单元，和路网保持连续空间关系。',
        position: [centerX, 0, centerZ],
        rotation: [0, 0, 0],
        scale: [Math.max(5, spacing * 0.36), height, Math.max(5, spacing * 0.36)],
        materialId: 'mat-concrete',
        tags: ['building', 'city_block', 'digital_twin'],
      });

      if ((x + z) % 3 === 0) {
        objects.push({
          id: randomId('plaza'),
          kind: 'terrain_patch',
          name: `城市开放空间-${x + 1}-${z + 1}`,
          description: '可通行的广场或绿地，用作设备协同会合与观测区域。',
          position: [centerX + spacing * 0.24, 0, centerZ - spacing * 0.24],
          rotation: [0, 0, 0],
          scale: [Math.max(3, spacing * 0.22), 0.2, Math.max(3, spacing * 0.22)],
          materialId: 'mat-grass',
          tags: ['terrain_patch', 'plaza', 'walkable'],
        });
      }
    }
  }

  objects.push({
    id: randomId('landmark'),
    kind: 'landmark',
    name: '城市数字孪生中枢',
    description: '城市级群体智能调度与反馈中心。',
    position: [50, 0, 50],
    rotation: [0, 0, 0],
    scale: [8, 54, 8],
    materialId: 'mat-concrete',
    tags: ['landmark', 'digital_twin_core'],
  });
  objects.push({
    id: randomId('charging'),
    kind: 'charging_pad',
    name: '城市能源补给站',
    description: '无人机、轮式机器人和机器狗的统一充电与补给节点。',
    position: [spacing, 0, spacing],
    rotation: [0, 0, 0],
    scale: [8, 0.3, 8],
    materialId: 'mat-concrete',
    tags: ['charging_pad', 'energy_node', 'interactive'],
  });

  return {
    ...current.world,
    id: randomId('world'),
    name: input.name ?? '连续城市数字孪生',
    description: '浏览器 fallback 生成的连续城市场景数字孪生世界。',
    seed: String(input.seed ?? Date.now()),
    terrain: {
      slopeDeg: 4,
      weather,
      ...weatherPhysics(weather),
    },
    objects,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function rustKindToUi(kind?: string): DeviceKind {
  if (kind === 'drone') {
    return 'drone';
  }
  if (kind === 'humanoid') {
    return 'humanoid';
  }
  if (kind === 'quadruped') {
    return 'quadruped';
  }
  if (kind === 'sensor_hub') {
    return 'sensor_node';
  }
  return 'wheeled_robot';
}

function defaultPhysicalProfile(kind: DeviceKind, state = readStoredState()) {
  const rules = state.physicalRules;

  if (kind === 'drone') {
    return {
      minWorkAltitudeM: rules.droneMinAltitudeM,
      maxWorkAltitudeM: rules.droneMaxAltitudeM,
      maxSlopeDeg: 90,
      supportedMaterials: ['air'],
      nominalPowerW: 36,
      workingPowerW: 180,
      maxSpeedMps: 12,
      jointCount: 4,
    };
  }

  if (kind === 'humanoid') {
    return {
      minWorkAltitudeM: 0,
      maxWorkAltitudeM: 2.4,
      maxSlopeDeg: rules.humanoidMaxSlopeDeg,
      supportedMaterials: [...rules.groundAllowedMaterials],
      nominalPowerW: 42,
      workingPowerW: 260,
      maxSpeedMps: 1.4,
      jointCount: 24,
    };
  }

  if (kind === 'quadruped') {
    return {
      minWorkAltitudeM: 0,
      maxWorkAltitudeM: 1.4,
      maxSlopeDeg: rules.quadrupedMaxSlopeDeg,
      supportedMaterials: [...rules.groundAllowedMaterials],
      nominalPowerW: 30,
      workingPowerW: 180,
      maxSpeedMps: 2.2,
      jointCount: 12,
    };
  }

  return {
    minWorkAltitudeM: 0,
    maxWorkAltitudeM: 2,
    maxSlopeDeg: rules.roverMaxSlopeDeg,
    supportedMaterials: rules.groundAllowedMaterials.filter((material) => material !== 'grass'),
    nominalPowerW: 18,
    workingPowerW: 90,
    maxSpeedMps: 2,
    jointCount: 4,
  };
}

function createDeviceFromArgs(args: BrowserInvokeArgs): SimulationDevice {
  if (args && typeof args === 'object' && args.device) {
    return args.device as SimulationDevice;
  }
  if (!args || typeof args !== 'object' || !args.input || typeof args.input !== 'object') {
    throw new Error('browser fallback 需要 input 或 device 参数');
  }

  const input = args.input as {
    name?: string;
    kind?: string;
    battery?: number;
    position?: { x: number; y: number; z: number };
    capabilities?: string[];
    physical_profile?: {
      min_work_altitude_m: number;
      max_work_altitude_m: number;
      max_slope_deg: number;
      supported_materials: string[];
      nominal_power_w: number;
      working_power_w: number;
      max_speed_mps: number;
      joint_count: number;
    };
  };
  const now = nowIso();
  const kind = rustKindToUi(input.kind);
  const profile = input.physical_profile
    ? {
        minWorkAltitudeM: input.physical_profile.min_work_altitude_m,
        maxWorkAltitudeM: input.physical_profile.max_work_altitude_m,
        maxSlopeDeg: input.physical_profile.max_slope_deg,
        supportedMaterials: input.physical_profile.supported_materials,
        nominalPowerW: input.physical_profile.nominal_power_w,
        workingPowerW: input.physical_profile.working_power_w,
        maxSpeedMps: input.physical_profile.max_speed_mps,
        jointCount: input.physical_profile.joint_count,
      }
    : defaultPhysicalProfile(kind);
  return {
    id: randomId('device'),
    kind,
    name: input.name ?? '模拟设备',
    status: 'idle',
    capabilityTags: input.capabilities ?? (kind === 'drone' ? ['aerial_move', 'photo'] : ['ground_move', 'inspect']),
    physicalProfile: profile,
    telemetry: {
      position: input.position ? [input.position.x, input.position.y, input.position.z] : [0, kind === 'drone' ? 8 : 0, 0],
      velocity: [0, 0, 0],
      headingDeg: 0,
      batteryPercent: input.battery ?? 100,
      powerW: profile.nominalPowerW,
      signalStrength: 96,
      temperatureC: 30,
      speedMps: 0,
      jointAnglesDeg: Array.from({ length: Math.min(profile.jointCount, 8) }, () => 0),
      jointQuaternion: [0, 0, 0, 1],
      lastSeenAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createGatewayGoalAndTasksFromArgs(args: BrowserInvokeArgs): { goal: SimulationGoal; tasks: SimulationTask[] } {
  if (args && typeof args === 'object' && args.goal) {
    return {
      goal: args.goal as SimulationGoal,
      tasks: [],
    };
  }
  if (!args || typeof args !== 'object' || !args.input || typeof args.input !== 'object') {
    throw new Error('browser fallback 需要 input 或 goal 参数');
  }

  const input = args.input as { title?: string; description?: string; priority?: number };
  const now = nowIso();
  const goalId = randomId('goal');
  const title = input.title ?? '协同目标';
  const devices = readStoredState().devices;
  const taskTitles = [
    'intent_agent 解析 AR 眼镜目标',
    'dispatch_agent 选择可用异构终端',
    'safety_agent 校验执行边界并下发',
  ];
  const tasks: SimulationTask[] = taskTitles.map((taskTitle, index) => ({
    id: randomId('task'),
    goalId,
    kind: index === 0 ? 'custom' : index === 1 ? 'inspect' : 'custom',
    title: taskTitle,
    description: input.description ?? title,
    status: devices.length ? 'active' : 'blocked',
    progress: devices.length ? 0.04 : 0,
    notes: 'browser fallback agent plan',
    createdAt: now,
    updatedAt: now,
    assigneeDeviceId: devices[index % Math.max(1, devices.length)]?.id,
  }));
  return {
    goal: {
      id: goalId,
      title,
      description: input.description ?? title,
      sourceText: input.description ?? title,
      priority: (input.priority ?? 5) >= 9 ? 'urgent' : (input.priority ?? 5) >= 7 ? 'high' : 'normal',
      status: 'active',
      childTaskIds: tasks.map((task) => task.id),
      createdAt: now,
      updatedAt: now,
    },
    tasks,
  };
}

function createBrowserLlmSseLogs(goal: SimulationGoal, tasks: SimulationTask[]) {
  const taskSummary = tasks.length
    ? tasks.map((task, index) => `${index + 1}. ${task.title}`).join('；')
    : '无可执行任务';

  return [
    createSimulationLogEntry({
      level: 'info',
      scope: 'llm_sse',
      message: '浏览器 fallback: LLM SSE 请求开始，使用模拟 agents 规划流。',
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'debug',
      scope: 'llm_sse',
      message: `浏览器 fallback: LLM SSE delta #1: intent_agent 已解析目标「${goal.title}」。`,
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'debug',
      scope: 'llm_sse',
      message: `浏览器 fallback: LLM SSE delta #2: dispatch_agent 生成任务：${taskSummary}`,
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'debug',
      scope: 'llm_sse',
      message: '浏览器 fallback: LLM SSE delta #3: safety_agent 已校验执行边界。',
      details: goal.id,
    }),
    createSimulationLogEntry({
      level: 'info',
      scope: 'llm_sse',
      message: `浏览器 fallback: LLM SSE 结果解析完成，tasks=${tasks.length}。`,
      details: goal.id,
    }),
  ];
}

function extractSteps(args: BrowserInvokeArgs): number {
  if (!args || typeof args !== 'object') {
    return 1;
  }
  const input = args.input;
  if (input && typeof input === 'object' && typeof (input as { steps?: unknown }).steps === 'number') {
    return Math.max(1, (input as { steps: number }).steps);
  }
  return typeof args.deltaMs === 'number' ? 1 : 1;
}

function sanitizeSnapshotName(name: string) {
  return name.replace(/[^A-Za-z0-9_-]/g, '_');
}

function registerDefaultHandlers() {
  browserHandlers.set('load_state', () => cloneState(readStoredState()));
  browserHandlers.set('save_state', (args) => {
    const nextState = extractSimulationState(args);
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('generate_world', (args) => {
    const currentState = readStoredState();
    const nextWorld = createGeneratedWorld(args);
    const nextState = replaceWorldInState(currentState, nextWorld);
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('register_device', (args) => {
    const currentState = readStoredState();
    const nextState = appendDeviceToState(currentState, createDeviceFromArgs(args));
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('remove_device', (args) => {
    const currentState = readStoredState();
    const nextState = currentState.devices.length
      ? {
          ...currentState,
          devices: currentState.devices.filter((device) => device.id !== extractDeviceId(args)),
          clock: touchStateClock(currentState.clock),
        }
      : currentState;
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('update_settings', (args) => {
    const currentState = readStoredState();
    const patch = args && typeof args === 'object' && args.patch && typeof args.patch === 'object'
      ? args.patch as {
          drone_min_altitude_m?: number;
          drone_max_altitude_m?: number;
          rover_max_slope_deg?: number;
          humanoid_max_slope_deg?: number;
          quadruped_max_slope_deg?: number;
          ground_allowed_materials?: string[];
          language?: 'zh-CN' | 'en-US';
          theme?: 'light' | 'dark' | 'system';
          auto_save?: boolean;
          auto_save_every_tick?: boolean;
          default_tick_seconds?: number;
          log_level?: SimulationState['settings']['logLevel'];
          terminal_log_density?: SimulationState['settings']['terminalLogDensity'];
        }
      : {};
    const nextState: SimulationState = {
      ...currentState,
      clock: touchStateClock(currentState.clock),
      settings: {
        ...currentState.settings,
        locale: patch.language ?? currentState.settings.locale,
        logLevel: patch.log_level ?? currentState.settings.logLevel,
        autosaveEnabled: patch.auto_save_every_tick ?? patch.auto_save ?? currentState.settings.autosaveEnabled,
        terminalLogDensity: patch.terminal_log_density ?? currentState.settings.terminalLogDensity,
        tickIntervalMs: patch.default_tick_seconds === undefined
          ? currentState.settings.tickIntervalMs
          : Math.round(patch.default_tick_seconds * 1000),
        theme: {
          mode: patch.theme ?? currentState.settings.theme.mode,
          resolvedMode: patch.theme === 'dark'
            ? 'dark'
            : patch.theme === 'light'
              ? 'light'
              : resolveBrowserTheme(),
        },
      },
      physicalRules: {
        ...currentState.physicalRules,
        droneMinAltitudeM: patch.drone_min_altitude_m ?? currentState.physicalRules.droneMinAltitudeM,
        droneMaxAltitudeM: patch.drone_max_altitude_m ?? currentState.physicalRules.droneMaxAltitudeM,
        roverMaxSlopeDeg: patch.rover_max_slope_deg ?? currentState.physicalRules.roverMaxSlopeDeg,
        humanoidMaxSlopeDeg: patch.humanoid_max_slope_deg ?? currentState.physicalRules.humanoidMaxSlopeDeg,
        quadrupedMaxSlopeDeg: patch.quadruped_max_slope_deg ?? currentState.physicalRules.quadrupedMaxSlopeDeg,
        groundAllowedMaterials: patch.ground_allowed_materials ?? currentState.physicalRules.groundAllowedMaterials,
      },
      logs: currentState.logs.concat(
        createSimulationLogEntry({
          level: 'info',
          scope: 'rules',
          message: '浏览器 fallback 已更新物理规则。',
        }),
      ),
    };
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('submit_goal', (args) => {
    const currentState = readStoredState();
    const { goal, tasks } = createGatewayGoalAndTasksFromArgs(args);
    const nextState = {
      ...appendGoalToState(currentState, goal),
      devices: currentState.devices.map((device) => {
        const activeTask = tasks.find((task) => task.assigneeDeviceId === device.id);
        return activeTask
          ? {
              ...device,
              status: 'working' as const,
              currentTaskId: activeTask.id,
              updatedAt: nowIso(),
            }
          : device;
      }),
      tasks: currentState.tasks.concat(tasks),
      logs: currentState.logs.concat(
        ...createBrowserLlmSseLogs(goal, tasks),
        createSimulationLogEntry({
          level: 'info',
          scope: 'gateway',
          message: `浏览器 fallback: AR 眼镜目标已进入中枢 agents 计划，并立即指派 ${tasks.filter((task) => task.assigneeDeviceId).length} 个任务。`,
          details: goal.id,
        }),
      ),
    };
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('tick_simulation', (args) => {
    const currentState = readStoredState();
    const steps = extractSteps(args);
    const weather = currentState.world.terrain.weather;
    const frictionScale = currentState.world.terrain.surfaceFrictionScale ?? weatherPhysics(weather).surfaceFrictionScale;
    const windMps = currentState.world.terrain.windMps ?? weatherPhysics(weather).windMps;
    const activeTaskByDevice = new Map<string, SimulationTask>();
    currentState.tasks.forEach((task) => {
      if (task.assigneeDeviceId && task.status !== 'completed' && task.status !== 'canceled' && task.status !== 'failed') {
        activeTaskByDevice.set(task.assigneeDeviceId, task);
      }
    });
    const nextState = {
      ...currentState,
      phase: currentState.phase === 'booting' ? 'idle' : currentState.phase,
      clock: {
        step: currentState.clock.step + steps,
        simulationTimeMs: currentState.clock.simulationTimeMs + steps * currentState.settings.tickIntervalMs,
        wallClockAt: new Date().toISOString(),
      },
      devices: currentState.devices.map((device) => {
        const activeTask = activeTaskByDevice.get(device.id);
        const working = Boolean(activeTask);
        const profile = device.physicalProfile ?? defaultPhysicalProfile(device.kind, currentState);
        const weatherSpeedScale = device.kind === 'drone'
          ? Math.max(0.35, 1 - windMps / 34)
          : Math.max(0.35, frictionScale);
        const speed = working ? profile.maxSpeedMps * weatherSpeedScale : 0;
        const distance = speed * steps * Math.max(0.2, currentState.settings.tickIntervalMs / 1000);
        const taskHash = activeTask
          ? [...activeTask.id].reduce((acc, char) => acc + char.charCodeAt(0), 0)
          : 0;
        const nextHeading = working ? (device.telemetry.headingDeg + steps * (7 + taskHash % 9)) % 360 : device.telemetry.headingDeg;
        const headingRad = (nextHeading / 180) * Math.PI;
        const drift = device.kind === 'drone' ? windMps * 0.04 * steps : windMps * 0.006 * steps;
        const nextPosition: [number, number, number] = [
          Number((device.telemetry.position[0] + Math.cos(headingRad) * distance + drift).toFixed(2)),
          device.kind === 'drone'
            ? Math.min(Math.max(device.telemetry.position[1], currentState.physicalRules.droneMinAltitudeM), currentState.physicalRules.droneMaxAltitudeM)
            : device.telemetry.position[1],
          Number((device.telemetry.position[2] + Math.sin(headingRad) * distance + drift * 0.35).toFixed(2)),
        ];
        const nextVelocity: [number, number, number] = [
          Number((Math.cos(headingRad) * speed + drift).toFixed(2)),
          0,
          Number((Math.sin(headingRad) * speed + drift * 0.35).toFixed(2)),
        ];
        const jointQuaternion: [number, number, number, number] = [0, Math.sin(headingRad / 2), 0, Math.cos(headingRad / 2)];
        return {
          ...device,
          status: working ? 'working' : device.status,
          currentTaskId: activeTask?.id ?? device.currentTaskId,
          telemetry: {
            ...device.telemetry,
            position: nextPosition,
            velocity: nextVelocity,
            headingDeg: nextHeading,
            batteryPercent: Math.max(0, device.telemetry.batteryPercent - (working ? steps * 1.4 : steps * 0.2)),
            powerW: working ? profile.workingPowerW : profile.nominalPowerW,
            temperatureC: working ? Math.min(72, device.telemetry.temperatureC + steps * 0.8) : Math.max(28, device.telemetry.temperatureC - steps * 0.2),
            speedMps: speed,
            jointAnglesDeg: Array.from({ length: Math.min(profile.jointCount, 8) }, (_, index) => Math.round((nextHeading + index * 13 + currentState.clock.step * 7) % 90)),
            jointQuaternion,
            lastSeenAt: nowIso(),
          },
          updatedAt: nowIso(),
        };
      }),
      tasks: currentState.tasks.map((task): SimulationTask => {
        if (task.status === 'completed') {
          return task;
        }
        const progress = Math.min(1, task.progress + steps * 0.18);
        return {
          ...task,
          status: progress >= 1 ? 'completed' : 'active',
          progress,
          updatedAt: nowIso(),
        };
      }),
    };
    writeStoredState(nextState);
    return cloneState(nextState);
  });
  browserHandlers.set('save_world_snapshot', (args) => {
    const input = args && typeof args === 'object' && args.input && typeof args.input === 'object'
      ? args.input as { snapshot_name?: string }
      : {};
    const snapshotName = sanitizeSnapshotName(input.snapshot_name ?? `world_${readStoredState().world.id}`);
    const snapshots = readStoredSnapshots();
    writeStoredSnapshots({
      ...snapshots,
      [snapshotName]: cloneState(readStoredState()),
    });
    return { path: `localStorage://${SNAPSHOT_KEY}/${snapshotName}.toml` };
  });
  browserHandlers.set('list_world_snapshots', () => {
    const snapshots = readStoredSnapshots();
    const records: WorldSnapshotRecord[] = Object.entries(snapshots).map(([snapshotName, state]) => ({
      snapshotName,
      path: `localStorage://${SNAPSHOT_KEY}/${snapshotName}.toml`,
      modifiedAt: state.world.updatedAt,
    }));
    return records.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  });
  browserHandlers.set('open_world_snapshot', (args) => {
    const input = args && typeof args === 'object' && args.input && typeof args.input === 'object'
      ? args.input as { snapshot_name?: string }
      : {};
    const snapshotName = sanitizeSnapshotName(input.snapshot_name ?? '');
    const snapshot = readStoredSnapshots()[snapshotName];
    if (!snapshot) {
      throw new Error(`浏览器 fallback 未找到世界快照: ${snapshotName}`);
    }
    writeStoredState(snapshot);
    return cloneState(snapshot);
  });
}

registerDefaultHandlers();

export function registerBrowserInvokeHandler(command: string, handler: BrowserInvokeHandler) {
  browserHandlers.set(command, handler);
}

export function resetBrowserSimulationState() {
  writeStoredState(createDefaultSimulationState());
}

export function getBrowserSimulationState() {
  return cloneState(readStoredState());
}

export function setBrowserSimulationState(state: SimulationState) {
  writeStoredState(cloneState(state));
}

export async function invokeBrowserCommand<T>(command: string, args?: BrowserInvokeArgs): Promise<T> {
  const handler = browserHandlers.get(command);
  if (!handler) {
    throw new Error(`浏览器 fallback 未注册命令: ${command}`);
  }

  return handler(args) as Promise<T> | T;
}
