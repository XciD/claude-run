#!/bin/bash
set -euo pipefail

PLIST_NAME="com.claude-run.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"
LOG_DIR="$HOME/.claude/logs"
BINARY="$(which claude-run 2>/dev/null || echo "")"

if [ -z "$BINARY" ]; then
    # Try cargo build location
    BINARY="$HOME/workspace/claude-run/target/release/claude-run"
    if [ ! -f "$BINARY" ]; then
        echo "Error: claude-run binary not found. Build it first with: cargo build --release"
        exit 1
    fi
fi

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# Unload existing service if present
if launchctl list | grep -q "com.claude-run" 2>/dev/null; then
    echo "Unloading existing service..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-run</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BINARY</string>
        <string>--tls</string>
        <string>--no-open</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/claude-run.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/claude-run.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
    </dict>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

echo "Service installed and started."
echo "  Binary: $BINARY"
echo "  Plist:  $PLIST_PATH"
echo "  Logs:   $LOG_DIR/claude-run.{out,err}.log"
echo ""
echo "Commands:"
echo "  Stop:    launchctl unload $PLIST_PATH"
echo "  Start:   launchctl load $PLIST_PATH"
echo "  Logs:    tail -f $LOG_DIR/claude-run.out.log"
