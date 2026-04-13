import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAppStore } from './stores/appStore';
import Layout from './components/Layout';
import ChatPanel from './components/Chat/ChatPanel';
import TerminalPanel from './components/Terminal/TerminalPanel';
import FilesPanel from './components/Files/FilesPanel';
import GitHubPanel from './components/GitHub/GitHubPanel';
import SettingsPage from './components/Settings/SettingsPage';

function App() {
  const { theme, setConnected } = useAppStore();

  // Apply theme on mount
  useEffect(() => {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('light', !prefersDark);
    } else {
      document.documentElement.classList.toggle('light', theme === 'light');
    }
  }, [theme]);

  // Connect to WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('[WS] Connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      setConnected(false);
    };

    ws.onerror = (error) => {
      console.error('[WS] Error:', error);
    };

    return () => {
      ws.close();
    };
  }, [setConnected]);

  return (
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
  );
}

export default App;