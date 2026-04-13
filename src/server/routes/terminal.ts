/**
 * Terminal Routes
 * 
 * API routes for terminal functionality.
 */

import { Router } from 'express';
import { spawn } from 'child_process';

export function createTerminalRouter(): Router {
  const router = Router();

  /**
   * POST /api/terminal/create
   * Create a new terminal session
   */
  router.post('/create', (req, res) => {
    try {
      const { cols = 80, rows = 24, cwd = process.cwd() } = req.body;

      // Terminal sessions are managed via WebSocket
      const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      res.json({
        sessionId,
        cols,
        rows,
      });
    } catch (error) {
      console.error('[Terminal] Error creating session:', error);
      res.status(500).json({ error: 'Failed to create terminal session' });
    }
  });

  /**
   * GET /api/terminal/processes
   * List running processes in the terminal
   */
  router.get('/processes', (req, res) => {
    // Run ps to list processes
    const ps = spawn('ps', ['aux']);
    let output = '';

    ps.stdout.on('data', (data) => {
      output += data.toString();
    });

    ps.on('close', (code) => {
      if (code === 0) {
        res.json({ output });
      } else {
        res.status(500).json({ error: 'Failed to list processes' });
      }
    });
  });

  /**
   * POST /api/terminal/kill
   * Kill a process
   */
  router.post('/kill', (req, res) => {
    const { pid, signal = 'SIGTERM' } = req.body;

    if (!pid) {
      return res.status(400).json({ error: 'PID is required' });
    }

    try {
      process.kill(pid, signal);
      res.json({ success: true, pid, signal });
    } catch (error) {
      res.status(500).json({ error: `Failed to kill process ${pid}` });
    }
  });

  /**
   * GET /api/terminal/shells
   * List available shells
   */
  router.get('/shells', (req, res) => {
    const shells = [
      { name: 'bash', path: '/bin/bash' },
      { name: 'zsh', path: '/bin/zsh' },
      { name: 'sh', path: '/bin/sh' },
    ];

    // Check which shells are available
    const available = shells.filter((shell) => {
      try {
        require('fs').accessSync(shell.path, require('fs').constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });

    res.json({ shells: available });
  });

  return router;
}