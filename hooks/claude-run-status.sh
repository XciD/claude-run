#!/bin/bash
# Claude Run status hook — forwards Claude Code events to the claude-run server.
# Installed by install-hooks.sh
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
[[ -z "$SESSION_ID" ]] && exit 0

BODY=$(echo "$INPUT" | jq -c '. + {event: .hook_event_name}')

if [[ -n "$ZELLIJ_PANE_ID" ]]; then
  BODY=$(echo "$BODY" | jq -c \
    --arg pid "$ZELLIJ_PANE_ID" \
    --arg zs "${ZELLIJ_SESSION_NAME:-}" \
    '. + {pane_id: $pid, zellij_session: $zs}')
  PANE_MAP_DIR="$HOME/.claude/pane-map"
  mkdir -p "$PANE_MAP_DIR"
  echo "${ZELLIJ_PANE_ID}:${ZELLIJ_SESSION_NAME:-}" > "$PANE_MAP_DIR/$SESSION_ID"
fi

PORT=${CLAUDE_RUN_PORT:-12001}
curl -sf --max-time 1 -H Content-Type:application/json \
  -X POST "http://localhost:${PORT}/api/sessions/${SESSION_ID}/status" \
  -d "$BODY" >/dev/null 2>&1
exit 0
