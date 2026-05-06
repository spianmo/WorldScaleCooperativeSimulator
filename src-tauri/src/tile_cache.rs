use anyhow::{Context, Result};
use filetime::{set_file_mtime, FileTime};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tokio::fs;
use tokio::sync::OnceCell;

static HTTP_CLIENT: OnceCell<Client> = OnceCell::const_new();

const UPSTREAM_BASE: &str = "https://tile.googleapis.com/v1/";
const CONFIG_FILE: &str = "tile_cache_config.toml";
const CACHE_DIR_NAME: &str = "tile_cache";
const META_SUFFIX: &str = ".meta";

pub struct TileResponse {
    pub bytes: Vec<u8>,
    pub content_type: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(default)]
pub struct TileCacheConfig {
    pub max_bytes: u64,
    pub ttl_days: u32,
}

impl Default for TileCacheConfig {
    fn default() -> Self {
        Self {
            max_bytes: 5 * 1024 * 1024 * 1024, // 5 GiB
            ttl_days: 30,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TileCacheStats {
    pub size_bytes: u64,
    pub file_count: u64,
    pub max_bytes: u64,
    pub ttl_days: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SweepReport {
    pub removed_files: u64,
    pub removed_bytes: u64,
}

pub fn cache_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(CACHE_DIR_NAME)
}

fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(CONFIG_FILE)
}

pub fn load_config(app_data_dir: &Path) -> TileCacheConfig {
    let path = config_path(app_data_dir);
    if !path.exists() {
        return TileCacheConfig::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => toml::from_str(&content).unwrap_or_default(),
        Err(_) => TileCacheConfig::default(),
    }
}

pub fn save_config(app_data_dir: &Path, config: &TileCacheConfig) -> Result<()> {
    std::fs::create_dir_all(app_data_dir)
        .with_context(|| format!("create app data dir: {}", app_data_dir.display()))?;
    let body = toml::to_string_pretty(config).context("serialize tile cache config")?;
    std::fs::write(config_path(app_data_dir), body)
        .with_context(|| format!("write tile cache config: {}", config_path(app_data_dir).display()))?;
    Ok(())
}

pub async fn serve_tile(cache_root: &Path, path_and_query: &str) -> Result<TileResponse> {
    let upstream_url = format!("{UPSTREAM_BASE}{path_and_query}");
    let path_only = path_and_query
        .split_once('?')
        .map(|(p, _)| p)
        .unwrap_or(path_and_query);

    let cacheable = !path_only.ends_with(".json") && !path_only.is_empty();

    if cacheable {
        if let Some(hit) = read_cache(cache_root, path_only).await? {
            return Ok(hit);
        }
    }

    let client = HTTP_CLIENT.get_or_init(|| async { Client::new() }).await;
    let resp = client
        .get(&upstream_url)
        .send()
        .await
        .with_context(|| format!("upstream fetch failed: {upstream_url}"))?
        .error_for_status()
        .with_context(|| format!("upstream returned error status: {upstream_url}"))?;

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let bytes = resp.bytes().await?.to_vec();

    if cacheable {
        write_cache(cache_root, path_only, &bytes, &content_type).await;
    }

    Ok(TileResponse { bytes, content_type })
}

async fn read_cache(cache_root: &Path, path_only: &str) -> Result<Option<TileResponse>> {
    let (bin_path, meta_path) = cache_paths(cache_root, path_only);
    if !fs::try_exists(&bin_path).await.unwrap_or(false)
        || !fs::try_exists(&meta_path).await.unwrap_or(false)
    {
        return Ok(None);
    }
    let bytes = fs::read(&bin_path).await?;
    let content_type = fs::read_to_string(&meta_path).await?;
    // 命中后更新 mtime，使 LRU 淘汰排序基于"最近一次访问时间"。
    let now = FileTime::from_system_time(SystemTime::now());
    let _ = set_file_mtime(&bin_path, now);
    let _ = set_file_mtime(&meta_path, now);
    Ok(Some(TileResponse {
        bytes,
        content_type: content_type.trim().to_string(),
    }))
}

async fn write_cache(cache_root: &Path, path_only: &str, bytes: &[u8], content_type: &str) {
    let (bin_path, meta_path) = cache_paths(cache_root, path_only);
    if let Some(parent) = bin_path.parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    let _ = fs::write(&bin_path, bytes).await;
    let _ = fs::write(&meta_path, content_type).await;
}

fn cache_paths(cache_root: &Path, path_only: &str) -> (PathBuf, PathBuf) {
    let key = cache_key(path_only);
    let prefix = &key[..2];
    let dir = cache_root.join(prefix);
    (dir.join(&key), dir.join(format!("{key}{META_SUFFIX}")))
}

fn cache_key(path_only: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path_only.as_bytes());
    let digest = hasher.finalize();
    hex::encode(&digest[..16])
}

pub async fn stats(cache_root: &Path, config: &TileCacheConfig) -> TileCacheStats {
    let (size_bytes, file_count) = walk_size(cache_root).await;
    TileCacheStats {
        size_bytes,
        file_count,
        max_bytes: config.max_bytes,
        ttl_days: config.ttl_days,
    }
}

pub async fn clear(cache_root: &Path) -> Result<()> {
    if !fs::try_exists(cache_root).await.unwrap_or(false) {
        return Ok(());
    }
    fs::remove_dir_all(cache_root)
        .await
        .with_context(|| format!("remove cache dir: {}", cache_root.display()))?;
    fs::create_dir_all(cache_root)
        .await
        .with_context(|| format!("recreate cache dir: {}", cache_root.display()))?;
    Ok(())
}

pub async fn sweep(cache_root: &Path, config: &TileCacheConfig) -> Result<SweepReport> {
    if !fs::try_exists(cache_root).await.unwrap_or(false) {
        return Ok(SweepReport::default());
    }

    let mut entries = collect_entries(cache_root).await;
    let now = SystemTime::now();
    let mut removed_files: u64 = 0;
    let mut removed_bytes: u64 = 0;

    // Pass 1: TTL eviction (drops both bin + meta sharing the same key).
    if config.ttl_days > 0 {
        let ttl = std::time::Duration::from_secs(u64::from(config.ttl_days) * 86_400);
        let cutoff = now.checked_sub(ttl).unwrap_or(SystemTime::UNIX_EPOCH);
        entries.retain(|entry| {
            if entry.modified < cutoff {
                if std::fs::remove_file(&entry.path).is_ok() {
                    removed_files += 1;
                    removed_bytes += entry.size;
                }
                false
            } else {
                true
            }
        });
    }

    // Pass 2: LRU until under max_bytes.
    let mut total: u64 = entries.iter().map(|e| e.size).sum();
    if total > config.max_bytes {
        entries.sort_by_key(|entry| entry.modified);
        for entry in &entries {
            if total <= config.max_bytes {
                break;
            }
            if std::fs::remove_file(&entry.path).is_ok() {
                removed_files += 1;
                removed_bytes += entry.size;
                total = total.saturating_sub(entry.size);
            }
        }
    }

    Ok(SweepReport {
        removed_files,
        removed_bytes,
    })
}

struct CacheEntry {
    path: PathBuf,
    size: u64,
    modified: SystemTime,
}

async fn collect_entries(root: &Path) -> Vec<CacheEntry> {
    let root = root.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let mut entries = Vec::new();
        let mut stack = vec![root];
        while let Some(dir) = stack.pop() {
            let read_dir = match std::fs::read_dir(&dir) {
                Ok(rd) => rd,
                Err(_) => continue,
            };
            for entry in read_dir.flatten() {
                let path = entry.path();
                let Ok(metadata) = entry.metadata() else { continue };
                if metadata.is_dir() {
                    stack.push(path);
                    continue;
                }
                if metadata.is_file() {
                    let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                    entries.push(CacheEntry {
                        path,
                        size: metadata.len(),
                        modified,
                    });
                }
            }
        }
        entries
    })
    .await
    .unwrap_or_default()
}

async fn walk_size(root: &Path) -> (u64, u64) {
    let entries = collect_entries(root).await;
    let bytes = entries.iter().map(|e| e.size).sum();
    let count = entries
        .iter()
        .filter(|e| {
            e.path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext != "meta")
                .unwrap_or(true)
        })
        .count() as u64;
    (bytes, count)
}
