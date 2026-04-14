/**
 * Session Manager
 * 
 * Manages client sessions, terminal PTYs, and file subscriptions.
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import * as pty from 'node-pty';

export interface Client {
  id: string;
  ws: WebSocket;
  terminalSessions: Map<string, TerminalSession>;
  fileSubscriptions: Set<string>;
}

export interface TerminalSession {
  id: string;
  pty: pty.IPty;
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
        session.pty.kill();
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
    } = {}
  ): TerminalSession | null {
    const client = this.clients.get(clientId);
    if (!client) {
      console.error(`[SessionManager] Client not found: ${clientId}`);
      return null;
    }

    const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      console.log(`[SessionManager] Spawning PTY: ${shell} in ${cwd}`);
      
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: env as { [key: string]: string },
      });

      const session: TerminalSession = {
        id: sessionId,
        pty: ptyProcess,
        cols,
        rows,
        cwd,
        shell,
      };

      // Handle PTY output - send to client via WebSocket
      ptyProcess.onData((data) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'terminal-output',
            sessionId: sessionId,
            data: data,
          }));
        }
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`[SessionManager] PTY exited: ${sessionId} (code: ${exitCode}, signal: ${signal})`);
        
        // Send exit notification to client
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'terminal-exit',
            sessionId: sessionId,
            exitCode,
            signal,
          }));
        }

        // Remove session
        client.terminalSessions.delete(sessionId);
        this.emit('terminal-exit', clientId, sessionId, exitCode);
      });

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
   * Send terminal input to a PTY
   */
  sendTerminalInput(clientId: string, sessionId: string, data: string): void {
    const session = this.getTerminalSession(clientId, sessionId);
    if (!session) {
      console.error(`[SessionManager] Terminal session not found: ${sessionId}`);
      return;
    }

    try {
      session.pty.write(data);
    } catch (error) {
      console.error(`[SessionManager] Failed to write to PTY: ${error}`);
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

    try {
      session.pty.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
      console.log(`[SessionManager] Terminal resized: ${sessionId} to ${cols}x${rows}`);
    } catch (error) {
      console.error(`[SessionManager] Failed to resize PTY: ${error}`);
    }
  }

  /**
   * Kill a terminal session
   */
  killTerminalSession(clientId: string, sessionId: string): boolean {
    const session = this.getTerminalSession(clientId, sessionId);
    if (!session) return false;

    try {
      session.pty.kill();
      const client = this.clients.get(clientId);
      if (client) {
        client.terminalSessions.delete(sessionId);
      }
      console.log(`[SessionManager] Terminal killed: ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[SessionManager] Failed to kill PTY: ${error}`);
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