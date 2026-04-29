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

/**
 * Resolves the path to the VS Code executable.
 *
 * Set the `VSCODE_PATH` env var to override (useful in CI).
 * Falls back to the default install location on Linux/Windows.
 */
function resolveVscodePath(): string {
    if (process.env['VSCODE_PATH']) {
        return process.env['VSCODE_PATH'];
    }
    // Default: assume `code` is on PATH and use electron launch instead
    // For CI, VSCODE_PATH should be set explicitly.
    if (process.platform === 'win32') {
        return path.join(
            process.env['LOCALAPPDATA'] ?? '',
            'Programs',
            'Microsoft VS Code',
            'Code.exe',
        );
    }
    return '/usr/bin/code';
}

/** Custom test fixtures providing a running VS Code Electron app. */
export const test = base.extend<{ electronApp: ElectronApplication }>({
    // eslint-disable-next-line no-empty-pattern
    electronApp: async ({}, use) => {
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
