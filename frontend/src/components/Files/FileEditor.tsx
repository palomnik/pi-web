import { useState, useEffect, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { X, Save, Download, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../stores/api';

interface Props {
  path: string;
  onClose: () => void;
  onSave: () => void;
}

export default function FileEditor({ path, onClose, onSave }: Props) {
  const [content, setContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState(false);
  const editorRef = useRef<any>(null);

  // Determine language from file extension
  const getLanguage = (filePath: string): string => {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      c: 'c',
      cpp: 'cpp',
      h: 'c',
      hpp: 'cpp',
      sh: 'shell',
      bash: 'shell',
      yml: 'yaml',
      yaml: 'yaml',
      sql: 'sql',
      xml: 'xml',
    };
    return langMap[ext] || 'plaintext';
  };

  // Fetch file content
  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      try {
        const response = await apiFetch(`/api/files/read?path=${encodeURIComponent(path)}`);
        if (response.ok) {
          const data = await response.json();
          setContent(data.content || '');
          setOriginalContent(data.content || '');
        }
      } catch (error) {
        console.error('Failed to read file:', error);
        setContent('// Failed to load file content');
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [path]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleChange = (value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setModified(value !== originalContent);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await apiFetch('/api/files/write', {
        method: 'POST',
        body: JSON.stringify({ path, content }),
      });
      if (response.ok) {
        setOriginalContent(content);
        setModified(false);
        onSave();
      }
    } catch (error) {
      console.error('Failed to save file:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    setContent(originalContent);
    setModified(false);
    editorRef.current?.setValue(originalContent);
  };

  const handleDownload = async () => {
    const link = document.createElement('a');
    link.href = `/api/files/download?path=${encodeURIComponent(path)}`;
    link.download = path.split('/').pop() || 'file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [content]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 border-b border-pi-border flex items-center justify-between px-4 bg-pi-bg-secondary">
        <div className="flex items-center gap-2">
          <span className="text-pi-text-secondary truncate max-w-[300px]">
            {path.split('/').pop()}
          </span>
          {modified && (
            <span className="text-xs bg-yellow-600/20 text-yellow-500 px-2 py-0.5 rounded">
              Modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {modified && (
            <button
              onClick={handleRevert}
              className="p-1.5 rounded hover:bg-pi-bg text-pi-text-secondary"
              title="Revert changes"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-pi-bg text-pi-text-secondary"
            title="Download"
          >
            <Download size={16} />
          </button>
          <button
            onClick={handleSave}
            disabled={!modified || saving}
            className={`p-1.5 rounded ${
              modified
                ? 'hover:bg-pi-accent/20 text-pi-accent'
                : 'text-pi-text-secondary opacity-50'
            }`}
            title="Save (Cmd/Ctrl+S)"
          >
            <Save size={16} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-pi-bg text-pi-text-secondary"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        {loading ? (
          <div className="h-full flex items-center justify-center text-pi-text-secondary">
            Loading...
          </div>
        ) : (
          <Editor
            height="100%"
            language={getLanguage(path)}
            value={content}
            onChange={handleChange}
            onMount={handleEditorMount}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: 'SF Mono, Fira Code, Monaco, monospace',
              lineNumbers: 'on',
              wordWrap: 'on',
              tabSize: 2,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 },
              scrollbar: {
                verticalScrollbarSize: 8,
                horizontalScrollbarSize: 8,
              },
            }}
          />
        )}
      </div>
    </div>
  );
}