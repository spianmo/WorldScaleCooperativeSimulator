# 完成审计

## 1. 本轮目标

用户本轮目标：

> UI 设计不符合 `DESIGN.md` 规范，需要修改实现；浅色/暗色主题切换无效，需要修复；生成的物理世界要连续，并以数字孪生城市场景为目标。

拆成验收标准：

1. UI 对齐 `DESIGN.md` 的 Apple 风格：纯色画布、弱 chrome、单一 Action Blue、少装饰、少阴影、不用深色渐变做默认界面。
2. 浅色/暗色主题切换真实影响 DOM 和 computed style，不只改 React state。
3. 世界生成不再是随机散点，而是连续的城市数字孪生：路网、街区建筑、开放空间、城市中枢、能源节点有空间关系。
4. Rust/Tauri 路径和浏览器 preview fallback 路径都覆盖上述世界生成语义。
5. 通过真实命令和 Playwright 验证。

## 2. Prompt 到产物清单

| 明确要求 | 证据 |
| --- | --- |
| 遵循 `DESIGN.md` | `theme.css:1-180` 使用 Apple 色板和组件 token；窗口层统一使用 `sim-page`、`sim-panel`、`sim-chip`、`sim-primary-button` |
| 去掉旧深色渐变默认 UI | `rg -n "linear-gradient|radial-gradient|#04070c|#f5f8fd|rgba\\(245|borderRadius: 18|chipStyle|panelStyle|fieldStyle|primaryButtonStyle" src/windows src/components src/styles` 无输出 |
| 浅/暗主题切换生效 | `App.tsx:23-26` 写入 `html[data-theme]`；`theme.css:1-92` 定义 light/dark 变量 |
| 主题设置持久化路径 | `SimulationProvider.tsx:125-160` 调用 `invokeUpdateAppSettings`；`simulation.ts:569-579` 发送 `update_settings` patch |
| 浏览器 fallback 支持主题 patch | `browserFallback.ts:461-512` 处理 `theme`、`language`、`auto_save`、`default_tick_seconds`、`log_level` |
| 生成世界连续 | `simulation.rs:260-374` 先生成连续道路网，再布置街区建筑、开放空间、城市中枢和能源补给站 |
| 浏览器 fallback 世界连续 | `browserFallback.ts:119-228` 生成连续城市路网、街区建筑、开放空间、中枢和能源节点 |
| 3D 渲染连续城市 | `WorldScene.tsx:39-78` 根据 road/building/landmark 做比例映射和材质渲染 |
| 仍保留数字孪生场景语义 | 生成对象包含 `urban_grid`、`continuous`、`digital_twin`、`digital_twin_core` tags |
| 真实验证 | 下方命令与 Playwright 输出 |

## 3. 关键修改

- `theme.css`：补充 `--sim-color-page`、`--sim-color-panel`、`--sim-color-chip`、`--sim-color-field`、图表/场景/危险色 token，并新增 `sim-page`、`sim-panel`、`sim-chip`、`sim-field`、`sim-primary-button`、`sim-row`。
- `App.tsx`：路由渲染时把 `state.settings.theme.mode` 写入 `document.documentElement.dataset.theme`，把 locale 写入 `lang`。
- `SimulationProvider.tsx` / `simulation.ts` / `browserFallback.ts`：主题、语言、设置通过 `update_settings` 真实进入 Tauri/fallback 状态。
- `Toolbar.tsx`、`IconButton.tsx`、`TelemetryChart.tsx`、`TerminalLog.tsx`、各窗口：去掉旧深色渐变和玻璃风格，改成 Apple 风格纯色画布和弱边线。
- `simulation.rs`：Rust 生成逻辑从随机散点改成连续城市路网和街区。
- `browserFallback.ts`：preview 生成逻辑同步为连续城市数字孪生。
- `WorldScene.tsx`：道路、建筑、地标按城市场景比例映射，避免散点观感。

## 4. 验证命令

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
npm run build
```

结果：通过，退出码 `0`。输出包含：

- `dist/index.html`
- `dist/static/css/index.dec05fcd.css`
- `dist/static/js/index.2aac101a.js`
- `dist/static/assets/RobotExpressive.f9a96d7c.glb`

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

结果：通过，退出码 `0`，输出 `Finished dev profile`。

```bash
rg -n "sk-fhie|Authorization|Bearer" . \
  -g '!node_modules/**' \
  -g '!dist/**' \
  -g '!src-tauri/target/**' \
  -g '!COMPLETION_AUDIT.md'
