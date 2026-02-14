use std::sync::Arc;

use tokio::fs;
use tokio::process::Command;

use crate::state::AppState;
use crate::storage::{count_session_messages, get_conversation};

const SUMMARY_THRESHOLD: usize = 10;

/// Directory for per-session summary files
fn summary_dir(state: &AppState) -> String {
    format!("{}/summary", state.claude_dir)
}

/// Path to a single session's summary file
fn summary_path(state: &AppState, session_id: &str) -> String {
    format!("{}/{}", summary_dir(state), session_id)
}

/// Load persisted summaries into the in-memory cache
pub async fn load_summaries(state: &AppState) {
    let dir = summary_dir(state);
    let mut entries = match fs::read_dir(&dir).await {
        Ok(e) => e,
        Err(_) => return,
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let session_id = entry.file_name().to_string_lossy().to_string();
        if session_id.starts_with('.') {
            continue;
        }
        let content = match fs::read_to_string(entry.path()).await {
            Ok(c) => c,
            Err(_) => continue,
        };
        // Format: first line = message_count, second line = summary
        let mut lines = content.lines();
        let msg_count: usize = lines.next().and_then(|l| l.parse().ok()).unwrap_or(0);
        let summary: String = lines.collect::<Vec<_>>().join("\n");
        if !summary.is_empty() {
            state.summary_cache.insert(session_id, (summary, msg_count));
        }
    }
}

/// Persist a single session summary to disk
async fn save_summary(state: &AppState, session_id: &str, summary: &str, msg_count: usize) {
    let dir = summary_dir(state);
    let _ = fs::create_dir_all(&dir).await;
    let content = format!("{}\n{}", msg_count, summary);
    let _ = fs::write(summary_path(state, session_id), content).await;
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
        .args(["-p", "--model", "haiku", "--no-session-persistence", "--dangerously-skip-permissions"])
        .arg(&prompt)
        .env_remove("CLAUDECODE")
        .output()
        .await
    {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[summarizer] failed to run claude: {}", e);
            return;
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        eprintln!("[summarizer] claude exited with error: {}", stderr.chars().take(200).collect::<String>());
        return;
    }

    let summary = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if summary.is_empty() || summary.len() > 200 {
        eprintln!("[summarizer] bad summary (len={}): {:?}", summary.len(), summary.chars().take(50).collect::<String>());
        return;
    }

    let msg_count = count_session_messages(state, session_id).await;
    state
        .summary_cache
        .insert(session_id.to_string(), (summary.clone(), msg_count));
    save_summary(state, session_id, &summary, msg_count).await;
}

/// On boot, generate summaries for sessions that are missing them
pub fn spawn_initial_summary_scan(state: Arc<AppState>) {
    tokio::spawn(async move {
        // Wait a bit for the watcher to populate sessions
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        let session_ids: Vec<String> = state.file_index.iter().map(|e| e.key().clone()).collect();
        let mut queued = 0;
        for session_id in session_ids {
            if state.summary_cache.contains_key(&session_id) {
                continue;
            }
            let msg_count = count_session_messages(&state, &session_id).await;
            if msg_count < SUMMARY_THRESHOLD {
                continue;
            }
            eprintln!("[summarizer] boot scan: queuing {} (msgs={})", &session_id[..12.min(session_id.len())], msg_count);
            let state = state.clone();
            let sid = session_id.clone();
            tokio::spawn(async move {
                generate_summary(&state, &sid).await;
            });
            queued += 1;
            // Don't overwhelm the system — slight delay between spawns
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
        if queued > 0 {
            eprintln!("[summarizer] boot scan: queued {} sessions for summary", queued);
        }
    });
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
            let should_generate = if let Some(cached) = state.summary_cache.get(&session_id) {
                msg_count >= cached.1 + SUMMARY_THRESHOLD
            } else {
                msg_count >= SUMMARY_THRESHOLD
            };

            if !should_generate {
                continue;
            }

            eprintln!("[summarizer] generating summary for {} (msgs={})", &session_id[..12.min(session_id.len())], msg_count);
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
