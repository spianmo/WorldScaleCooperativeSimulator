#![allow(dead_code)]

use crate::models::{DeviceKind, LlmSettings};
use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmIntentRequest {
    pub user_goal: String,
    pub device_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmIntentResult {
    #[serde(default)]
    pub priority: u8,
    #[serde(default)]
    pub task_titles: Vec<String>,
    #[serde(default)]
    pub tasks: Vec<LlmPlannedTask>,
    #[serde(default)]
    pub rationale: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct LlmPlannedTask {
    pub title: String,
    pub description: Option<String>,
    pub preferred_device_kind: Option<DeviceKind>,
    pub required_capabilities: Vec<String>,
    pub priority: Option<u8>,
    pub estimated_ticks: Option<u32>,
}

impl Default for LlmPlannedTask {
    fn default() -> Self {
        Self {
            title: String::new(),
            description: None,
            preferred_device_kind: None,
            required_capabilities: Vec::new(),
            priority: None,
            estimated_ticks: None,
        }
    }
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionStreamChunk {
    choices: Vec<ChatStreamChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatStreamChoice {
    #[serde(default)]
    delta: ChatStreamDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ChatStreamDelta {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LlmIntentResolution {
    pub plan: LlmIntentResult,
    pub logs: Vec<LlmStreamLog>,
}

#[derive(Debug, Clone)]
pub struct LlmStreamLog {
    pub level: LlmStreamLogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Copy)]
pub enum LlmStreamLogLevel {
    Debug,
    Info,
    Warn,
}

fn resolve_api_key(settings: &LlmSettings) -> Result<String> {
    if let Some(api_key) = settings.api_key.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        return Ok(api_key.to_string());
    }

    std::env::var(&settings.api_key_env)
        .map_err(|_| anyhow!("未在 config/llm.toml 写入 api_key，且未设置环境变量 {}", settings.api_key_env))
}

fn strip_json_fence(content: &str) -> &str {
    let trimmed = content.trim();
    if !trimmed.starts_with("```") {
        return trimmed;
    }

    trimmed
        .trim_start_matches("```json")
        .trim_start_matches("```JSON")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
}

pub async fn resolve_intent(settings: &LlmSettings, request: LlmIntentRequest) -> Result<LlmIntentResult> {
    resolve_intent_with_logs(settings, request).await.map(|resolution| resolution.plan)
}

pub async fn resolve_intent_with_logs(settings: &LlmSettings, request: LlmIntentRequest) -> Result<LlmIntentResolution> {
    if !settings.enabled {
        return Err(anyhow!("LLM 未启用"));
    }

    let api_key = resolve_api_key(settings)?;
    let user_goal_for_log = request.user_goal.clone();
    let prompt = format!(
        "你是 AR 眼镜输入后的群体智能中枢网关，必须组织多个大模型 agents 协同决策，而不是本地关键词规则。\n\
        请让 intent_agent 理解目标，dispatch_agent 根据设备专长拆分任务，safety_agent 校验执行顺序。\n\
        只返回 JSON，不要 Markdown，不要解释。JSON 字段：priority(1-10), task_titles(字符串数组，1-6 个具体可执行任务), tasks(可选数组，字段 title, description, preferred_device_kind, required_capabilities, priority, estimated_ticks), rationale(一句话)。\n\
        preferred_device_kind 只能是 rover, drone, humanoid, quadruped, sensor_hub, charging_base 或 null。\n\
        目标: {}\n设备: {}",
        request.user_goal, request.device_summary
    );
    let body = ChatCompletionRequest {
        model: settings.model.clone(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        stream: true,
    };
    let mut logs = vec![
        LlmStreamLog {
            level: LlmStreamLogLevel::Info,
            message: format!("LLM SSE 请求开始：model={} endpoint={}", settings.model, settings.endpoint),
        },
        LlmStreamLog {
            level: LlmStreamLogLevel::Debug,
            message: format!("LLM SSE 输入目标：{}", user_goal_for_log),
        },
    ];

    let response = reqwest::Client::new()
        .post(&settings.endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?
        .error_for_status()?;
    logs.push(LlmStreamLog {
        level: LlmStreamLogLevel::Info,
        message: format!("LLM SSE 连接已建立：HTTP {}", response.status()),
    });

    let mut stream = response.bytes_stream();
    let mut pending = String::new();
    let mut content = String::new();
    let mut chunk_index = 0usize;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("读取 LLM SSE 数据块失败")?;
        let text = String::from_utf8_lossy(&chunk);
        pending.push_str(&text);

        while let Some(separator_index) = pending.find("\n\n") {
            let frame = pending[..separator_index].to_string();
            pending = pending[separator_index + 2..].to_string();

            for line in frame.lines() {
                let Some(data) = line.trim().strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data.is_empty() {
                    continue;
                }
                if data == "[DONE]" {
                    logs.push(LlmStreamLog {
                        level: LlmStreamLogLevel::Info,
                        message: format!("LLM SSE 流结束：累计 {} 个增量片段，{} 字符", chunk_index, content.chars().count()),
                    });
                    continue;
                }

                let parsed = serde_json::from_str::<ChatCompletionStreamChunk>(data)
                    .with_context(|| format!("解析 LLM SSE 数据失败: {data}"))?;
                for choice in parsed.choices {
                    if let Some(delta) = choice.delta.content {
                        if !delta.is_empty() {
                            chunk_index += 1;
                            content.push_str(&delta);
                            logs.push(LlmStreamLog {
                                level: LlmStreamLogLevel::Debug,
                                message: format!("LLM SSE delta #{chunk_index}: {delta}"),
                            });
                        }
                    }
                    if let Some(reason) = choice.finish_reason {
                        logs.push(LlmStreamLog {
                            level: LlmStreamLogLevel::Info,
                            message: format!("LLM SSE finish_reason: {reason}"),
                        });
                    }
                }
            }
        }
    }

    if content.trim().is_empty() {
        logs.push(LlmStreamLog {
            level: LlmStreamLogLevel::Warn,
            message: "LLM SSE 未返回 content delta，回退为非流式响应解析失败".to_string(),
        });
        return Err(anyhow!("LLM SSE 未返回 content delta"));
    }

    let parsed = serde_json::from_str::<LlmIntentResult>(strip_json_fence(&content))?;
    logs.push(LlmStreamLog {
        level: LlmStreamLogLevel::Info,
        message: format!(
            "LLM SSE 结果解析完成：priority={} tasks={} rationale={}",
            parsed.priority,
            if parsed.tasks.is_empty() { parsed.task_titles.len() } else { parsed.tasks.len() },
            parsed.rationale.as_deref().unwrap_or("无")
        ),
    });
    Ok(LlmIntentResolution { plan: parsed, logs })
}
