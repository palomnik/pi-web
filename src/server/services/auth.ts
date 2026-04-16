/**
 * Authentication Service
 * 
 * Token-based authentication for Pi Web.
 * Auth is ALWAYS required — there is no bypass.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export interface AuthConfig {
  enabled: boolean;
  username?: string;
  password?: string;
}

export interface Token {
  value: string;
  createdAt: number;
  expiresAt: number;
}

export class AuthService {
  private config: AuthConfig;
  private tokens: Map<string, Token> = new Map();
  private readonly TOKEN_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_TOKENS = 100; // Prevent token table from growing unbounded

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /**
   * Check if authentication is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if credentials have been configured.
   * Looks at both config values and environment variables.
   */
  hasCredentials(): boolean {
    if (this.config.username && this.config.password) {
      return true;
    }
    const envUsername = process.env.PI_WEB_USERNAME;
    const envPassword = process.env.PI_WEB_PASSWORD;
    return !!(envUsername && envPassword);
  }

  /**
   * Authenticate a user.
   * 
   * SECURITY: If auth is disabled, login ALWAYS fails (returns null).
   * This prevents any bypass of the authentication gate.
   * If auth is enabled but credentials are not configured, login also fails.
   * Only valid credentials against a properly configured auth system grant access.
   */
  authenticate(username: string, password: string): Token | null {
    if (!this.config.enabled) {
      // Auth not enabled — DENY access. No bypass permitted.
      console.warn('[Auth] Login attempt rejected: authentication is not enabled on the server');
      return null;
    }

    // Determine the valid credentials (config overrides env)
    const validUsername = this.config.username || process.env.PI_WEB_USERNAME;
    const validPassword = this.config.password || process.env.PI_WEB_PASSWORD;

    if (!validUsername || !validPassword) {
      // No credentials configured — cannot authenticate anyone
      console.error('[Auth] Login attempt rejected: no credentials configured (set PI_WEB_USERNAME and PI_WEB_PASSWORD)');
      return null;
    }

    // Constant-time comparison to prevent timing attacks
    if (!this.safeStringEqual(username, validUsername) || !this.safeStringEqual(password, validPassword)) {
      return null;
    }

    return this.generateToken();
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   */
  private safeStringEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    
    if (bufA.length !== bufB.length) {
      // Still do a comparison to avoid leaking length info via timing
      timingSafeEqual(bufA, bufA);
      return false;
    }
    
    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Generate a new authentication token
   */
  generateToken(): Token {
    // Enforce max token count to prevent unbounded growth
    if (this.tokens.size >= this.MAX_TOKENS) {
      this.cleanupExpiredTokens();
      // If still too many after cleanup, remove oldest
      if (this.tokens.size >= this.MAX_TOKENS) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, token] of this.tokens) {
          if (token.createdAt < oldestTime) {
            oldestTime = token.createdAt;
            oldestKey = key;
          }
        }
        if (oldestKey) this.tokens.delete(oldestKey);
      }
    }

    const value = uuidv4() + '-' + randomBytes(32).toString('hex');
    const now = Date.now();
    const token: Token = {
      value,
      createdAt: now,
      expiresAt: now + this.TOKEN_DURATION,
    };

    this.tokens.set(value, token);
    return token;
  }

  /**
   * Validate a token
   */
  validateToken(value: string): boolean {
    const token = this.tokens.get(value);
    if (!token) return false;

    if (Date.now() > token.expiresAt) {
      this.tokens.delete(value);
      return false;
    }

    return true;
  }

  /**
   * Invalidate a token (logout)
   */
  invalidateToken(value: string): void {
    this.tokens.delete(value);
  }

  /**
   * Clean up expired tokens
   */
  cleanupExpiredTokens(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [value, token] of this.tokens) {
      if (now > token.expiresAt) {
        this.tokens.delete(value);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Hash a password (for storage if needed)
   */
  static hashPassword(password: string, salt?: string): string {
    const s = salt || randomBytes(16).toString('hex');
    const hash = createHash('sha256')
      .update(s + password)
      .digest('hex');
    return `${s}:${hash}`;
  }

  /**
   * Verify a password hash
   */
  static verifyPassword(password: string, hashed: string): boolean {
    const [salt, hash] = hashed.split(':');
    const verify = createHash('sha256')
      .update(salt + password)
      .digest('hex');
    return verify === hash;
  }
}