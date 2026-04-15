/**
 * IssueService — business-logic layer over IssueDatabase.
 *
 * Handles cross-cutting concerns such as:
 *   - Stale detection
 *   - Filter application
 *   - Code-link management
 *   - Version-aware queries
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueDatabase } from '../database/IssueDatabase';
import {
    Issue,
    IssueType,
    CodeLink,
    IssueRelation,
    IssueComment,
    IssueFilter,
    TimeEntry,
} from '../types';
import { generateId, nowIso } from '../utils/idGenerator';
import {
    isOlderThan,
    isDone,
    resolveAuthor,
    truncate,
} from '../utils/helpers';
import {
    CONFIG_SECTION,
    CFG_STALE_DAYS,
    CFG_DEFAULT_TYPE,
    CFG_DEFAULT_ASSIGNEE,
    CODE_LINK_SNIPPET_MAX,
} from '../constants';
import { getCurrentVersion } from '../version/VersionProviderFactory';
import * as logger from '../utils/logger';

export class IssueService {
    constructor(private readonly db: IssueDatabase) { }

    // -------------------------------------------------------------------------
    // Read helpers
    // -------------------------------------------------------------------------

    /**
     * Returns all issues, optionally with stale-flag computed and a filter
     * applied.
     */
    getIssues(filter?: IssueFilter): Issue[] {
        const staleDays = vscode.workspace
            .getConfiguration(CONFIG_SECTION)
            .get<number>(CFG_STALE_DAYS, 30);

        let issues = this.db.getAllIssues().map((issue) => ({
            ...issue,
            isStale: !isDone(issue) && isOlderThan(issue.updatedAt, staleDays),
        }));

        if (filter) {
            issues = applyFilter(issues, filter);
        }
        return issues;
    }

    getIssue(id: string): Issue | null {
        return this.db.getIssue(id);
    }

    getOpenIssues(): Issue[] {
        return this.getIssues({ status: ['open', 'in-progress', 'in-review'] });
    }

    getIssuesForVersion(version: string): Issue[] {
        return this.db.getAllIssues().filter(
            (i) =>
                i.reportedInVersion === version ||
                i.fixedInVersion === version ||
                i.targetVersion === version
        );
    }

    getIssuesForFile(relativeFilePath: string): Issue[] {
        return this.db.getAllIssues().filter((issue) =>
            issue.codeLinks.some((link) => link.filePath === relativeFilePath)
        );
    }

    getIssuesForLine(relativeFilePath: string, line: number): Issue[] {
        return this.db.getAllIssues().filter((issue) =>
            issue.codeLinks.some(
                (link) =>
                    link.filePath === relativeFilePath &&
                    line >= link.startLine &&
                    line <= link.endLine
            )
        );
    }

    // -------------------------------------------------------------------------
    // Create / Update / Delete
    // -------------------------------------------------------------------------

    /**
     * Creates a new issue pre-filled with defaults and the current version.
     */
    async createIssue(
        params: Pick<Issue, 'title' | 'description'> &
            Partial<
                Pick<
                    Issue,
                    | 'type'
                    | 'severity'
                    | 'urgency'
                    | 'assignedTo'
                    | 'milestoneId'
                    | 'sprintId'
                    | 'tags'
                    | 'templateId'
                    | 'workspaceFolder'
                    | 'targetVersion'
                >
            >
    ): Promise<Issue> {
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        const defaultType = config.get<IssueType>(CFG_DEFAULT_TYPE, 'bug');
        const defaultAssignee = config.get<string>(CFG_DEFAULT_ASSIGNEE, '');

        const reporter = await resolveAuthor();
        const folderUri = primaryFolderUri();
        const currentVersion = folderUri
            ? await getCurrentVersion(folderUri)
            : null;

        return this.db.createIssue({
            title: params.title,
            description: params.description,
            type: params.type ?? defaultType,
            status: 'open',
            severity: params.severity ?? 'medium',
            urgency: params.urgency ?? 'normal',
            reportedInVersion: currentVersion?.version ?? null,
            fixedInVersion: null,
            targetVersion: params.targetVersion ?? null,
            milestoneId: params.milestoneId ?? null,
            sprintId: params.sprintId ?? null,
            tags: params.tags ?? [],
            estimatedHours: null,
            timeEntries: [],
            reportedBy: reporter,
            assignedTo: params.assignedTo ?? (defaultAssignee || null),
            resolvedAt: null,
            codeLinks: [],
            relations: [],
            comments: [],
            workspaceFolder: params.workspaceFolder ?? null,
            templateId: params.templateId ?? null,
        });
    }

    async updateIssue(
        id: string,
        changes: Partial<Omit<Issue, 'id' | 'sequentialId' | 'createdAt'>>
    ): Promise<Issue> {
        return this.db.updateIssue(id, changes);
    }

    async deleteIssue(id: string): Promise<boolean> {
        return this.db.deleteIssue(id);
    }

    async closeIssue(id: string): Promise<Issue> {
        return this.db.updateIssue(id, { status: 'closed', resolvedAt: nowIso() });
    }

    async resolveIssue(id: string, fixedInVersion?: string): Promise<Issue> {
        const folderUri = primaryFolderUri();
        const currentVersion =
            fixedInVersion ??
            (folderUri ? (await getCurrentVersion(folderUri))?.version ?? null : null);

        return this.db.updateIssue(id, {
            status: 'resolved',
            fixedInVersion: currentVersion ?? null,
            resolvedAt: nowIso(),
        });
    }

    async reopenIssue(id: string): Promise<Issue> {
        return this.db.updateIssue(id, {
            status: 'open',
            resolvedAt: null,
        });
    }

    // -------------------------------------------------------------------------
    // Code links
    // -------------------------------------------------------------------------

    /**
     * Creates a CodeLink from a VS Code selection and attaches it to an issue.
     */
    async linkSelectionToIssue(
        issueId: string,
        editor: vscode.TextEditor
    ): Promise<Issue> {
        const document = editor.document;
        const selection = editor.selection;

        const folderUri = vscode.workspace.getWorkspaceFolder(document.uri);
        const relPath = folderUri
            ? document.uri.fsPath.replace(folderUri.uri.fsPath + '/', '')
            : document.uri.fsPath;

        const startLine = selection.start.line + 1; // 1-based
        const endLine = selection.end.line + 1;

        const text = document.getText(selection);
        const snippet = truncate(text.replace(/\s+/g, ' ').trim(), CODE_LINK_SNIPPET_MAX);

        const link: CodeLink = {
            id: generateId(),
            workspaceFolder: folderUri?.name ?? null,
            filePath: relPath,
            startLine,
            endLine,
            snippet,
            createdAt: nowIso(),
        };

        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }

        const updatedLinks = [...issue.codeLinks, link];
        const updated = await this.db.updateIssue(issueId, { codeLinks: updatedLinks });
        logger.info(`Code link added to issue #${updated.sequentialId}: ${relPath}:${startLine}-${endLine}`);
        return updated;
    }

    async removeCodeLink(issueId: string, linkId: string): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        const links = issue.codeLinks.filter((l) => l.id !== linkId);
        return this.db.updateIssue(issueId, { codeLinks: links });
    }

    // -------------------------------------------------------------------------
    // Comments
    // -------------------------------------------------------------------------

    async addComment(issueId: string, body: string): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        const author = await resolveAuthor();
        const now = nowIso();
        const comment: IssueComment = {
            id: generateId(),
            author,
            body,
            createdAt: now,
            updatedAt: now,
        };
        return this.db.updateIssue(issueId, {
            comments: [...issue.comments, comment],
        });
    }

    async editComment(issueId: string, commentId: string, newBody: string): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        const comments = issue.comments.map((c) =>
            c.id === commentId ? { ...c, body: newBody, updatedAt: nowIso() } : c
        );
        return this.db.updateIssue(issueId, { comments });
    }

    async deleteComment(issueId: string, commentId: string): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        const comments = issue.comments.filter((c) => c.id !== commentId);
        return this.db.updateIssue(issueId, { comments });
    }

    // -------------------------------------------------------------------------
    // Relations
    // -------------------------------------------------------------------------

    async addRelation(issueId: string, relation: IssueRelation): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        // Prevent duplicate relations
        const exists = issue.relations.some(
            (r) => r.targetIssueId === relation.targetIssueId && r.type === relation.type
        );
        if (exists) {
            return issue;
        }
        return this.db.updateIssue(issueId, {
            relations: [...issue.relations, relation],
        });
    }

    async removeRelation(issueId: string, targetIssueId: string): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        const relations = issue.relations.filter((r) => r.targetIssueId !== targetIssueId);
        return this.db.updateIssue(issueId, { relations });
    }

    // -------------------------------------------------------------------------
    // Time tracking
    // -------------------------------------------------------------------------

    async logTime(issueId: string, hours: number, description: string, date?: string): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        const author = await resolveAuthor();
        const entry: TimeEntry = {
            id: generateId(),
            date: date ?? new Date().toISOString().slice(0, 10),
            hours,
            description,
            author,
            createdAt: nowIso(),
        };
        return this.db.updateIssue(issueId, {
            timeEntries: [...issue.timeEntries, entry],
        });
    }

    async removeTimeEntry(issueId: string, entryId: string): Promise<Issue> {
        const issue = this.db.getIssue(issueId);
        if (!issue) {
            throw new Error(`Issue not found: ${issueId}`);
        }
        return this.db.updateIssue(issueId, {
            timeEntries: issue.timeEntries.filter((e) => e.id !== entryId),
        });
    }

    // -------------------------------------------------------------------------
    // Forwarded database accessors
    // -------------------------------------------------------------------------

    getMilestones() { return this.db.getMilestones(); }
    getMilestone(id: string) { return this.db.getMilestone(id); }
    createMilestone(p: Parameters<IssueDatabase['createMilestone']>[0]) { return this.db.createMilestone(p); }
    updateMilestone(id: string, c: Parameters<IssueDatabase['updateMilestone']>[1]) { return this.db.updateMilestone(id, c); }
    deleteMilestone(id: string) { return this.db.deleteMilestone(id); }

    getSprints() { return this.db.getSprints(); }
    getSprint(id: string) { return this.db.getSprint(id); }
    createSprint(p: Parameters<IssueDatabase['createSprint']>[0]) { return this.db.createSprint(p); }
    updateSprint(id: string, c: Parameters<IssueDatabase['updateSprint']>[1]) { return this.db.updateSprint(id, c); }
    deleteSprint(id: string) { return this.db.deleteSprint(id); }

    getTemplates() { return this.db.getTemplates(); }
    getTemplate(id: string) { return this.db.getTemplate(id); }
    saveTemplates(t: Parameters<IssueDatabase['saveTemplates']>[0]) { return this.db.saveTemplates(t); }

    getOpenCount() { return this.db.getOpenCount(); }
    getCriticalCount() { return this.db.getCriticalCount(); }
    getAllTags() { return this.db.getAllTags(); }
    getAllAssignees() { return this.db.getAllAssignees(); }

    get onIssueChanged() { return this.db.onIssueChanged; }
    get onMetaChanged() { return this.db.onMetaChanged; }
}

