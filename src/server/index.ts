/**
 * Pi Web Interface Backend
 * 
 * Provides a web-based interface to the Pi coding agent CLI.
 * Can be started from Pi via the /pi-web command.
 */

import express from 'express';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';

// Routes
import { createChatRouter } from './routes/chat.js';
import { createTerminalRouter } from './routes/terminal.js';
import { createFilesRouter } from './routes/files.js';
import { createGitHubRouter } from './routes/github.js';
import { createSettingsRouter } from './routes/settings.js';
import { createAuthRouter } from './routes/auth.js';

// Services
import { SessionManager } from './services/session-manager.js';
import { PiBridge } from './services/pi-bridge.js';
import { AuthService } from './services/auth.js';

export interface PiWebConfig {
  port: number;
  host: string;
  auth: {
    enabled: boolean;
    username?: string;
    password?: string;
  };
  pi: {
    cwd: string;
    env: NodeJS.ProcessEnv;
  };
}

export interface PiWebServer {
  config: PiWebConfig;
  app: express.Application;
  server: ReturnType<typeof createHttpServer>;
  wss: WebSocketServer;
  sessionManager: SessionManager;
  piBridge: PiBridge;
  authService: AuthService;
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  setChatHandler(handler: import('./services/pi-bridge.js').ChatHandler): void;
}

/**
 * Create and configure the Pi Web server
 */
