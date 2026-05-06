use crate::models::{LlmSettings, MapProviderSettings, SimulationState, World, WorldSnapshotRecord};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("创建目录失败: {}", parent.display()))?;
    }
    Ok(())
}

pub fn load_state_from_path(path: &Path) -> Result<SimulationState> {
    if !path.exists() {
        return Ok(SimulationState::default());
    }

    let content = fs::read_to_string(path)
        .with_context(|| format!("读取状态文件失败: {}", path.display()))?;
    let state = toml::from_str(&content)
        .with_context(|| format!("解析 TOML 状态失败: {}", path.display()))?;
    Ok(state)
}

pub fn load_llm_settings_from_project_config(data_dir: &Path) -> Result<Option<LlmSettings>> {
    let mut candidates = Vec::new();
    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        if let Some(project_dir) = Path::new(manifest_dir).parent() {
            candidates.push(project_dir.join("config").join("llm.toml"));
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("config").join("llm.toml"));
    }
    candidates.push(data_dir.join("config").join("llm.toml"));
    candidates.push(data_dir.join("llm.toml"));

    for path in candidates {
        if !path.exists() {
            continue;
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("读取 LLM 配置失败: {}", path.display()))?;
        let settings = toml::from_str::<LlmSettings>(&content)
            .with_context(|| format!("解析 LLM 配置失败: {}", path.display()))?;
        return Ok(Some(settings));
    }

    Ok(None)
}

pub fn load_map_settings_from_project_config(data_dir: &Path) -> Result<Option<MapProviderSettings>> {
    let settings = load_map_settings_from_candidates(map_settings_candidates(data_dir))?;
    if settings.is_some() {
        return Ok(settings);
    }

    let mut settings = MapProviderSettings::default();
    settings.google_maps.api_key = resolve_optional_secret(
        settings.google_maps.api_key,
        &settings.google_maps.api_key_env,
    );
    settings.cesium_ion.token = resolve_optional_secret(
        settings.cesium_ion.token,
        &settings.cesium_ion.token_env,
    );

    if settings.google_maps.api_key.is_some() || settings.cesium_ion.token.is_some() {
        return Ok(Some(settings));
    }

    Ok(None)
}

fn map_settings_candidates(data_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") {
        if let Some(project_dir) = Path::new(manifest_dir).parent() {
            candidates.push(project_dir.join("config").join("maps.toml"));
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("config").join("maps.toml"));
    }
    candidates.push(data_dir.join("config").join("maps.toml"));
    candidates.push(data_dir.join("maps.toml"));
    candidates
}

fn load_map_settings_from_candidates(candidates: Vec<PathBuf>) -> Result<Option<MapProviderSettings>> {
    for path in candidates {
        if !path.exists() {
            continue;
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("读取地图配置失败: {}", path.display()))?;
        let mut settings = toml::from_str::<MapProviderSettings>(&content)
            .with_context(|| format!("解析地图配置失败: {}", path.display()))?;

        // TOML 明文配置优先；为空时允许从环境变量兜底，便于 preview/CI smoke 使用。
        settings.google_maps.api_key = resolve_optional_secret(
            settings.google_maps.api_key,
            &settings.google_maps.api_key_env,
        );
        settings.cesium_ion.token = resolve_optional_secret(
            settings.cesium_ion.token,
            &settings.cesium_ion.token_env,
        );

        return Ok(Some(settings));
    }

    Ok(None)
}

fn resolve_optional_secret(value: Option<String>, env_name: &str) -> Option<String> {
    value
        .and_then(trim_optional_secret)
        .or_else(|| std::env::var(env_name).ok().and_then(trim_optional_secret))
}

