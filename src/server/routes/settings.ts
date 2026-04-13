/**
 * Settings Routes
 * 
 * API routes for Pi Web settings.
 */

import { Router } from 'express';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_PATH = join(homedir(), '.pi', 'web-config.json');

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

const DEFAULT_CONFIG: WebConfig = {
  web: {
    enabled: false,
    port: 3300,
    host: 'localhost',
    auth: {
      enabled: false,
    },
    theme: 'system',
  },
};

export function createSettingsRouter(): Router {
  const router = Router();

  /**
   * GET /api/settings
   * Get current settings
   */
  router.get('/', async (req, res) => {
    try {
      const config = await loadConfig();
      res.json(config);
    } catch (error) {
      console.error('[Settings] Error loading:', error);
      res.status(500).json({ error: 'Failed to load settings' });
    }
  });

  /**
   * PUT /api/settings
   * Update settings
   */
  router.put('/', async (req, res) => {
    try {
      const updates = req.body;
      const current = await loadConfig();
      const updated = deepMerge(current, updates);

      await saveConfig(updated);
      res.json(updated);
    } catch (error) {
      console.error('[Settings] Error saving:', error);
      res.status(500).json({ error: 'Failed to save settings' });
    }
  });

  /**
   * POST /api/settings/reset
   * Reset to defaults
   */
  router.post('/reset', async (req, res) => {
    try {
      await saveConfig(DEFAULT_CONFIG);
      res.json(DEFAULT_CONFIG);
    } catch (error) {
      console.error('[Settings] Error resetting:', error);
      res.status(500).json({ error: 'Failed to reset settings' });
    }
  });

  return router;
}

/**
 * Load config from file
 */
async function loadConfig(): Promise<WebConfig> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return deepMerge(DEFAULT_CONFIG, JSON.parse(data));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save config to file
 */
async function saveConfig(config: WebConfig): Promise<void> {
  const dir = join(homedir(), '.pi');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Deep merge two objects
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        typeof source[key] === 'object' &&
        source[key] !== null &&
        !Array.isArray(source[key]) &&
        typeof target[key] === 'object' &&
        target[key] !== null
      ) {
        result[key] = deepMerge(target[key], source[key] as any);
      } else {
        (result as any)[key] = source[key];
      }
    }
  }

  return result;
}