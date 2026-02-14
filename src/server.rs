use std::collections::HashMap;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{
    extract::{Path, Query, State},
    http::Method,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json,
    },
    routing::{delete, get, post},
    Router,
};
use tokio_stream::Stream;
use tower_http::cors::{AllowOrigin, CorsLayer};

use crate::embedded::serve_embedded;
use crate::models::*;
use crate::state::AppState;
use crate::storage;

/// Build a `zellij` Command with optional `--session` argument.
fn zellij_cmd(session: Option<&str>) -> tokio::process::Command {
    let mut cmd = tokio::process::Command::new("zellij");
    if let Some(s) = session {
        cmd.args(["--session", s]);
    }
    cmd
}

fn build_permission_message(tool_name: Option<&str>, tool_input: Option<&serde_json::Value>) -> String {
    let name = tool_name.unwrap_or("Unknown");
    let detail = tool_input.and_then(|input| {
        input.get("command").and_then(|v| v.as_str()).map(|s| s.to_string())
            .or_else(|| input.get("file_path").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .or_else(|| {
                let pattern = input.get("pattern").and_then(|v| v.as_str())?;
                let path = input.get("path").and_then(|v| v.as_str());
                Some(match path {
                    Some(p) => format!("{}/{}", p, pattern),
                    None => pattern.to_string(),
                })
            })
            .or_else(|| input.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()))
    });
    match detail {
        Some(d) => {
            let truncated = if d.len() > 80 { &d[..80] } else { &d };
            format!("{}: {}", name, truncated)
        }
        None => name.to_string(),
    }
}

pub fn create_router(state: Arc<AppState>) -> Router {
    let api = Router::new()
        .route("/api/sessions", get(get_sessions))
        .route("/api/sessions/:id", delete(delete_session))
        .route("/api/sessions/:id/status", post(set_status))
        .route("/api/sessions/:id/send", post(send_message))
        .route("/api/sessions/:id/keys", post(send_keys))
        .route("/api/sessions/:id/answer", post(answer_question))
        .route("/api/sessions/stream", get(sessions_stream))
        .route("/api/projects", get(get_projects))
        .route("/api/search", post(search))
        .route("/api/conversation/:id", get(get_conversation))
        .route("/api/conversation/:id/stream", get(conversation_stream))
        .route("/api/conversation/:id/subagents", get(get_subagents))
        .route(
            "/api/conversation/:id/subagent/:agent_id",
            get(get_subagent_conversation),
        )
        .route("/api/conversation/:id/plan-sessions", get(get_plan_sessions))
        .route("/api/usage", get(get_usage))
        .route("/api/launch", post(launch_agent))
        .route("/api/sessions/:id/resurrect", post(resurrect_session))
        .route("/api/sessions/:id/kill", post(kill_session))
        .route("/api/zellij/sessions", get(get_zellij_sessions));

    let mut router = api;

    if state.dev_mode {
        let cors = CorsLayer::new()
            .allow_origin(AllowOrigin::exact(
                "http://localhost:12000".parse().unwrap(),
            ))
            .allow_methods([Method::GET, Method::POST, Method::DELETE, Method::OPTIONS])
            .allow_headers([axum::http::header::CONTENT_TYPE]);
        router = router.layer(cors);
    }

    // SPA fallback for non-API routes
    router = router.fallback(serve_embedded);

    router.with_state(state)
}

// --- REST Handlers ---

async fn get_sessions(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let sessions = storage::get_sessions(&state).await;
    Json(sessions)
}

async fn get_projects(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let projects = storage::get_projects(&state).await;
    Json(projects)
}

async fn get_conversation(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let messages = storage::get_conversation(&state, &id).await;
    Json(messages)
}

async fn get_subagents(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let infos = storage::get_subagent_map(&state, &id).await;
    Json(infos)
}

