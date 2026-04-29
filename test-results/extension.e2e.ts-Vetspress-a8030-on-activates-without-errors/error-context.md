# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: extension.e2e.ts >> Vetspresso Issues Tracker — Extension Basics >> extension activates without errors
- Location: tests/e2e/extension.e2e.ts:27:9

# Error details

```
Error: electron.launch: Failed to launch: Error: spawn /usr/bin/code ENOENT
Call log:
  - <launching> /usr/bin/code --no-sandbox --inspect=0 --remote-debugging-port=0 --extensionDevelopmentPath=/home/darthbert/workspaces/vetspresso.vscode.issues --disable-extensions --new-window --skip-welcome --skip-release-notes --disable-gpu
  - [pid=N/A] starting temporary directories cleanup
  - [pid=N/A] finished temporary directories cleanup

```

# Test source

```ts
  1  | /**
  2  |  * Shared fixtures for VS Code extension E2E tests.
  3  |  *
  4  |  * Provides a pre-configured Electron app instance pointing at
  5  |  * a VS Code installation with the extension under test loaded.
  6  |  *
  7  |  * © 2024 Vetspresso — Alberto L. Bonfiglio
  8  |  * AGPL-3.0-only
  9  |  */
  10 | 
  11 | import { test as base, type ElectronApplication, _electron as electron } from '@playwright/test';
  12 | import * as path from 'path';
  13 | 
  14 | /**
  15 |  * Resolves the path to the VS Code executable.
  16 |  *
  17 |  * Set the `VSCODE_PATH` env var to override (useful in CI).
  18 |  * Falls back to the default install location on Linux/Windows.
  19 |  */
  20 | function resolveVscodePath(): string {
  21 |     if (process.env['VSCODE_PATH']) {
  22 |         return process.env['VSCODE_PATH'];
  23 |     }
  24 |     // Default: assume `code` is on PATH and use electron launch instead
  25 |     // For CI, VSCODE_PATH should be set explicitly.
  26 |     if (process.platform === 'win32') {
  27 |         return path.join(
  28 |             process.env['LOCALAPPDATA'] ?? '',
  29 |             'Programs',
  30 |             'Microsoft VS Code',
  31 |             'Code.exe',
  32 |         );
  33 |     }
  34 |     return '/usr/bin/code';
  35 | }
  36 | 
  37 | /** Custom test fixtures providing a running VS Code Electron app. */
  38 | export const test = base.extend<{ electronApp: ElectronApplication }>({
  39 |     // eslint-disable-next-line no-empty-pattern
  40 |     electronApp: async ({}, use) => {
  41 |         const extensionPath = path.resolve(__dirname, '..', '..');
  42 |         const vscodePath = resolveVscodePath();
  43 | 
> 44 |         const app = await electron.launch({
     |                     ^ Error: electron.launch: Failed to launch: Error: spawn /usr/bin/code ENOENT
  45 |             executablePath: vscodePath,
  46 |             args: [
  47 |                 '--extensionDevelopmentPath=' + extensionPath,
  48 |                 '--disable-extensions', // disable all other extensions
  49 |                 '--new-window',
  50 |                 '--skip-welcome',
  51 |                 '--skip-release-notes',
  52 |                 '--disable-gpu',
  53 |             ],
  54 |             env: {
  55 |                 ...process.env,
  56 |                 // Speed up startup
  57 |                 NODE_ENV: 'test',
  58 |             },
  59 |         });
  60 | 
  61 |         await use(app);
  62 |         await app.close();
  63 |     },
  64 | });
  65 | 
  66 | export { expect } from '@playwright/test';
  67 | 
```