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
