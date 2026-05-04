use crate::llm::{LlmIntentResult, LlmPlannedTask};
use crate::models::*;
use anyhow::{anyhow, Result};
use chrono::Utc;
use rand::prelude::*;
use std::collections::BTreeMap;
use uuid::Uuid;

fn now() -> chrono::DateTime<Utc> {
    Utc::now()
}

fn sanitize_battery(value: f32, max: f32) -> f32 {
    value.max(0.0).min(max.max(1.0))
}

fn push_log(state: &mut SimulationState, level: LogLevel, scope: &str, message: impl Into<String>, entity_id: Option<Uuid>) {
    state.world.logs.push(LogEntry {
        id: Uuid::new_v4(),
        timestamp: now(),
        level,
        scope: scope.to_string(),
        message: message.into(),
        entity_id,
        context: BTreeMap::new(),
    });
}

fn device_kind_capabilities(kind: DeviceKind) -> Vec<String> {
    match kind {
        DeviceKind::Rover => vec!["ground_move".into(), "inspect".into(), "transport".into()],
        DeviceKind::Drone => vec!["aerial_move".into(), "photo".into(), "search".into()],
        DeviceKind::Humanoid => vec!["ground_move".into(), "inspect".into(), "delivery".into()],
        DeviceKind::Quadruped => vec!["ground_move".into(), "inspect".into(), "rough_terrain".into()],
        DeviceKind::SensorHub => vec!["sense".into(), "report".into()],
        DeviceKind::ChargingBase => vec!["charge".into()],
    }
}

fn default_physical_profile(kind: DeviceKind, rules: &PhysicalRules) -> DevicePhysicalProfile {
    match kind {
        DeviceKind::Drone => DevicePhysicalProfile {
            min_work_altitude_m: rules.drone_min_altitude_m,
            max_work_altitude_m: rules.drone_max_altitude_m,
            max_slope_deg: 90.0,
            supported_materials: vec!["air".into()],
            nominal_power_w: 36.0,
            working_power_w: 180.0,
            max_speed_mps: 12.0,
            joint_count: 4,
        },
        DeviceKind::Humanoid => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 2.4,
            max_slope_deg: rules.humanoid_max_slope_deg,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 42.0,
            working_power_w: 260.0,
            max_speed_mps: 1.4,
            joint_count: 24,
        },
        DeviceKind::Quadruped => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 1.4,
            max_slope_deg: rules.quadruped_max_slope_deg,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 30.0,
            working_power_w: 180.0,
            max_speed_mps: 2.2,
            joint_count: 12,
        },
        DeviceKind::SensorHub => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 4.0,
            max_slope_deg: 8.0,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 6.0,
            working_power_w: 14.0,
            max_speed_mps: 0.0,
            joint_count: 0,
        },
        DeviceKind::ChargingBase => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 0.2,
            max_slope_deg: 3.0,
            supported_materials: vec!["concrete".into(), "asphalt".into()],
            nominal_power_w: 18.0,
            working_power_w: 22.0,
            max_speed_mps: 0.0,
            joint_count: 0,
        },
        DeviceKind::Rover => DevicePhysicalProfile {
            min_work_altitude_m: 0.0,
            max_work_altitude_m: 1.2,
            max_slope_deg: rules.rover_max_slope_deg,
            supported_materials: rules.ground_allowed_materials.clone(),
            nominal_power_w: 18.0,
            working_power_w: 90.0,
            max_speed_mps: 2.0,
            joint_count: 4,
        },
    }
}

fn default_device_name(kind: DeviceKind, index: usize) -> String {
    let prefix = match kind {
        DeviceKind::Rover => "地面设备",
        DeviceKind::Drone => "无人机",
        DeviceKind::Humanoid => "人形机器人",
        DeviceKind::Quadruped => "四足机器狗",
        DeviceKind::SensorHub => "传感器节点",
        DeviceKind::ChargingBase => "充电基站",
    };
    format!("{}-{}", prefix, index + 1)
}

