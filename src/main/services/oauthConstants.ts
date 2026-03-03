/**
 * OAuth constants for Salesforce Query Tool.
 *
 * The default Connected App consumer key follows the same pattern as
 * Salesforce CLI — it auto-installs in any org on first auth.
 *
 * For production deployments, it is recommended to register a dedicated
 * Connected App in your Salesforce org rather than relying on the shared
 * PlatformCLI key. This gives you:
 *   - Control over OAuth scopes and IP restrictions
 *   - Visibility into connected app usage via Setup > Connected Apps
 *   - The ability to revoke access independently of Salesforce CLI
 *
 * To use a custom Connected App:
 *   1. In Salesforce Setup, create a Connected App with OAuth enabled
 *   2. Set the callback URL to http://localhost:1717/OauthRedirect
 *   3. Select the "api" and "refresh_token" scopes
 *   4. Users can enter their custom Client ID in the OAuth login form
 */

// Salesforce CLI's well-known default Connected App consumer key.
// This Connected App is auto-provisioned by Salesforce in every org.
// Using the same key gives us zero-setup OAuth just like `sf org login web`.
export const DEFAULT_CLIENT_ID = 'PlatformCLI';

// OAuth scopes
export const OAUTH_SCOPES = 'api refresh_token';

// Callback URLs — different ports so source + target orgs can auth simultaneously
export const PRIMARY_OAUTH_PORT = 1717;
export const TARGET_OAUTH_PORT = 1718;
export const PRIMARY_CALLBACK_URL = `http://localhost:${PRIMARY_OAUTH_PORT}/OauthRedirect`;
export const TARGET_CALLBACK_URL = `http://localhost:${TARGET_OAUTH_PORT}/OauthRedirect`;

// Login URLs
export const PRODUCTION_LOGIN_URL = 'https://login.salesforce.com';
export const SANDBOX_LOGIN_URL = 'https://test.salesforce.com';

export function getLoginUrl(isSandbox: boolean): string {
  return isSandbox ? SANDBOX_LOGIN_URL : PRODUCTION_LOGIN_URL;
}

// Auth server timeout (5 minutes) — prevents port from being held indefinitely
export const AUTH_SERVER_TIMEOUT_MS = 5 * 60 * 1000;