async fn get_subagent_conversation(
    State(state): State<Arc<AppState>>,
    Path((id, agent_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let messages = storage::get_subagent_conversation(&state, &id, &agent_id).await;
    Json(messages)
}

async fn get_plan_sessions(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let infos = storage::get_plan_session_map(&state, &id).await;
    Json(infos)
}

async fn delete_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let deleted = storage::delete_session(&state, &id).await;
    if deleted {
        Json(serde_json::json!({ "success": true }))
    } else {
        Json(serde_json::json!({ "error": "Session not found" }))
    }
}

async fn set_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<StatusUpdateRequest>,
) -> impl IntoResponse {
    let status: SessionStatus = match body.event.as_str() {
        "SessionStart" => Some(SessionStatusValue::Active),
        "UserPromptSubmit" => Some(SessionStatusValue::Responding),
        "Notification" => {
            if body.notification_type.as_deref() == Some("permission_prompt") {
                Some(SessionStatusValue::Permission)
            } else {
                Some(SessionStatusValue::Notification)
            }
        }
        "PermissionRequest" => {
            let msg = build_permission_message(body.tool_name.as_deref(), body.tool_input.as_ref());
            state.permission_messages.insert(id.clone(), msg);
            // Store question data for AskUserQuestion
            if body.tool_name.as_deref() == Some("AskUserQuestion") {
                if let Some(input) = &body.tool_input {
                    if let Some(questions) = input.get("questions") {
                        state.question_data.insert(id.clone(), questions.clone());
                    }
                }
            } else {
                state.question_data.remove(&id);
            }
            Some(SessionStatusValue::Permission)
        }
        "PreCompact" => Some(SessionStatusValue::Compacting),
        "PreToolUse" | "PostToolUse" => Some(SessionStatusValue::Responding),
        "Stop" => Some(SessionStatusValue::Active),
        "SessionEnd" => None,
        _ => {
            // Unknown event — ignore, don't change status
            return Json(serde_json::json!({ "ok": true }));
        }
    };

    // Clear permission message + question data when transitioning away from permission
    if status != Some(SessionStatusValue::Permission)
        && state.get_session_status(&id) == Some(SessionStatusValue::Permission)
    {
        state.permission_messages.remove(&id);
        state.question_data.remove(&id);
    }

    if status.is_none() {
        let pane_map_path = format!("{}/pane-map/{}", state.claude_dir, id);
        let _ = tokio::fs::remove_file(&pane_map_path).await;
    }
    state.set_session_status(&id, status, body.pane_id, body.zellij_session);

    Json(serde_json::json!({ "ok": true }))
}

async fn send_message(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<SendMessageRequest>,
) -> impl IntoResponse {
    let (pane_id, zs) = match state.get_session_pane(&id) {
        Some((p, zs, _)) => (p, zs),
        None => return Json(serde_json::json!({ "error": "No pane ID for this session" })),
    };

    let result = zellij_cmd(zs.as_deref())
        .args(["action", "write-chars", "--pane-id", &pane_id, &body.message])
        .output()
        .await;

    if let Err(e) = result {
        return Json(serde_json::json!({ "error": format!("Failed to write chars: {}", e) }));
    }

    // Send Enter key (carriage return = byte 13)
    let result = zellij_cmd(zs.as_deref())
        .args(["action", "write", "--pane-id", &pane_id, "13"])
        .output()
        .await;

    if let Err(e) = result {
        return Json(serde_json::json!({ "error": format!("Failed to send enter: {}", e) }));
    }

    Json(serde_json::json!({ "ok": true }))
}

async fn send_keys(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<SendKeysRequest>,
) -> impl IntoResponse {
    let (pane_id, zs) = match state.get_session_pane(&id) {
        Some((p, zs, _)) => (p, zs),
        None => return Json(serde_json::json!({ "error": "No pane ID for this session" })),
    };

    for key_seq in &body.keys {
        let args: Vec<String> = std::iter::once("action".to_string())
            .chain(std::iter::once("write".to_string()))
            .chain(std::iter::once("--pane-id".to_string()))
            .chain(std::iter::once(pane_id.clone()))
            .chain(key_seq.iter().map(|b| b.to_string()))
            .collect();

        let result = zellij_cmd(zs.as_deref())
            .args(&args)
            .output()
            .await;

        if let Err(e) = result {
            return Json(serde_json::json!({ "error": format!("Failed to send keys: {}", e) }));
        }
    }

    Json(serde_json::json!({ "ok": true }))
}