fn climate_motion_scale(climate: Climate, kind: DeviceKind) -> f32 {
    match climate {
        Climate::Stormy => {
            if kind == DeviceKind::Drone {
                0.42
            } else {
                0.55
            }
        }
        Climate::Rainy => {
            if kind == DeviceKind::Drone {
                0.78
            } else {
                0.72
            }
        }
        Climate::Foggy => 0.86,
        Climate::Windy => {
            if kind == DeviceKind::Drone {
                0.68
            } else {
                0.94
            }
        }
        Climate::Cloudy | Climate::Clear => 1.0,
    }
}

fn climate_wind_mps(climate: Climate) -> f32 {
    match climate {
        Climate::Stormy => 16.0,
        Climate::Windy => 11.0,
        Climate::Rainy => 6.0,
        Climate::Cloudy => 4.0,
        Climate::Foggy => 2.0,
        Climate::Clear => 1.5,
    }
}

pub fn update_settings(state: &mut SimulationState, patch: SettingsPatch) -> Result<SimulationState> {
    // 这里把设置更新收敛到单一入口，避免前端分别改 settings 和 rules 导致状态漂移。
    if let Some(value) = patch.app_name {
        state.settings.app_name = value;
    }
    if let Some(value) = patch.language {
        state.settings.language = value;
    }
    if let Some(value) = patch.theme {
        state.settings.theme = value;
    }
    if let Some(value) = patch.auto_save {
        state.settings.auto_save = value;
    }
    if let Some(value) = patch.auto_save_every_tick {
        state.settings.auto_save_every_tick = value;
    }
    if let Some(value) = patch.default_world_name {
        state.settings.default_world_name = value;
    }
    if let Some(value) = patch.default_world_seed {
        state.settings.default_world_seed = value;
    }
    if let Some(value) = patch.default_world_size {
        state.settings.default_world_size = value;
    }
    if let Some(value) = patch.default_object_density {
        state.settings.default_object_density = value;
        state.world.rules.world.object_density = value;
    }
    if let Some(value) = patch.default_device_battery {
        state.settings.default_device_battery = value;
    }
    if let Some(value) = patch.default_tick_seconds {
        state.settings.default_tick_seconds = value;
    }
    if let Some(value) = patch.max_devices {
        state.settings.max_devices = value;
    }
    if let Some(value) = patch.log_level {
        state.settings.log_level = value;
    }
    if let Some(value) = patch.terminal_log_density {
        state.settings.terminal_log_density = value;
    }
    if let Some(value) = patch.map_notes {
        state.settings.map_notes = value;
    }
    if let Some(value) = patch.battery_moving_drain_per_tick {
        state.world.rules.battery.moving_drain_per_tick = value;
    }
    if let Some(value) = patch.battery_working_drain_per_tick {
        state.world.rules.battery.working_drain_per_tick = value;
    }
    if let Some(value) = patch.battery_idle_recharge_per_tick {
        state.world.rules.battery.idle_recharge_per_tick = value;
    }
    if let Some(value) = patch.battery_charging_recharge_per_tick {
        state.world.rules.battery.charging_recharge_per_tick = value;
    }
    if let Some(value) = patch.battery_low_threshold {
        state.world.rules.battery.low_battery_threshold = value;
    }
    if let Some(value) = patch.battery_critical_threshold {
        state.world.rules.battery.critical_battery_threshold = value;
    }
    if let Some(value) = patch.task_progress_per_tick {
        state.world.rules.task_planning.task_progress_per_tick = value;
    }
    if let Some(value) = patch.fallback_task_title {
        state.world.rules.task_planning.fallback_task_title = value;
    }
    if let Some(value) = patch.world_max_objects {
        state.world.rules.world.max_objects = value;
    }
    if let Some(value) = patch.drone_min_altitude_m {
        state.world.rules.physical.drone_min_altitude_m = value;
    }
    if let Some(value) = patch.drone_max_altitude_m {
        state.world.rules.physical.drone_max_altitude_m = value;
    }
    if let Some(value) = patch.rover_max_slope_deg {
        state.world.rules.physical.rover_max_slope_deg = value;
    }
    if let Some(value) = patch.humanoid_max_slope_deg {
        state.world.rules.physical.humanoid_max_slope_deg = value;
    }
    if let Some(value) = patch.quadruped_max_slope_deg {
        state.world.rules.physical.quadruped_max_slope_deg = value;
    }
    if let Some(value) = patch.ground_allowed_materials {
        state.world.rules.physical.ground_allowed_materials = value;
    }
    if let Some(value) = patch.max_active_tasks_per_device {
        state.world.rules.dispatch.max_active_tasks_per_device = value;
    }
    if let Some(value) = patch.prefer_nearest_device {
        state.world.rules.dispatch.prefer_nearest_device = value;
    }
    if let Some(value) = patch.requeue_unfinished_tasks_on_remove {
        state.world.rules.dispatch.requeue_unfinished_tasks_on_remove = value;
    }

    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "settings",
        "已更新设置和规则",
        Some(state.world.id),
    );
    Ok(state.clone())
}

