/**
 * StatusBarProvider — shows open / critical issue counts in the status bar.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import {
    CONFIG_SECTION,
    CFG_SHOW_STATUS_BAR,
    STATUS_BAR_PRIORITY,
} from '../constants';

export class StatusBarProvider {
    private readonly item: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly service: IssueService) {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            STATUS_BAR_PRIORITY
        );
        this.item.command = 'vetspresso-issues.openDashboard';
        this.item.name = 'Issues Tracker';

        this.update();

        this.disposables.push(
            this.service.onIssueChanged(() => this.update()),
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration(`${CONFIG_SECTION}.${CFG_SHOW_STATUS_BAR}`)) {
                    this.update();
                }
            })
        );
    }

    update(): void {
        const enabled = vscode.workspace
            .getConfiguration(CONFIG_SECTION)
            .get<boolean>(CFG_SHOW_STATUS_BAR, true);

        if (!enabled) {
            this.item.hide();
            return;
        }

        const open = this.service.getOpenCount();
        const critical = this.service.getCriticalCount();

        this.item.text = critical > 0
            ? `$(issues) ${open} issues ($(error) ${critical} critical)`
            : `$(issues) ${open} open`;

        this.item.tooltip = new vscode.MarkdownString(
            '**Issues Tracker**\n\n' +
            `Open: **${open}**\n\nCritical: **${critical}**\n\n` +
            '_Click to open dashboard_'
        );

        this.item.backgroundColor =
            critical > 0
                ? new vscode.ThemeColor('statusBarItem.errorBackground')
                : undefined;

        this.item.show();
    }

    dispose(): void {
        this.item.dispose();
        this.disposables.forEach((d) => { d.dispose(); });
    }
}
