/**
 * IPC handler helper — wraps handler functions with consistent
 * try/catch and { success, data/error } response shape.
 */

import { ipcMain } from 'electron';

export interface IpcSuccessResponse<T = unknown> {
  success: true;
  data?: T;
}

export interface IpcErrorResponse {
  success: false;
  error: string;
}

export type IpcResponse<T = unknown> = IpcSuccessResponse<T> | IpcErrorResponse;

/**
 * Register an IPC handler that automatically wraps the result in
 * `{ success: true, data }` or `{ success: false, error }`.
 *
 * Usage:
 * ```ts
 * handleIpc('salesforce:getObjects', async () => {
 *   return salesforceService.getObjects();
 * });
 * ```
 */
export function handleIpc<T>(
  channel: string,
  handler: (...args: any[]) => Promise<T> | T,
): void {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      const result = await handler(...args);
      // If handler explicitly returns an IpcResponse shape, pass it through
      if (
        result !== null &&
        typeof result === 'object' &&
        'success' in (result as Record<string, unknown>)
      ) {
        return result;
      }
      return { success: true, data: result } as IpcSuccessResponse<T>;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message } as IpcErrorResponse;
    }
  });
}

/**
 * Register a simple IPC handler that returns its value directly
 * (no success/error wrapping). Use for handlers that return data
 * without a try/catch, such as credential lookups.
 */
export function handleIpcRaw(
  channel: string,
  handler: (...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...args));
}
