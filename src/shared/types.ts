/**
 * Shared types between frontend and backend
 */

// Chat types
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Session {
  id: string;
  name: string;
  messages: Message[];
  createdAt: number;
}

// File types
export interface FileItem {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  path: string;
  size: number;
  modified: string;
  permissions: string;
  isHidden: boolean;
}

// Git types
export interface GitStatus {
  branch: string;
  status: Array<{ code: string; file: string }>;
  remote: string | null;
  aheadBehind: { ahead: number; behind: number };
}

export interface Commit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  timestamp: string;
  message: string;
}

// Settings types
export interface WebConfig {
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

// WebSocket message types
export type WSMessageType =
  | 'connected'
  | 'chat'
  | 'chat-chunk'
  | 'chat-done'
  | 'error'
  | 'terminal-input'
  | 'terminal-output'
  | 'terminal-resize'
  | 'subscribe'
  | 'unsubscribe';

export interface WSMessage {
  type: WSMessageType;
  [key: string]: any;
}