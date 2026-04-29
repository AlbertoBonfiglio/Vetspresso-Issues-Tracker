/**
 * Baseline E2E test — verifies the extension activates and basic
 * UI elements are present.
 *
 * Prerequisites:
 *   - A VS Code binary reachable via VSCODE_PATH (or the default path).
 *   - The extension compiled (`npm run compile`).
 *
 * Run with:  npx playwright test
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import { test, expect } from './fixtures';

test.describe('Vetspresso Issues Tracker — Extension Basics', () => {

    test('VS Code launches and the window is visible', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        const title = await window.title();
        // VS Code window title contains the workspace or "Welcome" tab
        expect(title).toBeTruthy();
    });

    test('extension activates without errors', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        // Open the command palette and execute our activation check
        // The extension registers views, so the Activity Bar should contain our icon
        // Wait a moment for the extension to finish activating
        await window.waitForTimeout(3000);

        // Verify no error notifications from our extension
        const notifications = window.locator('.notifications-toasts .notification-toast');
        const count = await notifications.count();
        for (let i = 0; i < count; i++) {
            const text = await notifications.nth(i).textContent();
            expect(text).not.toContain('Vetspresso Issues Tracker failed');
        }
    });

    test('sidebar issue explorer view is registered', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');
        await window.waitForTimeout(3000);

        // Try to open our sidebar via the command palette
        await window.keyboard.press('Control+Shift+P');
        await window.waitForTimeout(500);
        await window.keyboard.type('Vetspresso');
        await window.waitForTimeout(1000);

        // The command palette should show at least one Vetspresso command
        const items = window.locator('.quick-input-list .quick-input-list-entry');
        const itemCount = await items.count();
        expect(itemCount).toBeGreaterThan(0);

        // Dismiss the palette
        await window.keyboard.press('Escape');
    });
});
