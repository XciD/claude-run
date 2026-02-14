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

# Detect Tailscale hostname and pre-generate certs
TAILSCALE_BIN=""
if [ -x "/Applications/Tailscale.app/Contents/MacOS/Tailscale" ]; then
    TAILSCALE_BIN="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
elif command -v tailscale &>/dev/null; then
    TAILSCALE_BIN="tailscale"
fi

HOSTNAME=""
if [ -n "$TAILSCALE_BIN" ]; then
    HOSTNAME=$("$TAILSCALE_BIN" status --json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null || echo "")
    if [ -n "$HOSTNAME" ]; then
        echo "Tailscale hostname: $HOSTNAME"
        # Pre-generate certs
        CERTS_DIR="$HOME/.claude/certs"
        mkdir -p "$CERTS_DIR"
        if [ ! -f "$CERTS_DIR/$HOSTNAME.crt" ]; then
            echo "Generating TLS certificates..."
            "$TAILSCALE_BIN" cert \
                --cert-file="$CERTS_DIR/$HOSTNAME.crt" \
                --key-file="$CERTS_DIR/$HOSTNAME.key" \
                "$HOSTNAME"
        fi
    fi
fi

# Unload existing service if present
if launchctl list | grep -q "com.claude-run" 2>/dev/null; then
    echo "Unloading existing service..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Build ProgramArguments
ARGS="        <string>$BINARY</string>"
if [ -n "$HOSTNAME" ]; then
    ARGS="$ARGS
        <string>--tls</string>
        <string>--hostname</string>
        <string>$HOSTNAME</string>"
fi
ARGS="$ARGS
        <string>--no-open</string>"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-run</string>
    <key>ProgramArguments</key>
    <array>
$ARGS
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/claude-run.out.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/claude-run.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>$PATH</string>
    </dict>
</dict>
</plist>
EOF

launchctl load "$PLIST_PATH"

echo ""
echo "Service installed and started."
echo "  Binary:   $BINARY"
echo "  Plist:    $PLIST_PATH"
echo "  Logs:     $LOG_DIR/claude-run.{out,err}.log"
if [ -n "$HOSTNAME" ]; then
    echo "  URL:      https://$HOSTNAME:12444/"
    echo "  Hostname: $HOSTNAME (cached — no Tailscale needed at runtime)"
fi
echo ""
echo "Commands:"
echo "  Stop:    launchctl unload $PLIST_PATH"
echo "  Start:   launchctl load $PLIST_PATH"
echo "  Logs:    tail -f $LOG_DIR/claude-run.out.log"
