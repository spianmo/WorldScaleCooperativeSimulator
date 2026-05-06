#!/usr/bin/env node
// 给 baked GLB 注入循环动画（旋翼旋转 / 四足 trot / 双足行走），
// 输出到 assets/models/baked/。Cesium ModelGraphics(runAnimations:true) 自动播放。
// Usage: npm run bake:animations

import './_glb-node-shims.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const modelsDir = path.join(projectRoot, 'assets', 'models');
const outDir = path.join(modelsDir, 'baked');
fs.mkdirSync(outDir, { recursive: true });

// 关键帧数量越多，slerp 的合成轨迹越接近匀速旋转。5 帧/圈对 90° 弧足够平滑。
function buildSpinTrack(nodeName, axis, periodSec) {
  const steps = 5; // 0, 90, 180, 270, 360
  const times = new Float32Array(steps);
  const values = new Float32Array(steps * 4);
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    const angle = t * Math.PI * 2;
    times[i] = t * periodSec;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    values[i * 4 + 0] = q.x;
    values[i * 4 + 1] = q.y;
    values[i * 4 + 2] = q.z;
    values[i * 4 + 3] = q.w;
  }
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

// 摆动轨道：绕 axis 在 [-amplitudeRad, +amplitudeRad] 间正弦摆动，
// phase 用于让左右腿 / 对角腿错开半个周期。
function buildSwingTrack(nodeName, axis, amplitudeRad, periodSec, phase = 0) {
  const steps = 16;
  const times = new Float32Array(steps);
  const values = new Float32Array(steps * 4);
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    times[i] = t * periodSec;
    const angle = Math.sin((t + phase) * Math.PI * 2) * amplitudeRad;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    values[i * 4 + 0] = q.x;
    values[i * 4 + 1] = q.y;
    values[i * 4 + 2] = q.z;
    values[i * 4 + 3] = q.w;
  }
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

// 弯曲轨道：绕 axis 在 [0, amplitudeRad] 的半周期摆动（膝盖只往内弯不反弓）。
function buildBendTrack(nodeName, axis, amplitudeRad, periodSec, phase = 0) {
  const steps = 16;
  const times = new Float32Array(steps);
  const values = new Float32Array(steps * 4);
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1);
    times[i] = t * periodSec;
    const wave = (Math.sin((t + phase) * Math.PI * 2) + 1) * 0.5; // 0..1
    const angle = wave * amplitudeRad;
    const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    values[i * 4 + 0] = q.x;
    values[i * 4 + 1] = q.y;
    values[i * 4 + 2] = q.z;
    values[i * 4 + 3] = q.w;
  }
  return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);

function buildPropSpinClip(scene) {
  const tracks = [];
  for (const name of ['prop1', 'prop2', 'prop3', 'prop4']) {
    if (scene.getObjectByName(name)) {
      tracks.push(buildSpinTrack(name, Y_AXIS, 0.1));
    } else {
      console.warn(`[inject] missing node ${name}`);
    }
  }
  return new THREE.AnimationClip('prop-spin', 0.1, tracks);
}

function buildTrotClip(scene) {
  const period = 0.6;
  // 对角腿同相位（FL+RR 一组、FR+RL 另一组），一组相对另一组相位差 0.5 个周期。
  const groups = [
    { thigh: 'FL_thigh_joint', calf: 'FL_calf_joint', phase: 0 },
    { thigh: 'RR_thigh_joint', calf: 'RR_calf_joint', phase: 0 },
    { thigh: 'FR_thigh_joint', calf: 'FR_calf_joint', phase: 0.5 },
    { thigh: 'RL_thigh_joint', calf: 'RL_calf_joint', phase: 0.5 },
  ];
  const tracks = [];
  for (const leg of groups) {
    if (scene.getObjectByName(leg.thigh)) {
      tracks.push(buildSwingTrack(leg.thigh, Y_AXIS, THREE.MathUtils.degToRad(15), period, leg.phase));
    } else {
      console.warn(`[inject] missing node ${leg.thigh}`);
    }
    if (scene.getObjectByName(leg.calf)) {
      tracks.push(buildBendTrack(leg.calf, Y_AXIS, THREE.MathUtils.degToRad(30), period, leg.phase));
    } else {
      console.warn(`[inject] missing node ${leg.calf}`);
    }
  }
  return new THREE.AnimationClip('trot', period, tracks);
}

