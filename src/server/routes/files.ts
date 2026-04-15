/**
 * Files Routes
 * 
 * API routes for file system operations.
 */

import { Router } from 'express';
import { promises as fs, createReadStream, statSync } from 'fs';
import { join, resolve, relative, basename, dirname, extname } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.tsx': 'application/typescript',
  '.jsx': 'application/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.py': 'text/x-python',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.sh': 'text/x-shellscript',
  '.bash': 'text/x-shellscript',
  '.yml': 'text/yaml',
  '.yaml': 'text/yaml',
  '.xml': 'text/xml',
  '.sql': 'application/sql',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

export function createFilesRouter(rootDir: string): Router {
  const router = Router();

  /**
   * Helper to safely resolve a path within rootDir
   */
  const safeResolve = (path: string): string => {
    const resolved = resolve(rootDir, path.startsWith('/') ? path.slice(1) : path);
    const relativePath = relative(rootDir, resolved);
    
    // Prevent path traversal
    if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
      throw new Error('Path traversal not allowed');
    }
    
    return resolved;
  };

  /**
   * GET /api/files/list
   * List files in a directory
   */
  router.get('/list', async (req, res) => {
    try {
      const path = req.query.path as string || '';
      const resolved = safeResolve(path);

      const entries = await fs.readdir(resolved, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = join(resolved, entry.name);
          const stats = entry.isSymbolicLink()
            ? await fs.lstat(fullPath)
            : await fs.stat(fullPath);

          // Build relative path from rootDir for the client
          const relativeFilePath = '/' + relative(rootDir, fullPath);

          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
            path: relativeFilePath,
            size: stats.size,
            modified: stats.mtime,
            permissions: stats.mode.toString(8).slice(-3),
            isHidden: entry.name.startsWith('.'),
          };
        })
      );

      // Sort: directories first, then alphabetically
      files.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });

      res.json({
        path: path || '/',
        files,
      });
    } catch (error) {
      console.error('[Files] Error listing:', error);
      res.status(500).json({ error: `Failed to list directory: ${(error as Error).message}` });
    }
  });

  /**
   * GET /api/files/read
   * Read a file's contents
   */
  router.get('/read', async (req, res) => {
    try {
      const path = req.query.path as string;
      if (!path) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const resolved = safeResolve(path);
      const stats = await fs.stat(resolved);

      if (stats.isDirectory()) {
        return res.status(400).json({ error: 'Cannot read a directory' });
      }

      // Set content type based on extension
      const ext = extname(path);
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);

      // Stream large files
      if (stats.size > 1024 * 1024) { // 1MB
        const stream = createReadStream(resolved);
        return stream.pipe(res);
      }

      const content = await fs.readFile(resolved, 'utf-8');
      res.json({
        path,
        content,
        size: stats.size,
        modified: stats.mtime,
        encoding: 'utf-8',
      });
    } catch (error) {
      console.error('[Files] Error reading:', error);
      res.status(500).json({ error: `Failed to read file: ${(error as Error).message}` });
    }
  });

  /**
   * POST /api/files/write
   * Write content to a file
   */
  router.post('/write', async (req, res) => {
    try {
      const { path, content, encoding = 'utf-8' } = req.body;

      if (!path) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const resolved = safeResolve(path);

      // Ensure parent directory exists
      await fs.mkdir(dirname(resolved), { recursive: true });

      await fs.writeFile(resolved, content, encoding);

      res.json({
        success: true,
        path,
        size: Buffer.byteLength(content, encoding),
      });
    } catch (error) {
      console.error('[Files] Error writing:', error);
      res.status(500).json({ error: `Failed to write file: ${(error as Error).message}` });
    }
  });

  /**
   * DELETE /api/files/delete
   * Delete a file or directory
   */
  router.delete('/delete', async (req, res) => {
    try {
      const { path } = req.body;

      if (!path) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const resolved = safeResolve(path);
      const stats = await fs.stat(resolved);

      if (stats.isDirectory()) {
        await fs.rm(resolved, { recursive: true });
      } else {
        await fs.unlink(resolved);
      }

      res.json({ success: true, path });
    } catch (error) {
      console.error('[Files] Error deleting:', error);
      res.status(500).json({ error: `Failed to delete: ${(error as Error).message}` });
    }
  });

  /**
   * POST /api/files/mkdir
   * Create a directory
   */
  router.post('/mkdir', async (req, res) => {
    try {
      const { path } = req.body;

      if (!path) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const resolved = safeResolve(path);
      await fs.mkdir(resolved, { recursive: true });

      res.json({ success: true, path });
    } catch (error) {
      console.error('[Files] Error creating directory:', error);
      res.status(500).json({ error: `Failed to create directory: ${(error as Error).message}` });
    }
  });

  /**
   * POST /api/files/rename
   * Rename/move a file or directory
   */
  router.post('/rename', async (req, res) => {
    try {
      const { oldPath, newPath } = req.body;

      if (!oldPath || !newPath) {
        return res.status(400).json({ error: 'Both oldPath and newPath are required' });
      }

      const resolvedOld = safeResolve(oldPath);
      const resolvedNew = safeResolve(newPath);

      await fs.rename(resolvedOld, resolvedNew);

      res.json({ success: true, oldPath, newPath });
    } catch (error) {
      console.error('[Files] Error renaming:', error);
      res.status(500).json({ error: `Failed to rename: ${(error as Error).message}` });
    }
  });

  /**
   * POST /api/files/search
   * Search for files and content
   */
  router.post('/search', async (req, res) => {
    try {
      const { query, path = '', type = 'files' } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      const resolved = safeResolve(path);
      const results: any[] = [];

      // Simple recursive search
      const searchDir = async (dir: string) => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = relative(rootDir, fullPath);

          if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.includes('node_modules')) {
            await searchDir(fullPath);
          } else if (entry.isFile()) {
            if (entry.name.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                path: `/${relativePath}`,
                name: entry.name,
                type: 'filename',
              });
            }

            // Also search content for text files
            if (type === 'content') {
              try {
                const content = await fs.readFile(fullPath, 'utf-8');
                if (content.toLowerCase().includes(query.toLowerCase())) {
                  results.push({
                    path: `/${relativePath}`,
                    name: entry.name,
                    type: 'content',
                    snippet: '...', // TODO: Add snippet extraction
                  });
                }
              } catch {
                // Skip binary files
              }
            }
          }
        }
      };

      await searchDir(resolved);

      res.json({ query, path, results });
    } catch (error) {
      console.error('[Files] Error searching:', error);
      res.status(500).json({ error: `Failed to search: ${(error as Error).message}` });
    }
  });

  /**
   * GET /api/files/download
   * Download a file
   */
  router.get('/download', (req, res) => {
    try {
      const path = req.query.path as string;
      if (!path) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const resolved = safeResolve(path);
      const filename = basename(path);

      res.download(resolved, filename);
    } catch (error) {
      console.error('[Files] Error downloading:', error);
      res.status(500).json({ error: `Failed to download: ${(error as Error).message}` });
    }
  });

  return router;
}