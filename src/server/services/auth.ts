/**
 * Authentication Service
 * 
 * Simple token-based authentication for Pi Web.
 */

import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';

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
   * Authenticate a user
   */
  authenticate(username: string, password: string): Token | null {
    if (!this.config.enabled) {
      // Auth disabled, generate a token anyway for tracking
      return this.generateToken();
    }

    if (!this.config.username || !this.config.password) {
      // No credentials configured, use environment
      const envUsername = process.env.PI_WEB_USERNAME;
      const envPassword = process.env.PI_WEB_PASSWORD;
      
      if (username !== envUsername || password !== envPassword) {
        return null;
      }
    } else {
      // Validate against configured credentials
      if (username !== this.config.username || password !== this.config.password) {
        return null;
      }
    }

    return this.generateToken();
  }

  /**
   * Generate a new authentication token
   */
  generateToken(): Token {
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