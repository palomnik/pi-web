#!/usr/bin/env node
/**
 * Fix execute permissions for node-pty's spawn-helper binary.
 * 
 * npm sometimes doesn't preserve execute permissions when installing packages.
 * node-pty requires its spawn-helper binary to be executable for PTY allocation.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

try {
  // Resolve the node-pty package root (go up from lib/ to the package root)
  const ptyLibPath = require.resolve('node-pty');
  const ptyDir = path.resolve(path.dirname(ptyLibPath), '..');
  const prebuildsDir = path.join(ptyDir, 'prebuilds');
  
  if (fs.existsSync(prebuildsDir)) {
    const platforms = fs.readdirSync(prebuildsDir);
    for (const platform of platforms) {
      const spawnHelper = path.join(prebuildsDir, platform, 'spawn-helper');
      if (fs.existsSync(spawnHelper)) {
        try {
          fs.chmodSync(spawnHelper, 0o755);
          console.log(`[fix-perms] Fixed permissions: ${spawnHelper}`);
        } catch (e) {
          // May need shell chmod
          console.warn(`[fix-perms] Could not fix permissions for ${spawnHelper}: ${e.message}`);
          try {
            execSync(`chmod +x "${spawnHelper}"`, { stdio: 'ignore' });
            console.log(`[fix-perms] Fixed permissions via chmod: ${spawnHelper}`);
          } catch {
            console.warn(`[fix-perms] Failed to chmod ${spawnHelper}. Terminal may not work.`);
          }
        }
      }
    }
  }
} catch (e) {
  // node-pty not installed or not found - that's ok
  // The terminal will fall back to spawn mode
}