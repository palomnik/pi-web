/**
 * Pi Web Extension
 * 
 * This extension adds /pi-web commands to the Pi coding agent CLI.
 * It allows controlling the web interface from within Pi.
 * 
 * Installation:
 *   pi install @anthropic/pi-web
 * 
 * Then run `/reload` in Pi to load the extension.
 * 
 * Commands:
 *   /pi-web          - Start the web interface (default port 3300)
 *   /pi-web off      - Stop the web interface
 *   /pi-web status   - Show current status
 *   /pi-web config   - Show configuration
 * 
 * Keyboard Shortcut:
 *   Ctrl+Shift+W - Toggle web interface on/off
 * 
 * CLI Flag:
 *   pi --web         - Start Pi with web interface enabled
 */

import type { ExtensionFactory } from '@mariozechner/pi-coding-agent';
import type { PiWebConfig, PiWebServer } from './server/index.js';
import { createPiWebServer } from './server/index.js';

// Global server instance
let server: PiWebServer | null = null;
let serverConfig: PiWebConfig | null = null;

/**
 * Get the default configuration for the web interface
 */
function getDefaultConfig(): PiWebConfig {
  return {
    port: 3300,
    host: 'localhost',
    auth: {
      enabled: false,
    },
    pi: {
      cwd: process.cwd(),
      env: process.env,
    },
  };
}

/**
 * Load configuration from file
 */
async function loadConfig(): Promise<PiWebConfig> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');
  const configPath = path.join(os.homedir(), '.pi', 'web-config.json');

  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return { ...getDefaultConfig(), ...JSON.parse(data) };
  } catch {
    return getDefaultConfig();
  }
}

/**
 * Save configuration to file
 */
async function saveConfig(config: Partial<PiWebConfig>): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');
  const configPath = path.join(os.homedir(), '.pi', 'web-config.json');
  const configDir = path.dirname(configPath);

  await fs.mkdir(configDir, { recursive: true });
  
  const currentConfig = serverConfig || getDefaultConfig();
  const newConfig = { ...currentConfig, ...config };
  
  await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');
  serverConfig = newConfig;
}

/**
 * Parse command arguments
 */
function parseArgs(args: string): Record<string, any> {
  const result: Record<string, any> = {};
  const parts = args.split(/\s+/).filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (part === '--port' && parts[i + 1]) {
      result.port = parseInt(parts[++i], 10);
    } else if (part === '--host' && parts[i + 1]) {
      result.host = parts[++i];
    } else if (part === '--auth') {
      result.auth = true;
    } else if (part === '--no-auth') {
      result.noAuth = true;
    } else if (part === 'off') {
      result.off = true;
    } else if (part === 'status') {
      result.status = true;
    } else if (part === 'config') {
      result.config = true;
    } else if (/^\d+$/.test(part)) {
      // bare number = port
      result.port = parseInt(part, 10);
    }
  }

  return result;
}

/**
 * The extension factory - this is the main entry point
 */
