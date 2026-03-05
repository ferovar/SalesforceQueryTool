/**
 * Electron main process entry point.
 *
 * Initialises window management and registers all IPC handlers via modular
 * handler files in ./ipc/.
 */

import { SalesforceService } from './services/salesforce';
import { CredentialsStore } from './services/credentials';
import { QueriesStore } from './services/queries';
import { QueryHistoryStore } from './services/queryHistory';
import { ApexScriptsStore } from './services/apexScripts';
import { OrgConnectionManager } from './services/orgConnectionManager';
import { SettingsStore } from './services/settings';
import { PlatformEventsService } from './services/platformEvents';
import { PlatformEventsStore } from './services/platformEventsStore';

import { initWindowManagement } from './ipc/window';
import { registerSalesforceHandlers } from './ipc/salesforce';
import { registerCredentialsHandlers } from './ipc/credentials';
import { registerQueryHandlers } from './ipc/queries';
import { registerApexHandlers } from './ipc/apex';
import { registerDebugHandlers } from './ipc/debug';
import { registerMigrationHandlers } from './ipc/migration';
import { registerSettingsHandlers } from './ipc/settings';
import { registerPlatformEventsHandlers } from './ipc/platformEvents';

// ── Service instances ────────────────────────────────────────────────────────

const salesforceService = new SalesforceService();
const credentialsStore = new CredentialsStore();
const queriesStore = new QueriesStore();
const queryHistoryStore = new QueryHistoryStore();
const apexScriptsStore = new ApexScriptsStore();
const orgConnectionManager = new OrgConnectionManager();
const settingsStore = new SettingsStore();
const platformEventsService = new PlatformEventsService();
const platformEventsStore = new PlatformEventsStore();

// ── Initialise ───────────────────────────────────────────────────────────────

initWindowManagement();

registerSalesforceHandlers(salesforceService, credentialsStore, platformEventsService);
registerCredentialsHandlers(credentialsStore);
registerQueryHandlers(queriesStore, queryHistoryStore);
registerApexHandlers(salesforceService, apexScriptsStore);
registerDebugHandlers(salesforceService);
registerMigrationHandlers(salesforceService, credentialsStore, orgConnectionManager);
registerSettingsHandlers(settingsStore);
registerPlatformEventsHandlers(platformEventsService, platformEventsStore, salesforceService);
