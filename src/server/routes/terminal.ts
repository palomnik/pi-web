/**
 * Terminal Routes
 * 
 * API routes for terminal functionality.
 * Terminal sessions are created via REST, but data flows through WebSocket.
 */

import { Router } from 'express';

export function createTerminalRouter(): Router {
  const router = Router();

  /**
   * POST /api/terminal/create
   * Create a new terminal session
   * 
   * Note: This just validates the request. The actual PTY is created
   * via WebSocket message: { type: 'terminal-create', ... }
   */
  router.post('/create', (req, res) => {
    try {
      const { cols = 80, rows = 24 } = req.body;

      // Generate a session ID for WebSocket use
      const sessionId = `term-${Date.now()}`;

      res.json({
        sessionId,
        message: 'Connect via WebSocket and send { type: "terminal-create", sessionId, cols, rows }',
        cols,
        rows,
      });
    } catch (error) {
      console.error('[Terminal] Error creating session:', error);
      res.status(500).json({ error: 'Failed to create terminal session' });
    }
  });

  /**
   * GET /api/terminal/shells
   * List available shells
   */
  router.get('/shells', async (req, res) => {
    const fs = await import('fs/promises');
    const shells = [
      { name: 'bash', path: '/bin/bash' },
      { name: 'zsh', path: '/bin/zsh' },
      { name: 'sh', path: '/bin/sh' },
    ];

    // Also check for other common shells
    const additionalShells = [
      { name: 'fish', path: '/usr/local/bin/fish' },
      { name: 'fish', path: '/opt/homebrew/bin/fish' },
    ];

    const allShells = [...shells, ...additionalShells];

    // Check which shells exist and are executable
    const availablePromises = allShells.map(async (shell) => {
      try {
        await fs.access(shell.path, fs.constants.X_OK);
        return shell;
      } catch {
        return null;
      }
    });
    const available = (await Promise.all(availablePromises)).filter(Boolean) as typeof shells;

    // Deduplicate by name
    const seen = new Set<string>();
    const unique = available.filter(shell => {
      if (seen.has(shell.name)) return false;
      seen.add(shell.name);
      return true;
    });

    res.json({ shells: unique, default: process.env.SHELL || '/bin/bash' });
  });

  /**
   * GET /api/terminal/help
   * Show how to use terminal over WebSocket
   */
  router.get('/help', (req, res) => {
    res.json({
      usage: 'Terminal uses WebSocket for real-time PTY communication',
      messages: {
        create: {
          type: 'terminal-create',
          cols: 80,
          rows: 24,
          cwd: '/optional/path',
          shell: '/bin/bash'
        },
        input: {
          type: 'terminal-input',
          sessionId: 'term-xxx',
          data: 'ls -la\n'
        },
        resize: {
          type: 'terminal-resize',
          sessionId: 'term-xxx',
          cols: 120,
          rows: 40
        },
        kill: {
          type: 'terminal-kill',
          sessionId: 'term-xxx'
        }
      },
      responses: {
        output: { type: 'terminal-output', sessionId: 'term-xxx', data: '...' },
        exit: { type: 'terminal-exit', sessionId: 'term-xxx', exitCode: 0 }
      }
    });
  });

  return router;
}