const piWebExtension: ExtensionFactory = (pi) => {
  
  // Register the /pi-web command (to start or control the server)
  pi.registerCommand('pi-web', {
    description: 'Start the Pi web interface server',
    
    handler: async (args, ctx) => {
      const parsedArgs = parseArgs(args);
      
      // Handle subcommands
      if (parsedArgs.off) {
        // Stop the server
        if (!server?.isRunning()) {
          ctx.ui.notify('Pi Web is not running', 'info');
          return;
        }

        try {
          await server.stop();
          server = null;
          ctx.ui.notify('Pi Web stopped', 'info');
          ctx.ui.setStatus('pi-web', undefined);
        } catch (error) {
          ctx.ui.notify(`Failed to stop Pi Web: ${error}`, 'error');
        }
        return;
      }

      if (parsedArgs.status) {
        // Show status
        if (server?.isRunning()) {
          const config = serverConfig || getDefaultConfig();
          ctx.ui.notify(
            `Pi Web running at http://${config.host}:${config.port}`,
            'info'
          );
        } else {
          ctx.ui.notify('Pi Web is not running', 'info');
        }
        return;
      }

      if (parsedArgs.config) {
        // Show or configure
        const configKeys = ['config', 'port', 'host', 'auth', 'noAuth'] as const;
        const hasOnlyConfigKeys = Object.keys(parsedArgs).every(k => configKeys.includes(k as any));
        if (hasOnlyConfigKeys) {
          // Just show config
          const config = serverConfig || await loadConfig();
          ctx.ui.notify(
            `Pi Web config:\nPort: ${config.port}\nHost: ${config.host}\nAuth: ${config.auth.enabled ? 'enabled' : 'disabled'}`,
            'info'
          );
          return;
        }

        // Update config
        const updates: Partial<PiWebConfig> = {};
        if (parsedArgs.port) updates.port = parsedArgs.port;
        if (parsedArgs.host) updates.host = parsedArgs.host;
        if (parsedArgs.auth) updates.auth = { enabled: true };
        if (parsedArgs.noAuth) updates.auth = { enabled: false };

        await saveConfig(updates);
        ctx.ui.notify('Pi Web config updated. Restart server to apply changes.', 'info');
        return;
      }

      // Start the server
      if (server?.isRunning()) {
        ctx.ui.notify('Pi Web is already running', 'info');
        return;
      }

      try {
        // Load or create config
        serverConfig = await loadConfig();
        
        // Apply command-line overrides
        if (parsedArgs.port) {
          serverConfig.port = parsedArgs.port;
        }
        if (parsedArgs.host) {
          serverConfig.host = parsedArgs.host;
        }
        if (parsedArgs.auth) {
          serverConfig.auth.enabled = true;
        }
        if (parsedArgs.noAuth) {
          serverConfig.auth.enabled = false;
        }

        // Update cwd to current Pi directory
        serverConfig.pi.cwd = ctx.cwd;

        // Create and start server
        server = createPiWebServer(serverConfig);
        await server.start();

        ctx.ui.notify(`Pi Web started at http://${serverConfig.host}:${serverConfig.port}`, 'info');
        
        // Show status in footer
        ctx.ui.setStatus('pi-web', `\u{1F310} Web: ${serverConfig.port}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error); if (errorMessage.includes('already in use')) { ctx.ui.notify(`Pi Web port ${serverConfig?.port || 3300} is already in use. Is another instance running?`, 'error'); } else { ctx.ui.notify(`Failed to start Pi Web: ${error}`, 'error'); }
      }
    },
  });

  // Register a keyboard shortcut to toggle the web interface
  // Note: Using ctrl+shift+w to avoid conflict with built-in ctrl+w (deleteWordBackward)
  pi.registerShortcut('ctrl+shift+w', {
    description: 'Toggle Pi Web interface',
    handler: async (ctx) => {
      if (server?.isRunning()) {
        await server.stop();
        server = null;
        ctx.ui.notify('Pi Web stopped', 'info');
        ctx.ui.setStatus('pi-web', undefined);
      } else {
        serverConfig = await loadConfig();
        serverConfig.pi.cwd = ctx.cwd;
        server = createPiWebServer(serverConfig);
        await server.start();
        ctx.ui.notify(`Pi Web started at http://${serverConfig.host}:${serverConfig.port}`, 'info');
        ctx.ui.setStatus('pi-web', `\u{1F310} Web: ${serverConfig.port}`);
      }
    },
  });

  // Register CLI flag for starting with web enabled
  pi.registerFlag('web', {
    type: 'boolean',
    description: 'Start Pi with web interface enabled (default port 3300)',
    default: false,
  });

  // Listen for the --web flag on startup
  pi.on('session_start', async (event, ctx) => {
    if (event.reason === 'startup') {
      const webFlag = pi.getFlag('web');
      if (webFlag === true) {
        // Auto-start web interface
        try {
          serverConfig = await loadConfig();
          serverConfig.pi.cwd = ctx.cwd;
          server = createPiWebServer(serverConfig);
          await server.start();
          ctx.ui.setStatus('pi-web', `\u{1F310} Web: ${serverConfig.port}`);
          console.log(`[Pi Web] Server started at http://${serverConfig.host}:${serverConfig.port}`);
        } catch (error) {
          console.error('[Pi Web] Failed to auto-start:', error);
        }
      }
    }
  });

  // Clean up on shutdown
  pi.on('session_shutdown', async () => {
    if (server?.isRunning()) {
      await server.stop();
      server = null;
    }
  });
};

export default piWebExtension;

// Also export the server creation function for programmatic use
export { createPiWebServer } from './server/index.js';
export type { PiWebConfig, PiWebServer } from './server/index.js';