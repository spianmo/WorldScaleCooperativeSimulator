#!/usr/bin/env node
// Bake Unitree URDF + STL/DAE assets into single GLB files for Cesium consumption.
// Usage: npm run bake:models

import './_glb-node-shims.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';
import URDFLoader from 'urdf-loader';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const modelsDir = path.join(projectRoot, 'assets', 'models');
const outDir = path.join(modelsDir, 'baked');

fs.mkdirSync(outDir, { recursive: true });

const defaultMaterial = new THREE.MeshStandardMaterial({
  color: 0xc8d2e0,
  metalness: 0.35,
  roughness: 0.45,
});

function basenameLower(p) {
  return (p.split('/').pop() ?? p).toLowerCase();
}

function buildCaseInsensitiveIndex(dir) {
  const map = new Map();
  for (const entry of fs.readdirSync(dir)) {
    map.set(entry.toLowerCase(), entry);
  }
  return map;
}

function loadStlFromDisk(absPath) {
  const buffer = fs.readFileSync(absPath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const geometry = new STLLoader().parse(arrayBuffer);
  return new THREE.Mesh(geometry, defaultMaterial.clone());
}

function loadDaeFromDisk(absPath) {
  const text = fs.readFileSync(absPath, 'utf-8');
  const baseDir = path.dirname(absPath) + '/';
  const collada = new ColladaLoader().parse(text, baseDir);
  return collada.scene;
}

function makeMeshLoader(meshDir) {
  const fileIndex = buildCaseInsensitiveIndex(meshDir);
  return (filePath, _manager, done) => {
    const baseLower = basenameLower(filePath);
    const realName = fileIndex.get(baseLower);
    if (!realName) {
      done(new THREE.Object3D());
      return;
    }
    const localPath = path.join(meshDir, realName);
    try {
      if (baseLower.endsWith('.stl')) {
        done(loadStlFromDisk(localPath));
      } else if (baseLower.endsWith('.dae')) {
        done(loadDaeFromDisk(localPath));
      } else {
        done(new THREE.Object3D());
      }
    } catch (err) {
      done(new THREE.Object3D(), err);
    }
  };
}

async function bakeUrdfToGlb({ urdfFile, meshDir, outFile, label }) {
  console.log(`Baking ${label}...`);
  const urdfText = fs.readFileSync(urdfFile, 'utf-8');
  const loader = new URDFLoader();
  loader.loadMeshCb = makeMeshLoader(meshDir);
  // parse() runs loadMeshCb synchronously here (we use sync fs reads), so by the
  // time parse returns every <link> already has its geometry attached.
  const robot = loader.parse(urdfText);
  // URDF/ROS uses Z-up; rotate once so consumers (Cesium and three.js) get Y-up.
  const root = new THREE.Group();
  root.add(robot);
  robot.rotation.x = -Math.PI / 2;

  const exporter = new GLTFExporter();
  const arrayBuffer = await new Promise((resolve, reject) => {
    exporter.parse(root, resolve, reject, { binary: true });
  });
  const data = Buffer.from(arrayBuffer);
  fs.writeFileSync(outFile, data);
  const sizeMB = (data.byteLength / 1024 / 1024).toFixed(2);
  console.log(`  wrote ${path.relative(projectRoot, outFile)} (${sizeMB} MB)`);
}

await bakeUrdfToGlb({
  label: 'Unitree G1 29DoF humanoid',
  urdfFile: path.join(modelsDir, 'unitree_g1', 'g1_29dof.urdf'),
  meshDir: path.join(modelsDir, 'unitree_g1'),
  outFile: path.join(outDir, 'unitree_g1.glb'),
});

await bakeUrdfToGlb({
  label: 'Unitree Go2 quadruped',
  urdfFile: path.join(modelsDir, 'unitree_go2', 'go2_description.urdf'),
  meshDir: path.join(modelsDir, 'unitree_go2'),
  outFile: path.join(outDir, 'unitree_go2.glb'),
});

console.log('Done.');
