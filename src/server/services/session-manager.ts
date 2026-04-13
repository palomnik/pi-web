/**
 * Session Manager
 * 
 * Manages client sessions, terminal PTYs, and file subscriptions.
 */

import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface Client {
  id: string;
  ws: WebSocket;
  terminalSessions: Map<string, TerminalSession>;
  fileSubscriptions: Set<string>;
}

export interface TerminalSession {
  id: string;
  pty: any; // node-pty IPty
  cols: number;
  rows: number;
}

export class SessionManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();

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
    return id;
  }

  /**
   * Remove a client and clean up resources
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Kill all terminal sessions
    for (const session of client.terminalSessions.values()) {
      session.pty.kill();
    }

    this.clients.delete(clientId);
    this.emit('client-removed', clientId);
  }

  /**
   * Get client by ID
   */
  getClient(clientId: string): Client | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Send terminal input to a PTY
   */
  sendTerminalInput(clientId: string, sessionId: string, data: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const session = client.terminalSessions.get(sessionId);
    if (!session) return;

    session.pty.write(data);
  }

  /**
   * Resize a terminal session
   */
  resizeTerminal(clientId: string, sessionId: string, cols: number, rows: number): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const session = client.terminalSessions.get(sessionId);
    if (!session) return;

    session.pty.resize(cols, rows);
    session.cols = cols;
    session.rows = rows;
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