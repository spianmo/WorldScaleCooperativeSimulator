import {
  type DeviceKind,
  type GoalPriority,
  type LogLevel,
  type SimulationDevice,
  type SimulationGoal,
  type SimulationLogEntry,
  type SimulationState,
  type SimulationSettings,
  type SimulationTask,
  type ThemeMode,
  type WorldSnapshotRecord,
  type WorldMaterial,
  type WorldObject,
  type WorldSnapshot,
} from '../types';

import { invokeApp, isTauri } from './invoke';

export const SIMULATION_COMMANDS = {
  loadState: 'load_state',
  saveState: 'save_state',
  generateWorld: 'generate_world',
  registerDevice: 'register_device',
  removeDevice: 'remove_device',
  submitGoal: 'submit_goal',
  tickSimulation: 'tick_simulation',
  updateSettings: 'update_settings',
  saveWorldSnapshot: 'save_world_snapshot',
  listWorldSnapshots: 'list_world_snapshots',
  openWorldSnapshot: 'open_world_snapshot',
} as const;

export interface GenerateWorldInput {
  input: {
    name?: string;
    seed?: number;
    size?: RustVector3;
    object_density?: number;
    street_address?: string;
    district?: string;
    center_lat?: number;
    center_lon?: number;
    radius_m?: number;
    data_source?: string;
    preview_quality?: 'low' | 'medium' | 'high';
  };
}

export interface RegisterDeviceInput {
  input: {
    name: string;
    kind?: ExtendedRustDeviceKind;
    battery?: number;
    position?: RustVector3;
    capabilities?: string[];
    battery_capacity?: number;
    physical_profile?: RustDevicePhysicalProfile;
  };
}

export interface RemoveDeviceInput {
  deviceId: string;
}

export interface SubmitGoalInput {
  input: {
    title: string;
    description?: string;
    requested_by?: string;
    priority?: number;
    keywords?: string[];
  };
}

export interface TickSimulationInput {
  input: {
    steps?: number;
  };
}

interface RustVector3 {
  x: number;
  y: number;
  z: number;
}

type RustDeviceKind = 'rover' | 'drone' | 'humanoid' | 'sensor_hub' | 'charging_base';
type ExtendedRustDeviceKind = RustDeviceKind | 'quadruped' | 'unitree_robot';
type RustDeviceStatus = 'idle' | 'moving' | 'working' | 'charging' | 'offline';
type RustTaskStatus = 'pending' | 'assigned' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

interface RustWorldObject {
  id: string;
  name: string;
  kind: string;
  position: RustVector3;
  size: RustVector3;
  tags: string[];
  walkable: boolean;
  interactive: boolean;
  properties: Record<string, string>;
}

interface RustDevice {
  id: string;
  name: string;
  kind: ExtendedRustDeviceKind;
  status: RustDeviceStatus;
  battery: number;
  battery_capacity: number;
  position: RustVector3;
  orientation_deg: number;
  physical_profile?: RustDevicePhysicalProfile;
  capabilities: string[];
  assigned_task_ids: string[];
  current_task_id?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  last_tick_at?: string | null;
}

interface RustDevicePhysicalProfile {
  min_work_altitude_m: number;
  max_work_altitude_m: number;
  max_slope_deg: number;
  supported_materials: string[];
  nominal_power_w: number;
  working_power_w: number;
  max_speed_mps: number;
  joint_count: number;
}

interface UpdateSettingsPatch {
  language?: SimulationSettings['locale'];
  theme?: SimulationSettings['theme']['mode'];
  auto_save?: boolean;
  auto_save_every_tick?: boolean;
  default_tick_seconds?: number;
  log_level?: SimulationSettings['logLevel'];
  terminal_log_density?: SimulationSettings['terminalLogDensity'];
}

