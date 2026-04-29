/**
 * IssueTreeProvider — TreeDataProvider for the Issues sidebar view.
 * Supports grouping by status, type, severity, milestone, sprint, assignee,
 * or a flat list.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import type {
    Issue,
    GroupBy,
    IssueFilter,
    IssueStatus,
    Severity,
} from '../types';
import {
    iconForType,
    statusLabel,
    isDone,
    relativeTime,
} from '../utils/helpers';
import {
    CONFIG_SECTION,
    CFG_TREE_GROUP_BY,
    CFG_SHOW_RESOLVED,
    CTX_ISSUE,
    CTX_GROUP,
    TREE_REFRESH_DEBOUNCE_MS,
} from '../constants';
import { debounce } from '../utils/helpers';

// ---------------------------------------------------------------------------
// Tree item types
// ---------------------------------------------------------------------------

/** Tree item representing a single issue in the sidebar view. */
export class IssueTreeItem extends vscode.TreeItem {
    constructor(
        public readonly issue: Issue,
        collapsible = vscode.TreeItemCollapsibleState.None
    ) {
        super(`#${issue.sequentialId} ${issue.title}`, collapsible);
        this.contextValue = CTX_ISSUE;
        this.description = this.buildDescription();
        this.tooltip = this.buildTooltip();
        this.iconPath = new vscode.ThemeIcon(iconForType(issue.type));
        this.id = `issue-${issue.id}`;

        // Open issue detail panel on click
        this.command = {
            command: 'vetspresso-issues.viewIssue',
            title: 'View Issue',
            arguments: [issue],
        };
    }

    private buildDescription(): string {
        const parts: string[] = [issue_statusBadge(this.issue)];
        if (this.issue.isStale) { parts.push('⚠ stale'); }
        if (this.issue.severity === 'critical') { parts.push('🔴'); }
        return parts.join(' ');
    }

    private buildTooltip(): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.supportHtml = false;
        md.appendMarkdown(
            `**#${this.issue.sequentialId} ${this.issue.title}**\n\n` +
            `**Type:** ${this.issue.type}  |  **Status:** ${statusLabel(this.issue.status)}\n\n` +
            `**Severity:** ${this.issue.severity}  |  **Urgency:** ${this.issue.urgency}\n\n`
        );
        if (this.issue.assignedTo) {
            md.appendMarkdown(`**Assigned to:** ${this.issue.assignedTo}\n\n`);
        }
        if (this.issue.reportedInVersion) {
            md.appendMarkdown(`**Reported in:** ${this.issue.reportedInVersion}\n\n`);
        }
        if (this.issue.targetVersion) {
            md.appendMarkdown(`**Target version:** ${this.issue.targetVersion}\n\n`);
        }
        md.appendMarkdown(`**Created:** ${relativeTime(this.issue.createdAt)}\n\n`);
        if (this.issue.description) {
            const preview = this.issue.description.slice(0, 200);
            md.appendMarkdown(`---\n\n${preview}${preview.length < this.issue.description.length ? '…' : ''}`);
        }
        return md;
    }
}

/** Tree item representing a group header (e.g. a status or type bucket). */
export class GroupTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly issueIds: string[],
        collapsible = vscode.TreeItemCollapsibleState.Expanded
    ) {
        super(label, collapsible);
        this.contextValue = CTX_GROUP;
        this.description = `${issueIds.length}`;
    }
}

// ---------------------------------------------------------------------------
// IssueTreeProvider
// ---------------------------------------------------------------------------

