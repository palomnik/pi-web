# Pi-Web Interface - Project State Summary

**Last updated:** 2025-04-16
**Git status:** All changes committed and pushed to `origin/main` on `https://github.com/palomnik/pi-web.git`
**Latest commit:** `faf118d` - "Fix file manager: include path in API response and add breadcrumb navigation"

## Architecture

Pi-Web is a browser-based interface for the Pi coding agent. It has:
- **Backend** (Node.js/Express + WebSocket): `src/server/`
- **Frontend** (React + Vite): `frontend/src/`
- **Extension** (Pi extension entry point): `src/extension.ts`
- **Shared WebSocket store** (Zustand): `frontend/src/stores/websocketStore.ts`

When running as a Pi extension (`/pi-web` command in Pi), the web chat routes messages through Pi's already-running model via the extension API (`pi.sendUserMessage()` + `pi.on('message_update')`). When running standalone (`npx pi-web`), it spawns `pi --print --mode json` per chat message.

## Bugs Fixed (All Committed)

1. **Auth middleware placed AFTER routes** — Moved before routes so it actually protects endpoints
2. **Chat doesn't work — PiBridge never connected in extension mode** — Added `setChatHandler()` to PiWebServer interface; extension now passes `pi.on()`/`pi.sendUserMessage()` as bridge
3. **Terminal uses spawn instead of node-pty** — Rewrote SessionManager to use node-pty for proper PTY allocation
4. **node-pty spawn-helper missing execute permission** — Added `fix-perms.cjs` script, integrated into postinstall
5. **Terminal resize corrupts shell** — Now uses `pty.resize()` instead of writing stty to stdin
6. **3 separate WebSocket connections per page** — Created shared `websocketStore.ts` using zustand pub/sub
7. **Terminal session ID mapping was fragile** — Server now accepts client's preferred session ID
8. **`marked.parse()` safety** — Added config, try/catch, and type checking
9. **`require('fs')` in ESM context** — Changed to `await import('fs/promises')`
10. **PiBridge spawn mode hangs** — Write prompt to stdin and call `stdin.end()` instead of CLI arg
11. **PiBridge JSON parsing sent structured data as text** — Only emit text from `message_update`/`text_delta`
12. **INSTALL.md says Ctrl+W but extension registers Ctrl+Shift+W** — Updated docs
13. **Chat routing in extension mode** — PiBridge auto-connect moved from constructor to `start()` method to avoid race condition with `setChatHandler()`
14. **Terminal opens at root `/` instead of Pi's CWD** — Server sends CWD in `connected` WebSocket message; frontend sends it as `cwd` for terminal creation
15. **File manager highlights all files/folders when clicking one** — `/api/files/list` endpoint wasn't returning a `path` field per file, so `file.path` was `undefined` for every item. Clicking any file set `selectedFile = undefined`, making `undefined === undefined` true for all items. Fix: added `path` field to server response (relative path from rootDir). Also fixed double-slash in path construction (`/` + `/name` → `//name`) and added breadcrumb navigation for directory traversal.

## Chat Flow (Two Modes)

### Extension Mode (running inside Pi via `/pi-web` command)
1. Extension.ts creates server → calls `server.setChatHandler()` with a bridge using `pi.sendUserMessage()` and `pi.on('message_update')`
2. Web client sends `{ type: 'chat', content, sessionId }` via WebSocket
3. Server's `handleWebSocketMessage` calls `piBridge.streamChat()`
4. PiBridge sees `connectionMode === 'extension'` → calls `externalChatHandler`
5. Handler calls `pi.sendUserMessage(content)`, listens for `message_update`/`turn_end` events
6. Streaming text/thinking chunks are forwarded back to WebSocket as `chat-chunk`

### Standalone Mode (running `npx pi-web`)
1. Server auto-detects Pi CLI, connects via `piBridge.connect()` (tries RpcClient, then print mode)
2. Print mode: `piBridge.streamChat()` spawns `pi --print --mode json` per message, writes prompt to stdin
3. JSON output is parsed line-by-line; `text_delta` and `thinking_delta` events are sent as `chat-chunk`

