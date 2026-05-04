import { Suspense, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame, useLoader } from '@react-three/fiber';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
} from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { clone as cloneThreeObject } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Scene } from './Scene';
import { AxesIndicator } from './AxesIndicator';
import type { SimulationDevice, WorldObject, WorldSnapshot } from '../types';
import djiMavicUrl from '../../assets/models/DJI_Mavic.glb';
import g1HeadUrl from '../../assets/models/unitree_g1/head_link.STL';
import g1TorsoUrl from '../../assets/models/unitree_g1/torso_link.STL';
import g1PelvisUrl from '../../assets/models/unitree_g1/pelvis.STL';
import g1WaistYawUrl from '../../assets/models/unitree_g1/waist_yaw_link.STL';
import g1LogoUrl from '../../assets/models/unitree_g1/logo_link.STL';
import g1LeftHipPitchUrl from '../../assets/models/unitree_g1/left_hip_pitch_link.STL';
import g1LeftHipRollUrl from '../../assets/models/unitree_g1/left_hip_roll_link.STL';
import g1LeftHipYawUrl from '../../assets/models/unitree_g1/left_hip_yaw_link.STL';
import g1LeftKneeUrl from '../../assets/models/unitree_g1/left_knee_link.STL';
import g1LeftAnklePitchUrl from '../../assets/models/unitree_g1/left_ankle_pitch_link.STL';
import g1LeftAnkleRollUrl from '../../assets/models/unitree_g1/left_ankle_roll_link.STL';
import g1RightHipPitchUrl from '../../assets/models/unitree_g1/right_hip_pitch_link.STL';
import g1RightHipRollUrl from '../../assets/models/unitree_g1/right_hip_roll_link.STL';
import g1RightHipYawUrl from '../../assets/models/unitree_g1/right_hip_yaw_link.STL';
import g1RightKneeUrl from '../../assets/models/unitree_g1/right_knee_link.STL';
import g1RightAnklePitchUrl from '../../assets/models/unitree_g1/right_ankle_pitch_link.STL';
import g1RightAnkleRollUrl from '../../assets/models/unitree_g1/right_ankle_roll_link.STL';
import g1LeftShoulderPitchUrl from '../../assets/models/unitree_g1/left_shoulder_pitch_link.STL';
import g1LeftShoulderRollUrl from '../../assets/models/unitree_g1/left_shoulder_roll_link.STL';
import g1LeftShoulderYawUrl from '../../assets/models/unitree_g1/left_shoulder_yaw_link.STL';
import g1LeftElbowUrl from '../../assets/models/unitree_g1/left_elbow_link.STL';
import g1RightShoulderPitchUrl from '../../assets/models/unitree_g1/right_shoulder_pitch_link.STL';
import g1RightShoulderRollUrl from '../../assets/models/unitree_g1/right_shoulder_roll_link.STL';
import g1RightShoulderYawUrl from '../../assets/models/unitree_g1/right_shoulder_yaw_link.STL';
import g1RightElbowUrl from '../../assets/models/unitree_g1/right_elbow_link.STL';
import go2BaseUrl from '../../assets/models/unitree_go2/base.dae';
import go2HipUrl from '../../assets/models/unitree_go2/hip.dae';
import go2ThighUrl from '../../assets/models/unitree_go2/thigh.dae';
import go2ThighMirrorUrl from '../../assets/models/unitree_go2/thigh_mirror.dae';
import go2CalfUrl from '../../assets/models/unitree_go2/calf.dae';
import go2CalfMirrorUrl from '../../assets/models/unitree_go2/calf_mirror.dae';
import go2FootUrl from '../../assets/models/unitree_go2/foot.dae';
import asphaltTextureUrl from '../../assets/textures/asphalt_01_diff_1k.jpg';
import concreteTextureUrl from '../../assets/textures/concrete_polyhaven_1k.jpg';
import grassTextureUrl from '../../assets/textures/grass_rock_polyhaven_1k.jpg';
import facadeTextureUrl from '../../assets/textures/facade001_glass_color_1k.jpg';

export interface WorldSceneProps {
  children?: ReactNode;
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
  cameraMode?: 'orbit' | 'first_person';
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
  weather?: WorldSnapshot['terrain'];
  showAxes?: boolean;
  hidePrimaryDevice?: boolean;
  tickIntervalMs?: number;
}

function configureTexture(texture: Texture, repeat: [number, number]) {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 4;
  return texture;
}

type DeviceSkinKind = 'g1' | 'go2' | 'drone';

