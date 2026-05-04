export const SUPPORTED_THEME_MODES = ['light', 'dark', 'system'] as const;
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export const SIMULATION_WINDOW_KINDS = [
  'world',
  'control',
  'device',
  'glasses',
  'task',
  'settings',
  'create_world',
  'create_device',
] as const;

export const DEVICE_KINDS = [
  'drone',
  'wheeled_robot',
  'humanoid',
  'quadruped',
  'sensor_node',
] as const;

export const TASK_KINDS = [
  'inspect',
  'photo',
  'search',
  'move',
  'deliver',
  'observe',
  'custom',
] as const;

export const TASK_STATUSES = [
  'queued',
  'active',
  'blocked',
  'completed',
  'failed',
  'canceled',
] as const;

export const GOAL_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;
export const SIMULATION_PHASES = ['booting', 'idle', 'running', 'paused', 'error'] as const;

export type ThemeMode = (typeof SUPPORTED_THEME_MODES)[number];
export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];
export type SimulationWindowKind = (typeof SIMULATION_WINDOW_KINDS)[number];
export type DeviceKind = (typeof DEVICE_KINDS)[number];
export type TaskKind = (typeof TASK_KINDS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type GoalPriority = (typeof GOAL_PRIORITIES)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];
export type SimulationPhase = (typeof SIMULATION_PHASES)[number];

export type Vector3Tuple = readonly [number, number, number];
export type EulerTuple = readonly [number, number, number];
export type QuaternionTuple = readonly [number, number, number, number];

export interface SimulationThemeSettings {
  mode: ThemeMode;
  resolvedMode: Exclude<ThemeMode, 'system'>;
}

export interface SimulationSettings {
  theme: SimulationThemeSettings;
  locale: LocaleCode;
  logLevel: LogLevel;
  autosaveEnabled: boolean;
  tickIntervalMs: number;
  terminalLogDensity: 'compact' | 'normal' | 'verbose';
}

export interface PhysicalRules {
  droneMinAltitudeM: number;
  droneMaxAltitudeM: number;
  roverMaxSlopeDeg: number;
  humanoidMaxSlopeDeg: number;
  quadrupedMaxSlopeDeg: number;
  groundAllowedMaterials: string[];
}

export interface WorldMaterial {
  id: string;
  name: string;
  color: string;
  friction?: number;
  tags: string[];
}

export interface WorldObject {
  id: string;
  kind: string;
  name: string;
  description: string;
  position: Vector3Tuple;
  rotation: EulerTuple;
  scale: Vector3Tuple;
  materialId?: string;
  tags: string[];
}

export interface WorldSnapshot {
  id: string;
  name: string;
  description: string;
  seed: string;
  coordinateSystemVisible: boolean;
  terrain: {
    slopeDeg: number;
    weather: 'sunny' | 'cloudy' | 'rainy' | 'foggy' | 'windy' | 'stormy';
    precipitationMmH?: number;
    windMps?: number;
    visibilityM?: number;
    surfaceFrictionScale?: number;
  };
  materials: WorldMaterial[];
  objects: WorldObject[];
  createdAt: string;
  updatedAt: string;
}

export interface SimulationClock {
  step: number;
  simulationTimeMs: number;
  wallClockAt: string;
}

export interface DeviceTelemetry {
  position: Vector3Tuple;
  velocity: Vector3Tuple;
  headingDeg: number;
  batteryPercent: number;
  powerW: number;
  signalStrength: number;
  temperatureC: number;
  speedMps: number;
  jointAnglesDeg: readonly number[];
  jointQuaternion?: QuaternionTuple;
  lastSeenAt: string;
}

export interface DevicePhysicalProfile {
  minWorkAltitudeM: number;
  maxWorkAltitudeM: number;
  maxSlopeDeg: number;
  supportedMaterials: string[];
  nominalPowerW: number;
  workingPowerW: number;
  maxSpeedMps: number;
  jointCount: number;
}

