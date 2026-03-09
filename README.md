# Coder

A native desktop AI coding assistant built with [Electrobun](https://electrobun.dev), React, and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-sdk). Think of it as a GUI for Claude Code — multi-threaded conversations, file mentions, git integration, and a built-in terminal, all in a lightweight desktop app.

## Features

- **Multi-threaded chat** — Persistent conversation threads grouped by project
- **File mentions** — Reference files in your project directory directly in chat
- **Git integration** — View uncommitted diffs in a slide-over panel, manage branches, and create AI-assisted commits
- **Built-in terminal** — Full PTY terminal embedded in the app
- **Tool permissions** — Approve or deny tool usage requests from Claude, with auto-deny timeout
- **Chat modes** — Switch between `chat`, `build`, and `plan` modes
- **Search** — Full-text search across all threads
- **Syntax highlighting** — Powered by Shiki
- **Context tracking** — Monitor token usage per conversation

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Desktop framework**: [Electrobun](https://electrobun.dev) (lightweight Chromium-based, not Electron)
- **Frontend**: React 18, TypeScript (strict mode), Tailwind CSS
- **AI**: [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **Terminal**: xterm.js + bun-pty
- **Code highlighting**: Shiki
- **Markdown**: react-markdown + remark-gfm

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- An Anthropic API key (set as `ANTHROPIC_API_KEY` environment variable)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/zeusinsight/coder.git
cd coder

# Install dependencies
bun install

# Run with hot module replacement (recommended for development)
bun run dev:hmr

# Or run without HMR
bun run start
```

### Build

```bash
# Canary build
bun run build:canary
```

## Architecture

```
src/
├── bun/                        # Main process (Bun + Electrobun)
│   ├── index.ts                # App entry, window management, RPC handlers
│   ├── claude-bridge.ts        # Claude Agent SDK integration
│   ├── thread-store.ts         # Thread/message persistence (~/.coder/)
│   ├── pty-manager.ts          # Terminal PTY handling
│   ├── rpc-schema.ts           # Type-safe RPC definitions
│   └── types.ts                # Shared types
│
└── mainview/                   # Frontend (React + Vite)
    ├── components/             # React components
    │   ├── chat-view.tsx       # Main chat interface
    │   ├── sidebar.tsx         # Thread list & navigation
    │   ├── terminal-panel.tsx  # Embedded terminal
    │   ├── branch-selector.tsx # Git branch management
    │   ├── git-diff-sidebar.tsx # Uncommitted changes viewer
    │   └── ...
    └── hooks/                  # Custom React hooks
        ├── use-chat.ts         # Chat state & streaming
        ├── use-threads.ts      # Thread CRUD
        ├── use-terminal.tsx    # Terminal state
        ├── use-branches.ts     # Git branch operations
        └── use-file-mention.ts # File mention handling
```

**Three-layer design:**
1. **Main process** (Bun) — File I/O, git operations, Claude SDK integration
2. **RPC layer** — Bidirectional type-safe communication between main process and webview
3. **Frontend** (React) — UI rendering, state management via custom hooks

Data is stored locally in `~/.coder/` (threads, messages, context usage).

## License

[MIT](LICENSE)