function createDeviceSkinTexture(kind: DeviceSkinKind) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');

  if (context) {
    context.fillStyle = kind === 'drone' ? '#cad4e3' : kind === 'g1' ? '#e5e7ea' : '#d8dde6';
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = '#111827';
    context.fillRect(0, 0, 256, 34);
    context.fillRect(0, 222, 256, 34);
    context.fillStyle = kind === 'g1' ? '#1a73e8' : kind === 'go2' ? '#f9ab00' : '#34a853';
    context.fillRect(18, 92, 220, 14);
    context.fillRect(18, 124, 220, 10);
    context.fillRect(32, 184, 72, 16);
    context.fillRect(152, 184, 72, 16);
    context.fillStyle = '#ffffff';
    context.font = kind === 'drone' ? '700 26px Arial' : '700 30px Arial';
    context.fillText(kind === 'g1' ? 'UNITREE G1' : kind === 'go2' ? 'UNITREE GO2' : 'AERIAL NODE', 22, 70);
    context.fillStyle = '#5f6368';
    for (let index = 0; index < 9; index += 1) {
      context.fillRect(20 + index * 26, 162, 12, 12);
    }
    context.strokeStyle = 'rgba(17,24,39,0.32)';
    context.lineWidth = 3;
    for (let index = 0; index < 6; index += 1) {
      context.beginPath();
      context.moveTo(index * 48 - 24, 256);
      context.lineTo(index * 48 + 72, 0);
      context.stroke();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.magFilter = NearestFilter;
  return texture;
}

const deviceTextureCache = new Map<DeviceSkinKind, Texture>();

function getDeviceSkinTexture(kind: DeviceSkinKind) {
  const cached = deviceTextureCache.get(kind);
  if (cached) {
    return cached;
  }

  const texture = configureTexture(createDeviceSkinTexture(kind), [1, 1]);
  deviceTextureCache.set(kind, texture);
  return texture;
}

function createModernWindowGridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');

  if (context) {
    context.fillStyle = 'rgba(9, 18, 30, 0.18)';
    context.fillRect(0, 0, 512, 512);
    for (let y = 20; y < 512; y += 58) {
      for (let x = 18; x < 512; x += 72) {
        const light = (x / 72 + y / 58) % 4 === 0;
        context.fillStyle = light ? 'rgba(174, 214, 255, 0.72)' : 'rgba(24, 42, 64, 0.58)';
        context.fillRect(x, y, 42, 28);
        context.fillStyle = 'rgba(255,255,255,0.18)';
        context.fillRect(x + 5, y + 4, 12, 20);
      }
    }
    context.strokeStyle = 'rgba(226, 232, 240, 0.22)';
    context.lineWidth = 2;
    for (let x = 0; x < 512; x += 72) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 512);
      context.stroke();
    }
    for (let y = 0; y < 512; y += 58) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(512, y);
      context.stroke();
    }
  }

  return configureTexture(new CanvasTexture(canvas), [1.2, 5]);
}

function useMaterialLibrary() {
  const [asphalt, concrete, grass, facade] = useLoader(TextureLoader, [
    asphaltTextureUrl,
    concreteTextureUrl,
    grassTextureUrl,
    facadeTextureUrl,
  ]);

  return useMemo(() => ({
    asphalt: configureTexture(asphalt, [6, 1]),
    concrete: configureTexture(concrete, [2, 4]),
    grass: configureTexture(grass, [8, 8]),
    facade: configureTexture(facade, [1.1, 4.5]),
    facadeWindows: createModernWindowGridTexture(),
  }), [asphalt, concrete, facade, grass]);
}

function configureModelMaterials(root: Object3D, kind: DeviceSkinKind) {
  const stripeTexture = getDeviceSkinTexture(kind);
  root.traverse((child) => {
    if (!('material' in child)) {
      return;
    }

    const mesh = child as { material?: MeshStandardMaterial | MeshStandardMaterial[] };
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((material) => {
      material.roughness = Math.min(material.roughness || 0.58, 0.62);
      material.metalness = Math.max(material.metalness || 0.06, 0.08);
      if (!material.map) {
        material.map = stripeTexture;
        material.color.set(kind === 'drone' ? '#d7e0ee' : kind === 'go2' ? '#e4e9f1' : '#eef1f4');
      }
      material.needsUpdate = true;
    });
  });
}

type ProjectionAxis = 'x' | 'y' | 'z';

function readAxis(position: BufferAttribute, axis: ProjectionAxis, index: number) {
  if (axis === 'x') {
    return position.getX(index);
  }
  if (axis === 'y') {
    return position.getY(index);
  }
  return position.getZ(index);
}

function createProjectedUvGeometry(geometry: BufferGeometry, uAxis: ProjectionAxis, vAxis: ProjectionAxis) {
  const cloned = geometry.clone();
  const position = cloned.getAttribute('position') as BufferAttribute | undefined;
  if (!position) {
    return cloned;
  }

  cloned.computeBoundingBox();
  const box = cloned.boundingBox;
  if (!box) {
    return cloned;
  }

  const minU = box.min[uAxis];
  const minV = box.min[vAxis];
  const sizeU = Math.max(1, box.max[uAxis] - minU);
  const sizeV = Math.max(1, box.max[vAxis] - minV);
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = (readAxis(position, uAxis, index) - minU) / sizeU;
    uv[index * 2 + 1] = (readAxis(position, vAxis, index) - minV) / sizeV;
  }
  cloned.setAttribute('uv', new BufferAttribute(uv, 2));
  return cloned;
}

export function mapDeviceTelemetryPosition(position: SimulationDevice['telemetry']['position']): [number, number, number] {
  return [
    position[0] / 10 - 6,
    Math.max(-0.6, position[1] / 10 - 0.6),
    position[2] / 10 - 6,
  ];
}

