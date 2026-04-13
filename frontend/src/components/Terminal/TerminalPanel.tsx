import { useEffect, useRef, useState } from 'react';
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
  const terminalRefs = useRef<Map<string, { terminal: Terminal; container: HTMLDivElement }>>(
    new Map()
  );
  const wsRef = useRef<WebSocket | null>(null);

  // Create initial terminal session
  useEffect(() => {
    if (terminalSessions.length === 0) {
      createTerminalSession();
    } else if (!activeSession && terminalSessions.length > 0) {
      setActiveSession(terminalSessions[0]);
    }
  }, [terminalSessions, activeSession, createTerminalSession]);

  // Initialize terminal for each session
  useEffect(() => {
    terminalSessions.forEach((sessionId) => {
      if (terminalRefs.current.has(sessionId)) return;

      const containerEl = document.getElementById(`terminal-${sessionId}`);
      if (!containerEl) return;
      const container = containerEl as HTMLDivElement;

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
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(container);
      fitAddon.fit();

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(container);

      // Handle input
      terminal.onData((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'terminal-input',
              sessionId,
              data,
            })
          );
        }
      });

      terminalRefs.current.set(sessionId, { terminal, container });

      // Write welcome message
      terminal.writeln('\x1b[1;35mπ Web Terminal\x1b[0m');
      terminal.writeln('Connected to Pi Web Interface');
      terminal.writeln('');
      terminal.write('$ ');
    });

    return () => {
      terminalRefs.current.forEach(({ terminal }) => {
        terminal.dispose();
      });
      terminalRefs.current.clear();
    };
  }, [terminalSessions]);

  // Connect to WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'terminal-output' && data.sessionId) {
        const ref = terminalRefs.current.get(data.sessionId);
        if (ref) {
          ref.terminal.write(data.data);
        }
      }
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const handleNewTerminal = () => {
    createTerminalSession();
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="h-12 border-b border-pi-border flex items-center justify-between px-4">
        <h1 className="font-semibold text-pi-text">Terminal</h1>
        <div className="flex items-center gap-2">
          {/* Tab bar */}
          <div className="flex items-center gap-1">
            {terminalSessions.map((sessionId, index) => (
              <button
                key={sessionId}
                onClick={() => setActiveSession(sessionId)}
                className={`px-3 py-1 rounded text-sm flex items-center gap-1 ${
                  activeSession === sessionId
                    ? 'bg-pi-accent/20 text-pi-accent'
                    : 'bg-pi-bg-secondary hover:bg-pi-bg-secondary/50'
                }`}
              >
                Terminal {index + 1}
                {terminalSessions.length > 1 && (
                  <X
                    size={14}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTerminalSession(sessionId);
                    }}
                    className="ml-1 hover:text-red-400"
                  />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={handleNewTerminal}
            className="p-1.5 rounded hover:bg-pi-bg-secondary"
            title="New terminal"
          >
            <PlusCircle size={18} />
          </button>
        </div>
      </header>

      {/* Terminal container */}
      <div className="flex-1 bg-[#1a1a2e] p-2 overflow-hidden">
        {terminalSessions.map((sessionId) => (
          <div
            key={sessionId}
            id={`terminal-${sessionId}`}
            className={`h-full ${activeSession === sessionId ? '' : 'hidden'}`}
          />
        ))}
      </div>
    </div>
  );
}