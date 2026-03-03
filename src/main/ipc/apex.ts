/**
 * IPC handlers for Anonymous Apex execution and script management.
 */

import { SalesforceService } from '../services/salesforce';
import { ApexScriptsStore } from '../services/apexScripts';
import { handleIpc, handleIpcRaw } from './handler';
import { requireString, requireSalesforceId, optionalString, optionalNumber } from './validate';

export function registerApexHandlers(
  salesforceService: SalesforceService,
  apexScriptsStore: ApexScriptsStore,
): void {
  handleIpc('apex:execute', async (script: string, scriptId?: string, scriptName?: string) => {
    requireString(script, 'script');
    const result = await salesforceService.executeAnonymousApex(script);

    apexScriptsStore.addExecutionLog({
      scriptId,
      scriptName,
      script,
      success: result.success,
      compileProblem: result.compileProblem,
      exceptionMessage: result.exceptionMessage,
      exceptionStackTrace: result.exceptionStackTrace,
      debugLog: result.debugLog,
    });

    if (scriptId) {
      apexScriptsStore.updateLastRun(scriptId, result.success);
    }

    return result;
  });

  handleIpc('apex:getDebugLogs', async (limit?: number) => {
    return salesforceService.getDebugLogs(limit ?? 20);
  });

  handleIpc('apex:getDebugLogBody', async (logId: string) => {
    requireSalesforceId(logId, 'log ID');
    return salesforceService.getDebugLogBody(logId);
  });

  // Saved Apex scripts
  handleIpc('apexScripts:save', (name: string, script: string, existingId?: string) => {
    requireString(name, 'script name');
    requireString(script, 'script');
    return apexScriptsStore.saveScript(name, script, existingId);
  });

  handleIpcRaw('apexScripts:getAll', () => {
    return apexScriptsStore.getScripts();
  });

  handleIpcRaw('apexScripts:get', (id: string) => {
    requireString(id, 'script ID');
    return apexScriptsStore.getScript(id);
  });

  handleIpc('apexScripts:delete', (id: string) => {
    requireString(id, 'script ID');
    apexScriptsStore.deleteScript(id);
  });

  // Execution history
  handleIpcRaw('apexHistory:getAll', () => {
    return apexScriptsStore.getExecutionHistory();
  });

  handleIpcRaw('apexHistory:get', (id: string) => {
    requireString(id, 'execution ID');
    return apexScriptsStore.getExecutionLog(id);
  });

  handleIpc('apexHistory:clear', () => {
    apexScriptsStore.clearExecutionHistory();
  });

  handleIpc('apexHistory:delete', (id: string) => {
    requireString(id, 'execution ID');
    apexScriptsStore.deleteExecutionLog(id);
  });
}
