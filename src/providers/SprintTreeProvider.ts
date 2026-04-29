/**
 * SprintTreeProvider — TreeDataProvider for the Sprints sidebar view.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import type { Sprint } from '../types';
import { shortDate } from '../utils/helpers';
import { CTX_SPRINT, CTX_ISSUE } from '../constants';

const SPRINT_ICON: Record<Sprint['status'], string> = {
    planned: 'clock',
    active: 'sync',
    completed: 'check',
    cancelled: 'circle-slash',
};

/** Tree item representing a sprint in the sidebar view. */
export class SprintTreeItem extends vscode.TreeItem {
    constructor(
        public readonly sprint: Sprint,
        issueCount: number,
        openCount: number
    ) {
        super(sprint.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = CTX_SPRINT;
        this.iconPath = new vscode.ThemeIcon(SPRINT_ICON[sprint.status]);
        this.id = `sprint-${sprint.id}`;
        this.description = `${sprint.status} · ${openCount}/${issueCount}`;

        const lines: string[] = [`**${sprint.name}** _(${sprint.status})_`];
        if (sprint.startDate) { lines.push(`**Start:** ${shortDate(sprint.startDate)}`); }
        if (sprint.endDate) { lines.push(`**End:** ${shortDate(sprint.endDate)}`); }
        if (sprint.description) { lines.push('', sprint.description); }
        this.tooltip = new vscode.MarkdownString(lines.join('\n'));
    }
}

/** Tree item representing an issue nested under a sprint. */
export class SprintIssueItem extends vscode.TreeItem {
    constructor(sequentialId: number, title: string, issueId: string) {
        super(`#${sequentialId} ${title}`, vscode.TreeItemCollapsibleState.None);
        this.contextValue = CTX_ISSUE;
        this.id = `sprint-issue-${issueId}`;
        this.command = {
            command: 'vetspresso-issues.viewIssue',
            title: 'View Issue',
            arguments: [{ id: issueId }],
        };
    }
}

/** TreeDataProvider for the Sprints sidebar view. */
export class SprintTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly service: IssueService) {
        this.service.onMetaChanged(() => this._onDidChangeTreeData.fire());
        this.service.onIssueChanged(() => this._onDidChangeTreeData.fire());
    }

    refresh(): void { this._onDidChangeTreeData.fire(); }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem { return element; }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!element) {
            return this.buildSprintList();
        }
        if (element instanceof SprintTreeItem) {
            return this.buildSprintIssues(element.sprint.id);
        }
        return [];
    }

    private buildSprintList(): SprintTreeItem[] {
        const sprints = this.service.getSprints();
        const allIssues = this.service.getIssues();

        return sprints
            .sort((a, b) => {
                // Active sprints first, then planned, then completed
                const order: Record<Sprint['status'], number> = { active: 0, planned: 1, completed: 2, cancelled: 3 };
                return order[a.status] - order[b.status];
            })
            .map((s) => {
                const issues = allIssues.filter((i) => i.sprintId === s.id);
                const open = issues.filter((i) => ['open', 'in-progress', 'in-review', 'on-hold'].includes(i.status)).length;
                return new SprintTreeItem(s, issues.length, open);
            });
    }

    private buildSprintIssues(sprintId: string): SprintIssueItem[] {
        return this.service
            .getIssues()
            .filter((i) => i.sprintId === sprintId)
            .sort((a, b) => a.sequentialId - b.sequentialId)
            .map((i) => new SprintIssueItem(i.sequentialId, i.title, i.id));
    }
}
