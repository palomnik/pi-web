import { useState, useEffect } from 'react';
import {
  GitBranch,
  GitCommit,
  Upload,
  Download,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '../../stores/api';

interface GitStatus {
  branch: string;
  status: Array<{ code: string; file: string }>;
  remote: string | null;
  aheadBehind: { ahead: number; behind: number };
}

interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  timestamp: string;
  message: string;
}

export default function GitHubPanel() {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitError, setCommitError] = useState<string | null>(null);
  const [repoPageUrl, setRepoPageUrl] = useState('');
  const [repoRemoteUrl, setRepoRemoteUrl] = useState('');

  const fetchRepoSettings = async () => {
    try {
      const res = await apiFetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setRepoPageUrl(data.web?.repoPageUrl || '');
        setRepoRemoteUrl(data.web?.repoRemoteUrl || '');
      }
    } catch {}
  };

  useEffect(() => {
    fetchRepoSettings();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusRes, logRes] = await Promise.all([
        apiFetch('/api/github/status'),
        apiFetch('/api/github/log?limit=20'),
      ]);

      if (statusRes.ok) {
        setStatus(await statusRes.json());
      }
      if (logRes.ok) {
        const logData = await logRes.json();
        setCommits(logData.commits || []);
      }
    } catch (error) {
      console.error('Failed to fetch git status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;

    try {
      const response = await apiFetch('/api/github/commit', {
        method: 'POST',
        body: JSON.stringify({ message: commitMessage, all: true }),
      });

      if (response.ok) {
        setCommitMessage('');
        fetchStatus();
      } else {
        const data = await response.json();
        setCommitError(data.error);
      }
    } catch (error) {
      setCommitError('Failed to commit');
    }
  };

  const handlePush = async () => {
    try {
      await apiFetch('/api/github/push', { method: 'POST' });
      fetchStatus();
    } catch (error) {
      console.error('Failed to push:', error);
    }
  };

  const handlePull = async () => {
    try {
      await apiFetch('/api/github/pull', { method: 'POST' });
      fetchStatus();
    } catch (error) {
      console.error('Failed to pull:', error);
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <header className="h-12 border-b border-pi-border flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <GitBranch size={18} />
          <span className="font-semibold">
            {status?.branch || 'No repository'}
          </span>
          {status?.aheadBehind?.ahead && status.aheadBehind.ahead > 0 && (
            <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded">
              ↑{status.aheadBehind.ahead}
            </span>
          )}
          {status?.aheadBehind?.behind && status.aheadBehind.behind > 0 && (
            <span className="text-xs bg-orange-600/20 text-orange-400 px-2 py-0.5 rounded">
              ↓{status.aheadBehind.behind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {repoPageUrl && (
            <a
              href={repoPageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded hover:bg-pi-bg-secondary"
              title="Open repository in browser"
            >
              <ExternalLink size={16} />
            </a>
          )}
          <button
            onClick={fetchStatus}
            className="p-1.5 rounded hover:bg-pi-bg-secondary"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={handlePull}
            className="p-1.5 rounded hover:bg-pi-bg-secondary flex items-center gap-1"
            title="Pull"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handlePush}
            className="p-1.5 rounded hover:bg-pi-bg-secondary flex items-center gap-1"
            title="Push"
          >
            <Upload size={16} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-pi-text-secondary">
          Loading...
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {/* Remote Info */}
          {(repoPageUrl || repoRemoteUrl) && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-pi-text-secondary mb-2">
                Repository
              </h2>
              <div className="bg-pi-bg-secondary rounded-lg p-3 space-y-1">
                {repoPageUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-pi-text-secondary w-20 shrink-0">Page</span>
                    <a
                      href={repoPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pi-accent hover:underline truncate flex-1"
                    >
                      {repoPageUrl}
                    </a>
                  </div>
                )}
                {repoRemoteUrl && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-pi-text-secondary w-20 shrink-0">Remote</span>
                    <span className="truncate flex-1 font-mono text-xs" title={repoRemoteUrl}>
                      {repoRemoteUrl}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Changes */}
          {status?.status && status.status.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-pi-text-secondary mb-2 flex items-center gap-2">
                Changes ({status.status.length})
              </h2>
              <div className="bg-pi-bg-secondary rounded-lg p-2 space-y-1">
                {status.status.map((change, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-pi-bg"
                  >
                    <span
                      className={`w-5 text-center text-xs ${
                        change.code.includes('M')
                          ? 'text-yellow-500'
                          : change.code.includes('D')
                          ? 'text-red-500'
                          : 'text-green-500'
                      }`}
                    >
                      {change.code}
                    </span>
                    <span className="truncate flex-1 text-sm">{change.file}</span>
                  </div>
                ))}
              </div>

              {/* Commit input */}
              <div className="mt-3">
                {commitError && (
                  <div className="text-red-500 text-sm mb-2">{commitError}</div>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message..."
                    className="flex-1 bg-pi-bg-secondary border border-pi-border rounded px-3 py-2 text-sm focus:outline-none focus:border-pi-accent"
                  />
                  <button
                    onClick={handleCommit}
                    disabled={!commitMessage.trim()}
                    className="px-4 py-2 bg-pi-accent text-white rounded hover:bg-pi-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Commit
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Commit history */}
          <section>
            <h2 className="text-sm font-semibold text-pi-text-secondary mb-2">
              Recent Commits
            </h2>
            <div className="bg-pi-bg-secondary rounded-lg divide-y divide-pi-border">
              {commits.map((commit) => (
                <div
                  key={commit.hash}
                  className="p-3 hover:bg-pi-bg cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <GitCommit size={16} className="text-pi-text-secondary mt-1" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-pi-text truncate">
                        {commit.message}
                      </div>
                      <div className="text-xs text-pi-text-secondary mt-1">
                        {commit.author} • {formatDate(commit.timestamp)} •{' '}
                        <span className="font-mono">{commit.shortHash}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}