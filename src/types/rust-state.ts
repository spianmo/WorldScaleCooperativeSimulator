import { tx } from '../i18n';

export const SUPPORTED_THEME_MODES = ['light', 'dark', 'system'] as const;
export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export const SIMULATION_WINDOW_KINDS = [
  'world',
  'control',
  'glasses',
  'device',
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
  'unitree_robot',
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
  maps: MapProviderSettings;
}

export interface MapProviderSettings {
  googleMaps: {
    apiKey?: string;
    apiKeyEnv: string;
  };
  cesiumIon: {
    token?: string;
    tokenEnv: string;
  };
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
  properties?: Record<string, string>;
}

export interface WorldSnapshot {
  id: string;
  name: string;
  description: string;
  seed: string;
  metadata?: Record<string, string>;
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
    name: tx('defaultData.worldName'),
    description: tx('defaultData.worldDescription'),
    seed: 'seed-0001',
    coordinateSystemVisible: true,
    terrain: {
      slopeDeg: 4,
      weather: 'sunny',
      precipitationMmH: 0,
      windMps: 3.2,
      visibilityM: 1600,
      surfaceFrictionScale: 1,
    },
    materials: [
      {
        id: 'mat-asphalt',
        name: tx('defaultData.materialAsphalt'),
        color: '#2b2f33',
        friction: 0.84,
        tags: ['road', 'ground'],
      },
      {
        id: 'mat-concrete',
        name: tx('defaultData.materialConcrete'),
        color: '#d8dadd',
        friction: 0.78,
        tags: ['structure', 'ground'],
      },
      {
        id: 'mat-grass',
        name: tx('defaultData.materialGrass'),
        color: '#4f8a5b',
        friction: 0.64,
        tags: ['terrain', 'ground'],
      },
    ],
    objects: [],
    metadata: {
      data_source: 'OpenStreetMap',
      data_status: 'online_osm_required',
      street_address: tx('defaultData.defaultStreetAddress'),
      center_lat: '',
      center_lon: '',
      radius_m: '',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDefaultDevices(timestamp: string): SimulationDevice[] {
  const sharedPhysicalMaterials = ['asphalt', 'concrete', 'grass', 'packed_soil'];
  return [
    {
      id: 'default-dji-mavic-3e',
      kind: 'drone',
      name: 'DJI Mavic 3E',
      status: 'working',
      capabilityTags: ['aerial_move', 'photo', 'search', 'mapping'],
      physicalProfile: {
        minWorkAltitudeM: 3,
        maxWorkAltitudeM: 60,
        maxSlopeDeg: 90,
        supportedMaterials: ['air'],
        nominalPowerW: 36,
        workingPowerW: 180,
        maxSpeedMps: 12,
        jointCount: 4,
      },
      currentTaskId: 'default-task-uav-scan',
      telemetry: {
        position: [120.5, 80.3, 85.6],
        velocity: [8.2, 0, 4.1],
        headingDeg: 42,
        batteryPercent: 78,
        powerW: 168,
        signalStrength: 96,
        temperatureC: 31,
        speedMps: 11.2,
        jointAnglesDeg: [0, 0, 0, 0],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-autel-evo-max',
      kind: 'drone',
      name: 'Autel EVO Max 4T',
      status: 'idle',
      capabilityTags: ['aerial_move', 'thermal', 'mapping'],
      physicalProfile: {
        minWorkAltitudeM: 3,
        maxWorkAltitudeM: 60,
        maxSlopeDeg: 90,
        supportedMaterials: ['air'],
        nominalPowerW: 38,
        workingPowerW: 190,
        maxSpeedMps: 11,
        jointCount: 4,
      },
      telemetry: {
        position: [98.2, 76.1, 12.5],
        velocity: [0, 0, 0],
        headingDeg: 110,
        batteryPercent: 63,
        powerW: 38,
        signalStrength: 88,
        temperatureC: 32,
        speedMps: 0,
        jointAnglesDeg: [0, 0, 0, 0],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-unitree-go2',
      kind: 'unitree_robot',
      name: 'Unitree Go2',
      status: 'working',
      capabilityTags: ['ground_move', 'inspect', 'rough_terrain'],
      physicalProfile: {
        minWorkAltitudeM: 0,
        maxWorkAltitudeM: 1.4,
        maxSlopeDeg: 28,
        supportedMaterials: sharedPhysicalMaterials,
        nominalPowerW: 30,
        workingPowerW: 180,
        maxSpeedMps: 2.2,
        jointCount: 12,
      },
      currentTaskId: 'default-task-ground-scan',
      telemetry: {
        position: [45.3, 22.8, 0.3],
        velocity: [1.1, 0, 0.4],
        headingDeg: 265,
        batteryPercent: 52,
        powerW: 154,
        signalStrength: 91,
        temperatureC: 34,
        speedMps: 1.6,
        jointAnglesDeg: [4, -8, 9, -7, 3, -6, 8, -5],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-unitree-b2',
      kind: 'unitree_robot',
      name: 'Unitree B2',
      status: 'idle',
      capabilityTags: ['ground_move', 'payload', 'rough_terrain'],
      physicalProfile: {
        minWorkAltitudeM: 0,
        maxWorkAltitudeM: 1.4,
        maxSlopeDeg: 28,
        supportedMaterials: sharedPhysicalMaterials,
        nominalPowerW: 34,
        workingPowerW: 220,
        maxSpeedMps: 2.6,
        jointCount: 12,
      },
      telemetry: {
        position: [15.6, 35.2, 0.3],
        velocity: [0, 0, 0],
        headingDeg: 188,
        batteryPercent: 91,
        powerW: 34,
        signalStrength: 90,
        temperatureC: 30,
        speedMps: 0,
        jointAnglesDeg: [0, 0, 0, 0, 0, 0, 0, 0],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-unitree-g1',
      kind: 'humanoid',
      name: 'Unitree G1',
      status: 'working',
      capabilityTags: ['ground_move', 'inspect', 'delivery'],
      physicalProfile: {
        minWorkAltitudeM: 0,
        maxWorkAltitudeM: 2.4,
        maxSlopeDeg: 18,
        supportedMaterials: sharedPhysicalMaterials,
        nominalPowerW: 42,
        workingPowerW: 260,
        maxSpeedMps: 1.4,
        jointCount: 24,
      },
      currentTaskId: 'default-task-verify',
      telemetry: {
        position: [32.1, 18.7, 0],
        velocity: [0.6, 0, 0.2],
        headingDeg: 28,
        batteryPercent: 68,
        powerW: 232,
        signalStrength: 87,
        temperatureC: 35,
        speedMps: 0.9,
        jointAnglesDeg: [3, -4, 6, -8, 5, -3, 4, -2],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-wheeled-w3',
      kind: 'wheeled_robot',
      name: 'Wheeled Robot W3',
      status: 'idle',
      capabilityTags: ['ground_move', 'inspect', 'transport'],
      physicalProfile: {
        minWorkAltitudeM: 0,
        maxWorkAltitudeM: 1.2,
        maxSlopeDeg: 12,
        supportedMaterials: ['asphalt', 'concrete', 'packed_soil'],
        nominalPowerW: 18,
        workingPowerW: 90,
        maxSpeedMps: 2,
        jointCount: 4,
      },
      telemetry: {
        position: [12.8, 44.3, 0],
        velocity: [0, 0, 0],
        headingDeg: 340,
        batteryPercent: 55,
        powerW: 18,
        signalStrength: 84,
        temperatureC: 29,
        speedMps: 0,
        jointAnglesDeg: [0, 0, 0, 0],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-matrice-30t',
      kind: 'drone',
      name: 'DJI Matrice 30T',
      status: 'idle',
      capabilityTags: ['aerial_move', 'thermal', 'zoom', 'mapping'],
      physicalProfile: {
        minWorkAltitudeM: 3,
        maxWorkAltitudeM: 60,
        maxSlopeDeg: 90,
        supportedMaterials: ['air'],
        nominalPowerW: 44,
        workingPowerW: 220,
        maxSpeedMps: 12,
        jointCount: 4,
      },
      telemetry: {
        position: [86.4, 58.0, 46.2],
        velocity: [0, 0, 0],
        headingDeg: 76,
        batteryPercent: 84,
        powerW: 44,
        signalStrength: 93,
        temperatureC: 31,
        speedMps: 0,
        jointAnglesDeg: [0, 0, 0, 0],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-sensor-hub-a1',
      kind: 'sensor_node',
      name: 'Sensor Hub A1',
      status: 'idle',
      capabilityTags: ['sense', 'thermal', 'report'],
      physicalProfile: {
        minWorkAltitudeM: 0,
        maxWorkAltitudeM: 4,
        maxSlopeDeg: 8,
        supportedMaterials: sharedPhysicalMaterials,
        nominalPowerW: 6,
        workingPowerW: 14,
        maxSpeedMps: 0,
        jointCount: 0,
      },
      telemetry: {
        position: [62.5, 28.5, 0.2],
        velocity: [0, 0, 0],
        headingDeg: 0,
        batteryPercent: 100,
        powerW: 6,
        signalStrength: 97,
        temperatureC: 27,
        speedMps: 0,
        jointAnglesDeg: [],
        jointQuaternion: [0, 0, 0, 1],
        lastSeenAt: timestamp,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
}

function createDefaultGoalsAndTasks(timestamp: string): Pick<SimulationState, 'goals' | 'tasks'> {
  const goalId = 'default-goal-patrol';
  const tasks = [
    {
      id: 'default-task-uav-scan',
      goalId,
      kind: 'inspect',
      title: tx('defaultData.task.uavScanTitle'),
      description: tx('defaultData.task.uavScanDescription'),
      status: 'active',
      assigneeDeviceId: 'default-dji-mavic-3e',
      progress: 0.75,
      notes: 'route_segment=aerial',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-task-ground-scan',
      goalId,
      kind: 'inspect',
      title: tx('defaultData.task.groundScanTitle'),
      description: tx('defaultData.task.groundScanDescription'),
      status: 'active',
      assigneeDeviceId: 'default-unitree-go2',
      progress: 0.48,
      notes: 'route_segment=ground',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'default-task-verify',
      goalId,
      kind: 'observe',
      title: tx('defaultData.task.verifyTitle'),
      description: tx('defaultData.task.verifyDescription'),
      status: 'queued',
      assigneeDeviceId: 'default-unitree-g1',
      progress: 0,
      notes: 'human_accessible=true',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ] satisfies SimulationState['tasks'];

  return {
    goals: [
      {
        id: goalId,
        title: tx('defaultData.goal.title'),
        description: tx('defaultData.goal.description'),
        sourceText: tx('defaultData.goal.sourceText'),
        priority: 'high',
        status: 'active',
        childTaskIds: tasks.map((task) => task.id),
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    tasks,
  };
}

export function createDefaultSimulationState(): SimulationState {
  const timestamp = nowIso();
  const defaultWork = createDefaultGoalsAndTasks(timestamp);

  return {
    version: 1,
    phase: 'running',
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
      tickIntervalMs: 200,
      terminalLogDensity: 'normal',
      maps: {
        googleMaps: {
          apiKeyEnv: 'PUBLIC_GOOGLE_MAPS_API_KEY',
        },
        cesiumIon: {
          tokenEnv: 'PUBLIC_CESIUM_ION_TOKEN',
        },
      },
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
    devices: createDefaultDevices(timestamp),
    goals: defaultWork.goals,
    tasks: defaultWork.tasks,
    logs: [
      {
        id: 'log-bootstrap',
        level: 'info',
        scope: 'bootstrap',
        message: tx('defaultData.log.init'),
        timestamp,
      },
      {
        id: 'log-default-gateway',
        level: 'info',
        scope: 'gateway',
        message: tx('defaultData.log.gatewayLoaded'),
        timestamp,
      },
      {
        id: 'log-default-dji',
        level: 'info',
        scope: 'device',
        message: tx('defaultData.log.mavicArrived'),
        details: 'default-dji-mavic-3e',
        timestamp,
      },
      {
        id: 'log-default-go2',
        level: 'warn',
        scope: 'device',
        message: tx('defaultData.log.go2Battery'),
        details: 'default-unitree-go2',
        timestamp,
      },
    ],
    windows: [
      {
        label: 'world-simulator',
        kind: 'world',
        title: tx('defaultData.worldWindowTitle'),
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

function createEmptyWorldSnapshot(timestamp: string): WorldSnapshot {
  return {
    id: 'world-empty',
    name: '',
    description: '',
    seed: '',
    coordinateSystemVisible: false,
    terrain: {
      slopeDeg: 0,
      weather: 'sunny',
      precipitationMmH: 0,
      windMps: 0,
      visibilityM: 0,
      surfaceFrictionScale: 1,
    },
    materials: [],
    objects: [],
    metadata: {
      data_source: '',
      data_status: '',
      street_address: '',
      center_lat: '',
      center_lon: '',
      radius_m: '',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEmptySimulationState(): SimulationState {
  const base = createDefaultSimulationState();
  return {
    ...base,
    phase: 'booting',
    world: createEmptyWorldSnapshot(base.world.createdAt),
    devices: [],
    goals: [],
    tasks: [],
    logs: [],
    windows: [],
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