pub fn generate_world(state: &mut SimulationState, input: GenerateWorldInput) -> Result<SimulationState> {
    let seed = input.seed.unwrap_or(state.settings.default_world_seed);
    let name = input
        .name
        .unwrap_or_else(|| state.settings.default_world_name.clone());
    let size = input.size.unwrap_or(state.settings.default_world_size);
    let density = input
        .object_density
        .unwrap_or(state.settings.default_object_density)
        .clamp(0.01, 1.0);

    let mut rng = StdRng::seed_from_u64(seed);
    let mut world = World::new(name, seed, size);
    world.rules.world.object_density = density;
    world.rules.world.max_objects = ((size.x * size.y * size.z / 120_000.0) * density * 64.0)
        .round()
        .clamp(8.0, 128.0) as usize;
    world.climate = *[
        Climate::Clear,
        Climate::Cloudy,
        Climate::Rainy,
        Climate::Foggy,
        Climate::Windy,
        Climate::Stormy,
    ]
    .choose(&mut rng)
    .unwrap_or(&Climate::Clear);
    world.terrain = TerrainProfile::Urban;

    // 连续城市数字孪生：先生成成网道路，再在街区内布置建筑、开放空间和能源节点。
    let blocks_per_axis = ((4.0 + density * 8.0).round() as usize).clamp(4, 8);
    let spacing_x = size.x.max(40.0) / blocks_per_axis as f32;
    let spacing_z = size.z.max(40.0) / blocks_per_axis as f32;
    let road_names = ["解放路", "中轴大道", "滨河路", "科创街", "人民路", "站前大道", "新华路", "云栖路"];
    let building_names = ["新华大厦", "城市运行中心", "数字孪生塔", "能源调度站", "市民服务楼", "轨交换乘楼"];

    for index in 0..=blocks_per_axis {
        let x = index as f32 * spacing_x;
        let z = index as f32 * spacing_z;

        let mut east_west = BTreeMap::new();
        east_west.insert("material".into(), "asphalt".into());
        east_west.insert("orientation".into(), "east_west".into());
        east_west.insert("continuous_grid".into(), "true".into());
        world.objects.push(WorldObject {
            id: Uuid::new_v4(),
            name: format!("{}-东西向", road_names[index % road_names.len()]),
            kind: WorldObjectKind::RoadSegment,
            position: Vector3::new(size.x / 2.0, 0.0, z),
            size: Vector3::new(size.x, 0.2, 3.2),
            tags: vec!["road_segment".into(), "urban_grid".into(), "continuous".into()],
            walkable: true,
            interactive: false,
            properties: east_west,
        });

        let mut north_south = BTreeMap::new();
        north_south.insert("material".into(), "asphalt".into());
        north_south.insert("orientation".into(), "north_south".into());
        north_south.insert("continuous_grid".into(), "true".into());
        world.objects.push(WorldObject {
            id: Uuid::new_v4(),
            name: format!("{}-南北向", road_names[(index + 3) % road_names.len()]),
            kind: WorldObjectKind::RoadSegment,
            position: Vector3::new(x, 0.0, size.z / 2.0),
            size: Vector3::new(3.2, 0.2, size.z),
            tags: vec!["road_segment".into(), "urban_grid".into(), "continuous".into()],
            walkable: true,
            interactive: false,
            properties: north_south,
        });
    }

    for block_x in 0..blocks_per_axis {
        for block_z in 0..blocks_per_axis {
            let center_x = block_x as f32 * spacing_x + spacing_x / 2.0;
            let center_z = block_z as f32 * spacing_z + spacing_z / 2.0;
            let district = (block_x + block_z) % building_names.len();
            let height = rng.gen_range(12.0..48.0);
            let mut properties = BTreeMap::new();
            properties.insert("material".into(), "concrete".into());
            properties.insert("block".into(), format!("{}-{}", block_x + 1, block_z + 1));
            properties.insert("digital_twin".into(), "true".into());

            world.objects.push(WorldObject {
                id: Uuid::new_v4(),
                name: format!("{}-{}-{}", building_names[district], block_x + 1, block_z + 1),
                kind: WorldObjectKind::Building,
                position: Vector3::new(center_x, 0.0, center_z),
                size: Vector3::new(spacing_x * 0.36, height, spacing_z * 0.36),
                tags: vec!["building".into(), "city_block".into(), "digital_twin".into()],
                walkable: false,
                interactive: false,
                properties,
            });

            if (block_x + block_z) % 3 == 0 {
                let mut plaza_properties = BTreeMap::new();
                plaza_properties.insert("material".into(), "grass".into());
                plaza_properties.insert("walkable".into(), "true".into());
                world.objects.push(WorldObject {
                    id: Uuid::new_v4(),
                    name: format!("城市开放空间-{}-{}", block_x + 1, block_z + 1),
                    kind: WorldObjectKind::TerrainPatch,
                    position: Vector3::new(center_x + spacing_x * 0.24, 0.0, center_z - spacing_z * 0.24),
                    size: Vector3::new(spacing_x * 0.22, 0.2, spacing_z * 0.22),
                    tags: vec!["terrain_patch".into(), "plaza".into(), "walkable".into()],
                    walkable: true,
                    interactive: false,
                    properties: plaza_properties,
                });
            }
        }
    }

    let mut landmark_properties = BTreeMap::new();
    landmark_properties.insert("material".into(), "glass_concrete".into());
    landmark_properties.insert("role".into(), "city_brain".into());
    world.objects.push(WorldObject {
        id: Uuid::new_v4(),
        name: "城市数字孪生中枢".into(),
        kind: WorldObjectKind::Landmark,
        position: Vector3::new(size.x / 2.0, 0.0, size.z / 2.0),
        size: Vector3::new(8.0, 58.0, 8.0),
        tags: vec!["landmark".into(), "digital_twin_core".into()],
        walkable: false,
        interactive: true,
        properties: landmark_properties,
    });

    let mut charging_properties = BTreeMap::new();
    charging_properties.insert("material".into(), "concrete".into());
    charging_properties.insert("power_kw".into(), "22".into());
    world.objects.push(WorldObject {
        id: Uuid::new_v4(),
        name: "城市能源补给站".into(),
        kind: WorldObjectKind::ChargingPad,
        position: Vector3::new(spacing_x, 0.0, spacing_z),
        size: Vector3::new(8.0, 0.3, 8.0),
        tags: vec!["charging_pad".into(), "energy_node".into(), "interactive".into()],
        walkable: true,
        interactive: true,
        properties: charging_properties,
    });

    state.world = world;
    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "world",
        format!("已生成随机世界，seed={seed}"),
        Some(state.world.id),
    );
    Ok(state.clone())
}

