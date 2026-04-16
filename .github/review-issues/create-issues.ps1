# Creates labels and GitHub issues from a deep code review.
# Safe to run multiple times (labels use --force; issues are appended).

$ErrorActionPreference = 'Stop'

# --- 1. Labels ---------------------------------------------------------------
$labels = @(
  @{ name='severity:critical';  color='B60205'; desc='Must fix: security or major bug' },
  @{ name='severity:high';      color='D93F0B'; desc='High priority' },
  @{ name='severity:medium';    color='FBCA04'; desc='Medium priority' },
  @{ name='severity:low';       color='0E8A16'; desc='Low priority / nice-to-have' },
  @{ name='area:security';      color='B60205'; desc='Security-related' },
  @{ name='area:code-quality';  color='1D76DB'; desc='Refactoring, type safety, cleanup' },
  @{ name='area:architecture';  color='5319E7'; desc='Architecture & design' },
  @{ name='area:ux-a11y';       color='C5DEF5'; desc='UX and accessibility' },
  @{ name='area:performance';   color='FBCA04'; desc='Performance' },
  @{ name='area:devops';        color='0052CC'; desc='Build, CI/CD, packaging' },
  @{ name='area:docs';          color='0075CA'; desc='Documentation' },
  @{ name='area:testing';       color='BFD4F2'; desc='Tests & coverage' }
)

Write-Host "Creating/updating labels..." -ForegroundColor Cyan
foreach ($l in $labels) {
  gh label create $l.name --color $l.color --description $l.desc --force | Out-Null
  Write-Host "  - $($l.name)"
}

# --- 2. Issues ---------------------------------------------------------------
# Each issue: Title, Body, Labels (comma-separated)
$issues = @(
  @{
    title = '[SECURITY] Weak Content Security Policy allows unsafe-inline'
    labels = 'severity:critical,area:security'
    body = @'
### Problem
`src/renderer/index.html` line 6 sets CSP:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
```

`'unsafe-inline'` on both `script-src` and `style-src` neutralizes most of the XSS protection CSP is meant to provide. Any HTML injected into the renderer (e.g. via a Salesforce field value that gets rendered as HTML) could execute arbitrary JS.

### Fix
- Drop `'unsafe-inline'` from `script-src`. Vite builds emit only hashed/bundled JS, so none is needed.
- For styles, either drop `'unsafe-inline'` (use CSS Modules / precompiled Tailwind output only) or move to nonce-based CSP.
- Add `object-src 'none'; base-uri 'self'; frame-ancestors 'none'`.
- Audit the renderer for `dangerouslySetInnerHTML` usage.

### Files
- `src/renderer/index.html`
'@
  },
  @{
    title = '[SECURITY] Missing setWindowOpenHandler / navigation hardening on BrowserWindow'
    labels = 'severity:critical,area:security'
    body = @'
### Problem
`src/main/main.ts` creates `mainWindow` but never configures:

- `webContents.setWindowOpenHandler` — renderer can call `window.open(...)` and Electron will spawn a new `BrowserWindow` with inherited privileges.
- `will-navigate` / `will-redirect` guards — a malicious link can navigate the main window away from the app bundle.
- `web-contents-created` hardening for child webviews.

### Fix
```ts
mainWindow.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url); // or return { action: 'deny' }
  return { action: 'deny' };
});