interface RustTask {
  id: string;
  goal_id: string;
  title: string;
  description: string;
  keywords: string[];
  status: RustTaskStatus;
  priority: number;
  estimated_ticks: number;
  progress: number;
  assignee_device_id?: string | null;
  related_object_ids: string[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

interface RustGoal {
  id: string;
  title: string;
  description: string;
  requested_by: string;
  keywords: string[];
  status: 'draft' | 'active' | 'blocked' | 'completed' | 'cancelled';
  priority: number;
  task_ids: string[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

interface RustLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  scope: string;
  message: string;
  entity_id?: string | null;
  context: Record<string, string>;
}

interface RustSimulationState {
  settings: {
    language: string;
    theme: string;
    auto_save: boolean;
    default_tick_seconds: number;
    log_level: LogLevel;
    terminal_log_density?: SimulationSettings['terminalLogDensity'];
    maps?: {
      google_maps?: {
        api_key?: string | null;
        api_key_env?: string;
      };
      cesium_ion?: {
        token?: string | null;
        token_env?: string;
      };
    };
  };
  world: {
    id: string;
    name: string;
    seed: number;
    size: RustVector3;
    climate: string;
    terrain: string;
    objects: RustWorldObject[];
    devices: RustDevice[];
    tasks: RustTask[];
    goals: RustGoal[];
    logs: RustLogEntry[];
    rules?: {
      physical?: {
        drone_min_altitude_m: number;
        drone_max_altitude_m: number;
        rover_max_slope_deg: number;
        humanoid_max_slope_deg: number;
        quadruped_max_slope_deg: number;
        ground_allowed_materials: string[];
      };
    };
    tick_index: number;
    created_at: string;
    updated_at: string;
  };
}

interface RustWorldSnapshotRecord {
  snapshot_name: string;
  path: string;
  modified_at: string;
}

const rustToDeviceKind: Record<ExtendedRustDeviceKind, DeviceKind> = {
  rover: 'wheeled_robot',
  drone: 'drone',
  humanoid: 'humanoid',
  quadruped: 'quadruped',
  unitree_robot: 'unitree_robot',
  sensor_hub: 'sensor_node',
  charging_base: 'sensor_node',
};

const deviceKindToRust: Record<DeviceKind, ExtendedRustDeviceKind> = {
  wheeled_robot: 'rover',
  drone: 'drone',
  humanoid: 'humanoid',
  quadruped: 'quadruped',
  unitree_robot: 'unitree_robot',
  sensor_node: 'sensor_hub',
};

function vectorToTuple(vector: RustVector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function tupleToVector(tuple: readonly [number, number, number]): RustVector3 {
  return {
    x: tuple[0],
    y: tuple[1],
    z: tuple[2],
  };
}

function statusToUi(status: RustDeviceStatus): SimulationDevice['status'] {
  if (status === 'offline') {
    return 'offline';
  }
  if (status === 'idle' || status === 'charging') {
    return 'idle';
  }
  return 'working';
}

function taskStatusToUi(status: RustTaskStatus): SimulationTask['status'] {
  if (status === 'done') {
    return 'completed';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'cancelled') {
    return 'canceled';
  }
  if (status === 'pending') {
    return 'queued';
  }
  return 'active';
}

function priorityToUi(priority: number): SimulationGoal['priority'] {
  if (priority >= 9) {
    return 'urgent';
  }
  if (priority >= 7) {
    return 'high';
  }
  if (priority <= 3) {
    return 'low';
  }
  return 'normal';
}

function mapWorldObject(object: RustWorldObject): WorldObject {
  return {
    id: object.id,
    kind: object.kind,
    name: object.name,
    description: object.properties.description ?? object.tags.join(', '),
    position: vectorToTuple(object.position),
    rotation: [
      0,
      object.properties.orientation_rad !== undefined
        ? Number(object.properties.orientation_rad)
        : object.properties.orientation === 'north_south' ? Math.PI / 2 : 0,
      0,
    ],
    scale: vectorToTuple(object.size),
    materialId: object.properties.material === 'asphalt' || object.kind.includes('road')
      ? 'mat-asphalt'
      : object.properties.material === 'grass' || object.kind.includes('terrain')
        ? 'mat-grass'
        : 'mat-concrete',
    tags: object.tags,
    properties: object.properties,
  };
}

function defaultMaterials(): WorldMaterial[] {
  return [
    { id: 'mat-asphalt', name: '沥青道路', color: '#2b2f33', friction: 0.84, tags: ['road'] },
    { id: 'mat-concrete', name: '混凝土建筑', color: '#d8dadd', friction: 0.78, tags: ['building'] },
    { id: 'mat-grass', name: '草地地表', color: '#5f7d4f', friction: 0.62, tags: ['terrain'] },
  ];
}

function mapWeather(climate: string): WorldSnapshot['terrain']['weather'] {
  if (climate === 'rainy') {
    return 'rainy';
  }
  if (climate === 'foggy') {
    return 'foggy';
  }
  if (climate === 'cloudy') {
    return 'cloudy';
  }
  if (climate === 'windy') {
    return 'windy';
  }
  if (climate === 'stormy') {
    return 'stormy';
  }
  return 'sunny';
}

function weatherPhysics(climate: string) {
  const weather = mapWeather(climate);
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

function defaultPhysicalProfile(kind: DeviceKind) {
  if (kind === 'drone') {
    return {
      minWorkAltitudeM: 3,
      maxWorkAltitudeM: 60,
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
      maxSlopeDeg: 18,
      supportedMaterials: ['asphalt', 'concrete', 'grass', 'packed_soil'],
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
      maxSlopeDeg: 28,
      supportedMaterials: ['asphalt', 'concrete', 'grass', 'packed_soil'],
      nominalPowerW: 30,
      workingPowerW: 180,
      maxSpeedMps: 2.2,
      jointCount: 12,
    };
  }

  return {
    minWorkAltitudeM: 0,
    maxWorkAltitudeM: 2,
    maxSlopeDeg: 12,
    supportedMaterials: ['asphalt', 'concrete', 'grass'],
    nominalPowerW: 18,
    workingPowerW: 90,
    maxSpeedMps: 2,
    jointCount: 4,
  };
}

function mapPhysicalProfile(kind: DeviceKind, profile?: RustDevicePhysicalProfile) {
  if (!profile) {
    return defaultPhysicalProfile(kind);
  }

  return {
    minWorkAltitudeM: profile.min_work_altitude_m,
    maxWorkAltitudeM: profile.max_work_altitude_m,
    maxSlopeDeg: profile.max_slope_deg,
    supportedMaterials: profile.supported_materials,
    nominalPowerW: profile.nominal_power_w,
    workingPowerW: profile.working_power_w,
    maxSpeedMps: profile.max_speed_mps,
    jointCount: profile.joint_count,
  };
}

export function fromRustSimulationState(rustState: RustSimulationState): SimulationState {
  const themeMode: ThemeMode = rustState.settings.theme === 'dark'
    ? 'dark'
    : rustState.settings.theme === 'light'
      ? 'light'
      : 'system';

  const world: WorldSnapshot = {
    id: rustState.world.id,
    name: rustState.world.name,
    description: rustState.world.objects
      .find((object) => object.properties.description)
      ?.properties.description ?? `${rustState.world.terrain} / ${rustState.world.climate}`,
    seed: String(rustState.world.seed),
    metadata: collectWorldMetadata(rustState.world.objects),
    coordinateSystemVisible: true,
    terrain: {
      slopeDeg: rustState.world.terrain === 'mountain' ? 28 : rustState.world.terrain === 'mixed' ? 12 : 4,
      weather: mapWeather(rustState.world.climate),
      ...weatherPhysics(rustState.world.climate),
    },
    materials: defaultMaterials(),
    objects: rustState.world.objects.map(mapWorldObject),
    createdAt: rustState.world.created_at,
    updatedAt: rustState.world.updated_at,
  };

  const devices: SimulationDevice[] = rustState.world.devices.map((device) => {
    const kind = rustToDeviceKind[device.kind];
    const profile = mapPhysicalProfile(kind, device.physical_profile);
    const batteryPercent = Math.round((device.battery / Math.max(device.battery_capacity, 1)) * 100);
    return {
      id: device.id,
      kind,
      name: device.name,
      status: statusToUi(device.status),
      capabilityTags: device.capabilities,
      physicalProfile: profile,
      currentTaskId: device.current_task_id ?? undefined,
      telemetry: {
        position: vectorToTuple(device.position),
        velocity: device.status === 'moving' || device.status === 'working'
          ? [
              Number((Math.cos((device.orientation_deg / 180) * Math.PI) * profile.maxSpeedMps * (world.terrain.surfaceFrictionScale ?? 1)).toFixed(2)),
              0,
              Number((Math.sin((device.orientation_deg / 180) * Math.PI) * profile.maxSpeedMps * (world.terrain.surfaceFrictionScale ?? 1)).toFixed(2)),
            ]
          : [0, 0, 0],
        headingDeg: device.orientation_deg,
        batteryPercent,
        powerW: device.status === 'working' ? profile.workingPowerW : profile.nominalPowerW,
        signalStrength: device.active ? 92 : 0,
        temperatureC: device.status === 'working' ? 42 : 31,
        speedMps: device.status === 'working' || device.status === 'moving' ? profile.maxSpeedMps : 0,
        jointAnglesDeg: Array.from({ length: Math.min(profile.jointCount, 8) }, (_, index) => Math.round((device.orientation_deg + index * 17) % 90)),
        jointQuaternion: [0, Math.sin((device.orientation_deg / 180) * Math.PI / 2), 0, Math.cos((device.orientation_deg / 180) * Math.PI / 2)],
        lastSeenAt: device.last_tick_at ?? device.updated_at,
      },
      createdAt: device.created_at,
      updatedAt: device.updated_at,
    };
  });

  const tasks: SimulationTask[] = rustState.world.tasks.map((task) => ({
    id: task.id,
    goalId: task.goal_id,
    kind: task.keywords.includes('photo') || task.keywords.includes('拍照') ? 'photo' : task.keywords.includes('search') || task.keywords.includes('搜索') ? 'search' : task.keywords.includes('inspect') || task.keywords.includes('巡检') ? 'inspect' : 'custom',
    title: task.title,
    description: task.description,
    status: taskStatusToUi(task.status),
    assigneeDeviceId: task.assignee_device_id ?? undefined,
    progress: task.progress,
    notes: task.keywords.join(', '),
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  }));

  const goals: SimulationGoal[] = rustState.world.goals.map((goal) => ({
    id: goal.id,
    title: goal.title,
    description: goal.description,
    sourceText: goal.description || goal.title,
    priority: priorityToUi(goal.priority),
    status: goal.status === 'completed' ? 'completed' : goal.status === 'blocked' ? 'suspended' : goal.status === 'cancelled' ? 'failed' : 'active',
    childTaskIds: goal.task_ids,
    createdAt: goal.created_at,
    updatedAt: goal.updated_at,
  }));

  const logs: SimulationLogEntry[] = rustState.world.logs.map((log) => ({
    id: log.id,
    level: log.level,
    scope: log.scope,
    message: log.message,
    details: log.entity_id ?? undefined,
    timestamp: log.timestamp,
  }));

  return {
    version: 1,
    phase: tasks.some((task) => task.status === 'active') ? 'running' : 'idle',
    clock: {
      step: rustState.world.tick_index,
      simulationTimeMs: rustState.world.tick_index * rustState.settings.default_tick_seconds * 1000,
      wallClockAt: rustState.world.updated_at,
    },
    settings: {
      theme: {
        mode: themeMode,
        resolvedMode: themeMode === 'dark' ? 'dark' : 'light',
      },
      locale: rustState.settings.language === 'en-US' ? 'en-US' : 'zh-CN',
      logLevel: rustState.settings.log_level,
      autosaveEnabled: rustState.settings.auto_save,
      tickIntervalMs: rustState.settings.default_tick_seconds * 1000,
      terminalLogDensity: rustState.settings.terminal_log_density ?? 'normal',
      maps: {
        googleMaps: {
          apiKey: rustState.settings.maps?.google_maps?.api_key ?? undefined,
          apiKeyEnv: rustState.settings.maps?.google_maps?.api_key_env ?? 'PUBLIC_GOOGLE_MAPS_API_KEY',
        },
        cesiumIon: {
          token: rustState.settings.maps?.cesium_ion?.token ?? undefined,
          tokenEnv: rustState.settings.maps?.cesium_ion?.token_env ?? 'PUBLIC_CESIUM_ION_TOKEN',
        },
      },
    },
    world,
    physicalRules: {
      droneMinAltitudeM: rustState.world.rules?.physical?.drone_min_altitude_m ?? 3,
      droneMaxAltitudeM: rustState.world.rules?.physical?.drone_max_altitude_m ?? 60,
      roverMaxSlopeDeg: rustState.world.rules?.physical?.rover_max_slope_deg ?? 12,
      humanoidMaxSlopeDeg: rustState.world.rules?.physical?.humanoid_max_slope_deg ?? 18,
      quadrupedMaxSlopeDeg: rustState.world.rules?.physical?.quadruped_max_slope_deg ?? 28,
      groundAllowedMaterials: rustState.world.rules?.physical?.ground_allowed_materials ?? ['asphalt', 'concrete', 'grass', 'packed_soil'],
    },
    devices,
    goals,
    tasks,
    logs,
    windows: [],
  };
}

function collectWorldMetadata(objects: RustWorldObject[]): Record<string, string> {
  const metadata = objects.find((object) => object.properties.world_metadata === 'true')?.properties ?? {};
  const osmBuildings = objects.filter((object) => object.properties.source === 'openstreetmap' && object.kind.includes('building')).length;
  const osmRoads = objects.filter((object) => object.properties.source === 'openstreetmap' && object.kind.includes('road')).length;

  return {
    ...metadata,
    building_count: metadata.building_count ?? String(osmBuildings),
    road_count: metadata.road_count ?? String(osmRoads),
  };
}

export async function loadSimulationState() {
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.loadState);
  return 'world' in state && 'settings' in state && 'devices' in state
    ? (state as SimulationState)
    : fromRustSimulationState(state as RustSimulationState);
}

export async function saveSimulationState(state: SimulationState) {
  if (isTauri()) {
    return state;
  }
  return invokeApp<SimulationState>(SIMULATION_COMMANDS.saveState, { state });
}

export async function generateWorld(input: GenerateWorldInput['input']) {
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.generateWorld, { input } satisfies GenerateWorldInput);
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export async function registerDevice(device: SimulationDevice) {
  const input: RegisterDeviceInput['input'] = {
    name: device.name,
    kind: deviceKindToRust[device.kind],
    battery: device.telemetry.batteryPercent,
    battery_capacity: 100,
    position: tupleToVector(device.telemetry.position),
    physical_profile: {
      min_work_altitude_m: device.physicalProfile.minWorkAltitudeM,
      max_work_altitude_m: device.physicalProfile.maxWorkAltitudeM,
      max_slope_deg: device.physicalProfile.maxSlopeDeg,
      supported_materials: [...device.physicalProfile.supportedMaterials],
      nominal_power_w: device.physicalProfile.nominalPowerW,
      working_power_w: device.physicalProfile.workingPowerW,
      max_speed_mps: device.physicalProfile.maxSpeedMps,
      joint_count: device.physicalProfile.jointCount,
    },
    capabilities: device.capabilityTags,
  };
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.registerDevice, { input } satisfies RegisterDeviceInput);
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export async function removeDevice(deviceId: string) {
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.removeDevice, { deviceId } satisfies RemoveDeviceInput);
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export async function submitGoal(goal: SimulationGoal) {
  const priority = goal.priority === 'urgent' ? 10 : goal.priority === 'high' ? 8 : goal.priority === 'low' ? 3 : 5;
  const input: SubmitGoalInput['input'] = {
    title: goal.title,
    description: goal.description || goal.sourceText,
    requested_by: 'glasses',
    priority,
  };
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.submitGoal, { input } satisfies SubmitGoalInput);
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export async function tickSimulation(steps = 1) {
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.tickSimulation, { input: { steps } } satisfies TickSimulationInput);
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export async function updatePhysicalRules(rules: Partial<SimulationState['physicalRules']>) {
  const patch = {
    drone_min_altitude_m: rules.droneMinAltitudeM,
    drone_max_altitude_m: rules.droneMaxAltitudeM,
    rover_max_slope_deg: rules.roverMaxSlopeDeg,
    humanoid_max_slope_deg: rules.humanoidMaxSlopeDeg,
    quadruped_max_slope_deg: rules.quadrupedMaxSlopeDeg,
    ground_allowed_materials: rules.groundAllowedMaterials,
  };
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.updateSettings, { patch });
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export async function updateAppSettings(settings: Partial<SimulationSettings>) {
  const patch: UpdateSettingsPatch = {
    language: settings.locale,
    theme: settings.theme?.mode,
    auto_save: settings.autosaveEnabled,
    auto_save_every_tick: settings.autosaveEnabled,
    default_tick_seconds: settings.tickIntervalMs === undefined ? undefined : settings.tickIntervalMs / 1000,
    log_level: settings.logLevel,
    terminal_log_density: settings.terminalLogDensity,
  };
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.updateSettings, { patch });
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export async function saveWorldSnapshot(snapshotName?: string) {
  return invokeApp<{ path: string }>(SIMULATION_COMMANDS.saveWorldSnapshot, { input: { snapshot_name: snapshotName } });
}

export async function listWorldSnapshots(): Promise<WorldSnapshotRecord[]> {
  const records = await invokeApp<WorldSnapshotRecord[] | RustWorldSnapshotRecord[]>(SIMULATION_COMMANDS.listWorldSnapshots);
  return records.map((record) => 'snapshot_name' in record
    ? { snapshotName: record.snapshot_name, path: record.path, modifiedAt: record.modified_at }
    : record);
}

export async function openWorldSnapshot(snapshotName: string) {
  const state = await invokeApp<SimulationState | RustSimulationState>(SIMULATION_COMMANDS.openWorldSnapshot, { input: { snapshot_name: snapshotName } });
  return 'devices' in state ? (state as SimulationState) : fromRustSimulationState(state as RustSimulationState);
}

export type { DeviceKind, GoalPriority, ThemeMode };
