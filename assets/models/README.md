# 模型资源

该目录放置前端场景使用的真实机器人与无人机 3D 资源。

当前资源记录在 `manifest.json`：

- `dji_mavic`：来自 `thedylone/unity-drone-simulator` 的 DJI Mavic FBX，已用 `assimp export Mavic.fbx DJI_Mavic.glb -f glb2` 转为 GLB，用于无人机设备。
- `unitree_go2_quadruped`：来自 Unitree 官方 `unitree_model` 的 Go2 USD 根资产，并保留本地可渲染 USDZ 包，用于四足机器狗设备。
- `unitree_g1_humanoid`：来自 Unitree 官方 `unitree_model` 的 G1 29DoF USD 根资产，并保留本地可渲染 USDZ 包，用于人形机器人设备。
- `parrot_bebop_reference`：来自 `thedylone/unity-drone-simulator` 的 Parrot Bebop GLB，作为额外真实无人机资源留档。

许可证文件：

- `UNITY_DRONE_SIMULATOR_LICENSE.txt`：DJI Mavic / Parrot Bebop 来源仓 MIT License。
- `UNITREE_MODEL_LICENSE.txt`：Unitree 官方模型仓 BSD-3-Clause License。

说明：`Unitree_Go2.usd` 与 `Unitree_G1_29dof.usd` 是官方根 USD。Three.js `USDZLoader` 不能直接渲染只有外部 payload/reference 的根 USD，因此仓内同时保留 `Unitree_Go2.usdz` 与 `Unitree_G1_29dof.usdz` 作为运行时可加载资源。
