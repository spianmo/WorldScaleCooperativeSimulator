mod llm;
mod models;
mod simulation;
mod storage;
mod tile_cache;

#[cfg(target_os = "macos")]
mod macos_location;

use anyhow::Context;
use chrono::Utc;
use llm::{LlmIntentRequest, LlmStreamLog, LlmStreamLogLevel};
use models::{
    Device, GenerateWorldInput, LogEntry, LogLevel, OpenWorldSnapshotInput, RegisterDeviceInput,
    SaveSnapshotInput, SavedPath, SettingsPatch, SimulationState, SubmitGoalInput, TickInput,
    WorldSnapshotRecord,
};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};
use tile_cache::{SweepReport, TileCacheConfig, TileCacheStats};
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
        if let Some(map_settings) = storage::load_map_settings_from_project_config(&data_dir)? {
            state.settings.maps = map_settings;
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

fn persist_next_state(
    store: &State<'_, AppStore>,
    next_state: SimulationState,
) -> Result<SimulationState, String> {
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
    state
        .world
        .logs
        .extend(logs.into_iter().map(|log| LogEntry {
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
fn save_state(
    store: State<'_, AppStore>,
    state: SimulationState,
) -> Result<SimulationState, String> {
    store.persist(&state).map_err(|error| error.to_string())?;
    let mut guard = store
        .state
        .lock()
        .map_err(|_| "仿真状态锁已被污染".to_string())?;
    *guard = state.clone();
    Ok(state)
}

#[tauri::command]
fn update_settings(
    store: State<'_, AppStore>,
    patch: SettingsPatch,
) -> Result<SimulationState, String> {
    with_state(&store, |state| simulation::update_settings(state, patch))
}

#[tauri::command]
async fn generate_world(
    store: State<'_, AppStore>,
    input: GenerateWorldInput,
) -> Result<SimulationState, String> {
    let mut next_state = store
        .state
        .lock()
        .map_err(|_| "仿真状态锁已被污染".to_string())?
        .clone();
    simulation::generate_world(&mut next_state, input)
        .await
        .map_err(|error| error.to_string())?;
    persist_next_state(&store, next_state)
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
async fn submit_goal(
    store: State<'_, AppStore>,
    input: SubmitGoalInput,
) -> Result<SimulationState, String> {
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
            Some(
                "LLM agents 未启用；请在 config/llm.toml 设置 enabled = true 并填写 api_key"
                    .to_string(),
            ),
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
fn tick_simulation(
    store: State<'_, AppStore>,
    input: TickInput,
) -> Result<SimulationState, String> {
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
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
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

#[derive(serde::Serialize, Clone, Debug)]
pub struct NativeLocationResponse {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude_m: Option<f64>,
    pub accuracy_m: Option<f64>,
    pub source: String,
}

#[tauri::command]
async fn resolve_native_location() -> Result<NativeLocationResponse, String> {
    #[cfg(target_os = "macos")]
    {
        // CoreLocation 必须运行在带 NSRunLoop 的线程上；用 spawn_blocking 避免阻塞 tokio。
        tauri::async_runtime::spawn_blocking(|| {
            macos_location::request_native_location(15.0).map(|coords| NativeLocationResponse {
                latitude: coords.latitude,
                longitude: coords.longitude,
                altitude_m: Some(coords.altitude_m),
                accuracy_m: Some(coords.horizontal_accuracy_m),
                source: "macOS CoreLocation".to_string(),
            })
        })
        .await
        .map_err(|e| format!("CoreLocation 任务调度失败：{e}"))?
    }

    #[cfg(not(target_os = "macos"))]
    {
        Err("当前平台未实现原生定位".to_string())
    }
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct IpLocationResponse {
    pub latitude: f64,
    pub longitude: f64,
    pub accuracy_m: Option<f64>,
    pub city: Option<String>,
    pub region: Option<String>,
    pub country: Option<String>,
    pub source: String,
}

async fn fetch_ipapi_co() -> anyhow::Result<IpLocationResponse> {
    let response = reqwest::Client::builder()
        .build()?
        .get("https://ipapi.co/json/")
        .header("User-Agent", "world-scale-simulator/0.1 (Tauri)")
        .send()
        .await?;
    if !response.status().is_success() {
        anyhow::bail!("ipapi.co HTTP {}", response.status());
    }

    #[derive(serde::Deserialize)]
    struct Body {
        latitude: Option<f64>,
        longitude: Option<f64>,
        city: Option<String>,
        region: Option<String>,
        country_name: Option<String>,
        error: Option<bool>,
        reason: Option<String>,
    }
    let body = response.json::<Body>().await?;
    if body.error.unwrap_or(false) {
        anyhow::bail!(
            "ipapi.co error: {}",
            body.reason.unwrap_or_else(|| "unknown".to_string())
        );
    }
    let lat = body.latitude.context("ipapi.co 缺少 latitude")?;
    let lon = body.longitude.context("ipapi.co 缺少 longitude")?;
    Ok(IpLocationResponse {
        latitude: lat,
        longitude: lon,
        accuracy_m: None,
        city: body.city,
        region: body.region,
        country: body.country_name,
        source: "ipapi.co".to_string(),
    })
}

async fn fetch_ipwhois() -> anyhow::Result<IpLocationResponse> {
    let response = reqwest::Client::builder()
        .build()?
        .get("https://ipwho.is/")
        .header("User-Agent", "world-scale-simulator/0.1 (Tauri)")
        .send()
        .await?;
    if !response.status().is_success() {
        anyhow::bail!("ipwho.is HTTP {}", response.status());
    }

    #[derive(serde::Deserialize)]
    struct Body {
        success: Option<bool>,
        message: Option<String>,
        latitude: Option<f64>,
        longitude: Option<f64>,
        city: Option<String>,
        region: Option<String>,
        country: Option<String>,
    }
    let body = response.json::<Body>().await?;
    if !body.success.unwrap_or(true) {
        anyhow::bail!(
            "ipwho.is error: {}",
            body.message.unwrap_or_else(|| "unknown".to_string())
        );
    }
    let lat = body.latitude.context("ipwho.is 缺少 latitude")?;
    let lon = body.longitude.context("ipwho.is 缺少 longitude")?;
    Ok(IpLocationResponse {
        latitude: lat,
        longitude: lon,
        accuracy_m: None,
        city: body.city,
        region: body.region,
        country: body.country,
        source: "ipwho.is".to_string(),
    })
}

#[tauri::command]
async fn resolve_ip_location() -> Result<IpLocationResponse, String> {
    match fetch_ipapi_co().await {
        Ok(value) => Ok(value),
        Err(primary_error) => match fetch_ipwhois().await {
            Ok(value) => Ok(value),
            Err(fallback_error) => Err(format!(
                "ipapi.co 失败：{primary_error}; ipwho.is 失败：{fallback_error}"
            )),
        },
    }
}

#[tauri::command]
async fn tile_cache_get_config(store: State<'_, AppStore>) -> Result<TileCacheConfig, String> {
    Ok(tile_cache::load_config(&store.data_dir))
}

#[tauri::command]
async fn tile_cache_set_config(
    store: State<'_, AppStore>,
    config: TileCacheConfig,
) -> Result<TileCacheStats, String> {
    tile_cache::save_config(&store.data_dir, &config).map_err(|e| e.to_string())?;
    let cache_root = tile_cache::cache_root(&store.data_dir);
    let _ = tile_cache::sweep(&cache_root, &config)
        .await
        .map_err(|e| e.to_string())?;
    Ok(tile_cache::stats(&cache_root, &config).await)
}

#[tauri::command]
async fn tile_cache_stats(store: State<'_, AppStore>) -> Result<TileCacheStats, String> {
    let config = tile_cache::load_config(&store.data_dir);
    let cache_root = tile_cache::cache_root(&store.data_dir);
    Ok(tile_cache::stats(&cache_root, &config).await)
}

#[tauri::command]
async fn tile_cache_clear(store: State<'_, AppStore>) -> Result<TileCacheStats, String> {
    let cache_root = tile_cache::cache_root(&store.data_dir);
    tile_cache::clear(&cache_root).await.map_err(|e| e.to_string())?;
    let config = tile_cache::load_config(&store.data_dir);
    Ok(tile_cache::stats(&cache_root, &config).await)
}

#[tauri::command]
async fn tile_cache_sweep(store: State<'_, AppStore>) -> Result<SweepReport, String> {
    let config = tile_cache::load_config(&store.data_dir);
    let cache_root = tile_cache::cache_root(&store.data_dir);
    tile_cache::sweep(&cache_root, &config)
        .await
        .map_err(|e| e.to_string())
}

// 通过 IPC 直接返回瓦片字节（绕过 WKWebView 自定义 scheme 在 XHR 上的兼容性问题）。
// 前端 monkey-patch Cesium Resource.loadWithXhr 时调用，命中则走本地缓存，未命中则上游回源并落盘。
#[tauri::command]
async fn tile_cache_fetch(
    store: State<'_, AppStore>,
    path_and_query: String,
) -> Result<tauri::ipc::Response, String> {
    let cache_root = tile_cache::cache_root(&store.data_dir);
    let _ = tokio::fs::create_dir_all(&cache_root).await;
    eprintln!("[tile-cache] fetch start: {}", path_and_query);
    match tile_cache::serve_tile(&cache_root, &path_and_query).await {
        Ok(resp) => {
            eprintln!(
                "[tile-cache] fetch ok: {} bytes={} type={}",
                path_and_query,
                resp.bytes.len(),
                resp.content_type
            );
            Ok(tauri::ipc::Response::new(resp.bytes))
        }
        Err(error) => {
            eprintln!(
                "[tile-cache] fetch err: {} -> chain: {:#}",
                path_and_query, error
            );
            Err(format!("{error:#}"))
        }
    }
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
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                    ch
                } else {
                    '_'
                }
            })
            .collect::<String>();
        let path = snapshot_dir.join(format!("{safe_name}.toml"));
        let world = storage::load_world_snapshot_from_path(&path)?;
        state.world = world;
        Ok(state.clone())
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_geolocation::init())
        .register_asynchronous_uri_scheme_protocol("tilecache", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                // tilecache://g/v1/<path>?<query>
                let uri = request.uri();
                let path = uri.path().trim_start_matches('/');
                let path_after = path
                    .strip_prefix("g/v1/")
                    .or_else(|| path.strip_prefix("v1/"))
                    .unwrap_or(path);
                let path_and_query = match uri.query() {
                    Some(q) => format!("{path_after}?{q}"),
                    None => path_after.to_string(),
                };

                let cache_root = match app.path().app_data_dir() {
                    Ok(d) => tile_cache::cache_root(&d),
                    Err(error) => {
                        let body = format!("no data dir: {error}").into_bytes();
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(500)
                                .body(body)
                                .unwrap(),
                        );
                        return;
                    }
                };
                let _ = tokio::fs::create_dir_all(&cache_root).await;

                match tile_cache::serve_tile(&cache_root, &path_and_query).await {
                    Ok(resp) => {
                        let response = tauri::http::Response::builder()
                            .status(200)
                            .header("content-type", resp.content_type)
                            .header("access-control-allow-origin", "*")
                            .header("cache-control", "public, max-age=3600")
                            .body(resp.bytes)
                            .unwrap();
                        responder.respond(response);
                    }
                    Err(error) => {
                        let body = format!("upstream error: {error}").into_bytes();
                        responder.respond(
                            tauri::http::Response::builder()
                                .status(502)
                                .body(body)
                                .unwrap(),
                        );
                    }
                }
            });
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir().context("获取应用数据目录失败")?;
            let store = AppStore::load(data_dir.clone())?;
            app.manage(store);
            // 在 HTTP_CLIENT 第一次构建之前固化代理选择：
            // 显式 proxy_url（来自 tile_cache_config.toml）优先；否则回落到 macOS 系统代理 / 环境变量。
            let initial_config = tile_cache::load_config(&data_dir);
            tile_cache::set_proxy_override(initial_config.proxy_url.clone());
            // 启动时异步跑一次 LRU/TTL 清理，不阻塞窗口创建。
            tauri::async_runtime::spawn(async move {
                let config = tile_cache::load_config(&data_dir);
                let cache_root = tile_cache::cache_root(&data_dir);
                let _ = tile_cache::sweep(&cache_root, &config).await;
            });
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
            open_world_snapshot,
            resolve_ip_location,
            resolve_native_location,
            tile_cache_get_config,
            tile_cache_set_config,
            tile_cache_stats,
            tile_cache_clear,
            tile_cache_sweep,
            tile_cache_fetch
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用失败");
}
