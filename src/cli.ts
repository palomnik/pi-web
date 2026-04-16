#!/usr/bin/env node
/**
 * CLI entry point for running Pi Web standalone
 * 
 * Usage:
 *   pi-web                 # Start server on default port (3300)
 *   pi-web 3000            # Start server on port 3000
 *   pi-web --port 3000     # Start server on port 3000
 *   pi-web --host 0.0.0.0  # Bind to all interfaces
 *   pi-web --auth          # Enable authentication
 */

import { config as dotenvConfig } from 'dotenv';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Load .env from ~/.pi/ first, then fall back to cwd
const piEnvPath = join(homedir(), '.pi', '.env');
if (existsSync(piEnvPath)) {
  dotenvConfig({ path: piEnvPath });
} else if (existsSync(join(process.cwd(), '.env'))) {
  dotenvConfig(); // loads from cwd
}
import { createPiWebServer, PiWebConfig } from './server/index.js';

const args = process.argv.slice(2);

function parseArgs(): Partial<PiWebConfig> {
  const config: Partial<PiWebConfig> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--port' && args[i + 1]) {
      config.port = parseInt(args[++i], 10);
    } else if (arg === '--host' && args[i + 1]) {
      config.host = args[++i];
    } else if (arg === '--auth') {
      config.auth = { enabled: true };
    } else if (arg === '--no-auth') {
      config.auth = { enabled: false };
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Pi Web Interface - Web-based interface for Pi coding agent

Usage:
  pi-web [options]
  pi-web <port>

Options:
  --port <n>      Port to listen on (default: 3300)
  --host <host>   Host to bind to (default: localhost)
  --auth          Enable authentication
  --no-auth       Disable authentication
  --help, -h      Show this help

Environment Variables:
  PI_WEB_PORT     Default port
  PI_WEB_HOST     Default host
  PI_WEB_USERNAME Auth username (REQUIRED for login)
  PI_WEB_PASSWORD Auth password (REQUIRED for login)

  Primary:   ~/.pi/.env
  Fallback:  .env in current working directory
  See .env.example for reference.

Examples:
  pi-web                      # Start on port 3300 (auth enabled by default)
  pi-web --no-auth            # Start WITHOUT auth (NOT recommended)
  pi-web 8080                 # Start on port 8080
  pi-web --host 0.0.0.0       # Bind to all interfaces
  pi-web --port 8080 --auth   # Explicitly enable auth
`);
      process.exit(0);
    } else if (/^\d+$/.test(arg)) {
      // Bare number = port
      config.port = parseInt(arg, 10);
    }
  }
  
  return config;
}

async function main() {
  const parsedArgs = parseArgs();
  
  const config: PiWebConfig = {
    port: parsedArgs.port || parseInt(process.env.PI_WEB_PORT || '3300', 10),
    host: parsedArgs.host || process.env.PI_WEB_HOST || 'localhost',
    auth: {
      enabled: parsedArgs.auth?.enabled ?? true, // Auth ON by default for security
      username: process.env.PI_WEB_USERNAME,
      password: process.env.PI_WEB_PASSWORD,
    },
    pi: {
      cwd: process.cwd(),
      env: process.env,
    },
  };
  
  console.log(`[Pi Web] Starting server...`);
  console.log(`[Pi Web] Host: ${config.host}`);
  console.log(`[Pi Web] Port: ${config.port}`);
  console.log(`[Pi Web] Auth: ${config.auth.enabled ? 'enabled' : 'disabled'}`);
  
  const server = createPiWebServer(config);
  await server.start();
  
  // Handle shutdown signals
  process.on('SIGTERM', async () => {
    console.log('[Pi Web] SIGTERM received, shutting down...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('[Pi Web] SIGINT received, shutting down...');
    await server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[Pi Web] Error:', error);
  process.exit(1);
});