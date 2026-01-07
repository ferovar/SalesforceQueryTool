import Store from 'electron-store';

export interface SavedApexScript {
  id: string;
  name: string;
  script: string;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  lastRunSuccess?: boolean;
}

export interface ApexExecutionLog {
  id: string;
  scriptId?: string;
  scriptName?: string;
  script: string;
  executedAt: string;
  success: boolean;
  compileProblem?: string;
  exceptionMessage?: string;
  exceptionStackTrace?: string;
  debugLog?: string;
}

interface ApexScriptsStoreSchema {
  scripts: SavedApexScript[];
  executionHistory: ApexExecutionLog[];
}

const MAX_EXECUTION_HISTORY = 100;

export class ApexScriptsStore {
  private store: Store<ApexScriptsStoreSchema>;

  constructor() {
    this.store = new Store<ApexScriptsStoreSchema>({
      name: 'salesforce-apex-scripts',
      defaults: {
        scripts: [],
        executionHistory: [],
      },
    });
  }

  // Script management
  saveScript(name: string, script: string, existingId?: string): SavedApexScript {
    const scripts = this.store.get('scripts') || [];
    const now = new Date().toISOString();

    if (existingId) {
      // Update existing script
      const index = scripts.findIndex(s => s.id === existingId);
      if (index !== -1) {
        scripts[index] = {
          ...scripts[index],
          name,
          script,
          updatedAt: now,
        };
        this.store.set('scripts', scripts);
        return scripts[index];
      }
    }

    // Create new script
    const newScript: SavedApexScript = {
      id: `script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      script,
      createdAt: now,
      updatedAt: now,
    };

    scripts.unshift(newScript);
    this.store.set('scripts', scripts);
    return newScript;
  }

  getScripts(): SavedApexScript[] {
    return this.store.get('scripts') || [];
  }

  getScript(id: string): SavedApexScript | undefined {
    const scripts = this.store.get('scripts') || [];
    return scripts.find(s => s.id === id);
  }

  deleteScript(id: string): void {
    const scripts = this.store.get('scripts') || [];
    const filtered = scripts.filter(s => s.id !== id);
    this.store.set('scripts', filtered);
  }

  updateLastRun(id: string, success: boolean): void {
    const scripts = this.store.get('scripts') || [];
    const index = scripts.findIndex(s => s.id === id);
    if (index !== -1) {
      scripts[index].lastRunAt = new Date().toISOString();
      scripts[index].lastRunSuccess = success;
      this.store.set('scripts', scripts);
    }
  }

  // Execution history management
  addExecutionLog(log: Omit<ApexExecutionLog, 'id' | 'executedAt'>): ApexExecutionLog {
    const history = this.store.get('executionHistory') || [];

    const newLog: ApexExecutionLog = {
      ...log,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      executedAt: new Date().toISOString(),
    };

    // Add to beginning
    history.unshift(newLog);

    // Trim to max entries
    if (history.length > MAX_EXECUTION_HISTORY) {
      history.splice(MAX_EXECUTION_HISTORY);
    }

    this.store.set('executionHistory', history);
    return newLog;
  }

  getExecutionHistory(): ApexExecutionLog[] {
    return this.store.get('executionHistory') || [];
  }

  getExecutionLog(id: string): ApexExecutionLog | undefined {
    const history = this.store.get('executionHistory') || [];
    return history.find(l => l.id === id);
  }

  clearExecutionHistory(): void {
    this.store.set('executionHistory', []);
  }

  deleteExecutionLog(id: string): void {
    const history = this.store.get('executionHistory') || [];
    const filtered = history.filter(l => l.id !== id);
    this.store.set('executionHistory', filtered);
  }
}
