/**
 * Authentication Routes
 * 
 * Provides login, logout, and auth status endpoints.
 * SECURITY: Login ALWAYS requires valid credentials. No bypass paths exist.
 */

import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.js';

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.lastAttempt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 60 * 1000); // Clean every minute

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  /**
   * POST /api/auth/login
   * Authenticate user and return a token.
   * Rate-limited to prevent brute-force attacks.
   */
  router.post('/login', (req: Request, res: Response) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    
    // Rate limit check
    const attemptInfo = loginAttempts.get(clientIp);
    if (attemptInfo && attemptInfo.count >= MAX_LOGIN_ATTEMPTS) {
      const timeLeft = Math.ceil((LOGIN_WINDOW_MS - (Date.now() - attemptInfo.lastAttempt)) / 1000);
      return res.status(429).json({ 
        error: `Too many login attempts. Try again in ${timeLeft} seconds.` 
      });
    }

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if auth is even enabled on the server
    if (!authService.isEnabled()) {
      return res.status(403).json({ 
        error: 'Authentication is not enabled on the server. Start with --auth flag and set PI_WEB_USERNAME/PI_WEB_PASSWORD.',
        code: 'AUTH_DISABLED' 
      });
    }

    // Check if credentials are configured
    if (!authService.hasCredentials()) {
      return res.status(403).json({ 
        error: 'No credentials configured. Set PI_WEB_USERNAME and PI_WEB_PASSWORD environment variables or configure in web-config.json.',
        code: 'NO_CREDENTIALS' 
      });
    }

    const token = authService.authenticate(username, password);
    if (!token) {
      // Track failed login attempt
      const current = loginAttempts.get(clientIp) || { count: 0, lastAttempt: 0 };
      current.count++;
      current.lastAttempt = Date.now();
      loginAttempts.set(clientIp, current);
      
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Clear rate limit on successful login
    loginAttempts.delete(clientIp);

    res.json({
      token: token.value,
      expiresAt: token.expiresAt,
    });
  });

  /**
   * GET /api/auth/status
   * Check auth configuration and current token validity.
   * Returns enough info for the frontend to enforce secure access control.
   */
  router.get('/status', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;

    const enabled = authService.isEnabled();
    const credentialsConfigured = authService.hasCredentials();

    res.json({
      enabled,
      credentialsConfigured,
      // A token is only valid if auth is actually enabled
      authenticated: enabled && credentialsConfigured && token ? authService.validateToken(token) : false,
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