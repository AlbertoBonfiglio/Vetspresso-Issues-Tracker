/**
 * Unit tests for IssueDatabase using an in-memory storage stub.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { IStorageProvider } from '../../src/storage/IStorageProvider';
import {
    Issue,
    Milestone,
    Sprint,
    IssueTemplate,
    IssueStoreIndex,
} from '../../src/types';

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
    async readKnownTags(): Promise<string[]> { return []; }
    async writeKnownTags(_tags: string[]): Promise<void> { }
    async readKnownPersons(): Promise<string[]> { return []; }
    async writeKnownPersons(_persons: string[]): Promise<void> { }
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

    // Known tags
    test('getKnownTags() returns empty list on fresh db', () => {
        assert.deepStrictEqual(db.getKnownTags(), []);
    });

    test('addKnownTag() persists and returns in getKnownTags()', async () => {
        await db.addKnownTag('frontend');
        await db.addKnownTag('backend');
        const tags = db.getKnownTags();
        assert.ok(tags.includes('frontend'));
        assert.ok(tags.includes('backend'));
    });

    test('addKnownTag() is idempotent', async () => {
        await db.addKnownTag('dup');
        await db.addKnownTag('dup');
        assert.strictEqual(db.getKnownTags().filter((t) => t === 'dup').length, 1);
    });

    test('addKnownTag() trims whitespace', async () => {
        await db.addKnownTag('  trimmed  ');
        assert.ok(db.getKnownTags().includes('trimmed'));
    });

    test('addKnownTag() ignores empty string', async () => {
        await db.addKnownTag('');
        assert.strictEqual(db.getKnownTags().length, 0);
    });

    // Known persons
    test('getKnownPersons() returns empty list on fresh db', () => {
        assert.deepStrictEqual(db.getKnownPersons(), []);
    });

    test('addKnownPerson() persists and returns in getKnownPersons()', async () => {
        await db.addKnownPerson('Alice');
        await db.addKnownPerson('Bob');
        const persons = db.getKnownPersons();
        assert.ok(persons.includes('Alice'));
        assert.ok(persons.includes('Bob'));
    });

    test('addKnownPerson() is idempotent', async () => {
        await db.addKnownPerson('Alice');
        await db.addKnownPerson('Alice');
        assert.strictEqual(db.getKnownPersons().filter((p) => p === 'Alice').length, 1);
    });

    test('addKnownPerson() ignores empty string', async () => {
        await db.addKnownPerson('');
        assert.strictEqual(db.getKnownPersons().length, 0);
    });

    test('known tags are seeded from existing issue tags on load', async () => {
        // Dispose, create a new db with pre-seeded issues
        db.dispose();
        const storage2 = new MemoryStorageProvider();
        const db2 = new IssueDatabase(storage2);
        await db2.load();
        await db2.createIssue({ ...makeIssuePart(), tags: ['seeded-tag', 'another'] });
        db2.dispose();

        // Re-load from same storage — knownTags should be seeded from issues
        const db3 = new IssueDatabase(storage2);
        await db3.load();
        const tags = db3.getKnownTags();
        assert.ok(tags.includes('seeded-tag'), 'seeded-tag should be in knownTags');
        assert.ok(tags.includes('another'), 'another should be in knownTags');
        db3.dispose();
    });

    test('known persons are seeded from existing issue reporters and assignees on load', async () => {
        db.dispose();
        const storage2 = new MemoryStorageProvider();
        const db2 = new IssueDatabase(storage2);
        await db2.load();
        await db2.createIssue({ ...makeIssuePart(), reportedBy: 'reporter1', assignedTo: 'assignee1' });
        db2.dispose();

        const db3 = new IssueDatabase(storage2);
        await db3.load();
        const persons = db3.getKnownPersons();
        assert.ok(persons.includes('reporter1'));
        assert.ok(persons.includes('assignee1'));
        db3.dispose();
    });

    test('ensureLoaded throws when load() has not been called', () => {
        const rawDb = new IssueDatabase(new MemoryStorageProvider());
        // Call any public write method before load() — should throw
        assert.throws(() => (rawDb as any).ensureLoaded(), /must be awaited/i);
    });
});
