/**
 * Global (machine-local) storage provider.
 * Persists data in VS Code's globalStorageUri — invisible to git, private to
 * the local machine.  Each distinct workspace root gets its own namespace
 * directory so multiple open projects do not collide.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IStorageProvider } from './IStorageProvider';
import {
    Issue,
    Milestone,
    Sprint,
    IssueTemplate,
    IssueStoreIndex,
} from '../types';
import {
    INDEX_FILENAME,
    ISSUES_SUBDIR,
    MILESTONES_FILENAME,
    SPRINTS_FILENAME,
    TEMPLATES_FILENAME,
} from '../constants';
import * as logger from '../utils/logger';
import { nowIso } from '../utils/idGenerator';

export class GlobalStorageProvider implements IStorageProvider {
    private readonly rootUri: vscode.Uri;
    private readonly issuesUri: vscode.Uri;
    private readonly indexUri: vscode.Uri;
    private readonly milestonesUri: vscode.Uri;
    private readonly sprintsUri: vscode.Uri;
    private readonly templatesUri: vscode.Uri;

    readonly label: string;

    /**
     * @param globalStorageUri - The `ExtensionContext.globalStorageUri` provided
     *   by VS Code.
     * @param namespaceKey - A unique key identifying the workspace whose issues
     *   are stored under this provider.  Typically the workspace folder name or
     *   a hash of its URI.
     */
    constructor(globalStorageUri: vscode.Uri, namespaceKey: string) {
        // Sanitise the namespace key to a safe directory name
        const safeName = namespaceKey.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64);
        this.rootUri = vscode.Uri.joinPath(globalStorageUri, 'stores', safeName);
        this.issuesUri = vscode.Uri.joinPath(this.rootUri, ISSUES_SUBDIR);
        this.indexUri = vscode.Uri.joinPath(this.rootUri, INDEX_FILENAME);
        this.milestonesUri = vscode.Uri.joinPath(this.rootUri, MILESTONES_FILENAME);
        this.sprintsUri = vscode.Uri.joinPath(this.rootUri, SPRINTS_FILENAME);
        this.templatesUri = vscode.Uri.joinPath(this.rootUri, TEMPLATES_FILENAME);
        this.label = `global storage (namespace: ${safeName})`;
    }

    async initialise(): Promise<void> {
        await this.ensureDir(this.rootUri);
        await this.ensureDir(this.issuesUri);
        logger.debug(`GlobalStorageProvider initialised at ${this.rootUri.fsPath}`);
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
                    logger.warn(`Failed to read global issue file ${name}`, err);
                }
            }
        }
        return issues;
    }

    async readIssue(id: string): Promise<Issue | null> {
        try {
            return await this.readJson<Issue>(this.issueUri(id));
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
        try {
            await vscode.workspace.fs.delete(this.issueUri(id), { useTrash: false });
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
                return [];
            }
            throw err;
        }
    }

    async writeTemplates(templates: IssueTemplate[]): Promise<void> {
        await this.writeJson(this.templatesUri, templates);
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
        return JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
    }

    private async writeJson(uri: vscode.Uri, data: unknown): Promise<void> {
        await vscode.workspace.fs.writeFile(
            uri,
            Buffer.from(JSON.stringify(data, null, 2), 'utf8')
        );
    }

    private async ensureDir(uri: vscode.Uri): Promise<void> {
        try {
            await vscode.workspace.fs.createDirectory(uri);
        } catch {
            // Already exists — ignore
        }
    }
}

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

// Re-export helper used by WorkspaceStorageProvider, avoid duplication
export { nowIso };
