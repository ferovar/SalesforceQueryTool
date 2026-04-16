/**
 * Derives a per-install encryption key for electron-store.
 *
 * This is *defense-in-depth* — it keeps the on-disk JSON unreadable to
 * casual inspection. Real secrets (passwords / tokens) are additionally
 * encrypted via safeStorage on a per-field basis in CredentialsStore.
 *
 * Stored as a 32-byte hex random value in a 0o600 file inside userData.
 * We deliberately do NOT use safeStorage here because electron-store
 * instances are created at main-process module load, before `app.whenReady`,
 * and safeStorage APIs require the app to be ready.
 */
import { app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

let cachedKey: string | null = null;

export function getStoreEncryptionKey(): string {
  if (cachedKey) return cachedKey;

  const userData = app.getPath('userData');
  try {
    fs.mkdirSync(userData, { recursive: true });
  } catch {
    // userData may already exist; ignore.
  }

  const keyFile = path.join(userData, '.store-key');

  try {
    if (fs.existsSync(keyFile)) {
      const stored = fs.readFileSync(keyFile, 'utf8').trim();
      if (/^[0-9a-f]{64}$/i.test(stored)) {
        cachedKey = stored;
        return cachedKey;
      }
      // Corrupt key file — fall through and regenerate. The old stores
      // encrypted with the lost key will be reset to defaults by
      // electron-store, which is acceptable for this defense-in-depth layer.
    }
  } catch {
    // fall through to regen
  }

  const raw = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(keyFile, raw, { mode: 0o600 });
  } catch {
    // If we cannot persist, use the in-memory key for this session.
  }
  cachedKey = raw;
  return cachedKey;
}
