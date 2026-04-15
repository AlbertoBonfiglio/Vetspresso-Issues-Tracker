/**
 * Unit tests for IssueDatabase using an in-memory storage stub.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { IStorageProvider } from '../../src/storage/IStorageProvider';
import {
    Issue,
    Milestone,
    Sprint,
    IssueTemplate,
    IssueStoreIndex,
} from '../../src/types';
import { generateId, nowIso } from '../../src/utils/idGenerator';

// ---------------------------------------------------------------------------
// In-memory storage stub
// ---------------------------------------------------------------------------

class MemoryStorageProvider implements IStorageProvider {
    label = 'memory';
    private issues = new Map<string, Issue>();
    private milestones: Milestone[] = [];
    private sprints: Sprint[] = [];
    private templates: IssueTemplate[] = [];
    private index: IssueStoreIndex | null = null;
    private readonly vscodeUri = { fsPath: '/memory', toString: () => 'memory:', scheme: 'memory' } as unknown as import('vscode').Uri;

    async initialise(): Promise<void> { /* no-op */ }
    async readIndex(): Promise<IssueStoreIndex | null> { return this.index; }
    async writeIndex(idx: IssueStoreIndex): Promise<void> { this.index = idx; }
    async readAllIssues(): Promise<Issue[]> { return Array.from(this.issues.values()); }
    async readIssue(id: string): Promise<Issue | null> { return this.issues.get(id) ?? null; }
    async writeIssue(issue: Issue): Promise<void> { this.issues.set(issue.id, issue); }
    async deleteIssue(id: string): Promise<void> { this.issues.delete(id); }
    async readMilestones(): Promise<Milestone[]> { return this.milestones; }
    async writeMilestones(ms: Milestone[]): Promise<void> { this.milestones = ms; }
    async readSprints(): Promise<Sprint[]> { return this.sprints; }
    async writeSprints(ss: Sprint[]): Promise<void> { this.sprints = ss; }
    async readTemplates(): Promise<IssueTemplate[]> { return this.templates; }
    async writeTemplates(ts: IssueTemplate[]): Promise<void> { this.templates = ts; }
    getRootUri() { return this.vscodeUri; }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function makeIssuePart(): Omit<Issue, 'id' | 'sequentialId' | 'createdAt' | 'updatedAt'> {
    return {
        title: 'Test Issue',
        description: 'A description',
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
        reportedBy: 'tester',
        assignedTo: null,
        resolvedAt: null,
        codeLinks: [],
        relations: [],
        comments: [],
        workspaceFolder: null,
        templateId: null,
    };
}

