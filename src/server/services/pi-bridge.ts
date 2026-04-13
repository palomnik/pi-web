/**
 * Pi Bridge Service
 * 
 * Bridges the web interface to the Pi coding agent CLI.
 * Handles communication with the Pi agent for chat, file operations, etc.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';

export interface PiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | PiContentPart[];
}

export interface PiContentPart {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  source?: { type: 'base64'; media_type: string; data: string };
  name?: string;
  input?: any;
  output?: string;
}

export interface StreamChunk {
  type: 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error' | 'done';
  content?: string;
  name?: string;
  input?: any;
  output?: string;
}

export class PiBridge extends EventEmitter {
  private cwd: string;
  private env: NodeJS.ProcessEnv;
  private piProcess: ChildProcess | null = null;
  private connected: boolean = false;
  private stdin: Writable | null = null;
  private stdout: Readable | null = null;
  private buffer: string = '';

  constructor(cwd: string, env: NodeJS.ProcessEnv = process.env) {
    super();
    this.cwd = cwd;
    this.env = env;
  }

  /**
   * Check if connected to Pi
   */
  isConnected(): boolean {
    return this.connected && this.piProcess !== null;
  }

  /**
   * Start Pi in RPC mode (programmatic interface)
   */
  async connect(): Promise<void> {
    if (this.piProcess) {
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      try {
        // Spawn Pi in RPC/print mode
        this.piProcess = spawn('pi', ['--rpc'], {
          cwd: this.cwd,
          env: this.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.stdin = this.piProcess.stdin;
        
        // Handle stdout for responses
        this.piProcess.stdout?.on('data', (data: Buffer) => {
          this.handleData(data.toString());
        });

        // Handle stderr for logs/errors
        this.piProcess.stderr?.on('data', (data: Buffer) => {
          console.error('[Pi.stderr]', data.toString());
        });

        // Handle process exit
        this.piProcess.on('close', (code) => {
          console.log(`[Pi] Process exited with code ${code}`);
          this.connected = false;
          this.piProcess = null;
          this.stdin = null;
          this.emit('disconnect');
        });

        this.piProcess.on('error', (err) => {
          console.error('[Pi] Process error:', err);
          this.connected = false;
          this.emit('error', err);
        });

        this.connected = true;
        this.emit('connect');
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Disconnect from Pi
   */
  async disconnect(): Promise<void> {
    if (!this.piProcess) return;

    return new Promise((resolve) => {
      this.piProcess?.on('close', () => {
        resolve();
      });
      this.piProcess?.kill('SIGTERM');
      
      // Force kill after timeout
      setTimeout(() => {
        this.piProcess?.kill('SIGKILL');
      }, 5000);
    });
  }

  /**
   * Send a chat message and stream the response
   */
  async streamChat(
    content: string | PiContentPart[],
    sessionId: string | null,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    // For now, this is a placeholder that simulates streaming
    // In production, this would communicate with Pi's RPC interface
    
    const request = {
      type: 'chat',
      sessionId,
      content: typeof content === 'string' ? [{ type: 'text' as const, text: content }] : content,
    };

    // TODO: Implement actual Pi RPC communication
    // For now, return a placeholder response
    onChunk({ type: 'text', content: 'Pi Web interface is running. Connect to the Pi CLI for actual responses.' });
    onChunk({ type: 'done' });
  }

  /**
   * Handle incoming data from Pi stdout
   */
  private handleData(data: string): void {
    this.buffer += data;

    // Process complete messages (newline-delimited JSON)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (err) {
        console.error('[Pi] Failed to parse message:', line);
      }
    }
  }

  /**
   * Handle a parsed message from Pi
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'response':
        this.emit('response', message);
        break;
      case 'stream':
        this.emit('stream', message);
        break;
      case 'error':
        this.emit('error', new Error(message.message));
        break;
      case 'tool_call':
        this.emit('tool_call', message);
        break;
      default:
        console.log('[Pi] Unknown message type:', message.type);
    }
  }

  /**
   * Send a request to Pi
   */
  send(request: any): void {
    if (!this.stdin) {
      throw new Error('Not connected to Pi');
    }
    this.stdin.write(JSON.stringify(request) + '\n');
  }
}