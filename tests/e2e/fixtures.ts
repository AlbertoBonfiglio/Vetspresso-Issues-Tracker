/**
 * Shared fixtures for VS Code extension E2E tests.
 *
 * Provides a pre-configured Electron app instance pointing at
 * a VS Code installation with the extension under test loaded.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import { test as base, type ElectronApplication, _electron as electron } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Resolves the path to the VS Code executable.
 *
 * Set the `VSCODE_PATH` env var to override (useful in CI).
 * Falls back to the default install location on Linux/Windows.
 *
 * @throws Error if VS Code cannot be found.
 */
function resolveVscodePath(): string {
    if (process.env['VSCODE_PATH']) {
        const customPath = process.env['VSCODE_PATH'];
        if (fs.existsSync(customPath)) {
            return customPath;
        }
        throw new Error(`VSCODE_PATH set to ${customPath} but file does not exist`);
    }
    // Default: assume `code` is on PATH
    // For CI, VSCODE_PATH should be set explicitly.
    if (process.platform === 'win32') {
        const winPath = path.join(
            process.env['LOCALAPPDATA'] ?? '',
            'Programs',
            'Microsoft VS Code',
            'Code.exe',
        );
        if (fs.existsSync(winPath)) {
            return winPath;
        }
        throw new Error(`VS Code not found at ${winPath}. Set VSCODE_PATH env var.`);
    }
    if (fs.existsSync('/usr/bin/code')) {
        return '/usr/bin/code';
    }
    if (fs.existsSync('/usr/local/bin/code')) {
        return '/usr/local/bin/code';
    }
    throw new Error(
        'VS Code not found on PATH. Set VSCODE_PATH env var to the VS Code executable, ' +
        'e.g., export VSCODE_PATH=/usr/bin/code or VSCODE_PATH=/path/to/Code.exe'
    );
}

/** Custom test fixtures providing a running VS Code Electron app. */
export const test = base.extend<{ electronApp: ElectronApplication }>({
    // eslint-disable-next-line no-empty-pattern
    electronApp: async ({}, use) => {
        // Allow skipping E2E tests when VS Code is not available
        if (process.env['SKIP_E2E']) {
            test.skip(true, 'E2E tests skipped via SKIP_E2E env var');
        }

        const extensionPath = path.resolve(__dirname, '..', '..');
        const vscodePath = resolveVscodePath();

        const app = await electron.launch({
            executablePath: vscodePath,
            args: [
                '--extensionDevelopmentPath=' + extensionPath,
                '--disable-extensions', // disable all other extensions
                '--new-window',
                '--skip-welcome',
                '--skip-release-notes',
                '--disable-gpu',
            ],
            env: {
                ...process.env,
                // Speed up startup
                NODE_ENV: 'test',
            },
        });

        await use(app);
        await app.close();
    },
});

export { expect } from '@playwright/test';