export function WorldScene({
  children,
  cameraPosition,
  cameraTarget,
  cameraMode = 'orbit',
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
  weather = { slopeDeg: 0, weather: 'sunny' },
  showAxes = true,
  hidePrimaryDevice = false,
  tickIntervalMs = 1000,
}: WorldSceneProps) {
  const materials = useMaterialLibrary();
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
    <Scene
      cameraPosition={cameraPosition}
      cameraTarget={cameraTarget}
      cameraMode={cameraMode}
      background={weather.weather === 'foggy' ? '#d8dde3' : weather.weather === 'stormy' ? '#5d6673' : undefined}
      minHeight={minHeight}
    >
      <group>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.18, 0]} receiveShadow>
          <planeGeometry args={[42, 42]} />
          <meshStandardMaterial map={materials.grass} roughness={1} metalness={0} />
        </mesh>

        {showAxes ? <AxesIndicator label={worldLabel} size={worldAxesSize} position={[0, 0, 0]} /> : null}

        {objects.slice(0, 120).map((object) => (
          <CityObject
            key={object.id}
            object={object}
            position={mapObjectPosition(object)}
            scale={mapObjectScale(object)}
            materials={materials}
          />
        ))}

        {!hidePrimaryDevice ? (
          <group position={devicePosition} rotation={deviceRotation}>
            <DeviceBody kind={deviceKind} speedMps={0} />
            {showAxes ? <AxesIndicator label={deviceLabel ?? `${deviceName} local axes`} size={deviceAxesSize} position={[0, 0, 0]} /> : null}
          </group>
        ) : null}

        {devices.slice(0, 24).map((device) => (
          <AnimatedDeviceGroup
            key={device.id}
            position={mapDeviceTelemetryPosition(device.telemetry.position)}
            rotation={[0, (device.telemetry.headingDeg / 180) * Math.PI, 0]}
            tickIntervalMs={tickIntervalMs}
          >
            <DeviceBody kind={device.kind} compact speedMps={device.telemetry.speedMps} />
            {showAxes ? <AxesIndicator label={`${device.name} axes`} size={0.8} position={[0, 0, 0]} /> : null}
          </AnimatedDeviceGroup>
        ))}

        <WeatherLayer weather={weather} />
        {children}
      </group>
    </Scene>
  );
}

function AnimatedDeviceGroup({
  children,
  position,
  rotation,
  tickIntervalMs,
}: {
  children: ReactNode;
  position: [number, number, number];
  rotation: [number, number, number];
  tickIntervalMs: number;
}) {
  const groupRef = useRef<Group>(null);
  const mountedRef = useRef(false);
  const targetPosition = useMemo(() => new Vector3(position[0], position[1], position[2]), [position]);

  useLayoutEffect(() => {
    if (!groupRef.current || mountedRef.current) {
      return;
    }

    mountedRef.current = true;
    groupRef.current.position.set(position[0], position[1], position[2]);
    groupRef.current.rotation.set(rotation[0], rotation[1], rotation[2]);
  }, [position, rotation]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    // tick 是离散状态，渲染层用插值追目标位置，避免机器人和无人机跳帧瞬移。
    const smoothing = 1 - Math.exp(-delta / Math.max(0.08, tickIntervalMs / 1000 / 3));
    group.position.lerp(targetPosition, smoothing);
    group.rotation.x += (rotation[0] - group.rotation.x) * smoothing;
    group.rotation.y += (rotation[1] - group.rotation.y) * smoothing;
    group.rotation.z += (rotation[2] - group.rotation.z) * smoothing;
  });

  return <group ref={groupRef}>{children}</group>;
}

interface CityObjectProps {
  object: WorldObject;
  position: [number, number, number];
  scale: [number, number, number];
  materials: ReturnType<typeof useMaterialLibrary>;
}

