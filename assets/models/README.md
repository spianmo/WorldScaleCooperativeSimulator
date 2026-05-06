# 模型资源

该目录放置前端场景使用的真实机器人与无人机 3D 资源。

当前资源记录在 `manifest.json`：

- `dji_mavic`：来自 `thedylone/unity-drone-simulator` 的 DJI Mavic FBX，已用 `assimp export Mavic.fbx DJI_Mavic.glb -f glb2` 转为 GLB，用于无人机设备。
- `unitree_go2_quadruped`：来自 Unitree 官方 `unitree_model` 的 Go2 USD 根资产。当前 `Unitree_Go2.usd/usdz` 只有约 1.6KB/3.7KB，是根引用资产，不是完整运行时可渲染机器狗网格。
- `unitree_go2_dae_runtime_parts`：来自 Unitree 官方 `unitree_ros` 的 Go2 DAE 运行时部件，包含 `base/hip/thigh/calf/foot` 和 `go2_description.urdf`，运行时由 `DeviceModelPreview` 通过 `urdf-loader` + `ColladaLoader` 按 URDF 关节层级组装出完整四足机器狗。
- `unitree_g1_humanoid`：来自 Unitree 官方 `unitree_model` 的 G1 29DoF USD 根资产。当前 `Unitree_G1_29dof.usd/usdz` 只有约 1.6KB/3.8KB，是根引用资产，不是完整运行时可渲染人形机器人网格。
- `unitree_g1_stl_runtime_parts`：来自 Unitree 官方 `unitree_ros` 的 G1 STL 运行时部件，包含 pelvis、waist、torso、head、logo、主要腿部关节和主要手臂关节，运行时由 `DeviceModelPreview` 通过 `urdf-loader` + `STLLoader` 按 `g1_29dof.urdf` 组装；缺失的 contour link 等通过 `loadMeshCb` 静默跳过。
- `unitree_g1_baked_glb` / `unitree_go2_baked_glb`：通过 `npm run bake:models`（脚本 `scripts/bake-urdf-to-glb.mjs`）把上述 URDF + STL/DAE 离线烘焙为 `assets/models/baked/unitree_g1.glb`（约 15 MB）和 `assets/models/baked/unitree_go2.glb`（约 40 MB），供 `WorldScene` 在 Cesium `Entity.model` 中近距离渲染；远视距退化为 billboard 像素图标。
- `parrot_bebop_reference`：来自 `thedylone/unity-drone-simulator` 的 Parrot Bebop GLB，作为额外真实无人机资源留档。

许可证文件：

- `UNITY_DRONE_SIMULATOR_LICENSE.txt`：DJI Mavic / Parrot Bebop 来源仓 MIT License。
- `UNITREE_MODEL_LICENSE.txt`：Unitree 官方模型仓 BSD-3-Clause License。

说明：

- `Unitree_Go2.usd` 与 `Unitree_G1_29dof.usd` 是官方根 USD。它们体积很小，不能当作完整模型包描述为”可渲染资源”。
- Go2 运行时已接入官方 DAE 部件，当前 Go2 目录约 25MB，`file assets/models/unitree_go2/*.dae` 识别为 `COLLADA model, XML document`。
- G1 运行时已从 torso/head 扩展到核心全身部件，当前仍未包含手指、手掌和小型传感器外壳；这是包体控制下的明确边界。
- 当前动画是 mesh 姿态动画，不是 URDF 关节动力学、碰撞体或控制器仿真。
- `assets/models/baked/` 下的 GLB 是 `npm run bake:models` 的产物：脚本用 `urdf-loader` + `GLTFExporter` 把 URDF 关节层级烘焙为单文件 GLB，统一供 Cesium 使用。修改 URDF 或 mesh 部件后需重新执行该命令。
- `RobotExpressive.glb` 已从前端代码移除引用，仅作历史回滚保留；不在 `manifest.json` 的可渲染资产清单中。
