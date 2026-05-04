# 开发任务安排

## 阶段 0：需求与架构

- [x] 梳理原始需求
- [x] 阅读 `DESIGN.md`
- [x] 输出 `ProjectPRD.md`
- [x] 输出 `ARCHITECTURE.md`
- [x] 保持本文件随实现进度更新

## 阶段 1：工程骨架

- [x] 创建 Tauri + React + TypeScript + Rsbuild 工程配置
- [x] 创建 Rust crate 与 Tauri 配置
- [x] 创建前端入口、主题、i18n 和基础路由
- [x] 创建公共类型和 Tauri invoke 封装

## 阶段 2：Rust 仿真核心

- [x] 定义世界、设备、任务、规则、日志领域模型
- [x] 实现 TOML 读写工具
- [x] 实现随机世界生成
- [x] 实现设备注册/移除
- [x] 实现目标提交、任务拆解和高优先级打断
- [x] 实现仿真 tick 推进

## 阶段 3：前端窗口与交互

- [x] 3D 世界窗口：世界、道路、建筑、地形、天气、设备、坐标轴
- [x] 群体智能控制面板：规则、设备、任务、D3 图表、日志
- [x] AI 眼镜窗口：ASR 输入代理、目标提交、GlassesMirror
- [x] 设备终端窗口：第一视角 3D、遥测、任务、通信日志
- [x] 任务详情窗口：子任务、执行过程、日志
- [x] 设置窗口：主题、语言、自动保存和日志级别

## 阶段 4：验证

- [x] `npm install`
- [x] `npm run typecheck`
- [x] `npm run build`
- [x] `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] 完成目标到产物的审计清单

## 阶段 5：严格复审与修复

- [x] 复读原始需求，重新识别缺口
- [x] Rust / TS 领域模型补齐四足机器人、物理规则、设备物理画像和世界快照记录
- [x] 浏览器 fallback 补齐 `quadruped`、设备物理画像、速度、关节角、四元数、物理规则更新和世界快照命令
- [x] Provider 暴露 `updatePhysicalRules`、`saveWorldSnapshot`、`listWorldSnapshots`、`openWorldSnapshot`
- [x] 控制面板支持选择轮式/人形/四足/无人机，并填写电池、功耗、速度、坡度和材质规则
- [x] 世界窗口支持保存、列出和打开世界快照，并显示坡度、天气、材质和高度规则
- [x] 设备窗口展示位置、速度、功耗、坡度能力、工作高度、材质、关节角和四元数
- [x] AI 眼镜窗口明确提示最高优先级目标会打断当前任务
- [x] 修复移动视口下世界窗口 canvas 只有 `12px` 宽的问题
- [x] 重新验证 `npm run typecheck`
- [x] 重新验证 `npm run build`
- [x] 重新验证 `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] 重新验证敏感 key 扫描无代码命中
- [x] 重新验证 Playwright Chromium 桌面和移动截图
- [x] 重新验证 Playwright 运行时 canvas、关键文本、4xx/5xx 和控制台错误

## 阶段 6：UI / 主题 / 城市数字孪生修正

