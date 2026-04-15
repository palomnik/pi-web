/**
 * Authenticated fetch utility
 * 
 * Wraps the native fetch function to automatically include the auth token
 * in API requests and handle 401 responses (expired/invalid token).
 */
import { useAuthStore } from './authStore';

/**
 * Make an authenticated API request.
 * Automatically includes the Bearer token if auth is enabled.
 * On 401 response, clears auth state to trigger re-login.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { token, authEnabled } = useAuthStore.getState();

  const headers = new Headers(options.headers || {});
  
  // Set content-type for JSON bodies if not already set
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Add auth token if available and auth is enabled
  if (authEnabled && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If we get a 401, the token is invalid — clear auth state to trigger re-login
  if (response.status === 401 && authEnabled) {
    useAuthStore.getState().logout();
  }

  return response;
}