```

结果：无输出，`rg` 退出码 `1`，表示没有命中。

```bash
rg -n "linear-gradient|radial-gradient|#04070c|#f5f8fd|rgba\\(245|borderRadius: 18|chipStyle|panelStyle|fieldStyle|primaryButtonStyle" \
  src/windows src/components src/styles
```

结果：无输出，`rg` 退出码 `1`，窗口和公共组件没有旧深色渐变/旧大圆角卡片命名残留。

## 5. Playwright 验证

preview 启动：

```bash
npm run preview
```

`1420` 被占用，Rsbuild 自动使用：

```text
http://127.0.0.1:1424/
```

主题与城市生成检查：

```bash
node /private/tmp/worldsim-ui-check.mjs
```

关键输出：

```json
{
  "initial": {
    "theme": "system",
    "bodyBg": "rgb(255, 255, 255)",
    "bodyColor": "rgb(29, 29, 31)",
    "hasCanvas": true,
    "canvasCssSize": { "width": 788, "height": 498 },
    "panelRadius": "0px",
    "hasCityTwinChip": true
  },
  "afterLight": {
    "theme": "light",
    "pageBg": "rgb(245, 245, 247)",
    "textColor": "rgb(29, 29, 31)"
  },
  "afterDark": {
    "theme": "dark",
    "pageBg": "rgb(0, 0, 0)",
    "textColor": "rgb(245, 247, 250)"
  },
  "generatedWorld": {
    "description": "浏览器 fallback 生成的连续城市场景数字孪生世界。",
    "objectCount": 64,
    "roads": 14,
    "buildings": 36,
    "continuousTagged": 14,
    "landmarkNames": ["城市数字孪生中枢"]
  },
  "badResponses": []
}
```

截图验证：

```bash
npx --cache /private/tmp/worldsim-npm-cache --yes playwright screenshot \
  --wait-for-timeout=5000 \
  http://127.0.0.1:1424/#/world \
  /private/tmp/worldsim-city-light-1424.png
```

结果：通过，生成 `/private/tmp/worldsim-city-light-1424.png`。

```bash
npx --cache /private/tmp/worldsim-npm-cache --yes playwright screenshot \
  --viewport-size=390,844 \
  --wait-for-timeout=5000 \
  http://127.0.0.1:1424/#/world \
  /private/tmp/worldsim-city-mobile-1424.png
```

结果：通过，生成 `/private/tmp/worldsim-city-mobile-1424.png`。

## 6. 残余风险

- 设备模型资产仍只有人形机器人是真实 glb；无人机、轮式、四足仍是程序化几何体代理。
- Playwright 检查覆盖 web preview；Tauri 原生多窗口逐窗口视觉回归没有单独跑。
- 主题切换已验证当前页面 computed style；如果未来新增窗口继续硬编码颜色，需要继续改为 token。

---

## 7. 多窗口交互与设置修复审计

### 7.1 本轮目标

用户本轮目标：

> 去除 Leva 表单；修复浅色/暗色多窗口不同步；所有溢出滚动容器处理 overflow；创建世界和创建智能终端设备改为新增 Dialog 独立窗口；新建窗口不再计算位置；icon 按钮补 hover tips；修复设置项不生效、不响应。

拆成验收标准：

1. `src`、`package.json`、`package-lock.json` 不再包含 `Leva/useControls/leva`。
2. 创建世界、创建设备都有独立窗口路由。
3. 窗口打开不再传入或使用 `x/y/center` 位置计算。
4. 多窗口主题变化通过共享状态同步。
5. 所有主窗口在桌面与移动视口没有横向溢出。
6. 图标按钮 hover/focus 有可见 tooltip。
7. 设置页按钮都有真实响应，设置项写入状态或日志。

### 7.2 关键修改

- `WorldWindow.tsx`：移除 Leva，创建世界按钮改为打开 `#/create-world`；场景位置使用首个设备 telemetry。
- `DeviceWindow.tsx`：移除 Leva，设备局部场景使用设备 telemetry。
- `GlassesWindow.tsx`：移除 Leva，眼镜预览使用固定 gaze 默认值。
- `CreateWorldWindow.tsx`：新增世界创建独立窗口，提交 `GenerateWorldInput`。
- `CreateDeviceWindow.tsx` / `deviceFormUtils.ts`：新增智能终端设备创建独立窗口，复用设备 profile 生成逻辑。
- `ControlWindow.tsx`：移除内嵌创建设备表单，新增设备按钮只打开独立窗口。
- `openSimulatorWindow.ts`：browser features 仅保留 `width/height/noopener/noreferrer`；Tauri `WebviewWindow` 不再传 `x/y/center`。
- `SimulationProvider.tsx`：增加 `storage`、`focus`、`visibilitychange` 同步；统一补齐 `resolvedMode`。
- `App.tsx`：写入 `html[data-theme] = settings.theme.resolvedMode` 与 `html[data-log-density]`。
- `IconButton.tsx` / `theme.css`：新增 `.sim-icon-tooltip`，hover/focus 后显示。
- `SettingsWindow.tsx`：把设置项改成配置对象，逐项接入 `setThemeMode`、`setLocale`、`setSettings`、`setWorld`、`saveWorldSnapshot`、`appendLog`。
- `WorldScene.tsx`：新增 `showAxes`，受 `world.coordinateSystemVisible` 控制。
- `TerminalLog.tsx` / `theme.css`：日志密度通过 CSS 变量生效。
- `simulation.ts`、`browserFallback.ts`、`models.rs`、`simulation.rs`：设置 patch 增加 `terminal_log_density`。

