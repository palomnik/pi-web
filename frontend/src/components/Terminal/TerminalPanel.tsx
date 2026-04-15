import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useAppStore } from '../../stores/appStore';
import { useWebSocket } from '../../stores/websocketStore';
import { X, PlusCircle } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

export default function TerminalPanel() {
  const { terminalSessions, createTerminalSession, removeTerminalSession } =
    useAppStore();
  const { send, connected, on, off } = useWebSocket();
  const [activeSession, setActiveSession] = useState<string | null>(null);
  // Map frontend session ID -> server session ID
  const [serverSessions, setServerSessions] = useState<Map<string, string>>(
    new Map()
  );
  const terminalRefs = useRef<Map<string, { terminal: Terminal; fitAddon: FitAddon }>>(
    new Map()
  );
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const cwdRef = useRef<string>('/');
  const pendingCreationRef = useRef<Set<string>>(new Set()); // sessions waiting for server confirmation

  // Get the current working directory from settings or default
  const cwd = useAppStore((state) => state.currentPath) || '/';
  cwdRef.current = cwd;

  // Listen for WebSocket terminal messages
  useEffect(() => {
    const handleTerminalCreated = (data: any) => {
      console.log('[Terminal] Session created on server:', data.sessionId);
      // Find a pending local session and map it
      const pending = pendingCreationRef.current;
      if (pending.size > 0) {
        const localId = pending.values().next().value;
        if (localId) {
          pending.delete(localId);
          setServerSessions((prev) => {
            const next = new Map(prev);
            next.set(localId, data.sessionId);
            return next;
          });
        }
      }
    };

    const handleTerminalOutput = (data: any) => {
      if (!data.sessionId) return;
      
      // Find the local session for this server session
      let localSessionId: string | null = null;
      for (const [localId, serverId] of serverSessions.entries()) {
        if (serverId === data.sessionId) {
          localSessionId = localId;
          break;
        }
      }
      
      const ref = terminalRefs.current.get(localSessionId || data.sessionId);
      if (ref) {
        ref.terminal.write(data.data);
      }
    };

    const handleTerminalExit = (data: any) => {
      console.log('[Terminal] Session exited:', data.sessionId, 'code:', data.exitCode);
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
    };

    const handleTerminalKilled = (data: any) => {
      console.log('[Terminal] Session killed:', data.sessionId);
    };

    const unsub1 = on('terminal-created', handleTerminalCreated);
    const unsub2 = on('terminal-output', handleTerminalOutput);
    const unsub3 = on('terminal-exit', handleTerminalExit);
    const unsub4 = on('terminal-killed', handleTerminalKilled);

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [on, off, serverSessions]);

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
    const newSessions = terminalSessions.filter(
      (sessionId) => !terminalRefs.current.has(sessionId)
    );

    for (const sessionId of newSessions) {
      const containerEl = document.getElementById(`terminal-${sessionId}`);
      if (!containerEl) continue;

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
      
      containerRefs.current.set(sessionId, containerEl as HTMLDivElement);
      terminalRefs.current.set(sessionId, { terminal, fitAddon });

      // Fit to container
      setTimeout(() => fitAddon.fit(), 0);

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && connected) {
          const serverSessionId = serverSessions.get(sessionId) || sessionId;
          send({
            type: 'terminal-resize',
            sessionId: serverSessionId,
            cols: dims.cols,
            rows: dims.rows,
          });
        }
      });
      resizeObserver.observe(containerEl);

      // Write connecting message
      terminal.writeln('\x1b[1;35m╭─────────────────────────────╮\x1b[0m');
      terminal.writeln('\x1b[1;35m│\x1b[0m   \x1b[1;36mπ Web Terminal\x1b[0m         \x1b[1;35m│\x1b[0m');
      terminal.writeln('\x1b[1;35m╰─────────────────────────────╯\x1b[0m');
      terminal.writeln('');

      // Send terminal-create message to server
      if (connected) {
        const dims = fitAddon.proposeDimensions();
        pendingCreationRef.current.add(sessionId);
        send({
          type: 'terminal-create',
          sessionId: sessionId,
          cols: dims?.cols || 80,
          rows: dims?.rows || 24,
          cwd: cwdRef.current,
        });
      } else {
        terminal.writeln('\x1b[33mWaiting for WebSocket connection...\x1b[0m');
        // Mark as pending - will be sent when connected
        pendingCreationRef.current.add(sessionId);
      }

      // Handle terminal input - send to PTY
      terminal.onData((data) => {
        if (connected) {
          const serverSessionId = serverSessions.get(sessionId) || sessionId;
          send({
            type: 'terminal-input',
            sessionId: serverSessionId,
            data,
          });
        }
      });
    }

    return () => {
      // Cleanup terminals that were removed
      const currentIds = new Set(terminalSessions);
      for (const [sessionId, { terminal }] of terminalRefs.current) {
        if (!currentIds.has(sessionId)) {
          terminal.dispose();
          terminalRefs.current.delete(sessionId);
          containerRefs.current.delete(sessionId);
        }
      }
    };
  }, [terminalSessions, cwd, serverSessions, connected, send]);

  // Send pending terminal-create when WebSocket connects
  useEffect(() => {
    if (connected && pendingCreationRef.current.size > 0) {
      // Small delay to ensure connection is stable
      const timer = setTimeout(() => {
        for (const sessionId of pendingCreationRef.current) {
          const ref = terminalRefs.current.get(sessionId);
          if (ref) {
            const dims = ref.fitAddon.proposeDimensions();
            send({
              type: 'terminal-create',
              sessionId: sessionId,
              cols: dims?.cols || 80,
              rows: dims?.rows || 24,
              cwd: cwdRef.current,
            });
          }
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [connected, send]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [sessionId, { terminal }] of terminalRefs.current) {
        if (connected) {
          const serverSessionId = serverSessions.get(sessionId) || sessionId;
          send({
            type: 'terminal-kill',
            sessionId: serverSessionId,
          });
        }
        terminal.dispose();
      }
      terminalRefs.current.clear();
      containerRefs.current.clear();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewTerminal = useCallback(() => {
    createTerminalSession();
    setTimeout(() => {
      const sessions = useAppStore.getState().terminalSessions;
      if (sessions.length > 0) {
        setActiveSession(sessions[sessions.length - 1]);
      }
    }, 100);
  }, [createTerminalSession]);

  const handleCloseTerminal = useCallback(
    (sessionId: string) => {
      if (connected) {
        const serverSessionId = serverSessions.get(sessionId) || sessionId;
        send({
          type: 'terminal-kill',
          sessionId: serverSessionId,
        });
      }
      removeTerminalSession(sessionId);
      setServerSessions((prev) => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      pendingCreationRef.current.delete(sessionId);
      
      // Clean up xterm
      const ref = terminalRefs.current.get(sessionId);
      if (ref) {
        ref.terminal.dispose();
        terminalRefs.current.delete(sessionId);
        containerRefs.current.delete(sessionId);
      }
    },
    [removeTerminalSession, serverSessions, connected, send]
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