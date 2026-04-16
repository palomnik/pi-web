/**
 * Shared WebSocket manager for the Pi Web frontend.
 * 
 * All components use this single connection instead of creating their own.
 * When auth is enabled, the token is passed as a query parameter on connection.
 */
import { create } from 'zustand';
import { useAuthStore } from './authStore';

type MessageHandler = (data: any) => void;

interface WebSocketState {
  ws: WebSocket | null;
  connected: boolean;
  clientId: string | null;
  handlers: Map<string, Set<MessageHandler>>;
  connect: () => void;
  disconnect: () => void;
  send: (message: any) => void;
  on: (type: string, handler: MessageHandler) => () => void;
  off: (type: string, handler: MessageHandler) => void;
}

export const useWebSocket = create<WebSocketState>()((set, get) => ({
  ws: null,
  connected: false,
  clientId: null,
  handlers: new Map(),

  connect: () => {
    const { ws: existingWs } = get();
    if (existingWs && existingWs.readyState === WebSocket.OPEN) return;

    // SECURITY: Don't connect WebSocket unless authenticated
    const authState = useAuthStore.getState();
    if (authState.authEnabled !== false && !authState.isAuthenticated) {
      // Not authenticated — don't open a WebSocket
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = authState.token;
    const wsUrl = token
      ? `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
      : `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WS] Connected');
      set({ connected: true });
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      set({ connected: false, ws: null });
      
      // Auto-reconnect after 2 seconds (only if still authenticated)
      setTimeout(() => {
        const authState = useAuthStore.getState();
        // Only reconnect if authenticated (or auth is disabled)
        if ((!authState.authEnabled || authState.isAuthenticated) && (!get().ws || get().ws?.readyState !== WebSocket.OPEN)) {
          get().connect();
        }
      }, 2000);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const { handlers } = get();
        
        // Handle auth error from server
        if (data.type === 'auth-error') {
          console.error('[WS] Auth error from server:', data.message);
          useAuthStore.getState().logout();
          return;
        }

        // Handle connected message
        if (data.type === 'connected') {
          set({ clientId: data.clientId });
        }

        // Dispatch to registered handlers
        const typeHandlers = handlers.get(data.type);
        if (typeHandlers) {
          for (const handler of typeHandlers) {
            try {
              handler(data);
            } catch (err) {
              console.error(`[WS] Handler error for ${data.type}:`, err);
            }
          }
        }

        // Also call wildcard handlers
        const wildcardHandlers = handlers.get('*');
        if (wildcardHandlers) {
          for (const handler of wildcardHandlers) {
            try {
              handler(data);
            } catch (err) {
              console.error('[WS] Wildcard handler error:', err);
            }
          }
        }
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };

    set({ ws });
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) {
      ws.close();
      set({ ws: null, connected: false });
    }
  },

  send: (message: any) => {
    const { ws } = get();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send, not connected');
    }
  },

  on: (type: string, handler: MessageHandler) => {
    const { handlers } = get();
    const newHandlers = new Map(handlers);
    
    if (!newHandlers.has(type)) {
      newHandlers.set(type, new Set());
    }
    newHandlers.get(type)!.add(handler);
    
    set({ handlers: newHandlers });

    // Return unsubscribe function
    return () => {
      get().off(type, handler);
    };
  },

  off: (type: string, handler: MessageHandler) => {
    const { handlers } = get();
    const newHandlers = new Map(handlers);
    
    const typeHandlers = newHandlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
      if (typeHandlers.size === 0) {
        newHandlers.delete(type);
      }
    }
    
    set({ handlers: newHandlers });
  },
}));