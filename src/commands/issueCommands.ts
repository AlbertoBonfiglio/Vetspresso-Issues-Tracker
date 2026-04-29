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
import type {
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

/** Walks the user through creating a new issue via a series of quick picks and input boxes. */
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

    // 5. Assignee (optional, with known persons)
    const knownPersons: string[] = service.getKnownPersons();
    let assignee: string | undefined;
    if (knownPersons.length > 0) {
        const personChoice = await vscode.window.showQuickPick(
            [{ label: '(none)', description: 'Leave unassigned' }, ...knownPersons.map((p) => ({ label: p })), { label: '$(pencil) Enter name…', description: 'Type a new assignee' }],
            { title: 'New Issue — Assignee (optional)', placeHolder: 'Select or type an assignee' }
        );
        if (personChoice === undefined) { return; }
        if (personChoice.label === '$(pencil) Enter name…') {
            const typed = await vscode.window.showInputBox({ title: 'New Issue — Assignee', prompt: 'Enter assignee name' });
            if (typed === undefined) { return; }
            assignee = typed.trim() || undefined;
        } else if (personChoice.label !== '(none)') {
            assignee = personChoice.label;
        }
    } else {
        const typed = await vscode.window.showInputBox({
            title: 'New Issue — Assignee (optional)',
            prompt: 'Enter assignee name, or leave blank.',
        });
        if (typed === undefined) { return; }
        assignee = typed.trim() || undefined;
    }

    // 6. Tags (optional, with known tags)
    const knownTags = service.getKnownTags();
    let chosenTags: string[] = [...(initialData?.tags ?? [])];
    if (knownTags.length > 0) {
        const tagPicks = await vscode.window.showQuickPick(
            [...knownTags.map((t) => ({ label: t, picked: chosenTags.includes(t) })), { label: '$(pencil) Add custom tag…', description: 'Type a new tag', picked: false }],
            { title: 'New Issue — Tags (optional)', placeHolder: 'Select tags', canPickMany: true }
        );
        if (tagPicks === undefined) { return; }
        const wantsCustom = tagPicks.some((p) => p.label === '$(pencil) Add custom tag…');
        chosenTags = tagPicks.filter((p) => p.label !== '$(pencil) Add custom tag…').map((p) => p.label);
        if (wantsCustom) {
            const custom = await vscode.window.showInputBox({ title: 'New Issue — Custom Tags', prompt: 'Enter tags separated by commas' });
            if (custom === undefined) { return; }
            const extra = custom.split(',').map((t) => t.trim()).filter(Boolean);
            chosenTags = [...new Set([...chosenTags, ...extra])];
        }
    }

    // 7. Target version (optional)
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
            assignedTo: assignee ?? null,
            tags: chosenTags,
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

/** Creates a new issue pre-populated from a saved template. */
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

/** Opens an inline edit flow for an existing issue's fields. */
export async function cmdEditIssue(
    service: IssueService,
    _extensionUri: vscode.Uri,
    issue: Issue
): Promise<void> {
    const newTitle = await vscode.window.showInputBox({
        title: `Edit Issue #${issue.sequentialId} — Title`,
        value: issue.title,
        validateInput: (v) => (v.trim() ? null : 'Title cannot be empty.'),
    });
    if (!newTitle) { return; }

    const statuses: IssueStatus[] = ['open', 'in-progress', 'in-review', 'on-hold', 'resolved', 'closed', 'wontfix', 'duplicate'];
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

    const newDescription = await vscode.window.showInputBox({
        title: `Edit Issue #${issue.sequentialId} — Description`,
        value: issue.description ?? '',
        prompt: 'Issue description (optional).',
    });

    // Version fields — offer quick-pick from git tags if available, else free text
    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
    const versions = folderUri ? await getAllVersions(folderUri) : [];
    const versionItems = (current: string | null) => [
        { label: '(none)', description: 'Clear version' },
        ...(current && !versions.find((v) => v.version === current)
            ? [{ label: current, description: 'current value' }]
            : []),
        ...versions.map((v) => ({ label: v.version, description: v.source })),
    ];

    const pickVersion = async (title: string, current: string | null): Promise<string | null | undefined> => {
        if (versions.length > 0) {
            const choice = await vscode.window.showQuickPick(
                versionItems(current).map((item) => ({ ...item, picked: item.label === (current ?? '(none)') })),
                { title, placeHolder: 'Select a version or (none) to clear' }
            );
            if (choice === undefined) { return undefined; } // cancelled
            return choice.label === '(none)' ? null : choice.label;
        }
        // No git versions available — fall back to free text
        const val = await vscode.window.showInputBox({
            title,
            value: current ?? '',
            prompt: 'Enter version string, or leave blank to clear.',
        });
        if (val === undefined) { return undefined; } // cancelled
        return val.trim() || null;
    };

    const newReportedIn = await pickVersion(
        `Edit Issue #${issue.sequentialId} — Reported In Version`, issue.reportedInVersion
    );
    if (newReportedIn === undefined) { return; }

    const newTargetVersion = await pickVersion(
        `Edit Issue #${issue.sequentialId} — Target Version`, issue.targetVersion
    );
    if (newTargetVersion === undefined) { return; }

    const newFixedIn = await pickVersion(
        `Edit Issue #${issue.sequentialId} — Fixed In Version`, issue.fixedInVersion
    );
    if (newFixedIn === undefined) { return; }

    // Tags — multi-select from known tags + custom entry
    const knownTags = service.getKnownTags();
    let updatedTags: string[] = [...issue.tags];
    const tagPickItems = [
        ...knownTags.map((t) => ({ label: t, picked: issue.tags.includes(t) })),
        { label: '$(pencil) Add custom tag…', description: 'Type a new tag', picked: false },
    ];
    const tagPicks = await vscode.window.showQuickPick(tagPickItems, {
        title: `Edit Issue #${issue.sequentialId} — Tags`,
        placeHolder: 'Select tags (space to toggle)',
        canPickMany: true,
    });
    if (tagPicks === undefined) { return; }
    const wantsCustomTag = tagPicks.some((p) => p.label === '$(pencil) Add custom tag…');
    updatedTags = tagPicks.filter((p) => p.label !== '$(pencil) Add custom tag…').map((p) => p.label);
    // Include any existing tags not in knownTags (keep them unless explicitly deselected)
    for (const t of issue.tags) {
        if (!knownTags.includes(t) && !updatedTags.includes(t)) {
            updatedTags.push(t);
        }
    }
    if (wantsCustomTag) {
        const custom = await vscode.window.showInputBox({ title: 'Edit Issue — Custom Tags', prompt: 'Enter tags separated by commas' });
        if (custom === undefined) { return; }
        const extra = custom.split(',').map((t) => t.trim()).filter(Boolean);
        updatedTags = [...new Set([...updatedTags, ...extra])];
        await Promise.all(extra.map((t) => service.addKnownTag(t)));
    }

    try {
        await service.updateIssue(issue.id, {
            title: newTitle.trim(),
            status: statusChoice.label,
            assignedTo: newAssignee?.trim() || null,
            description: newDescription ?? issue.description ?? '',
            reportedInVersion: newReportedIn,
            targetVersion: newTargetVersion,
            fixedInVersion: newFixedIn,
            tags: updatedTags,
        });
        if (newAssignee?.trim()) { await service.addKnownPerson(newAssignee.trim()); }
    } catch (err) {
        logger.showError('Failed to update issue', err);
    }
}

/** Opens the IssueDetailPanel webview for the given issue. */
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

/** Deletes an issue after user confirmation. */
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

/** Sets the issue status to `closed`. */
export async function cmdCloseIssue(service: IssueService, issue: Issue): Promise<void> {
    try {
        await service.closeIssue(issue.id);
    } catch (err) {
        logger.showError('Failed to close issue', err);
    }
}

/** Sets the issue status to `resolved` and records the fixed-in version. */
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

/** Reopens a resolved/closed issue by setting its status back to `open`. */
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

/** Links the current editor selection to the given issue as a CodeLink. */
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

/** Logs time against an issue via an input box. */
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

/** Adds a typed relation between two issues. */
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
        'blocks', 'blocked-by', 'relates-to', 'duplicates', 'duplicated-by', 'parent-of', 'child-of', 'clones',
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

/** Opens a search dialog and displays matching issues in a quick pick. */
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

/** Builds a multi-criteria filter and applies it to the issue tree. */
export async function cmdFilterIssues(
    treeProvider: IssueTreeProvider,
    service: IssueService
): Promise<void> {
    // Build filter via a series of quick picks
    const filter: IssueFilter = {};

    const statusPick = await vscode.window.showQuickPick(
        [
            { label: '(any status)', all: true },
            ...((['open', 'in-progress', 'in-review', 'on-hold', 'resolved', 'closed', 'wontfix', 'duplicate'] as IssueStatus[]).map((s) => ({ label: s, all: false }))),
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

/** Copies the issue's sequential ID to the clipboard. */
export async function cmdCopyIssueId(issue: Issue): Promise<void> {
    await vscode.env.clipboard.writeText(`#${issue.sequentialId}`);
    void vscode.window.showInformationMessage(`Copied #${issue.sequentialId} to clipboard.`);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/** Opens (or reveals) the aggregate metrics dashboard webview. */
export function cmdOpenDashboard(extensionUri: vscode.Uri, service: IssueService): void {
    DashboardPanel.show(extensionUri, service);
}

// ---------------------------------------------------------------------------
// GroupBy
// ---------------------------------------------------------------------------

/** Prompts the user to choose a tree-view grouping strategy. */
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

/** Opens issues linked to the current workspace version. */
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