export function createPiWebServer(config: PiWebConfig): PiWebServer {
  const app = express();
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  
  // Initialize services
  const sessionManager = new SessionManager(config.pi.cwd);
  const piBridge = new PiBridge(config.pi.cwd, config.pi.env);
  const authService = new AuthService(config.auth);

  // Middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Allow inline scripts for development
  }));
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static files (frontend build output)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const frontendPath = join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendPath));

  // Auth routes (always accessible, no auth required)
  app.use('/api/auth', createAuthRouter(authService));

  // Auth middleware for protected routes - MUST be before route handlers
  // SECURITY: If auth is enabled, ALL /api/* endpoints (except /auth/*) require a valid token.
  // If auth is enabled but credentials are not configured, ALL requests are denied —
  // this prevents the server from operating in an insecure half-configured state.
  app.use('/api/*', (req, res, next) => {
    // Skip auth for health check and auth endpoints
    if (req.path === '/health' || req.path.startsWith('/auth/')) {
      return next();
    }
    
    if (!config.auth.enabled) {
      // Auth not enabled — deny all API access for security
      return res.status(403).json({ 
        error: 'Authentication is not enabled. Access denied.',
        code: 'AUTH_DISABLED'
      });
    }

    if (!authService.hasCredentials()) {
      // Auth enabled but no credentials — deny all API access
      return res.status(503).json({ 
        error: 'Authentication is enabled but no credentials are configured. Set PI_WEB_USERNAME and PI_WEB_PASSWORD.',
        code: 'NO_CREDENTIALS'
      });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!authService.validateToken(token)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    next();
  });

  // API Routes (after auth middleware so they're protected)
  app.use('/api/chat', createChatRouter(piBridge, sessionManager));
  app.use('/api/terminal', createTerminalRouter());
  app.use('/api/files', createFilesRouter(config.pi.cwd));
  app.use('/api/github', createGitHubRouter());
  app.use('/api/settings', createSettingsRouter());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      piConnected: piBridge.isConnected(),
      sessions: sessionManager.getSessionCount(),
    });
  });

  // WebSocket handling - validate auth token on connection
  wss.on('connection', (ws: WebSocket, req) => {
    // SECURITY: If auth is enabled, validate the token from the URL query params
    // If auth is disabled, deny connection entirely — no unauthenticated access
    if (!config.auth.enabled) {
      console.log('[WS] Rejected WebSocket connection: authentication is not enabled');
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Authentication is not enabled. Access denied.' }));
      ws.close(4003, 'Authentication not enabled');
      return;
    }

    if (config.auth.enabled && !authService.hasCredentials()) {
      console.log('[WS] Rejected WebSocket connection: no credentials configured');
      ws.send(JSON.stringify({ type: 'auth-error', message: 'No credentials configured. Access denied.' }));
      ws.close(4003, 'No credentials configured');
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');
    
    if (!token || !authService.validateToken(token)) {
      console.log('[WS] Unauthorized WebSocket connection - closing');
      ws.send(JSON.stringify({ type: 'auth-error', message: 'Authentication required' }));
      ws.close(4001, 'Authentication required');
      return;
    }
    
    // Register client with session manager
    const clientId = sessionManager.registerClient(ws);
    console.log(`[WS] Client connected: ${clientId}`);

    // Handle chat messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await handleWebSocketMessage(ws, message, piBridge, sessionManager, clientId);
      } catch (error) {
        console.error('[WS] Error handling message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${clientId}`);
      sessionManager.removeClient(clientId);
    });

    // Send initial state
    ws.send(JSON.stringify({
      type: 'connected',
      clientId: clientId,
      piConnected: piBridge.isConnected(),
      cwd: config.pi.cwd
    }));;
  });

  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(join(frontendPath, 'index.html'));
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[Server] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  let serverRunning = false;

  // SECURITY: Validate auth configuration at startup
  if (!config.auth.enabled) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠  SECURITY WARNING: Authentication is NOT enabled!        ║');
    console.error('║                                                            ║');
    console.error('║  The server will start, but ALL access is denied until     ║');
    console.error('║  authentication is properly configured.                    ║');
    console.error('║                                                            ║');
    console.error('║  To enable auth:                                           ║');
    console.error('║    1. Set in .env:                                         ║');
    console.error('║         PI_WEB_USERNAME=<your_username>                       ║');
    console.error('║         PI_WEB_PASSWORD=<your_password>                       ║');
    console.error('║    2. Start with --auth flag                               ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
  } else if (!authService.hasCredentials()) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  ⚠  SECURITY WARNING: Authentication is enabled, but      ║');
    console.error('║     NO CREDENTIALS are configured!                         ║');
    console.error('║                                                            ║');
    console.error('║  Login will be IMPOSSIBLE until credentials are set.       ║');
    console.error('║                                                            ║');
    console.error('║  Set in .env:                                              ║');
    console.error('║    PI_WEB_USERNAME=<your_username>                           ║');
    console.error('║    PI_WEB_PASSWORD=<your_password>                           ║');
    console.error('║                                                            ║');
    console.error('║  Or in ~/.pi/web-config.json:                              ║');
    console.error('║    { "auth": { "username": "...", "password": "..." } }   ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
  } else {
    console.log('[Pi Web] ✓ Authentication enabled and credentials configured');
  }

  // Note: PiBridge auto-connect is deferred to the start() method.
  // This ensures that setChatHandler() called after creation (but before start())
  // takes precedence over auto-connecting.

  return {
    config,
    app,
    server: httpServer,
    wss,
    sessionManager,
    piBridge,
    authService,
    
    async start() {
      // If no external chat handler has been set and not in extension mode,
      // try to connect to Pi for standalone chat functionality.
      if (!piBridge.isConnected() && !config.pi.env.PI_SESSION) {
        piBridge.connect().then(() => {
          console.log('[Pi Web] Connected to Pi');
        }).catch((err) => {
          console.log('[Pi Web] Could not connect to Pi:', err.message);
          console.log('[Pi Web] Chat will be limited. Start Pi CLI for full functionality.');
        });
      } else if (piBridge.isConnected()) {
        console.log('[Pi Web] Chat handler already configured.');
      } else {
        console.log('[Pi Web] Running as Pi extension. Chat will use Pi\'s running model.');
      }

      return new Promise((resolve, reject) => {
        httpServer.once('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            console.error(`[Pi Web] Port ${config.port} is already in use.`);
            console.error(`[Pi Web] Is another Pi Web instance running?`);
            serverRunning = false;
            reject(new Error(`Port ${config.port} is already in use`));
          } else {
            reject(err);
          }
        });
        
        httpServer.listen(config.port, config.host, () => {
          serverRunning = true;
          console.log(`[Pi Web] Server started on http://${config.host}:${config.port}`);
          resolve();
        });
      });
    },

    async stop() {
      return new Promise((resolve) => {
        wss.clients.forEach((client) => client.close());
        httpServer.close(() => {
          serverRunning = false;
          console.log('[Pi Web] Server stopped');
          resolve();
        });
      });
    },

    isRunning() {
      return serverRunning;
    },

    setChatHandler(handler: import('./services/pi-bridge.js').ChatHandler) {
      piBridge.setChatHandler(handler);
    },
  };
}

