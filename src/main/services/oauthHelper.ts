/**
 * Shared OAuth utility — Authorization Code + PKCE via embedded BrowserWindow.
 *
 * Opens a controlled Salesforce login window with PKCE (S256), auto-closes on
 * success, and includes a server timeout. Keeps the app self-contained.
 *
 * Used by both primary login (port 1717) and target-org login (port 1718).
 */

import * as crypto from 'crypto';
import * as http from 'http';
import * as url from 'url';
import { BrowserWindow } from 'electron';
import {
  OAUTH_SCOPES,
  AUTH_SERVER_TIMEOUT_MS,
  getLoginUrl,
} from './oauthConstants';

export interface OAuthResult {
  accessToken: string;
  refreshToken: string;
  instanceUrl: string;
  userId: string;
  organizationId: string;
  username: string;
}

export interface OAuthOptions {
  isSandbox: boolean;
  clientId: string;
  callbackUrl: string;
  port: number;
}

// ─── PKCE helpers ────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  // 32 random bytes → 43-char base64url string (RFC 7636 recommends 43–128)
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// ─── OAuth HTML responses ────────────────────────────────────────────────────

const SUCCESS_HTML = `
<html>
  <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1e1f22; color: #dbdee1;">
    <h2>✅ Authentication Successful!</h2>
    <p>This window will close automatically…</p>
  </body>
</html>`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function errorHtml(message: string): string {
  return `
<html>
  <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background: #1e1f22; color: #dbdee1;">
    <h2>Authentication Failed</h2>
    <p>${escapeHtml(message)}</p>
    <p>You can close this window.</p>
  </body>
</html>`;
}

// ─── Main OAuth flow ─────────────────────────────────────────────────────────

/**
 * Runs the full OAuth 2.0 Authorization Code + PKCE flow:
 *
 * 1. Generates PKCE code_verifier + code_challenge
 * 2. Starts a local HTTP server on `options.port` for the callback
 * 3. Opens a BrowserWindow with the Salesforce authorize URL
 * 4. Receives the auth code, exchanges it for tokens (with code_verifier)
 * 5. Calls /services/oauth2/userinfo to get identity
 * 6. Auto-closes the window and returns the tokens + identity
 */
export function performOAuthFlow(options: OAuthOptions): Promise<OAuthResult> {
  const { isSandbox, clientId, callbackUrl, port } = options;
  const loginUrl = getLoginUrl(isSandbox);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  return new Promise((resolve, reject) => {
    let server: http.Server | null = null;
    let authWindow: BrowserWindow | null = null;
    let resolved = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (server) {
        server.close();
        server = null;
      }
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
        authWindow = null;
      }
    };

    const fail = (err: Error) => {
      cleanup();
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    };

    // ── Local callback server ──────────────────────────────────────────────

    server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);
        if (parsedUrl.pathname !== '/OauthRedirect') return;

        // Check for error from Salesforce
        if (parsedUrl.query.error) {
          const errorDesc = String(parsedUrl.query.error_description || parsedUrl.query.error);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(errorHtml(errorDesc));
          fail(new Error(errorDesc));
          return;
        }

        const code = parsedUrl.query.code as string;
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(errorHtml('No authorization code received.'));
          return;
        }

        // Return success page immediately so the browser tab shows feedback
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(SUCCESS_HTML);

        // ── Exchange code for tokens (with PKCE code_verifier) ──────────

        const tokenUrl = `${loginUrl}/services/oauth2/token`;
        const tokenResponse = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            redirect_uri: callbackUrl,
            code_verifier: codeVerifier,
          }),
        });

        const tokenData = (await tokenResponse.json()) as {
          error?: string;
          error_description?: string;
          access_token?: string;
          refresh_token?: string;
          instance_url?: string;
        };

        if (tokenData.error) {
          fail(new Error(tokenData.error_description || tokenData.error));
          return;
        }

        const accessToken = tokenData.access_token!;
        const refreshToken = tokenData.refresh_token || '';
        const instanceUrl = tokenData.instance_url!;

        // ── Get user identity ───────────────────────────────────────────

        const identityResponse = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!identityResponse.ok) {
          fail(new Error('Failed to fetch user identity'));
          return;
        }

        const identity = (await identityResponse.json()) as {
          user_id: string;
          organization_id: string;
          preferred_username: string;
        };

        // Resolve immediately so the app can continue
        if (!resolved) {
          resolved = true;

          // Close the server & timeout right away
          if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
          if (server) { server.close(); server = null; }

          // Auto-close the auth window after a brief delay
          // so the user sees the success message
          setTimeout(() => {
            if (authWindow && !authWindow.isDestroyed()) {
              authWindow.close();
              authWindow = null;
            }
          }, 1500);

          resolve({
            accessToken,
            refreshToken,
            instanceUrl,
            userId: identity.user_id,
            organizationId: identity.organization_id,
            username: identity.preferred_username,
          });
        }
      } catch (err: any) {
        fail(new Error(err.message || 'Failed to exchange authorization code'));
      }
    });

    // ── Start listening ──────────────────────────────────────────────────

    server.listen(port, 'localhost', () => {
      // Build the authorize URL with PKCE params
      const oauthUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
      oauthUrl.searchParams.set('response_type', 'code');
      oauthUrl.searchParams.set('client_id', clientId);
      oauthUrl.searchParams.set('redirect_uri', callbackUrl);
      oauthUrl.searchParams.set('scope', OAUTH_SCOPES);
      oauthUrl.searchParams.set('code_challenge', codeChallenge);
      oauthUrl.searchParams.set('code_challenge_method', 'S256');

      // Open in an embedded BrowserWindow for a self-contained experience
      authWindow = new BrowserWindow({
        width: 600,
        height: 720,
        show: true,
        title: isSandbox ? 'Salesforce Login (Sandbox)' : 'Salesforce Login',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      authWindow.loadURL(oauthUrl.toString());

      authWindow.on('closed', () => {
        authWindow = null;
        // If the window was closed before auth completed, reject
        if (!resolved) {
          // Give the server handler a moment to finish if the close races
          // with the callback (user closes window right as redirect fires)
          setTimeout(() => {
            if (!resolved) {
              fail(new Error('Authentication window was closed.'));
            }
          }, 500);
        }
      });
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        fail(new Error(`OAuth callback port ${port} is already in use. Please close any other Salesforce tools and try again.`));
      } else {
        fail(err);
      }
    });

    // ── Timeout — don't hold the port forever ────────────────────────────
    timeoutHandle = setTimeout(() => {
      fail(new Error('OAuth login timed out. Please try again.'));
    }, AUTH_SERVER_TIMEOUT_MS);
  });
}

// ─── Token refresh ───────────────────────────────────────────────────────────

/**
 * Refreshes an access token using a stored refresh token.
 * Returns the new access token (and optionally a rotated refresh token).
 */
export async function refreshAccessToken(
  instanceUrl: string,
  refreshToken: string,
  clientId: string,
  isSandbox: boolean
): Promise<{ accessToken: string; refreshToken?: string }> {
  const loginUrl = getLoginUrl(isSandbox);
  const tokenUrl = `${loginUrl}/services/oauth2/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  const data = (await response.json()) as {
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
  };

  if (data.error) {
    throw new Error(data.error_description || data.error);
  }

  return {
    accessToken: data.access_token!,
    // Salesforce may rotate the refresh token
    refreshToken: data.refresh_token || undefined,
  };
}
