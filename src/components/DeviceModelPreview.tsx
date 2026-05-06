import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import URDFLoader from 'urdf-loader';

import type { DeviceKind } from '../types';
import djiMavicUrl from '../../assets/models/DJI_Mavic.glb';
import parrotBebopUrl from '../../assets/models/Parrot_Bebop.glb';
import { g1, go2, meshBasename, type UnitreeModel } from '../assets/unitreeMeshUrls';
import { buildWheeledRobot } from '../utils/wheeledRobotMesh';

type LoaderKind = 'gltf' | 'urdf' | 'procedural_wheel';

interface ModelConfig {
  url?: string;
  urdfModel?: UnitreeModel;
  loader: LoaderKind;
  cameraDistance: number;
  pitchDeg: number;
  yawDeg: number;
}

const modelMap: Record<DeviceKind, ModelConfig> = {
  drone: { url: djiMavicUrl, loader: 'gltf', cameraDistance: 2.4, pitchDeg: 18, yawDeg: 35 },
  sensor_node: { url: parrotBebopUrl, loader: 'gltf', cameraDistance: 2.4, pitchDeg: 22, yawDeg: 30 },
  humanoid: { urdfModel: g1, loader: 'urdf', cameraDistance: 3.2, pitchDeg: 6, yawDeg: 25 },
  quadruped: { urdfModel: go2, loader: 'urdf', cameraDistance: 2.6, pitchDeg: 16, yawDeg: 30 },
  unitree_robot: { urdfModel: go2, loader: 'urdf', cameraDistance: 2.6, pitchDeg: 16, yawDeg: 30 },
  wheeled_robot: { loader: 'procedural_wheel', cameraDistance: 2.4, pitchDeg: 18, yawDeg: 30 },
};

const URDF_DEFAULT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xc8d2e0,
  metalness: 0.35,
  roughness: 0.45,
});

export interface DeviceModelPreviewProps {
  kind: DeviceKind;
  className?: string;
}

export function DeviceModelPreview({ kind, className }: DeviceModelPreviewProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const config = modelMap[kind];
    setErrorMessage(null);
    setIsLoading(true);

    const initialWidth = Math.max(container.clientWidth, 1);
    const initialHeight = Math.max(container.clientHeight, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(initialWidth, initialHeight, false);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, initialWidth / initialHeight, 0.05, 100);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    keyLight.position.set(3, 4, 2.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9bb6ee, 0.45);
    rimLight.position.set(-2.5, 1.5, -2);
    scene.add(rimLight);

    const fillLight = new THREE.HemisphereLight(0xeaf2ff, 0x4a608a, 0.4);
    scene.add(fillLight);

    const root = new THREE.Group();
    scene.add(root);

    let isDisposed = false;
    let frameId = 0;

    function applyCamera(distance: number) {
      const pitch = THREE.MathUtils.degToRad(config.pitchDeg);
      const yaw = THREE.MathUtils.degToRad(config.yawDeg);
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      camera.lookAt(0, 0, 0);
    }

    function fitObject(object: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(object);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 1;
      const scale = targetSize / maxDim;
      object.scale.setScalar(scale);
      object.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

      applyCamera(targetSize * config.cameraDistance);
    }

    function disposeObject(object: THREE.Object3D) {
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
    }

    function handleLoaded(object: THREE.Object3D) {
      if (isDisposed) {
        disposeObject(object);
        return;
      }

      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => {
            const std = material as THREE.MeshStandardMaterial;
            if ('metalness' in std && typeof std.metalness === 'number') {
              std.metalness = Math.min(std.metalness, 0.4);
            }
          });
        }
      });

      fitObject(object);
      root.add(object);
      setIsLoading(false);
    }

    function handleError(error: unknown) {
      if (isDisposed) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setIsLoading(false);
    }

    if (config.loader === 'gltf' && config.url) {
      new GLTFLoader().load(
        config.url,
        (gltf) => handleLoaded(gltf.scene),
        undefined,
        handleError,
      );
    } else if (config.loader === 'urdf' && config.urdfModel) {
      const urdfModel = config.urdfModel;
      const manager = new THREE.LoadingManager();
      const urdfLoader = new URDFLoader(manager);
      urdfLoader.loadMeshCb = (path, mgr, onComplete) => {
        const url = urdfModel.meshes[meshBasename(path)];
        if (!url) {
          onComplete(new THREE.Object3D());
          return;
        }
        const lower = path.toLowerCase();
        if (lower.endsWith('.stl')) {
          new STLLoader(mgr).load(
            url,
            (geometry) => {
              const mesh = new THREE.Mesh(geometry, URDF_DEFAULT_MATERIAL.clone());
              onComplete(mesh);
            },
            undefined,
            (err) => onComplete(new THREE.Object3D(), err as Error),
          );
        } else {
          new ColladaLoader(mgr).load(
            url,
            (collada) => {
              if (!collada?.scene) {
                onComplete(new THREE.Object3D());
                return;
              }
              onComplete(collada.scene);
            },
            undefined,
            (err) => onComplete(new THREE.Object3D(), err as Error),
          );
        }
      };
      urdfLoader.load(
        urdfModel.urdf,
        (robot) => {
          // URDF is Z-up by ROS convention; rotate to three.js Y-up.
          robot.rotation.x = -Math.PI / 2;
          handleLoaded(robot);
        },
        undefined,
        handleError,
      );
    } else {
      handleLoaded(buildWheeledRobot());
    }

    function animate() {
      if (isDisposed) {
        return;
      }
      frameId = requestAnimationFrame(animate);
      root.rotation.y += 0.005;
      renderer.render(scene, camera);
    }
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      disposeObject(root);
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [kind]);

  return (
    <div className={className ?? 'create-device-summary-canvas'}>
      <div ref={containerRef} className="create-device-summary-canvas-stage" />
      {isLoading ? (
        <div className="create-device-summary-canvas-status" data-tone="loading">{t('devicePreview.loading')}</div>
      ) : null}
      {errorMessage ? (
        <div className="create-device-summary-canvas-status" data-tone="error">{errorMessage}</div>
      ) : null}
    </div>
  );
}