mainWindow.webContents.on('will-navigate', (event, url) => {
  const isDevUrl = isDev && url.startsWith('http://localhost:5173');
  if (!isDevUrl) event.preventDefault();
});
```

Also consider enabling `sandbox: true` in `webPreferences` after auditing preload for Node API usage.

### Files
- `src/main/main.ts`
'@
  },
  @{
    title = '[SECURITY] electron-store used without explicit encryptionKey for credentials'
    labels = 'severity:critical,area:security'
    body = @'
### Problem
`src/main/services/credentials.ts`, `queries.ts`, `queryHistory.ts`, `apexScripts.ts` instantiate `new Store({...})` without `encryptionKey`. Without a key, electron-store writes **plaintext JSON** to `userData`.

The app does call `safeStorage.encryptString` for credential fields on supported platforms, but:
- On Linux without a DBus keyring, `safeStorage` falls back to base64 (`safeStorage.getSelectedStorageBackend() === 'basic_text'`).
- Non-credential stores (queries/history/apex) hold SOQL + script bodies that may contain PII and are never encrypted.

### Fix
- Always pass `encryptionKey` to electron-store as defense-in-depth.
- Call `safeStorage.isEncryptionAvailable()` and refuse to save credentials if it returns false, OR warn the user.
- Document the storage path and encryption model in README.

### Files
- `src/main/services/credentials.ts`
- `src/main/services/queries.ts`
- `src/main/services/queryHistory.ts`
- `src/main/services/apexScripts.ts`
'@
  },
  @{
    title = '[SECURITY] No input validation / schema validation on IPC handlers'
    labels = 'severity:critical,area:security,area:architecture'
    body = @'
### Problem
Every IPC handler in `src/main/main.ts` trusts its payload:

- `objectName: string` is forwarded to `describeObject` with no whitelist.
- `query: string` passes through to `jsforce.query()` unchecked.
- `fields: Record<string, any>` for `updateRecord` is spread directly into the update call.
- `filename: string` in `exportToCsv` is used for the default save-dialog name.
- OAuth `clientId` is accepted from the renderer.

A compromised renderer (or a prompt-injected value flowing through the UI) can call any handler with arbitrary inputs.

### Fix
- Introduce `zod` (or `ajv`) schemas for every IPC payload and validate at the main-process boundary.
- Fail closed: reject malformed input, never coerce silently.
- Whitelist `objectName` against the cached describeGlobal result.
- Sanitize `filename` (strip path separators, enforce `.csv`).

### Files
- `src/main/main.ts`
- `src/main/preload.ts`
'@
  },
  @{
    title = '[SECURITY] OAuth flow missing state parameter (CSRF)'
    labels = 'severity:high,area:security'
    body = @'
### Problem
`src/main/services/oauthHelper.ts` implements PKCE (good) but does not generate or validate a `state` parameter. RFC 6749 §10.12 requires `state` to bind the authorization request to the callback and prevent CSRF / code-injection on the localhost listener.

### Fix
- Generate a cryptographically random `state` per flow.
- Append `&state=<value>` to the authorization URL.
- Verify the returned `state` matches before exchanging the code.
- While here, also verify `iss` if Salesforce returns it.

### Files
- `src/main/services/oauthHelper.ts`
- `src/main/services/oauthConstants.ts`
'@
  },
  @{
    title = '[SECURITY] OAuth localhost listener binds to fixed ports (1717/1718)'
    labels = 'severity:medium,area:security'
    body = @'
### Problem
`oauthConstants.ts` hardcodes redirect URIs to `http://localhost:1717` / `1718`. Any other local process can squat on those ports between invocations and intercept the authorization code (especially on multi-user machines).

### Fix
- Bind to port `0`, read back the OS-assigned port, and build the redirect URI dynamically.
- Keep a short list of pre-registered redirect URIs in the connected app to satisfy Salesforce's exact-match requirement (e.g. register a range 49152-49252 and try them in order).
- Bind only to `127.0.0.1`, never `0.0.0.0`.

