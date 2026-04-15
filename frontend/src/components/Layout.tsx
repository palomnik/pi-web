import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import {
  MessageSquare,
  Terminal,
  FolderOpen,
  Github,
  Settings,
  Circle,
  LogOut,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Chat', icon: MessageSquare },
  { path: '/terminal', label: 'Terminal', icon: Terminal },
  { path: '/files', label: 'Files', icon: FolderOpen },
  { path: '/github', label: 'GitHub', icon: Github },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const { connected } = useAppStore();
  const { isAuthenticated, authEnabled, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    // Page will re-render and AuthGuard will show login page
  };

  return (
    <div className="flex h-screen w-screen bg-pi-bg">
      {/* Sidebar */}
      <nav className="w-14 bg-pi-bg-secondary border-r border-pi-border flex flex-col items-center py-4 gap-2">
        {/* Logo */}
        <div className="w-10 h-10 rounded-lg bg-pi-accent flex items-center justify-center mb-4">
          <span className="text-white font-bold text-lg">π</span>
        </div>

        {/* Nav items */}
        <div className="flex-1 flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-pi-accent/20 text-pi-accent'
                    : 'text-pi-text-secondary hover:bg-pi-bg hover:text-pi-text'
                }`}
                title={item.label}
              >
                <Icon size={20} />
              </NavLink>
            );
          })}
        </div>

        {/* Bottom section: connection + logout */}
        <div className="flex flex-col items-center gap-2">
          {/* Connection status */}
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              connected ? 'text-green-500' : 'text-red-500'
            }`}
            title={connected ? 'Connected' : 'Disconnected'}
          >
            <Circle size={12} fill="currentColor" />
          </div>

          {/* Logout button (only shown if auth is enabled and user is authenticated) */}
          {authEnabled && isAuthenticated && (
            <button
              onClick={handleLogout}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-pi-text-secondary hover:bg-pi-bg hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}