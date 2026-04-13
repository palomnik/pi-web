# Pi-Web Interface - Fixes Summary

This document summarizes the fixes applied to resolve build and installation issues.

## Critical Fix: Extension Discovery

The package was not being recognized by Pi after installation.

**Problem:** Pi couldn't find the extension because `package.json` used the wrong format:
```json
"piConfig": {
  "provides": { "extensions": ["extension"] }
}
```

**Solution:** Pi expects a `pi` field with an `extensions` array containing paths to extension entry points:
```json
"pi": {
  "extensions": ["./dist/extension.js"]
}
```

---

## Issue

The package failed to install correctly from GitHub due to:
1. Missing `dist/` directory (not included in git)
2. TypeScript compilation errors in both backend and frontend code
3. Incorrect dependency versions

## Backend Fixes

### `src/extension.ts`

| Issue | Fix |
|-------|-----|
| `KeyId` type error - `'Ctrl+W'` not assignable | Changed to lowercase `'ctrl+w'` (Pi's key binding system requires lowercase format) |
| "Always truthy" expression warning | Refactored config parsing: `Object.keys(parsedArgs).filter(...)` → `Object.keys(parsedArgs).every(k => configKeys.includes(k as any))` |

### `src/server/index.ts`

| Issue | Fix |
|-------|-----|
| Import declaration conflicts with local declaration | Renamed `import { createServer }` → `import { createServer as createHttpServer }` |
| `createServer` type reference error | Changed `ReturnType<typeof createServer>` → `ReturnType<typeof createHttpServer>` |
| WebSocket handler missing parameters | Added `message.sessionId` parameter to `sendTerminalInput()` and `resizeTerminal()` calls |
| Spread operator type issue | Changed `{ type: 'chat-chunk', ...chunk }` → `{ type: 'chat-chunk', chunk }` |

### `tsconfig.extension.json`

- Added `"src/cli.ts"` to the `include` array for CLI entry point compilation

### `package.json`

- Added `"prepare": "npm run build"` script - runs automatically after `npm install` from GitHub
- This ensures TypeScript is compiled before the package can be used

---

## Frontend Fixes

### Dependency Version Updates (`frontend/package.json`)

| Package | Old Version | New Version |
|---------|-------------|-------------|
| `@xterm/addon-fit` | `^0.8.0` (not found) | `^0.11.0` |
| `@xterm/addon-web-links` | `^0.9.0` | `^0.11.0` |
| `@monaco-editor/react` | (missing) | Added |

### `src/App.tsx`

- Removed unused `setTheme` variable from destructuring

### `src/components/Files/FilesPanel.tsx`

- Removed unused imports: `Upload`, `Download`, `Trash2`, `ChevronLeft`, `ChevronRight`
- Removed unused state variables: `showHidden`, `viewMode`
- Removed unused functions: `handleDelete`, `formatSize`
- Updated to import `FileItem` type from `FileTree.tsx` for type consistency

### `src/components/Files/FileTree.tsx`

- Exported `FileItem` interface with optional fields (`modified?`, `permissions?`, `isHidden?`) for compatibility

### `src/components/GitHub/GitHubPanel.tsx`

- Removed unused imports: `GitPullRequest`, `GitMerge`, `Check`, `X`, `ChevronRight`
- Fixed optional chaining for `status?.aheadBehind?.ahead/behind` checks

### `src/components/Layout.tsx`

- Removed unused variables: `showTerminal`, `showFiles`, `showGitHub`

### `src/components/Terminal/TerminalPanel.tsx`

- Removed unused import: `Plus`
- Fixed `selection` property name → `selectionBackground` in xterm theme
- Added proper type casting: `document.getElementById(...) as HTMLDivElement | null`

### `src/styles/index.css`

- Removed Tailwind opacity modifier from `@apply`:
  ```css
  /* Before */
  @apply bg-pi-accent/20;
  
  /* After */
  background-color: rgba(108, 99, 255, 0.2);
  ```

---

## Installation Verification

After these fixes, the package installs correctly from GitHub:

```bash
# Install from GitHub
npm install github:palomnik/pi-web

# Or with Pi CLI
pi install github:palomnik/pi-web
```

The `prepare` script automatically builds TypeScript when installing from GitHub.

---

## Git Commits

1. **Fix TypeScript errors and add prepare script for GitHub installs**
   - `8c45356..f000263`

2. **Fix frontend TypeScript and build errors**
   - `f000263..d87f064`

---

## File Structure After Build

```
pi-web/
├── dist/                    # Built backend (auto-generated)
│   ├── cli.js              # CLI entry point
│   ├── extension.js        # Pi extension entry point
│   ├── server/             # Server modules
│   └── shared/             # Shared types
├── frontend/
│   └── dist/               # Built frontend (auto-generated)
│       ├── index.html
│       ├── assets/
│       └── pi-logo.svg
├── src/                    # TypeScript source
├── frontend/src/            # React source
├── package.json
└── tsconfig.extension.json
```