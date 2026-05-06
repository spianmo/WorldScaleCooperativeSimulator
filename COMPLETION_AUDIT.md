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
| 生成世界连续 | 历史证据已被第 11 节在线 OpenStreetMap 世界生成替换，不再保留本地连续城市生成 |
| 浏览器 fallback 世界连续 | 历史证据已被第 11 节在线 OpenStreetMap 世界生成替换，不再保留本地连续城市生成 |
| 3D 渲染连续城市 | `WorldScene.tsx:39-78` 根据 road/building/landmark 做比例映射和材质渲染 |
| 仍保留数字孪生场景语义 | 生成对象包含 `urban_grid`、`continuous`、`digital_twin`、`digital_twin_core` tags |
| 真实验证 | 下方命令与 Playwright 输出 |

## 3. 关键修改

- `theme.css`：补充 `--sim-color-page`、`--sim-color-panel`、`--sim-color-chip`、`--sim-color-field`、图表/场景/危险色 token，并新增 `sim-page`、`sim-panel`、`sim-chip`、`sim-field`、`sim-primary-button`、`sim-row`。
- `App.tsx`：路由渲染时把 `state.settings.theme.mode` 写入 `document.documentElement.dataset.theme`，把 locale 写入 `lang`。
- `SimulationProvider.tsx` / `simulation.ts` / `browserFallback.ts`：主题、语言、设置通过 `update_settings` 真实进入 Tauri/fallback 状态。
- `Toolbar.tsx`、`IconButton.tsx`、`TelemetryChart.tsx`、`TerminalLog.tsx`、各窗口：去掉旧深色渐变和玻璃风格，改成 Apple 风格纯色画布和弱边线。
- `simulation.rs`：Rust 生成逻辑曾从随机散点改成连续城市路网和街区；当前已由第 11 节替换为在线 OpenStreetMap 生成。
- `browserFallback.ts`：preview 生成逻辑曾同步为连续城市数字孪生；当前已由第 11 节替换为在线 OpenStreetMap 生成。
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
    "description": "历史验证输出：浏览器 fallback 当时生成连续城市场景数字孪生世界；当前实现已替换为在线 OpenStreetMap。",
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

## 11. 离线地图生成移除审计

### 11.1 本轮目标

用户本轮目标：

> 完全移除离线地图生成，只保留在线3D地图渠道。

拆成验收标准：

1. Rust/Tauri 世界创建不能再调用本地离线街区生成。
2. 浏览器 preview fallback 不能再程序化生成离线道路、建筑和街区。
3. 新建世界 UI 不能再提供离线地图、离线瓦片或关闭在线数据的入口。
4. 默认世界不能再用本地离线街区填充地图对象。
5. PRD/TASK 不能继续承诺离线地图兜底。
6. 在线 OpenStreetMap 拉取失败必须显式失败，而不是退回离线生成。

### 11.2 产物清单

| 明确要求 | 证据 |
| --- | --- |
| Rust 只保留在线渠道 | `simulation.rs#generate_world()` 校验数据源为 `OpenStreetMap`，随后调用 `fetch_osm_street_dataset(...)`；失败返回 `在线 OpenStreetMap 数据拉取失败` |
| 移除 Rust 离线地图函数 | 已删除 `build_offline_street_world(...)` 和对应单元测试 |
| Browser fallback 只走在线渠道 | `browserFallback.ts#createGeneratedWorld()` 调用 `fetchOsmWorldObjects(...)`；Nominatim/Overpass 失败直接 throw |
| UI 移除离线入口 | `CreateWorldWindow.tsx` 数据源固定 OpenStreetMap，已移除在线开关和 `Local Tiles` 选项 |
| 默认世界不生成离线街区 | `rust-state.ts#createDefaultWorldSnapshot()` 的 `objects: []`；`World::terminal_link_default()` 不再调用 `default_city_objects()` |
| 文档移除离线兜底 | `ProjectPRD.md` 明确网络、地理编码或 OSM 数据失败时不得生成本地街区替代数据 |

### 11.3 验证结果