pub fn register_device(state: &mut SimulationState, input: RegisterDeviceInput) -> Result<SimulationState> {
    if state.world.devices.len() >= state.settings.max_devices {
        return Err(anyhow!("设备数量已达到上限 {}", state.settings.max_devices));
    }

    let kind = input.kind.unwrap_or(DeviceKind::Rover);
    let mut device = Device::default();
    device.name = if input.name.trim().is_empty() {
        default_device_name(kind, state.world.devices.len())
    } else {
        input.name
    };
    device.kind = kind;
    device.battery_capacity = input.battery_capacity.unwrap_or(100.0).max(1.0);
    device.battery = sanitize_battery(
        input.battery.unwrap_or(state.settings.default_device_battery),
        device.battery_capacity,
    );
    device.position = input.position.unwrap_or_default();
    device.physical_profile = input
        .physical_profile
        .unwrap_or_else(|| default_physical_profile(kind, &state.world.rules.physical));
    device.capabilities = input.capabilities.unwrap_or_else(|| device_kind_capabilities(kind));
    device.status = if device.battery <= state.world.rules.battery.critical_battery_threshold {
        DeviceStatus::Charging
    } else {
        DeviceStatus::Idle
    };
    device.created_at = now();
    device.updated_at = device.created_at;
    device.last_tick_at = None;
    state.world.devices.push(device.clone());
    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "device",
        format!("已注册设备 {}", device.name),
        Some(device.id),
    );
    Ok(state.clone())
}

