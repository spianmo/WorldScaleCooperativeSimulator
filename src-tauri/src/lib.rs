mod models;
mod llm;
mod simulation;
mod storage;

use anyhow::Context;
use llm::{LlmIntentRequest, LlmStreamLog, LlmStreamLogLevel};
use models::{
    Device, GenerateWorldInput, OpenWorldSnapshotInput, RegisterDeviceInput, SaveSnapshotInput,
    LogEntry, LogLevel, SavedPath, SettingsPatch, SimulationState, SubmitGoalInput, TickInput,
    WorldSnapshotRecord,
};
use chrono::Utc;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};
use uuid::Uuid;

pub struct AppStore {
    state: Mutex<SimulationState>,
    state_path: PathBuf,
    data_dir: PathBuf,
}

impl AppStore {
    fn load(data_dir: PathBuf) -> anyhow::Result<Self> {
        let state_path = data_dir.join("app_state.toml");
        let mut state = storage::load_state_from_path(&state_path)?;
        if let Some(llm_settings) = storage::load_llm_settings_from_project_config(&data_dir)? {
            state.settings.llm = llm_settings;
        }
        Ok(Self {
            state: Mutex::new(state),
            state_path,
            data_dir,
        })
    }

    fn persist(&self, state: &SimulationState) -> anyhow::Result<()> {
        storage::save_state_to_path(&self.state_path, state)
    }
}

fn with_state<F>(store: &State<'_, AppStore>, mutate: F) -> Result<SimulationState, String>
where
    F: FnOnce(&mut SimulationState) -> anyhow::Result<SimulationState>,
{
    let mut guard = store
        .state
        .lock()
        .map_err(|_| "仿真状态锁已被污染".to_string())?;
    let next_state = mutate(&mut guard).map_err(|error| error.to_string())?;

    if next_state.settings.auto_save {
        store
            .persist(&next_state)
            .map_err(|error| error.to_string())?;
    }

    *guard = next_state.clone();
    Ok(next_state)
}

fn persist_next_state(store: &State<'_, AppStore>, next_state: SimulationState) -> Result<SimulationState, String> {
    if next_state.settings.auto_save {
        store
            .persist(&next_state)
            .map_err(|error| error.to_string())?;
    }

    let mut guard = store
        .state
        .lock()
        .map_err(|_| "仿真状态锁已被污染".to_string())?;
    *guard = next_state.clone();
    Ok(next_state)
}

fn describe_device(device: &Device) -> String {
    format!(
        "{} kind={:?} status={:?} battery={:.0}/{:.0} capabilities=[{}]",
        device.name,
        device.kind,
        device.status,
        device.battery,
        device.battery_capacity,
        device.capabilities.join(",")
    )
}

fn build_device_summary(state: &SimulationState) -> String {
    if state.world.devices.is_empty() {
        return "当前尚未注册异构终端".to_string();
    }

    state
        .world
        .devices
        .iter()
        .map(describe_device)
        .collect::<Vec<_>>()
        .join("\n")
}

fn llm_log_level(level: LlmStreamLogLevel) -> LogLevel {
    match level {
        LlmStreamLogLevel::Debug => LogLevel::Debug,
        LlmStreamLogLevel::Info => LogLevel::Info,
        LlmStreamLogLevel::Warn => LogLevel::Warn,
    }
}

fn append_llm_logs(state: &mut SimulationState, logs: Vec<LlmStreamLog>) {
    state.world.logs.extend(logs.into_iter().map(|log| LogEntry {
        id: Uuid::new_v4(),
        timestamp: Utc::now(),
        level: llm_log_level(log.level),
        scope: "llm_sse".to_string(),
        message: log.message,
        entity_id: None,
        context: BTreeMap::new(),
    }));
}

#[tauri::command]
fn load_state(store: State<'_, AppStore>) -> Result<SimulationState, String> {
    store
        .state
        .lock()
        .map(|state| state.clone())
        .map_err(|_| "仿真状态锁已被污染".to_string())
}

#[tauri::command]
fn save_state(store: State<'_, AppStore>, state: SimulationState) -> Result<SimulationState, String> {
    store.persist(&state).map_err(|error| error.to_string())?;
    let mut guard = store
        .state
        .lock()
        .map_err(|_| "仿真状态锁已被污染".to_string())?;
    *guard = state.clone();
    Ok(state)
}

#[tauri::command]
fn update_settings(store: State<'_, AppStore>, patch: SettingsPatch) -> Result<SimulationState, String> {
    with_state(&store, |state| simulation::update_settings(state, patch))
}

#[tauri::command]
fn generate_world(
    store: State<'_, AppStore>,
    input: GenerateWorldInput,
) -> Result<SimulationState, String> {
    with_state(&store, |state| simulation::generate_world(state, input))
}

#[tauri::command]
fn register_device(
    store: State<'_, AppStore>,
    input: RegisterDeviceInput,
) -> Result<SimulationState, String> {
    with_state(&store, |state| simulation::register_device(state, input))
}

#[tauri::command]
fn remove_device(store: State<'_, AppStore>, device_id: Uuid) -> Result<SimulationState, String> {
    with_state(&store, |state| simulation::remove_device(state, device_id))
}

#[tauri::command]
async fn submit_goal(store: State<'_, AppStore>, input: SubmitGoalInput) -> Result<SimulationState, String> {
    let (llm_settings, device_summary) = {
        let guard = store
            .state
            .lock()
            .map_err(|_| "仿真状态锁已被污染".to_string())?;
        (guard.settings.llm.clone(), build_device_summary(&guard))
    };

    let user_goal = input
        .description
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| input.title.clone());

    let (llm_plan, planner_error, llm_logs) = if llm_settings.enabled {
        match llm::resolve_intent_with_logs(
            &llm_settings,
            LlmIntentRequest {
                user_goal,
                device_summary,
            },
        )
        .await
        {
            Ok(resolution) => (Some(resolution.plan), None, resolution.logs),
            Err(error) => (
                None,
                Some(error.to_string()),
                vec![LlmStreamLog {
                    level: LlmStreamLogLevel::Warn,
                    message: format!("LLM SSE 调用失败：{error}"),
                }],
            ),
        }
    } else {
        (
            None,
            Some("LLM agents 未启用；请在 config/llm.toml 设置 enabled = true 并填写 api_key".to_string()),
            vec![LlmStreamLog {
                level: LlmStreamLogLevel::Warn,
                message: "LLM SSE 未启动：LLM agents 未启用".to_string(),
            }],
        )
    };

    let next_state = {
        let mut guard = store
            .state
            .lock()
            .map_err(|_| "仿真状态锁已被污染".to_string())?;
        append_llm_logs(&mut guard, llm_logs);
        simulation::submit_goal(&mut guard, input, llm_plan, planner_error)
            .map_err(|error| error.to_string())?
    };

    persist_next_state(&store, next_state)
}

