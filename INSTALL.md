# Installation Guide

## Quick Install (Recommended)

```bash
pi install github:palomnik/pi-web
```

This command will:
1. Download the package
2. Install it to `~/.pi/agent/extensions/pi-web`
3. Register it with Pi

Then reload Pi:
```
/reload
```

## Manual Install Methods

### Method 1: Project-local Extension

Install as a project dependency:
```bash
npm install github:palomnik/pi-web
```

Create a symlink in Pi's extensions directory:
```bash
mkdir -p ~/.pi/agent/extensions
ln -s $(pwd)/node_modules/pi-web ~/.pi/agent/extensions/pi-web
```

### Method 2: Global Extension Directory

Clone directly into extensions:
```bash
cd ~/.pi/agent/extensions
git clone https://github.com/palomnik/pi-web.git
cd pi-web
npm install
npm run build
```

### Method 3: Settings Configuration

Install anywhere and add to `~/.pi/agent/settings.json`:
```json
{
  "extensions": ["/absolute/path/to/pi-web"]
}
```

## Usage

After installation and reload:

```
/pi-web          # Start web interface on port 3300
/pi-web 8080     # Start on port 8080  
/pi-web off      # Stop web interface
/pi-web status   # Show status
```

## Keyboard Shortcut

Press `Ctrl+W` to toggle the web interface.

## CLI Flag

```bash
pi --web   # Start Pi with web interface enabled
```

## Standalone Usage

You can also run pi-web without Pi CLI:

```bash
npm install github:palomnik/pi-web
npx pi-web
```

## Building from Source

```bash
git clone https://github.com/palomnik/pi-web.git
cd pi-web
npm install
npm run build

# Install locally
pi install .
```

## Troubleshooting

### Command not recognized

If `/pi-web` is not recognized:

1. Check if the extension is installed:
   ```bash
   ls ~/.pi/agent/extensions/
   ```

2. Verify build completed:
   ```bash
   ls ~/.pi/agent/extensions/pi-web/dist/extension.js
   ```

3. Try reloading Pi:
   ```
   /reload
   ```

4. Check for errors in Pi's logs

### Port already in use

```bash
# Find what's using the port
lsof -i :3300

# Use a different port
/pi-web 3001
```