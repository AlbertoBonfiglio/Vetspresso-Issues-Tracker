/**
 * Workspace-scoped storage provider.
 * Persists data in <workspaceFolder>/.vscode/issues/ so that it can be
 * committed to version control and shared among team members.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import * as path from 'path';
import type { IStorageProvider } from './IStorageProvider';
import type {
    Issue,
    Milestone,
    Sprint,
    IssueTemplate,
    IssueStoreIndex,
} from '../types';
import {
    WORKSPACE_ISSUES_DIR,
    INDEX_FILENAME,
    ISSUES_SUBDIR,
    MILESTONES_FILENAME,
    SPRINTS_FILENAME,
    TEMPLATES_FILENAME,
    KNOWN_TAGS_FILENAME,
    KNOWN_PERSONS_FILENAME,
    SCHEMA_VERSION,
} from '../constants';
import { nowIso } from '../utils/idGenerator';
import * as logger from '../utils/logger';

/** Persists issue data in the workspace's `.vscode/issues/` directory (version-controllable). */
export class WorkspaceStorageProvider implements IStorageProvider {
    private readonly rootUri: vscode.Uri;
    private readonly issuesUri: vscode.Uri;
    private readonly indexUri: vscode.Uri;
    private readonly milestonesUri: vscode.Uri;
    private readonly sprintsUri: vscode.Uri;
    private readonly templatesUri: vscode.Uri;
    private readonly knownTagsUri: vscode.Uri;
    private readonly knownPersonsUri: vscode.Uri;

    readonly label: string;

    constructor(workspaceFolderUri: vscode.Uri) {
        this.rootUri = vscode.Uri.joinPath(workspaceFolderUri, WORKSPACE_ISSUES_DIR);
        this.issuesUri = vscode.Uri.joinPath(this.rootUri, ISSUES_SUBDIR);
        this.indexUri = vscode.Uri.joinPath(this.rootUri, INDEX_FILENAME);
        this.milestonesUri = vscode.Uri.joinPath(this.rootUri, MILESTONES_FILENAME);
        this.sprintsUri = vscode.Uri.joinPath(this.rootUri, SPRINTS_FILENAME);
        this.templatesUri = vscode.Uri.joinPath(this.rootUri, TEMPLATES_FILENAME);
        this.knownTagsUri = vscode.Uri.joinPath(this.rootUri, KNOWN_TAGS_FILENAME);
        this.knownPersonsUri = vscode.Uri.joinPath(this.rootUri, KNOWN_PERSONS_FILENAME);
        this.label = `workspace (${path.join(WORKSPACE_ISSUES_DIR)})`;
    }

    async initialise(): Promise<void> {
        await this.ensureDir(this.rootUri);
        await this.ensureDir(this.issuesUri);
        logger.debug(`WorkspaceStorageProvider initialised at ${this.rootUri.fsPath}`);
    }

    // ------- Index -------

    async readIndex(): Promise<IssueStoreIndex | null> {
        try {
            return await this.readJson<IssueStoreIndex>(this.indexUri);
        } catch (err) {
            if (isNotFound(err)) {
                return null;
            }
            throw err;
        }
    }

    async writeIndex(index: IssueStoreIndex): Promise<void> {
        await this.writeJson(this.indexUri, index);
    }

    // ------- Issues -------

    async readAllIssues(): Promise<Issue[]> {
        let entries: [string, vscode.FileType][];
        try {
            entries = await vscode.workspace.fs.readDirectory(this.issuesUri);
        } catch (err) {
            if (isNotFound(err)) {
                return [];
            }
            throw err;
        }

        const issues: Issue[] = [];
        for (const [name, type] of entries) {
            if (type === vscode.FileType.File && name.endsWith('.json')) {
                const uri = vscode.Uri.joinPath(this.issuesUri, name);
                try {
                    const issue = await this.readJson<Issue>(uri);
                    issues.push(issue);
                } catch (err) {
                    logger.warn(`Failed to read issue file ${name}`, err);
                }
            }
        }
        return issues;
    }

    async readIssue(id: string): Promise<Issue | null> {
        const uri = this.issueUri(id);
        try {
            return await this.readJson<Issue>(uri);
        } catch (err) {
            if (isNotFound(err)) {
                return null;
            }
            throw err;
        }
    }

    async writeIssue(issue: Issue): Promise<void> {
        await this.writeJson(this.issueUri(issue.id), issue);
    }

    async deleteIssue(id: string): Promise<void> {
        const uri = this.issueUri(id);
        try {
            await vscode.workspace.fs.delete(uri, { useTrash: false });
        } catch (err) {
            if (!isNotFound(err)) {
                throw err;
            }
        }
    }

    // ------- Milestones -------