pub fn remove_device(state: &mut SimulationState, device_id: Uuid) -> Result<SimulationState> {
    let pos = state
        .world
        .devices
        .iter()
        .position(|device| device.id == device_id)
        .ok_or_else(|| anyhow!("未找到设备 {}", device_id))?;

    let removed = state.world.devices.remove(pos);
    if state.world.rules.dispatch.requeue_unfinished_tasks_on_remove {
        for task in state
            .world
            .tasks
            .iter_mut()
            .filter(|task| task.assignee_device_id == Some(device_id) && task.status != TaskStatus::Done)
        {
            task.assignee_device_id = None;
            task.status = TaskStatus::Pending;
            task.updated_at = now();
        }
    } else {
        for task in state
            .world
            .tasks
            .iter_mut()
            .filter(|task| task.assignee_device_id == Some(device_id))
        {
            task.assignee_device_id = None;
            task.updated_at = now();
        }
    }
    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Warn,
        "device",
        format!("已移除设备 {}", removed.name),
        Some(device_id),
    );
    Ok(state.clone())
}

fn capability_matches(device: &Device, required_capabilities: &[String]) -> bool {
    if required_capabilities.is_empty() {
        return true;
    }

    required_capabilities.iter().all(|required| {
        let required = required.trim();
        !required.is_empty()
            && device.capabilities.iter().any(|capability| {
                capability.eq_ignore_ascii_case(required) || capability.to_lowercase().contains(&required.to_lowercase())
            })
    })
}

fn available_device_ids(
    state: &SimulationState,
    preferred: Option<DeviceKind>,
    required_capabilities: &[String],
    planned_counts: &BTreeMap<Uuid, usize>,
) -> Vec<Uuid> {
    let base = state
        .world
        .devices
        .iter()
        .filter(|device| device.active && device.status != DeviceStatus::Offline && device.battery > 0.0)
        .filter(|device| {
            let planned_count = planned_counts.get(&device.id).copied().unwrap_or(0);
            device.assigned_task_ids.len() + planned_count < state.world.rules.dispatch.max_active_tasks_per_device
        })
        .collect::<Vec<_>>();

    let mut candidates = base
        .iter()
        .copied()
        .filter(|device| preferred.map_or(true, |kind| device.kind == kind))
        .filter(|device| capability_matches(device, required_capabilities))
        .collect::<Vec<_>>();

    if candidates.is_empty() && preferred.is_some() {
        candidates = base
            .iter()
            .copied()
            .filter(|device| capability_matches(device, required_capabilities))
            .collect::<Vec<_>>();
    }

    if candidates.is_empty() && !required_capabilities.is_empty() {
        candidates = base
            .iter()
            .copied()
            .filter(|device| preferred.map_or(true, |kind| device.kind == kind))
            .collect::<Vec<_>>();
    }

    if candidates.is_empty() {
        candidates = base;
    }

    candidates.sort_by(|left, right| {
        let left_count = left.assigned_task_ids.len() + planned_counts.get(&left.id).copied().unwrap_or(0);
        let right_count = right.assigned_task_ids.len() + planned_counts.get(&right.id).copied().unwrap_or(0);
        let active_order = left_count.cmp(&right_count);
        if active_order != std::cmp::Ordering::Equal {
            return active_order;
        }

        if state.world.rules.dispatch.prefer_nearest_device {
            let left_score = left.position.x.abs() + left.position.y.abs() + left.position.z.abs();
            let right_score = right.position.x.abs() + right.position.y.abs() + right.position.z.abs();
            return left_score.total_cmp(&right_score);
        }

        right.battery.total_cmp(&left.battery)
    });

    candidates.into_iter().map(|device| device.id).collect()
}

