import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from './stores/appStore';
import { useWebSocket } from './stores/websocketStore';
import Layout from './components/Layout';
import ChatPanel from './components/Chat/ChatPanel';
import TerminalPanel from './components/Terminal/TerminalPanel';
import FilesPanel from './components/Files/FilesPanel';
import GitHubPanel from './components/GitHub/GitHubPanel';
import SettingsPage from './components/Settings/SettingsPage';
import AuthGuard from './components/Auth/AuthGuard';

function App() {
  const { theme, setConnected } = useAppStore();
  const { connect, disconnect, connected } = useWebSocket();

  // Apply theme on mount
  useEffect(() => {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('light', !prefersDark);
    } else {
      document.documentElement.classList.toggle('light', theme === 'light');
    }
  }, [theme]);

  // Connect shared WebSocket on mount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Sync connection state
  useEffect(() => {
    setConnected(connected);
  }, [connected, setConnected]);

  return (
    <AuthGuard>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ChatPanel />} />
          <Route path="chat/*" element={<ChatPanel />} />
          <Route path="terminal" element={<TerminalPanel />} />
          <Route path="files" element={<FilesPanel />} />
          <Route path="github" element={<GitHubPanel />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </AuthGuard>
  );
}

export default App;