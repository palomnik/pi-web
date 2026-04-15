import { useState } from 'react';
import {
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileImage,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { apiFetch } from '../../stores/api';

export interface FileItem {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  path: string;
  size: number;
  modified?: string;
  permissions?: string;
  isHidden?: boolean;
}

interface Props {
  files: FileItem[];
  currentPath: string;
  onFileClick: (file: FileItem) => void;
  onPathChange: (path: string) => void;
  selectedFile: string | null;
  onRefresh: () => void;
  depth?: number;
}

const iconMap: Record<string, typeof FileCode> = {
  '.ts': FileCode,
  '.tsx': FileCode,
  '.js': FileCode,
  '.jsx': FileCode,
  '.py': FileCode,
  '.go': FileCode,
  '.rs': FileCode,
  '.java': FileCode,
  '.c': FileCode,
  '.cpp': FileCode,
  '.html': FileCode,
  '.css': FileCode,
  '.json': FileCode,
  '.yml': FileCode,
  '.yaml': FileCode,
  '.md': FileText,
  '.txt': FileText,
  '.png': FileImage,
  '.jpg': FileImage,
  '.jpeg': FileImage,
  '.gif': FileImage,
  '.svg': FileImage,
};

export default function FileTree({
  files,
  currentPath,
  onFileClick,
  onPathChange,
  selectedFile,
  onRefresh,
  depth = 0,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['.']));
  const [_childFiles, setChildFiles] = useState<Map<string, FileItem[]>>(new Map());

  const toggleExpand = async (path: string, file?: FileItem) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);

      // Fetch children if directory and not already loaded
      if (file?.type === 'directory' && !_childFiles.has(path)) {
        try {
          const response = await apiFetch(`/api/files/list?path=${encodeURIComponent(path)}`);
          if (response.ok) {
            const data = await response.json();
            setChildFiles((prev) => new Map(prev).set(path, data.files || []));
          }
        } catch (error) {
          console.error('Failed to fetch children:', error);
        }
      }
    }
    setExpanded(newExpanded);
  };

  const getFileIcon = (file: FileItem) => {
    if (file.type === 'directory') {
      return expanded.has(file.path) ? FolderOpen : Folder;
    }

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const Icon = iconMap[ext] || File;
    return Icon;
  };

  const sortedFiles = [...files].sort((a, b) => {
    // Directories first
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;
    // Then alphabetically
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-0.5">
      {sortedFiles.map((file) => {
        const Icon = getFileIcon(file);
        const isExpanded = expanded.has(file.path);
        const isSelected = selectedFile === file.path;
        const childFiles = _childFiles.get(file.path) || [];

        return (
          <div key={file.path}>
            <div
              className={`file-tree-item ${isSelected ? 'active' : ''}`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={() => {
                if (file.type === 'directory') {
                  toggleExpand(file.path, file);
                } else {
                  onFileClick(file);
                }
              }}
            >
              {file.type === 'directory' && (
                <span className="text-pi-text-secondary">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              )}
              <Icon size={16} className={file.type === 'directory' ? 'text-yellow-500' : 'text-pi-text-secondary'} />
              <span className="truncate">{file.name}</span>
            </div>

            {file.type === 'directory' && isExpanded && childFiles.length > 0 && (
              <div>
                <FileTree
                  files={childFiles}
                  currentPath={currentPath}
                  onFileClick={onFileClick}
                  onPathChange={onPathChange}
                  selectedFile={selectedFile}
                  onRefresh={onRefresh}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}