# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Coder is a desktop AI coding assistant GUI built with Electrobun (not Electron), React, and the Claude Agent SDK. It provides a multi-threaded chat interface for interacting with Claude, with features like file mentions, git diff viewing, syntax-highlighted code blocks, and tool permission management.

## Build & Development Commands

```bash
bun install                # Install dependencies
bun run dev:hmr            # Development with hot module replacement (recommended)
bun run dev                # Development without HMR (rebuilds via electrobun --watch)
bun run start              # Build frontend then launch app (vite build && electrobun dev)
bun run hmr                # Start only the Vite dev server on :5173
bun run build:canary       # Production canary build (vite build && electrobun build --env=canary)
```

There are no tests, linter, or formatter configured.

## Architecture

### Three-Layer Design

1. **Main Process (`src/bun/`)** — Runs on Bun runtime via Electrobun. Manages the BrowserWindow, handles file I/O, git operations, and integrates with the Claude Agent SDK for AI execution.

2. **RPC Layer** — Bidirectional typed RPC between main process and webview, defined in `src/bun/rpc-schema.ts` (type `CoderRPC`). Main→Webview pushes stream chunks, permission requests, and query results. Webview→Main sends messages, tool approvals, and directory picks.

3. **Frontend (`src/mainview/`)** — React 18 app bundled with Vite, styled with Tailwind CSS. State management uses React hooks (custom hooks in `src/mainview/hooks/`).

### Key Backend Files

- `src/bun/index.ts` — App entry point: creates BrowserWindow, registers all RPC handlers, manages HMR detection
- `src/bun/claude-bridge.ts` — Claude Agent SDK integration: manages sessions, streams responses, handles tool permissions
- `src/bun/thread-store.ts` — Persists threads to `~/.coder/threads.json` and messages to `~/.coder/messages/`
- `src/bun/types.ts` — Shared type definitions (Thread, StreamMessage, PermissionRequest, QueryResult, ContextUsage)

### Key Frontend Files

- `src/mainview/components/chat-view.tsx` — Main chat interface (largest component: input, message list, streaming display)
- `src/mainview/components/sidebar.tsx` — Thread list, project grouping, navigation
- `src/mainview/components/code-block.tsx` — Syntax highlighting via Shiki
- `src/mainview/components/git-diff-sidebar.tsx` — Slide-over panel showing uncommitted git changes
- `src/mainview/hooks/use-chat.ts` — Chat state, streaming message handling, permission resolution
- `src/mainview/hooks/use-threads.ts` — Thread CRUD and project management

### Data Storage

- Thread metadata: `~/.coder/threads.json`
- Per-thread messages: `~/.coder/messages/{threadId}.json`
- Context usage: `~/.coder/context-usage/{threadId}.json`

### HMR Detection

During development with `bun run dev:hmr`, the main process checks if a Vite dev server is running on `localhost:5173`. If detected, the webview loads from the dev server instead of bundled assets at `views://mainview/index.html`.

## Tech Stack

- **Runtime**: Bun
- **Desktop framework**: Electrobun (lightweight Chromium-based, not Electron)
- **Frontend**: React 18, Vite 6, Tailwind CSS 3, TypeScript (strict mode)
- **AI**: @anthropic-ai/claude-agent-sdk
- **Code highlighting**: Shiki
- **Markdown**: react-markdown + remark-gfm

## Reference

`llms.txt` in the repo root contains Electrobun API reference documentation.
