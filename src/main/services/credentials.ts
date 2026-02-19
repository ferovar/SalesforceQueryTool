import Store from 'electron-store';
import { safeStorage } from 'electron';
import * as crypto from 'crypto';

interface StoredCredentials {
  label: string;
  username: string;
  password: string;
  securityToken: string;
  isSandbox: boolean;
  color?: string;
}

interface SavedLogin {
  label: string;
  username: string;
  password: string;
  securityToken: string;
  isSandbox: boolean;
  lastUsed: string;
  loginType: 'credentials';
  color?: string;
}

interface SavedOAuthLogin {
  id: string;
  label: string;
  instanceUrl: string;
  accessToken: string;
  refreshToken: string;
  isSandbox: boolean;
  username: string;
  clientId: string;
  lastUsed: string;
  loginType: 'oauth';
  color?: string;
}

interface StoreSchema {
  lastCredentials: StoredCredentials | null;
  savedLogins: SavedLogin[];
  savedOAuthLogins: SavedOAuthLogin[];
}

export class CredentialsStore {
  private store: Store<StoreSchema>;
  private legacyEncryptionKey: string | null = null;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'salesforce-credentials',
      defaults: {
        lastCredentials: null,
        savedLogins: [],
        savedOAuthLogins: [],
      },
    });

    // Read legacy AES-256-CBC key so we can still decrypt old saved credentials.
    // Old versions stored the key as a 64-char hex string in the same JSON file.
    const legacyKey = (this.store as any).get('encryptionKey');
    if (legacyKey && typeof legacyKey === 'string' && legacyKey.length === 64) {
      this.legacyEncryptionKey = legacyKey;
    }
  }

  private encrypt(text: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback: base64 encode when OS keychain is unavailable (rare)
      return 'b64:' + Buffer.from(text, 'utf8').toString('base64');
    }
    return safeStorage.encryptString(text).toString('base64');
  }

  private decrypt(text: string): string {
    if (text.startsWith('b64:')) {
      // Fallback decode
      return Buffer.from(text.slice(4), 'base64').toString('utf8');
    }

    // Legacy AES-256-CBC format: "iv_hex:ciphertext_hex"
    // Old versions stored credentials this way. Detect by checking for
    // a 32-char hex IV followed by a colon and more hex characters.
    if (this.legacyEncryptionKey && /^[0-9a-f]{32}:[0-9a-f]+$/i.test(text)) {
      try {
        const [ivHex, encrypted] = text.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(
          'aes-256-cbc',
          Buffer.from(this.legacyEncryptionKey, 'hex'),
          iv
        );
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch {
        // Corrupted legacy data — fall through to safeStorage attempt
      }
    }

    return safeStorage.decryptString(Buffer.from(text, 'base64'));
  }

  saveCredentials(credentials: StoredCredentials): void {
    const encrypted: StoredCredentials = {
      label: credentials.label,
      username: credentials.username,
      password: this.encrypt(credentials.password),
      securityToken: this.encrypt(credentials.securityToken),
      isSandbox: credentials.isSandbox,
    };

    this.store.set('lastCredentials', encrypted);

    // Also save to the list of saved logins
    const savedLogins = this.store.get('savedLogins') || [];
    const existingIndex = savedLogins.findIndex(
      (login) => login.username === credentials.username
    );

    const loginEntry: SavedLogin = {
      ...encrypted,
      lastUsed: new Date().toISOString(),
      loginType: 'credentials',
    };

    if (existingIndex >= 0) {
      savedLogins[existingIndex] = loginEntry;
    } else {
      savedLogins.push(loginEntry);
    }

    this.store.set('savedLogins', savedLogins);
  }

  saveOAuthLogin(oauthData: {
    label: string;
    instanceUrl: string;
    accessToken: string;
    refreshToken: string;
    isSandbox: boolean;
    username: string;
    clientId: string;
  }): void {
    const id = `oauth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const encrypted: SavedOAuthLogin = {
      id,
      label: oauthData.label,
      instanceUrl: oauthData.instanceUrl,
      accessToken: this.encrypt(oauthData.accessToken),
      refreshToken: oauthData.refreshToken ? this.encrypt(oauthData.refreshToken) : '',
      isSandbox: oauthData.isSandbox,
      username: oauthData.username,
      clientId: oauthData.clientId,
      lastUsed: new Date().toISOString(),
      loginType: 'oauth',
    };

    const savedOAuthLogins = this.store.get('savedOAuthLogins') || [];
    
    // Check if we already have this username saved (update it)
    const existingIndex = savedOAuthLogins.findIndex(
      (login) => login.username === oauthData.username
    );

    if (existingIndex >= 0) {
      encrypted.id = savedOAuthLogins[existingIndex].id; // Keep same ID
      savedOAuthLogins[existingIndex] = encrypted;
    } else {
      savedOAuthLogins.push(encrypted);
    }

    this.store.set('savedOAuthLogins', savedOAuthLogins);
  }

  getSavedOAuthLogins(): Array<{ id: string; label: string; username: string; isSandbox: boolean; lastUsed: string; loginType: 'oauth' }> {
    const savedOAuthLogins = this.store.get('savedOAuthLogins') || [];
    return savedOAuthLogins.map((login) => ({
      id: login.id,
      label: login.label || login.username,
      username: login.username,
      isSandbox: login.isSandbox,
      lastUsed: login.lastUsed,
      loginType: 'oauth' as const,
    }));
  }

  getOAuthLoginById(id: string): { instanceUrl: string; accessToken: string; refreshToken: string; isSandbox: boolean; username: string; clientId: string; color?: string; label?: string } | null {
    const savedOAuthLogins = this.store.get('savedOAuthLogins') || [];
    const login = savedOAuthLogins.find((l) => l.id === id);
    
    if (!login) return null;

    try {
      return {
        instanceUrl: login.instanceUrl,
        accessToken: this.decrypt(login.accessToken),
        refreshToken: login.refreshToken ? this.decrypt(login.refreshToken) : '',
        isSandbox: login.isSandbox,
        username: login.username,
        clientId: login.clientId,
        color: login.color,
        label: login.label,
      };
    } catch {
      return null;
    }
  }

  deleteOAuthLogin(id: string): void {
    const savedOAuthLogins = this.store.get('savedOAuthLogins') || [];
    const filtered = savedOAuthLogins.filter((login) => login.id !== id);
    this.store.set('savedOAuthLogins', filtered);
  }

  getCredentials(): StoredCredentials | null {
    const encrypted = this.store.get('lastCredentials');
    if (!encrypted) return null;

    try {
      return {
        label: encrypted.label || encrypted.username,
        username: encrypted.username,
        password: this.decrypt(encrypted.password),
        securityToken: this.decrypt(encrypted.securityToken),
        isSandbox: encrypted.isSandbox,
      };
    } catch {
      return null;
    }
  }

  getSavedLogins(): Array<{ label: string; username: string; isSandbox: boolean; lastUsed: string; color?: string }> {
    const savedLogins = this.store.get('savedLogins') || [];
    return savedLogins.map((login) => ({
      label: login.label || login.username,
      username: login.username,
      isSandbox: login.isSandbox,
      lastUsed: login.lastUsed,
      color: login.color,
    }));
  }

  getLoginByUsername(username: string): StoredCredentials | null {
    const savedLogins = this.store.get('savedLogins') || [];
    const login = savedLogins.find((l) => l.username === username);
    
    if (!login) return null;

    try {
      return {
        label: login.label || login.username,
        username: login.username,
        password: this.decrypt(login.password),
        securityToken: this.decrypt(login.securityToken),
        isSandbox: login.isSandbox,
        color: login.color,
      };
    } catch {
      return null;
    }
  }

  deleteSavedLogin(username: string): void {
    const savedLogins = this.store.get('savedLogins') || [];
    const filtered = savedLogins.filter((login) => login.username !== username);
    this.store.set('savedLogins', filtered);

    // Also clear last credentials if it matches
    const lastCreds = this.store.get('lastCredentials');
    if (lastCreds && lastCreds.username === username) {
      this.store.set('lastCredentials', null);
    }
  }

  updateLoginMetadata(username: string, label: string, color: string): void {
    const savedLogins = this.store.get('savedLogins') || [];
    const updated = savedLogins.map((login) => {
      if (login.username === username) {
        return { ...login, label, color };
      }
      return login;
    });
    this.store.set('savedLogins', updated);
  }

  updateOAuthMetadata(id: string, label: string, color: string): void {
    const savedOAuthLogins = this.store.get('savedOAuthLogins') || [];
    const updated = savedOAuthLogins.map((login) => {
      if (login.id === id) {
        return { ...login, label, color };
      }
      return login;
    });
    this.store.set('savedOAuthLogins', updated);
  }

  updateOAuthTokens(id: string, accessToken: string, refreshToken?: string): void {
    const savedOAuthLogins = this.store.get('savedOAuthLogins') || [];
    const updated = savedOAuthLogins.map((login) => {
      if (login.id === id) {
        const result = { ...login, accessToken: this.encrypt(accessToken) };
        if (refreshToken) {
          result.refreshToken = this.encrypt(refreshToken);
        }
        return result;
      }
      return login;
    });
    this.store.set('savedOAuthLogins', updated);
  }

  clearCredentials(): void {
    this.store.set('lastCredentials', null);
  }

  clearAllData(): void {
    this.store.clear();
  }
}
