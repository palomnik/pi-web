import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface Session {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  path: string;
  children?: FileNode[];
}

interface AppState {
  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  createSession: () => string;
  setCurrentSession: (id: string) => void;
  addMessage: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => void;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void;
  deleteSession: (id: string) => void;

  // Files
  currentPath: string;
  setCurrentPath: (path: string) => void;
  expandedPaths: Set<string>;
  togglePathExpanded: (path: string) => void;

  // Panels
  showTerminal: boolean;
  showFiles: boolean;
  showGitHub: boolean;
  toggleTerminal: () => void;
  toggleFiles: () => void;
  toggleGitHub: () => void;

  // Connection
  connected: boolean;
  setConnected: (connected: boolean) => void;
  
  // Terminal
  terminalSessions: string[];
  createTerminalSession: () => void;
  removeTerminalSession: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set, get) => ({
        // Theme
        theme: 'dark',
        setTheme: (theme) => {
          set({ theme });
          document.documentElement.classList.toggle('light', theme === 'light');
        },

        // Sessions
        sessions: [],
        currentSessionId: null,
        createSession: () => {
          const id = `session-${Date.now()}`;
          const session: Session = {
            id,
            name: `Session ${get().sessions.length + 1}`,
            messages: [],
            createdAt: Date.now(),
          };
          set((state) => ({
            sessions: [...state.sessions, session],
            currentSessionId: id,
          }));
          return id;
        },
        setCurrentSession: (id) => set({ currentSessionId: id }),
        addMessage: (sessionId, message) => {
          const newMessage: Message = {
            ...message,
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            timestamp: Date.now(),
          };
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId
                ? { ...s, messages: [...s.messages, newMessage] }
                : s
            ),
          }));
        },
        updateMessage: (sessionId, messageId, updates) => {
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: s.messages.map((m) =>
                      m.id === messageId ? { ...m, ...updates } : m
                    ),
                  }
                : s
            ),
          }));
        },
        deleteSession: (id) =>
          set((state) => ({
            sessions: state.sessions.filter((s) => s.id !== id),
            currentSessionId:
              state.currentSessionId === id
                ? state.sessions[0]?.id || null
                : state.currentSessionId,
          })),

        // Files
        currentPath: '/',
        setCurrentPath: (path) => set({ currentPath: path }),
        expandedPaths: new Set(['/']),
        togglePathExpanded: (path) =>
          set((state) => {
            const expanded = new Set(state.expandedPaths);
            if (expanded.has(path)) {
              expanded.delete(path);
            } else {
              expanded.add(path);
            }
            return { expandedPaths: expanded };
          }),

        // Panels
        showTerminal: true,
        showFiles: true,
        showGitHub: false,
        toggleTerminal: () => set((state) => ({ showTerminal: !state.showTerminal })),
        toggleFiles: () => set((state) => ({ showFiles: !state.showFiles })),
        toggleGitHub: () => set((state) => ({ showGitHub: !state.showGitHub })),

        // Connection
        connected: false,
        setConnected: (connected) => set({ connected }),

        // Terminal
        terminalSessions: [],
        createTerminalSession: () =>
          set((state) => ({
            terminalSessions: [...state.terminalSessions, `term-${Date.now()}`],
          })),
        removeTerminalSession: (id) =>
          set((state) => ({
            terminalSessions: state.terminalSessions.filter((t) => t !== id),
          })),
      }),
      {
        name: 'pi-web-storage',
        partialize: (state) => ({
          theme: state.theme,
          sessions: state.sessions,
          showTerminal: state.showTerminal,
          showFiles: state.showFiles,
          showGitHub: state.showGitHub,
        }),
      }
    )
  )
);