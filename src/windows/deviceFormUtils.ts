import type { DeviceKind, DevicePhysicalProfile, SimulationDevice, SimulationState } from '../types';
import { tx } from '../i18n';

export const deviceKinds: DeviceKind[] = ['wheeled_robot', 'humanoid', 'quadruped', 'unitree_robot', 'drone', 'sensor_node'];

export const deviceKindLabels: Record<DeviceKind, string> = {
  wheeled_robot: tx('device.kind.wheeled_robot'),
  humanoid: tx('device.kind.humanoid'),
  quadruped: tx('device.kind.quadruped'),
  unitree_robot: tx('device.kind.unitree_robot'),
  drone: tx('device.kind.drone'),
  sensor_node: tx('device.kind.sensor_node'),
};

export function getDeviceKindLabel(kind: DeviceKind) {
  return tx(`device.kind.${kind}`);
}

export function defaultProfile(kind: DeviceKind, rules: SimulationState['physicalRules']): DevicePhysicalProfile {
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

  if (kind === 'unitree_robot') {
    return {
      minWorkAltitudeM: 0,
      maxWorkAltitudeM: 1.4,
      maxSlopeDeg: rules.quadrupedMaxSlopeDeg,
      supportedMaterials: [...rules.groundAllowedMaterials],
      nominalPowerW: 32,
      workingPowerW: 200,
      maxSpeedMps: 2.4,
      jointCount: 12,
    };
  }

  if (kind === 'sensor_node') {
    return {
      minWorkAltitudeM: 0,
      maxWorkAltitudeM: 4,
      maxSlopeDeg: 8,
      supportedMaterials: [...rules.groundAllowedMaterials],
      nominalPowerW: 6,
      workingPowerW: 14,
      maxSpeedMps: 0,
      jointCount: 0,
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

export function createDevice(kind: DeviceKind, index: number, profile: DevicePhysicalProfile, batteryPercent: number): SimulationDevice {
  const now = new Date().toISOString();
  return {
    id: `${kind}-${Date.now()}`,
    kind,
    name: `${getDeviceKindLabel(kind)}-${index}`,
    status: 'idle',
    capabilityTags: kind === 'drone'
      ? ['aerial_move', 'photo', 'search']
      : kind === 'quadruped'
        ? ['ground_move', 'inspect', 'rough_terrain']
        : kind === 'unitree_robot'
          ? ['ground_move', 'inspect', 'rough_terrain', 'payload']
          : kind === 'sensor_node'
            ? ['sense', 'report']
            : ['ground_move', 'inspect', 'transport'],
    physicalProfile: profile,
    telemetry: {
      position: [Math.random() * 20, kind === 'drone' ? 20 : 0, Math.random() * 20],
      velocity: [0, 0, 0],
      headingDeg: 0,
      batteryPercent,
      powerW: profile.nominalPowerW,
      signalStrength: 95,
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
