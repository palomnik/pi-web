/**
 * Authentication Routes
 * 
 * Provides login, logout, and auth status endpoints.
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.js';

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Authenticate user and return a token
   */
  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const token = authService.authenticate(username, password);
    if (!token) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({
      token: token.value,
      expiresAt: token.expiresAt,
    });
  });

  /**
   * GET /api/auth/status
   * Check if auth is enabled and if the current token is valid
   */
  router.get('/status', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;

    res.json({
      enabled: authService.isEnabled(),
      authenticated: token ? authService.validateToken(token) : false,
    });
  });

  /**
   * POST /api/auth/logout
   * Invalidate the current token
   */
  router.post('/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (token) {
      authService.invalidateToken(token);
    }

    res.json({ success: true });
  });

  return router;
}