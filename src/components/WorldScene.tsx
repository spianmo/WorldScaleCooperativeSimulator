import { Suspense, type ReactNode } from 'react';
import { Float, Gltf, useGLTF } from '@react-three/drei';
import { useLoader } from '@react-three/fiber';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { Scene } from './Scene';
import { AxesIndicator } from './AxesIndicator';
import type { SimulationDevice, WorldObject } from '../types';
import djiMavicUrl from '../../assets/models/DJI_Mavic.glb';
import unitreeG1Url from '../../assets/models/Unitree_G1_29dof.usdz';
import unitreeGo2Url from '../../assets/models/Unitree_Go2.usdz';

export interface WorldSceneProps {
  children?: ReactNode;
  cameraPosition?: [number, number, number];
  devicePosition?: [number, number, number];
  deviceRotation?: [number, number, number];
  worldAxesSize?: number;
  deviceAxesSize?: number;
  deviceName?: string;
  deviceKind?: SimulationDevice['kind'];
  worldLabel?: string;
  deviceLabel?: string;
  minHeight?: number | string;
  objects?: WorldObject[];
  devices?: SimulationDevice[];
  showAxes?: boolean;
}

export function WorldScene({
  children,
  cameraPosition,
  devicePosition = [2.4, 0.05, 1.2],
  deviceRotation = [0, -0.45, 0],
  worldAxesSize = 2.2,
  deviceAxesSize = 1.4,
  deviceName = 'Device',
  deviceKind = 'humanoid',
  worldLabel = 'World axes',
  deviceLabel,
  minHeight = 420,
  objects = [],
  devices = [],
  showAxes = true,
}: WorldSceneProps) {
  const mapObjectPosition = (object: WorldObject): [number, number, number] => [
    object.position[0] / 6 - 8.5,
    Math.max(-1.05, object.position[1] / 20 - 1.1),
    object.position[2] / 6 - 8.5,
  ];
  const mapObjectScale = (object: WorldObject): [number, number, number] => {
    if (object.kind.includes('road')) {
      return [Math.max(0.2, object.scale[0] / 6), 0.08, Math.max(0.2, object.scale[2] / 6)];
    }
    if (object.kind.includes('building') || object.kind.includes('landmark')) {
      return [Math.max(0.35, object.scale[0] / 8), Math.max(0.3, object.scale[1] / 8), Math.max(0.35, object.scale[2] / 8)];
    }
    return [Math.max(0.25, object.scale[0] / 6), Math.max(0.04, object.scale[1] / 5), Math.max(0.25, object.scale[2] / 6)];
  };

  return (
    <Scene cameraPosition={cameraPosition} minHeight={minHeight}>
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.18, 0]} receiveShadow>
          <planeGeometry args={[42, 42]} />
          <meshStandardMaterial color="#e8eaed" roughness={1} metalness={0} />
        </mesh>

        {showAxes ? <AxesIndicator label={worldLabel} size={worldAxesSize} position={[0, 0, 0]} /> : null}

        {objects.slice(0, 80).map((object) => (
          <mesh
            key={object.id}
            position={mapObjectPosition(object)}
            rotation={[object.rotation[0], object.rotation[1], object.rotation[2]]}
            scale={mapObjectScale(object)}
          >
            {object.kind.includes('building') || object.kind.includes('landmark') ? <boxGeometry args={[1, 1.8, 1]} /> : <boxGeometry args={[1, 0.08, 1]} />}
            <meshStandardMaterial
              color={object.kind.includes('road') ? '#3c4043' : object.kind.includes('landmark') ? '#1a73e8' : object.kind.includes('building') ? '#dadce0' : '#1e8e3e'}
              roughness={0.82}
              metalness={0.05}
            />
          </mesh>
        ))}

        <Float speed={1.5} rotationIntensity={0.08} floatIntensity={0.35}>
          <group position={devicePosition} rotation={deviceRotation}>
            <DeviceBody kind={deviceKind} />
            {showAxes ? <AxesIndicator label={deviceLabel ?? `${deviceName} local axes`} size={deviceAxesSize} position={[0, 0, 0]} /> : null}
          </group>
        </Float>

        {devices.slice(1, 24).map((device) => (
          <group
            key={device.id}
            position={[device.telemetry.position[0] / 10 - 6, Math.max(-0.6, device.telemetry.position[1] / 10 - 0.6), device.telemetry.position[2] / 10 - 6]}
            rotation={[0, (device.telemetry.headingDeg / 180) * Math.PI, 0]}
          >
            <DeviceBody kind={device.kind} compact />
            {showAxes ? <AxesIndicator label={`${device.name} axes`} size={0.8} position={[0, 0, 0]} /> : null}
          </group>
        ))}

        {children}
      </group>
    </Scene>
  );
}

