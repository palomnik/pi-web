/**
 * Authenticated fetch utility
 * 
 * Wraps the native fetch function to automatically include the auth token
 * in API requests and handle authentication failures.
 * 
 * SECURITY: On 401 (invalid token), 403 (auth disabled), or 503 (no credentials),
 * clears auth state to force re-authentication. Access is never silently granted.
 */
import { useAuthStore } from './authStore';

/**
 * Make an authenticated API request.
 * Automatically includes the Bearer token.
 * On auth failure, clears auth state to enforce re-login.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { token } = useAuthStore.getState();

  const headers = new Headers(options.headers || {});
  
  // Set content-type for JSON bodies if not already set
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add auth token if available
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // On any auth failure, clear state to trigger re-auth
  // 401 = invalid/expired token
  // 403 = auth disabled on server
  // 503 = credentials not configured
  if (response.status === 401 || response.status === 403 || (response.status === 503)) {
    const authState = useAuthStore.getState();
    // Don't fully logout on 403/503 — just clear token
    // (the AuthGuard will show the appropriate warning)
    if (response.status === 401) {
      authState.logout();
    } else {
      // For 403/503, update status to reflect server state
      useAuthStore.setState({ 
        token: null, 
        isAuthenticated: false 
      });
    }
  }

  return response;
}