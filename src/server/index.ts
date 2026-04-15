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

  // Auth middleware for protected routes - MUST be before route handlers
  app.use('/api/*', (req, res, next) => {
    // Skip auth for health check and login
    if (req.path === '/health' || req.path === '/auth/login') {
      return next();
    }
    
    if (!config.auth.enabled) {
      return next();
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const token = authHeader.replace('Bearer ', '');
    if (!authService.validateToken(token)) {
      return res.status(401).json({ error: 'Invalid token' });
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

  // WebSocket handling
  wss.on('connection', (ws: WebSocket, req) => {
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
      piConnected: piBridge.isConnected()
    }));
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

  // Always try to connect to Pi on startup.
  // When running as extension: connect to Pi as a child process for web chat.
  // When running standalone: connect to Pi for chat.
  piBridge.connect().then(() => {
    console.log('[Pi Web] Connected to Pi');
  }).catch((err) => {
    console.log('[Pi Web] Could not connect to Pi:', err.message);
    console.log('[Pi Web] Chat will be limited. Start Pi CLI for full functionality.');
  });

  return {
    config,
    app,
    server: httpServer,
    wss,
    sessionManager,
    piBridge,
    authService,
    
    async start() {
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