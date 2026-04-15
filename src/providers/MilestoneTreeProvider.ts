/**
 * MilestoneTreeProvider — TreeDataProvider for the Milestones sidebar view.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import { Milestone, IssueStatus } from '../types';
import { shortDate, relativeTime } from '../utils/helpers';
import { CTX_MILESTONE, CTX_ISSUE } from '../constants';

export class MilestoneTreeItem extends vscode.TreeItem {
    constructor(
        public readonly milestone: Milestone,
        issueCount: number,
        openCount: number
    ) {
        super(milestone.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = CTX_MILESTONE;
        this.iconPath = new vscode.ThemeIcon('milestone');
        this.id = `milestone-${milestone.id}`;
        this.description = `${openCount} open / ${issueCount} total`;

        const lines: string[] = [
            `**${milestone.name}**`,
            '',
            milestone.description || '_No description_',
            '',
        ];
        if (milestone.targetDate) {
            lines.push(`**Target date:** ${shortDate(milestone.targetDate)}`);
        }
        if (milestone.completedDate) {
            lines.push(`**Completed:** ${shortDate(milestone.completedDate)}`);
        }
        lines.push(`**Created:** ${relativeTime(milestone.createdAt)}`);
        this.tooltip = new vscode.MarkdownString(lines.join('\n'));
    }
}

export class MilestoneIssueItem extends vscode.TreeItem {
    constructor(sequentialId: number, title: string, issueId: string, status: IssueStatus) {
        super(`#${sequentialId} ${title}`, vscode.TreeItemCollapsibleState.None);
        this.contextValue = CTX_ISSUE;
        this.iconPath = new vscode.ThemeIcon(status === 'resolved' || status === 'closed' ? 'check' : 'circle-outline');
        this.id = `milestone-issue-${issueId}`;
        this.command = {
            command: 'vetspresso-issues.viewIssue',
            title: 'View Issue',
            arguments: [{ id: issueId }],
        };
    }
}

export class MilestoneTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly service: IssueService) {
        this.service.onMetaChanged(() => this._onDidChangeTreeData.fire());
        this.service.onIssueChanged(() => this._onDidChangeTreeData.fire());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!element) {
            return this.buildMilestoneList();
        }
        if (element instanceof MilestoneTreeItem) {
            return this.buildIssueList(element.milestone.id);
        }
        return [];
    }

    private buildMilestoneList(): MilestoneTreeItem[] {
        const milestones = this.service.getMilestones();
        const allIssues = this.service.getIssues();

        return milestones.map((m) => {
            const issues = allIssues.filter((i) => i.milestoneId === m.id);
            const open = issues.filter((i) => ['open', 'in-progress', 'in-review'].includes(i.status)).length;
            return new MilestoneTreeItem(m, issues.length, open);
        });
    }

    private buildIssueList(milestoneId: string): MilestoneIssueItem[] {
        return this.service
            .getIssues()
            .filter((i) => i.milestoneId === milestoneId)
            .sort((a, b) => a.sequentialId - b.sequentialId)
            .map((i) => new MilestoneIssueItem(i.sequentialId, i.title, i.id, i.status));
    }
}