```bash
rg -n "offline_simulation|offline_fallback|offline_demo|online_osm_requested|build_offline|use_online_osm|useOnlineOsm|Local Tiles|createDefaultCityObjects|default_city_objects|browser fallback uses procedural|offline fallback" src src-tauri ProjectPRD.md TASK.md COMPLETION_AUDIT.md --glob '!src-tauri/target/**' --glob '!node_modules/**'
```

结果：只有本节审计表中“已删除项”的说明命中，代码和 PRD/TASK 无离线地图生成入口残留。

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
npm run build
```

结果：通过，退出码 `0`，输出 `dist/index.html`、`dist/static/css/index.7a1906f8.css`、`dist/static/js/index.e16e7792.js` 等产物。

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

结果：通过，退出码 `0`，输出 `Finished dev profile`。

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

结果：通过，退出码 `0`；`simulation::tests::overpass_node_without_geometry_uses_lat_lon` 通过，`1 passed; 0 failed`。

```bash
npx rsbuild preview --host 127.0.0.1 --port 1448
```

Playwright 回归使用拦截的 Nominatim / Overpass 在线响应验证浏览器链路。关键输出：

```json
{
  "result": {
    "statusText": "已创建实景世界：解放路实景街区",
    "objectCount": 6,
    "metadata": {
      "data_source": "OpenStreetMap",
      "data_status": "online_osm",
      "building_count": "3",
      "road_count": "2",
      "poi_count": "1"
    },
    "sources": ["openstreetmap"],
    "offlineMentions": false
  },
  "requests": [
    {
      "url": "https://overpass-api.de/api/interpreter",
      "method": "POST",
      "bodyIncludesHighway": true
    }
  ],
  "consoleEntries": []
}
```

说明：本机直接访问 Nominatim 曾出现 20s 超时，因此未声明公网 OSM 实时服务可达；本轮验证覆盖的是前端只走在线接口、消费 OSM 响应并且不退回离线生成。

## 12. 创建世界 Dialog 视觉实现审计

### 12.1 本轮目标

用户本轮目标：

> 参考 Image #1 实现创建世界的 dialog。

拆成验收标准：

1. 创建世界入口要呈现为参考图同类的大尺寸白色 dialog，而不是旧页面表单。
2. Dialog 顶部要有 TerminalLink 品牌、标题、副标题和关闭按钮。
3. 主体要包含区域搜索/地图、世界设置、数据图层三块信息。
4. 底部要包含取消、步骤条、预览世界、创建世界。
5. 不能恢复离线地图、本地瓦片或关闭在线数据的入口；创建仍走在线 OpenStreetMap。
6. 桌面和移动视口不能出现横向溢出，移动端底部操作必须可滚动到达。

### 12.2 产物清单

| 明确要求 | 证据 |
| --- | --- |
| Dialog 结构 | `CreateWorldWindow.tsx` 使用 `.create-world-dialog` 和 `role="dialog"` 作为主容器 |
| 品牌与标题 | `CreateWorldWindow.tsx` 引入 `terminal-logo-mark.png`，渲染 `TerminalLink`、`新建世界` 和 OpenStreetMap 副标题 |
| 地图选择区 | `CreateWorldWindow.tsx` 引入 `terminal-map-reference.png`，提供搜索框、放大、缩小、定位、区域选择框、视图 tab 和地图指标 |
| 世界设置 | `CreateWorldWindow.tsx` 渲染世界名称、描述、坐标系、世界时间、地形数据源、环境预设和滑杆设置 |
| 数据图层 | `CreateWorldWindow.tsx` 渲染基础图层、语义图层、3D 增强和数据说明 |
| 在线创建链路 | `CreateWorldWindow.tsx#submit()` 组装 `data_source: 'OpenStreetMap'`，继续调用 `generateWorld(input)` |
| 桌面/移动布局 | `tailwind.css` 新增 `.create-world-dialog-*` 样式和 `@media (max-width: 960px)` 下的单列滚动布局 |

### 12.3 验证结果

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
npm run build
```

结果：通过，退出码 `0`。

```bash
git diff --check
```

结果：通过，退出码 `0`。

```bash
npx rsbuild preview --host 127.0.0.1 --port 1452
```

Playwright 回归访问 `http://127.0.0.1:1452/#/create-world`，截图输出到 `/private/tmp/worldsim-create-world-dialog-qa/`。关键输出：