    async readMilestones(): Promise<Milestone[]> {
        try {
            return await this.readJson<Milestone[]>(this.milestonesUri);
        } catch (err) {
            if (isNotFound(err)) {
                return [];
            }
            throw err;
        }
    }

    async writeMilestones(milestones: Milestone[]): Promise<void> {
        await this.writeJson(this.milestonesUri, milestones);
    }

    // ------- Sprints -------

    async readSprints(): Promise<Sprint[]> {
        try {
            return await this.readJson<Sprint[]>(this.sprintsUri);
        } catch (err) {
            if (isNotFound(err)) {
                return [];
            }
            throw err;
        }
    }

    async writeSprints(sprints: Sprint[]): Promise<void> {
        await this.writeJson(this.sprintsUri, sprints);
    }

    // ------- Templates -------

    async readTemplates(): Promise<IssueTemplate[]> {
        try {
            return await this.readJson<IssueTemplate[]>(this.templatesUri);
        } catch (err) {
            if (isNotFound(err)) {
                return defaultTemplates();
            }
            throw err;
        }
    }

    async writeTemplates(templates: IssueTemplate[]): Promise<void> {
        await this.writeJson(this.templatesUri, templates);
    }

    // ------- Known Tags -------

    async readKnownTags(): Promise<string[]> {
        try {
            return await this.readJson<string[]>(this.knownTagsUri);
        } catch (err) {
            if (isNotFound(err)) {
                return [];
            }
            throw err;
        }
    }

    async writeKnownTags(tags: string[]): Promise<void> {
        await this.writeJson(this.knownTagsUri, tags);
    }

    // ------- Known Persons -------

    async readKnownPersons(): Promise<string[]> {
        try {
            return await this.readJson<string[]>(this.knownPersonsUri);
        } catch (err) {
            if (isNotFound(err)) {
                return [];
            }
            throw err;
        }
    }

    async writeKnownPersons(persons: string[]): Promise<void> {
        await this.writeJson(this.knownPersonsUri, persons);
    }

    // ------- Accessors -------

    getRootUri(): vscode.Uri {
        return this.rootUri;
    }

    // ------- Private helpers -------

    private issueUri(id: string): vscode.Uri {
        return vscode.Uri.joinPath(this.issuesUri, `${id}.json`);
    }

    private async readJson<T>(uri: vscode.Uri): Promise<T> {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(bytes).toString('utf8');
        return JSON.parse(text) as T;
    }

    private async writeJson(uri: vscode.Uri, data: unknown): Promise<void> {
        const text = JSON.stringify(data, null, 2);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
    }

    private async ensureDir(uri: vscode.Uri): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(uri);
        } catch {
            // Directory may already exist — ignore
        }
    }
}

/** Returns true if the error is a "file not found" style VS Code FS error. */
function isNotFound(err: unknown): boolean {
    if (err instanceof vscode.FileSystemError) {
        return err.code === 'FileNotFound';
    }
    if (err instanceof Error) {
        return (
            err.message.includes('ENOENT') ||
            err.message.includes('FileNotFound') ||
            err.message.toLowerCase().includes('no such file')
        );
    }
    return false;
}

/** Built-in starter templates seeded on first run. */
function defaultTemplates(): IssueTemplate[] {
    const now = nowIso();
    return [
        {
            id: 'tpl-bug-default',
            name: 'Bug Report',
            description: 'Standard template for reporting a defect.',
            type: 'bug',
            defaultSeverity: 'medium',
            defaultUrgency: 'normal',
            titleTemplate: '',
            bodyTemplate:
                '### Steps to Reproduce\n\n1. \n2. \n\n### Expected Behavior\n\n\n### Actual Behavior\n\n\n### Environment\n\n- OS: \n- Version: \n',
            defaultTags: ['needs-triage'],
            createdAt: now,
            updatedAt: now,
        },
        {
            id: 'tpl-feature-default',
            name: 'Feature Request',
            description: 'Standard template for requesting a new feature.',
            type: 'feature',
            defaultSeverity: 'low',
            defaultUrgency: 'low',
            titleTemplate: '',
            bodyTemplate:
                '### Problem / Motivation\n\n\n### Proposed Solution\n\n\n### Alternatives Considered\n\n\n### Additional Context\n\n',
            defaultTags: [],
            createdAt: now,
            updatedAt: now,
        },
        {
            id: 'tpl-task-default',
            name: 'Task',
            description: 'Standard template for a development task.',
            type: 'task',
            defaultSeverity: 'low',
            defaultUrgency: 'normal',
            titleTemplate: '',
            bodyTemplate: '### Description\n\n\n### Acceptance Criteria\n\n- [ ] \n- [ ] \n',
            defaultTags: [],
            createdAt: now,
            updatedAt: now,
        },
    ];
}

export { SCHEMA_VERSION };
