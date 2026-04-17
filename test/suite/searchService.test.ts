/**
 * Unit tests for SearchService.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { SearchService } from '../../src/services/SearchService';
import { Issue, IssueStoreIndex, Milestone, Sprint, IssueTemplate } from '../../src/types';
import { IStorageProvider } from '../../src/storage/IStorageProvider';

// ---------------------------------------------------------------------------
// In-memory stub
// ---------------------------------------------------------------------------

class MemStub implements IStorageProvider {
    label = 'mem';
    private issues = new Map<string, Issue>();
    private milestones: Milestone[] = [];
    private sprints: Sprint[] = [];
    private templates: IssueTemplate[] = [];
    private index: IssueStoreIndex | null = null;
    private readonly uri = { fsPath: '/mem', toString: () => 'mem:', scheme: 'mem' } as unknown as import('vscode').Uri;

    async initialise() { /* no-op */ }
    async readIndex() { return this.index; }
    async writeIndex(idx: IssueStoreIndex) { this.index = idx; }
    async readAllIssues() { return Array.from(this.issues.values()); }
    async readIssue(id: string) { return this.issues.get(id) ?? null; }
    async writeIssue(issue: Issue) { this.issues.set(issue.id, issue); }
    async deleteIssue(id: string) { this.issues.delete(id); }
    async readMilestones() { return this.milestones; }
    async writeMilestones(ms: Milestone[]) { this.milestones = ms; }
    async readSprints() { return this.sprints; }
    async writeSprints(ss: Sprint[]) { this.sprints = ss; }
    async readTemplates() { return this.templates; }
    async readKnownTags() { return []; }
    async writeKnownTags() { }
    async readKnownPersons() { return []; }
    async writeKnownPersons() { }
    async writeTemplates(ts: IssueTemplate[]) { this.templates = ts; }
    getRootUri() { return this.uri; }
}

type PartialIssue = Omit<Issue, 'id' | 'sequentialId' | 'createdAt' | 'updatedAt'>;
function mkPart(overrides: Partial<PartialIssue> = {}): PartialIssue {
    return {
        title: 'Test Issue',
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
        reportedBy: 'alice',
        assignedTo: null,
        resolvedAt: null,
        codeLinks: [],
        relations: [],
        comments: [],
        workspaceFolder: null,
        templateId: null,
        ...overrides,
    };
}

describe('SearchService', () => {
    let db: IssueDatabase;
    let search: SearchService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        search = new SearchService(db);
    });

    afterEach(() => {
        db.dispose();
    });

    test('search() returns empty array for blank query', () => {
        const results = search.search('');
        assert.strictEqual(results.length, 0);
    });

    test('search() returns empty array for whitespace-only query', () => {
        const results = search.search('   ');
        assert.strictEqual(results.length, 0);
    });

    test('search() matches on title', async () => {
        await db.createIssue(mkPart({ title: 'Login page crash' }));
        await db.createIssue(mkPart({ title: 'Signup error' }));

        const results = search.search('login');
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].issue.title.toLowerCase().includes('login'));
    });

    test('search() matches on description', async () => {
        await db.createIssue(mkPart({ title: 'Bug', description: 'The authentication flow fails' }));
        await db.createIssue(mkPart({ title: 'Task', description: 'Nothing relevant' }));

        const results = search.search('authentication');
        assert.strictEqual(results.length, 1);
    });

    test('search() matches on tag', async () => {
        await db.createIssue(mkPart({ title: 'A', tags: ['frontend', 'auth'] }));
        await db.createIssue(mkPart({ title: 'B', tags: ['backend'] }));

        const results = search.search('auth');
        assert.ok(results.length >= 1);
        assert.ok(results.some((r) => r.issue.tags.includes('auth') || r.issue.tags.includes('frontend')));
    });

    test('search() matchedFields contains the matched categories', async () => {
        await db.createIssue(mkPart({ title: 'crash', description: 'crash on startup', tags: ['crash'] }));

        const results = search.search('crash');
        assert.strictEqual(results.length, 1);
        const fields = results[0].matchedFields;
        assert.ok(fields.includes('title'));
    });

    test('search() ranks results with more matches higher', async () => {
        // Issue A appears in title + description + tags = 3 fields
        await db.createIssue(mkPart({
            title: 'alpha crash',
            description: 'alpha description',
            tags: ['alpha'],
        }));
        // Issue B appears in title only = 1 field
        await db.createIssue(mkPart({ title: 'alpha issue' }));

        const results = search.search('alpha');
        assert.ok(results.length >= 2);
        // Issue with more field matches should come first
        assert.ok(results[0].matchedFields.length >= results[1].matchedFields.length);
    });

    test('search() is case-insensitive', async () => {
        await db.createIssue(mkPart({ title: 'UPPERCASE CRASH' }));
        const results = search.search('uppercase');
        assert.strictEqual(results.length, 1);
    });

    test('quickFind() finds by sequential ID with # prefix', async () => {
        const issue = await db.createIssue(mkPart({ title: 'Target Issue' }));
        const seqId = issue.sequentialId;

        const results = search.quickFind(`#${seqId}`);
        assert.ok(results.length > 0);
        assert.ok(results.some((r) => r.id === issue.id));
    });

    test('quickFind() returns issues matching partial title', async () => {
        await db.createIssue(mkPart({ title: 'Database migration fails' }));
        await db.createIssue(mkPart({ title: 'Auth token expired' }));

        const results = search.quickFind('migr');
        assert.ok(results.length >= 1);
        assert.ok(results[0].title.toLowerCase().includes('migr'));
    });

    test('findByTag() returns only issues with exact tag match', async () => {
        await db.createIssue(mkPart({ tags: ['security', 'backend'] }));
        await db.createIssue(mkPart({ tags: ['frontend'] }));

        const results = search.findByTag('security');
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].tags.includes('security'));
    });

    test('search() matches on comment body', async () => {
        const issue = await db.createIssue(mkPart());
        // Manually inject a comment
        await db.updateIssue(issue.id, {
            comments: [{
                id: 'c1',
                body: 'The root cause is a threading issue',
                author: 'bob',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }],
        });

        const results = search.search('threading');
        assert.strictEqual(results.length, 1);
        assert.ok(results[0].matchedFields.includes('commentBody'));
    });
});
