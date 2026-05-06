import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export function buildWheeledRobot(): THREE.Group {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xc8d2e0,
    metalness: 0.3,
    roughness: 0.45,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d63e9,
    metalness: 0.1,
    roughness: 0.4,
  });
  const wheelMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2d33,
    metalness: 0.5,
    roughness: 0.4,
  });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.32, 0.6), bodyMaterial);
  chassis.position.y = 0.32;
  group.add(chassis);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.28, 0.5), bodyMaterial);
  cabin.position.set(0.05, 0.62, 0);
  group.add(cabin);

  const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 16), accentMaterial);
  sensor.position.set(0.18, 0.84, 0);
  group.add(sensor);

  const sensorTop = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), accentMaterial);
  sensorTop.position.set(0.18, 0.94, 0);
  group.add(sensorTop);

  const wheelOffsets: Array<[number, number]> = [
    [-0.4, -0.32],
    [-0.4, 0.32],
    [0.4, -0.32],
    [0.4, 0.32],
  ];
  for (const [x, z] of wheelOffsets) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 24), wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.16, z);
    group.add(wheel);
  }

  return group;
}

let cachedUrlPromise: Promise<string> | null = null;

export function getWheeledRobotGlbUrl(): Promise<string> {
  if (cachedUrlPromise) return cachedUrlPromise;
  cachedUrlPromise = new Promise<string>((resolve, reject) => {
    try {
      const robot = buildWheeledRobot();
      const scene = new THREE.Scene();
      scene.add(robot);
      const exporter = new GLTFExporter();
      exporter.parse(
        scene,
        (result) => {
          if (result instanceof ArrayBuffer) {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            resolve(URL.createObjectURL(blob));
          } else {
            reject(new Error('GLTFExporter returned JSON, expected binary GLB.'));
          }
        },
        (error) => reject(error),
        { binary: true },
      );
    } catch (error) {
      reject(error);
    }
  });
  return cachedUrlPromise;
}