async fn answer_question(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(body): Json<AnswerQuestionRequest>,
) -> impl IntoResponse {
    let (pane_id, zs) = match state.get_session_pane(&id) {
        Some((p, zs, _)) => (p, zs),
        None => return Json(serde_json::json!({ "error": "No pane ID for this session" })),
    };

    let question_data = state.question_data.get(&id).map(|v| v.clone());
    let questions = match &question_data {
        Some(v) => v.as_array(),
        None => None,
    };

    let delay = std::time::Duration::from_millis(50);

    if let Some(option_index) = body.option_index {
        // Select a predefined option: Arrow Down × optionIndex, then Enter
        for _ in 0..option_index {
            if let Err(e) = zellij_cmd(zs.as_deref())
                .args(["action", "write", "--pane-id", &pane_id, "27", "91", "66"])
                .output().await
            {
                return Json(serde_json::json!({ "error": format!("Failed to send keys: {}", e) }));
            }
            tokio::time::sleep(delay).await;
        }
        if let Err(e) = zellij_cmd(zs.as_deref())
            .args(["action", "write", "--pane-id", &pane_id, "13"])
            .output().await
        {
            return Json(serde_json::json!({ "error": format!("Failed to send enter: {}", e) }));
        }
    } else if let Some(text) = &body.text {
        // Free text: Arrow Down × number of options to reach "Type something.", then type
        let option_count = questions
            .and_then(|q| q.first())
            .and_then(|q| q.get("options"))
            .and_then(|o| o.as_array())
            .map(|a| a.len())
            .unwrap_or(1);
        for _ in 0..option_count {
            if let Err(e) = zellij_cmd(zs.as_deref())
                .args(["action", "write", "--pane-id", &pane_id, "27", "91", "66"])
                .output().await
            {
                return Json(serde_json::json!({ "error": format!("Failed to send keys: {}", e) }));
            }
            tokio::time::sleep(delay).await;
        }
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;

        // Type the text
        if let Err(e) = zellij_cmd(zs.as_deref())
            .args(["action", "write-chars", "--pane-id", &pane_id, text])
            .output().await
        {
            return Json(serde_json::json!({ "error": format!("Failed to write chars: {}", e) }));
        }
        // Press Enter
        if let Err(e) = zellij_cmd(zs.as_deref())
            .args(["action", "write", "--pane-id", &pane_id, "13"])
            .output().await
        {
            return Json(serde_json::json!({ "error": format!("Failed to send enter: {}", e) }));
        }
    } else {
        return Json(serde_json::json!({ "error": "Either optionIndex or text is required" }));
    }

    // Update status
    state.set_session_status(&id, Some(SessionStatusValue::Responding), None, None);

    Json(serde_json::json!({ "ok": true }))
}

async fn search(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SearchRequest>,
) -> impl IntoResponse {
    let query = body.query.trim().to_string();
    if query.is_empty() {
        return Json(serde_json::json!({ "results": [] }));
    }
    let results = storage::search_conversations(&state.clone(), &query).await;
    Json(serde_json::json!({ "results": results }))
}

async fn get_usage(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    const CACHE_TTL: Duration = Duration::from_secs(60);

    // Check cache
    {
        let cache = state.usage_cache.lock().await;
        if let Some((fetched_at, ref resp)) = *cache {
            if fetched_at.elapsed() < CACHE_TTL {
                return Json(serde_json::to_value(resp).unwrap());
            }
        }
    }

    // Read OAuth token from macOS Keychain
    let token = match tokio::process::Command::new("security")
        .args(["find-generic-password", "-s", "Claude Code-credentials", "-w"])
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // The keychain value is JSON: extract claudeAiOauth.accessToken
            match serde_json::from_str::<serde_json::Value>(&raw) {
                Ok(v) => v["claudeAiOauth"]["accessToken"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                Err(_) => raw,
            }
        }
        _ => {
            return Json(serde_json::json!({ "error": "Failed to read OAuth token from Keychain" }));
        }
    };

    if token.is_empty() {
        return Json(serde_json::json!({ "error": "No OAuth token found" }));
    }

    // Call Anthropic usage API
    let client = reqwest::Client::new();
    let resp = match client
        .get("https://api.anthropic.com/api/oauth/usage")
        .bearer_auth(&token)
        .header("anthropic-beta", "oauth-2025-04-20")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return Json(serde_json::json!({ "error": format!("API request failed: {}", e) }));
        }
    };

    let body = match resp.json::<serde_json::Value>().await {
        Ok(b) => b,
        Err(e) => {
            return Json(serde_json::json!({ "error": format!("Failed to parse response: {}", e) }));
        }
    };

    // API returns five_hour.utilization / seven_day.utilization (already percentages)
    let five_hour_pct = body.pointer("/five_hour/utilization")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .round();
    let seven_day_pct = body.pointer("/seven_day/utilization")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .round();
    let resets_at = body.pointer("/five_hour/resets_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let usage = UsageResponse {
        five_hour_pct,
        seven_day_pct,
        resets_at,
    };

    // Update cache
    {
        let mut cache = state.usage_cache.lock().await;
        *cache = Some((Instant::now(), usage.clone()));
    }

    Json(serde_json::to_value(&usage).unwrap())
}

