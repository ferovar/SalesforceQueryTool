import Store from 'electron-store';
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
  encryptionKey: string;
}

export class CredentialsStore {
  private store: Store<StoreSchema>;
  private encryptionKey: string;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'salesforce-credentials',
      defaults: {
        lastCredentials: null,
        savedLogins: [],
        savedOAuthLogins: [],
        encryptionKey: '',
      },
    });

    // Get or create encryption key
    let key = this.store.get('encryptionKey');
    if (!key) {
      key = crypto.randomBytes(32).toString('hex');
      this.store.set('encryptionKey', key);
    }
    this.encryptionKey = key;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      Buffer.from(this.encryptionKey, 'hex'),
      iv
    );
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
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

  getOAuthLoginById(id: string): { instanceUrl: string; accessToken: string; refreshToken: string; isSandbox: boolean; username: string; color?: string; label?: string } | null {
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

  clearCredentials(): void {
    this.store.set('lastCredentials', null);
  }

  clearAllData(): void {
    this.store.clear();
  }
}
