import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Clear error when user starts typing
  useEffect(() => {
    if (error) clearError();
  }, [username, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    await login(username, password);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-pi-bg">
      <div className="w-full max-w-md px-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-pi-accent flex items-center justify-center mb-4">
            <span className="text-white font-bold text-3xl">π</span>
          </div>
          <h1 className="text-2xl font-bold text-pi-text">Pi Web Interface</h1>
          <p className="text-pi-text-secondary mt-2">Sign in to continue</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-pi-text-secondary mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
              autoComplete="username"
              className="w-full bg-pi-bg border border-pi-border rounded-lg px-4 py-3 text-pi-text placeholder-pi-text-secondary/50 focus:outline-none focus:border-pi-accent transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-pi-text-secondary mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              className="w-full bg-pi-bg border border-pi-border rounded-lg px-4 py-3 text-pi-text placeholder-pi-text-secondary/50 focus:outline-none focus:border-pi-accent transition-colors"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full py-3 bg-pi-accent text-white rounded-lg hover:bg-pi-accent-hover disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-pi-text-secondary mt-8">
          Pi Web Interface • Secure Connection
        </p>
      </div>
    </div>
  );
}