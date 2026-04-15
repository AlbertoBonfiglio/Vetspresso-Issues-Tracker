/**
 * Extension entry point — activated on `onStartupFinished`.
 * Wires together all providers, services, and commands.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import * as logger from './utils/logger';
import { buildStorageProviders } from './storage/StorageProviderFactory';
import { IssueDatabase } from './database/IssueDatabase';
import { IssueService } from './services/IssueService';
import { SearchService } from './services/SearchService';
import { ExportService } from './services/ExportService';
import { ChangelogService } from './services/ChangelogService';
import { IssueTreeProvider } from './providers/IssueTreeProvider';
import { MilestoneTreeProvider } from './providers/MilestoneTreeProvider';
import { SprintTreeProvider } from './providers/SprintTreeProvider';
import { TimeTrackingProvider } from './providers/TimeTrackingProvider';
import { IssueCodeLensProvider } from './providers/IssueCodeLensProvider';
import { IssueDecorationProvider } from './providers/IssueDecorationProvider';
import { StatusBarProvider } from './providers/StatusBarProvider';
import {
    VIEW_ISSUE_EXPLORER,
    VIEW_MILESTONE,
    VIEW_SPRINT,
    VIEW_TIME,
    EXTENSION_DISPLAY_NAME,
} from './constants';
import { invalidateCache } from './version/VersionProviderFactory';

// Command handlers
import {
    cmdCreateIssue,
    cmdCreateFromTemplate,
    cmdEditIssue,
    cmdViewIssue,
    cmdDeleteIssue,
    cmdCloseIssue,
    cmdResolveIssue,
    cmdReopenIssue,
    cmdLinkCodeToIssue,
    cmdLogTime,
    cmdAddRelation,
    cmdSearchIssues,
    cmdFilterIssues,
    cmdCopyIssueId,
    cmdOpenDashboard,
    cmdGroupBy,
    cmdOpenCurrentVersionIssues,
} from './commands/issueCommands';
import {
    cmdCreateMilestone,
    cmdEditMilestone,
    cmdDeleteMilestone,
    cmdCreateSprint,
    cmdEditSprint,
    cmdDeleteSprint,
} from './commands/milestoneCommands';
import {
    cmdExportIssues,
    cmdImportIssues,
    cmdGenerateChangelog,
} from './commands/exportCommands';

import { MilestoneTreeItem } from './providers/MilestoneTreeProvider';
import { SprintTreeItem } from './providers/SprintTreeProvider';
import { IssueTreeItem } from './providers/IssueTreeProvider';
import { Issue } from './types';

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const channel = vscode.window.createOutputChannel(EXTENSION_DISPLAY_NAME);
    logger.initLogger(channel, 'info');
    context.subscriptions.push(channel);

    logger.info(`${EXTENSION_DISPLAY_NAME} activating…`);

    const { extensionUri, globalStorageUri } = context;

    // -------------------------------------------------------------------------
    // Storage + database
    // -------------------------------------------------------------------------

    const storageProviders = buildStorageProviders(globalStorageUri);

    // For simplicity, use the first provider as the primary (multi-root per-folder
    // databases can be added in a future iteration by keeping all providers active)
    const primaryProvider = storageProviders[0];;
    const database = new IssueDatabase(primaryProvider);

    try {
        await database.load();
    } catch (err) {
        logger.showError('Failed to load issue database', err);
        // Continue with an empty database rather than crashing the extension
    }

    context.subscriptions.push({ dispose: () => database.dispose() });

    // -------------------------------------------------------------------------
    // Services
    // -------------------------------------------------------------------------

    const issueService = new IssueService(database);
    const searchService = new SearchService(database);
    const exportService = new ExportService(database);
    const changelogService = new ChangelogService(database);

    // -------------------------------------------------------------------------
    // Tree views
    // -------------------------------------------------------------------------

    const issueTreeProvider = new IssueTreeProvider(issueService);
    const milestoneTreeProvider = new MilestoneTreeProvider(issueService);
    const sprintTreeProvider = new SprintTreeProvider(issueService);
    const timeProvider = new TimeTrackingProvider(issueService);

    context.subscriptions.push(
        vscode.window.registerTreeDataProvider(VIEW_ISSUE_EXPLORER, issueTreeProvider),
        vscode.window.registerTreeDataProvider(VIEW_MILESTONE, milestoneTreeProvider),
        vscode.window.registerTreeDataProvider(VIEW_SPRINT, sprintTreeProvider),
        vscode.window.registerTreeDataProvider(VIEW_TIME, timeProvider)
    );

    // -------------------------------------------------------------------------
    // CodeLens + decorations
    // -------------------------------------------------------------------------

    const codeLensProvider = new IssueCodeLensProvider(issueService);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
        vscode.languages.registerCodeLensProvider({ scheme: 'untitled' }, codeLensProvider)
    );

    const decorationProvider = new IssueDecorationProvider(issueService);
    context.subscriptions.push({ dispose: () => decorationProvider.dispose() });

    // -------------------------------------------------------------------------
    // Status bar
    // -------------------------------------------------------------------------

    const statusBarProvider = new StatusBarProvider(issueService);
    context.subscriptions.push({ dispose: () => statusBarProvider.dispose() });

    // -------------------------------------------------------------------------
    // Configuration change: reload storage when relevant settings change
    // -------------------------------------------------------------------------

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (
                e.affectsConfiguration('vetspresso-issues.storageLocation') ||
                e.affectsConfiguration('vetspresso-issues.multiRootStorage')
            ) {
                void vscode.window.showInformationMessage(
                    `${EXTENSION_DISPLAY_NAME}: Storage configuration changed. Reload window to apply.`,
                    'Reload'
                ).then((action) => {
                    if (action === 'Reload') {
                        void vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            }
        })
    );

    // Invalidate version cache when workspace folders change
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => invalidateCache())
    );

    // -------------------------------------------------------------------------
    // Register commands
    // -------------------------------------------------------------------------

    const reg = (command: string, handler: (...args: unknown[]) => unknown) =>
        context.subscriptions.push(vscode.commands.registerCommand(command, handler));

    // Issue CRUD
    reg('vetspresso-issues.createIssue', () =>
        cmdCreateIssue(issueService, extensionUri)
    );
    reg('vetspresso-issues.createFromTemplate', () =>
        cmdCreateFromTemplate(issueService, extensionUri)
    );
    reg('vetspresso-issues.editIssue', (issue: unknown) => {
        if (isIssue(issue)) { return cmdEditIssue(issueService, extensionUri, issue); }
        if (issue instanceof IssueTreeItem) { return cmdEditIssue(issueService, extensionUri, issue.issue); }
    });
    reg('vetspresso-issues.viewIssue', (issue: unknown) => {
        if (isIssue(issue) || hasId(issue)) { return cmdViewIssue(issueService, extensionUri, issue as Issue); }
        if (issue instanceof IssueTreeItem) { return cmdViewIssue(issueService, extensionUri, issue.issue); }
    });
    reg('vetspresso-issues.deleteIssue', (issue: unknown) => {
        if (isIssue(issue)) { return cmdDeleteIssue(issueService, issue); }
        if (issue instanceof IssueTreeItem) { return cmdDeleteIssue(issueService, issue.issue); }
    });
    reg('vetspresso-issues.closeIssue', (issue: unknown) => {
        if (isIssue(issue)) { return cmdCloseIssue(issueService, issue); }
        if (issue instanceof IssueTreeItem) { return cmdCloseIssue(issueService, issue.issue); }
    });
    reg('vetspresso-issues.resolveIssue', (issue: unknown) => {
        if (isIssue(issue)) { return cmdResolveIssue(issueService, issue); }
        if (issue instanceof IssueTreeItem) { return cmdResolveIssue(issueService, issue.issue); }
    });
    reg('vetspresso-issues.reopenIssue', (issue: unknown) => {
        if (isIssue(issue)) { return cmdReopenIssue(issueService, issue); }
        if (issue instanceof IssueTreeItem) { return cmdReopenIssue(issueService, issue.issue); }
    });
    reg('vetspresso-issues.copyIssueId', (issue: unknown) => {
        if (isIssue(issue)) { return cmdCopyIssueId(issue); }
        if (issue instanceof IssueTreeItem) { return cmdCopyIssueId(issue.issue); }
    });
    reg('vetspresso-issues.logTime', (issue: unknown) => {
        if (isIssue(issue)) { return cmdLogTime(issueService, issue); }
        if (issue instanceof IssueTreeItem) { return cmdLogTime(issueService, issue.issue); }
    });
    reg('vetspresso-issues.addRelation', (issue: unknown) => {
        if (isIssue(issue)) { return cmdAddRelation(issueService, searchService, issue); }
        if (issue instanceof IssueTreeItem) { return cmdAddRelation(issueService, searchService, issue.issue); }
    });
    reg('vetspresso-issues.addComment', (issue: unknown) => {
        const resolved = isIssue(issue) ? issue : issue instanceof IssueTreeItem ? issue.issue : null;
        if (!resolved) { return; }
        return vscode.window.showInputBox({ title: 'Add Comment', prompt: 'Comment text' }).then((body) => {
            if (body?.trim()) { return issueService.addComment(resolved.id, body.trim()); }
        });
    });

    // Code linking
    reg('vetspresso-issues.linkCodeToIssue', () =>
        cmdLinkCodeToIssue(issueService, searchService)
    );

    // Search / Filter
    reg('vetspresso-issues.searchIssues', () =>
        cmdSearchIssues(searchService, issueService, extensionUri)
    );
    reg('vetspresso-issues.filterIssues', () =>
        cmdFilterIssues(issueTreeProvider, issueService)
    );
    reg('vetspresso-issues.clearFilter', () => {
        issueTreeProvider.clearFilter();
        void vscode.window.showInformationMessage('Issue filter cleared.');
    });
    reg('vetspresso-issues.groupBy', cmdGroupBy);

    // Dashboard
    reg('vetspresso-issues.openDashboard', () =>
        cmdOpenDashboard(extensionUri, issueService)
    );

    // Refresh
    reg('vetspresso-issues.refreshIssues', async () => {
        await database.reload();
        issueTreeProvider.refresh();
        milestoneTreeProvider.refresh();
        sprintTreeProvider.refresh();
        timeProvider.refresh();
    });

    // Version
    reg('vetspresso-issues.openCurrentVersionIssues', () =>
        cmdOpenCurrentVersionIssues(issueService, extensionUri)
    );

    // Milestones
    reg('vetspresso-issues.createMilestone', () => cmdCreateMilestone(issueService));
    reg('vetspresso-issues.editMilestone', (item: unknown) => {
        const m = isMilestoneItem(item) ? item.milestone : undefined;
        if (m) { return cmdEditMilestone(issueService, m); }
    });
    reg('vetspresso-issues.deleteMilestone', (item: unknown) => {
        const m = isMilestoneItem(item) ? item.milestone : undefined;
        if (m) { return cmdDeleteMilestone(issueService, m); }
    });

    // Sprints
    reg('vetspresso-issues.createSprint', () => cmdCreateSprint(issueService));
    reg('vetspresso-issues.editSprint', (item: unknown) => {
        const s = isSprintItem(item) ? item.sprint : undefined;
        if (s) { return cmdEditSprint(issueService, s); }
    });
    reg('vetspresso-issues.deleteSprint', (item: unknown) => {
        const s = isSprintItem(item) ? item.sprint : undefined;
        if (s) { return cmdDeleteSprint(issueService, s); }
    });

    // Export / Import / Changelog
    reg('vetspresso-issues.exportIssues', () => cmdExportIssues(exportService));
    reg('vetspresso-issues.importIssues', () => cmdImportIssues(exportService));
    reg('vetspresso-issues.generateChangelog', () => cmdGenerateChangelog(changelogService));

    // Templates
    reg('vetspresso-issues.manageTemplates', async () => {
        const templates = issueService.getTemplates();
        if (templates.length === 0) {
            void vscode.window.showInformationMessage('No custom templates. Default templates are built-in.');
            return;
        }
        await vscode.window.showQuickPick(
            templates.map((t) => ({ label: t.name, description: t.description })),
            { title: 'Issue Templates (management UI coming in a future release)' }
        );
    });

    logger.info(`${EXTENSION_DISPLAY_NAME} activated successfully.`);
}

// ---------------------------------------------------------------------------
// deactivate
// ---------------------------------------------------------------------------

export function deactivate(): void {
    logger.disposeLogger();
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isIssue(value: unknown): value is Issue {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        'sequentialId' in value &&
        'title' in value
    );
}

function hasId(value: unknown): value is { id: string } {
    return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).id === 'string';
}

function isMilestoneItem(value: unknown): value is MilestoneTreeItem {
    return value instanceof MilestoneTreeItem;
}

function isSprintItem(value: unknown): value is SprintTreeItem {
    return value instanceof SprintTreeItem;
}
