/**
 * Playwright configuration for VS Code extension E2E tests.
 *
 * Uses the Electron-based VS Code instance with the extension loaded.
 * Tests run headless by default; set `HEADED=1` to watch.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.e2e.ts',
    timeout: 60_000,
    retries: 0,
    workers: 1, // VS Code E2E tests must run serially
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        // Playwright traces on failure help debug CI issues
        trace: 'on-first-retry',
    },
});