export interface SimulationDevice {
  id: string;
  kind: DeviceKind;
  name: string;
  status: 'offline' | 'idle' | 'working' | 'error';
  capabilityTags: string[];
  physicalProfile: DevicePhysicalProfile;
  currentTaskId?: string;
  telemetry: DeviceTelemetry;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationGoal {
  id: string;
  title: string;
  description: string;
  sourceText: string;
  priority: GoalPriority;
  status: 'queued' | 'active' | 'suspended' | 'completed' | 'failed';
  childTaskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SimulationTask {
  id: string;
  goalId?: string;
  parentTaskId?: string;
  kind: TaskKind;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeDeviceId?: string;
  progress: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimulationLogEntry {
  id: string;
  level: LogLevel;
  scope: string;
  message: string;
  details?: string;
  timestamp: string;
}

export interface SimulationWindowRecord {
  label: string;
  kind: SimulationWindowKind;
  title: string;
  route: string;
  width: number;
  height: number;
  x: number;
  y: number;
  visible: boolean;
  focused: boolean;
  lastOpenedAt: string;
}

export interface SimulationState {
  version: number;
  phase: SimulationPhase;
  clock: SimulationClock;
  settings: SimulationSettings;
  world: WorldSnapshot;
  physicalRules: PhysicalRules;
  devices: SimulationDevice[];
  goals: SimulationGoal[];
  tasks: SimulationTask[];
  logs: SimulationLogEntry[];
  windows: SimulationWindowRecord[];
}

export interface WorldSnapshotRecord {
  snapshotName: string;
  path: string;
  modifiedAt: string;
}

export interface SimulationStateEnvelope {
  version: number;
  state: SimulationState;
  savedAt: string;
}

function nowIso() {
  return new Date().toISOString();
}

let fallbackLogEntrySequence = 0;

function createFallbackLogEntryId() {
  fallbackLogEntrySequence = (fallbackLogEntrySequence + 1) % Number.MAX_SAFE_INTEGER;
  // 批量 fallback 日志可能在同一毫秒生成，序号用于避免 React key 冲突。
  return `log-${Date.now()}-${fallbackLogEntrySequence}`;
}

function createDefaultWorldSnapshot(): WorldSnapshot {
  const timestamp = nowIso();

  return {
    id: 'world-default',
    name: '默认物理世界',
    description: '用于前端基础层联调的默认世界快照。',
    seed: 'seed-0001',
    coordinateSystemVisible: true,
    terrain: {
      slopeDeg: 2,
      weather: 'sunny',
    },
    materials: [
      {
        id: 'mat-asphalt',
        name: '沥青',
        color: '#2b2f33',
        friction: 0.84,
        tags: ['road', 'ground'],
      },
      {
        id: 'mat-concrete',
        name: '混凝土',
        color: '#d8dadd',
        friction: 0.78,
        tags: ['structure', 'ground'],
      },
    ],
    objects: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createDefaultSimulationState(): SimulationState {
  const timestamp = nowIso();

  return {
    version: 1,
    phase: 'booting',
    clock: {
      step: 0,
      simulationTimeMs: 0,
      wallClockAt: timestamp,
    },
    settings: {
      theme: {
        mode: 'system',
        resolvedMode: 'light',
      },
      locale: 'zh-CN',
      logLevel: 'info',
      autosaveEnabled: true,
      tickIntervalMs: 1000,
      terminalLogDensity: 'normal',
    },
    world: createDefaultWorldSnapshot(),
    physicalRules: {
      droneMinAltitudeM: 3,
      droneMaxAltitudeM: 60,
      roverMaxSlopeDeg: 12,
      humanoidMaxSlopeDeg: 18,
      quadrupedMaxSlopeDeg: 28,
      groundAllowedMaterials: ['asphalt', 'concrete', 'grass', 'packed_soil'],
    },
    devices: [],
    goals: [],
    tasks: [],
    logs: [
      {
        id: 'log-bootstrap',
        level: 'info',
        scope: 'bootstrap',
        message: 'Simulation state 初始化完成。',
        timestamp,
      },
    ],
    windows: [
      {
        label: 'world-simulator',
        kind: 'world',
        title: '物理世界仿真场景',
        route: '#/world',
        width: 1440,
        height: 900,
        x: 40,
        y: 40,
        visible: true,
        focused: true,
        lastOpenedAt: timestamp,
      },
    ],
  };
}

export function createSimulationLogEntry(
  entry: Omit<SimulationLogEntry, 'id' | 'timestamp'> & Partial<Pick<SimulationLogEntry, 'id' | 'timestamp'>>,
): SimulationLogEntry {
  return {
    id: entry.id ?? createFallbackLogEntryId(),
    level: entry.level,
    scope: entry.scope,
    message: entry.message,
    details: entry.details,
    timestamp: entry.timestamp ?? nowIso(),
  };
}
