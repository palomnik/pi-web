/**
 * Pi Web Extension
 * 
 * This extension adds /pi-web commands to the Pi coding agent CLI.
 * It allows controlling the web interface from within Pi.
 * 
 * When running as a Pi extension, chat messages from the web interface
 * are routed through Pi's already-running model (not spawning a new process).
 * This means the web chat uses the same session, model, and context as Pi.
 * 
 * Installation:
 *   pi install github:palomnik/pi-web
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

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Load .env from ~/.pi/ first, then fall back to cwd
// This MUST happen before any other imports that might read env vars.
const piEnvPath = join(homedir(), '.pi', '.env');
if (existsSync(piEnvPath)) {
  dotenvConfig({ path: piEnvPath });
} else if (existsSync(join(process.cwd(), '.env'))) {
  dotenvConfig(); // loads from cwd
}

import type { ExtensionFactory } from '@mariozechner/pi-coding-agent';
import type { PiWebConfig, PiWebServer } from './server/index.js';
import { createPiWebServer } from './server/index.js';
import type { StreamChunk } from './server/services/pi-bridge.js';

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
      enabled: true, // Auth ON by default for security
      username: process.env.PI_WEB_USERNAME,
      password: process.env.PI_WEB_PASSWORD,
    },
    pi: {
      cwd: process.cwd(),
      env: process.env,
    },
  };
}

/**
 * Load configuration from file, with environment variable fallbacks.
 * Config file values take precedence, but env vars (from ~/.pi/.env)
 * are used as fallbacks for auth credentials when not specified in the file.
 */
async function loadConfig(): Promise<PiWebConfig> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');
  const configPath = path.join(os.homedir(), '.pi', 'web-config.json');

  const defaults = getDefaultConfig();

  try {
    const data = await fs.readFile(configPath, 'utf-8');
    const fileConfig = JSON.parse(data);
    const merged: PiWebConfig = { ...defaults, ...fileConfig };

    // Merge auth config specially: env vars serve as fallbacks
    if (fileConfig.auth) {
      merged.auth = {
        ...defaults.auth,
        ...fileConfig.auth,
        // Config file values take precedence; fall back to env vars
        username: fileConfig.auth.username || process.env.PI_WEB_USERNAME,
        password: fileConfig.auth.password || process.env.PI_WEB_PASSWORD,
      };
    }

    return merged;
  } catch {
    return defaults;
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
        
        // Set environment variable so routes know the working directory
        process.env.PI_CWD = ctx.cwd;
        process.env.PI_SESSION = '1';

        // Create and start server
        server = createPiWebServer(serverConfig);
        
        // Set up the chat handler so web chat goes through Pi's running model
        server.setChatHandler((content, sessionId, onChunk) => {
          return handleWebChat(pi, content, sessionId, onChunk);
        });
        
        await server.start();

        ctx.ui.notify(`Pi Web started at http://${serverConfig.host}:${serverConfig.port}`, 'info');
        
        // Show status in footer
        ctx.ui.setStatus('pi-web', `\u{1F310} Web: ${serverConfig.port}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('already in use')) {
          ctx.ui.notify(`Pi Web port ${serverConfig?.port || 3300} is already in use. Is another instance running?`, 'error');
        } else {
          ctx.ui.notify(`Failed to start Pi Web: ${error}`, 'error');
        }
      }
    },
  });

  // Register a keyboard shortcut to toggle the web interface
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
        process.env.PI_CWD = ctx.cwd;
        process.env.PI_SESSION = '1';
        server = createPiWebServer(serverConfig);
        server.setChatHandler((content, sessionId, onChunk) => {
          return handleWebChat(pi, content, sessionId, onChunk);
        });
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
          process.env.PI_CWD = ctx.cwd;
          process.env.PI_SESSION = '1';
          server = createPiWebServer(serverConfig);
          server.setChatHandler((content, sessionId, onChunk) => {
            return handleWebChat(pi, content, sessionId, onChunk);
          });
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

/**
 * Handle a chat message from the web interface by routing it through Pi's
 * already-running agent. This uses Pi's extension API to:
 * 1. Listen for streaming events (message updates, tool calls, etc.)
 * 2. Send the user message via pi.sendUserMessage()
 * 3. Forward the streaming response back to the web client
 */
async function handleWebChat(
  pi: any,
  content: string,
  sessionId: string | null,
  onChunk: (chunk: StreamChunk) => void
): Promise<void> {
  // We need to track which events belong to this chat request
  // since Pi is a single-user system, we can capture all events
  // that arrive after sending the message
  
  let resolved = false;
  
  const cleanup = () => {
    if (resolved) return;
    resolved = true;
    try { pi.off('message_update', onMessageUpdate); } catch {}
    try { pi.off('message_end', onMessageEnd); } catch {}
    try { pi.off('agent_end', onAgentEnd); } catch {}
    try { pi.off('turn_end', onTurnEnd); } catch {}
  };

  const onMessageUpdate = (event: any) => {
    if (resolved) return;
    
    const assistantEvent = event.assistantMessageEvent;
    if (!assistantEvent) return;
    
    switch (assistantEvent.type) {
      case 'text_delta':
        if (assistantEvent.delta) {
          onChunk({ type: 'text', content: assistantEvent.delta });
        }
        break;
      case 'thinking_delta':
        if (assistantEvent.delta) {
          onChunk({ type: 'thinking', content: assistantEvent.delta });
        }
        break;
      case 'thinking_start':
        // Thinking block started
        break;
      case 'thinking_end':
        // Thinking block ended - send the full thinking content
        if (assistantEvent.content) {
          onChunk({ type: 'thinking', content: `\n${assistantEvent.content}\n` });
        }
        break;
      case 'text_start':
        // Text block started
        break;
      case 'text_end':
        // Text block completed
        break;
      case 'toolcall_start':
      case 'toolcall_delta':
        break;
      case 'toolcall_end':
        if (assistantEvent.toolCall) {
          onChunk({ 
            type: 'tool_use', 
            name: assistantEvent.toolCall.name, 
            input: assistantEvent.toolCall.arguments 
          });
        }
        break;
    }
  };

  const onMessageEnd = (event: any) => {
    // Message fully received
  };

  const onTurnEnd = (event: any) => {
    // Turn complete - the agent has finished responding
    onChunk({ type: 'done' });
    cleanup();
  };

  const onAgentEnd = (event: any) => {
    // Agent has finished
    if (!resolved) {
      onChunk({ type: 'done' });
      cleanup();
    }
  };

  // Register event listeners
  pi.on('message_update', onMessageUpdate);
  pi.on('message_end', onMessageEnd);
  pi.on('turn_end', onTurnEnd);
  pi.on('agent_end', onAgentEnd);

  // Send the user message through Pi's running agent
  // This triggers Pi to process the message and stream back events
  pi.sendUserMessage(content);

  // Safety timeout - if we don't get events within 3 minutes, end the stream
  setTimeout(() => {
    if (!resolved) {
      onChunk({ type: 'error', content: 'Response timed out' });
      onChunk({ type: 'done' });
      cleanup();
    }
  }, 180000);
}

export default piWebExtension;

// Also export the server creation function for programmatic use
export { createPiWebServer } from './server/index.js';
export type { PiWebConfig, PiWebServer } from './server/index.js';