import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';

export default function LoginPage() {
  const { login, isLoading, error, errorCode, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
          {/* Error message — tailored to the type of failure */}
          {error && (
            <div className={`border rounded-lg px-4 py-3 text-sm ${
              errorCode === 'AUTH_DISABLED' 
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : errorCode === 'NO_CREDENTIALS'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-red-500/10 border-red-500/30 text-red-400'
            }`}>
              {errorCode === 'AUTH_DISABLED' ? (
                <div className="space-y-1">
                  <div className="font-semibold">🔒 Authentication Not Enabled</div>
                  <div>The server is not enforcing authentication. Access is denied for security.</div>
                </div>
              ) : errorCode === 'NO_CREDENTIALS' ? (
                <div className="space-y-1">
                  <div className="font-semibold">⚠ No Credentials Configured</div>
                  <div>The server has no login credentials set up. Please configure PI_WEB_USERNAME and PI_WEB_PASSWORD.</div>
                </div>
              ) : (
                <div>{error}</div>
              )}
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                className="w-full bg-pi-bg border border-pi-border rounded-lg px-4 py-3 pr-12 text-pi-text placeholder-pi-text-secondary/50 focus:outline-none focus:border-pi-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-pi-text-secondary hover:text-pi-text transition-colors text-sm"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
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

        {/* Security notice */}
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-pi-text-secondary">
            <span>🔒</span>
            <span>Access requires valid credentials</span>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-pi-text-secondary mt-4">
          Pi Web Interface • Secure Connection
        </p>
      </div>
    </div>
  );
}