async fn launch_agent(
    Json(body): Json<LaunchRequest>,
) -> impl IntoResponse {
    let mut args = vec!["action", "new-tab"];

    if let Some(ref project) = body.project {
        args.extend(["--cwd", project]);
    }

    let prompt = body.prompt.as_deref().unwrap_or("** Session started from claude-run ** don't answer to this message");
    // Shell-escape the prompt by replacing single quotes
    let escaped_prompt = prompt.replace('\'', "'\\''");
    let cmd = if body.dangerously_skip_permissions.unwrap_or(false) {
        format!("$SHELL -c 'claude --dangerously-skip-permissions \"{}\"'", escaped_prompt)
    } else {
        format!("$SHELL -c 'claude \"{}\"'", escaped_prompt)
    };

    args.extend(["--", "sh", "-c"]);
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let mut final_args = args_owned;
    final_args.push(cmd);

    match zellij_cmd(body.zellij_session.as_deref())
        .args(&final_args)
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            Json(serde_json::json!({ "ok": true }))
        }
        Ok(output) => {
            Json(serde_json::json!({ "error": String::from_utf8_lossy(&output.stderr) }))
        }
        Err(e) => Json(serde_json::json!({ "error": format!("{}", e) })),
    }
}

async fn resurrect_session(
    Path(id): Path<String>,
    Json(body): Json<ResurrectRequest>,
) -> impl IntoResponse {
    let mut args = vec!["action", "new-tab", "--cwd", &body.project];

    let cmd = if body.dangerously_skip_permissions.unwrap_or(false) {
        format!("$SHELL -c 'claude --resume {} --dangerously-skip-permissions'", id)
    } else {
        format!("$SHELL -c 'claude --resume {}'", id)
    };

    args.extend(["--", "sh", "-c"]);
    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();
    let mut final_args = args_owned;
    final_args.push(cmd);

    match zellij_cmd(body.zellij_session.as_deref())
        .args(&final_args)
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            Json(serde_json::json!({ "ok": true }))
        }
        Ok(output) => {
            Json(serde_json::json!({ "error": String::from_utf8_lossy(&output.stderr) }))
        }
        Err(e) => Json(serde_json::json!({ "error": format!("{}", e) })),
    }
}

async fn kill_session(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let (pane_id, zs) = match state.get_session_pane(&id) {
        Some((p, zs, _)) => (p, zs),
        None => return Json(serde_json::json!({ "error": "No pane ID for this session" })),
    };

    // Send /exit + Enter to gracefully quit claude
    let _ = zellij_cmd(zs.as_deref())
        .args(["action", "write-chars", "--pane-id", &pane_id, "/exit"])
        .output()
        .await;
    let _ = zellij_cmd(zs.as_deref())
        .args(["action", "write", "--pane-id", &pane_id, "13"])
        .output()
        .await;

    state.set_session_status(&id, None, None, None);
    state.session_panes.remove(&id);

    // Send Ctrl+C then close the pane after a short delay
    let pane_id_owned = pane_id.clone();
    let zs_owned = zs.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        let _ = zellij_cmd(zs_owned.as_deref())
            .args(["action", "write", "--pane-id", &pane_id_owned, "3"])
            .output()
            .await;
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        let _ = zellij_cmd(zs_owned.as_deref())
            .args(["action", "close-pane", "--pane-id", &pane_id_owned])
            .output()
            .await;
    });

    Json(serde_json::json!({ "ok": true }))
}

async fn get_zellij_sessions() -> impl IntoResponse {
    match tokio::process::Command::new("zellij")
        .args(["list-sessions", "-s"])
        .output()
        .await
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let sessions: Vec<&str> = stdout.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
            Json(serde_json::json!({ "sessions": sessions }))
        }
        _ => Json(serde_json::json!({ "sessions": [] })),
    }
}

// --- SSE Handlers ---

