# Installation Guide

## Quick Install

```bash
# Install from GitHub
pi install github:palomnik/pi-web

# Reload Pi to load the extension
/reload
```

## Usage

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