# 系统架构设计

## 1. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│ Tauri Desktop Shell                                         │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ 3D World Window  │  │ Hive Control     │                │
│  │ React/R3F/Leva   │  │ Rules/Tasks/D3   │                │
│  └────────┬─────────┘  └────────┬─────────┘                │
│           │ invoke/listen        │ invoke/listen             │
│  ┌────────▼─────────┐  ┌────────▼─────────┐                │
│  │ Device Terminal  │  │ AI Glasses       │                │
│  │ First-person 3D  │  │ ASR/Mirror       │                │
│  └────────┬─────────┘  └────────┬─────────┘                │
│           │                     │                           │
│           └──────────┬──────────┘                           │
│                      ▼                                      │
│             Rust Simulation Core                            │
│  State / Rule Solver / Task Planner / TOML Persistence      │
└─────────────────────────────────────────────────────────────┘
```

## 2. 进程与窗口

| 窗口 | 路由 | 职责 |
| --- | --- | --- |
| 3D 世界窗口 | `#/world` | 主仿真场景、世界生成、世界保存和坐标轴显示 |
| 群体智能控制面板 | `#/control` | 设备注册、规则配置、任务队列、状态图表、日志 |
| AI 智能眼镜 | `#/glasses` | 人类目标输入、ASR 代理、GlassesMirror 反馈 |
| 设备终端 | `#/device/:id` | 设备第一视角、遥测、任务、通信日志 |
| 任务详情 | `#/task/:id` | 单任务执行过程、子任务和日志 |
| 设置 | `#/settings` | 主题、语言、日志级别、仿真配置 |

窗口由前端 `WebviewWindow` 创建，Rust 侧保留状态命令，不直接耦合 UI 路由。

## 3. 前端分层

```text
src/
├── api/              # Tauri invoke 封装和浏览器 fallback
├── components/       # 通用 UI、日志、D3、3D 组件
├── i18n/             # 中文/英文资源
├── state/            # React 状态容器与仿真动作
├── styles/           # 主题和布局样式
├── types/            # Rust 状态镜像类型
├── utils/            # 多窗口调度
└── windows/          # 各窗口页面
```

## 4. Rust 核心分层

```text
src-tauri/src/
├── main.rs           # Tauri 入口
├── lib.rs            # 命令注册和状态初始化
├── models.rs         # 领域模型
├── storage.rs        # TOML 持久化
└── simulation.rs     # 世界生成、任务拆解、仿真步进
```

## 5. 状态流

1. 前端启动调用 `load_state`。
2. Rust 从应用数据目录读取 `app_state.toml`，没有则创建默认状态。
3. 用户通过 Leva 生成世界时调用 `generate_world`。
4. 用户注册设备时调用 `register_device`，Rust 写入状态并追加日志。
5. AI 眼镜提交目标时调用 `submit_goal`，Rust 生成目标和子任务。
6. 前端定时调用 `tick_simulation`，Rust 按设备规则推进位置、电池和任务状态。
7. 所有窗口共享同一个 `SimulationProvider`，通过轮询保持状态一致。

## 6. 任务拆解策略

MVP 默认不依赖在线 LLM。Rust 先使用规则型意图解析：

- 出现“巡检 / inspect”：生成道路、建筑、空域混合巡检子任务。
- 出现“拍照 / photo”：优先派发无人机或人形机器人。
- 出现“搜索 / search”：派发无人机高空搜索 + 四足机器人地面补盲。
- 未命中关键词：生成通用协同移动与观察任务。

同时预留了可选 LLM 调用层：

- `LlmSettings.api_key_env=OPENCLAUDECODE_API_KEY`
- `LlmSettings.endpoint=https://www.openclaudecode.cn/v1/chat/completions`
- `LlmSettings.model=gpt-5.4`
- `llm.rs#resolve_intent(...)`

默认 `enabled=false`，避免把示例密钥硬编码进仓库；启用时从环境变量读取密钥。

## 7. 持久化设计

| 文件 | 内容 |
| --- | --- |
| `app_state.toml` | 设置、当前世界、设备、目标、任务、规则、日志 |
| `worlds/world_<id>.toml` | 单个虚拟世界快照 |

存储路径使用 Tauri app data dir，不写入项目源码目录。

## 8. 设计约束

- 主交互色只使用 `#0066cc`。
- 面板使用 1px hairline 边框，不使用阴影。
- 3D 窗口保持全屏工具属性，不包在装饰性卡片内。
- 终端日志固定黑底、等宽字体、按等级上色。
- 图标按钮必须提供 `title` 或 `aria-label`。
