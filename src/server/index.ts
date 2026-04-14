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
}

/**
 * Create and configure the Pi Web server
 */
export function createPiWebServer(config: PiWebConfig): PiWebServer {
  const app = express();
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  
  // Initialize services
  const sessionManager = new SessionManager();
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

  // API Routes
  app.use('/api/chat', createChatRouter(piBridge, sessionManager));
  app.use('/api/terminal', createTerminalRouter());
  app.use('/api/files', createFilesRouter(config.pi.cwd));
  app.use('/api/github', createGitHubRouter());
  app.use('/api/settings', createSettingsRouter());

  // Auth middleware for protected routes
  app.use('/api/*', (req, res, next) => {
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
    const clientId = uuidv4();
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

  // Try to connect to Pi on startup (only when running standalone)
  // When running as extension from Pi, Pi is already the parent process
  const isStandalone = !process.env.PI_SESSION;
  if (isStandalone) {
    piBridge.connect().then(() => {
      console.log('[Pi Web] Connected to Pi');
    }).catch((err) => {
      console.log('[Pi Web] Could not connect to Pi:', err.message);
      console.log('[Pi Web] Chat will be limited. Start Pi CLI for full functionality.');
    });
  }

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
      await piBridge.streamChat(message.content, message.sessionId, (chunk) => {
        ws.send(JSON.stringify({ type: 'chat-chunk', chunk }));
      });
      break;

    case 'terminal-input':
      // Forward terminal input to PTY
      sessionManager.sendTerminalInput(clientId, message.sessionId, message.data);
      break;

    case 'terminal-resize':
      // Resize PTY
      sessionManager.resizeTerminal(clientId, message.sessionId, message.cols, message.rows);
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