describe('IssueDatabase', () => {
    let db: IssueDatabase;
    let storage: MemoryStorageProvider;

    beforeEach(async () => {
        storage = new MemoryStorageProvider();
        db = new IssueDatabase(storage);
        await db.load();
    });

    afterEach(() => {
        db.dispose();
    });

    test('load() creates a default index with nextSequentialId = 1', async () => {
        const idx = await storage.readIndex();
        assert.ok(idx);
        assert.strictEqual(idx.nextSequentialId, 1);
        const issue = await db.createIssue(makeIssuePart());
        assert.strictEqual(issue.sequentialId, 1);

        const issue2 = await db.createIssue({ ...makeIssuePart(), title: 'Second' });
        assert.strictEqual(issue2.sequentialId, 2);
    });

    test('createIssue() persists to storage', async () => {
        const issue = await db.createIssue(makeIssuePart());
        const stored = await storage.readIssue(issue.id);
        assert.ok(stored);
        assert.strictEqual(stored.title, 'Test Issue');
    });

    test('getIssue() returns the created issue', async () => {
        const created = await db.createIssue(makeIssuePart());
        const found = db.getIssue(created.id);
        assert.ok(found);
        assert.strictEqual(found.title, 'Test Issue');
    });

    test('getIssue() returns null for unknown id', () => {
        assert.strictEqual(db.getIssue('nonexistent'), null);
    });

    test('getAllIssues() returns all issues', async () => {
        await db.createIssue(makeIssuePart());
        await db.createIssue({ ...makeIssuePart(), title: 'Second' });
        assert.strictEqual(db.getAllIssues().length, 2);
    });

    test('updateIssue() modifies fields and refreshes updatedAt', async () => {
        const issue = await db.createIssue(makeIssuePart());
        const before = issue.updatedAt;

        // Small delay to ensure timestamp differs
        await new Promise<void>((r) => setTimeout(r, 5));

        const updated = await db.updateIssue(issue.id, { title: 'Updated Title' });
        assert.strictEqual(updated.title, 'Updated Title');
        assert.ok(updated.updatedAt >= before);
    });

    test('updateIssue() preserves immutable fields', async () => {
        const issue = await db.createIssue(makeIssuePart());
        const updated = await db.updateIssue(issue.id, { title: 'X' });
        assert.strictEqual(updated.id, issue.id);
        assert.strictEqual(updated.sequentialId, issue.sequentialId);
        assert.strictEqual(updated.createdAt, issue.createdAt);
    });

    test('updateIssue() throws for unknown id', async () => {
        await assert.rejects(() => db.updateIssue('nope', { title: 'X' }), /not found/i);
    });

    test('deleteIssue() returns true and removes from cache', async () => {
        const issue = await db.createIssue(makeIssuePart());
        const result = await db.deleteIssue(issue.id);
        assert.strictEqual(result, true);
        assert.strictEqual(db.getIssue(issue.id), null);
    });

    test('deleteIssue() returns false for unknown id', async () => {
        const result = await db.deleteIssue('nope');
        assert.strictEqual(result, false);
    });

    test('onIssueChanged fires on create', async () => {
        let fired = false;
        db.onIssueChanged(() => { fired = true; });
        await db.createIssue(makeIssuePart());
        assert.strictEqual(fired, true);
    });

    test('onIssueChanged fires on delete', async () => {
        const issue = await db.createIssue(makeIssuePart());
        let fired = false;
        db.onIssueChanged(() => { fired = true; });
        await db.deleteIssue(issue.id);
        assert.strictEqual(fired, true);
    });

    test('getOpenCount() returns correct count', async () => {
        await db.createIssue(makeIssuePart());
        await db.createIssue({ ...makeIssuePart(), status: 'resolved' });
        assert.strictEqual(db.getOpenCount(), 1);
    });

    test('getCriticalCount() returns correct count', async () => {
        await db.createIssue({ ...makeIssuePart(), severity: 'critical' });
        await db.createIssue({ ...makeIssuePart(), severity: 'high' });
        assert.strictEqual(db.getCriticalCount(), 1);
    });

    test('getAllTags() aggregates unique tags', async () => {
        await db.createIssue({ ...makeIssuePart(), tags: ['bug', 'urgent'] });
        await db.createIssue({ ...makeIssuePart(), tags: ['bug', 'backend'] });
        const tags = db.getAllTags();
        assert.ok(tags.includes('bug'));
        assert.ok(tags.includes('urgent'));
        assert.ok(tags.includes('backend'));
        assert.strictEqual(tags.filter((t) => t === 'bug').length, 1);
    });

    // Milestones
    test('createMilestone() persists and is retrievable', async () => {
        const m = await db.createMilestone({
            name: 'v1.0',
            description: '',
            targetDate: null,
            completedDate: null,
            workspaceFolder: null,
        });
        const found = db.getMilestone(m.id);
        assert.ok(found);
        assert.strictEqual(found.name, 'v1.0');
    });

    test('deleteMilestone() detaches from issues', async () => {
        const m = await db.createMilestone({ name: 'M', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        const issue = await db.createIssue({ ...makeIssuePart(), milestoneId: m.id });
        await db.deleteMilestone(m.id);
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.milestoneId, null);
    });
});
