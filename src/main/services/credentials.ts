import Store from 'electron-store';
import * as crypto from 'crypto';

interface StoredCredentials {
  username: string;
  password: string;
  securityToken: string;
  isSandbox: boolean;
}

interface SavedLogin {
  username: string;
  password: string;
  securityToken: string;
  isSandbox: boolean;
  lastUsed: string;
}

interface StoreSchema {
  lastCredentials: StoredCredentials | null;
  savedLogins: SavedLogin[];
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
    };

    if (existingIndex >= 0) {
      savedLogins[existingIndex] = loginEntry;
    } else {
      savedLogins.push(loginEntry);
    }

    this.store.set('savedLogins', savedLogins);
  }

  getCredentials(): StoredCredentials | null {
    const encrypted = this.store.get('lastCredentials');
    if (!encrypted) return null;

    try {
      return {
        username: encrypted.username,
        password: this.decrypt(encrypted.password),
        securityToken: this.decrypt(encrypted.securityToken),
        isSandbox: encrypted.isSandbox,
      };
    } catch {
      return null;
    }
  }

  getSavedLogins(): Array<{ username: string; isSandbox: boolean; lastUsed: string }> {
    const savedLogins = this.store.get('savedLogins') || [];
    return savedLogins.map((login) => ({
      username: login.username,
      isSandbox: login.isSandbox,
      lastUsed: login.lastUsed,
    }));
  }

  getLoginByUsername(username: string): StoredCredentials | null {
    const savedLogins = this.store.get('savedLogins') || [];
    const login = savedLogins.find((l) => l.username === username);
    
    if (!login) return null;

    try {
      return {
        username: login.username,
        password: this.decrypt(login.password),
        securityToken: this.decrypt(login.securityToken),
        isSandbox: login.isSandbox,
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

  clearCredentials(): void {
    this.store.set('lastCredentials', null);
  }

  clearAllData(): void {
    this.store.clear();
  }
}