/** TreeDataProvider for the main issues sidebar view with grouping and filtering. */
export class IssueTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private activeFilter: IssueFilter = {};
    private readonly debouncedRefresh: () => void;

    constructor(private readonly service: IssueService) {
        this.debouncedRefresh = debounce(() => this._onDidChangeTreeData.fire(), TREE_REFRESH_DEBOUNCE_MS);

        // Re-render when data changes
        this.service.onIssueChanged(() => this.debouncedRefresh());
        this.service.onMetaChanged(() => this.debouncedRefresh());

        // Re-render when relevant settings change
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (
                e.affectsConfiguration(`${CONFIG_SECTION}.treeGroupBy`) ||
                e.affectsConfiguration(`${CONFIG_SECTION}.showResolvedIssues`)
            ) {
                this.debouncedRefresh();
            }
        });
    }

    /** Sets or clears the active filter programmatically. */
    setFilter(filter: IssueFilter): void {
        this.activeFilter = filter;
        this._onDidChangeTreeData.fire();
    }

    clearFilter(): void {
        this.activeFilter = {};
        this._onDidChangeTreeData.fire();
    }

    getActiveFilter(): IssueFilter {
        return this.activeFilter;
    }

    /** Forces a full refresh. */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        const showResolved = config.get<boolean>(CFG_SHOW_RESOLVED, false);
        const groupBy = config.get<GroupBy>(CFG_TREE_GROUP_BY, 'status');

        let issues = this.service.getIssues(
            Object.keys(this.activeFilter).length > 0 ? this.activeFilter : undefined
        );

        if (!showResolved) {
            issues = issues.filter((i) => !isDone(i));
        }

        if (!element) {
            // Root level
            return groupBy === 'none'
                ? this.buildFlatList(issues)
                : this.buildGroupHeaders(issues, groupBy);
        }

        if (element instanceof GroupTreeItem) {
            const groupIssues = issues.filter((i) => element.issueIds.includes(i.id));
            return groupIssues.map((i) => new IssueTreeItem(i));
        }

        return [];
    }

    // -------------------------------------------------------------------------
    // Private: Building the tree
    // -------------------------------------------------------------------------

    private buildFlatList(issues: Issue[]): IssueTreeItem[] {
        return issues
            .sort((a, b) => a.sequentialId - b.sequentialId)
            .map((i) => new IssueTreeItem(i));
    }

    private buildGroupHeaders(issues: Issue[], groupBy: GroupBy): GroupTreeItem[] {
        const groups = new Map<string, string[]>();

        for (const issue of issues) {
            const key = groupKey(issue, groupBy, this.service);
            const ids = groups.get(key) ?? [];
            ids.push(issue.id);
            groups.set(key, ids);
        }

        const items: GroupTreeItem[] = [];
        for (const [key, ids] of groups) {
            items.push(new GroupTreeItem(key, ids));
        }

        // Sort group headers (status follows lifecycle order)
        if (groupBy === 'status') {
            items.sort((a, b) => STATUS_ORDER.indexOf(a.label as IssueStatus) - STATUS_ORDER.indexOf(b.label as IssueStatus));
        } else if (groupBy === 'severity') {
            items.sort((a, b) => SEVERITY_ORDER.indexOf(a.label as Severity) - SEVERITY_ORDER.indexOf(b.label as Severity));
        } else {
            items.sort((a, b) => a.label.localeCompare(b.label));
        }

        return items;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupKey(issue: Issue, groupBy: GroupBy, service: IssueService): string {
    switch (groupBy) {
        case 'status':
            return statusLabel(issue.status);
        case 'type':
            return issue.type;
        case 'severity':
            return issue.severity;
        case 'milestone': {
            if (!issue.milestoneId) { return 'No Milestone'; }
            const m = service.getMilestone(issue.milestoneId);
            return m?.name ?? 'Unknown Milestone';
        }
        case 'sprint': {
            if (!issue.sprintId) { return 'No Sprint'; }
            const s = service.getSprint(issue.sprintId);
            return s?.name ?? 'Unknown Sprint';
        }
        case 'assignee':
            return issue.assignedTo ?? 'Unassigned';
        default:
            return 'All Issues';
    }
}

function issue_statusBadge(issue: Issue): string {
    const badges: Record<string, string> = {
        'open': 'open',
        'in-progress': '▶ in progress',
        'in-review': '👁 in review',
        'on-hold': '⏸ on hold',
        'resolved': '✓ resolved',
        'closed': 'closed',
        'wontfix': 'won\'t fix',
        'duplicate': 'duplicate',
    };
    return badges[issue.status] ?? issue.status;
}

const STATUS_ORDER: IssueStatus[] = [
    'open', 'in-progress', 'in-review', 'on-hold', 'resolved', 'closed', 'wontfix', 'duplicate',
];

const SEVERITY_ORDER: Severity[] = [
    'critical', 'high', 'medium', 'low', 'trivial',
];
