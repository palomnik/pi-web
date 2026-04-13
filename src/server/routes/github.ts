/**
 * GitHub Routes
 * 
 * API routes for GitHub integration.
 */

import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';

const execAsync = promisify(exec);

export function createGitHubRouter(): Router {
  const router = Router();

  /**
   * Helper to run git commands
   */
  const runGit = async (args: string[], cwd = process.cwd()): Promise<string> => {
    const { stdout } = await execAsync(`git ${args.join(' ')}`, { cwd });
    return stdout.trim();
  };

  /**
   * GET /api/github/status
   * Get current repository status
   */
  router.get('/status', async (req, res) => {
    try {
      const cwd = req.query.cwd as string || process.cwd();

      const branch = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
      const status = await runGit(['status', '--porcelain'], cwd);
      const remote = await runGit(['remote', '-v'], cwd).catch(() => '');
      const aheadBehind = await runGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], cwd).catch(() => '0\t0');

      res.json({
        branch,
        status: status.split('\n').filter(Boolean).map(line => ({
          code: line.slice(0, 2),
          file: line.slice(3),
        })),
        remote: remote.split('\n').filter(Boolean)[0] || null,
        aheadBehind: {
          ahead: parseInt(aheadBehind.split('\t')[0] || '0'),
          behind: parseInt(aheadBehind.split('\t')[1] || '0'),
        },
      });
    } catch (error) {
      console.error('[GitHub] Error getting status:', error);
      res.status(500).json({ error: 'Not a git repository or git not available' });
    }
  });

  /**
   * GET /api/github/log
   * Get commit history
   */
  router.get('/log', async (req, res) => {
    try {
      const cwd = req.query.cwd as string || process.cwd();
      const limit = parseInt(req.query.limit as string || '20');

      const log = await runGit([
        'log',
        `--pretty=format:%H|%h|%an|%ae|%at|%s`,
        `-${limit}`,
      ], cwd);

      const commits = log.split('\n').filter(Boolean).map(line => {
        const [hash, shortHash, author, email, timestamp, message] = line.split('|');
        return {
          hash,
          shortHash,
          author,
          email,
          timestamp: new Date(parseInt(timestamp) * 1000).toISOString(),
          message,
        };
      });

      res.json({ commits });
    } catch (error) {
      console.error('[GitHub] Error getting log:', error);
      res.status(500).json({ error: 'Failed to get commit history' });
    }
  });

  /**
   * GET /api/github/diff
   * Get staged/unstaged changes
   */
  router.get('/diff', async (req, res) => {
    try {
      const cwd = req.query.cwd as string || process.cwd();
      const staged = req.query.staged === 'true';

      const args = ['diff'];
      if (staged) args.push('--staged');

      const diff = await runGit(args, cwd);

      res.json({ diff });
    } catch (error) {
      console.error('[GitHub] Error getting diff:', error);
      res.status(500).json({ error: 'Failed to get diff' });
    }
  });

  /**
   * POST /api/github/commit
   * Create a commit
   */
  router.post('/commit', async (req, res) => {
    try {
      const cwd = req.body.cwd || process.cwd();
      const { message, files = [], all = false } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'Commit message is required' });
      }

      // Stage files or use --all
      if (all) {
        await runGit(['add', '--all'], cwd);
      } else if (files.length > 0) {
        await runGit(['add', ...files], cwd);
      }

      // Commit
      await runGit(['commit', '-m', message], cwd);

      res.json({ success: true, message: 'Commit created' });
    } catch (error) {
      console.error('[GitHub] Error creating commit:', error);
      res.status(500).json({ error: 'Failed to create commit' });
    }
  });

  /**
   * POST /api/github/push
   * Push to remote
   */
  router.post('/push', async (req, res) => {
    try {
      const cwd = req.body.cwd || process.cwd();
      const { remote = 'origin', branch, force = false } = req.body;

      const args = ['push', remote];
      if (branch) args.push(branch);
      if (force) args.push('--force');

      await runGit(args, cwd);

      res.json({ success: true, message: 'Pushed to remote' });
    } catch (error) {
      console.error('[GitHub] Error pushing:', error);
      res.status(500).json({ error: 'Failed to push' });
    }
  });

  /**
   * POST /api/github/pull
   * Pull from remote
   */
  router.post('/pull', async (req, res) => {
    try {
      const cwd = req.body.cwd || process.cwd();
      const { remote = 'origin', branch } = req.body;

      const args = ['pull', remote];
      if (branch) args.push(branch);

      await runGit(args, cwd);

      res.json({ success: true, message: 'Pulled from remote' });
    } catch (error) {
      console.error('[GitHub] Error pulling:', error);
      res.status(500).json({ error: 'Failed to pull' });
    }
  });

  /**
   * GET /api/github/branches
   * List branches
   */
  router.get('/branches', async (req, res) => {
    try {
      const cwd = req.query.cwd as string || process.cwd();

      const branches = await runGit(['branch', '-a', '--format=%(refname:short)|%(HEAD)|%(objectname:short)'], cwd);

      const list = branches.split('\n').filter(Boolean).map(line => {
        const [name, current, hash] = line.split('|');
        return {
          name,
          current: current === '*',
          hash,
        };
      });

      res.json({ branches: list });
    } catch (error) {
      console.error('[GitHub] Error listing branches:', error);
      res.status(500).json({ error: 'Failed to list branches' });
    }
  });

  /**
   * POST /api/github/checkout
   * Checkout a branch
   */
  router.post('/checkout', async (req, res) => {
    try {
      const cwd = req.body.cwd || process.cwd();
      const { branch, create = false } = req.body;

      if (!branch) {
        return res.status(400).json({ error: 'Branch name is required' });
      }

      const args = ['checkout'];
      if (create) args.push('-b');
      args.push(branch);

      await runGit(args, cwd);

      res.json({ success: true, message: `Checked out ${branch}` });
    } catch (error) {
      console.error('[GitHub] Error checking out:', error);
      res.status(500).json({ error: 'Failed to checkout branch' });
    }
  });

  return router;
}