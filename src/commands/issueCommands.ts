/**
 * Issue commands — all commands operating on individual issues.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import { SearchService } from '../services/SearchService';
import { IssueDetailPanel } from '../panels/IssueDetailPanel';
import { DashboardPanel } from '../panels/DashboardPanel';
import { IssueTreeProvider } from '../providers/IssueTreeProvider';
import {
    Issue,
    IssueType,
    IssueStatus,
    Severity,
    GroupBy,
    IssueFilter,
    RelationType,
} from '../types';
import {
    CONFIG_SECTION,
    CFG_DEFAULT_TYPE,
} from '../constants';
import { getAllVersions } from '../version/VersionProviderFactory';
import * as logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Create / Edit
// ---------------------------------------------------------------------------

export async function cmdCreateIssue(
    service: IssueService,
    extensionUri: vscode.Uri,
    templateId?: string,
    initialData?: Partial<Issue>
): Promise<void> {
    // 1. Title
    const title = await vscode.window.showInputBox({
        title: 'New Issue — Title',
        prompt: 'Enter a short, descriptive title for the issue.',
        validateInput: (v) => (v.trim() ? null : 'Title cannot be empty.'),
    });
    if (!title) { return; }

    // 2. Type
    const defaultType = vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .get<IssueType>(CFG_DEFAULT_TYPE, 'bug');

    const types: IssueType[] = ['bug', 'enhancement', 'feature', 'task', 'question', 'documentation', 'other'];
    const typeChoice = await vscode.window.showQuickPick(
        types.map((t) => ({ label: t, picked: t === defaultType })),
        { title: 'New Issue — Type', placeHolder: 'Select issue type' }
    );
    if (!typeChoice) { return; }

    // 3. Severity
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'trivial'];
    const severityChoice = await vscode.window.showQuickPick(
        severities.map((s) => ({ label: s, picked: s === 'medium' })),
        { title: 'New Issue — Severity', placeHolder: 'Select severity' }
    );
    if (!severityChoice) { return; }

    // 4. Description (optional, opens multi-line input)
    const description = await vscode.window.showInputBox({
        title: 'New Issue — Description (optional)',
        prompt: 'Enter a description, or leave blank to add later.',
        value: initialData?.description ?? '',
    });

    // 5. Target version (optional)
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    let targetVersion: string | undefined;
    if (folderUri) {
        const versions = await getAllVersions(folderUri);
        if (versions.length > 0) {
            const versionChoice = await vscode.window.showQuickPick(
                [{ label: '(none)', description: 'No target version' }, ...versions.map((v) => ({ label: v.version, description: v.source }))],
                { title: 'New Issue — Target Version (optional)', placeHolder: 'Select target version' }
            );
            if (versionChoice && versionChoice.label !== '(none)') {
                targetVersion = versionChoice.label;
            }
        }
    }

    try {
        const issue = await service.createIssue({
            title: title.trim(),
            description: description ?? '',
            type: typeChoice.label,
            severity: severityChoice.label,
            targetVersion: targetVersion ?? null,
            templateId: templateId ?? null,
            ...initialData,
        });

        const action = await vscode.window.showInformationMessage(
            `Issue #${issue.sequentialId} created: "${issue.title}"`,
            'View Details'
        );
        if (action === 'View Details') {
            IssueDetailPanel.show(extensionUri, service, issue);
        }
    } catch (err) {
        logger.showError('Failed to create issue', err);
    }
}

export async function cmdCreateFromTemplate(
    service: IssueService,
    extensionUri: vscode.Uri
): Promise<void> {
    const templates = service.getTemplates();
    if (templates.length === 0) {
        void vscode.window.showWarningMessage('No templates found. Go to Issues → Manage Templates to create one.');
        return;
    }

    const choice = await vscode.window.showQuickPick(
        templates.map((t) => ({ label: t.name, description: t.description, id: t.id })),
        { title: 'Create Issue from Template', placeHolder: 'Select a template' }
    );
    if (!choice) { return; }

    const defaults = service.getTemplates().find((t) => t.id === choice.id);
    if (!defaults) { return; }

    await cmdCreateIssue(service, extensionUri, choice.id, {
        type: defaults.type,
        severity: defaults.defaultSeverity,
        urgency: defaults.defaultUrgency,
        tags: [...defaults.defaultTags],
        description: defaults.bodyTemplate,
    });
}

export async function cmdEditIssue(
    service: IssueService,
    extensionUri: vscode.Uri,
    issue: Issue
): Promise<void> {
    const newTitle = await vscode.window.showInputBox({
        title: `Edit Issue #${issue.sequentialId} — Title`,
        value: issue.title,
        validateInput: (v) => (v.trim() ? null : 'Title cannot be empty.'),
    });
    if (!newTitle) { return; }

    const statuses: IssueStatus[] = ['open', 'in-progress', 'in-review', 'resolved', 'closed', 'wontfix', 'duplicate'];
    const statusChoice = await vscode.window.showQuickPick(
        statuses.map((s) => ({ label: s, picked: s === issue.status })),
        { title: `Edit Issue #${issue.sequentialId} — Status` }
    );
    if (!statusChoice) { return; }

    const newAssignee = await vscode.window.showInputBox({
        title: `Edit Issue #${issue.sequentialId} — Assignee`,
        value: issue.assignedTo ?? '',
        prompt: 'Leave blank to unassign.',
    });

    try {
        await service.updateIssue(issue.id, {
            title: newTitle.trim(),
            status: statusChoice.label,
            assignedTo: newAssignee?.trim() || null,
        });
    } catch (err) {
        logger.showError('Failed to update issue', err);
    }
}

export function cmdViewIssue(
    service: IssueService,
    extensionUri: vscode.Uri,
    issueOrId: Issue | { id: string }
): void {
    const id = issueOrId.id;
    const issue = service.getIssue(id);
    if (!issue) {
        void vscode.window.showErrorMessage(`Issue not found: ${id}`);
        return;
    }
    IssueDetailPanel.show(extensionUri, service, issue);
}

export async function cmdDeleteIssue(service: IssueService, issue: Issue): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
        `Delete issue #${issue.sequentialId} "${issue.title}"? This cannot be undone.`,
        { modal: true },
        'Delete'
    );
    if (confirm !== 'Delete') { return; }

    try {
        await service.deleteIssue(issue.id);
        void vscode.window.showInformationMessage(`Issue #${issue.sequentialId} deleted.`);
    } catch (err) {
        logger.showError('Failed to delete issue', err);
    }
}

export async function cmdCloseIssue(service: IssueService, issue: Issue): Promise<void> {
    try {
        await service.closeIssue(issue.id);
    } catch (err) {
        logger.showError('Failed to close issue', err);
    }
}

export async function cmdResolveIssue(service: IssueService, issue: Issue): Promise<void> {
    // Optionally select the fix version
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    let fixVersion: string | undefined;
    if (folderUri) {
        const versions = await getAllVersions(folderUri);
        if (versions.length > 0) {
            const choice = await vscode.window.showQuickPick(
                [{ label: '(current)' }, ...versions.map((v) => ({ label: v.version }))],
                { title: 'Mark as Resolved — Fixed In Version', placeHolder: 'Select version (optional)' }
            );
            if (choice && choice.label !== '(current)') {
                fixVersion = choice.label;
            }
        }
    }
    try {
        await service.resolveIssue(issue.id, fixVersion);
    } catch (err) {
        logger.showError('Failed to resolve issue', err);
    }
}

export async function cmdReopenIssue(service: IssueService, issue: Issue): Promise<void> {
    try {
        await service.reopenIssue(issue.id);
    } catch (err) {
        logger.showError('Failed to reopen issue', err);
    }
}

// ---------------------------------------------------------------------------
// Code linking
// ---------------------------------------------------------------------------

export async function cmdLinkCodeToIssue(
    service: IssueService,
    searchService: SearchService
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
        void vscode.window.showWarningMessage('Select code lines to link, then run this command.');
        return;
    }

    const query = await vscode.window.showInputBox({
        title: 'Link Code to Issue',
        prompt: 'Enter issue number or title to search',
        placeHolder: 'e.g. 42  or  login crash',
    });
    if (!query) { return; }

    const matches = searchService.quickFind(query);
    if (matches.length === 0) {
        void vscode.window.showWarningMessage(`No issues found matching "${query}".`);
        return;
    }

    const choice = await vscode.window.showQuickPick(
        matches.map((i) => ({ label: `#${i.sequentialId} ${i.title}`, description: i.status, id: i.id })),
        { title: 'Link Code — Select Issue', placeHolder: 'Pick an issue to link' }
    );
    if (!choice) { return; }

    try {
        await service.linkSelectionToIssue(choice.id, editor);
        void vscode.window.showInformationMessage(`Code linked to issue #${choice.label.slice(1, choice.label.indexOf(' '))}`);
    } catch (err) {
        logger.showError('Failed to link code', err);
    }
}

// ---------------------------------------------------------------------------
// Time logging
// ---------------------------------------------------------------------------

export async function cmdLogTime(service: IssueService, issue: Issue): Promise<void> {
    const hoursStr = await vscode.window.showInputBox({
        title: `Log Time — Issue #${issue.sequentialId}`,
        prompt: 'Hours spent (e.g. 1.5)',
        validateInput: (v) => {
            const n = parseFloat(v);
            return isNaN(n) || n <= 0 ? 'Enter a positive number.' : null;
        },
    });
    if (!hoursStr) { return; }

    const description = await vscode.window.showInputBox({
        title: 'Log Time — Description (optional)',
        prompt: 'Brief description of the work.',
    });

    try {
        await service.logTime(issue.id, parseFloat(hoursStr), description ?? '');
    } catch (err) {
        logger.showError('Failed to log time', err);
    }
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export async function cmdAddRelation(
    service: IssueService,
    searchService: SearchService,
    issue: Issue
): Promise<void> {
    const query = await vscode.window.showInputBox({
        title: `Add Relation — Issue #${issue.sequentialId}`,
        prompt: 'Enter issue number or title to relate to.',
        placeHolder: 'e.g. 12  or  auth bug',
    });
    if (!query) { return; }

    const matches = searchService.quickFind(query).filter((i) => i.id !== issue.id);
    if (matches.length === 0) {
        void vscode.window.showWarningMessage(`No issues found matching "${query}".`);
        return;
    }

    const targetChoice = await vscode.window.showQuickPick(
        matches.map((i) => ({ label: `#${i.sequentialId} ${i.title}`, id: i.id })),
        { title: 'Add Relation — Select Target Issue' }
    );
    if (!targetChoice) { return; }

    const relTypes: RelationType[] = [
        'blocks', 'blocked-by', 'relates-to', 'duplicates', 'duplicated-by', 'parent-of', 'child-of',
    ];
    const typeChoice = await vscode.window.showQuickPick(
        relTypes.map((t) => ({ label: t })),
        { title: 'Add Relation — Relationship Type' }
    );
    if (!typeChoice) { return; }

    try {
        await service.addRelation(issue.id, {
            type: typeChoice.label,
            targetIssueId: targetChoice.id,
        });
    } catch (err) {
        logger.showError('Failed to add relation', err);
    }
}

// ---------------------------------------------------------------------------
// Search / Filter
// ---------------------------------------------------------------------------

export async function cmdSearchIssues(
    searchService: SearchService,
    service: IssueService,
    extensionUri: vscode.Uri
): Promise<void> {
    const query = await vscode.window.showInputBox({
        title: 'Search Issues',
        prompt: 'Full-text search across title, description, comments, and tags.',
        placeHolder: 'Enter search terms…',
    });
    if (!query) { return; }

    const results = searchService.search(query);
    if (results.length === 0) {
        void vscode.window.showInformationMessage(`No issues found for "${query}".`);
        return;
    }

    const choice = await vscode.window.showQuickPick(
        results.map((r) => ({
            label: `#${r.issue.sequentialId} ${r.issue.title}`,
            description: r.issue.status,
            detail: r.excerpt,
            id: r.issue.id,
        })),
        { title: `Search: ${results.length} results`, matchOnDescription: true, matchOnDetail: true }
    );
    if (!choice) { return; }

    const issue = service.getIssue(choice.id);
    if (issue) {
        IssueDetailPanel.show(extensionUri, service, issue);
    }
}

export async function cmdFilterIssues(
    treeProvider: IssueTreeProvider,
    service: IssueService
): Promise<void> {
    // Build filter via a series of quick picks
    const filter: IssueFilter = {};

    const statusPick = await vscode.window.showQuickPick(
        [
            { label: '(any status)', all: true },
            ...((['open', 'in-progress', 'in-review', 'resolved', 'closed', 'wontfix', 'duplicate'] as IssueStatus[]).map((s) => ({ label: s, all: false }))),
        ],
        {
            title: 'Filter Issues — Status',
            canPickMany: true,
            placeHolder: 'Select statuses (empty = all)',
        }
    );
    if (!statusPick) { return; }
    const statuses = statusPick.filter((p) => !(p as { all?: boolean }).all).map((p) => p.label as IssueStatus);
    if (statuses.length > 0) { filter.status = statuses; }

    const assignees = ['(any)', ...service.getAllAssignees()];
    const assigneePick = await vscode.window.showQuickPick(
        assignees.map((a) => ({ label: a })),
        { title: 'Filter Issues — Assignee', placeHolder: 'Select assignee' }
    );
    if (!assigneePick) { return; }
    if (assigneePick.label !== '(any)') {
        filter.assignedTo = assigneePick.label;
    }

    treeProvider.setFilter(filter);
    void vscode.window.showInformationMessage('Filter applied. Use "Clear Filter" to reset.');
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export async function cmdCopyIssueId(issue: Issue): Promise<void> {
    await vscode.env.clipboard.writeText(`#${issue.sequentialId}`);
    void vscode.window.showInformationMessage(`Copied #${issue.sequentialId} to clipboard.`);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function cmdOpenDashboard(extensionUri: vscode.Uri, service: IssueService): void {
    DashboardPanel.show(extensionUri, service);
}

// ---------------------------------------------------------------------------
// GroupBy
// ---------------------------------------------------------------------------

export async function cmdGroupBy(): Promise<void> {
    const options: GroupBy[] = ['status', 'type', 'severity', 'milestone', 'sprint', 'assignee', 'none'];
    const choice = await vscode.window.showQuickPick(
        options.map((g) => ({ label: g })),
        { title: 'Group Issues By', placeHolder: 'Select grouping strategy' }
    );
    if (!choice) { return; }

    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    await config.update('treeGroupBy', choice.label, vscode.ConfigurationTarget.Global);
}

// ---------------------------------------------------------------------------
// Version-related
// ---------------------------------------------------------------------------

export async function cmdOpenCurrentVersionIssues(
    service: IssueService,
    extensionUri: vscode.Uri
): Promise<void> {
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!folderUri) {
        void vscode.window.showWarningMessage('No workspace folder open.');
        return;
    }

    const versions = await getAllVersions(folderUri);
    if (versions.length === 0) {
        void vscode.window.showWarningMessage('No version tags found in the current repository.');
        return;
    }

    const vChoice = await vscode.window.showQuickPick(
        versions.map((v) => ({ label: v.version, description: v.source })),
        { title: 'Issues for Version', placeHolder: 'Select a version' }
    );
    if (!vChoice) { return; }

    const issues = service.getIssuesForVersion(vChoice.label);
    if (issues.length === 0) {
        void vscode.window.showInformationMessage(`No issues linked to version ${vChoice.label}.`);
        return;
    }

    const choice = await vscode.window.showQuickPick(
        issues.map((i) => ({
            label: `#${i.sequentialId} ${i.title}`,
            description: i.status,
            id: i.id,
        })),
        { title: `Issues for ${vChoice.label} (${issues.length})` }
    );
    if (!choice) { return; }

    const issue = service.getIssue(choice.id);
    if (issue) { IssueDetailPanel.show(extensionUri, service, issue); }
}