#[tauri::command]
fn tick_simulation(store: State<'_, AppStore>, input: TickInput) -> Result<SimulationState, String> {
    with_state(&store, |state| simulation::tick_simulation(state, input))
}

#[tauri::command]
fn save_world_snapshot(
    store: State<'_, AppStore>,
    input: SaveSnapshotInput,
) -> Result<SavedPath, String> {
    let state = store
        .state
        .lock()
        .map_err(|_| "仿真状态锁已被污染".to_string())?
        .clone();
    let snapshot_dir =
        storage::ensure_world_snapshot_dir(&store.data_dir).map_err(|error| error.to_string())?;
    let safe_name = input
        .snapshot_name
        .unwrap_or_else(|| format!("world_{}", state.world.id))
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' { ch } else { '_' })
        .collect::<String>();
    let path = snapshot_dir.join(format!("{safe_name}.toml"));
    storage::save_world_snapshot_to_path(&path, &state).map_err(|error| error.to_string())?;
    Ok(SavedPath {
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn list_world_snapshots(store: State<'_, AppStore>) -> Result<Vec<WorldSnapshotRecord>, String> {
    storage::list_world_snapshots(&store.data_dir).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_world_snapshot(
    store: State<'_, AppStore>,
    input: OpenWorldSnapshotInput,
) -> Result<SimulationState, String> {
    with_state(&store, |state| {
        let snapshot_dir = storage::ensure_world_snapshot_dir(&store.data_dir)?;
        let safe_name = input
            .snapshot_name
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' { ch } else { '_' })
            .collect::<String>();
        let path = snapshot_dir.join(format!("{safe_name}.toml"));
        let world = storage::load_world_snapshot_from_path(&path)?;
        state.world = world;
        Ok(state.clone())
    })
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .context("获取应用数据目录失败")?;
            let store = AppStore::load(data_dir)?;
            app.manage(store);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            update_settings,
            generate_world,
            register_device,
            remove_device,
            submit_goal,
            tick_simulation,
            save_world_snapshot,
            list_world_snapshots,
            open_world_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
