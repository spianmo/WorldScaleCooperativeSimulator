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