function buildBipedWalkClip(scene) {
  const period = 1.0;
  // 左右腿反相位（一前一后）。urdf-loader 烘焙后 baked 模型坐标轴可能与原 URDF 不同，
  // 这里选 Y 轴作为髋俯仰主轴，膝盖统一弯曲方向；如果实测姿态反了再调 axis。
  const legs = [
    { hip: 'left_hip_pitch_joint', knee: 'left_knee_joint', phase: 0 },
    { hip: 'right_hip_pitch_joint', knee: 'right_knee_joint', phase: 0.5 },
  ];
  const tracks = [];
  for (const leg of legs) {
    if (scene.getObjectByName(leg.hip)) {
      tracks.push(buildSwingTrack(leg.hip, Y_AXIS, THREE.MathUtils.degToRad(20), period, leg.phase));
    } else {
      console.warn(`[inject] missing node ${leg.hip}`);
    }
    if (scene.getObjectByName(leg.knee)) {
      tracks.push(buildBendTrack(leg.knee, Y_AXIS, THREE.MathUtils.degToRad(35), period, leg.phase + 0.25));
    } else {
      console.warn(`[inject] missing node ${leg.knee}`);
    }
  }
  return new THREE.AnimationClip('walk', period, tracks);
}

const SPECS = [
  {
    id: 'drone',
    in: path.join(modelsDir, 'DJI_Mavic.glb'),
    out: path.join(outDir, 'dji_mavic.glb'),
    clipBuilder: buildPropSpinClip,
  },
  {
    id: 'go2',
    in: path.join(outDir, 'unitree_go2.glb'),
    out: path.join(outDir, 'unitree_go2.glb'),
    clipBuilder: buildTrotClip,
  },
  {
    id: 'g1',
    in: path.join(outDir, 'unitree_g1.glb'),
    out: path.join(outDir, 'unitree_g1.glb'),
    clipBuilder: buildBipedWalkClip,
  },
];

function loadGltf(filePath) {
  const buffer = fs.readFileSync(filePath);
  // GLTFLoader.parse 期待 ArrayBuffer，且 path 用于解析相对资源（GLB 自包含可空）。
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });
}

function exportGlb(scene, animations) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
        } else {
          reject(new Error('GLTFExporter returned JSON, expected binary GLB.'));
        }
      },
      (err) => reject(err),
      { binary: true, animations },
    );
  });
}

async function processSpec(spec) {
  if (!fs.existsSync(spec.in)) {
    console.warn(`[inject:${spec.id}] skip — input ${spec.in} not found (run bake:models first?)`);
    return;
  }
  console.log(`[inject:${spec.id}] reading ${path.relative(projectRoot, spec.in)}`);
  const gltf = await loadGltf(spec.in);
  const scene = gltf.scene ?? gltf.scenes[0];
  if (!scene) {
    throw new Error(`[inject:${spec.id}] gltf has no scene`);
  }
  const clip = spec.clipBuilder(scene);
  if (clip.tracks.length === 0) {
    console.warn(`[inject:${spec.id}] no tracks generated, skipping`);
    return;
  }
  const existingAnimations = Array.isArray(gltf.animations) ? gltf.animations : [];
  // 同名 clip 替换，避免重复执行脚本时动画堆叠。
  const filteredAnimations = existingAnimations.filter((c) => c.name !== clip.name);
  const animations = [...filteredAnimations, clip];
  const out = await exportGlb(scene, animations);
  fs.writeFileSync(spec.out, out);
  console.log(
    `[inject:${spec.id}] wrote ${path.relative(projectRoot, spec.out)} `
    + `(${animations.length} clip(s), ${clip.tracks.length} tracks in '${clip.name}')`,
  );
}

async function main() {
  for (const spec of SPECS) {
    try {
      await processSpec(spec);
    } catch (err) {
      console.error(`[inject:${spec.id}] failed:`, err);
      process.exitCode = 1;
    }
  }
}

main();