fn planned_task_specs(plan: &LlmIntentResult) -> Vec<LlmPlannedTask> {
    if !plan.tasks.is_empty() {
        let tasks = plan
            .tasks
            .iter()
            .filter(|task| !task.title.trim().is_empty())
            .map(|task| LlmPlannedTask {
                title: task.title.trim().to_string(),
                description: task.description.clone(),
                preferred_device_kind: task.preferred_device_kind,
                required_capabilities: task.required_capabilities.clone(),
                priority: task.priority,
                estimated_ticks: task.estimated_ticks,
            })
            .collect::<Vec<_>>();
        if !tasks.is_empty() {
            return tasks;
        }
    }

    plan.task_titles
        .iter()
        .filter(|title| !title.trim().is_empty())
        .map(|title| LlmPlannedTask {
            title: title.trim().to_string(),
            description: None,
            preferred_device_kind: None,
            required_capabilities: Vec::new(),
            priority: None,
            estimated_ticks: None,
        })
        .collect()
}

fn create_blocked_planning_task(goal: &Goal, reason: &str) -> Task {
    let now = now();
    Task {
        id: Uuid::new_v4(),
        goal_id: goal.id,
        title: "等待中枢 LLM agents 规划".to_string(),
        description: format!("AR 眼镜目标已进入中枢网关，但尚未获得大模型 agents 规划结果：{reason}"),
        keywords: vec!["llm_agents".into(), "gateway_pending".into()],
        status: TaskStatus::Blocked,
        priority: goal.priority,
        estimated_ticks: 1,
        progress: 0.0,
        assignee_device_id: None,
        related_object_ids: Vec::new(),
        created_at: now,
        updated_at: now,
        completed_at: None,
    }
}

pub fn submit_goal(
    state: &mut SimulationState,
    input: SubmitGoalInput,
    llm_plan: Option<LlmIntentResult>,
    planner_error: Option<String>,
) -> Result<SimulationState> {
    let requested_by = input.requested_by.unwrap_or_else(|| "unknown".to_string());
    let description = input.description.unwrap_or_default();
    let fallback_priority = input.priority.unwrap_or(state.world.rules.task_planning.default_priority).clamp(1, 10);
    let priority = llm_plan
        .as_ref()
        .map(|plan| plan.priority.clamp(1, 10))
        .unwrap_or(fallback_priority);

    let mut goal = Goal::default();
    goal.title = input.title;
    goal.description = description.clone();
    goal.requested_by = requested_by;
    goal.keywords = input.keywords.unwrap_or_else(|| vec!["ar_glasses".into(), "llm_agents".into()]);
    goal.status = if llm_plan.is_some() { GoalStatus::Active } else { GoalStatus::Blocked };
    goal.priority = priority;
    goal.created_at = now();
    goal.updated_at = goal.created_at;

    if priority >= 9 {
        interrupt_active_work(state, &goal);
    }

    let mut task_templates: Vec<Task> = Vec::new();

    if let Some(plan) = llm_plan {
        let specs = planned_task_specs(&plan);
        if specs.is_empty() {
            goal.status = GoalStatus::Blocked;
            task_templates.push(create_blocked_planning_task(&goal, "LLM agents 返回了空任务列表"));
        } else {
            // 中枢网关只消费 LLM agents 给出的协同计划；这里不再按本地关键词拆任务。
            let mut planned_counts: BTreeMap<Uuid, usize> = BTreeMap::new();
            for spec in specs {
                let now = now();
                let required_capabilities = spec
                    .required_capabilities
                    .iter()
                    .map(|capability| capability.trim().to_string())
                    .filter(|capability| !capability.is_empty())
                    .collect::<Vec<_>>();
                let assignee = available_device_ids(state, spec.preferred_device_kind, &required_capabilities, &planned_counts)
                    .into_iter()
                    .next();
                if let Some(device_id) = assignee {
                    *planned_counts.entry(device_id).or_insert(0) += 1;
                }
                task_templates.push(Task {
                    id: Uuid::new_v4(),
                    goal_id: goal.id,
                    title: spec.title,
                    description: spec.description.unwrap_or_else(|| {
                        if description.is_empty() {
                            "由中枢 LLM agents 协同规划并下发执行".to_string()
                        } else {
                            description.clone()
                        }
                    }),
                    keywords: if required_capabilities.is_empty() {
                        vec!["llm_agents".into(), "gateway_dispatch".into()]
                    } else {
                        required_capabilities.clone()
                    },
                    status: if assignee.is_some() { TaskStatus::InProgress } else { TaskStatus::Pending },
                    priority: spec.priority.unwrap_or(priority).clamp(1, 10),
                    estimated_ticks: spec.estimated_ticks.unwrap_or(4).max(1),
                    progress: if assignee.is_some() { 0.04 } else { 0.0 },
                    assignee_device_id: assignee,
                    related_object_ids: Vec::new(),
                    created_at: now,
                    updated_at: now,
                    completed_at: None,
                });
            }
        }
    } else {
        let reason = planner_error.unwrap_or_else(|| "LLM agents 未配置".to_string());
        task_templates.push(create_blocked_planning_task(&goal, &reason));
        push_log(
            state,
            LogLevel::Warn,
            "gateway",
            format!("中枢 LLM agents 未完成规划：{reason}"),
            Some(goal.id),
        );
    }

    goal.task_ids = task_templates.iter().map(|task| task.id).collect();
    state.world.goals.push(goal.clone());
    state.world.tasks.extend(task_templates.clone());

    for task in &task_templates {
        if let Some(device_id) = task.assignee_device_id {
            if let Some(device) = state.world.devices.iter_mut().find(|device| device.id == device_id) {
                device.assigned_task_ids.push(task.id);
                device.current_task_id.get_or_insert(task.id);
                device.status = DeviceStatus::Working;
                device.last_tick_at = Some(now());
                device.updated_at = now();
            }
        }
    }

    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Info,
        "gateway",
        format!("AR 眼镜目标 {} 已进入中枢网关，LLM agents 生成 {} 个协同任务并立即指派可用终端", goal.title, task_templates.len()),
        Some(goal.id),
    );

    if task_templates.iter().any(|task| task.assignee_device_id.is_none()) {
        push_log(
            state,
            LogLevel::Warn,
            "gateway",
            "存在未指派任务：当前没有满足计划约束的可用终端",
            Some(goal.id),
        );
    }

    Ok(state.clone())
}

