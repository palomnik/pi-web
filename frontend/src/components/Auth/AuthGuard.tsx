import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import LoginPage from '../Auth/LoginPage';

interface AuthGuardProps {
  children: React.ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, authEnabled, checkAuthStatus } = useAuthStore();
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
            Loading...
          </div>
        </div>
      </div>
    );
  }

  // If auth is not enabled, or user is already authenticated, show the app
  if (!authEnabled || isAuthenticated) {
    return <>{children}</>;
  }

  // Otherwise show the login page
  return <LoginPage />;
}