use anyhow::{Context, Result};
use filetime::{set_file_mtime, FileTime};
use reqwest::{Client, Proxy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use tokio::fs;
use tokio::sync::OnceCell;

static HTTP_CLIENT: OnceCell<Client> = OnceCell::const_new();
static PROXY_OVERRIDE: OnceLock<Option<String>> = OnceLock::new();

/// 在构建 HTTP_CLIENT 之前调用，可固定一个上游代理 URL（如 `http://127.0.0.1:7890`）。
/// 仅在第一次调用前生效；之后再改不会重建已缓存的 Client。
pub fn set_proxy_override(url: Option<String>) {
    let _ = PROXY_OVERRIDE.set(url);
}

async fn http_client() -> &'static Client {
    HTTP_CLIENT
        .get_or_init(|| async {
            let mut builder = Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .user_agent("world-scale-simulator/0.1 (tile-cache proxy)");

            // 优先级：显式配置 > macOS 系统代理 > 环境变量（reqwest 默认行为）
            let resolved = PROXY_OVERRIDE
                .get()
                .cloned()
                .flatten()
                .or_else(detect_system_proxy);

            if let Some(url) = resolved {
                eprintln!("[tile-cache] using upstream proxy: {url}");
                match Proxy::all(&url) {
                    Ok(proxy) => {
                        builder = builder.proxy(proxy);
                    }
                    Err(error) => {
                        eprintln!("[tile-cache] invalid proxy url '{url}': {error}");
                    }
                }
            }

            builder.build().expect("failed to build reqwest client")
        })
        .await
}