fn interrupt_active_work(state: &mut SimulationState, goal: &Goal) {
    for task in state.world.tasks.iter_mut().filter(|task| matches!(task.status, TaskStatus::Assigned | TaskStatus::InProgress)) {
        task.status = TaskStatus::Blocked;
        task.updated_at = now();
    }

    for device in &mut state.world.devices {
        device.assigned_task_ids.clear();
        device.current_task_id = None;
        if device.active && device.status != DeviceStatus::Offline {
            device.status = DeviceStatus::Idle;
        }
        device.updated_at = now();
    }

    push_log(
        state,
        LogLevel::Warn,
        "planner",
        format!("最高级目标 {} 已打断当前任务队列", goal.title),
        Some(goal.id),
    );
}

fn advance_task_and_device(state: &mut SimulationState, step_seconds: f32) {
    let progress_step = state.world.rules.task_planning.task_progress_per_tick.max(0.01) * step_seconds.max(0.1);
    let battery_rules = &state.world.rules.battery;

    for device in &mut state.world.devices {
        if !device.active || device.status == DeviceStatus::Offline {
            continue;
        }

        device.last_tick_at = Some(now());

        match device.status {
            DeviceStatus::Moving => {
                device.battery -= battery_rules.moving_drain_per_tick * step_seconds;
            }
            DeviceStatus::Working => {
                device.battery -= battery_rules.working_drain_per_tick * step_seconds;
            }
            DeviceStatus::Charging => {
                device.battery += battery_rules.charging_recharge_per_tick * step_seconds;
            }
            DeviceStatus::Idle => {
                device.battery += battery_rules.idle_recharge_per_tick * step_seconds;
            }
            DeviceStatus::Offline => {}
        }

        device.battery = sanitize_battery(device.battery, device.battery_capacity);
        if device.battery <= battery_rules.critical_battery_threshold {
            device.status = DeviceStatus::Charging;
        } else if device.status == DeviceStatus::Charging && device.battery >= 90.0 {
            device.status = DeviceStatus::Idle;
        }
        device.updated_at = now();
    }

    for task in &mut state.world.tasks {
        if matches!(task.status, TaskStatus::Done | TaskStatus::Cancelled) {
            continue;
        }

        if let Some(device_id) = task.assignee_device_id {
            if let Some(device) = state.world.devices.iter().find(|device| device.id == device_id) {
                if device.status == DeviceStatus::Offline {
                    task.status = TaskStatus::Blocked;
                    task.updated_at = now();
                    continue;
                }
            }
            task.status = TaskStatus::InProgress;
            task.progress += progress_step;
            if task.progress >= 1.0 {
                task.progress = 1.0;
                task.status = TaskStatus::Done;
                task.completed_at = Some(now());
                task.updated_at = now();
                if let Some(device) = state.world.devices.iter_mut().find(|device| device.id == device_id) {
                    device.assigned_task_ids.retain(|assigned| *assigned != task.id);
                    device.current_task_id = device.assigned_task_ids.first().copied();
                    if device.assigned_task_ids.is_empty() && device.battery > battery_rules.low_battery_threshold {
                        device.status = DeviceStatus::Idle;
                    }
                    device.updated_at = now();
                }
            } else if let Some(device) = state.world.devices.iter_mut().find(|device| device.id == device_id) {
                let weather_scale = climate_motion_scale(state.world.climate, device.kind);
                let wind = climate_wind_mps(state.world.climate);
                let step = device.physical_profile.max_speed_mps.max(0.1) * weather_scale * step_seconds.max(0.1);
                let heading_rad = device.orientation_deg.to_radians();
                let drift = if device.kind == DeviceKind::Drone { wind * 0.04 } else { wind * 0.006 } * step_seconds.max(0.1);
                device.position.x = (device.position.x + heading_rad.cos() * step + drift).clamp(0.0, state.world.size.x);
                device.position.z = (device.position.z + heading_rad.sin() * step + drift * 0.35).clamp(0.0, state.world.size.z);
                if device.kind == DeviceKind::Drone {
                    device.position.y = device
                        .position
                        .y
                        .max(device.physical_profile.min_work_altitude_m)
                        .min(device.physical_profile.max_work_altitude_m);
                }
                let task_factor = (task.priority as f32).max(1.0);
                device.orientation_deg = (device.orientation_deg + (5.0 + task_factor) * step_seconds) % 360.0;
                device.updated_at = now();
            }
        } else {
            task.status = TaskStatus::Pending;
            task.updated_at = now();
        }
    }

    let completed_goal_ids = state
        .world
        .goals
        .iter()
        .filter(|goal| goal.task_ids.iter().all(|task_id| {
            state
                .world
                .tasks
                .iter()
                .find(|task| task.id == *task_id)
                .map(|task| task.status == TaskStatus::Done)
                .unwrap_or(false)
        }))
        .map(|goal| goal.id)
        .collect::<Vec<_>>();

    for goal_id in completed_goal_ids {
        if let Some(goal) = state.world.goals.iter_mut().find(|goal| goal.id == goal_id) {
            goal.status = GoalStatus::Completed;
            goal.completed_at = Some(now());
            goal.updated_at = now();
        }
    }
}

pub fn tick_simulation(state: &mut SimulationState, input: TickInput) -> Result<SimulationState> {
    let steps = input.steps.unwrap_or(1).max(1);
    for _ in 0..steps {
        state.world.tick_index += 1;
        // 这里按 tick 推进设备状态、电量与任务进度，保持仿真链路单向可追踪。
        advance_task_and_device(state, state.settings.default_tick_seconds);

        if state.settings.auto_save_every_tick {
            state.world.updated_at = now();
        }

        if state.world.devices.iter().all(|device| device.battery <= 0.0) {
            push_log(
                state,
                LogLevel::Warn,
                "simulation",
                "所有设备电量已耗尽",
                Some(state.world.id),
            );
            break;
        }
    }

    state.world.updated_at = now();
    push_log(
        state,
        LogLevel::Debug,
        "simulation",
        format!("已推进 {} 个 tick", steps),
        Some(state.world.id),
    );
    Ok(state.clone())
}
