# Pi-Web Interface - Fixes Summary

This document summarizes the fixes applied to resolve build, installation, and runtime issues.

## Round 1: Build & Installation Fixes

### Extension Discovery

**Problem:** Pi couldn't find the extension because `package.json` used the wrong format.

**Solution:** Use `pi` field with `extensions` array:
```json
"pi": { "extensions": ["./dist/extension.js"] }
```

### TypeScript Compilation Errors

- `KeyId` type error - Changed to lowercase `'ctrl+w'` → `'ctrl+shift+w'`
- Import declaration conflicts in `index.ts` - Renamed `createServer` import
- WebSocket handler missing parameters - Added `sessionId` to calls
- Added `src/cli.ts` to tsconfig include
- Frontend dependency version fixes (xterm addons)
- Removed unused imports/variables across frontend components

---

## Round 2: Runtime & Functional Fixes

### Fix 1: Auth Middleware Order (CRITICAL)

**Problem:** Auth middleware was registered AFTER route handlers, so it never protected any API routes.

**Solution:** Moved auth middleware BEFORE the route handlers in `src/server/index.ts`.

### Fix 2: Chat Doesn't Work - PiBridge Not Connected (CRITICAL)

**Problem:** When running as a Pi extension, `piBridge.connect()` was skipped (because `isStandalone` was false), and `piBridge.setChatHandler()` was never called. So `piBridge.isConnected()` always returned `false` and all chat messages received an error.

**Solution:** 
- Always attempt to connect (removed `isStandalone` check)
- PiBridge now tries RpcClient first, then falls back to print mode
- Added `setChatHandler()` method to `PiWebServer` interface for extension mode
- Print mode spawns `pi --print --mode json` per chat message with prompt via stdin

### Fix 3: Terminal Uses spawn Instead of node-pty (CRITICAL)

**Problem:** Terminal used `child_process.spawn` which creates pipes, not a PTY. The shell doesn't detect a TTY and behaves incorrectly:
- No interactive prompt
- No line editing / tab completion
- No color output
- Interactive programs (vim, top) don't work

The package had `node-pty` as a dependency but never used it.

**Solution:** Rewrote `SessionManager` to use `node-pty` for proper PTY allocation, with spawn as a fallback if node-pty is unavailable.

### Fix 4: node-pty spawn-helper Missing Execute Permission (CRITICAL)

**Problem:** npm doesn't preserve execute permissions on binary files. The `spawn-helper` binary in `node-pty/prebuilds/` was installed without execute permission, causing `posix_spawnp failed` error.

**Solution:** 
- Added `fix-perms.cjs` script that sets execute permission on spawn-helper
- Added `fix-perms` npm script and integrated into `postinstall`

### Fix 5: Terminal Resize Corrupts Shell

**Problem:** `resizeTerminal` wrote `stty cols X rows Y` as a command to stdin, which appeared as text in the terminal and got executed as a shell command.

**Solution:** With node-pty, proper resize uses `pty.resize(cols, rows)`. The spawn fallback now simply logs that resize isn't supported (no longer corrupts the shell).

### Fix 6: Multiple Redundant WebSocket Connections

**Problem:** `App.tsx`, `ChatPanel.tsx`, and `TerminalPanel.tsx` each created their own WebSocket connection (3 total), causing unnecessary resource usage and potential message routing issues.

**Solution:** Created a shared WebSocket store (`websocketStore.ts`) using zustand. All components now use the single shared connection with a pub/sub event system.

### Fix 7: Terminal Session ID Mapping

**Problem:** Server created its own session IDs that didn't match the frontend's IDs, requiring fragile mapping logic.

**Solution:** `createTerminalSession` now accepts an optional `sessionId` from the client. The WebSocket handler passes the client's session ID through to the session manager.

### Fix 8: `marked` API Robustness

**Problem:** `marked.parse()` in recent versions could potentially return a Promise under certain configurations. The `MessageBubble` used it synchronously in `useMemo`.

**Solution:** Added `marked.setOptions()` configuration, proper try/catch, and type checking of the result.

### Fix 9: `require()` in ESM Context

**Problem:** `terminal.ts` used `require('fs')` which doesn't exist in ESM modules (package has `"type": "module"`).

**Solution:** Changed to `await import('fs/promises')` with async handler.

### Fix 10: PiBridge Process Mode Hang

**Problem:** Spawning `pi --mode json` and writing to stdin didn't produce output because JSON-RPC mode expects properly formatted RPC messages. Spawning `pi --print --mode json <message>` as a CLI argument also caused the process to hang.

**Solution:** Spawn `pi --print --mode json` WITHOUT the message as a CLI argument. Instead, write the prompt to stdin and call `stdin.end()`. This makes Pi process the prompt and exit with JSON output on stdout.

### Fix 11: PiBridge JSON Message Parsing

**Problem:** `message_end` and `message_start` events contain structured data (arrays of content objects), not plain text. Sending these as text chunks corrupted the chat display.

**Solution:** Only emit text chunks from `message_update` events with `text_delta` type. Ignore lifecycle events (`session`, `agent_start`, `message_start`, `message_end`, etc.).

### Fix 12: Documentation Inconsistency

**Problem:** `INSTALL.md` said `Ctrl+W` but extension registers `Ctrl+Shift+W`.

**Solution:** Updated documentation to correctly state `Ctrl+Shift+W`.

---

## File Structure After Fixes

```
pi-web/
├── dist/                    # Built backend
├── frontend/
│   └── dist/               # Built frontend
│   └── src/
│       ├── stores/
│       │   ├── appStore.ts
│       │   └── websocketStore.ts    # NEW: shared WebSocket
│       └── components/
│           ├── Chat/
│           │   ├── ChatPanel.tsx     # Updated: uses shared WS
│           │   └── MessageBubble.tsx # Updated: safe marked usage
│           └── Terminal/
│               └── TerminalPanel.tsx # Updated: uses shared WS
├── src/
│   └── server/
│       ├── index.ts                   # Updated: auth order, setChatHandler
│       └── services/
│           ├── pi-bridge.ts           # REWRITTEN: RPC + print mode
│           └── session-manager.ts     # REWRITTEN: node-pty support
├── fix-perms.cjs                      # NEW: fix node-pty permissions
├── package.json                       # Updated: fix-perms script
├── INSTALL.md                         # Updated: correct shortcut
└── FIXES.md                           # This file
```