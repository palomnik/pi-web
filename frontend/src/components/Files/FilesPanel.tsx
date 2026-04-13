import { useState, useEffect } from 'react';
import { useAppStore } from '../../stores/appStore';
import FileTree from './FileTree';
import FileEditor from './FileEditor';
import {
  RefreshCw,
  Upload,
  Download,
  FolderPlus,
  FilePlus,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface FileItem {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  path: string;
  size: number;
  modified: string;
  permissions: string;
  isHidden: boolean;
}

export default function FilesPanel() {
  const { currentPath, setCurrentPath } = useAppStore();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [viewMode, setViewMode] = useState<'tree' | 'list'>('tree');

  // Fetch files for current path
  const fetchFiles = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/files/list?path=${encodeURIComponent(currentPath)}`);
      if (response.ok) {
        const data = await response.json();
        setFiles(data.files || []);
      }
    } catch (error) {
      console.error('Failed to fetch files:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [currentPath]);

  const handleFileClick = (file: FileItem) => {
    if (file.type === 'directory') {
      setCurrentPath(file.path);
    } else {
      setSelectedFile(file.path);
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt('Enter folder name:');
    if (!name) return;

    try {
      const response = await fetch('/api/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${currentPath}/${name}` }),
      });
      if (response.ok) {
        fetchFiles();
      }
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleCreateFile = async () => {
    const name = prompt('Enter file name:');
    if (!name) return;

    try {
      const response = await fetch('/api/files/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: `${currentPath}/${name}`, content: '' }),
      });
      if (response.ok) {
        fetchFiles();
        setSelectedFile(`${currentPath}/${name}`);
      }
    } catch (error) {
      console.error('Failed to create file:', error);
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;

    try {
      const response = await fetch('/api/files/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });
      if (response.ok) {
        fetchFiles();
        if (selectedFile === path) {
          setSelectedFile(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const filteredFiles = showHidden
    ? files
    : files.filter((f) => !f.isHidden);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  };

  return (
    <div className="flex-1 flex h-full">
      {/* Sidebar - File tree */}
      <div className="w-64 border-r border-pi-border flex flex-col bg-pi-bg-secondary">
        {/* Toolbar */}
        <div className="h-12 border-b border-pi-border flex items-center justify-between px-2">
          <h2 className="font-semibold text-sm px-2">Files</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchFiles}
              className="p-1.5 rounded hover:bg-pi-bg"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <button
              onClick={handleCreateFolder}
              className="p-1.5 rounded hover:bg-pi-bg"
              title="New folder"
            >
              <FolderPlus size={16} />
            </button>
            <button
              onClick={handleCreateFile}
              className="p-1.5 rounded hover:bg-pi-bg"
              title="New file"
            >
              <FilePlus size={16} />
            </button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-full text-pi-text-secondary">
              Loading...
            </div>
          ) : (
            <FileTree
              files={filteredFiles}
              currentPath={currentPath}
              onFileClick={handleFileClick}
              onPathChange={setCurrentPath}
              selectedFile={selectedFile}
              onRefresh={fetchFiles}
            />
          )}
        </div>
      </div>

      {/* Main content - File editor/viewer */}
      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <FileEditor
            path={selectedFile}
            onClose={() => setSelectedFile(null)}
            onSave={fetchFiles}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-pi-text-secondary">
            <div className="text-4xl mb-4">📁</div>
            <p>Select a file to view or edit</p>
            <p className="text-sm mt-2">Path: {currentPath}</p>
          </div>
        )}
      </div>
    </div>
  );
}