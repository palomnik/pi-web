import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import LoginPage from '../Auth/LoginPage';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * AuthGuard — the security gate for the entire application.
 * 
 * SECURITY MODEL:
 * - If we haven't checked auth status yet → show loading spinner
 * - If auth is enabled AND user is authenticated → show the app
 * - If auth is enabled AND user is NOT authenticated → show login page
 * - If auth is enabled but credentials aren't configured → show setup instructions
 * - If auth is NOT enabled → show security warning, DENY access entirely
 * 
 * There is NO bypass. Access is only granted through valid authentication.
 */
export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, authEnabled, credentialsConfigured, checkAuthStatus } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if auth is enabled on the server
    checkAuthStatus().finally(() => setChecking(false));
  }, [checkAuthStatus]);

  // While checking auth status, show a loading screen
  if (checking) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-pi-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-pi-accent flex items-center justify-center">
            <span className="text-white font-bold text-2xl">π</span>
          </div>
          <div className="flex items-center gap-2 text-pi-text-secondary">
            <span className="w-4 h-4 border-2 border-pi-accent/30 border-t-pi-accent rounded-full animate-spin" />
            Verifying authentication...
          </div>
        </div>
      </div>
    );
  }

  // CASE 1: Auth is properly enabled and user is authenticated → GRANT ACCESS
  if (authEnabled && credentialsConfigured !== false && isAuthenticated) {
    return <>{children}</>;
  }

  // CASE 2: Auth is enabled but credentials aren't configured → show setup instructions
  if (authEnabled && credentialsConfigured === false) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-pi-bg">
        <div className="w-full max-w-lg px-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-xl bg-amber-500 flex items-center justify-center mb-4">
              <span className="text-white text-3xl">⚠</span>
            </div>
            <h1 className="text-2xl font-bold text-pi-text">Authentication Not Configured</h1>
            <p className="text-pi-text-secondary mt-2 text-center">
              Authentication is enabled, but no login credentials have been set up on the server.
              Login is currently impossible.
            </p>
          </div>

          <div className="bg-pi-bg border border-pi-border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-pi-text">Setup Instructions</h2>
            <p className="text-sm text-pi-text-secondary">
              Set the following environment variables on the server and restart:
            </p>
            <div className="bg-black/30 rounded-lg p-4 font-mono text-sm text-green-400 space-y-1">
              <div>PI_WEB_USERNAME=your_username</div>
              <div>PI_WEB_PASSWORD=your_password</div>
            </div>
            <p className="text-sm text-pi-text-secondary">
              Or add them to <code className="bg-black/30 px-1.5 py-0.5 rounded text-pi-accent">~/.pi/.env</code>:
            </p>
            <div className="bg-black/30 rounded-lg p-4 font-mono text-sm text-green-400 space-y-1">
              <div># ~/.pi/.env</div>
              <div>PI_WEB_USERNAME=your_username</div>
              <div>PI_WEB_PASSWORD=your_password</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CASE 3: Auth is NOT enabled → SECURITY WARNING, access DENIED
  if (authEnabled === false) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-pi-bg">
        <div className="w-full max-w-lg px-8">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-xl bg-red-500 flex items-center justify-center mb-4">
              <span className="text-white text-3xl">🔒</span>
            </div>
            <h1 className="text-2xl font-bold text-pi-text">Access Denied</h1>
            <p className="text-pi-text-secondary mt-2 text-center">
              Authentication is not enabled on this server. 
              For your security, access is blocked until authentication is properly configured.
            </p>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold text-red-400">Security Risk</h2>
            <p className="text-sm text-pi-text-secondary">
              Without authentication, anyone with network access can use this interface, 
              execute terminal commands, and modify files. Access has been blocked to protect your system.
            </p>
            <h3 className="text-md font-semibold text-pi-text mt-4">How to enable authentication:</h3>
            <p className="text-sm text-pi-text-secondary">
              1. Set credentials in <code className="bg-black/30 px-1.5 py-0.5 rounded text-pi-accent">~/.pi/.env</code>:
            </p>
            <div className="bg-black/30 rounded-lg p-4 font-mono text-sm text-green-400 space-y-1">
              <div>PI_WEB_USERNAME=your_username</div>
              <div>PI_WEB_PASSWORD=your_password</div>
            </div>
            <p className="text-sm text-pi-text-secondary mt-2">
              2. Start with the <code className="bg-black/30 px-1.5 py-0.5 rounded text-pi-accent">--auth</code> flag:
            </p>
            <div className="bg-black/30 rounded-lg p-4 font-mono text-sm text-green-400">
              pi-web --auth
            </div>
            <p className="text-sm text-pi-text-secondary mt-2">
              3. Or use <code className="bg-black/30 px-1.5 py-0.5 rounded text-pi-accent">/pi-web --auth</code> in Pi.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // CASE 4: Auth is enabled but user is not authenticated → show login page
  return <LoginPage />;
}