function DeviceBody({ kind, compact = false }: { kind: SimulationDevice['kind']; compact?: boolean }) {
  if (kind === 'drone') {
    return (
      <Suspense fallback={<DeviceProxyBody kind={kind} compact={compact} />}>
        <Gltf
          src={djiMavicUrl}
          scale={compact ? 0.018 : 0.032}
          position={[0, compact ? -0.08 : -0.15, 0]}
          rotation={[0, Math.PI, 0]}
          castShadow
          receiveShadow
        />
      </Suspense>
    );
  }

  if (kind === 'humanoid') {
    return (
      <Suspense fallback={<DeviceProxyBody kind={kind} compact={compact} />}>
        <UsdDeviceModel src={unitreeG1Url} kind={kind} compact={compact} />
      </Suspense>
    );
  }

  if (kind === 'quadruped') {
    return (
      <Suspense fallback={<DeviceProxyBody kind={kind} compact={compact} />}>
        <UsdDeviceModel src={unitreeGo2Url} kind={kind} compact={compact} />
      </Suspense>
    );
  }

  return <DeviceProxyBody kind={kind} compact={compact} />;
}

function UsdDeviceModel({ src, kind, compact }: { src: string; kind: SimulationDevice['kind']; compact: boolean }) {
  const model = useLoader(USDZLoader, src);
  const scale = kind === 'humanoid'
    ? compact ? 0.13 : 0.22
    : compact ? 0.32 : 0.52;
  const position: [number, number, number] = kind === 'humanoid'
    ? [0, compact ? -0.52 : -1.08, 0]
    : [0, compact ? -0.3 : -0.6, 0];

  return (
    <primitive
      object={model.clone()}
      scale={scale}
      position={position}
      rotation={[0, Math.PI, 0]}
    />
  );
}

function DeviceProxyBody({ kind, compact = false }: { kind: SimulationDevice['kind']; compact?: boolean }) {
  const bodyScale = compact ? 0.68 : 1;
  const color = kind === 'drone' ? '#e8f0fe' : kind === 'sensor_node' ? '#f9ab00' : '#1a73e8';

  if (kind === 'drone') {
    return (
      <mesh castShadow scale={[bodyScale, bodyScale, bodyScale]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
      </mesh>
    );
  }

  if (kind === 'sensor_node') {
    return (
      <mesh castShadow scale={[bodyScale, bodyScale, bodyScale]}>
        <cylinderGeometry args={[0.34, 0.42, 0.7, 20]} />
        <meshStandardMaterial color={color} roughness={0.42} metalness={0.28} />
      </mesh>
    );
  }

  if (kind === 'quadruped') {
    return (
      <group scale={[bodyScale, bodyScale, bodyScale]}>
        <mesh castShadow>
          <boxGeometry args={[0.82, 0.28, 1.18]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
        </mesh>
        {[-0.3, 0.3].map((x) =>
          [-0.42, 0.42].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, -0.34, z]} castShadow>
              <boxGeometry args={[0.16, 0.48, 0.16]} />
              <meshStandardMaterial color="#d9ebff" roughness={0.45} metalness={0.12} />
            </mesh>
          )),
        )}
      </group>
    );
  }

  return (
    <group scale={[bodyScale, bodyScale, bodyScale]}>
      <mesh castShadow>
        <boxGeometry args={[1.18, 0.75, 1.62]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.18, 24, 24]} />
        <meshStandardMaterial color="#d9ebff" roughness={0.2} metalness={0.8} />
      </mesh>
    </group>
  );
}

useGLTF.preload(djiMavicUrl);
