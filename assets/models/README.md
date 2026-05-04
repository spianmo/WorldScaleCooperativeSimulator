# 模型资源

该目录放置前端场景使用的真实机器人与无人机 3D 资源。

当前资源记录在 `manifest.json`：

- `dji_mavic`：来自 `thedylone/unity-drone-simulator` 的 DJI Mavic FBX，已用 `assimp export Mavic.fbx DJI_Mavic.glb -f glb2` 转为 GLB，用于无人机设备。
- `unitree_go2_quadruped`：来自 Unitree 官方 `unitree_model` 的 Go2 USD 根资产。当前 `Unitree_Go2.usd/usdz` 只有约 1.6KB/3.7KB，是根引用资产，不是完整运行时可渲染机器狗网格。
- `unitree_go2_dae_runtime_parts`：来自 Unitree 官方 `unitree_ros` 的 Go2 DAE 运行时部件，包含 `base/hip/thigh/calf/foot` 和 `go2_description.urdf`，运行时由 `WorldScene` 通过 `ColladaLoader` 组合成四足机器狗主路径。
- `unitree_g1_humanoid`：来自 Unitree 官方 `unitree_model` 的 G1 29DoF USD 根资产。当前 `Unitree_G1_29dof.usd/usdz` 只有约 1.6KB/3.8KB，是根引用资产，不是完整运行时可渲染人形机器人网格。
- `unitree_g1_stl_runtime_parts`：来自 Unitree 官方 `unitree_ros` 的 G1 STL 运行时部件，包含 pelvis、waist、torso、head、logo、主要腿部关节和主要手臂关节，运行时由 `WorldScene` 通过 `STLLoader` 加载，用于人形机器人主路径。
- `parrot_bebop_reference`：来自 `thedylone/unity-drone-simulator` 的 Parrot Bebop GLB，作为额外真实无人机资源留档。

许可证文件：

- `UNITY_DRONE_SIMULATOR_LICENSE.txt`：DJI Mavic / Parrot Bebop 来源仓 MIT License。
- `UNITREE_MODEL_LICENSE.txt`：Unitree 官方模型仓 BSD-3-Clause License。

说明：

- `Unitree_Go2.usd` 与 `Unitree_G1_29dof.usd` 是官方根 USD。它们体积很小，不能当作完整模型包描述为“可渲染资源”。
- Go2 运行时已接入官方 DAE 部件，当前 Go2 目录约 25MB，`file assets/models/unitree_go2/*.dae` 识别为 `COLLADA model, XML document`。
- G1 运行时已从 torso/head 扩展到核心全身部件，当前仍未包含手指、手掌和小型传感器外壳；这是包体控制下的明确边界。
- 当前动画是 mesh 姿态/步态动画，不是 URDF 关节动力学、碰撞体或控制器仿真。