/// 解析 `scutil --proxy` 输出，优先返回 HTTPS / HTTP / SOCKS 中已启用的一个。
#[cfg(target_os = "macos")]
fn detect_system_proxy() -> Option<String> {
    let output = std::process::Command::new("scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    parse_scutil_proxy(&text)
}

#[cfg(not(target_os = "macos"))]
fn detect_system_proxy() -> Option<String> {
    None
}

fn parse_scutil_proxy(text: &str) -> Option<String> {
    fn read(text: &str, key: &str) -> Option<String> {
        text.lines()
            .find_map(|line| {
                let line = line.trim();
                line.strip_prefix(key)
                    .and_then(|rest| rest.trim_start().strip_prefix(':'))
                    .map(|v| v.trim().to_string())
            })
    }

    // 依次尝试：HTTPS、HTTP、SOCKS。优先 HTTPS，因为我们要打的就是 https 上游。
    for (enable, host, port, scheme) in [
        ("HTTPSEnable", "HTTPSProxy", "HTTPSPort", "http"),
        ("HTTPEnable", "HTTPProxy", "HTTPPort", "http"),
        ("SOCKSEnable", "SOCKSProxy", "SOCKSPort", "socks5"),
    ] {
        if read(text, enable).as_deref() != Some("1") {
            continue;
        }
        let host = read(text, host)?;
        let port = read(text, port)?;
        if host.is_empty() || port.is_empty() {
            continue;
        }
        return Some(format!("{scheme}://{host}:{port}"));
    }
    None
}

const UPSTREAM_BASE: &str = "https://tile.googleapis.com/v1/";
const CONFIG_FILE: &str = "tile_cache_config.toml";
const CACHE_DIR_NAME: &str = "tile_cache";
const META_SUFFIX: &str = ".meta";

pub struct TileResponse {
    pub bytes: Vec<u8>,
    pub content_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct TileCacheConfig {
    pub max_bytes: u64,
    pub ttl_days: u32,
    /// 手动指定上游 HTTP/SOCKS 代理（如 `http://127.0.0.1:7890`、`socks5://127.0.0.1:1080`）。
    /// 留空则按 macOS 系统代理 → 环境变量 的顺序自动探测。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
}

impl Default for TileCacheConfig {
    fn default() -> Self {
        Self {
            max_bytes: 5 * 1024 * 1024 * 1024, // 5 GiB
            ttl_days: 30,
            proxy_url: None,
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

    // Google Photorealistic 3D Tiles 的子瓦片 URL 把 session 信息塞在 path 里，
    // 跨 app 启动会随 root.json 变化。所以必须把 root.json 也缓存住，下次启动直接复用，
    // 子 URL 才会跟磁盘上的 SHA 对得上。统一按 Cache-Control max-age 限期失效。
    let cacheable = !path_only.is_empty();

    if cacheable {
        match read_cache(cache_root, path_only).await? {
            Some(CacheRead::Hit(hit)) => {
                // HIT 是热路径，首屏可能几百次；不再每次打日志。
                return Ok(hit);
            }
            Some(CacheRead::Expired) => {
                eprintln!("[tile-cache] EXPIRED {path_only}");
            }
            None => {
                eprintln!("[tile-cache] MISS {path_only}");
            }
        }
    } else {
        eprintln!("[tile-cache] SKIP {path_only}");
    }

    let client = http_client().await;
    eprintln!("[tile-cache] upstream GET: {upstream_url}");
    let resp = client
        .get(&upstream_url)
        .send()
        .await
        .with_context(|| format!("upstream fetch failed: {upstream_url}"))?;
    eprintln!(
        "[tile-cache] upstream resp: {} status={}",
        upstream_url,
        resp.status()
    );
    let resp = resp
        .error_for_status()
        .with_context(|| format!("upstream returned error status: {upstream_url}"))?;

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();
    let max_age = parse_cache_control_max_age(
        resp.headers()
            .get(reqwest::header::CACHE_CONTROL)
            .and_then(|v| v.to_str().ok()),
    );
    let bytes = resp.bytes().await?.to_vec();

    if cacheable {
        let ttl = pick_ttl(path_only, max_age);
        match write_cache(cache_root, path_only, &bytes, &content_type, ttl).await {
            Ok(()) => eprintln!(
                "[tile-cache] WROTE {} ({} bytes, type={}, ttl={}s)",
                path_only,
                bytes.len(),
                content_type,
                ttl.as_secs()
            ),
            Err(error) => eprintln!("[tile-cache] WRITE FAILED {path_only}: {error:#}"),
        }
    }

    Ok(TileResponse { bytes, content_type })
}

/// 选择落盘 TTL：
/// - 上游给了 max-age，原样用（HTTP 语义优先）
/// - 否则 root.json 给 6 小时（控制 session 过期风险）
/// - 其它文件按配置 ttl_days；这里取一个保守值，sweep() 阶段还会按 ttl_days 再清一次
fn pick_ttl(path_only: &str, upstream_max_age: Option<Duration>) -> Duration {
    if let Some(d) = upstream_max_age {
        return d;
    }
    if is_root_metadata(path_only) {
        Duration::from_secs(6 * 3600)
    } else {
        Duration::from_secs(30 * 86_400)
    }
}

fn parse_cache_control_max_age(value: Option<&str>) -> Option<Duration> {
    let raw = value?;
    if raw.split(',').any(|d| {
        let d = d.trim().to_ascii_lowercase();
        d == "no-store" || d == "no-cache" || d == "private"
    }) {
        return None;
    }
    for directive in raw.split(',') {
        let directive = directive.trim();
        if let Some(rest) = directive
            .strip_prefix("max-age=")
            .or_else(|| directive.strip_prefix("s-maxage="))
        {
            if let Ok(secs) = rest.trim().parse::<u64>() {
                return Some(Duration::from_secs(secs));
            }
        }
    }
    None
}

fn is_root_metadata(path_only: &str) -> bool {
    matches!(path_only, "3dtiles/root.json" | "root.json")
}

enum CacheRead {
    Hit(TileResponse),
    Expired,
}

/// meta 文件格式：
///   line 1: content-type
///   line 2: expires_at (unix epoch seconds)，可选；缺失则视为永不过期（兼容旧条目）
async fn read_cache(cache_root: &Path, path_only: &str) -> Result<Option<CacheRead>> {
    let (bin_path, meta_path) = cache_paths(cache_root, path_only);

    // 直接读 meta；不存在就当 miss。省掉额外两次 fs::try_exists 的 stat 调用。
    let meta_raw = match fs::read_to_string(&meta_path).await {
        Ok(s) => s,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let mut lines = meta_raw.lines();
    let content_type = lines.next().unwrap_or("").trim().to_string();
    let expires_at = lines.next().and_then(|line| line.trim().parse::<u64>().ok());

    if let Some(expires_at) = expires_at {
        let now_secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if now_secs >= expires_at {
            return Ok(Some(CacheRead::Expired));
        }
    }

    let bytes = match fs::read(&bin_path).await {
        Ok(b) => b,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };

    // mtime 是 LRU 排序依据；不需要每次访问都同步落盘，老于 1 小时再 touch 即可。
    // 用 spawn 避免阻塞响应路径上的 await。
    if let Ok(metadata) = fs::metadata(&bin_path).await {
        if let Ok(modified) = metadata.modified() {
            let stale = SystemTime::now()
                .duration_since(modified)
                .map(|d| d > Duration::from_secs(3600))
                .unwrap_or(true);
            if stale {
                let bin_path = bin_path.clone();
                let meta_path = meta_path.clone();
                tokio::spawn(async move {
                    let now = FileTime::from_system_time(SystemTime::now());
                    let _ = set_file_mtime(&bin_path, now);
                    let _ = set_file_mtime(&meta_path, now);
                });
            }
        }
    }

    Ok(Some(CacheRead::Hit(TileResponse {
        bytes,
        content_type,
    })))
}

async fn write_cache(
    cache_root: &Path,
    path_only: &str,
    bytes: &[u8],
    content_type: &str,
    ttl: Duration,
) -> Result<()> {
    let (bin_path, meta_path) = cache_paths(cache_root, path_only);
    if let Some(parent) = bin_path.parent() {
        fs::create_dir_all(parent)
            .await
            .with_context(|| format!("create cache dir: {}", parent.display()))?;
    }
    let expires_at = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .saturating_add(ttl.as_secs());
    let meta = format!("{content_type}\n{expires_at}\n");
    fs::write(&bin_path, bytes)
        .await
        .with_context(|| format!("write bin: {}", bin_path.display()))?;
    fs::write(&meta_path, meta)
        .await
        .with_context(|| format!("write meta: {}", meta_path.display()))?;
    Ok(())
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