async fn sessions_stream(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let stream = async_stream::stream! {
        let mut known_sessions: HashMap<String, (f64, SessionStatus)> = HashMap::new();
        let mut history_rx = state.history_tx.subscribe();
        let mut session_rx = state.session_tx.subscribe();
        let mut status_rx = state.status_tx.subscribe();

        // Send initial sessions
        let sessions = storage::get_sessions(&state).await;
        for s in &sessions {
            known_sessions.insert(s.id.clone(), (s.last_activity, s.status.clone()));
        }
        let data = serde_json::to_string(&sessions).unwrap_or_default();
        yield Ok(Event::default().event("sessions").data(data));

        loop {
            tokio::select! {
                _ = history_rx.recv() => {
                    // History changed — push session updates
                    if let Some(updates) = compute_session_updates(&state, &mut known_sessions).await {
                        yield Ok(updates);
                    }
                }
                _ = session_rx.recv() => {
                    // Session file changed — push session updates
                    if let Some(updates) = compute_session_updates(&state, &mut known_sessions).await {
                        yield Ok(updates);
                    }
                }
                Ok((session_id, status)) = status_rx.recv() => {
                    // Status changed — send targeted update
                    if let Some(known) = known_sessions.get_mut(&session_id) {
                        known.1 = status.clone();
                    }
                    let pane = state.get_session_pane(&session_id);
                    let perm_msg = state.permission_messages.get(&session_id).map(|v| v.clone());
                    let q_data = state.question_data.get(&session_id).map(|v| v.clone());
                    let data = serde_json::json!({
                        "id": session_id,
                        "status": status,
                        "paneId": pane.as_ref().map(|(id, _, _)| id),
                        "paneVerified": pane.as_ref().map(|(_, _, v)| v),
                        "permissionMessage": perm_msg,
                        "questionData": q_data,
                    });
                    yield Ok(Event::default().event("statusUpdate").data(data.to_string()));
                }
                _ = tokio::time::sleep(Duration::from_secs(30)) => {
                    let data = serde_json::json!({ "timestamp": chrono_now_ms() });
                    yield Ok(Event::default().event("heartbeat").data(data.to_string()));
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

async fn compute_session_updates(
    state: &AppState,
    known_sessions: &mut HashMap<String, (f64, SessionStatus)>,
) -> Option<Event> {
    let sessions = storage::get_sessions(state).await;
    let mut new_or_updated = Vec::new();

    for s in &sessions {
        let dominated = known_sessions.get(&s.id).is_none_or(|(la, st)| {
            *la != s.last_activity || *st != s.status
        });
        if dominated {
            new_or_updated.push(s.clone());
        }
    }

    for s in &sessions {
        known_sessions.insert(s.id.clone(), (s.last_activity, s.status.clone()));
    }

    if new_or_updated.is_empty() {
        if state.dev_mode {
            eprintln!("[sse] compute_session_updates: no changes ({} sessions)", sessions.len());
        }
        return None;
    }

    if state.dev_mode {
        let ids: Vec<&str> = new_or_updated.iter().map(|s| s.id.as_str()).collect();
        eprintln!("[sse] sending sessionsUpdate: {} updates {:?}", new_or_updated.len(), ids);
    }
    let data = serde_json::to_string(&new_or_updated).unwrap_or_default();
    Some(Event::default().event("sessionsUpdate").data(data))
}

#[derive(Deserialize)]
struct ConversationStreamQuery {
    offset: Option<u64>,
}

async fn conversation_stream(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(query): Query<ConversationStreamQuery>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let session_id = id;
    let initial_offset = query.offset.unwrap_or(0);

    let stream = async_stream::stream! {
        let mut offset = initial_offset;
        let mut session_rx = state.session_tx.subscribe();

        // Send initial messages
        let result = storage::get_conversation_stream(&state, &session_id, offset).await;
        offset = result.next_offset;

        let data = serde_json::json!({
            "messages": result.messages,
            "offset": result.next_offset,
        });
        yield Ok(Event::default().event("messages").data(data.to_string()));

        loop {
            tokio::select! {
                Ok((changed_id, _)) = session_rx.recv() => {
                    if changed_id != session_id {
                        continue;
                    }
                    let result = storage::get_conversation_stream(&state, &session_id, offset).await;
                    offset = result.next_offset;

                    if !result.messages.is_empty() {
                        let data = serde_json::json!({
                            "messages": result.messages,
                            "offset": result.next_offset,
                        });
                        yield Ok(Event::default().event("messages").data(data.to_string()));
                    }
                }
                _ = tokio::time::sleep(Duration::from_secs(30)) => {
                    let data = serde_json::json!({ "timestamp": chrono_now_ms() });
                    yield Ok(Event::default().event("heartbeat").data(data.to_string()));
                }
            }
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn chrono_now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

use serde::Deserialize;
