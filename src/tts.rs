use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::state::AppState;

const MAX_INPUT_CHARS: usize = 4000;

const TTS_INSTRUCTIONS: &str = "\
Read the text naturally for spoken delivery. \
Describe tables in natural language instead of reading them as-is. \
Explain code snippets briefly instead of reading them verbatim. \
Ignore markdown formatting. \
Keep the same language as the input.";

#[derive(Deserialize)]
pub struct TtsRequest {
    text: String,
}

fn read_api_key(claude_dir: &str) -> Result<String, String> {
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        return Ok(key);
    }
    let path = format!("{}/openai-api-key", claude_dir);
    std::fs::read_to_string(&path)
        .map(|s| s.trim().to_string())
        .map_err(|_| format!("OPENAI_API_KEY not set and {} not found", path))
}

async fn generate_speech(text: &str, claude_dir: &str) -> Result<Vec<u8>, String> {
    let api_key = read_api_key(claude_dir)?;
    let truncated: String = text.chars().take(MAX_INPUT_CHARS).collect();

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(&api_key)
        .json(&serde_json::json!({
            "model": "gpt-4o-mini-tts",
            "voice": "shimmer",
            "input": truncated,
            "instructions": TTS_INSTRUCTIONS,
        }))
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI TTS error {}: {}", status, body.chars().take(200).collect::<String>()));
    }

    resp.bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| format!("failed to read response: {}", e))
}

pub async fn tts_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<TtsRequest>,
) -> impl IntoResponse {
    if req.text.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "empty text").into_response();
    }

    match generate_speech(&req.text, &state.claude_dir).await {
        Ok(audio) => (
            StatusCode::OK,
            [("content-type", "audio/mpeg")],
            audio,
        ).into_response(),
        Err(e) => {
            eprintln!("[tts] speech generation failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
        }
    }
}