fn trim_optional_secret(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn save_state_to_path(path: &Path, state: &SimulationState) -> Result<()> {
    ensure_parent_dir(path)?;
    let mut persisted_state = state.clone();
    persisted_state.settings.llm.api_key = None;
    persisted_state.settings.maps.google_maps.api_key = None;
    persisted_state.settings.maps.cesium_ion.token = None;

    let content = toml::to_string_pretty(&persisted_state).context("序列化状态为 TOML 失败")?;
    fs::write(path, content).with_context(|| format!("写入状态文件失败: {}", path.display()))?;
    Ok(())
}

pub fn ensure_world_snapshot_dir(base_dir: &Path) -> Result<PathBuf> {
    let snapshot_dir = base_dir.join("worlds");
    fs::create_dir_all(&snapshot_dir)
        .with_context(|| format!("创建世界快照目录失败: {}", snapshot_dir.display()))?;
    Ok(snapshot_dir)
}

pub fn save_world_snapshot_to_path(path: &Path, state: &SimulationState) -> Result<()> {
    ensure_parent_dir(path)?;
    // 用一份 redact 后的 SimulationState 作为快照载体，确保设备/任务/目标/日志/物理规则
    // 与运行时设置一并落盘；同时保留对仅含 World 的旧版快照文件的读取兼容。
    let mut persisted = state.clone();
    persisted.settings.llm.api_key = None;
    persisted.settings.maps.google_maps.api_key = None;
    persisted.settings.maps.cesium_ion.token = None;

    let content = toml::to_string_pretty(&persisted).context("序列化世界快照失败")?;
    fs::write(path, content).with_context(|| format!("写入世界快照失败: {}", path.display()))?;
    Ok(())
}

pub fn list_world_snapshots(base_dir: &Path) -> Result<Vec<WorldSnapshotRecord>> {
    let snapshot_dir = ensure_world_snapshot_dir(base_dir)?;
    let mut records = Vec::new();

    for entry in fs::read_dir(&snapshot_dir)
        .with_context(|| format!("读取世界快照目录失败: {}", snapshot_dir.display()))?
    {
        let entry = entry.with_context(|| format!("读取世界快照条目失败: {}", snapshot_dir.display()))?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("toml") {
            continue;
        }

        let metadata = entry
            .metadata()
            .with_context(|| format!("读取世界快照元数据失败: {}", path.display()))?;
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| {
                let secs = duration.as_secs() as i64;
                let nanos = duration.subsec_nanos();
                DateTime::<Utc>::from_timestamp(secs, nanos)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| secs.to_string())
            })
            .unwrap_or_default();
        let snapshot_name = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_string();

        let world_meta = load_world_snapshot_from_path(&path).ok().map(|snapshot| match snapshot {
            LoadedWorldSnapshot::Full(state) => state.world,
            LoadedWorldSnapshot::WorldOnly(world) => world,
        });
        let world_name = world_meta.as_ref().map(|world| world.name.clone());
        let world_created_at = world_meta.as_ref().map(|world| world.created_at.to_rfc3339());
        let world_updated_at = world_meta.as_ref().map(|world| world.updated_at.to_rfc3339());

        records.push(WorldSnapshotRecord {
            snapshot_name,
            path: path.display().to_string(),
            modified_at,
            world_name,
            world_created_at,
            world_updated_at,
        });
    }

    records.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    Ok(records)
}

pub enum LoadedWorldSnapshot {
    Full(SimulationState),
    WorldOnly(World),
}

pub fn load_world_snapshot_from_path(path: &Path) -> Result<LoadedWorldSnapshot> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("读取世界快照失败: {}", path.display()))?;
    // 新版快照是完整 SimulationState；解析失败时回退到旧版仅含 World 的格式。
    if let Ok(state) = toml::from_str::<SimulationState>(&content) {
        return Ok(LoadedWorldSnapshot::Full(state));
    }
    let world = toml::from_str::<World>(&content)
        .with_context(|| format!("解析世界快照 TOML 失败: {}", path.display()))?;
    Ok(LoadedWorldSnapshot::WorldOnly(world))
}

pub fn delete_world_snapshot(base_dir: &Path, snapshot_name: &str) -> Result<()> {
    let snapshot_dir = ensure_world_snapshot_dir(base_dir)?;
    let safe_name: String = snapshot_name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let path = snapshot_dir.join(format!("{safe_name}.toml"));
    if !path.exists() {
        anyhow::bail!("世界快照不存在: {}", path.display());
    }
    fs::remove_file(&path)
        .with_context(|| format!("删除世界快照失败: {}", path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("worldsim-{name}-{}", Uuid::new_v4()))
    }

    #[test]
    fn load_map_settings_reads_maps_toml_from_config_dir() {
        let data_dir = temp_path("maps-config");
        let config_dir = data_dir.join("config");
        fs::create_dir_all(&config_dir).expect("创建临时 config 目录");
        fs::write(
            config_dir.join("maps.toml"),
            r#"
[google_maps]
api_key = " google-key-from-toml "
api_key_env = "PUBLIC_GOOGLE_MAPS_API_KEY"

[cesium_ion]
token = " cesium-token-from-toml "
token_env = "PUBLIC_CESIUM_ION_TOKEN"
"#,
        )
        .expect("写入临时 maps.toml");

        let settings = load_map_settings_from_candidates(vec![config_dir.join("maps.toml")])
            .expect("读取地图配置")
            .expect("地图配置存在");

        assert_eq!(settings.google_maps.api_key.as_deref(), Some("google-key-from-toml"));
        assert_eq!(settings.cesium_ion.token.as_deref(), Some("cesium-token-from-toml"));
    }

    #[test]
    fn save_state_to_path_redacts_runtime_credentials() {
        let path = temp_path("state-redaction").join("app_state.toml");
        let mut state = SimulationState::default();
        state.settings.llm.api_key = Some("llm-secret".to_string());
        state.settings.maps.google_maps.api_key = Some("google-secret".to_string());
        state.settings.maps.cesium_ion.token = Some("cesium-secret".to_string());

        save_state_to_path(&path, &state).expect("写入状态");
        let content = fs::read_to_string(&path).expect("读取状态");

        assert!(!content.contains("llm-secret"));
        assert!(!content.contains("google-secret"));
        assert!(!content.contains("cesium-secret"));
    }
}