## Key Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Pi extension entry point; bridges Pi's API to web chat |
| `src/server/index.ts` | Express server, WebSocket handler, routing |
| `src/server/services/pi-bridge.ts` | Chat bridge (RpcClient, print mode, extension mode) |
| `src/server/services/session-manager.ts` | Terminal sessions (node-pty with spawn fallback) |
| `src/server/services/auth.ts` | Token-based auth |
| `frontend/src/stores/websocketStore.ts` | Shared WebSocket connection (replaces 3 separate WS) |
| `frontend/src/components/Chat/ChatPanel.tsx` | Chat UI (uses shared WS) |
| `frontend/src/components/Terminal/TerminalPanel.tsx` | Terminal UI (xterm.js, uses shared WS) |
| `frontend/src/components/Files/FilesPanel.tsx` | File browser panel (sidebar + editor) |
| `frontend/src/components/Files/FileTree.tsx` | Tree view component with expand/collapse |
| `frontend/src/components/Files/FileEditor.tsx` | Monaco-based file editor/viewer |
| `fix-perms.cjs` | Fixes node-pty spawn-helper execute permission |

## Current Test Status

### ✅ Passing Tests
- Server starts/stops correctly
- Health endpoint works: `GET /api/health`
- Shells endpoint works: `GET /api/terminal/shells`
- Files listing works: `GET /api/files/list`
- Frontend served: `GET /`
- WebSocket connection works
- Terminal creation with PTY works (gets shell prompt)
- **Chat works in standalone mode** (sends message to Pi, gets "pong" back)
- **Chat works in extension mode** (setChatHandler called, response streamed)
- Auth middleware now protects routes correctly

### ⚠️ Not Yet Tested in Browser
- The frontend has not been tested in an actual browser with Chrome DevTools
- The `handleWebChat` function in extension.ts uses `pi.on()` and `pi.sendUserMessage()` which need to be tested inside an actual Pi session

## Important Design Decisions

1. **PiBridge connection timing**: Auto-connect happens in `start()`, NOT in the constructor. This ensures `setChatHandler()` (called after construction but before start) takes precedence.

2. **Extension mode detection**: `process.env.PI_SESSION` is set by the extension (in `extension.ts`) to `'1'`. The server checks `config.pi.env.PI_SESSION` (which includes `process.env`).

3. **Chat handler priority**: When `setChatHandler()` is called, `connectionMode` is set to `'extension'` and `isConnected()` returns `true`. The `connect()` method checks this mode and returns early, preventing auto-connect from overwriting it.

4. **WebSocket message flow**: All components (Chat, Terminal, Files) share ONE WebSocket connection via `websocketStore.ts`. Messages are dispatched by `type` field.

## Potential Issues / TODO

1. **Browser testing needed**: The full frontend flow needs to be tested in Chrome with `pi --web` or `/pi-web`
2. **The `handleWebChat` function's event listener cleanup**: Uses `pi.off()` which may not match Pi's API exactly — needs testing
3. **Multiple concurrent chat messages**: If user sends while Pi is still responding, `pi.sendUserMessage()` queues it as a follow-up. The event listeners from the previous call might overlap.
4. **Terminal PTY on Linux**: The `fix-perms.cjs` only fixes macOS binaries; Linux may need similar
5. **The `marked` library async handling**: Using `marked.parse()` synchronously; newer versions might require `await marked.parse()`
6. **Memory leaks**: Event listeners on `pi` in `handleWebChat` need proper cleanup on timeout/completion

## How to Resume / Test

```bash
cd pi-web
# Build backend
npm run build

# Build frontend  
cd frontend && npm run build && cd ..

# Fix PTY permissions
node fix-perms.cjs

# Test standalone server
node dist/cli.js

# Or test programmatically:
node --input-type=module -e "
import { createPiWebServer } from './dist/server/index.js';
const server = createPiWebServer({ port: 3300, host: 'localhost', auth: { enabled: false }, pi: { cwd: process.cwd(), env: process.env } });
await server.start();
console.log('Server running at http://localhost:3300');
"

# To test as Pi extension:
# 1. Run `pi` in a terminal
# 2. Type `/pi-web` or press Ctrl+Shift+W
# 3. Open browser to http://localhost:3300
# 4. Type a message in the chat and verify it responds
```