```json
[
  {
    "viewport": { "name": "desktop", "width": 1536, "height": 1024 },
    "metrics": {
      "title": "新建世界",
      "hasDialogRole": true,
      "hasBrand": true,
      "hasSubtitle": true,
      "hasDataSourceField": true,
      "hasMapTools": true,
      "hasLayers": true,
      "hasFooterActions": true,
      "bodyScrollWidth": 1536,
      "docClientWidth": 1536,
      "footerVisible": true,
      "createButtonVisible": true
    },
    "consoleEntries": [],
    "badResponses": []
  },
  {
    "viewport": { "name": "mobile", "width": 390, "height": 844 },
    "metrics": {
      "title": "新建世界",
      "hasDialogRole": true,
      "hasBrand": true,
      "hasSubtitle": true,
      "hasDataSourceField": true,
      "hasMapTools": true,
      "hasLayers": true,
      "hasFooterActions": true,
      "bodyScrollWidth": 390,
      "docClientWidth": 390,
      "pageScrollTop": 2314,
      "pageScrollHeight": 3158,
      "pageClientHeight": 844,
      "footerVisible": true,
      "createButtonVisible": true
    },
    "consoleEntries": [],
    "badResponses": []
  }
]
```

说明：本轮只验证创建世界 dialog 的前端结构、响应式布局和在线创建入口保留；未触发真实公网 OpenStreetMap 请求。

---

## 13. Google Photorealistic 3D Tiles + CesiumJS 替换审计

### 13.1 本轮目标

用户本轮目标：

> 直接修改为 Google Photorealistic 3D Tiles + CesiumJS 实现，不要再使用 R3F 沙盘版本，不要保留对老模式的兼容。

拆成验收标准：

1. 中间虚拟空间渲染入口不再使用 R3F、Three、`Canvas` 或旧沙盘组件。
2. 新渲染入口直接使用 CesiumJS，并调用 `createGooglePhotorealistic3DTileset(...)` 加载 Google Photorealistic 3D Tiles。
3. 街道/POI/设备叠加继续落在同一个真实地理坐标系中，而不是回到旧本地沙盘坐标。
4. 依赖层移除 `@react-three/drei`、`@react-three/fiber`、`three`、`@types/three`。
5. 构建链路不再因为 Cesium 顶层入口拖入 KML/zip 导出链路而失败。
6. 没有 Google Maps/Cesium ion 凭证时，页面给出明确配置提示，不再用默认 token 触发无意义 401。
7. 通过真实 `typecheck`、`build`、残留扫描、浏览器运行时烟测验证。

### 13.2 Prompt 到产物清单

| 明确要求 | 证据 |
| --- | --- |
| 使用 CesiumJS 渲染 | `WorldScene.tsx:24-25` 精确导入 `createGooglePhotorealistic3DTileset` 和 `CesiumWidget`；`WorldScene.tsx:469-478` 创建 `CesiumWidget` |
| 使用 Google Photorealistic 3D Tiles | `WorldScene.tsx:517-539` 调用 `createGooglePhotorealistic3DTileset(...)` 并加入 `widget.scene.primitives` |
| 不再使用 R3F/Three 沙盘 | `rg -n "@react-three|from 'three'|from \"three\"|useGLTF|useFrame|useLoader|<Canvas|meshStandardMaterial|planeGeometry|boxGeometry|R3F|沙盘" src package.json package-lock.json rsbuild.config.ts -S` 无输出 |
| 移除 R3F/Three direct deps | `package.json:15-24` 只保留 `@cesium/engine`、`cesium` 等依赖；`npm ls @react-three/drei @react-three/fiber three @types/three @cesium/widgets --depth=0` 输出 `empty` |
| 不保留老模式导出 | `components/index.ts:1-5` 不再导出 `Scene` / `AxesIndicator`；两者仅保留非 R3F 占位，不再包含 Three JSX |
| 地理坐标叠加 | `WorldScene.tsx:112-159` 从 metadata/对象解析 WGS84 中心并把旧 telemetry offset 映射到经纬度；`WorldScene.tsx:215-278` 叠加 OSM road/polyline 与 POI |
| 设备叠加 | `WorldScene.tsx:281-329` 用 Cesium entity/model/billboard/label 表示设备；无人机继续挂载 DJI glb |
| Cesium 静态资源 | `rsbuild.config.ts:9-16` 复制 `node_modules/cesium/Build/Cesium` 到 `dist/cesium`；`WorldScene.tsx:459` 设置 `buildModuleUrl` base 为 `./cesium/` |
| 缺凭证提示 | `WorldScene.tsx:70-72` 定义 key/token 变量名；`WorldScene.tsx:504-515` 缺凭证时显示明确提示并不发 tiles 请求 |
| Cesium Source 子路径类型 | `assets.d.ts:51-154` 声明 env 与 Cesium `Source/.../*.js` 子路径类型，避免回退顶层 `cesium` 聚合入口 |

