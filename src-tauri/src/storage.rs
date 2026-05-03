use crate::models::{LlmSettings, SimulationState, World, WorldSnapshotRecord};
use anyhow::{Context, Result};
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

pub fn save_state_to_path(path: &Path, state: &SimulationState) -> Result<()> {
    ensure_parent_dir(path)?;
    let content = toml::to_string_pretty(state).context("序列化状态为 TOML 失败")?;
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
    let snapshot = toml::to_string_pretty(&state.world).context("序列化世界快照失败")?;
    fs::write(path, snapshot).with_context(|| format!("写入世界快照失败: {}", path.display()))?;
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
            .map(|duration| duration.as_secs().to_string())
            .unwrap_or_else(|| "0".to_string());
        let snapshot_name = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_string();

        records.push(WorldSnapshotRecord {
            snapshot_name,
            path: path.display().to_string(),
            modified_at,
        });
    }

    records.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    Ok(records)
}

pub fn load_world_snapshot_from_path(path: &Path) -> Result<World> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("读取世界快照失败: {}", path.display()))?;
    let world = toml::from_str(&content)
        .with_context(|| format!("解析世界快照 TOML 失败: {}", path.display()))?;
    Ok(world)
}
