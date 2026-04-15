/**
 * Pi Bridge Service
 * 
 * Bridges the web interface to the Pi coding agent CLI.
 * Handles communication with the Pi agent for chat.
 * 
 * Supports three modes:
 * 1. RPC: Uses Pi's RpcClient for proper programmatic interaction (persistent session)
 * 2. Extension: Uses Pi process that loaded this as an extension (via setChatHandler)
 * 3. Print mode: Spawns `pi --print --mode json` for each message (works standalone)
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';

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

export type ChatHandler = (content: string, sessionId: string | null, onChunk: (chunk: StreamChunk) => void) => Promise<void>;

type ConnectionMode = 'none' | 'rpc' | 'extension' | 'print';

export class PiBridge extends EventEmitter {
  private cwd: string;
  private env: NodeJS.ProcessEnv;
  private rpcClient: any = null;
  private connectionMode: ConnectionMode = 'none';
  private externalChatHandler: ChatHandler | null = null;

  constructor(cwd: string, env: NodeJS.ProcessEnv = process.env) {
    super();
    this.cwd = cwd;
    this.env = env;
  }

  /**
   * Set up an external chat handler (for extension mode)
   * When running as a Pi extension, use this to handle chat via Pi's API
   */
  setChatHandler(handler: ChatHandler): void {
    this.externalChatHandler = handler;
    this.connectionMode = 'extension';
    this.emit('connect');
  }

  /**
   * Check if connected to Pi
   */
  isConnected(): boolean {
    return this.connectionMode !== 'none';
  }

  /**
   * Connect to Pi via RpcClient (preferred) or fall back to print mode
   */
  async connect(): Promise<void> {
    if (this.connectionMode === 'extension') {
      return; // Already connected via external handler
    }

    // Try RpcClient first
    try {
      let RpcClient: any = null;
      try {
        const modesPath = require.resolve(
          '@mariozechner/pi-coding-agent/dist/modes/index.js',
          { paths: [this.cwd, process.cwd()] }
        );
        const modes = await import(modesPath);
        RpcClient = modes.RpcClient;
      } catch {
        // RpcClient not available
      }
      
      if (RpcClient) {
        this.rpcClient = new RpcClient({
          cwd: this.cwd,
          env: this.env as Record<string, string>,
        });

        this.rpcClient.onEvent((event: any) => {
          this.handleRpcEvent(event);
        });

        await this.rpcClient.start();
        this.connectionMode = 'rpc';
        this.emit('connect');
        console.log('[PiBridge] Connected to Pi via RPC');
        return;
      }
    } catch (err) {
      console.error('[PiBridge] Failed to connect via RpcClient:', err);
    }

    // Try to verify `pi` command exists (for print mode)
    try {
      const { execFileSync } = await import('child_process');
      execFileSync('pi', ['--version'], { timeout: 5000, stdio: 'pipe' });
    } catch (err) {
      // Can't find pi command
      console.log('[PiBridge] Pi CLI not found. Chat will be limited.');
      this.connectionMode = 'none';
      throw new Error('Pi CLI not found');
    }

    // Use print mode - spawn a new pi process per chat message
    this.connectionMode = 'print';
    this.emit('connect');
    console.log('[PiBridge] Using print mode for chat');
  }

  /**
   * Disconnect from Pi
   */
  async disconnect(): Promise<void> {
    if (this.rpcClient) {
      try {
        await this.rpcClient.stop();
      } catch (err) {
        console.error('[PiBridge] Error stopping RPC client:', err);
      }
      this.rpcClient = null;
    }
    
    this.connectionMode = 'none';
    this.externalChatHandler = null;
    this.emit('disconnect');
  }

  /**
   * Send a chat message and stream the response
   */
  async streamChat(
    content: string | PiContentPart[],
    sessionId: string | null,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const textContent = typeof content === 'string' ? content : content
      .filter(p => p.type === 'text')
      .map(p => p.text || '')
      .join('\n');

    // Extension mode - delegate to external handler
    if (this.connectionMode === 'extension' && this.externalChatHandler) {
      return this.externalChatHandler(textContent, sessionId, onChunk);
    }

    // Not connected
    if (this.connectionMode === 'none') {
      onChunk({ 
        type: 'error', 
        content: 'Pi is not connected. Start Pi CLI first or run this as a Pi extension.' 
      });
      onChunk({ type: 'done' });
      return;
    }

    // RPC mode - use persistent RpcClient
    if (this.connectionMode === 'rpc' && this.rpcClient) {
      return this.streamChatViaRpc(textContent, onChunk);
    }

    // Print mode - spawn a new Pi process for this message
    if (this.connectionMode === 'print') {
      return this.streamChatViaPrint(textContent, onChunk);
    }

    onChunk({ type: 'error', content: 'Unknown connection mode' });
    onChunk({ type: 'done' });
  }

  /**
   * Stream chat via RpcClient (persistent session)
   */
  private async streamChatViaRpc(
    textContent: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      const streamHandler = (chunk: any) => onChunk(chunk);
      const doneHandler = () => {
        onChunk({ type: 'done' });
        cleanup();
      };
      const errorHandler = (err: Error) => {
        onChunk({ type: 'error', content: err.message });
        onChunk({ type: 'done' });
        cleanup();
      };

      const cleanup = () => {
        this.off('stream', streamHandler);
        this.off('done', doneHandler);
        this.off('error', errorHandler);
      };

      this.on('stream', streamHandler);
      this.on('done', doneHandler);
      this.on('error', errorHandler);

      // Set a timeout
      const timeoutId = setTimeout(() => {
        onChunk({ type: 'error', content: 'Response timed out' });
        onChunk({ type: 'done' });
        cleanup();
      }, 120000);

      await this.rpcClient.prompt(textContent);
      await this.rpcClient.waitForIdle(120000);
      
      clearTimeout(timeoutId);
      onChunk({ type: 'done' });
      cleanup();
    } catch (error) {
      console.error('[PiBridge] RPC chat error:', error);
      onChunk({ 
        type: 'error', 
        content: error instanceof Error ? error.message : 'Chat failed' 
      });
      onChunk({ type: 'done' });
    }
  }

  /**
   * Stream chat via print mode - spawn `pi --print` with prompt on stdin
   * Each message creates a new Pi process that processes and exits.
   */
  private async streamChatViaPrint(
    textContent: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    return new Promise((resolve) => {
      try {
        // Use --print mode with --mode json for structured output
        // The prompt is sent via stdin (not as CLI arg, which causes Pi to hang)
        const args = ['--print', '--mode', 'json'];
        
        const piProcess = spawn('pi', args, {
          cwd: this.cwd,
          env: { 
            ...this.env as Record<string, string>,
            FORCE_COLOR: '0',
            NO_COLOR: '1',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const finish = (exitCode: number | null) => {
          if (settled) return;
          settled = true;
          
          if (stdout.trim()) {
            this.parseJsonOutput(stdout, onChunk);
          }
          
          if (stderr.trim() && exitCode !== 0) {
            onChunk({ 
              type: 'error', 
              content: `Pi process exited with code ${exitCode}: ${stderr.trim().substring(0, 200)}` 
            });
          }
          
          onChunk({ type: 'done' });
          resolve();
        };

        piProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
          // Try to parse and stream JSON lines as they arrive
          const lines = stdout.split('\n');
          stdout = lines.pop() || ''; // Keep incomplete last line
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const msg = JSON.parse(line);
              this.handleJsonMessage(msg, onChunk);
            } catch {
              // Not JSON yet, buffer it
              stdout = line + '\n' + stdout;
            }
          }
        });

        piProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        piProcess.on('close', (code) => {
          // Process remaining stdout
          if (stdout.trim()) {
            this.parseJsonOutput(stdout, onChunk);
            stdout = '';
          }
          finish(code);
        });

        piProcess.on('error', (err) => {
          console.error('[PiBridge] Print mode process error:', err);
          if (!settled) {
            onChunk({ type: 'error', content: `Failed to run Pi: ${err.message}` });
            onChunk({ type: 'done' });
            settled = true;
            resolve();
          }
        });

        // Send the prompt via stdin and close it
        // This is important: Pi --print reads from stdin, not CLI args
        piProcess.stdin?.write(textContent + '\n');
        piProcess.stdin?.end();

        // Timeout after 2 minutes
        setTimeout(() => {
          if (!settled) {
            piProcess.kill('SIGTERM');
            setTimeout(() => piProcess.kill('SIGKILL'), 5000);
            onChunk({ type: 'error', content: 'Response timed out' });
            onChunk({ type: 'done' });
            settled = true;
            resolve();
          }
        }, 120000);

      } catch (err) {
        console.error('[PiBridge] Failed to spawn Pi in print mode:', err);
        onChunk({ type: 'error', content: err instanceof Error ? err.message : 'Failed to start Pi' });
        onChunk({ type: 'done' });
        resolve();
      }
    });
  }

  /**
   * Parse JSON output from Pi print mode
   */
  private parseJsonOutput(output: string, onChunk: (chunk: StreamChunk) => void): void {
    const lines = output.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        this.handleJsonMessage(msg, onChunk);
      } catch {
        // Not JSON, treat as plain text
        if (line.trim()) {
          onChunk({ type: 'text', content: line });
        }
      }
    }
  }

  /**
   * Handle a JSON message from Pi
   */
  private handleJsonMessage(message: any, onChunk: (chunk: StreamChunk) => void): void {
    switch (message.type) {
      case 'message_update':
        // Streaming text/thinking deltas
        if (message.assistantMessageEvent) {
          const event = message.assistantMessageEvent;
          if (event.type === 'text_delta' && event.delta) {
            onChunk({ type: 'text', content: event.delta });
          } else if (event.type === 'thinking_delta' && event.delta) {
            onChunk({ type: 'thinking', content: event.delta });
          }
        }
        break;

      case 'tool_call':
        onChunk({ type: 'tool_use', name: message.name, input: message.input });
        break;

      case 'tool_result':
        onChunk({ type: 'tool_result', name: message.name, output: message.output || message.content });
        break;

      // Skip these - they contain structured data, not streaming text
      case 'session':
      case 'agent_start':
      case 'agent_end':
      case 'turn_start':
      case 'turn_end':
      case 'message_start':
      case 'message_end':
        // These are lifecycle events, not content
        break;

      case 'error':
        onChunk({ type: 'error', content: message.message || message.error || 'Pi error' });
        break;

      default:
        // Unknown message type - ignore
        break;
    }
  }

  /**
   * Handle an RPC event from Pi
   */
  private handleRpcEvent(event: any): void {
    switch (event.type) {
      case 'assistant_message':
        if (event.delta) {
          this.emit('stream', { type: 'text', content: event.delta });
        } else if (event.content) {
          this.emit('stream', { type: 'text', content: event.content });
        }
        break;
      
      case 'thinking_delta':
        this.emit('stream', { type: 'thinking', content: event.delta });
        break;

      case 'tool_use':
        this.emit('stream', { type: 'tool_use', name: event.name, input: event.input });
        break;

      case 'tool_result':
        this.emit('stream', { type: 'tool_result', name: event.name, output: event.output || event.content });
        break;

      case 'agent_end':
        this.emit('done');
        break;

      case 'error':
        this.emit('error', new Error(event.message || event.error || 'Agent error'));
        break;

      default:
        this.emit('message', event);
    }
  }
}