说明：`@cesium/widgets` 在 `package-lock.json` 中仍作为 `cesium` 聚合包的传递依赖出现，但它不是 `package.json` direct dependency，源码也没有导入 `@cesium/widgets`。

### 13.3 验证命令

```bash
git diff --check
```

结果：通过，退出码 `0`。

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
npm run build
```

结果：通过，退出码 `0`。本轮已修复之前的：

```text
Package subpath './lib/zip-no-worker.js' is not defined by "exports"
```

修复方式：`WorldScene.tsx` 不再从 `cesium` 顶层聚合入口导入运行时代码，改为 `@cesium/engine/Source/...` 精确导入，避免 Rspack 追入 `KmlDataSource/exportKml`。

```bash
rg -n "@react-three|from 'three'|from \"three\"|useGLTF|useFrame|useLoader|<Canvas|meshStandardMaterial|planeGeometry|boxGeometry|R3F|沙盘" \
  src package.json package-lock.json rsbuild.config.ts -S
```

结果：无输出，`rg` 退出码 `1`。

```bash
npm ls @react-three/drei @react-three/fiber three @types/three @cesium/widgets --depth=0
```

结果：输出 `└── (empty)`，退出码 `1`，表示这些包不是顶层安装依赖。

### 13.4 Playwright 运行时烟测

preview 启动：

```bash
npm run preview
```

`1420` 被占用，Rsbuild 自动使用：

```text
http://127.0.0.1:1421/
```

Playwright 访问：

```bash
http://127.0.0.1:1421/#/world
```

关键输出：

```json
{
  "title": "World Scale Cooperative Simulator",
  "textHasCredentialMessage": true,
  "textHasGoogleTiles": true,
  "hasCesiumWidget": true,
  "hasCesiumScene": true,
  "hasR3fCanvasMarker": false,
  "canvases": [
    {
      "index": 0,
      "cssSize": { "width": 554, "height": 459 },
      "bufferSize": { "width": 554, "height": 459 }
    }
  ],
  "badResponses": []
}
```

控制台只有 Playwright/WebGL 读像素触发的 `GPU stall due to ReadPixels` 性能 warning；没有页面错误或 4xx/5xx 响应。

### 13.5 残余风险

- 本机当前未配置 `PUBLIC_GOOGLE_MAPS_API_KEY` 或 `PUBLIC_CESIUM_ION_TOKEN`，因此无法声明真实 Google tiles 网络加载成功；已验证缺凭证时不会再发默认 token 401，并会显示明确配置提示。
- Playwright 验证覆盖 web preview 的 `#/world` 路由；Tauri 原生窗口中真实 Google tiles 加载仍依赖同一前端 bundle 和本地环境变量注入，未单独跑 `tauri dev`。

## 14. `config/maps.toml` 地图凭据读取审计

### 14.1 本轮目标

用户本轮追加目标：

> 将 `PUBLIC_GOOGLE_MAPS_API_KEY` 凭据也通过 `config` 目录下的 toml 配置文件读取，我已经申请好 key 了，另外 `PUBLIC_CESIUM_ION_TOKEN` 是必须的吗

拆成验收标准：

