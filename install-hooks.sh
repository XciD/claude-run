#!/bin/bash
set -euo pipefail

CLAUDE_DIR="${HOME}/.claude"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
SETTINGS="${CLAUDE_DIR}/settings.json"
HOOK_NAME="claude-run-status.sh"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SRC="${SCRIPT_DIR}/hooks/${HOOK_NAME}"
HOOK_DST="${HOOKS_DIR}/${HOOK_NAME}"

# Events that claude-run needs to track session status
EVENTS=(
  SessionStart
  SessionEnd
  Stop
  Notification
  UserPromptSubmit
  PermissionRequest
  PreToolUse
  PostToolUse
  PreCompact
)

echo "Installing claude-run hooks..."

# 1. Copy hook script
mkdir -p "$HOOKS_DIR"
cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"
echo "  Copied ${HOOK_NAME} to ${HOOKS_DIR}/"

# 2. Ensure settings.json exists
if [[ ! -f "$SETTINGS" ]]; then
  echo '{}' > "$SETTINGS"
fi

# 3. Register hook in settings.json for each event
for event in "${EVENTS[@]}"; do
  # Check if this hook is already registered for this event
  ALREADY=$(jq -r \
    --arg evt "$event" \
    --arg cmd "$HOOK_DST" \
    '.hooks[$evt] // [] | [.[].hooks[]? | select(.command == $cmd)] | length' \
    "$SETTINGS" 2>/dev/null || echo "0")

  if [[ "$ALREADY" != "0" ]]; then
    echo "  ${event}: already registered"
    continue
  fi

  # Add the hook entry
  HOOK_ENTRY="{\"type\": \"command\", \"command\": \"${HOOK_DST}\"}"

  # Check if the event key exists with a catch-all matcher
  HAS_CATCHALL=$(jq -r \
    --arg evt "$event" \
    '.hooks[$evt] // [] | [.[] | select(.matcher == "")] | length' \
    "$SETTINGS" 2>/dev/null || echo "0")

  if [[ "$HAS_CATCHALL" != "0" ]]; then
    # Append to existing catch-all matcher's hooks array
    jq --arg evt "$event" \
       --argjson hook "$HOOK_ENTRY" \
       '(.hooks[$evt] |= [.[] | if .matcher == "" then .hooks += [$hook] else . end])' \
       "$SETTINGS" > "${SETTINGS}.tmp" && mv "${SETTINGS}.tmp" "$SETTINGS"
  else
    # Create new catch-all entry for this event
    jq --arg evt "$event" \
       --argjson hook "$HOOK_ENTRY" \
       '.hooks[$evt] = (.hooks[$evt] // []) + [{"matcher": "", "hooks": [$hook]}]' \
       "$SETTINGS" > "${SETTINGS}.tmp" && mv "${SETTINGS}.tmp" "$SETTINGS"
  fi

  echo "  ${event}: registered"
done

echo ""
echo "Done! Claude Run hooks are installed."
echo "Set CLAUDE_RUN_PORT env var if using a non-default port (default: 12001)."
