use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vector3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

impl Vector3 {
    pub fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }
}

impl Default for Vector3 {
    fn default() -> Self {
        Self::new(0.0, 0.0, 0.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DeviceKind {
    #[default]
    Rover,
    Drone,
    Humanoid,
    Quadruped,
    UnitreeRobot,
    SensorHub,
    ChargingBase,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum DeviceStatus {
    #[default]
    Idle,
    Moving,
    Working,
    Charging,
    Offline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    #[default]
    Pending,
    Assigned,
    InProgress,
    Blocked,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum GoalStatus {
    #[default]
    Draft,
    Active,
    Blocked,
    Completed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LogLevel {
    Trace,
    Debug,
    #[default]
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WorldObjectKind {
    #[default]
    TerrainPatch,
    RoadSegment,
    Building,
    Landmark,
    ChargingPad,
    ResourceNode,
    Boundary,
    Waypoint,
    Water,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Climate {
    #[default]
    Clear,
    Cloudy,
    Rainy,
    Foggy,
    Windy,
    Stormy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TerrainProfile {
    #[default]
    Plain,
    Urban,
    Mountain,
    Coastal,
    Mixed,
    Industrial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub app_name: String,
    pub language: String,
    pub theme: String,
    pub auto_save: bool,
    pub auto_save_every_tick: bool,
    pub default_world_name: String,
    pub default_world_seed: u64,
    pub default_world_size: Vector3,
    pub default_object_density: f32,
    pub default_device_battery: f32,
    pub default_tick_seconds: f32,
    pub max_devices: usize,
    pub log_level: LogLevel,
    pub terminal_log_density: String,
    pub map_notes: String,
    pub llm: LlmSettings,
    pub maps: MapProviderSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            app_name: "World-scale aligned cooperative objective solution".to_string(),
            language: "zh-CN".to_string(),
            theme: "system".to_string(),
            auto_save: true,
            auto_save_every_tick: true,
            default_world_name: "默认世界".to_string(),
            default_world_seed: 42,
            default_world_size: Vector3::new(120.0, 80.0, 120.0),
            default_object_density: 0.18,
            default_device_battery: 100.0,
            default_tick_seconds: 1.0,
            max_devices: 64,
            log_level: LogLevel::Info,
            terminal_log_density: "normal".to_string(),
            map_notes: "仿真世界默认配置".to_string(),
            llm: LlmSettings::default(),
            maps: MapProviderSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LlmSettings {
    pub enabled: bool,
    pub endpoint: String,
    pub model: String,
    #[serde(default, skip_serializing)]
    pub api_key: Option<String>,
    pub api_key_env: String,
}

impl Default for LlmSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: "https://www.openclaudecode.cn/v1/chat/completions".to_string(),
            model: "gpt-5.4".to_string(),
            api_key: None,
            api_key_env: "OPENCLAUDECODE_API_KEY".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct MapProviderSettings {
    pub google_maps: GoogleMapsSettings,
    pub cesium_ion: CesiumIonSettings,
}

impl Default for MapProviderSettings {
    fn default() -> Self {
        Self {
            google_maps: GoogleMapsSettings::default(),
            cesium_ion: CesiumIonSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct GoogleMapsSettings {
    #[serde(default)]
    pub api_key: Option<String>,
    pub api_key_env: String,
}

impl Default for GoogleMapsSettings {
    fn default() -> Self {
        Self {
            api_key: None,
            api_key_env: "PUBLIC_GOOGLE_MAPS_API_KEY".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct CesiumIonSettings {
    #[serde(default)]
    pub token: Option<String>,
    pub token_env: String,
}

impl Default for CesiumIonSettings {
    fn default() -> Self {
        Self {
            token: None,
            token_env: "PUBLIC_CESIUM_ION_TOKEN".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BatteryRules {
    pub moving_drain_per_tick: f32,
    pub working_drain_per_tick: f32,
    pub idle_recharge_per_tick: f32,
    pub charging_recharge_per_tick: f32,
    pub low_battery_threshold: f32,
    pub critical_battery_threshold: f32,
}

impl Default for BatteryRules {
    fn default() -> Self {
        Self {
            moving_drain_per_tick: 0.65,
            working_drain_per_tick: 1.25,
            idle_recharge_per_tick: 0.18,
            charging_recharge_per_tick: 3.0,
            low_battery_threshold: 20.0,
            critical_battery_threshold: 8.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TaskPlanningRules {
    pub default_priority: u8,
    pub task_progress_per_tick: f32,
    pub fallback_task_title: String,
    pub keyword_rules: Vec<KeywordRule>,
}

impl Default for TaskPlanningRules {
    fn default() -> Self {
        Self {
            default_priority: 5,
            task_progress_per_tick: 0.22,
            fallback_task_title: "协同推进目标".to_string(),
            keyword_rules: vec![
                KeywordRule {
                    keywords: vec!["巡检".to_string(), "inspect".to_string()],
                    task_title: "执行巡检".to_string(),
                    preferred_device_kind: Some(DeviceKind::Rover),
                    priority: 7,
                    estimated_ticks: 6,
                    drain_multiplier: 1.0,
                },
                KeywordRule {
                    keywords: vec!["拍照".to_string(), "photo".to_string()],
                    task_title: "采集影像".to_string(),
                    preferred_device_kind: Some(DeviceKind::Drone),
                    priority: 8,
                    estimated_ticks: 4,
                    drain_multiplier: 1.15,
                },
                KeywordRule {
                    keywords: vec!["搜索".to_string(), "search".to_string()],
                    task_title: "执行搜索".to_string(),
                    preferred_device_kind: Some(DeviceKind::Drone),
                    priority: 8,
                    estimated_ticks: 5,
                    drain_multiplier: 1.05,
                },
                KeywordRule {
                    keywords: vec!["运输".to_string(), "delivery".to_string()],
                    task_title: "协同运输".to_string(),
                    preferred_device_kind: Some(DeviceKind::Humanoid),
                    priority: 6,
                    estimated_ticks: 7,
                    drain_multiplier: 0.95,
                },
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WorldRules {
    pub object_density: f32,
    pub max_objects: usize,
    pub default_climate: Climate,
    pub default_terrain: TerrainProfile,
}

impl Default for WorldRules {
    fn default() -> Self {
        Self {
            object_density: 0.18,
            max_objects: 48,
            default_climate: Climate::Clear,
            default_terrain: TerrainProfile::Mixed,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PhysicalRules {
    pub drone_min_altitude_m: f32,
    pub drone_max_altitude_m: f32,
    pub rover_max_slope_deg: f32,
    pub humanoid_max_slope_deg: f32,
    pub quadruped_max_slope_deg: f32,
    pub ground_allowed_materials: Vec<String>,
}

impl Default for PhysicalRules {
    fn default() -> Self {
        Self {
            drone_min_altitude_m: 3.0,
            drone_max_altitude_m: 60.0,
            rover_max_slope_deg: 12.0,
            humanoid_max_slope_deg: 18.0,
            quadruped_max_slope_deg: 28.0,
            ground_allowed_materials: vec![
                "asphalt".to_string(),
                "concrete".to_string(),
                "grass".to_string(),
                "packed_soil".to_string(),
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DispatchRules {
    pub max_active_tasks_per_device: usize,
    pub requeue_unfinished_tasks_on_remove: bool,
    pub prefer_nearest_device: bool,
}

impl Default for DispatchRules {
    fn default() -> Self {
        Self {
            max_active_tasks_per_device: 1,
            requeue_unfinished_tasks_on_remove: true,
            prefer_nearest_device: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Rules {
    pub battery: BatteryRules,
    pub task_planning: TaskPlanningRules,
    pub world: WorldRules,
    pub physical: PhysicalRules,
    pub dispatch: DispatchRules,
}

impl Default for Rules {
    fn default() -> Self {
        Self {
            battery: BatteryRules::default(),
            task_planning: TaskPlanningRules::default(),
            world: WorldRules::default(),
            physical: PhysicalRules::default(),
            dispatch: DispatchRules::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WorldObject {
    pub id: Uuid,
    pub name: String,
    pub kind: WorldObjectKind,
    pub position: Vector3,
    pub size: Vector3,
    pub tags: Vec<String>,
    pub walkable: bool,
    pub interactive: bool,
    pub properties: BTreeMap<String, String>,
}

impl Default for WorldObject {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: String::new(),
            kind: WorldObjectKind::default(),
            position: Vector3::default(),
            size: Vector3::new(1.0, 1.0, 1.0),
            tags: Vec::new(),
            walkable: true,
            interactive: false,
            properties: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Device {
    pub id: Uuid,
    pub name: String,
    pub kind: DeviceKind,
    pub status: DeviceStatus,
    pub battery: f32,
    pub battery_capacity: f32,
    pub position: Vector3,
    pub orientation_deg: f32,
    pub physical_profile: DevicePhysicalProfile,
    pub capabilities: Vec<String>,
    pub assigned_task_ids: Vec<Uuid>,
    pub current_task_id: Option<Uuid>,
    pub active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_tick_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DevicePhysicalProfile {
    pub min_work_altitude_m: f32,
    pub max_work_altitude_m: f32,
    pub max_slope_deg: f32,
    pub supported_materials: Vec<String>,
    pub nominal_power_w: f32,
    pub working_power_w: f32,
    pub max_speed_mps: f32,
    pub joint_count: u8,
}

impl Default for DevicePhysicalProfile {
    fn default() -> Self {
        Self {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 2.0,
            max_slope_deg: 12.0,
            supported_materials: vec![
                "asphalt".to_string(),
                "concrete".to_string(),
                "grass".to_string(),
            ],
            nominal_power_w: 12.0,
            working_power_w: 64.0,
            max_speed_mps: 1.0,
            joint_count: 0,
        }
    }
}

impl Default for Device {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: String::new(),
            kind: DeviceKind::default(),
            status: DeviceStatus::default(),
            battery: 100.0,
            battery_capacity: 100.0,
            position: Vector3::default(),
            orientation_deg: 0.0,
            physical_profile: DevicePhysicalProfile::default(),
            capabilities: Vec::new(),
            assigned_task_ids: Vec::new(),
            current_task_id: None,
            active: true,
            created_at: now,
            updated_at: now,
            last_tick_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Task {
    pub id: Uuid,
    pub goal_id: Uuid,
    pub title: String,
    pub description: String,
    pub keywords: Vec<String>,
    pub status: TaskStatus,
    pub priority: u8,
    pub estimated_ticks: u32,
    pub progress: f32,
    pub assignee_device_id: Option<Uuid>,
    pub related_object_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl Default for Task {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            goal_id: Uuid::nil(),
            title: String::new(),
            description: String::new(),
            keywords: Vec::new(),
            status: TaskStatus::default(),
            priority: 5,
            estimated_ticks: 1,
            progress: 0.0,
            assignee_device_id: None,
            related_object_ids: Vec::new(),
            created_at: now,
            updated_at: now,
            completed_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Goal {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub requested_by: String,
    pub keywords: Vec<String>,
    pub status: GoalStatus,
    pub priority: u8,
    pub task_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

impl Default for Goal {
    fn default() -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            title: String::new(),
            description: String::new(),
            requested_by: String::new(),
            keywords: Vec::new(),
            status: GoalStatus::default(),
            priority: 5,
            task_ids: Vec::new(),
            created_at: now,
            updated_at: now,
            completed_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LogEntry {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub scope: String,
    pub message: String,
    pub entity_id: Option<Uuid>,
    pub context: BTreeMap<String, String>,
}

impl Default for LogEntry {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            timestamp: Utc::now(),
            level: LogLevel::Info,
            scope: String::new(),
            message: String::new(),
            entity_id: None,
            context: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct KeywordRule {
    pub keywords: Vec<String>,
    pub task_title: String,
    pub preferred_device_kind: Option<DeviceKind>,
    pub priority: u8,
    pub estimated_ticks: u32,
    pub drain_multiplier: f32,
}

impl Default for KeywordRule {
    fn default() -> Self {
        Self {
            keywords: Vec::new(),
            task_title: String::new(),
            preferred_device_kind: None,
            priority: 5,
            estimated_ticks: 1,
            drain_multiplier: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct World {
    pub id: Uuid,
    pub name: String,
    pub seed: u64,
    pub size: Vector3,
    pub climate: Climate,
    pub terrain: TerrainProfile,
    pub objects: Vec<WorldObject>,
    pub devices: Vec<Device>,
    pub tasks: Vec<Task>,
    pub goals: Vec<Goal>,
    pub logs: Vec<LogEntry>,
    pub rules: Rules,
    pub tick_index: u64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Default for World {
    fn default() -> Self {
        Self::terminal_link_default()
    }
}

impl World {
    pub fn new(name: impl Into<String>, seed: u64, size: Vector3) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4(),
            name: name.into(),
            seed,
            size,
            climate: Climate::default(),
            terrain: TerrainProfile::default(),
            objects: Vec::new(),
            devices: Vec::new(),
            tasks: Vec::new(),
            goals: Vec::new(),
            logs: Vec::new(),
            rules: Rules::default(),
            tick_index: 0,
            created_at: now,
            updated_at: now,
        }
    }

    pub fn terminal_link_default() -> Self {
        let mut world = Self::new(
            "在线 OpenStreetMap 实景世界",
            42,
            Vector3::new(120.0, 80.0, 120.0),
        );
        world.climate = Climate::Clear;
        world.terrain = TerrainProfile::Urban;
        let devices = default_terminal_devices(&world.rules.physical);
        let work = default_goal_and_tasks(&devices);
        world.devices = devices;
        world.goals = vec![work.0];
        world.tasks = work.1;
        world.logs = vec![
            LogEntry {
                scope: "bootstrap".to_string(),
                message: "TerminalLink 单仪表盘初始化完成。".to_string(),
                ..LogEntry::default()
            },
            LogEntry {
                scope: "gateway".to_string(),
                message: "群体智能网关已载入默认巡检目标。".to_string(),
                ..LogEntry::default()
            },
        ];
        world
    }
}

fn physical_profile(
    kind: DeviceKind,
    rules: &PhysicalRules,
    nominal_power_w: f32,
    working_power_w: f32,
    max_speed_mps: f32,
    joint_count: u8,
) -> DevicePhysicalProfile {
    let (min_work_altitude_m, max_work_altitude_m, max_slope_deg, supported_materials) = match kind
    {
        DeviceKind::Drone => (
            rules.drone_min_altitude_m,
            rules.drone_max_altitude_m,
            90.0,
            vec!["air".to_string()],
        ),
        DeviceKind::Humanoid => (
            0.0,
            2.4,
            rules.humanoid_max_slope_deg,
            rules.ground_allowed_materials.clone(),
        ),
        DeviceKind::Quadruped | DeviceKind::UnitreeRobot => (
            0.0,
            1.4,
            rules.quadruped_max_slope_deg,
            rules.ground_allowed_materials.clone(),
        ),
        DeviceKind::Rover => (
            0.0,
            1.2,
            rules.rover_max_slope_deg,
            vec!["asphalt".into(), "concrete".into(), "packed_soil".into()],
        ),
        DeviceKind::SensorHub | DeviceKind::ChargingBase => {
            (0.0, 4.0, 8.0, rules.ground_allowed_materials.clone())
        }
    };

    DevicePhysicalProfile {
        min_work_altitude_m,
        max_work_altitude_m,
        max_slope_deg,
        supported_materials,
        nominal_power_w,
        working_power_w,
        max_speed_mps,
        joint_count,
    }
}

fn terminal_device(
    name: &str,
    kind: DeviceKind,
    status: DeviceStatus,
    position: Vector3,
    orientation_deg: f32,
    battery: f32,
    profile: DevicePhysicalProfile,
    capabilities: Vec<&str>,
) -> Device {
    Device {
        name: name.to_string(),
        kind,
        status,
        position,
        orientation_deg,
        battery,
        physical_profile: profile,
        capabilities: capabilities.into_iter().map(str::to_string).collect(),
        ..Device::default()
    }
}

fn default_terminal_devices(rules: &PhysicalRules) -> Vec<Device> {
    vec![
        terminal_device(
            "DJI Mavic 3E",
            DeviceKind::Drone,
            DeviceStatus::Working,
            Vector3::new(120.5, 80.3, 85.6),
            42.0,
            78.0,
            physical_profile(DeviceKind::Drone, rules, 36.0, 180.0, 12.0, 4),
            vec!["aerial_move", "photo", "search", "mapping"],
        ),
        terminal_device(
            "Autel EVO Max 4T",
            DeviceKind::Drone,
            DeviceStatus::Idle,
            Vector3::new(98.2, 76.1, 12.5),
            110.0,
            63.0,
            physical_profile(DeviceKind::Drone, rules, 38.0, 190.0, 11.0, 4),
            vec!["aerial_move", "thermal", "mapping"],
        ),
        terminal_device(
            "Unitree Go2",
            DeviceKind::UnitreeRobot,
            DeviceStatus::Working,
            Vector3::new(45.3, 22.8, 0.3),
            265.0,
            52.0,
            physical_profile(DeviceKind::UnitreeRobot, rules, 30.0, 180.0, 2.2, 12),
            vec!["ground_move", "inspect", "rough_terrain"],
        ),
        terminal_device(
            "Unitree B2",
            DeviceKind::UnitreeRobot,
            DeviceStatus::Idle,
            Vector3::new(15.6, 35.2, 0.3),
            188.0,
            91.0,
            physical_profile(DeviceKind::UnitreeRobot, rules, 34.0, 220.0, 2.6, 12),
            vec!["ground_move", "payload", "rough_terrain"],
        ),
        terminal_device(
            "Walker X",
            DeviceKind::Humanoid,
            DeviceStatus::Working,
            Vector3::new(32.1, 18.7, 0.0),
            28.0,
            68.0,
            physical_profile(DeviceKind::Humanoid, rules, 42.0, 260.0, 1.4, 24),
            vec!["ground_move", "inspect", "delivery"],
        ),
        terminal_device(
            "Wheeled Robot W3",
            DeviceKind::Rover,
            DeviceStatus::Idle,
            Vector3::new(12.8, 44.3, 0.0),
            340.0,
            55.0,
            physical_profile(DeviceKind::Rover, rules, 18.0, 90.0, 2.0, 4),
            vec!["ground_move", "inspect", "transport"],
        ),
        terminal_device(
            "DJI Matrice 30T",
            DeviceKind::Drone,
            DeviceStatus::Idle,
            Vector3::new(86.4, 58.0, 46.2),
            76.0,
            84.0,
            physical_profile(DeviceKind::Drone, rules, 44.0, 220.0, 12.0, 4),
            vec!["aerial_move", "thermal", "zoom", "mapping"],
        ),
        terminal_device(
            "Sensor Hub A1",
            DeviceKind::SensorHub,
            DeviceStatus::Idle,
            Vector3::new(62.5, 28.5, 0.2),
            0.0,
            100.0,
            physical_profile(DeviceKind::SensorHub, rules, 6.0, 14.0, 0.0, 0),
            vec!["sense", "thermal", "report"],
        ),
    ]
}

fn default_goal_and_tasks(devices: &[Device]) -> (Goal, Vec<Task>) {
    let mut goal = Goal {
        title: "巡检解放路沿线建筑".to_string(),
        description: "对连续城市街区进行多设备协同巡检。".to_string(),
        requested_by: "gateway".to_string(),
        keywords: vec!["巡检".into(), "协同".into(), "街区".into()],
        status: GoalStatus::Active,
        priority: 8,
        ..Goal::default()
    };
    let mut tasks = vec![
        Task {
            goal_id: goal.id,
            title: "UAV 高空扫描".to_string(),
            description: "DJI Mavic 3E 对目标区域执行航测扫描。".to_string(),
            keywords: vec!["inspect".into(), "photo".into()],
            status: TaskStatus::InProgress,
            progress: 0.75,
            assignee_device_id: devices.get(0).map(|device| device.id),
            ..Task::default()
        },
        Task {
            goal_id: goal.id,
            title: "地面近距热测".to_string(),
            description: "Unitree Go2 对低矮遮挡区执行近距巡检。".to_string(),
            keywords: vec!["inspect".into(), "thermal".into()],
            status: TaskStatus::InProgress,
            progress: 0.48,
            assignee_device_id: devices.get(2).map(|device| device.id),
            ..Task::default()
        },
        Task {
            goal_id: goal.id,
            title: "复杂动作验证".to_string(),
            description: "Walker X 进入人类可达区域做交互验证。".to_string(),
            keywords: vec!["observe".into(), "humanoid".into()],
            status: TaskStatus::Assigned,
            progress: 0.0,
            assignee_device_id: devices.get(4).map(|device| device.id),
            ..Task::default()
        },
    ];
    goal.task_ids = tasks.iter().map(|task| task.id).collect();
    for task in &mut tasks {
        task.priority = goal.priority;
        task.estimated_ticks = 6;
    }
    (goal, tasks)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SimulationState {
    pub settings: Settings,
    pub world: World,
}

impl Default for SimulationState {
    fn default() -> Self {
        Self {
            settings: Settings::default(),
            world: World::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SettingsPatch {
    pub app_name: Option<String>,
    pub language: Option<String>,
    pub theme: Option<String>,
    pub auto_save: Option<bool>,
    pub auto_save_every_tick: Option<bool>,
    pub default_world_name: Option<String>,
    pub default_world_seed: Option<u64>,
    pub default_world_size: Option<Vector3>,
    pub default_object_density: Option<f32>,
    pub default_device_battery: Option<f32>,
    pub default_tick_seconds: Option<f32>,
    pub max_devices: Option<usize>,
    pub log_level: Option<LogLevel>,
    pub terminal_log_density: Option<String>,
    pub map_notes: Option<String>,
    pub battery_moving_drain_per_tick: Option<f32>,
    pub battery_working_drain_per_tick: Option<f32>,
    pub battery_idle_recharge_per_tick: Option<f32>,
    pub battery_charging_recharge_per_tick: Option<f32>,
    pub battery_low_threshold: Option<f32>,
    pub battery_critical_threshold: Option<f32>,
    pub task_progress_per_tick: Option<f32>,
    pub fallback_task_title: Option<String>,
    pub world_max_objects: Option<usize>,
    pub drone_min_altitude_m: Option<f32>,
    pub drone_max_altitude_m: Option<f32>,
    pub rover_max_slope_deg: Option<f32>,
    pub humanoid_max_slope_deg: Option<f32>,
    pub quadruped_max_slope_deg: Option<f32>,
    pub ground_allowed_materials: Option<Vec<String>>,
    pub max_active_tasks_per_device: Option<usize>,
    pub prefer_nearest_device: Option<bool>,
    pub requeue_unfinished_tasks_on_remove: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GenerateWorldInput {
    pub name: Option<String>,
    pub seed: Option<u64>,
    pub size: Option<Vector3>,
    pub object_density: Option<f32>,
    pub street_address: Option<String>,
    pub district: Option<String>,
    pub center_lat: Option<f64>,
    pub center_lon: Option<f64>,
    pub radius_m: Option<f32>,
    pub data_source: Option<String>,
    pub preview_quality: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RegisterDeviceInput {
    pub name: String,
    pub kind: Option<DeviceKind>,
    pub battery: Option<f32>,
    pub battery_capacity: Option<f32>,
    pub position: Option<Vector3>,
    pub physical_profile: Option<DevicePhysicalProfile>,
    pub capabilities: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SubmitGoalInput {
    pub title: String,
    pub description: Option<String>,
    pub requested_by: Option<String>,
    pub priority: Option<u8>,
    pub keywords: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TickInput {
    pub steps: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SaveSnapshotInput {
    pub snapshot_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedPath {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldSnapshotRecord {
    pub snapshot_name: String,
    pub path: String,
    pub modified_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenWorldSnapshotInput {
    pub snapshot_name: String,
}
