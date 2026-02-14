# Claude Run

A real-time web dashboard for monitoring and interacting with Claude Code sessions. Built with Rust (axum) and React.

## Features

- **Live session monitoring** — Watch all your Claude Code sessions in real-time via SSE
- **Remote interaction** — Allow/deny permissions, answer questions, and send messages from the browser
- **Context visualizer** — Stacked area chart showing token usage evolution, cache efficiency, and compaction events
- **Session management** — Launch new agents, resume dead sessions, kill running ones
- **Zellij integration** — Attach sessions to Zellij panes for terminal multiplexing
- **Plan & task tracking** — Inline plan widget and task list extracted from conversations
- **Speech input** — Whisper (desktop) or native Web Speech API (mobile) for voice input
- **Attention indicators** — Bell notifications for sessions needing permission or stuck on errors
- **Search** — Full-text search across all conversations
- **Mobile-friendly** — Responsive UI with touch-optimized interactions

## Quick Start

### 1. Build

```bash
git clone https://github.com/XciD/claude-run.git
cd claude-run
pnpm install
cargo build
```

> The build script (`build.rs`) automatically runs `pnpm build:web` if the frontend hasn't been built yet.

### 2. Install hooks

Claude Run uses [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) to receive real-time status updates from your sessions. Run the install script:

```bash
./install-hooks.sh
```

This will:
- Copy `claude-run-status.sh` to `~/.claude/hooks/`
- Register the hook in `~/.claude/settings.json` for all relevant events

### 3. Run

```bash
# HTTP (local development)
./target/debug/claude-run

# HTTPS with Tailscale (for mobile/remote access)
./target/debug/claude-run --tls
```

Open the URL printed in the terminal.

## CLI Options

```
claude-run [OPTIONS]

Options:
  -p, --port <PORT>  Port to listen on [default: 12001]
  -d, --dir <DIR>    Claude directory path [default: ~/.claude]
      --dev          Enable CORS + serve from dist/web/ (development)
      --tls          Enable HTTPS using Tailscale certificates
      --no-open      Do not open browser automatically
  -h, --help         Print help
  -V, --version      Print version
```

### TLS mode

When `--tls` is enabled:
- HTTPS serves on `port + 443` (default: 12444) on all interfaces
- HTTP serves on `port` (default: 12001) on localhost only (for hooks)
- Certificates are fetched from Tailscale (`tailscale cert`)

## How It Works

Claude Code stores conversations as JSONL files in `~/.claude/projects/`. Claude Run:

1. **Watches** the directory for changes via `notify` (fsevents/inotify)
2. **Indexes** session files and parses conversation messages
3. **Streams** updates to the browser via Server-Sent Events (SSE)
4. **Receives** status updates from Claude Code hooks (session start, permission requests, tool use, etc.)
5. **Generates** summaries for sessions using `claude -p` in the background

## Architecture

```
~/.claude/projects/**/*.jsonl  ──→  File Watcher  ──→  AppState  ──→  SSE Stream  ──→  Browser
                                                         ↑
Claude Code  ──→  Hook script  ──→  POST /api/sessions/:id/status
```

- **Backend**: Rust + axum + tokio, frontend assets embedded via `rust-embed`
- **Frontend**: React 19 + Tailwind CSS 4 + Vite, no external charting libraries

## Development

```bash
# Frontend dev server (hot reload on port 12000)
pnpm dev

# Backend (serves static build from dist/web/)
cargo run -- --dev

# Build frontend only
pnpm build:web

# Lint backend
cargo clippy
```

## License

MIT
