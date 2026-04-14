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
   * Start Pi in JSON mode (for reliable parsing)
   */
  async connect(): Promise<void> {
    if (this.piProcess) {
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('[PiBridge] Spawning pi --mode json --print...');
        
        // Spawn Pi in JSON mode with print flag for structured streaming output
        this.piProcess = spawn('pi', ['--mode', 'json', '--print'], {
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
          console.log(`[PiBridge] Process exited with code ${code}`);
          this.connected = false;
          this.piProcess = null;
          this.stdin = null;
          this.emit('disconnect');
        });

        this.piProcess.on('error', (err) => {
          console.error('[PiBridge] Process error:', err);
          this.connected = false;
          this.emit('error', err);
          reject(err);
        });

        // Wait a bit for process to start
        setTimeout(() => {
          if (this.piProcess && !this.piProcess.killed) {
            this.connected = true;
            this.emit('connect');
            console.log('[PiBridge] Connected to Pi');
            resolve();
          } else {
            reject(new Error('Failed to start Pi process'));
          }
        }, 1000);

      } catch (err) {
        console.error('[PiBridge] Failed to spawn Pi:', err);
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
    // If not connected, try to connect
    if (!this.connected) {
      try {
        await this.connect();
      } catch (err) {
        onChunk({ 
          type: 'error', 
          content: 'Could not connect to Pi. Make sure Pi CLI is installed and available.' 
        });
        onChunk({ type: 'done' });
        return;
      }
    }

    // Format message for Pi - just send text through stdin
    const textContent = typeof content === 'string' ? content : content
      .filter(p => p.type === 'text')
      .map(p => p.text || '')
      .join('\n');

    // Send text to Pi's stdin
    this.send(textContent);

    // Wait for response
    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        this.off('stream', streamHandler);
        this.off('done', doneHandler);
        this.off('error', errorHandler);
        clearTimeout(timeoutId);
      };

      const streamHandler = (chunk: any) => {
        onChunk(chunk);
      };

      const doneHandler = () => {
        onChunk({ type: 'done' });
        cleanup();
        resolve();
      };

      const errorHandler = (err: Error) => {
        onChunk({ type: 'error', content: err.message });
        onChunk({ type: 'done' });
        cleanup();
        resolve();
      };

      this.on('stream', streamHandler);
      this.on('done', doneHandler);
      this.on('error', errorHandler);

      // Timeout after 120 seconds
      timeoutId = setTimeout(() => {
        onChunk({ type: 'error', content: 'Response timed out' });
        onChunk({ type: 'done' });
        cleanup();
        resolve();
      }, 120000);
    });
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
        
        // Skip internal messages we don't handle
        if (message.type === 'extension_ui_request') {
          continue;
        }
        
        this.handleMessage(message);
      } catch (err) {
        // Not JSON, might be a text response
        if (line.trim()) {
          this.emit('stream', { type: 'text', content: line });
        }
      }
    }
  }

  /**
   * Handle a parsed message from Pi (JSON mode)
   */
  private handleMessage(message: any): void {
    switch (message.type) {
      case 'response':
        this.emit('response', message);
        break;
      
      case 'turn_end':
        // Turn is complete
        this.emit('done');
        break;
      
      case 'message_update':
        // Handle streaming text from assistant
        if (message.assistantMessageEvent) {
          const event = message.assistantMessageEvent;
          if (event.type === 'text_delta' && event.delta) {
            this.emit('stream', { type: 'text', content: event.delta });
          } else if (event.type === 'thinking_delta' && event.delta) {
            this.emit('stream', { type: 'thinking', content: event.delta });
          }
        }
        break;
      
      case 'message_end':
        // Message complete
        if (message.message?.role === 'assistant') {
          // Could emit the full message here if needed
        }
        break;
      
      case 'error':
        this.emit('error', new Error(message.message || message.error));
        break;
      
      case 'tool_call':
        this.emit('tool_call', message);
        break;
      
      case 'tool_result':
        this.emit('tool_result', message);
        break;
      
      default:
        // For unknown types, just emit as-is
        this.emit('message', message);
    }
  }

  /**
   * Send text to Pi's stdin
   */
  send(text: string): void {
    if (!this.stdin) {
      throw new Error('Not connected to Pi');
    }
    this.stdin.write(text + '\n');
  }
}