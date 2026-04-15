import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import { apiFetch } from '../../stores/api';
import { Save, RotateCcw, Moon, Sun, Monitor } from 'lucide-react';

interface Settings {
  web: {
    enabled: boolean;
    port: number;
    host: string;
    auth: {
      enabled: boolean;
      username?: string;
    };
    theme: 'light' | 'dark' | 'system';
  };
}

export default function SettingsPage() {
  const { theme, setTheme } = useAppStore();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await apiFetch('/api/settings');
      if (response.ok) {
        setSettings(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const response = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      if (response.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Reset all settings to defaults?')) return;

    try {
      await apiFetch('/api/settings/reset', { method: 'POST' });
      fetchSettings();
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };

  const updateSettings = (updates: Partial<Settings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...updates });
  };

  const themeOptions = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="h-12 border-b border-pi-border flex items-center justify-between px-4">
        <h1 className="font-semibold text-pi-text">Settings</h1>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-green-500 text-sm">Settings saved</span>
          )}
          <button
            onClick={handleReset}
            className="p-1.5 rounded hover:bg-pi-bg-secondary text-pi-text-secondary"
            title="Reset to defaults"
          >
            <RotateCcw size={16} />
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 bg-pi-accent text-white rounded hover:bg-pi-accent-hover disabled:opacity-50 flex items-center gap-1"
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Theme */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Appearance</h2>
            <div className="bg-pi-bg-secondary rounded-lg p-4">
              <label className="block text-sm font-medium mb-3">
                Theme
              </label>
              <div className="flex gap-2">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                        theme === option.value
                          ? 'bg-pi-accent text-white'
                          : 'bg-pi-bg border border-pi-border hover:border-pi-accent'
                      }`}
                    >
                      <Icon size={18} />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Server Settings */}
          {settings && (
            <section>
              <h2 className="text-lg font-semibold mb-4">Server</h2>
              <div className="bg-pi-bg-secondary rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Port
                    </label>
                    <input
                      type="number"
                      value={settings.web.port}
                      onChange={(e) =>
                        updateSettings({
                          web: { ...settings.web, port: parseInt(e.target.value) },
                        })
                      }
                      className="w-full bg-pi-bg border border-pi-border rounded px-3 py-2 focus:outline-none focus:border-pi-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Host
                    </label>
                    <input
                      type="text"
                      value={settings.web.host}
                      onChange={(e) =>
                        updateSettings({
                          web: { ...settings.web, host: e.target.value },
                        })
                      }
                      className="w-full bg-pi-bg border border-pi-border rounded px-3 py-2 focus:outline-none focus:border-pi-accent"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="auth-enabled"
                    checked={settings.web.auth.enabled}
                    onChange={(e) =>
                      updateSettings({
                        web: {
                          ...settings.web,
                          auth: { ...settings.web.auth, enabled: e.target.checked },
                        },
                      })
                    }
                    className="rounded border-pi-border"
                  />
                  <label htmlFor="auth-enabled" className="text-sm">
                    Enable authentication
                  </label>
                </div>

                {settings.web.auth.enabled && (
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Username
                    </label>
                    <input
                      type="text"
                      value={settings.web.auth.username || ''}
                      onChange={(e) =>
                        updateSettings({
                          web: {
                            ...settings.web,
                            auth: { ...settings.web.auth, username: e.target.value },
                          },
                        })
                      }
                      className="w-full bg-pi-bg border border-pi-border rounded px-3 py-2 focus:outline-none focus:border-pi-accent"
                      placeholder="admin"
                    />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Info */}
          <section>
            <h2 className="text-lg font-semibold mb-4">About</h2>
            <div className="bg-pi-bg-secondary rounded-lg p-4">
              <p className="text-pi-text-secondary mb-2">
                Pi Web Interface provides a browser-based interface to the Pi coding agent.
              </p>
              <p className="text-sm text-pi-text-secondary">
                Start the web interface from within Pi using:
              </p>
              <code className="block mt-2 bg-pi-bg p-2 rounded text-sm">
                /pi-web [port] [--host hostname] [--auth]
              </code>
              <p className="text-sm text-pi-text-secondary mt-2">
                Or use <kbd className="bg-pi-bg px-1 rounded">Ctrl+Shift+W</kbd> to toggle the web interface.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}