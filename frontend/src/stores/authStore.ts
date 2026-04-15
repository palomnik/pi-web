/**
 * Auth Store
 * 
 * Manages authentication state for the Pi Web frontend.
 * Stores the auth token, tracks auth status, and handles login/logout.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  authEnabled: boolean | null; // null = unknown (not yet checked)
  isLoading: boolean;
  error: string | null;

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
      isLoading: false,
      error: null,

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
              isAuthenticated: data.authenticated,
            });

            // If auth is not enabled, mark as authenticated
            if (!data.enabled) {
              set({ isAuthenticated: true });
            }

            // If token is no longer valid, clear it
            if (data.enabled && !data.authenticated) {
              set({ token: null, isAuthenticated: false });
            }
          } else {
            // If the server is unreachable or returns an error
            // assume auth is required if we previously had a token
            set({ authEnabled: true, isAuthenticated: false });
          }
        } catch {
          // Network error - can't determine auth status
          set({ authEnabled: true, isAuthenticated: false });
        }
      },

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
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
              isLoading: false,
              error: null,
            });
            return true;
          } else {
            const data = await response.json().catch(() => ({ error: 'Login failed' }));
            set({
              isLoading: false,
              error: data.error || 'Invalid username or password',
            });
            return false;
          }
        } catch {
          set({
            isLoading: false,
            error: 'Cannot connect to server',
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
        });
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'pi-web-auth',
      partialize: (state) => ({
        token: state.token,
      }),
    }
  )
);