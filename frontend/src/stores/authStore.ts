/**
 * Auth Store
 * 
 * Manages authentication state for the Pi Web frontend.
 * SECURITY: Access is NEVER granted unless the server confirms valid authentication.
 * No bypass paths exist — even if auth is disabled on the server, the frontend
 * blocks access and shows a security warning.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  authEnabled: boolean | null; // null = unknown (not yet checked)
  credentialsConfigured: boolean | null; // null = unknown
  isLoading: boolean;
  error: string | null;
  errorCode: string | null; // Machine-readable error code from server

  // Actions
  checkAuthStatus: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      isAuthenticated: false,
      authEnabled: null,
      credentialsConfigured: null,
      isLoading: false,
      error: null,
      errorCode: null,

      checkAuthStatus: async () => {
        try {
          const { token } = get();
          const headers: Record<string, string> = {};
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch('/api/auth/status', { headers });
          if (response.ok) {
            const data = await response.json();
            set({ 
              authEnabled: data.enabled,
              credentialsConfigured: data.credentialsConfigured,
              isAuthenticated: data.authenticated,
            });

            // If token is no longer valid, clear it
            if (!data.authenticated) {
              set({ token: null, isAuthenticated: false });
            }

            // SECURITY: Never auto-authenticate when auth is disabled.
            // The AuthGuard handles the authEnabled=false case by showing
            // a security warning and blocking access.
          } else {
            // Server returned an error — assume auth is required, fail closed
            set({ 
              authEnabled: true, 
              credentialsConfigured: false,
              isAuthenticated: false,
              token: null 
            });
          }
        } catch {
          // Network error — can't determine auth status, fail closed
          set({ authEnabled: true, credentialsConfigured: false, isAuthenticated: false, token: null });
        }
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null, errorCode: null });
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          if (response.ok) {
            const data = await response.json();
            set({
              token: data.token,
              isAuthenticated: true,
              authEnabled: true,
              credentialsConfigured: true,
              isLoading: false,
              error: null,
              errorCode: null,
            });
            return true;
          } else {
            const data = await response.json().catch(() => ({ error: 'Login failed', code: 'UNKNOWN' }));
            set({
              isLoading: false,
              error: data.error || 'Invalid username or password',
              errorCode: data.code || null,
            });

            // Update auth state based on server response
            if (data.code === 'AUTH_DISABLED') {
              set({ authEnabled: false });
            } else if (data.code === 'NO_CREDENTIALS') {
              set({ authEnabled: true, credentialsConfigured: false });
            }

            return false;
          }
        } catch {
          set({
            isLoading: false,
            error: 'Cannot connect to server',
            errorCode: null,
          });
          return false;
        }
      },

      logout: async () => {
        const { token } = get();
        try {
          if (token) {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
            });
          }
        } catch {
          // Ignore errors on logout
        }
        set({
          token: null,
          isAuthenticated: false,
          error: null,
          errorCode: null,
        });
      },

      clearError: () => set({ error: null, errorCode: null }),
    }),
    {
      name: 'pi-web-auth',
      partialize: (state) => ({
        token: state.token,
      }),
    }
  )
);