/**
 * Handle WebSocket messages from clients
 */
async function handleWebSocketMessage(
  ws: WebSocket,
  message: any,
  piBridge: PiBridge,
  sessionManager: SessionManager,
  clientId: string
) {
  switch (message.type) {
    case 'chat':
      // Stream chat messages from Pi
      try {
        if (!piBridge.isConnected()) {
          ws.send(JSON.stringify({ 
            type: 'chat-chunk', 
            chunk: { 
              type: 'error', 
              content: 'Pi is not connected. Using standalone mode with limited functionality.' 
            } 
          }));
          ws.send(JSON.stringify({ 
            type: 'chat-chunk', 
            chunk: { type: 'done' } 
          }));
          return;
        }
        
        await piBridge.streamChat(message.content, message.sessionId, (chunk) => {
          ws.send(JSON.stringify({ type: 'chat-chunk', chunk }));
        });
      } catch (error) {
        console.error('[WS] Chat error:', error);
        ws.send(JSON.stringify({ 
          type: 'chat-chunk', 
          chunk: { 
            type: 'error', 
            content: error instanceof Error ? error.message : 'Chat failed' 
          } 
        }));
        ws.send(JSON.stringify({ type: 'chat-chunk', chunk: { type: 'done' } }));
      }
      break;

    case 'terminal-input':
      // Forward terminal input to PTY
      sessionManager.sendTerminalInput(clientId, message.sessionId, message.data);
      break;

    case 'terminal-create':
      // Create a new PTY session, using client's preferred session ID
      const termSession = sessionManager.createTerminalSession(clientId, {
        cols: message.cols || 80,
        rows: message.rows || 24,
        cwd: message.cwd,
        shell: message.shell,
        sessionId: message.sessionId, // Use client's session ID
      });
      
      if (termSession) {
        ws.send(JSON.stringify({
          type: 'terminal-created',
          sessionId: termSession.id,
          cols: termSession.cols,
          rows: termSession.rows,
          shell: termSession.shell,
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Failed to create terminal session',
        }));
      }
      break;

    case 'terminal-resize':
      // Resize PTY
      sessionManager.resizeTerminal(clientId, message.sessionId, message.cols, message.rows);
      break;

    case 'terminal-kill':
      // Kill a terminal session
      const killed = sessionManager.killTerminalSession(clientId, message.sessionId);
      ws.send(JSON.stringify({
        type: 'terminal-killed',
        sessionId: message.sessionId,
        success: killed,
      }));
      break;

    case 'subscribe':
      // Subscribe to file changes
      sessionManager.subscribeToPath(clientId, message.path);
      break;

    case 'unsubscribe':
      // Unsubscribe from file changes
      sessionManager.unsubscribeFromPath(clientId, message.path);
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }));
  }
}

/**
 * Create Pi Web server instance (for extension use)
 */
export async function createPiWebServerInstance(config: PiWebConfig): Promise<PiWebServer> {
  const server = createPiWebServer(config);
  await server.start();
  return server;
}

export default createPiWebServer;