### 7.3 验证命令

```bash
npm uninstall leva
```

结果：通过。关键输出：

```text
removed 65 packages
found 0 vulnerabilities
```

```bash
npm run typecheck
```

结果：通过，`tsc --noEmit` 退出码 `0`。

```bash
npm run build
```

结果：通过。关键输出：

```text
ready   built in 0.41 s
dist/index.html
dist/static/css/index.bc3caccb.css
dist/static/js/index.04356e1a.js
```

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

结果：通过。关键输出：

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.19s
```

```bash
rg -n "Leva|useControls|from 'leva'|<Leva|\"leva\"|node_modules/leva|left=|top=|options\\.x|options\\.y|options\\.center|center\\(" src package.json package-lock.json
```

结果：无输出，`rg` 退出码 `1`，表示无 Leva 和窗口位置计算残留。

### 7.4 Playwright Chromium 验证

preview 启动：

```bash
npx rsbuild preview --host 127.0.0.1 --port 1431
```

关键输出：

```text
Local:    http://127.0.0.1:1431/
```

Chromium 可启动验证：

```bash
NODE_PATH=$HOME/.npm/_npx/420ff84f11983ee5/node_modules node
```

关键输出：

```text
chromium launched
```

桌面 smoke 关键输出：

```text
visible: world toolbar chip
visible: settings shortcut panel
theme synced: dark
visible: create world form
visible: create world status
visible: create device form
visible: create device status
visible: icon tooltip
overflow ok: #/world 1280 1280
overflow ok: #/control 1280 1280
overflow ok: #/settings 1280 1280
overflow ok: #/create-world 1280 1280
overflow ok: #/create-device 1280 1280
```

移动视口 overflow 关键输出：

```text
mobile overflow ok: #/world 390 390
mobile overflow ok: #/control 390 390
mobile overflow ok: #/settings 390 390
mobile overflow ok: #/create-world 390 390
mobile overflow ok: #/create-device 390 390
```

### 7.5 残余风险

- 本轮 Playwright 覆盖 web preview；Tauri 原生窗口管理路径已通过 `cargo check` 和源码检查，但未启动 Tauri GUI 做人工视觉回归。
- Playwright 临时尝试生成了 `tmp-playwright/` 与 `test-results/`，未删除；项目规范要求删除文件/目录前先确认。

---

## 8. 物理真实性与 agentic 网关复审

### 8.1 本轮目标

用户本轮目标：

> 对齐原始需求，把仿真升级为更真实的城市级物理空间、真实纹理/模型、天气物理、LLM/agentic 智能决策网关、异构终端实时任务下发与物理移动动画、设备第一视角相机。

拆成验收标准：

1. 3D 城市不能继续依赖白模地面、白模建筑和占位纹理。
2. Unitree G1/Go2 资产口径必须真实，不能把小体积根 USD 误写成完整模型。
3. 天气要影响物理仿真，不只是 UI 文案。
4. LLM agents 网关必须是主决策入口，未配置 LLM 时明确阻塞，不偷偷回退关键词规则。
5. 设备终端窗口要用设备在虚拟世界中的第一视角相机。
6. 世界、设备、眼镜窗口都要使用同一套天气和物理空间渲染。
7. 通过真实命令验证。

### 8.2 关键修改

- `WorldScene.tsx`：接入 Poly Haven 沥青、混凝土、草地/岩石纹理；新增天气层；新增 Unitree G1 核心全身 STL 运行时加载；新增 Unitree Go2 官方 DAE 部件组合加载；修复条件分支内 React hook 违规。
- `Scene.tsx`：新增 `cameraTarget` 和 `cameraMode`；`first_person` 模式下设置相机位置和朝向，并禁用 OrbitControls。
- `WorldWindow.tsx` / `DeviceWindow.tsx` / `GlassesWindow.tsx`：统一传入 `state.world.terrain`；设备窗口按 telemetry 计算第一视角；眼镜窗口按人的朝向渲染第一视角。
- `SimulationProvider.tsx`：在 hydration 后检测 active task，按 `settings.tickIntervalMs` 自动调用 `tickSimulation(1)`，让眼镜目标下发后终端持续移动/飞行。
- `simulation.rs`：新增 `Stormy`，`simulate_tick` 按天气速度倍率、风速漂移和任务优先级推进设备位置与朝向。
- `browserFallback.ts`：浏览器 preview 同步生成 `windy` / `stormy` 天气，并按摩擦、风速、任务状态推进设备。
- `simulation.ts` / `rust-state.ts`：前端状态增加 `precipitationMmH`、`windMps`、`visibilityM`、`surfaceFrictionScale`，Rust 状态映射补齐天气物理参数。
- `assets/models/manifest.json` / `README.md`：修正 Unitree USD/USDZ 只是根引用资产；新增 Go2 DAE runtime parts；G1 runtime parts 扩展到核心全身 STL；记录包体和未含手部/传感器边界。
- `assets/textures/manifest.json` / `README.md`：新增 Poly Haven `concrete_polyhaven_1k.jpg` 与 `grass_rock_polyhaven_1k.jpg`，记录 CC0 来源和用途。

### 8.3 当前资产取证

```bash
file assets/models/unitree_go2/*.dae assets/models/unitree_go2/go2_description.urdf \
  assets/models/unitree_g1/*.STL assets/models/unitree_g1/g1_29dof.urdf
```

关键输出：

```text
assets/models/unitree_go2/base.dae:             COLLADA model, XML document
assets/models/unitree_go2/hip.dae:              COLLADA model, XML document
assets/models/unitree_go2/thigh.dae:            COLLADA model, XML document
assets/models/unitree_go2/thigh_mirror.dae:     COLLADA model, XML document
assets/models/unitree_go2/calf.dae:             COLLADA model, XML document
assets/models/unitree_go2/calf_mirror.dae:      COLLADA model, XML document
assets/models/unitree_go2/foot.dae:             COLLADA model, XML document
assets/models/unitree_go2/go2_description.urdf: XML 1.0 document text, Unicode text, UTF-8 text
assets/models/unitree_g1/torso_link.STL:        data
assets/models/unitree_g1/head_link.STL:         data
assets/models/unitree_g1/pelvis.STL:            data
assets/models/unitree_g1/g1_29dof.urdf:         exported SGML document text, ASCII text
```

```bash
du -ch assets/models/unitree_go2/* assets/models/unitree_g1/*
```

关键输出：

```text
11M  assets/models/unitree_go2/base.dae
5.0M assets/models/unitree_go2/hip.dae
4.0M assets/models/unitree_go2/thigh.dae
4.0M assets/models/unitree_go2/thigh_mirror.dae
2.1M assets/models/unitree_go2/calf.dae
2.0M assets/models/unitree_go2/calf_mirror.dae
496K assets/models/unitree_go2/foot.dae
2.1M assets/models/unitree_g1/torso_link.STL
1.1M assets/models/unitree_g1/pelvis.STL
912K assets/models/unitree_g1/head_link.STL
40M  total
```

### 8.4 验证命令

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
npm run build
```

结果：通过，退出码 `0`。关键输出包含：

```text
dist/static/assets/base.0537bc4d.dae                     10727.4 kB
dist/static/assets/hip.7c086190.dae                      4666.4 kB
dist/static/assets/thigh.09404d47.dae                    3884.1 kB
dist/static/assets/thigh_mirror.dd59c03d.dae             3896.6 kB
dist/static/assets/calf.9bbb5186.dae                     1125.5 kB
dist/static/assets/calf_mirror.c2bee53e.dae              1125.5 kB
dist/static/assets/foot.d3baf8db.dae                     507.0 kB
dist/static/assets/torso_link.ec3804e1.STL               2233.0 kB
dist/static/assets/pelvis.0c2419ff.STL                   1060.9 kB
Total:                                                   40736.4 kB
```

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

结果：通过，退出码 `0`。关键输出：

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.46s
```

### 8.5 Playwright 视觉验证

preview 启动：

```bash
npx rsbuild preview --host 127.0.0.1 --port 1439
```

关键输出：

```text
Local:    http://127.0.0.1:1439/
```

Playwright 检查：

```bash
NODE_PATH=$HOME/.npm/_npx/420ff84f11983ee5/node_modules node
```

覆盖页面：

- `/#/world` 真实模型风暴世界截图：`/private/tmp/worldsim-stage8-fullmodels-v3/world-real-models-v3.png`
- `/#/glasses` 目标下发与自动 tick 截图：`/private/tmp/worldsim-stage8-fullmodels-v3/state-glasses-auto-tick-v2.png`
- `/#/device/audit-go2` Go2 第一视角截图：`/private/tmp/worldsim-stage8-fullmodels-v3/go2-first-person-real-dae-v3.png`
- `/#/device/audit-g1` G1 第一视角截图：`/private/tmp/worldsim-stage8-fullmodels-v3/g1-first-person-real-stl-v3.png`
- 状态级输出：`/private/tmp/worldsim-stage8-fullmodels-v3/state-auto-tick-summary-v2.json`
- 视觉错误输出：`/private/tmp/worldsim-stage8-fullmodels-v3/model-visual-summary-v3.json`

结果：

- Playwright 能启动 Chromium、加载页面、找到 canvas。
- `model-visual-summary-v3.json` 记录 `errors=[]`、`consoleErrors=[]`。
- `state-auto-tick-summary-v2.json` 记录 `errors=[]`、`consoleErrors=[]`。
- 眼镜目标下发后，browser fallback 生成 3 个 agents 任务：`intent_agent`、`dispatch_agent`、`safety_agent`。
- 自动 tick 从 `step=0` 推进到 `step=6`，3 个任务进度均到 `0.94`。
- Go2 从 `[50,0,50]` 到 `[52.57,0,53.38]`，`speedAfter=2.035`，`moved=true`。
- G1 从 `[52,0,50]` 到 `[51.43,0,49.11]`，`speedAfter=0.77`，`moved=true`。
- Drone 从 `[50,12,52]` 到 `[60.34,12,43.28]`，`speedAfter=6.352941176470589`，`moved=true`。

### 8.6 残余风险

- Go2 官方 DAE 已 vendored 并接入运行时，但当前是部件组合和轻量步态动画，不是 URDF 关节动力学、碰撞体或控制器仿真。
- G1 已接入核心全身 STL，但未包含完整手指、手掌和小型传感器外壳。
- Go2/G1 模型资源让 web bundle 增加到约 `40.7MB`，后续若要生产分发，需要做懒加载或资源拆包。
- Tauri 原生多窗口视觉回归未单独启动验证；本轮视觉验证覆盖 web preview。

---

## 9. 现代建筑纹理、设备外壳贴图与 tick 平滑动画复审

### 9.1 本轮目标

用户本轮目标：

> 机器人和无人机都没有纹理贴图；建筑物纹理错误，需要现代建筑大楼纹理；模拟推进 tick 不流畅，需要做好移动过渡动画。

拆成验收标准：

1. 建筑运行时材质不再使用混凝土贴图作为主外立面。
2. G1 / Go2 / drone 可见外壳都要有贴图路径，不能依赖纯色白模。
3. 离散 tick 位置更新后，渲染层要做连续过渡，不直接瞬移。
4. 资产来源、许可证、用途写入 manifest / README。
5. 通过真实命令和浏览器截图验证。

### 9.2 关键修改

- `WorldScene.tsx`：新增 `createDeviceSkinTexture()` / `getDeviceSkinTexture()`，为 G1、Go2、无人机生成带型号标识和条纹的程序化外壳贴图。
- `WorldScene.tsx`：新增 `createModernWindowGridTexture()`，在建筑主体外再叠加一层透明窗格纹理。
- `WorldScene.tsx`：`useMaterialLibrary()` 接入 `facade001_glass_color_1k.jpg`，建筑主体材质改为现代玻璃幕墙贴图。
- `WorldScene.tsx`：新增 `createProjectedUvGeometry()`，给 G1 STL 克隆几何补投影 UV，使 `MeshStandardMaterial.map` 能实际显示。
- `WorldScene.tsx`：`configureModelMaterials()` 对 Go2 DAE 和 drone GLB 中没有 `material.map` 的材质补设备外壳贴图。
- `WorldScene.tsx`：新增 `AnimatedDeviceGroup()`，用 `useFrame()` 对设备 group 的 `position` 和 `rotation` 做插值追踪，避免 tick 离散状态直接跳帧。
- `WorldWindow.tsx` / `DeviceWindow.tsx` / `GlassesWindow.tsx`：把 `state.settings.tickIntervalMs` 传入 `WorldScene`，平滑动画和真实设置保持一致。
- `assets/textures/manifest.json` / `README.md`：新增 ambientCG Facade001 和 Poly Haven rectangular facade 资源登记；AO 贴图保留为备选立面资源随附贴图，当前未接入运行时材质。

### 9.3 当前资产取证

```bash
file assets/textures/facade001_glass_color_1k.jpg \
  assets/textures/rectangular_facade_tiles_diff_1k.jpg \
  assets/textures/rectangular_facade_tiles_ao_1k.jpg
```

关键输出：

```text
assets/textures/facade001_glass_color_1k.jpg:         JPEG image data, ... 1024x1024, components 3
assets/textures/rectangular_facade_tiles_diff_1k.jpg: JPEG image data, ... 1024x1024, components 3
assets/textures/rectangular_facade_tiles_ao_1k.jpg:   JPEG image data, ... 1024x1024, components 1
```

```bash
node -e "JSON.parse(require('fs').readFileSync('assets/textures/manifest.json','utf8')); console.log('textures manifest ok')"
```

结果：

```text
textures manifest ok
```

### 9.4 验证命令

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
npm run build
```

结果：通过，退出码 `0`。关键输出包含：

```text
dist/static/image/facade001_glass_color_1k.39c0bccc.jpg     511.2 kB
Total:                                                     41248.3 kB
```

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

结果：通过，退出码 `0`。关键输出：

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.51s
```

```bash
git diff --check
```

结果：无输出，退出码 `0`。

### 9.5 Playwright 视觉验证

preview 启动：

```bash
npx rsbuild preview --host 127.0.0.1 --port 1440
```

关键输出：

```text
Local:    http://127.0.0.1:1440/
```

Playwright 检查：

```bash
NODE_PATH=$HOME/.npm/_npx/420ff84f11983ee5/node_modules node
```

覆盖页面：

- `/#/world` 现代建筑与多设备截图：`/private/tmp/worldsim-texture-smooth/world-modern-facade-textured-devices.png`
- `/#/device/audit-go2` Go2 第一视角截图：`/private/tmp/worldsim-texture-smooth/go2-textured-first-person.png`
- `/#/device/audit-g1` G1 第一视角截图：`/private/tmp/worldsim-texture-smooth/g1-textured-first-person.png`
- 状态和错误摘要：`/private/tmp/worldsim-texture-smooth/texture-smooth-summary.json`

结果：

- Playwright 能启动 Chromium、加载页面、找到 canvas。
- `texture-smooth-summary.json` 记录 `errors=[]`、`consoleErrors=[]`。
- 自动 tick 从 `step=0` 推进到 `step=4`，`tickIntervalMs=500`。
- Go2 从 `[50,0,50]` 到 `[52.92,0,53.15]`，`speed=2.2`，`moved=true`。
- G1 从 `[52,0,50]` 到 `[50.77,0,47.56]`，`speed=1.4`，`moved=true`。
- Drone 从 `[50,12,52]` 到 `[54.99,12,73.53]`，`speed=11.470588235294118`，`moved=true`。

### 9.6 残余风险

- G1 的贴图是基于 STL 投影 UV 的运行时贴图，不是官方 UV / PBR 完整材质。
- Go2 / drone 的贴图补全只覆盖无 `material.map` 的材质，保留原模型已存在贴图和材质属性。
- tick 平滑是渲染层插值追踪目标位置；仿真状态本身仍按离散 tick 推进。
- Poly Haven `rectangular_facade_tiles_ao_1k.jpg` 当前只作为备选立面资源登记，未接入运行时材质。
- Tauri 原生多窗口视觉回归未单独启动验证；本轮视觉验证覆盖 web preview。

---

## 10. 设备工作动画、设置窗口与终端日志复审

### 10.1 本轮目标

用户本轮目标：

1. 无人机、机器人、机器狗需要具体工作动画，例如四肢移动、螺旋桨运作。
2. 设置窗口重构，多选选项不能只靠一个切换按钮承载。
3. 设置项列表不能溢出显示。
4. 项目全局终端日志默认自动滚动到底部。
5. 终端日志操作按钮 icon 有歧义，需要加 tips。

### 10.2 关键修改

- `WorldScene.tsx`：`DroneModel()` 新增 4 个旋翼组，`useFrame()` 按 `speedMps` 持续旋转，并加入轻微机身姿态补偿。
- `WorldScene.tsx`：`UnitreeG1Model()` 用 `useFrame()` 驱动 G1 躯干、头部、腿部和手臂关键 STL 部件，替换原来的 render-time `Date.now()` 静态相位。
- `WorldScene.tsx`：`UnitreeGo2Model()` 用 `useFrame()` 驱动四足对角步态，FL/RR 同相、FR/RL 反相。
- `WorldScene.tsx`：`DeviceProxyBody()` 为 fallback 设备补无人机旋翼、机器狗腿部、人形摆臂迈腿和轮式车轮旋转。
- `SettingsWindow.tsx`：新增 `OptionGroup()`，主题、语言、日志密度、tick 间隔、日志级别改为可见分段选项组，不再由单个“切换”按钮循环。
- `tailwind.css`：新增 `.sim-segmented-control` / `.sim-segmented-option` / `.sim-setting-row`，允许设置项控制区换行，避免列表内容横向溢出。
- `TerminalLog.tsx`：自动滚动默认开启，并在日志数组渲染后用 `requestAnimationFrame()` 再次滚到底部。
- `TerminalLog.tsx` / `tailwind.css`：日志自动滚动和滚到底部按钮新增 hover / focus tooltip。
- `resources.ts`：补充设置窗口新选项与按钮文案。

### 10.3 验证命令

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
npm run build
```

结果：通过，退出码 `0`。关键输出：

```text
dist/static/css/index.a61481ff.css 37.6 kB
dist/static/js/index.1646c350.js   128.4 kB
Total:                             41256.7 kB
```

### 10.4 Playwright 验证

preview 启动：

```bash
npx rsbuild preview --host 127.0.0.1 --port 1442
```

覆盖页面：

- 设置窗口桌面截图：`/private/tmp/worldsim-settings-animation-qa/settings-desktop-rerun.png`
- 设置窗口移动截图：`/private/tmp/worldsim-settings-animation-qa/settings-mobile-rerun.png`
- 工作动画截图：`/private/tmp/worldsim-settings-animation-qa/world-working-animation-rerun.png`
- 验证摘要：`/private/tmp/worldsim-settings-animation-qa/summary-rerun.json`

关键输出：

```json
{
  "errors": [],
  "consoleErrors": [],
  "desktopMetrics": {
    "bodyScrollWidth": 1280,
    "docClientWidth": 1280,
    "segmentedCount": 5,
    "clippedRows": 0
  },
  "mobileMetrics": {
    "bodyScrollWidth": 390,
    "docClientWidth": 390,
    "clippedRows": 0
  },
  "terminalMetrics": {
    "atBottom": true,
    "tooltipVisibleAfterHover": true
  },
  "animationByteDiffSamples": 4353
}
```

### 10.5 残余风险

- G1 / Go2 当前是基于已接入几何部件的轻量工作动画，不是 URDF 关节控制器、逆运动学或物理碰撞仿真。
- Playwright 覆盖 web preview；Tauri 原生多窗口视觉回归未单独启动验证。