function CityObject({ object, position, scale, materials }: CityObjectProps) {
  const isRoad = object.kind.includes('road');
  const isBuilding = object.kind.includes('building') || object.kind.includes('landmark');
  const isLandmark = object.kind.includes('landmark');
  const isCharging = object.kind.includes('charging');

  return (
    <group position={position} rotation={[object.rotation[0], object.rotation[1], object.rotation[2]]} scale={scale}>
      <mesh>
        {isBuilding ? <boxGeometry args={[1, isLandmark ? 2.1 : 1.8, 1]} /> : <boxGeometry args={[1, isCharging ? 0.12 : 0.08, 1]} />}
        <meshStandardMaterial
          map={isRoad ? materials.asphalt : isBuilding ? materials.facade : materials.grass}
          color={isLandmark ? '#d9e8f7' : isCharging ? '#cfe5ff' : '#ffffff'}
          roughness={isRoad ? 0.9 : isBuilding ? 0.38 : 0.82}
          metalness={isBuilding ? 0.18 : isLandmark ? 0.16 : 0.03}
        />
      </mesh>
      {isBuilding ? (
        <mesh position={[0, 0.01, 0]} scale={[1.012, isLandmark ? 2.112 : 1.812, 1.012]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            map={materials.facadeWindows}
            color="#dbeafe"
            transparent
            opacity={0.42}
            roughness={0.22}
            metalness={0.28}
          />
        </mesh>
      ) : null}
    </group>
  );
}

function WeatherLayer({ weather }: { weather: WorldSnapshot['terrain'] }) {
  const precipitation = weather.precipitationMmH ?? 0;
  const wind = weather.windMps ?? 0;
  const isFoggy = weather.weather === 'foggy' || weather.visibilityM !== undefined && weather.visibilityM < 180;

  return (
    <>
      {isFoggy ? (
        <mesh scale={[1, 1, 1]}>
          <sphereGeometry args={[28, 32, 16]} />
          <meshBasicMaterial color="#cfd8e3" transparent opacity={0.18} side={BackSide} depthWrite={false} />
        </mesh>
      ) : null}
      {weather.weather === 'cloudy' || weather.weather === 'rainy' || weather.weather === 'stormy' ? <CloudDeck stormy={weather.weather === 'stormy'} /> : null}
      {precipitation > 0 ? <RainField intensity={Math.min(1, precipitation / 18)} wind={wind} /> : null}
      {wind > 8 ? <WindStreaks wind={wind} /> : null}
    </>
  );
}

function CloudDeck({ stormy }: { stormy: boolean }) {
  return (
    <group position={[0, 9.2, 0]}>
      {[-10, -4, 2, 8].map((x, index) => (
        <mesh key={x} position={[x, Math.sin(index) * 0.4, -7 + index * 4]} scale={[4.2, 0.28, 1.4]}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshBasicMaterial color={stormy ? '#6d7480' : '#c6ccd5'} transparent opacity={stormy ? 0.55 : 0.35} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function RainField({ intensity, wind }: { intensity: number; wind: number }) {
  const geometry = useMemo(() => {
    const points: Vector3[] = [];
    const count = Math.round(90 + intensity * 180);
    for (let index = 0; index < count; index += 1) {
      const x = (Math.random() - 0.5) * 34;
      const y = Math.random() * 12;
      const z = (Math.random() - 0.5) * 34;
      points.push(new Vector3(x, y, z), new Vector3(x + wind * 0.025, y - (0.6 + intensity * 0.9), z));
    }
    const lineGeometry = new BufferGeometry();
    lineGeometry.setFromPoints(points);
    return lineGeometry;
  }, [intensity, wind]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#9fb6cf" transparent opacity={0.4 + intensity * 0.35} blending={AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

function WindStreaks({ wind }: { wind: number }) {
  const geometry = useMemo(() => {
    const points: Vector3[] = [];
    for (let index = 0; index < 90; index += 1) {
      const x = (Math.random() - 0.5) * 36;
      const y = Math.random() * 6 + 0.8;
      const z = (Math.random() - 0.5) * 36;
      points.push(new Vector3(x, y, z), new Vector3(x + wind * 0.14, y + 0.02, z + wind * 0.04));
    }
    const lineGeometry = new BufferGeometry();
    lineGeometry.setFromPoints(points);
    return lineGeometry;
  }, [wind]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#eef2f6" transparent opacity={0.2} depthWrite={false} />
    </lineSegments>
  );
}

function DeviceBody({ kind, compact = false, speedMps = 0 }: { kind: SimulationDevice['kind']; compact?: boolean; speedMps?: number }) {
  if (kind === 'drone') {
    return (
      <Suspense fallback={<DeviceProxyBody kind={kind} compact={compact} speedMps={speedMps} />}>
        <DroneModel compact={compact} speedMps={speedMps} />
      </Suspense>
    );
  }

  if (kind === 'humanoid') {
    return (
      <Suspense fallback={<DeviceProxyBody kind={kind} compact={compact} speedMps={speedMps} />}>
        <UnitreeG1Model compact={compact} speedMps={speedMps} />
      </Suspense>
    );
  }

  if (kind === 'quadruped') {
    return (
      <Suspense fallback={<DeviceProxyBody kind={kind} compact={compact} speedMps={speedMps} />}>
        <UnitreeGo2Model compact={compact} speedMps={speedMps} />
      </Suspense>
    );
  }

  return <DeviceProxyBody kind={kind} compact={compact} speedMps={speedMps} />;
}

function DroneModel({ compact, speedMps }: { compact: boolean; speedMps: number }) {
  const object = useGLTF(djiMavicUrl).scene;
  const bodyRef = useRef<Group>(null);
  const rotorRefs = useRef<Group[]>([]);
  const phaseRef = useRef(0);
  const drone = useMemo(() => {
    const cloned = cloneThreeObject(object);
    configureModelMaterials(cloned, 'drone');
    return cloned;
  }, [object]);
  const rotorRadius = compact ? 0.14 : 0.22;
  const rotorPositions = useMemo<[number, number, number][]>(() => {
    const offset = compact ? 0.26 : 0.42;
    const height = compact ? 0.08 : 0.14;
    return [
      [offset, height, offset],
      [offset, height, -offset],
      [-offset, height, offset],
      [-offset, height, -offset],
    ];
  }, [compact]);

  useFrame((_, delta) => {
    const active = speedMps > 0.05;
    const spinRate = active ? 34 + Math.min(60, speedMps * 7) : 5;
    phaseRef.current += delta * spinRate;

    // 无人机工作状态以旋翼高速转动和轻微机身姿态补偿表达，位置仍由 tick 状态决定。
    rotorRefs.current.forEach((rotor, index) => {
      rotor.rotation.y += delta * spinRate * (index % 2 === 0 ? 1 : -1);
    });

    if (bodyRef.current) {
      bodyRef.current.position.y = active ? Math.sin(phaseRef.current * 0.12) * 0.018 : 0;
      bodyRef.current.rotation.x = active ? Math.sin(phaseRef.current * 0.09) * 0.035 : 0;
      bodyRef.current.rotation.z = active ? Math.cos(phaseRef.current * 0.11) * 0.032 : 0;
    }
  });

  return (
    <group ref={bodyRef}>
      <primitive
        object={drone}
        scale={compact ? 0.018 : 0.032}
        position={[0, compact ? -0.08 : -0.15, 0]}
        rotation={[0, Math.PI, 0]}
        castShadow
        receiveShadow
      />
      {rotorPositions.map((position, index) => (
        <group
          key={`${position[0]}-${position[2]}`}
          ref={(node) => {
            if (node) {
              rotorRefs.current[index] = node;
            }
          }}
          position={position}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[rotorRadius, rotorRadius, 0.006, 48]} />
            <meshStandardMaterial color="#d7e0ee" transparent opacity={speedMps > 0.05 ? 0.34 : 0.16} roughness={0.28} metalness={0.18} />
          </mesh>
          <mesh>
            <boxGeometry args={[rotorRadius * 2.15, 0.008, 0.035]} />
            <meshStandardMaterial color="#111827" roughness={0.35} metalness={0.2} />
          </mesh>
          <mesh rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[rotorRadius * 2.15, 0.008, 0.035]} />
            <meshStandardMaterial color="#111827" roughness={0.35} metalness={0.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const g1CoreParts = [
  { key: 'pelvis', url: g1PelvisUrl, position: [0, 0, 0], rotation: [0, 0, 0] },
  { key: 'waist', url: g1WaistYawUrl, position: [0, 0, 0], rotation: [0, 0, 0] },
  { key: 'torso', url: g1TorsoUrl, position: [0, 0, 54], rotation: [0, 0, 0] },
  { key: 'head', url: g1HeadUrl, position: [4, 0, 150], rotation: [0, 0, 0] },
  { key: 'logo', url: g1LogoUrl, position: [4, 0, 98], rotation: [0, 0, 0] },
] as const;

const g1LimbParts = [
  { key: 'left-hip-pitch', url: g1LeftHipPitchUrl, side: 1, chain: 'leg', offset: [0, 64, -103] },
  { key: 'left-hip-roll', url: g1LeftHipRollUrl, side: 1, chain: 'leg', offset: [0, 116, -133] },
  { key: 'left-hip-yaw', url: g1LeftHipYawUrl, side: 1, chain: 'leg', offset: [25, 116, -257] },
  { key: 'left-knee', url: g1LeftKneeUrl, side: 1, chain: 'leg', offset: [-53, 118, -434] },
  { key: 'left-ankle-pitch', url: g1LeftAnklePitchUrl, side: 1, chain: 'leg', offset: [-53, 118, -734] },
  { key: 'left-ankle-roll', url: g1LeftAnkleRollUrl, side: 1, chain: 'leg', offset: [-53, 118, -752] },
  { key: 'right-hip-pitch', url: g1RightHipPitchUrl, side: -1, chain: 'leg', offset: [0, -64, -103] },
  { key: 'right-hip-roll', url: g1RightHipRollUrl, side: -1, chain: 'leg', offset: [0, -116, -133] },
  { key: 'right-hip-yaw', url: g1RightHipYawUrl, side: -1, chain: 'leg', offset: [25, -116, -257] },
  { key: 'right-knee', url: g1RightKneeUrl, side: -1, chain: 'leg', offset: [-53, -118, -434] },
  { key: 'right-ankle-pitch', url: g1RightAnklePitchUrl, side: -1, chain: 'leg', offset: [-53, -118, -734] },
  { key: 'right-ankle-roll', url: g1RightAnkleRollUrl, side: -1, chain: 'leg', offset: [-53, -118, -752] },
  { key: 'left-shoulder-pitch', url: g1LeftShoulderPitchUrl, side: 1, chain: 'arm', offset: [4, 100, 292] },
  { key: 'left-shoulder-roll', url: g1LeftShoulderRollUrl, side: 1, chain: 'arm', offset: [4, 138, 278] },
  { key: 'left-shoulder-yaw', url: g1LeftShoulderYawUrl, side: 1, chain: 'arm', offset: [4, 144, 175] },
  { key: 'left-elbow', url: g1LeftElbowUrl, side: 1, chain: 'arm', offset: [20, 144, 94] },
  { key: 'right-shoulder-pitch', url: g1RightShoulderPitchUrl, side: -1, chain: 'arm', offset: [4, -100, 292] },
  { key: 'right-shoulder-roll', url: g1RightShoulderRollUrl, side: -1, chain: 'arm', offset: [4, -138, 278] },
  { key: 'right-shoulder-yaw', url: g1RightShoulderYawUrl, side: -1, chain: 'arm', offset: [4, -144, 175] },
  { key: 'right-elbow', url: g1RightElbowUrl, side: -1, chain: 'arm', offset: [20, -144, 94] },
] as const;

function UnitreeG1Model({ compact, speedMps }: { compact: boolean; speedMps: number }) {
  const coreGeometries = useLoader(STLLoader, g1CoreParts.map((part) => part.url));
  const limbGeometries = useLoader(STLLoader, g1LimbParts.map((part) => part.url));
  const texture = getDeviceSkinTexture('g1');
  const material = useMemo(() => new MeshStandardMaterial({ map: texture, color: '#eef1f4', roughness: 0.48, metalness: 0.16 }), [texture]);
  const rootRef = useRef<Group>(null);
  const coreRefs = useRef<Record<string, Object3D | null>>({});
  const limbRefs = useRef<Record<string, Object3D | null>>({});
  const phaseRef = useRef(0);
  const coreProjectedGeometries = useMemo(
    () => coreGeometries.map((geometry) => createProjectedUvGeometry(geometry, 'x', 'z')),
    [coreGeometries],
  );
  const limbProjectedGeometries = useMemo(
    () => limbGeometries.map((geometry) => createProjectedUvGeometry(geometry, 'x', 'z')),
    [limbGeometries],
  );
  const scale = compact ? 0.0025 : 0.0042;

  useFrame((_, delta) => {
    const active = speedMps > 0.05;
    const cadence = active ? 3.8 + Math.min(4.2, speedMps * 2.4) : 1.2;
    phaseRef.current += delta * cadence;
    const phase = phaseRef.current;
    const stride = active ? Math.min(0.58, 0.22 + speedMps * 0.18) : 0;
    const bodyBob = active ? Math.abs(Math.sin(phase)) * 0.028 : 0;

    // G1 的 STL 没有骨骼动画，这里按关键部件 ref 做轻量步态相位驱动。
    if (rootRef.current) {
      rootRef.current.position.y = bodyBob;
      rootRef.current.rotation.z = active ? Math.sin(phase * 0.5) * 0.035 : 0;
    }

    const head = coreRefs.current.head;
    const torso = coreRefs.current.torso;
    if (head) {
      head.rotation.y = active ? Math.sin(phase * 0.7) * 0.08 : 0;
    }
    if (torso) {
      torso.rotation.y = active ? Math.sin(phase * 0.5) * 0.045 : 0;
    }

    g1LimbParts.forEach((part) => {
      const node = limbRefs.current[part.key];
      if (!node) {
        return;
      }

      const sidePhase = part.side > 0 ? phase : phase + Math.PI;
      const swing = Math.sin(sidePhase) * stride;
      const lift = Math.max(0, Math.sin(sidePhase)) * stride;

      if (part.chain === 'leg') {
        if (part.key.includes('hip-pitch')) {
          node.rotation.set(swing, 0, 0);
        } else if (part.key.includes('hip-roll')) {
          node.rotation.set(0, part.side * 0.08 * Math.sin(phase * 0.5), 0);
        } else if (part.key.includes('hip-yaw')) {
          node.rotation.set(0, 0, part.side * 0.08 * Math.cos(sidePhase));
        } else if (part.key.includes('knee')) {
          node.rotation.set(Math.max(0, -swing) * 0.78 + lift * 0.28, 0, 0);
        } else if (part.key.includes('ankle-pitch')) {
          node.rotation.set(-swing * 0.38, 0, 0);
        } else {
          node.rotation.set(0, 0, -part.side * lift * 0.2);
        }
        return;
      }

      const armSwing = -swing * 0.78;
      if (part.key.includes('shoulder-pitch')) {
        node.rotation.set(armSwing, 0, 0);
      } else if (part.key.includes('shoulder-roll')) {
        node.rotation.set(0, part.side * 0.18 + part.side * Math.abs(swing) * 0.12, 0);
      } else if (part.key.includes('shoulder-yaw')) {
        node.rotation.set(0, 0, part.side * 0.1 * Math.sin(sidePhase));
      } else {
        node.rotation.set(Math.abs(armSwing) * 0.42, 0, part.side * 0.08);
      }
    });
  });

  return (
    <group scale={scale} rotation={[-Math.PI / 2, 0, Math.PI]}>
      <group ref={rootRef}>
        {g1CoreParts.map((part, index) => (
          <mesh
            key={part.key}
            ref={(node) => {
              coreRefs.current[part.key] = node;
            }}
            geometry={coreProjectedGeometries[index]}
            material={material}
            position={part.position}
            rotation={part.rotation}
          />
        ))}
        {g1LimbParts.map((part, index) => {
          return (
            <mesh
              key={part.key}
              ref={(node) => {
                limbRefs.current[part.key] = node;
              }}
              geometry={limbProjectedGeometries[index]}
              material={material}
              position={part.offset}
            />
          );
        })}
      </group>
    </group>
  );
}

function CloneColladaPart({
  source,
  position,
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
}: {
  source: Object3D;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}) {
  const object = useMemo(() => cloneThreeObject(source), [source]);
  return <primitive object={object} position={position} rotation={rotation} scale={scale} />;
}

function UnitreeGo2Model({ compact, speedMps }: { compact: boolean; speedMps: number }) {
  const [base, hip, thigh, thighMirror, calf, calfMirror, foot] = useLoader(ColladaLoader, [
    go2BaseUrl,
    go2HipUrl,
    go2ThighUrl,
    go2ThighMirrorUrl,
    go2CalfUrl,
    go2CalfMirrorUrl,
    go2FootUrl,
  ]);
  const parts = useMemo(() => {
    const loaded = [base, hip, thigh, thighMirror, calf, calfMirror, foot];
    loaded.forEach((part) => configureModelMaterials(part.scene, 'go2'));
    return {
      base: base.scene,
      hip: hip.scene,
      thigh: thigh.scene,
      thighMirror: thighMirror.scene,
      calf: calf.scene,
      calfMirror: calfMirror.scene,
      foot: foot.scene,
    };
  }, [base, calf, calfMirror, foot, hip, thigh, thighMirror]);
  const rootRef = useRef<Group>(null);
  const legRefs = useRef<Record<string, { root?: Group | null; thigh?: Group | null; calf?: Group | null }>>({});
  const phaseRef = useRef(0);
  const modelScale = compact ? 0.86 : 1.22;
  const legs = [
    { key: 'FL', x: 0.25, z: 0.28, mirrored: false, phaseOffset: 0 },
    { key: 'FR', x: 0.25, z: -0.28, mirrored: true, phaseOffset: Math.PI },
    { key: 'RL', x: -0.25, z: 0.28, mirrored: false, phaseOffset: Math.PI },
    { key: 'RR', x: -0.25, z: -0.28, mirrored: true, phaseOffset: 0 },
  ];

  useFrame((_, delta) => {
    const active = speedMps > 0.05;
    const cadence = active ? 4.4 + Math.min(4.6, speedMps * 1.9) : 1.1;
    phaseRef.current += delta * cadence;
    const stride = active ? Math.min(0.42, 0.18 + speedMps * 0.11) : 0;

    // Go2 运行时由四条腿的对角相位驱动：FL/RR 同相，FR/RL 反相。
    if (rootRef.current) {
      rootRef.current.position.y = active ? Math.abs(Math.sin(phaseRef.current * 2)) * 0.018 : 0;
      rootRef.current.rotation.z = active ? Math.sin(phaseRef.current) * 0.018 : 0;
    }

    legs.forEach((leg) => {
      const refs = legRefs.current[leg.key];
      if (!refs) {
        return;
      }

      const phase = phaseRef.current + leg.phaseOffset;
      const swing = Math.sin(phase) * stride;
      const lift = Math.max(0, Math.sin(phase)) * 0.052;
      if (refs.root) {
        refs.root.position.x = leg.x + Math.cos(phase) * (active ? 0.018 : 0);
        refs.root.position.y = leg.z;
        refs.root.position.z = -0.02 + lift;
      }
      if (refs.thigh) {
        refs.thigh.rotation.x = swing;
      }
      if (refs.calf) {
        refs.calf.rotation.x = -swing * 1.35 - lift * 2.2;
      }
    });
  });

  return (
    <group scale={[modelScale, modelScale, modelScale]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
      <group ref={rootRef}>
        <CloneColladaPart source={parts.base} position={[0, 0, 0]} />
        {legs.map((leg) => (
          <group
            key={leg.key}
            ref={(node) => {
              legRefs.current[leg.key] = { ...legRefs.current[leg.key], root: node };
            }}
            position={[leg.x, leg.z, -0.02]}
          >
            <CloneColladaPart
              source={parts.hip}
              position={[0, 0, 0]}
              rotation={[leg.z < 0 ? Math.PI : 0, 0, leg.x < 0 ? Math.PI : 0]}
            />
            <group
              ref={(node) => {
                legRefs.current[leg.key] = { ...legRefs.current[leg.key], thigh: node };
              }}
              position={[0, leg.z > 0 ? 0.0955 : -0.0955, 0]}
            >
              <CloneColladaPart source={leg.mirrored ? parts.thighMirror : parts.thigh} position={[0, 0, 0]} />
              <group
                ref={(node) => {
                  legRefs.current[leg.key] = { ...legRefs.current[leg.key], calf: node };
                }}
                position={[0, 0, -0.213]}
              >
                <CloneColladaPart source={leg.mirrored ? parts.calfMirror : parts.calf} position={[0, 0, 0]} />
                <CloneColladaPart source={parts.foot} position={[0, 0, -0.213]} scale={[1.04, 1.04, 1.04]} />
              </group>
            </group>
          </group>
        ))}
        <Html position={[0, 0, 0.38]} center>
          <span style={{ fontSize: 9, color: '#ffffff', fontWeight: 700, textShadow: '0 1px 2px #111827' }}>Unitree Go2</span>
        </Html>
      </group>
    </group>
  );
}

function DeviceProxyBody({ kind, compact = false, speedMps = 0 }: { kind: SimulationDevice['kind']; compact?: boolean; speedMps?: number }) {
  const bodyScale = compact ? 0.68 : 1;
  const fallbackRootRef = useRef<Group>(null);
  const fallbackPartRefs = useRef<Object3D[]>([]);
  const fallbackPhaseRef = useRef(0);
  const g1Texture = getDeviceSkinTexture('g1');
  const go2Texture = getDeviceSkinTexture('go2');
  const droneTexture = getDeviceSkinTexture('drone');

  useFrame((_, delta) => {
    const active = speedMps > 0.05;
    fallbackPhaseRef.current += delta * (active ? 4 + speedMps * 2 : 1);
    const swing = active ? Math.sin(fallbackPhaseRef.current) * Math.min(0.36, 0.12 + speedMps * 0.08) : 0;
    if (fallbackRootRef.current) {
      fallbackRootRef.current.position.y = active ? Math.abs(Math.sin(fallbackPhaseRef.current)) * 0.025 : 0;
    }
    fallbackPartRefs.current.forEach((part, index) => {
      if (!part) {
        return;
      }
      part.rotation.x = index % 2 === 0 ? swing : -swing;
      part.rotation.z = kind === 'wheeled_robot' ? fallbackPhaseRef.current * 2.5 : part.rotation.z;
    });
  });

  if (kind === 'drone') {
    return (
      <group ref={fallbackRootRef} scale={[bodyScale, bodyScale, bodyScale]}>
        <mesh castShadow>
          <octahedronGeometry args={[0.42, 0]} />
          <meshStandardMaterial map={droneTexture} color="#e8f0fe" roughness={0.35} metalness={0.2} />
        </mesh>
        {[-0.32, 0.32].map((x) =>
          [-0.32, 0.32].map((z, index) => (
            <group
              key={`${x}-${z}`}
              ref={(node) => {
                if (node) {
                  fallbackPartRefs.current[index + (x > 0 ? 2 : 0)] = node;
                }
              }}
              position={[x, 0.12, z]}
            >
              <mesh>
                <boxGeometry args={[0.42, 0.01, 0.045]} />
                <meshStandardMaterial color="#111827" roughness={0.35} metalness={0.2} />
              </mesh>
            </group>
          )),
        )}
      </group>
    );
  }

  if (kind === 'sensor_node') {
    return (
      <mesh castShadow scale={[bodyScale, bodyScale, bodyScale]}>
        <cylinderGeometry args={[0.34, 0.42, 0.7, 20]} />
        <meshStandardMaterial color="#f9ab00" roughness={0.42} metalness={0.28} />
      </mesh>
    );
  }

  if (kind === 'quadruped') {
    return (
      <group ref={fallbackRootRef} scale={[bodyScale, bodyScale, bodyScale]}>
        <mesh castShadow>
          <boxGeometry args={[0.92, 0.32, 1.26]} />
          <meshStandardMaterial map={go2Texture} color="#dce3ec" roughness={0.42} metalness={0.16} />
        </mesh>
        <mesh position={[0, 0.1, 0.74]} castShadow>
          <boxGeometry args={[0.42, 0.22, 0.2]} />
          <meshStandardMaterial color="#111827" roughness={0.35} metalness={0.24} />
        </mesh>
        {[-0.34, 0.34].map((x, xIndex) =>
          [-0.45, 0.45].map((z, zIndex) => (
            <group
              key={`${x}-${z}`}
              ref={(node) => {
                if (node) {
                  fallbackPartRefs.current[xIndex * 2 + zIndex] = node;
                }
              }}
              position={[x, -0.18, z]}
            >
              <mesh position={[0, -0.18, 0]} castShadow>
                <boxGeometry args={[0.15, 0.42, 0.15]} />
                <meshStandardMaterial color="#202124" roughness={0.5} metalness={0.14} />
              </mesh>
              <mesh position={[0, -0.45, 0.03]} castShadow>
                <boxGeometry args={[0.13, 0.34, 0.13]} />
                <meshStandardMaterial color="#d8dde6" roughness={0.5} metalness={0.08} />
              </mesh>
            </group>
          )),
        )}
        <Html position={[0, 0.33, 0]} center>
          <span style={{ fontSize: 9, color: '#202124', fontWeight: 700 }}>Unitree Go2</span>
        </Html>
      </group>
    );
  }

  if (kind === 'wheeled_robot') {
    return (
      <group ref={fallbackRootRef} scale={[bodyScale, bodyScale, bodyScale]}>
        <mesh castShadow position={[0, 0.08, 0]}>
          <boxGeometry args={[1.18, 0.38, 1.38]} />
          <meshStandardMaterial color="#dce3ec" roughness={0.38} metalness={0.18} />
        </mesh>
        {[-0.52, 0.52].map((x, xIndex) =>
          [-0.46, 0.46].map((z, zIndex) => (
            <mesh
              key={`${x}-${z}`}
              ref={(node) => {
                if (node) {
                  fallbackPartRefs.current[xIndex * 2 + zIndex] = node;
                }
              }}
              position={[x, -0.14, z]}
              rotation={[Math.PI / 2, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.18, 0.18, 0.12, 24]} />
              <meshStandardMaterial color="#202124" roughness={0.62} metalness={0.08} />
            </mesh>
          )),
        )}
      </group>
    );
  }

  return (
    <group ref={fallbackRootRef} scale={[bodyScale, bodyScale, bodyScale]}>
      <mesh castShadow>
        <boxGeometry args={[0.62, 1.12, 0.34]} />
        <meshStandardMaterial map={g1Texture} color="#e8eaed" roughness={0.35} metalness={0.18} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <sphereGeometry args={[0.18, 24, 24]} />
        <meshStandardMaterial color="#d9ebff" roughness={0.2} metalness={0.8} />
      </mesh>
      {[-0.28, 0.28].map((x, index) => (
        <mesh
          key={`leg-${x}`}
          ref={(node) => {
            if (node) {
              fallbackPartRefs.current[index] = node;
            }
          }}
          position={[x, -0.78, 0]}
          castShadow
        >
          <boxGeometry args={[0.12, 0.58, 0.12]} />
          <meshStandardMaterial color="#202124" roughness={0.52} metalness={0.1} />
        </mesh>
      ))}
      {[-0.36, 0.36].map((x, index) => (
        <mesh
          key={`arm-${x}`}
          ref={(node) => {
            if (node) {
              fallbackPartRefs.current[index + 2] = node;
            }
          }}
          position={[x, 0.08, 0]}
          castShadow
        >
          <boxGeometry args={[0.1, 0.62, 0.1]} />
          <meshStandardMaterial color="#d8dde6" roughness={0.52} metalness={0.12} />
        </mesh>
      ))}
    </group>
  );
}

useGLTF.preload(djiMavicUrl);
