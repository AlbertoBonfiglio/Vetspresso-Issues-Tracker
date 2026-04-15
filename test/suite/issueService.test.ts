/**
 * Unit tests for IssueService.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { IssueService } from '../../src/services/IssueService';
import { Issue, IssueFilter, IssueType, IssueStatus, Severity } from '../../src/types';
import { nowIso } from '../../src/utils/idGenerator';

// ---------------------------------------------------------------------------
// Minimal storage stub (same pattern as issueDatabase.test.ts)
// ---------------------------------------------------------------------------

import {
    IStorageProvider,
} from '../../src/storage/IStorageProvider';
import { Milestone, Sprint, IssueTemplate, IssueStoreIndex } from '../../src/types';

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
    async writeTemplates(ts: IssueTemplate[]) { this.templates = ts; }
    getRootUri() { return this.uri; }
}

type PartialIssue = Omit<Issue, 'id' | 'sequentialId' | 'createdAt' | 'updatedAt'>;
function mkPart(overrides: Partial<PartialIssue> = {}): PartialIssue {
    return {
        title: 'Issue',
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

describe('IssueService', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });

    afterEach(() => {
        db.dispose();
    });

    // -------------------------------------------------------------------------
    // getIssues filter
    // -------------------------------------------------------------------------

    test('getIssues() returns all when no filter', async () => {
        await db.createIssue(mkPart());
        await db.createIssue(mkPart({ title: 'B' }));
        const issues = svc.getIssues();
        assert.strictEqual(issues.length, 2);
    });

    test('getIssues() filters by status', async () => {
        await db.createIssue(mkPart({ status: 'open' }));
        await db.createIssue(mkPart({ status: 'resolved' }));
        const filter: IssueFilter = { status: ['open'] };
        const issues = svc.getIssues(filter);
        assert.strictEqual(issues.length, 1);
        assert.strictEqual(issues[0].status, 'open');
    });

    test('getIssues() filters by type', async () => {
        await db.createIssue(mkPart({ type: 'bug' }));
        await db.createIssue(mkPart({ type: 'feature' }));
        const filter: IssueFilter = { type: ['feature'] };
        const issues = svc.getIssues(filter);
        assert.strictEqual(issues.length, 1);
        assert.strictEqual(issues[0].type, 'feature');
    });

    test('getIssues() filters by severity', async () => {
        await db.createIssue(mkPart({ severity: 'critical' }));
        await db.createIssue(mkPart({ severity: 'low' }));
        const filter: IssueFilter = { severity: ['critical'] };
        const issues = svc.getIssues(filter);
        assert.strictEqual(issues.length, 1);
        assert.strictEqual(issues[0].severity, 'critical');
    });

    test('getIssues() filters by tag', async () => {
        await db.createIssue(mkPart({ tags: ['frontend', 'auth'] }));
        await db.createIssue(mkPart({ tags: ['backend'] }));
        const filter: IssueFilter = { tags: ['frontend'] };
        const issues = svc.getIssues(filter);
        assert.strictEqual(issues.length, 1);
    });

    test('getIssues() filters by assignee', async () => {
        await db.createIssue(mkPart({ assignedTo: 'alice' }));
        await db.createIssue(mkPart({ assignedTo: 'bob' }));
        const filter: IssueFilter = { assignedTo: 'alice' };
        const issues = svc.getIssues(filter);
        assert.strictEqual(issues.length, 1);
        assert.strictEqual(issues[0].assignedTo, 'alice');
    });

    test('getIssues() staleOnly keeps only stale issues', async () => {
        const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
        const issue = await db.createIssue(mkPart({ status: 'open' }));
        // Backdate via private cache — updateIssue always stamps updatedAt=now
        const cached = (db as any).issueCache.get(issue.id);
        (db as any).issueCache.set(issue.id, { ...cached, updatedAt: oldDate });
        await db.createIssue(mkPart({ status: 'open' })); // fresh issue

        const filter: IssueFilter = { staleOnly: true };
        const issues = svc.getIssues(filter);
        // At least the backdated issue should appear
        assert.ok(issues.length >= 1);
        assert.ok(issues.some((i) => i.id === issue.id));
    });

    test('getIssues() searchText matches title', async () => {
        await db.createIssue(mkPart({ title: 'Login page crash' }));
        await db.createIssue(mkPart({ title: 'Signup error' }));
        const filter: IssueFilter = { searchText: 'login' };
        const issues = svc.getIssues(filter);
        assert.strictEqual(issues.length, 1);
        assert.ok(issues[0].title.toLowerCase().includes('login'));
    });

    // -------------------------------------------------------------------------
    // closeIssue / resolveIssue / reopenIssue
    // -------------------------------------------------------------------------

    test('closeIssue() sets status to closed', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.closeIssue(issue.id);
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.status, 'closed');
    });

    test('resolveIssue() sets status to resolved and fixedInVersion', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.resolveIssue(issue.id, 'v2.0');
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.status, 'resolved');
        assert.strictEqual(updated?.fixedInVersion, 'v2.0');
        assert.ok(updated?.resolvedAt);
    });

    test('reopenIssue() sets status back to open and clears resolvedAt', async () => {
        const issue = await db.createIssue(mkPart({ status: 'resolved', resolvedAt: nowIso() }));
        await svc.reopenIssue(issue.id);
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.status, 'open');
        assert.strictEqual(updated?.resolvedAt, null);
    });

    // -------------------------------------------------------------------------
    // Code link helpers
    // -------------------------------------------------------------------------

    test('getIssuesForFile() returns issues with matching codeLinks', async () => {
        const issue = await db.createIssue(mkPart({
            codeLinks: [{ id: 'cl1', workspaceFolder: null, filePath: 'src/auth.ts', startLine: 10, endLine: 15, snippet: '', createdAt: nowIso() }],
        }));
        await db.createIssue(mkPart()); // no links

        const matches = svc.getIssuesForFile('src/auth.ts');
        assert.strictEqual(matches.length, 1);
        assert.strictEqual(matches[0].id, issue.id);
    });

    test('getIssuesForLine() returns issues where line is within range', async () => {
        const issue = await db.createIssue(mkPart({
            codeLinks: [{ id: 'cl2', workspaceFolder: null, filePath: 'src/auth.ts', startLine: 10, endLine: 20, snippet: '', createdAt: nowIso() }],
        }));
        const miss = svc.getIssuesForLine('src/auth.ts', 5);
        const hit = svc.getIssuesForLine('src/auth.ts', 15);

        assert.strictEqual(miss.length, 0);
        assert.strictEqual(hit.length, 1);
        assert.strictEqual(hit[0].id, issue.id);
    });

    // -------------------------------------------------------------------------
    // Comment operations
    // -------------------------------------------------------------------------

    test('addComment() appends to issue comments', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.addComment(issue.id, 'First comment');
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.comments.length, 1);
        assert.strictEqual(updated?.comments[0].body, 'First comment');
    });

    test('deleteComment() removes comment from issue', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.addComment(issue.id, 'alice', 'Remove me');
        const issued = db.getIssue(issue.id)!;
        const commentId = issued.comments[0].id;
        await svc.deleteComment(issue.id, commentId);
        const afterDelete = db.getIssue(issue.id);
        assert.strictEqual(afterDelete?.comments.length, 0);
    });

    // -------------------------------------------------------------------------
    // Time logging
    // -------------------------------------------------------------------------

    test('logTime() appends a time entry', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.logTime(issue.id, 2.5, 'Initial work');
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.timeEntries.length, 1);
        assert.strictEqual(updated?.timeEntries[0].hours, 2.5);
    });

    // -------------------------------------------------------------------------
    // Relations
    // -------------------------------------------------------------------------

    test('addRelation() adds relation to source issue', async () => {
        const a = await db.createIssue(mkPart({ title: 'A' }));
        const b = await db.createIssue(mkPart({ title: 'B' }));
        await svc.addRelation(a.id, { type: 'blocks', targetIssueId: b.id });
        const updatedA = db.getIssue(a.id)!;
        assert.ok(updatedA.relations.some((r) => r.targetIssueId === b.id && r.type === 'blocks'));
    });
});