- [x] 对照 `DESIGN.md` 去掉窗口层深色渐变、玻璃感卡片和 18px 大圆角 chrome
- [x] 将窗口、面板、chip、输入框、按钮、图表改为 Apple 风格 token：纯色画布、弱边线、Action Blue
- [x] 修复浅色/暗色主题切换：`SettingsWindow` -> Provider -> `update_settings` -> `html[data-theme]`
- [x] 浏览器 fallback 的 `update_settings` 支持 `language`、`theme`、`auto_save`、`default_tick_seconds`、`log_level`
- [x] Rust `generate_world` 改为连续城市数字孪生：路网、街区建筑、开放空间、城市中枢、能源补给点
- [x] 浏览器 fallback `generate_world` 同步改为连续城市数字孪生
- [x] 3D 世界渲染按连续城市对象重映射道路、建筑、地标比例
- [x] 验证 `npm run typecheck`
- [x] 验证 `npm run build`
- [x] 验证 `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] 验证敏感 key 扫描无代码命中
- [x] 验证无窗口层旧深色渐变 / 18px 卡片样式残留
- [x] Playwright 验证浅色/暗色 computed style 生效
- [x] Playwright 验证生成世界为连续城市数字孪生结构
- [x] Playwright 生成桌面和移动截图

## 阶段 7：多窗口交互与设置修复

- [x] 移除 `WorldWindow`、`DeviceWindow`、`GlassesWindow` 中的 Leva 表单和 `leva` 依赖
- [x] 场景控制改为设备真实 telemetry 或固定默认值，不再依赖调试面板
- [x] 新增 `CreateWorldWindow` 独立创建世界窗口和 `#/create-world` 路由
- [x] 新增 `CreateDeviceWindow` 独立创建智能终端设备窗口和 `#/create-device` 路由
- [x] `WorldWindow` 创建世界按钮改为打开独立窗口
- [x] `ControlWindow` 新增设备按钮改为打开独立窗口
- [x] `openSimulatorWindow` 不再使用 `x`、`y`、`center` 计算窗口位置
- [x] `SimulationProvider` 监听 `storage`、`focus`、`visibilitychange`，同步多窗口主题/设置状态
- [x] `App` 使用 `settings.theme.resolvedMode` 写入 `html[data-theme]`
- [x] 全局页面、面板、响应式网格、终端日志补齐滚动溢出处理
- [x] `IconButton` 新增 hover/focus 可见 tooltip
- [x] 设置窗口移除无响应假按钮，改为真实可点击设置项
- [x] 坐标轴显示设置接入 `WorldScene.showAxes`
- [x] 日志密度设置接入 `html[data-log-density]` 和 `TerminalLog`
- [x] Rust / browser fallback 设置 patch 支持 `terminal_log_density`
- [x] 验证 `npm run typecheck`
- [x] 验证 `npm run build`
- [x] 验证 `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] 验证 `rg` 无 Leva 残留
- [x] Playwright Chromium 验证主题跨窗口同步、创建世界、创建设备、tooltip、桌面/移动横向溢出

## 阶段 8：物理真实性与 agentic 网关强化

- [x] 对照原始需求重新核对真实材质、真实机器人模型、天气物理、LLM agents 网关、设备移动和第一视角缺口
- [x] 下载并接入 Poly Haven 1K 沥青、混凝土、草地/岩石纹理，世界道路、建筑、地形不再依赖白色默认材质
- [x] 下载并接入 Unitree ROS G1 pelvis/waist/torso/head/logo/主要四肢 STL，人形机器人主路径使用真实 STL 几何
- [x] 修正 Unitree Go2/G1 官方 USD/USDZ 资产口径：根引用资产保留为来源证据，不再描述为完整可渲染运行时模型
- [x] 下载并接入 Unitree ROS Go2 `base/hip/thigh/calf/foot` DAE 与 URDF，四足机器狗主路径使用 `ColladaLoader` 官方 DAE 部件
- [x] Rust 与浏览器 fallback 增加 `windy` / `stormy` 天气、降雨、风速、能见度和地表摩擦系数
- [x] Rust 与浏览器 fallback 的 `simulate_tick` 按天气摩擦、风速和任务状态推进终端位置、朝向、速度
- [x] `SimulationProvider` 在存在 active task 时按 `settings.tickIntervalMs` 自动推进 tick，眼镜下发目标后终端可实时移动/飞行
- [x] `WorldScene` 增加天气可视层：雾、云、雨线、风线
- [x] `Scene` / `WorldScene` 支持 `cameraMode="first_person"` 与 `cameraTarget`
- [x] 设备终端窗口使用当前设备 telemetry 计算第一视角相机位置和朝向
- [x] AI 眼镜窗口使用人的朝向第一视角渲染城市镜像
- [x] 资产 `manifest.json` / `README.md` 记录真实来源、许可证、运行时用途、Go2 DAE 包体和 G1 未含手部/传感器的边界
- [x] 验证 `npm run typecheck`
- [x] 验证 `npm run build`
- [x] 验证 `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] 验证模型/纹理文件类型与体积
- [x] Playwright 验证眼镜目标下发后 Go2/G1/drone 自动 tick 移动，并生成 world/glasses/device 第一视角截图，无业务 console error

## 阶段 9：现代建筑纹理、设备外壳贴图与 tick 平滑动画

- [x] 接入 ambientCG `Facade001` 现代玻璃幕墙贴图，替换建筑运行时混凝土外立面
- [x] 给建筑叠加程序化现代窗格层，让城市楼宇具备可见窗格纹理
- [x] 给 Unitree G1 STL 运行时几何生成投影 UV，并挂载设备外壳贴图
- [x] 对 Unitree Go2 DAE 和 DJI Mavic GLB 的无贴图材质补设备外壳贴图
- [x] 给 G1 / Go2 / 无人机 fallback 几何补程序化外壳贴图
- [x] 设备渲染 group 使用 `useFrame` 按 `settings.tickIntervalMs` 插值追踪 tick 目标位置，降低离散 tick 的瞬移感
- [x] `assets/textures/manifest.json` / `README.md` 记录 Facade001 与矩形立面备选纹理来源、许可证和运行时用途
- [x] 验证 `npm run typecheck`
- [x] 验证 `npm run build`
- [x] 验证 `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] 验证纹理 manifest JSON 与新增纹理文件类型
- [x] Playwright 验证世界、Go2 第一视角、G1 第一视角截图无业务 console error，并确认自动 tick 后设备位置有推进

## 阶段 10：设备工作动画、设置窗口重构与终端日志体验

- [x] 无人机模型增加 4 个可见旋翼组，按 `speedMps` 使用 `useFrame` 持续旋转
- [x] G1 人形机器人将躯干、头部、腿部、手臂动作改为 `useFrame` 步态相位驱动
- [x] Go2 机器狗将四足动作改为对角步态相位驱动，FL/RR 同相、FR/RL 反相
- [x] fallback 设备模型补轮式车轮旋转、人形摆臂迈腿、机器狗腿部和无人机旋翼动画
- [x] 设置窗口多值设置改为分段选项组，不再用单个“切换”按钮循环承载
- [x] 设置窗口行布局和分段选项支持换行，桌面和移动视口无横向溢出
- [x] 终端日志默认自动滚动到底部，并在日志渲染后再次校正滚动位置
- [x] 终端日志操作按钮增加 hover / focus tooltip，降低图标歧义
- [x] 验证 `npm run typecheck`
- [x] 验证 `npm run build`
- [x] 验证 `cargo check --manifest-path src-tauri/Cargo.toml`
- [x] Playwright 验证设置页无横向溢出、终端日志滚底和 tooltip 可见、工作动画 canvas 持续变化