1. Google Maps API key 能从 `config/maps.toml` 读取，而不是只能从前端 `import.meta.env` 读取。
2. 配置文件放在项目 `config` 目录下，并提供不含真实 key 的 example。
3. 仍保留环境变量兜底，便于 web preview 和 CI smoke。
4. 前端 Cesium 场景优先使用 Tauri 运行时下发的配置 key。
5. `PUBLIC_CESIUM_ION_TOKEN` 被定义为可选 fallback，不再作为必填项。
6. 跨窗口状态同步不把真实地图凭据写入 `localStorage`。

### 14.2 Prompt 到产物清单

| 明确要求 | 证据 |
| --- | --- |
| 通过 `config` TOML 读取 Google Maps key | `storage.rs:53-114` 新增 `load_map_settings_from_project_config(...)`，候选路径包含项目根 `config/maps.toml` |
| Tauri 启动时注入配置 | `lib.rs:30-35` 在 `AppStore::load(...)` 中读取 map settings 并写入 `state.settings.maps` |
| Rust 配置模型 | `models.rs:140` 在 `Settings` 挂载 `maps`；`models.rs:191-236` 定义 `MapProviderSettings` / `GoogleMapsSettings` / `CesiumIonSettings` |
| 不提交真实 key | `.gitignore:5` 忽略 `config/maps.toml`；`config/maps.example.toml` 只提供空模板 |
| 前端接收配置 | `simulation.ts:194-204` 声明 Rust settings maps 字段；`simulation.ts:594-603` 映射到 UI `SimulationSettings.maps` |
| Cesium 场景优先使用配置 key | `WorldScene.tsx:53-54` 新增 props；`WorldScene.tsx:99-110` 先读 props，再 fallback 到 `import.meta.env` |
| 世界/眼镜/设备窗口传入配置 | `WorldWindow.tsx:645-646`、`GlassesWindow.tsx:129-130`、`DeviceWindow.tsx:155-156` 传入 `state.settings.maps` |
| Cesium ion token 非必填 | `WorldScene.tsx:74` 缺凭据提示写明 `PUBLIC_CESIUM_ION_TOKEN` 仅为可选备用；`config/maps.example.toml:11-15` 把 token 标为 optional fallback |
| 同步脱敏 | `windowSync.ts:34-58` 发布跨窗口消息前移除 `apiKey` / `token`；`SimulationProvider.tsx:91-102` 从本窗口已加载配置恢复凭据 |
| 状态保存脱敏 | `storage.rs:123-131` 写入 `app_state.toml` 前清空 LLM、Google Maps、Cesium ion 运行时凭据 |

### 14.3 Cesium 官方行为依据

CesiumJS 官方文档对 `createGooglePhotorealistic3DTileset(...)` 的 `apiOptions.key` 描述为：

```text
Your API key to access Google Photorealistic 3D Tiles
```

默认值为 `GoogleMaps.defaultApiKey`。本仓实际安装源码 `createGooglePhotorealistic3DTileset.js:72-93` 也显示：有 `key` 时直接请求 Google Map Tiles API；没有 `key` 时才调用 `requestCachedIonTileset(...)` 走 Cesium ion asset fallback。

因此当前配置结论是：`PUBLIC_CESIUM_ION_TOKEN` 不是必填项；已填写 Google Maps API key 时，Google Photorealistic 3D Tiles 主链路不依赖 Cesium ion token。

### 14.4 验证结果

```bash
cargo test --manifest-path src-tauri/Cargo.toml storage::tests
```

结果：通过，退出码 `0`。覆盖：

- `storage::tests::load_map_settings_reads_maps_toml_from_config_dir`
- `storage::tests::save_state_to_path_redacts_runtime_credentials`

```bash
git diff --check
```

结果：通过，退出码 `0`。

```bash
npm run typecheck
```

结果：通过，退出码 `0`。

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

结果：通过，退出码 `0`，输出 `Finished dev profile`。

```bash
npm run build
```

结果：通过，退出码 `0`，输出 `ready built in 3.05 s`。

说明：本轮没有把用户真实 Google Maps API key 写入仓库；真实 tiles 网络加载仍取决于本机 `config/maps.toml` 中的有效 key 和 Google Map Tiles API 授权状态。
