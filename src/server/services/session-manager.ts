/**
 * Session Manager
 * 
 * Manages client sessions, terminal processes, and file subscriptions.
 * 
 * Uses node-pty for proper pseudo-terminal allocation.
 * Falls back to child_process.spawn if node-pty is unavailable.
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';

// Try to import node-pty, fall back to spawn
let pty: any = null;
let ptyAvailable = false;

try {
  pty = await import('node-pty');
  ptyAvailable = true;
  console.log('[SessionManager] node-pty loaded successfully');
} catch (err) {
  console.log('[SessionManager] node-pty not available, using spawn fallback (limited terminal support)');
}

export interface Client {
  id: string;
  ws: WebSocket;
  terminalSessions: Map<string, TerminalSession>;
  fileSubscriptions: Set<string>;
}

export interface TerminalSession {
  id: string;
  process: ChildProcess | null;  // null when using pty
  pty: any | null;               // IPty when using node-pty
  cols: number;
  rows: number;
  cwd: string;
  shell: string;
}

export class SessionManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private defaultShell: string;
  private defaultCwd: string;

  constructor(defaultCwd: string = process.cwd()) {
    super();
    this.defaultCwd = defaultCwd;
    // Detect default shell
    this.defaultShell = process.env.SHELL || '/bin/bash';
  }

  /**
   * Check if node-pty is available
   */
  isPtyAvailable(): boolean {
    return ptyAvailable;
  }

  /**
   * Register a new client
   */
  registerClient(ws: WebSocket): string {
    const id = uuidv4();
    const client: Client = {
      id,
      ws,
      terminalSessions: new Map(),
      fileSubscriptions: new Set(),
    };
    this.clients.set(id, client);
    console.log(`[SessionManager] Client registered: ${id}`);
    return id;
  }

  /**
   * Remove a client and clean up resources
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Kill all terminal sessions for this client
    for (const [sessionId, session] of client.terminalSessions) {
      console.log(`[SessionManager] Killing terminal session: ${sessionId}`);
      try {
        if (session.pty) {
          session.pty.kill();
        } else if (session.process) {
          session.process.kill();
        }
      } catch (e) {
        // Ignore errors when killing
      }
    }

    this.clients.delete(clientId);
    this.emit('client-removed', clientId);
    console.log(`[SessionManager] Client removed: ${clientId}`);
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): Client | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Create a new terminal session for a client
   */
  createTerminalSession(
    clientId: string,
    options: {
      cols?: number;
      rows?: number;
      cwd?: string;
      shell?: string;
      env?: Record<string, string>;
      sessionId?: string;  // Optional preferred session ID from client
    } = {}
  ): TerminalSession | null {
    const client = this.clients.get(clientId);
    if (!client) {
      console.error(`[SessionManager] Client not found: ${clientId}`);
      return null;
    }

    const sessionId = options.sessionId || `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const cols = options.cols || 80;
    const rows = options.rows || 24;
    const cwd = options.cwd || process.env.PI_CWD || this.defaultCwd;
    const shell = options.shell || this.defaultShell;

    // Merge environment
    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      ...options.env,
    };

    try {
      // Use the frontend's session ID if provided, or use our own
      let ptyProcess: any = null;
      let shellProcess: ChildProcess | null = null;

      if (ptyAvailable) {
        // Use node-pty for proper PTY allocation
        console.log(`[SessionManager] Spawning PTY shell: ${shell} in ${cwd} (${cols}x${rows})`);
        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: env as Record<string, string>,
        });
      } else {
        // Fallback to spawn (limited: no prompt, no interactive programs)
        console.log(`[SessionManager] Spawning shell (spawn fallback): ${shell} in ${cwd}`);
        shellProcess = spawn(shell, ['--login', '-i'], {
          cwd,
          env: env as NodeJS.ProcessEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }

      const session: TerminalSession = {
        id: sessionId,
        process: shellProcess,
        pty: ptyProcess,
        cols,
        rows,
        cwd,
        shell,
      };

      // Handle output - send to client via WebSocket
      const sendData = (data: string) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'terminal-output',
            sessionId: sessionId,
            data: data,
          }));
        }
      };

      if (ptyProcess) {
        // node-pty emits 'data' events
        ptyProcess.onData((data: string) => {
          sendData(data);
        });

        ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
          console.log(`[SessionManager] PTY exited: ${sessionId} (code: ${exitCode})`);
          
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'terminal-exit',
              sessionId: sessionId,
              exitCode: exitCode || 0,
              signal: null,
            }));
          }

          client.terminalSessions.delete(sessionId);
          this.emit('terminal-exit', clientId, sessionId, exitCode || 0);
        });
      } else if (shellProcess) {
        // spawn fallback
        shellProcess.stdout?.on('data', (data: Buffer) => {
          sendData(data.toString('utf8'));
        });

        shellProcess.stderr?.on('data', (data: Buffer) => {
          sendData(data.toString('utf8'));
        });

        shellProcess.on('close', (code, signal) => {
          console.log(`[SessionManager] Shell exited: ${sessionId} (code: ${code}, signal: ${signal})`);
          
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
              type: 'terminal-exit',
              sessionId: sessionId,
              exitCode: code || 0,
              signal: signal || null,
            }));
          }

          client.terminalSessions.delete(sessionId);
          this.emit('terminal-exit', clientId, sessionId, code || 0);
        });

        shellProcess.on('error', (err) => {
          console.error(`[SessionManager] Shell error: ${err.message}`);
          sendData(`\x1b[31mError: ${err.message}\x1b[0m\r\n`);
        });
      }

      // Store session
      client.terminalSessions.set(sessionId, session);
      this.emit('terminal-created', clientId, sessionId);
      
      console.log(`[SessionManager] Terminal session created: ${sessionId}`);
      return session;
    } catch (error) {
      console.error(`[SessionManager] Failed to create terminal: ${error}`);
      return null;
    }
  }

  /**
   * Get terminal session
   */
  getTerminalSession(clientId: string, sessionId: string): TerminalSession | undefined {
    const client = this.clients.get(clientId);
    if (!client) return undefined;
    return client.terminalSessions.get(sessionId);
  }

  /**
   * Send terminal input to a shell
   */
  sendTerminalInput(clientId: string, sessionId: string, data: string): void {
    const session = this.getTerminalSession(clientId, sessionId);
    if (!session) {
      console.error(`[SessionManager] Terminal session not found: ${sessionId}`);
      return;
    }

    try {
      if (session.pty) {
        session.pty.write(data);
      } else if (session.process?.stdin) {
        session.process.stdin.write(data);
      }
    } catch (error) {
      console.error(`[SessionManager] Failed to write to shell: ${error}`);
    }
  }

  /**
   * Resize a terminal session
   */
  resizeTerminal(clientId: string, sessionId: string, cols: number, rows: number): void {
    const session = this.getTerminalSession(clientId, sessionId);
    if (!session) {
      console.error(`[SessionManager] Terminal session not found: ${sessionId}`);
      return;
    }

    // Update session dimensions
    session.cols = cols;
    session.rows = rows;

    if (session.pty) {
      // Proper PTY resize
      try {
        session.pty.resize(cols, rows);
        console.log(`[SessionManager] PTY resized: ${sessionId} to ${cols}x${rows}`);
      } catch (e) {
        console.error(`[SessionManager] Failed to resize PTY: ${e}`);
      }
    } else {
      // No proper resize support with spawn fallback
      console.log(`[SessionManager] Terminal dimensions updated (no PTY resize): ${sessionId} to ${cols}x${rows}`);
    }
  }

  /**
   * Kill a terminal session
   */
  killTerminalSession(clientId: string, sessionId: string): boolean {
    const session = this.getTerminalSession(clientId, sessionId);
    if (!session) return false;

    try {
      if (session.pty) {
        session.pty.kill();
      } else if (session.process) {
        session.process.kill('SIGTERM');
        // Force kill after timeout
        setTimeout(() => {
          session.process?.kill('SIGKILL');
        }, 2000);
      }
      const client = this.clients.get(clientId);
      if (client) {
        client.terminalSessions.delete(sessionId);
      }
      console.log(`[SessionManager] Terminal killed: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[SessionManager] Failed to kill terminal: ${error}`);
      return false;
    }
  }

  /**
   * List terminal sessions for a client
   */
  listTerminalSessions(clientId: string): TerminalSession[] {
    const client = this.clients.get(clientId);
    if (!client) return [];
    return Array.from(client.terminalSessions.values());
  }

  /**
   * Subscribe a client to file changes
   */
  subscribeToPath(clientId: string, path: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.fileSubscriptions.add(path);
  }

  /**
   * Unsubscribe a client from file changes
   */
  unsubscribeFromPath(clientId: string, path: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.fileSubscriptions.delete(path);
  }

  /**
   * Get total client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get total session count
   */
  getSessionCount(): number {
    return this.clients.size;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}