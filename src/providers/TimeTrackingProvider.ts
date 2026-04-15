/**
 * TimeTrackingProvider — TreeDataProvider for the Time Tracking sidebar view.
 * Shows a per-assignee / per-issue summary of logged and estimated hours.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import { Issue, TimeEntry } from '../types';
import { shortDate } from '../utils/helpers';

export class TimeTrackingProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly service: IssueService) {
        this.service.onIssueChanged(() => this._onDidChangeTreeData.fire());
    }

    refresh(): void { this._onDidChangeTreeData.fire(); }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!element) {
            return this.buildSummary();
        }
        if (element instanceof IssueTimeItem) {
            return element.issue.timeEntries.map((e) => new TimeEntryItem(e));
        }
        return [];
    }

    private buildSummary(): vscode.TreeItem[] {
        const issues = this.service.getIssues().filter((i) => i.timeEntries.length > 0);
        if (issues.length === 0) {
            const empty = new vscode.TreeItem('No time logged yet');
            empty.iconPath = new vscode.ThemeIcon('info');
            return [empty];
        }

        const items: vscode.TreeItem[] = [];

        // Summary header
        const totalLogged = issues.reduce(
            (sum, i) => sum + i.timeEntries.reduce((s, e) => s + e.hours, 0),
            0
        );
        const totalEstimated = issues.reduce((sum, i) => sum + (i.estimatedHours ?? 0), 0);
        const summary = new vscode.TreeItem(`Total: ${totalLogged.toFixed(1)}h logged / ${totalEstimated.toFixed(1)}h estimated`);
        summary.iconPath = new vscode.ThemeIcon('clock');
        items.push(summary);

        // Per-issue items
        for (const issue of issues.sort((a, b) => a.sequentialId - b.sequentialId)) {
            items.push(new IssueTimeItem(issue));
        }

        return items;
    }
}

class IssueTimeItem extends vscode.TreeItem {
    constructor(public readonly issue: Issue) {
        const logged = issue.timeEntries.reduce((s, e) => s + e.hours, 0);
        const est = issue.estimatedHours;
        const suffix = est !== null ? `${logged.toFixed(1)}h / ${est.toFixed(1)}h est.` : `${logged.toFixed(1)}h`;

        super(`#${issue.sequentialId} ${issue.title}`, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = suffix;
        this.iconPath = new vscode.ThemeIcon('clock');
        this.id = `time-issue-${issue.id}`;
    }
}

class TimeEntryItem extends vscode.TreeItem {
    constructor(entry: TimeEntry) {
        super(`${shortDate(entry.date)} — ${entry.hours.toFixed(1)}h`);
        this.description = entry.description || undefined;
        this.tooltip = new vscode.MarkdownString(
            `**${entry.author}** on ${shortDate(entry.date)}\n\n**${entry.hours.toFixed(1)} hours**\n\n${entry.description}`
        );
        this.iconPath = new vscode.ThemeIcon('history');
        this.id = `time-entry-${entry.id}`;
    }
}
