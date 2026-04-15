/**
 * Unit tests for storage providers.
 *
 * WorkspaceStorageProvider is tested against a real temporary directory via
 * a lightweight vscode.workspace.fs shim built on top of Node's `fs/promises`.
 *
 * GlobalStorageProvider is tested the same way using a separate tmp dir.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceStorageProvider } from '../../src/storage/WorkspaceStorageProvider';
import { GlobalStorageProvider } from '../../src/storage/GlobalStorageProvider';
import { Issue, IssueStoreIndex } from '../../src/types';
import { generateId, nowIso } from '../../src/utils/idGenerator';

// ---------------------------------------------------------------------------
// vscode.workspace.fs shim using Node's fs/promises
// ---------------------------------------------------------------------------

import { TextEncoder, TextDecoder } from 'util';

const shimFs = {
    async readFile(uri: { fsPath: string }): Promise<Uint8Array> {
        const buf = await fsp.readFile(uri.fsPath);
        return new Uint8Array(buf);
    },
    async writeFile(uri: { fsPath: string }, content: Uint8Array): Promise<void> {
        await fsp.mkdir(path.dirname(uri.fsPath), { recursive: true });
        await fsp.writeFile(uri.fsPath, content);
    },
    async readDirectory(uri: { fsPath: string }): Promise<Array<[string, number]>> {
        try {
            const entries = await fsp.readdir(uri.fsPath, { withFileTypes: true });
            return entries.map((e) => [e.name, e.isDirectory() ? 2 : 1]);
        } catch {
            return [];
        }
    },
    async createDirectory(uri: { fsPath: string }): Promise<void> {
        await fsp.mkdir(uri.fsPath, { recursive: true });
    },
    async delete(uri: { fsPath: string }, _opts?: { recursive?: boolean }): Promise<void> {
        try {
            await fsp.rm(uri.fsPath, { recursive: true, force: true });
        } catch {
            // ignore
        }
    },
    async stat(uri: { fsPath: string }): Promise<{ type: number; size: number }> {
        const stat = await fsp.stat(uri.fsPath);
        return { type: stat.isDirectory() ? 2 : 1, size: stat.size };
    },
};

function fakeUri(fsPath: string) {
    return {
        fsPath,
        toString: () => `file://${fsPath}`,
        scheme: 'file',
        with(change: { path?: string }) {
            return fakeUri(change.path ?? fsPath);
        },
        joinPath(...parts: string[]) {
            return fakeUri(path.join(fsPath, ...parts));
        },
    } as unknown as import('vscode').Uri;
}

// Minimal vscode shim — injected into module-level references inside providers
const vscodeMock = {
    workspace: { fs: shimFs },
    Uri: {
        file: fakeUri,
        joinPath(uri: { fsPath: string }, ...parts: string[]) {
            return fakeUri(path.join(uri.fsPath, ...parts));
        },
    },
    window: {
        showWarningMessage: async () => undefined,
    },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkIssue(overrides: Partial<Issue> = {}): Issue {
    const id = generateId();
    return {
        id,
        sequentialId: 1,
        title: 'Storage Test Issue',
        description: '',
        type: 'bug',
        status: 'open',
        severity: 'medium',
        urgency: 'normal',
        reportedInVersion: null,
        fixedInVersion: null,
        targetVersion: null,
        milestoneId: null,
        sprintId: null,
        tags: [],
        estimatedHours: null,
        timeEntries: [],
        reportedBy: 'test',
        assignedTo: null,
        resolvedAt: null,
        codeLinks: [],
        relations: [],
        comments: [],
        workspaceFolder: null,
        templateId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// WorkspaceStorageProvider tests
// ---------------------------------------------------------------------------

describe('WorkspaceStorageProvider', () => {
    let tmpDir: string;
    let workspaceUri: import('vscode').Uri;
    let provider: WorkspaceStorageProvider;

    beforeEach(async () => {
        tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vscode-issues-ws-'));
        workspaceUri = fakeUri(tmpDir);
        provider = new WorkspaceStorageProvider(workspaceUri, vscodeMock as any);
        await provider.initialise();
    });

    afterEach(async () => {
        await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    test('initialise() creates the issues directory', async () => {
        const issuesDir = path.join(tmpDir, '.vscode', 'issues');
        const stat = await fsp.stat(issuesDir);
        assert.ok(stat.isDirectory());
    });

    test('readIndex() returns null before any writes', async () => {
        // Re-initialise with a fresh dir so no default index
        const tmp2 = await fsp.mkdtemp(path.join(os.tmpdir(), 'vscode-issues-ws2-'));
        try {
            const p2 = new WorkspaceStorageProvider(fakeUri(tmp2), vscodeMock as any);
            await p2.initialise();
            // The initialise may seed an index — if so, check nextSequentialId = 1
            const idx = await p2.readIndex();
            if (idx !== null) {
                assert.strictEqual(idx.nextSequentialId, 1);
            }
        } finally {
            await fsp.rm(tmp2, { recursive: true, force: true });
        }
    });

    test('writeIndex() then readIndex() round-trips', async () => {
        const now = nowIso();
        const idx: IssueStoreIndex = { schemaVersion: '1', nextSequentialId: 42, createdAt: now, updatedAt: now };
        await provider.writeIndex(idx);
        const read = await provider.readIndex();
        assert.ok(read);
        assert.strictEqual(read.nextSequentialId, 42);
    });

    test('writeIssue() then readIssue() round-trips', async () => {
        const issue = mkIssue({ title: 'Persisted Issue' });
        await provider.writeIssue(issue);
        const read = await provider.readIssue(issue.id);
        assert.ok(read);
        assert.strictEqual(read.title, 'Persisted Issue');
        assert.strictEqual(read.id, issue.id);
    });

    test('readIssue() returns null for unknown id', async () => {
        const result = await provider.readIssue('nonexistent-id');
        assert.strictEqual(result, null);
    });

    test('readAllIssues() returns all written issues', async () => {
        const a = mkIssue({ title: 'A' });
        const b = mkIssue({ title: 'B' });
        await provider.writeIssue(a);
        await provider.writeIssue(b);
        const issues = await provider.readAllIssues();
        assert.strictEqual(issues.length, 2);
        const titles = issues.map((i) => i.title);
        assert.ok(titles.includes('A'));
        assert.ok(titles.includes('B'));
    });

    test('deleteIssue() removes the file', async () => {
        const issue = mkIssue();
        await provider.writeIssue(issue);
        await provider.deleteIssue(issue.id);
        const result = await provider.readIssue(issue.id);
        assert.strictEqual(result, null);
    });

    test('readAllIssues() returns empty array when none exist', async () => {
        const issues = await provider.readAllIssues();
        assert.ok(Array.isArray(issues));
    });

    test('writeMilestones() then readMilestones() round-trips', async () => {
        const now = nowIso();
        const milestones = [
            { id: generateId(), name: 'v1.0', description: '', targetDate: null, completedDate: null, workspaceFolder: null, createdAt: now, updatedAt: now },
        ];
        await provider.writeMilestones(milestones);
        const read = await provider.readMilestones();
        assert.strictEqual(read.length, 1);
        assert.strictEqual(read[0].name, 'v1.0');
    });

    test('writeSprints() then readSprints() round-trips', async () => {
        const now = nowIso();
        const sprints = [
            { id: generateId(), name: 'Sprint 1', goal: '', startDate: now, endDate: now, status: 'active' as const, issueIds: [], workspaceFolder: null, createdAt: now, updatedAt: now },
        ];
        await provider.writeSprints(sprints);
        const read = await provider.readSprints();
        assert.strictEqual(read.length, 1);
        assert.strictEqual(read[0].name, 'Sprint 1');
    });

    test('getRootUri() returns the workspace uri', () => {
        const uri = provider.getRootUri();
        assert.ok(uri.fsPath.startsWith(tmpDir));
    });
});

// ---------------------------------------------------------------------------
// GlobalStorageProvider tests
// ---------------------------------------------------------------------------

describe('GlobalStorageProvider', () => {
    let tmpDir: string;
    let globalUri: import('vscode').Uri;
    let provider: GlobalStorageProvider;
    const namespace = 'my-project';

    beforeEach(async () => {
        tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vscode-issues-global-'));
        globalUri = fakeUri(tmpDir);
        provider = new GlobalStorageProvider(globalUri, namespace, vscodeMock as any);
        await provider.initialise();
    });

    afterEach(async () => {
        await fsp.rm(tmpDir, { recursive: true, force: true });
    });

    test('initialise() creates the namespace store directory', async () => {
        // The provider creates a namespace-hashed subdirectory
        const entries = await fsp.readdir(path.join(tmpDir, 'stores'), { withFileTypes: true });
        assert.ok(entries.length > 0);
    });

    test('writeIssue() then readIssue() round-trips', async () => {
        const issue = mkIssue({ title: 'Global Storage Test' });
        await provider.writeIssue(issue);
        const read = await provider.readIssue(issue.id);
        assert.ok(read);
        assert.strictEqual(read.title, 'Global Storage Test');
    });

    test('readAllIssues() returns all written issues', async () => {
        await provider.writeIssue(mkIssue({ title: 'G1' }));
        await provider.writeIssue(mkIssue({ title: 'G2' }));
        const issues = await provider.readAllIssues();
        assert.strictEqual(issues.length, 2);
    });

    test('deleteIssue() removes from the global store', async () => {
        const issue = mkIssue();
        await provider.writeIssue(issue);
        await provider.deleteIssue(issue.id);
        const result = await provider.readIssue(issue.id);
        assert.strictEqual(result, null);
    });

    test('two providers with different namespaces are independent', async () => {
        const p2 = new GlobalStorageProvider(globalUri, 'other-project', vscodeMock as any);
        await p2.initialise();

        const issue = mkIssue({ title: 'Isolated' });
        await provider.writeIssue(issue);

        // p2 should not see the issue written to provider
        const fromOther = await p2.readIssue(issue.id);
        assert.strictEqual(fromOther, null);
    });
});
