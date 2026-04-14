import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useAppStore } from '../../stores/appStore';
import { X, PlusCircle } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPanel() {
  const { terminalSessions, createTerminalSession, removeTerminalSession } =
    useAppStore();
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [serverSessions, setServerSessions] = useState<Map<string, string>>(
    new Map()
  ); // local session -> server session mapping
  const terminalRefs = useRef<Map<string, { terminal: Terminal; fitAddon: FitAddon }>>(
    new Map()
  );
  const wsRef = useRef<WebSocket | null>(null);
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Get the current working directory from settings or default
  const cwd = useAppStore((state) => state.currentPath) || '/';

  // Connect to WebSocket on mount
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('[Terminal] WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connected') {
        console.log('[Terminal] Got connection ID:', data.clientId);
      } else if (data.type === 'terminal-created') {
        console.log('[Terminal] Session created:', data.sessionId);
        setServerSessions((prev) => {
          const next = new Map(prev);
          // Find the local session that doesn't have a server session yet
          for (const [localId] of next) {
            if (!next.get(localId)) {
              next.set(localId, data.sessionId);
              break;
            }
          }
          return next;
        });
      } else if (data.type === 'terminal-output' && data.sessionId) {
        // Find the local session for this server session
        let localSessionId: string | null = null;
        for (const [localId, serverId] of serverSessions.entries()) {
          if (serverId === data.sessionId) {
            localSessionId = localId;
            break;
          }
        }
        // Also check if sessionId directly matches (new style)
        if (!localSessionId) {
          localSessionId = data.sessionId;
        }
        
        const ref = terminalRefs.current.get(localSessionId || data.sessionId);
        if (ref) {
          ref.terminal.write(data.data);
        }
      } else if (data.type === 'terminal-exit') {
        console.log('[Terminal] Session exited:', data.sessionId, 'code:', data.exitCode);
        // Show exit message in terminal
        for (const [localId, serverId] of serverSessions.entries()) {
          if (serverId === data.sessionId) {
            const ref = terminalRefs.current.get(localId);
            if (ref) {
              ref.terminal.writeln('');
              ref.terminal.writeln(`\x1b[33mProcess exited with code ${data.exitCode}\x1b[0m`);
            }
            break;
          }
        }
      } else if (data.type === 'terminal-killed') {
        console.log('[Terminal] Session killed:', data.sessionId);
      }
    };

    ws.onerror = (error) => {
      console.error('[Terminal] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[Terminal] WebSocket disconnected');
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  // Create initial terminal session
  useEffect(() => {
    if (terminalSessions.length === 0) {
      createTerminalSession();
    } else if (!activeSession && terminalSessions.length > 0) {
      setActiveSession(terminalSessions[0]);
    }
  }, [terminalSessions, activeSession, createTerminalSession]);

  // Initialize xterm.js for each session
  useEffect(() => {
    terminalSessions.forEach((sessionId) => {
      if (terminalRefs.current.has(sessionId)) return;

      const containerEl = document.getElementById(`terminal-${sessionId}`);
      if (!containerEl) return;

      const terminal = new Terminal({
        theme: {
          background: '#1a1a2e',
          foreground: '#e0e0e0',
          cursor: '#6c63ff',
          cursorAccent: '#1a1a2e',
          selectionBackground: 'rgba(108, 99, 255, 0.3)',
          black: '#000000',
          red: '#ff5555',
          green: '#50fa7b',
          yellow: '#f1fa8c',
          blue: '#bd93f9',
          magenta: '#ff79c6',
          cyan: '#8be9fd',
          white: '#f8f8f2',
          brightBlack: '#6272a4',
          brightRed: '#ff6e6e',
          brightGreen: '#69ff94',
          brightYellow: '#ffffa5',
          brightBlue: '#d6acff',
          brightMagenta: '#ff92df',
          brightCyan: '#a4ffff',
          brightWhite: '#ffffff',
        },
        fontFamily: 'SF Mono, Fira Code, Monaco, monospace',
        fontSize: 14,
        lineHeight: 1.2,
        cols: 80,
        rows: 24,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(containerEl as HTMLDivElement);
      
      // Store the container reference
      containerRefs.current.set(sessionId, containerEl as HTMLDivElement);
      terminalRefs.current.set(sessionId, { terminal, fitAddon });

      // Fit to container
      setTimeout(() => fitAddon.fit(), 0);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && wsRef.current?.readyState === WebSocket.OPEN) {
          const serverSessionId = serverSessions.get(sessionId) || sessionId;
          wsRef.current.send(
            JSON.stringify({
              type: 'terminal-resize',
              sessionId: serverSessionId,
              cols: dims.cols,
              rows: dims.rows,
            })
          );
        }
      });
      resizeObserver.observe(containerEl);

      // Write connecting message
      terminal.writeln('\x1b[1;35m╭─────────────────────────────╮\x1b[0m');
      terminal.writeln('\x1b[1;35m│\x1b[0m   \x1b[1;36mπ Web Terminal\x1b[0m         \x1b[1;35m│\x1b[0m');
      terminal.writeln('\x1b[1;35m╰─────────────────────────────╯\x1b[0m');
      terminal.writeln('');

      // Send terminal-create message to server
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions();
        wsRef.current.send(
          JSON.stringify({
            type: 'terminal-create',
            sessionId: sessionId,
            cols: dims?.cols || 80,
            rows: dims?.rows || 24,
            cwd: cwd,
          })
        );
      } else {
        terminal.writeln('\x1b[33mWaiting for WebSocket connection...\x1b[0m');
      }

      // Handle terminal input - send to PTY
      terminal.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const serverSessionId = serverSessions.get(sessionId) || sessionId;
          wsRef.current.send(
            JSON.stringify({
              type: 'terminal-input',
              sessionId: serverSessionId,
              data,
            })
          );
        }
      });
    });

    return () => {
      // Cleanup on unmount
      for (const [sessionId, { terminal }] of terminalRefs.current) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const serverSessionId = serverSessions.get(sessionId) || sessionId;
          wsRef.current.send(
            JSON.stringify({
              type: 'terminal-kill',
              sessionId: serverSessionId,
            })
          );
        }
        terminal.dispose();
      }
      terminalRefs.current.clear();
      containerRefs.current.clear();
    };
  }, [terminalSessions, cwd, serverSessions]);

  const handleNewTerminal = useCallback(() => {
    createTerminalSession();
    // Set active session to the newest tab
    setTimeout(() => {
      const sessions = useAppStore.getState().terminalSessions;
      if (sessions.length > 0) {
        setActiveSession(sessions[sessions.length - 1]);
      }
    }, 100);
  }, [createTerminalSession]);

  const handleCloseTerminal = useCallback(
    (sessionId: string) => {
      // Send kill message and remove
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const serverSessionId = serverSessions.get(sessionId) || sessionId;
        wsRef.current.send(
          JSON.stringify({
            type: 'terminal-kill',
            sessionId: serverSessionId,
          })
        );
      }
      removeTerminalSession(sessionId);
      setServerSessions((prev) => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
    },
    [removeTerminalSession, serverSessions]
  );

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="h-12 border-b border-pi-border flex items-center justify-between px-4 bg-pi-bg-secondary">
        <h1 className="font-semibold text-pi-text">Terminal</h1>
        <div className="flex items-center gap-2">
          {/* Tab bar */}
          <div className="flex items-center gap-1">
            {terminalSessions.map((sessionId, index) => (
              <button
                key={sessionId}
                onClick={() => setActiveSession(sessionId)}
                className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors ${
                  activeSession === sessionId
                    ? 'bg-pi-accent/20 text-pi-accent border border-pi-accent/30'
                    : 'bg-pi-bg hover:bg-pi-bg-secondary/70 border border-transparent'
                }`}
              >
                <span className="opacity-60">Tab</span> {index + 1}
                {terminalSessions.length > 1 && (
                  <X
                    size={14}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseTerminal(sessionId);
                    }}
                    className="ml-1 hover:text-red-400 cursor-pointer"
                  />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={handleNewTerminal}
            className="p-1.5 rounded hover:bg-pi-accent/20 text-pi-text-secondary hover:text-pi-accent transition-colors"
            title="New terminal tab"
          >
            <PlusCircle size={18} />
          </button>
        </div>
      </header>

      {/* Terminal containers */}
      <div className="flex-1 bg-[#1a1a2e] overflow-hidden">
        {terminalSessions.map((sessionId) => (
          <div
            key={sessionId}
            id={`terminal-${sessionId}`}
            className={`h-full w-full p-1 ${
              activeSession === sessionId ? 'block' : 'hidden'
            }`}
            style={{ minHeight: '200px' }}
          />
        ))}
      </div>
    </div>
  );
}