### Files
- `src/main/services/oauthHelper.ts`
- `src/main/services/oauthConstants.ts`
'@
  },
  @{
    title = '[SECURITY] Unvalidated file path in CSV export'
    labels = 'severity:high,area:security'
    body = @'
### Problem
`src/main/services/salesforce.ts` writes CSV via `fs.writeFileSync(filePath, ...)` using the path returned from `dialog.showSaveDialog`. While that dialog is user-driven today, the IPC signature (`exportToCsv(data, filename)`) accepts a filename from the renderer and no path normalisation is applied — a future refactor or a compromised renderer could inject `..` or UNC paths.

### Fix
- Always call `dialog.showSaveDialog` inside the main process; do not accept full paths from the renderer.
- Use `path.basename(filename).replace(/[^\w.-]/g, '_')` before passing as `defaultPath`.
- Reject writes outside `app.getPath('downloads')` / `documents` unless the user explicitly chose elsewhere via dialog.

### Files
- `src/main/services/salesforce.ts`
- `src/main/main.ts`
'@
  },
  @{
    title = '[SECURITY] Outdated Electron (28.x) and jsforce (3.6) — missing ~1 year of patches'
    labels = 'severity:high,area:security,area:devops'
    body = @'
### Problem
`package.json` pins `electron: ^28.0.0` (Nov 2023) and `jsforce: ^3.6.0`. Both have had security/bug releases since. Electron 28 is out of the supported-versions window.

### Fix
- Update to the latest stable Electron (33.x at time of writing) and the latest jsforce.
- Run `npm audit --production` and address high/critical advisories.
- Add Dependabot / Renovate config to keep this current.

### Files
- `package.json`
- `package-lock.json`
'@
  },
  @{
    title = '[SECURITY] Preload exposes broad electronAPI surface with no capability gating'
    labels = 'severity:medium,area:security,area:architecture'
    body = @'
### Problem
`src/main/preload.ts` hands the renderer a single `electronAPI` object exposing every Salesforce, Apex, migration and credentials operation. Even with `contextIsolation: true`, any XSS in the renderer yields full account takeover (execute Apex, migrate records, read saved credentials metadata).

### Fix
- Split the API by surface (`loginAPI`, `queryAPI`, `migrationAPI`) and expose only what the current page needs (wire up per-window).
- For destructive ops (bulk migration, delete, Apex execute), require a main-process confirmation dialog — do not rely on renderer-side confirms.
- Consider `sandbox: true` + narrowed preload.

### Files
- `src/main/preload.ts`
- `src/main/main.ts`
'@
  },
  @{
    title = '[SECURITY] No app.setName / userData path; startup logs leak file paths'
    labels = 'severity:medium,area:security,area:devops'
    body = @'
### Problem
- `app.setName()` / `app.setPath('userData', ...)` are never called. Data lands in a directory derived from `package.json "name"` (`salesforce-query-tool`), which is inconsistent with the product name on disk and complicates support.
- `main.ts` logs `__dirname` and `isDev` on every launch. These strings end up in user-shared logs and leak install paths/usernames.

### Fix
```ts
app.setName('Salesforce Query Tool');
app.setPath('userData', path.join(app.getPath('appData'), 'SalesforceQueryTool'));
```
- Gate startup logging behind `process.env.SFQT_DEBUG`.

### Files
- `src/main/main.ts`
'@
  },
  @{
    title = '[DEVOPS] No auto-updater configured'
    labels = 'severity:high,area:devops,area:security'
    body = @'
### Problem
No `electron-updater` integration. Users must manually re-download installers from GitHub releases, so security fixes will not reach most of the install base.

### Fix
- Add `electron-updater` and wire `autoUpdater.checkForUpdatesAndNotify()` into `app.whenReady`.
- Publish update feeds from the existing GitHub Actions workflow (`electron-builder --publish always`).
- Require signed releases (see code-signing issue) so the updater will verify them.

### Files
- `src/main/main.ts`
- `.github/workflows/build.yml`
- `package.json` (build.publish)
'@
  },
  @{
    title = '[DEVOPS] CI builds are unsigned (Windows & macOS)'
    labels = 'severity:medium,area:devops,area:security'
    body = @'
### Problem
`.github/workflows/build.yml` builds installers but does not code-sign them. Windows users see SmartScreen warnings, macOS users cannot open the app without right-click → Open, and auto-updates cannot be verified.

### Fix
- Windows: add `CSC_LINK` (base64 PFX) + `CSC_KEY_PASSWORD` secrets; electron-builder picks them up automatically.
- macOS: add `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` and enable notarization (`notarize: true`).
- Document the release process in `BUILD.md`.

### Files
- `.github/workflows/build.yml`
- `BUILD.md`
'@
  },
  @{
    title = '[DEVOPS] Missing LICENSE file despite MIT declaration'
    labels = 'severity:high,area:devops,area:docs'
    body = @'
### Problem
`package.json` declares `"license": "MIT"` but there is no `LICENSE` file at the repo root. Without the file, the license declaration is legally ambiguous and most license scanners (Black Duck, FOSSA, GitHub itself) will flag it as unlicensed.

### Fix
- Add a `LICENSE` file containing the MIT license text with the correct copyright holder and year.
- Mention the license in the README footer.

### Files
- `LICENSE` (new)
'@
  },
  @{
    title = '[DEVOPS] Placeholder author / maintainer strings in package.json'
    labels = 'severity:high,area:devops,area:docs'
    body = @'
### Problem
```json
"author": "Your Name",
...
"linux": { "maintainer": "your-email@example.com" }
```
These placeholders ship into the built `.deb` / `.rpm` metadata and Windows installer properties.

### Fix
Replace with real maintainer name and email before the next release; consider reading them from env vars in CI so forks do not have to edit source.

### Files
- `package.json`
'@
  },
  @{
    title = '[DEVOPS] Add CONTRIBUTING.md and SECURITY.md'
    labels = 'severity:low,area:docs,area:devops'
    body = @'
### Problem
No `CONTRIBUTING.md` (how to set up, run tests, open PRs) and no `SECURITY.md` (responsible disclosure process). Security researchers have no private channel to report the issues in this review.

### Fix
- Add `CONTRIBUTING.md` with dev setup, coding style, test/PR expectations.
- Add `SECURITY.md` with a dedicated mailbox (e.g. `security@...`) and disclosure timeline.
- GitHub surfaces these automatically in the repo UI.

### Files
- `CONTRIBUTING.md` (new)
- `SECURITY.md` (new)
'@
  },
  @{
    title = '[DOCS] README missing Security & Privacy section'
    labels = 'severity:low,area:docs'
    body = @'
### Problem
The README markets features but does not tell users:
- Where credentials are stored (`app.getPath(''userData'')`).
- That credential fields are encrypted via `safeStorage` (when available) and that queries/history are plaintext.
- That the app makes no outbound calls except to Salesforce.

### Fix
Add a "Security & Privacy" section covering storage locations per OS, encryption model, telemetry (none), and how to wipe local data.

### Files
- `README.md`
'@
  },
  @{
    title = '[CODE-QUALITY] Debug console.log left in production renderer'
    labels = 'severity:high,area:code-quality'
    body = @'
### Problem
- `src/renderer/App.tsx` lines ~82–85 dump the full `settings` object every render.
- `src/renderer/pages/LoginPage.tsx` lines ~223–230 and ~244–251 log credential/OAuth edit payloads (labels, usernames).

These spam the devtools console, measurably slow renders (deep serialization of settings), and can leak PII if users share logs.

### Fix
- Delete the debug logs.
- If logging is genuinely useful for diagnostics, introduce a small `debug(category, ...args)` helper gated on `import.meta.env.DEV`.

### Files
- `src/renderer/App.tsx`
- `src/renderer/pages/LoginPage.tsx`
'@
  },
  @{
    title = '[CODE-QUALITY] Replace catch (error: any) with typed error handling'
    labels = 'severity:high,area:code-quality'
    body = @'
### Problem
Every IPC handler in `src/main/main.ts` (and many services) uses `catch (error: any) { return { success: false, error: error.message } }`. If a non-Error is thrown (e.g. a string), `error.message` is `undefined` and the renderer shows a blank error.

### Fix
Standardise on:
```ts
catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { success: false, error: message };
}
```
Add an ESLint rule (`@typescript-eslint/no-explicit-any`) to keep this from regressing.

### Files
- `src/main/main.ts`
- `src/main/services/*.ts`
'@
  },
  @{
    title = '[CODE-QUALITY] Add React error boundaries'
    labels = 'severity:high,area:code-quality,area:ux-a11y'
    body = @'
### Problem
The renderer has no `<ErrorBoundary>`. An exception in any child (common during field-metadata access or CSV flattening) crashes the tree to a white screen with no recovery path.

### Fix
- Add a top-level `ErrorBoundary` in `App.tsx` with a friendly fallback + "Reload" button.
- Wrap each modal (Migration, Apex, Settings) in its own boundary so modal errors do not blank the whole app.
- Report caught errors via IPC to a main-process log file.

### Files
- `src/renderer/App.tsx`
- `src/renderer/components/*Modal.tsx`
'@
  },
  @{
    title = '[CODE-QUALITY] Standardise IPC response envelope'
    labels = 'severity:medium,area:code-quality,area:architecture'
    body = @'
### Problem
Most handlers return `{ success, data?, error? }` but a few return raw data or throw. Renderer code has to special-case each one, which is error-prone.

### Fix
- Define `type IpcResult<T> = { success: true; data: T } | { success: false; error: string }` in a shared file.
- Wrap every handler with a small helper `handle(fn)` that converts throws/rejects into the envelope.
- Update renderer call sites to use a discriminated-union check.

### Files
- `src/main/main.ts`
- `src/renderer/types/electron.d.ts`
'@
  },
  @{
    title = '[CODE-QUALITY] Break up oversized components (ResultsTable, MigrationModal, LoginPage, MainPage)'
    labels = 'severity:medium,area:code-quality'
    body = @'
### Problem
- `ResultsTable.tsx` — ~700 lines, 9 `useState`, in-cell editing + sorting + selection + migration entry point.
- `RecordMigrationModal.tsx` — ~600 lines, multi-step wizard with deeply nested state.
- `MainPage.tsx` — ~300 lines, 11 `useState`, orchestrates objects, queries, Apex.
- `LoginPage.tsx` — ~500 lines, 17 `useState`, OAuth + saved logins + metadata editing.

These are hard to read, hard to test, and re-render on any slice of state changing.

### Fix
- Extract `EditableCell`, `ColumnHeader`, `SavedLoginList`, `RelationshipConfigurator`.
- Lift state into custom hooks (`useResultsTable`, `useMigrationWizard`, `useLoginForm`).
- Prefer `useReducer` where there are >5 related `useState`s.

### Files
- `src/renderer/components/ResultsTable.tsx`
- `src/renderer/components/RecordMigrationModal.tsx`
- `src/renderer/pages/MainPage.tsx`
- `src/renderer/pages/LoginPage.tsx`
'@
  },
  @{
    title = '[PERFORMANCE] ResultsTable renders every row (no virtualization)'
    labels = 'severity:medium,area:performance'
    body = @'
### Problem
`ResultsTable` renders a full `<table>` with every row in the DOM. Even a 5k-record query (well within Salesforce quotas) produces tens of thousands of cells and tanks scroll/interaction performance; 50k records can OOM the renderer.

### Fix
- Integrate `@tanstack/react-virtual` or `react-window` so only visible rows mount.
- Alternatively, implement server-side cursor pagination with a "Load more" button capped at e.g. 500 rows per page.
- Memoize `formatValue` and the flattened record array with `useMemo`.

### Files
- `src/renderer/components/ResultsTable.tsx`
'@
  },
  @{
    title = '[PERFORMANCE] Insufficient memoization in hot render paths'
    labels = 'severity:medium,area:performance,area:code-quality'
    body = @'
### Problem
- `getFieldMetadata` in `ResultsTable.tsx` is a `useCallback` but is invoked per cell per render.
- `formatValue` is redefined each render.
- The flattened-results array is rebuilt every render even when `results` are unchanged.

### Fix
- Wrap `formatValue` in `useCallback` with stable deps.
- Memoize the flattened/sorted rows with `useMemo`.
- Precompute a `Map<string, FieldMetadata>` once per describe.

### Files
- `src/renderer/components/ResultsTable.tsx`
- `src/renderer/components/QueryBuilder.tsx`
'@
  },
  @{
    title = '[ARCHITECTURE] Singleton services in main.ts make testing hard'
    labels = 'severity:medium,area:architecture'
    body = @'
### Problem
`src/main/main.ts` instantiates `SalesforceService`, `CredentialsStore`, `QueriesStore`, `QueryHistoryStore`, `ApexScriptsStore`, `OrgConnectionManager` at module scope. There is no seam to replace them in tests; `ipc-handlers.test.ts` has exactly one test as a result.

### Fix
- Introduce a tiny service-locator (plain object) created inside `app.whenReady`.
- Register IPC handlers via `registerIpc(services)` from a separate module.
- Tests can then pass mock services and exercise handler behaviour directly.

### Files
- `src/main/main.ts`
'@
  },
  @{
    title = '[ARCHITECTURE] Add runtime schema validation for electron-store data'
    labels = 'severity:medium,area:architecture,area:code-quality'
    body = @'
### Problem
All electron-store reads assume the shape matches the TypeScript interface. A corrupted file or a new version with migrated fields will silently return `undefined` / wrong types and manifest later as confusing bugs.

### Fix
- Define `zod` schemas for each store (credentials, queries, queryHistory, apexScripts).
- Validate on read; on failure, back up the bad file and reset to defaults with a user-visible notice.
- Use electron-store's `migrations` option to bump versions safely.

### Files
- `src/main/services/credentials.ts`
- `src/main/services/queries.ts`
- `src/main/services/queryHistory.ts`
- `src/main/services/apexScripts.ts`
'@
  },
  @{
    title = '[ARCHITECTURE] Heavy prop drilling in MainPage — consider Context'
    labels = 'severity:medium,area:architecture,area:code-quality'
    body = @'
### Problem
`MainPage` passes 20+ props down to `QueryBuilder`, `ResultsTable`, `ObjectList`. Any refactor of the middle layer triggers cascading prop-type changes, and React re-renders the whole tree even for unrelated updates.

### Fix
- Introduce `QueryContext` (selected object, fields, results, loading) and `ConnectionContext` (current org).
- Keep leaf components pure; they read what they need via hooks.
- Pair with `useReducer` for coherent state transitions.

### Files
- `src/renderer/pages/MainPage.tsx`
- `src/renderer/contexts/` (new contexts)
'@
  },
  @{
    title = '[UX-A11Y] Missing ARIA labels, focus traps, and keyboard navigation'
    labels = 'severity:medium,area:ux-a11y'
    body = @'
### Problem
- Title-bar icon buttons (minimize/maximize/close) have no `aria-label`.
- Modals (`SettingsModal`, `AnonymousApexModal`, `RecordMigrationModal`) do not trap focus and do not restore focus on close.
- Several clickable elements are `<div onClick>` rather than `<button>`, so they are unreachable via Tab.
- Loading overlays lack `role="status"` / `aria-busy`.

### Fix
- Replace click-divs with `<button type="button">`.
- Use `@radix-ui/react-dialog` (or hand-roll a focus-trap hook) for modals.
- Add `aria-label` to icon-only buttons and `aria-live="polite"` for toast/error regions.

### Files
- `src/renderer/components/TitleBar.tsx`
- `src/renderer/components/*Modal.tsx`
- `src/renderer/components/ResultsTable.tsx`
'@
  },
  @{
    title = '[TESTING] Expand test coverage beyond the current single IPC test'
    labels = 'severity:medium,area:testing'
    body = @'
### Problem
- `src/main/__tests__/ipc-handlers.test.ts` contains only one test.
- No tests for `credentials.ts`, `dataMigration.ts`, `oauthHelper.ts`, `salesforce.ts` flatten/export logic.
- Renderer has setup only — no component tests.
- No end-to-end smoke test.

### Fix
- Unit-test the pure helpers (CSV flatten, RecordType mapping, relationship matching) first — highest ROI.
- Add React Testing Library tests for `QueryBuilder`, `ResultsTable`, `RecordMigrationModal` covering the happy path + one error path each.
- Add a Playwright (or Spectron replacement `@playwright/test` with Electron) smoke test: launch app, mock jsforce, assert login → query → results flow.
- Wire `npm test` into CI with a coverage threshold (e.g. 60%).

### Files
- `src/main/__tests__/`
- `src/renderer/__tests__/`
- `.github/workflows/build.yml`
'@
  },
  @{
    title = '[DEVOPS] CI workflow does not run tests or lint, and does not publish releases on tag'
    labels = 'severity:medium,area:devops,area:testing'
    body = @'
### Problem
`.github/workflows/build.yml` builds installers but (per the review) does not:
- Run `npm test` / typecheck on PRs.
- Publish release artifacts automatically on `v*` tag pushes.
- Cache `~/.npm` / Electron binaries — slow CI.

### Fix
- Add a `test` job running on `pull_request` with `npm ci && npm run build && npm test`.
- Add a `release` job triggered on `push: tags: ['v*']` that runs `electron-builder --publish always`.
- Add `actions/cache` for `node_modules` and the Electron download cache.

### Files
- `.github/workflows/build.yml`
'@
  },
  @{
    title = '[CODE-QUALITY] Extract and unit-test CSV flattening logic'
    labels = 'severity:medium,area:code-quality,area:testing'
    body = @'
### Problem
`src/main/services/salesforce.ts` has inline logic to flatten nested jsforce records (dot-notated paths, `attributes` stripping, null/array edge cases). It is intertwined with file-writing and therefore untested.

### Fix
- Extract to `flattenSalesforceRecord(record): Record<string, string>` in a new `src/main/services/csvExport.ts`.
- Cover these cases in tests: nested parent lookup, null relationship, child relationship array, date/datetime formatting, comma/quote escaping.

### Files
- `src/main/services/salesforce.ts`
- `src/main/services/csvExport.ts` (new)
'@
  }
)

# --- 3. Create issues --------------------------------------------------------
Write-Host ""
Write-Host "Creating $($issues.Count) issues..." -ForegroundColor Cyan

$created = @()
foreach ($i in $issues) {
  $tmp = New-TemporaryFile
  Set-Content -Path $tmp -Value $i.body -Encoding UTF8
  try {
    $url = gh issue create --title $i.title --body-file $tmp --label $i.labels
    Write-Host ("  + {0}  ->  {1}" -f $i.title, $url)
    $created += [pscustomobject]@{ Title = $i.title; Url = $url }
  } catch {
    Write-Host "  ! Failed: $($i.title)  $_" -ForegroundColor Red
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "Done. Created $($created.Count)/$($issues.Count) issues." -ForegroundColor Green
$created | Format-Table -AutoSize
