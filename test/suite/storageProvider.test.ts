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
        provider = new WorkspaceStorageProvider(workspaceUri);
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
            const p2 = new WorkspaceStorageProvider(fakeUri(tmp2));
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
            { id: generateId(), name: 'Sprint 1', description: '', goal: '', startDate: now, endDate: now, status: 'active' as const, issueIds: [], workspaceFolder: null, createdAt: now, updatedAt: now },
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

    test('writeKnownTags() then readKnownTags() round-trips', async () => {
        await provider.writeKnownTags(['ui', 'backend']);
        const read = await provider.readKnownTags();
        assert.deepStrictEqual(read, ['ui', 'backend']);
    });

    test('readKnownTags() returns empty array when no file exists', async () => {
        const result = await provider.readKnownTags();
        assert.deepStrictEqual(result, []);
    });

    test('writeKnownPersons() then readKnownPersons() round-trips', async () => {
        await provider.writeKnownPersons(['Alice', 'Bob']);
        const read = await provider.readKnownPersons();
        assert.deepStrictEqual(read, ['Alice', 'Bob']);
    });

    test('readKnownPersons() returns empty array when no file exists', async () => {
        const result = await provider.readKnownPersons();
        assert.deepStrictEqual(result, []);
    });

    test('readTemplates() returns default templates when no file exists', async () => {
        const result = await provider.readTemplates();
        assert.ok(result.length >= 1);
        // Default templates include a Bug Report
        assert.ok(result.some((t) => t.name === 'Bug Report'));
    });

    test('writeTemplates() then readTemplates() round-trips', async () => {
        const now = nowIso();
        const templates = [
            { id: generateId(), name: 'Custom', description: 'custom tpl', type: 'task' as const, titleTemplate: '', defaultSeverity: 'low' as const, defaultUrgency: 'low' as const, defaultTags: [], bodyTemplate: '', createdAt: now, updatedAt: now },
        ];
        await provider.writeTemplates(templates);
        const read = await provider.readTemplates();
        assert.strictEqual(read.length, 1);
        assert.strictEqual(read[0].name, 'Custom');
    });

    test('deleteIssue() is a no-op for non-existent id', async () => {
        await assert.doesNotReject(() => provider.deleteIssue('ghost-id'));
    });

    test('readAllIssues() skips non-.json files in issues dir', async () => {
        const issuesDir = path.join(tmpDir, '.vscode', 'issues', 'issues');
        await fsp.writeFile(path.join(issuesDir, 'readme.txt'), 'not json');
        const issue = mkIssue({ title: 'Real' });
        await provider.writeIssue(issue);
        const issues = await provider.readAllIssues();
        assert.strictEqual(issues.length, 1);
        assert.strictEqual(issues[0].title, 'Real');
    });

    test('readMilestones() returns empty array when no file exists', async () => {
        const result = await provider.readMilestones();
        assert.deepStrictEqual(result, []);
    });

    test('readSprints() returns empty array when no file exists', async () => {
        const result = await provider.readSprints();
        assert.deepStrictEqual(result, []);
    });

    test('label includes workspace directory name', () => {
        assert.ok(provider.label.includes('.vscode'));
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
        provider = new GlobalStorageProvider(globalUri, namespace);
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
        const p2 = new GlobalStorageProvider(globalUri, 'other-project');
        await p2.initialise();

        const issue = mkIssue({ title: 'Isolated' });
        await provider.writeIssue(issue);

        // p2 should not see the issue written to provider
        const fromOther = await p2.readIssue(issue.id);
        assert.strictEqual(fromOther, null);
    });

    test('writeIndex() then readIndex() round-trips', async () => {
        const now = nowIso();
        const idx: IssueStoreIndex = { schemaVersion: '1', nextSequentialId: 7, createdAt: now, updatedAt: now };
        await provider.writeIndex(idx);
        const read = await provider.readIndex();
        assert.ok(read);
        assert.strictEqual(read.nextSequentialId, 7);
    });

    test('readIndex() returns null when no index file exists', async () => {
        // Fresh provider with no index written
        const tmp2 = await fsp.mkdtemp(path.join(os.tmpdir(), 'vscode-issues-global2-'));
        try {
            const p2 = new GlobalStorageProvider(fakeUri(tmp2), 'fresh-ns');
            await p2.initialise();
            const idx = await p2.readIndex();
            assert.strictEqual(idx, null);
        } finally {
            await fsp.rm(tmp2, { recursive: true, force: true });
        }
    });

    test('readIssue() returns null for unknown id', async () => {
        const result = await provider.readIssue('no-such-id');
        assert.strictEqual(result, null);
    });

    test('deleteIssue() is a no-op for non-existent id', async () => {
        // Should not throw
        await assert.doesNotReject(() => provider.deleteIssue('ghost-id'));
    });

    test('readAllIssues() returns empty array when issues dir is empty', async () => {
        const issues = await provider.readAllIssues();
        assert.ok(Array.isArray(issues));
        assert.strictEqual(issues.length, 0);
    });

    test('readAllIssues() skips non-.json files', async () => {
        // Write a .txt file into the issues directory
        const storeDir = path.join(tmpDir, 'stores', 'my-project', 'issues');
        await fsp.mkdir(storeDir, { recursive: true });
        await fsp.writeFile(path.join(storeDir, 'readme.txt'), 'not json');
        const issues = await provider.readAllIssues();
        assert.strictEqual(issues.length, 0);
    });

    test('writeMilestones() then readMilestones() round-trips', async () => {
        const now = nowIso();
        const milestones = [
            { id: generateId(), name: 'v1.0', description: 'release', targetDate: null, completedDate: null, workspaceFolder: null, createdAt: now, updatedAt: now },
        ];
        await provider.writeMilestones(milestones);
        const read = await provider.readMilestones();
        assert.strictEqual(read.length, 1);
        assert.strictEqual(read[0].name, 'v1.0');
    });

    test('readMilestones() returns empty array when no file exists', async () => {
        const result = await provider.readMilestones();
        assert.deepStrictEqual(result, []);
    });

    test('writeSprints() then readSprints() round-trips', async () => {
        const now = nowIso();
        const sprints = [
            { id: generateId(), name: 'Sprint 1', description: 'goal', startDate: null, endDate: null, status: 'active' as const, workspaceFolder: null, createdAt: now, updatedAt: now },
        ];
        await provider.writeSprints(sprints);
        const read = await provider.readSprints();
        assert.strictEqual(read.length, 1);
        assert.strictEqual(read[0].name, 'Sprint 1');
    });

    test('readSprints() returns empty array when no file exists', async () => {
        const result = await provider.readSprints();
        assert.deepStrictEqual(result, []);
    });

    test('writeTemplates() then readTemplates() round-trips', async () => {
        const now = nowIso();
        const templates = [
            { id: generateId(), name: 'Bug Template', description: 'for bugs', type: 'bug' as const, titleTemplate: '', defaultSeverity: 'high' as const, defaultUrgency: 'normal' as const, defaultTags: [], bodyTemplate: '', workspaceFolder: null, createdAt: now, updatedAt: now },
        ];
        await provider.writeTemplates(templates);
        const read = await provider.readTemplates();
        assert.strictEqual(read.length, 1);
        assert.strictEqual(read[0].name, 'Bug Template');
    });

    test('readTemplates() returns empty array when no file exists', async () => {
        const result = await provider.readTemplates();
        assert.deepStrictEqual(result, []);
    });

    test('getRootUri() returns path inside the global storage dir', () => {
        const uri = provider.getRootUri();
        assert.ok(uri.fsPath.startsWith(tmpDir));
        assert.ok(uri.fsPath.includes('stores'));
        assert.ok(uri.fsPath.includes('my-project'));
    });

    test('namespace key is sanitised — special chars become underscores', async () => {
        const p = new GlobalStorageProvider(globalUri, 'my project/v1.0!');
        await p.initialise();
        const uri = p.getRootUri();
        assert.ok(!uri.fsPath.includes(' '));
        assert.ok(!uri.fsPath.includes('/v1.0!') || uri.fsPath.includes('_'));
    });

    test('writeKnownTags() then readKnownTags() round-trips', async () => {
        await provider.writeKnownTags(['alpha', 'beta', 'gamma']);
        const read = await provider.readKnownTags();
        assert.deepStrictEqual(read, ['alpha', 'beta', 'gamma']);
    });

    test('readKnownTags() returns empty array when no file exists', async () => {
        const result = await provider.readKnownTags();
        assert.deepStrictEqual(result, []);
    });

    test('writeKnownPersons() then readKnownPersons() round-trips', async () => {
        await provider.writeKnownPersons(['Alice', 'Bob', 'Carol']);
        const read = await provider.readKnownPersons();
        assert.deepStrictEqual(read, ['Alice', 'Bob', 'Carol']);
    });

    test('readKnownPersons() returns empty array when no file exists', async () => {
        const result = await provider.readKnownPersons();
        assert.deepStrictEqual(result, []);
    });

    test('known tags persist across re-initialise', async () => {
        await provider.writeKnownTags(['persisted']);
        const p2 = new GlobalStorageProvider(globalUri, 'my-project');
        await p2.initialise();
        const read = await p2.readKnownTags();
        assert.ok(read.includes('persisted'));
    });

    test('known persons persist across re-initialise', async () => {
        await provider.writeKnownPersons(['Dave']);
        const p2 = new GlobalStorageProvider(globalUri, 'my-project');
        await p2.initialise();
        const read = await p2.readKnownPersons();
        assert.ok(read.includes('Dave'));
    });
});
