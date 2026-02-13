use std::collections::HashMap;
use std::sync::Arc;

use tokio::fs;
use tokio::process::Command;

use crate::state::AppState;
use crate::storage::{count_session_messages, get_conversation};

const SUMMARY_THRESHOLD: usize = 10;

/// Path to the persistent summaries file
fn summaries_path(state: &AppState) -> String {
    format!("{}/cache/claude-run-summaries.json", state.claude_dir)
}

/// Load persisted summaries into the in-memory cache
pub async fn load_summaries(state: &AppState) {
    let path = summaries_path(state);
    let content = match fs::read_to_string(&path).await {
        Ok(c) => c,
        Err(_) => return,
    };

    let map: HashMap<String, SummaryEntry> = match serde_json::from_str(&content) {
        Ok(m) => m,
        Err(_) => return,
    };

    for (session_id, entry) in map {
        state
            .summary_cache
            .insert(session_id, (entry.summary, entry.message_count));
    }
}

/// Persist the in-memory cache to disk
async fn save_summaries(state: &AppState) {
    let mut map = HashMap::new();
    for entry in state.summary_cache.iter() {
        map.insert(
            entry.key().clone(),
            SummaryEntry {
                summary: entry.value().0.clone(),
                message_count: entry.value().1,
            },
        );
    }

    let content = match serde_json::to_string_pretty(&map) {
        Ok(c) => c,
        Err(_) => return,
    };

    // Ensure cache directory exists
    let path = summaries_path(state);
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent).await;
    }
    let _ = fs::write(&path, content).await;
}

/// Generate a summary for a session by calling `claude` CLI
async fn generate_summary(state: &Arc<AppState>, session_id: &str) {
    let messages = get_conversation(state, session_id).await;
    if messages.is_empty() {
        return;
    }

    // Extract last 10 user messages for context
    let mut texts = Vec::new();
    let user_messages: Vec<_> = messages
        .iter()
        .filter(|m| m.msg_type == "user")
        .collect();
    for msg in user_messages.iter().rev().take(10).rev() {
        let text = if let Some(ref message) = msg.message {
            if let Some(ref content) = message.content {
                extract_plain_text(content)
            } else {
                continue;
            }
        } else {
            continue;
        };

        if text.is_empty() {
            continue;
        }

        let truncated: String = text.chars().take(300).collect();
        texts.push(truncated);
    }

    if texts.is_empty() {
        return;
    }

    let conversation_text = texts.join("\n---\n");
    let prompt = format!(
        "Here are the last user messages from a Claude Code conversation.\n\
         Summarize what the user is working on in 1 concise sentence (max 100 chars).\n\
         Reply with ONLY the summary, no quotes or prefix.\n\n\
         <messages>\n{}\n</messages>",
        conversation_text
    );

    let output = match Command::new("claude")
        .args(["-p", "--model", "haiku", "--no-session-persistence"])
        .arg(&prompt)
        .output()
        .await
    {
        Ok(o) => o,
        Err(_) => return,
    };

    if !output.status.success() {
        return;
    }

    let summary = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if summary.is_empty() || summary.len() > 200 {
        return;
    }

    let msg_count = count_session_messages(state, session_id).await;
    state
        .summary_cache
        .insert(session_id.to_string(), (summary, msg_count));
    save_summaries(state).await;
}

/// Background task that listens for session changes and triggers summary generation
pub fn spawn_summarizer(state: Arc<AppState>) {
    let mut session_rx = state.session_tx.subscribe();

    tokio::spawn(async move {
        loop {
            let (session_id, _) = match session_rx.recv().await {
                Ok(v) => v,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            };

            let msg_count = count_session_messages(&state, &session_id).await;

            // Skip if already pending
            if state.summary_pending.contains_key(&session_id) {
                continue;
            }

            // Skip if not enough new messages since last summary
            if let Some(cached) = state.summary_cache.get(&session_id) {
                if msg_count < cached.1 + SUMMARY_THRESHOLD {
                    continue;
                }
            } else if msg_count < SUMMARY_THRESHOLD {
                // No existing summary and not enough messages yet
                continue;
            }

            state.summary_pending.insert(session_id.clone(), true);
            let state = state.clone();
            tokio::spawn(async move {
                generate_summary(&state, &session_id).await;
                state.summary_pending.remove(&session_id);
            });
        }
    });
}

fn extract_plain_text(content: &crate::models::MessageContent) -> String {
    use crate::models::MessageContent;
    match content {
        MessageContent::Text(s) => s.clone(),
        MessageContent::Blocks(blocks) => {
            let mut parts = Vec::new();
            for block in blocks {
                if let Some(ref text) = block.text {
                    parts.push(text.clone());
                }
            }
            parts.join(" ")
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SummaryEntry {
    summary: String,
    message_count: usize,
}