// ---------------------------------------------------------------------------
// Filter implementation
// ---------------------------------------------------------------------------

function applyFilter(issues: Issue[], filter: IssueFilter): Issue[] {
    return issues.filter((issue) => {
        if (filter.status && !filter.status.includes(issue.status)) {
            return false;
        }
        if (filter.type && !filter.type.includes(issue.type)) {
            return false;
        }
        if (filter.severity && !filter.severity.includes(issue.severity)) {
            return false;
        }
        if (filter.assignedTo !== undefined && issue.assignedTo !== filter.assignedTo) {
            return false;
        }
        if (filter.reportedBy !== undefined && issue.reportedBy !== filter.reportedBy) {
            return false;
        }
        if (filter.milestoneId !== undefined && issue.milestoneId !== filter.milestoneId) {
            return false;
        }
        if (filter.sprintId !== undefined && issue.sprintId !== filter.sprintId) {
            return false;
        }
        if (filter.tags && filter.tags.length > 0) {
            const issueTags = new Set(issue.tags);
            if (!filter.tags.every((tag) => issueTags.has(tag))) {
                return false;
            }
        }
        if (filter.staleOnly && !issue.isStale) {
            return false;
        }
        if (filter.version) {
            const v = filter.version;
            if (
                issue.reportedInVersion !== v &&
                issue.fixedInVersion !== v &&
                issue.targetVersion !== v
            ) {
                return false;
            }
        }
        if (filter.searchText) {
            const needle = filter.searchText.toLowerCase();
            const haystack = `${issue.title} ${issue.description} ${issue.tags.join(' ')}`.toLowerCase();
            if (!haystack.includes(needle)) {
                return false;
            }
        }
        return true;
    });
}

/** Returns the URI of the first workspace folder, or `undefined`. */
function primaryFolderUri(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}
