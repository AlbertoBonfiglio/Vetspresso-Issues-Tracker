/**
 * Git-based version provider.
 * Reads version information from:
 *   1. Git tags (semver-shaped tags preferred, e.g. "v1.2.3")
 *   2. Falls back to the current branch name if no tags exist
 *
 * Uses the VS Code built-in git extension API; does NOT spawn child processes.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IVersionProvider, ResolvedVersion } from './IVersionProvider';
import * as logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Minimal type stubs for the VS Code git extension's public API.
// The full typings live in @types/vscode — we only surface what we need.
// ---------------------------------------------------------------------------

interface GitTag {
    name: string;
    commit?: string;
}

interface GitRef {
    name?: string;
    commit?: string;
    type: number; // 0 = Head, 1 = RemoteHead, 2 = Tag
}

interface GitRepository {
    rootUri: vscode.Uri;
    state: {
        HEAD?: { name?: string; commit?: string };
        refs: GitRef[];
        tags: GitTag[];
    };
    getConfig(key: string): Promise<string>;
    log(options?: { maxEntries?: number }): Promise<Array<{ hash: string; message: string; authorDate?: string }>>;
}

interface GitAPI {
    repositories: GitRepository[];
    onDidOpenRepository: vscode.Event<GitRepository>;
    onDidCloseRepository: vscode.Event<GitRepository>;
}

// Semver-ish pattern: optional "v" prefix, three numeric groups
const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)/;

/**
 * Compares two semver tag strings (descending — newer first).
 * Non-semver tags are sorted lexicographically after semver tags.
 */
function compareTags(a: string, b: string): number {
    const ma = SEMVER_RE.exec(a);
    const mb = SEMVER_RE.exec(b);
    if (ma && mb) {
        const diff =
            (parseInt(mb[1]) - parseInt(ma[1])) * 1_000_000 +
            (parseInt(mb[2]) - parseInt(ma[2])) * 1_000 +
            (parseInt(mb[3]) - parseInt(ma[3]));
        if (diff !== 0) {
            return diff;
        }
    }
    if (ma && !mb) {
        return -1;
    }
    if (!ma && mb) {
        return 1;
    }
    return b.localeCompare(a);
}

export class GitVersionProvider implements IVersionProvider {
    readonly id = 'git';
    readonly displayName = 'Git Tags';

    private gitApi: GitAPI | null = null;
    private initialised = false;

    /** Lazily resolves and caches the git extension API. */
    private async getGitApi(): Promise<GitAPI | null> {
        if (this.initialised) {
            return this.gitApi;
        }
        this.initialised = true;
        try {
            const extension = vscode.extensions.getExtension<{ getAPI: (v: number) => GitAPI }>(
                'vscode.git'
            );
            if (!extension) {
                logger.debug('Git extension not found; GitVersionProvider unavailable.');
                return null;
            }
            if (!extension.isActive) {
                const exports = await extension.activate();
                this.gitApi = exports.getAPI(1);
            } else {
                this.gitApi = extension.exports.getAPI(1);
            }
            logger.debug('GitVersionProvider: git extension API acquired.');
        } catch (err) {
            logger.warn('GitVersionProvider: failed to acquire git extension API.', err);
        }
        return this.gitApi;
    }

    async isAvailable(workspaceFolderUri: vscode.Uri): Promise<boolean> {
        const api = await this.getGitApi();
        if (!api) {
            return false;
        }
        const repo = this.findRepo(api, workspaceFolderUri);
        return repo !== null;
    }

    async getCurrentVersion(workspaceFolderUri: vscode.Uri): Promise<ResolvedVersion | null> {
        const versions = await this.getAllVersions(workspaceFolderUri);
        if (versions.length > 0) {
            return versions[0];
        }

        // No tags — return current branch name as a fallback
        const api = await this.getGitApi();
        if (!api) {
            return null;
        }
        const repo = this.findRepo(api, workspaceFolderUri);
        if (!repo) {
            return null;
        }
        const branchName = repo.state.HEAD?.name;
        if (branchName) {
            return {
                version: branchName,
                source: 'git branch (no tags found)',
            };
        }
        return null;
    }

    async getAllVersions(workspaceFolderUri: vscode.Uri): Promise<ResolvedVersion[]> {
        const api = await this.getGitApi();
        if (!api) {
            return [];
        }
        const repo = this.findRepo(api, workspaceFolderUri);
        if (!repo) {
            return [];
        }

        const tagNames = repo.state.tags
            .map((t) => t.name)
            .filter((name): name is string => !!name);

        if (tagNames.length === 0) {
            return [];
        }

        const sorted = [...tagNames].sort(compareTags);
        return sorted.map((name) => ({
            version: name,
            source: 'git tag',
        }));
    }

    /**
     * Finds the git repository whose rootUri is a prefix of (or equal to) the
     * given workspace folder URI.
     */
    private findRepo(api: GitAPI, workspaceFolderUri: vscode.Uri): GitRepository | null {
        const target = workspaceFolderUri.fsPath;
        // Prefer exact match, then longest prefix match
        let best: GitRepository | null = null;
        let bestLen = -1;
        for (const repo of api.repositories) {
            const repoPath = repo.rootUri.fsPath;
            if (target.startsWith(repoPath) && repoPath.length > bestLen) {
                best = repo;
                bestLen = repoPath.length;
            }
        }
        return best;
    }
}
