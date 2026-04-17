/**
 * Unit tests for IssueService.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { IssueService } from '../../src/services/IssueService';
import { Issue, IssueFilter } from '../../src/types';
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
        await svc.addComment(issue.id, 'Remove me');
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

    // -------------------------------------------------------------------------
    // updateIssue — description, sprintId, milestoneId
    // -------------------------------------------------------------------------

    test('updateIssue() saves description', async () => {
        const issue = await db.createIssue(mkPart({ description: '' }));
        await svc.updateIssue(issue.id, { description: 'New description' });
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.description, 'New description');
    });

    test('updateIssue() clears description with empty string', async () => {
        const issue = await db.createIssue(mkPart({ description: 'Old description' }));
        await svc.updateIssue(issue.id, { description: '' });
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.description, '');
    });

    test('updateIssue() assigns sprintId', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.updateIssue(issue.id, { sprintId: 'sprint-abc' });
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.sprintId, 'sprint-abc');
    });

    test('updateIssue() clears sprintId with null', async () => {
        const issue = await db.createIssue(mkPart({ sprintId: 'sprint-abc' }));
        await svc.updateIssue(issue.id, { sprintId: null });
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.sprintId, null);
    });

    test('updateIssue() assigns milestoneId', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.updateIssue(issue.id, { milestoneId: 'ms-xyz' });
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.milestoneId, 'ms-xyz');
    });

    test('updateIssue() clears milestoneId with null', async () => {
        const issue = await db.createIssue(mkPart({ milestoneId: 'ms-xyz' }));
        await svc.updateIssue(issue.id, { milestoneId: null });
        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.milestoneId, null);
    });

    // -------------------------------------------------------------------------
    // updateIssue — version fields
    // -------------------------------------------------------------------------

    test('updateIssue() saves reportedInVersion', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.updateIssue(issue.id, { reportedInVersion: 'v1.0' });
        assert.strictEqual(db.getIssue(issue.id)?.reportedInVersion, 'v1.0');
    });

    test('updateIssue() clears reportedInVersion with null', async () => {
        const issue = await db.createIssue(mkPart({ reportedInVersion: 'v1.0' }));
        await svc.updateIssue(issue.id, { reportedInVersion: null });
        assert.strictEqual(db.getIssue(issue.id)?.reportedInVersion, null);
    });

    test('updateIssue() saves targetVersion', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.updateIssue(issue.id, { targetVersion: 'v2.0' });
        assert.strictEqual(db.getIssue(issue.id)?.targetVersion, 'v2.0');
    });

    test('updateIssue() clears targetVersion with null', async () => {
        const issue = await db.createIssue(mkPart({ targetVersion: 'v2.0' }));
        await svc.updateIssue(issue.id, { targetVersion: null });
        assert.strictEqual(db.getIssue(issue.id)?.targetVersion, null);
    });

    test('updateIssue() saves fixedInVersion', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.updateIssue(issue.id, { fixedInVersion: 'v1.1' });
        assert.strictEqual(db.getIssue(issue.id)?.fixedInVersion, 'v1.1');
    });

    test('updateIssue() clears fixedInVersion with null', async () => {
        const issue = await db.createIssue(mkPart({ fixedInVersion: 'v1.1' }));
        await svc.updateIssue(issue.id, { fixedInVersion: null });
        assert.strictEqual(db.getIssue(issue.id)?.fixedInVersion, null);
    });
});

// ---------------------------------------------------------------------------
// Additional coverage
// ---------------------------------------------------------------------------

describe('IssueService — getIssue / getOpenIssues / getIssuesForVersion / deleteIssue', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('getIssue() returns the issue by id', async () => {
        const created = await db.createIssue(mkPart({ title: 'X' }));
        const found = svc.getIssue(created.id);
        assert.ok(found);
        assert.strictEqual(found.id, created.id);
    });

    test('getIssue() returns null for unknown id', () => {
        assert.strictEqual(svc.getIssue('no-such-id'), null);
    });

    test('getOpenIssues() returns only open/in-progress/in-review', async () => {
        await db.createIssue(mkPart({ status: 'open' }));
        await db.createIssue(mkPart({ status: 'in-progress' }));
        await db.createIssue(mkPart({ status: 'in-review' }));
        await db.createIssue(mkPart({ status: 'closed' }));
        const open = svc.getOpenIssues();
        assert.strictEqual(open.length, 3);
        assert.ok(open.every((i) => ['open', 'in-progress', 'in-review'].includes(i.status)));
    });

    test('getIssuesForVersion() matches reportedInVersion, fixedInVersion, targetVersion', async () => {
        await db.createIssue(mkPart({ reportedInVersion: 'v1.0' }));
        await db.createIssue(mkPart({ fixedInVersion: 'v1.0' }));
        await db.createIssue(mkPart({ targetVersion: 'v1.0' }));
        await db.createIssue(mkPart({ reportedInVersion: 'v2.0' }));
        const hits = svc.getIssuesForVersion('v1.0');
        assert.strictEqual(hits.length, 3);
    });

    test('deleteIssue() removes the issue', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.deleteIssue(issue.id);
        assert.strictEqual(svc.getIssue(issue.id), null);
    });
});

describe('IssueService — removeCodeLink', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('removeCodeLink() removes the link by id', async () => {
        const link = { id: 'lnk1', workspaceFolder: null, filePath: 'src/a.ts', startLine: 1, endLine: 5, snippet: '', createdAt: nowIso() };
        const issue = await db.createIssue(mkPart({ codeLinks: [link] }));
        await svc.removeCodeLink(issue.id, 'lnk1');
        assert.strictEqual(db.getIssue(issue.id)?.codeLinks.length, 0);
    });

    test('removeCodeLink() throws for unknown issue', async () => {
        await assert.rejects(() => svc.removeCodeLink('no-issue', 'lnk1'));
    });
});

describe('IssueService — editComment / deleteComment', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('editComment() updates comment body', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.addComment(issue.id, 'original');
        const withComment = db.getIssue(issue.id)!;
        const commentId = withComment.comments[0].id;
        await svc.editComment(issue.id, commentId, 'updated');
        const updated = db.getIssue(issue.id)!;
        assert.strictEqual(updated.comments[0].body, 'updated');
    });

    test('editComment() throws for unknown issue', async () => {
        await assert.rejects(() => svc.editComment('no-issue', 'cid', 'body'));
    });

    test('deleteComment() removes comment', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.addComment(issue.id, 'to remove');
        const commentId = db.getIssue(issue.id)!.comments[0].id;
        await svc.deleteComment(issue.id, commentId);
        assert.strictEqual(db.getIssue(issue.id)!.comments.length, 0);
    });

    test('deleteComment() throws for unknown issue', async () => {
        await assert.rejects(() => svc.deleteComment('no-issue', 'cid'));
    });
});

describe('IssueService — removeRelation / removeTimeEntry', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('addRelation() is a no-op for duplicate relations', async () => {
        const a = await db.createIssue(mkPart({ title: 'A' }));
        const b = await db.createIssue(mkPart({ title: 'B' }));
        await svc.addRelation(a.id, { type: 'blocks', targetIssueId: b.id });
        await svc.addRelation(a.id, { type: 'blocks', targetIssueId: b.id });
        assert.strictEqual(db.getIssue(a.id)!.relations.length, 1);
    });

    test('addRelation() throws for unknown issue', async () => {
        await assert.rejects(() => svc.addRelation('no-issue', { type: 'blocks', targetIssueId: 'x' }));
    });

    test('removeRelation() removes by targetIssueId', async () => {
        const a = await db.createIssue(mkPart({ title: 'A' }));
        const b = await db.createIssue(mkPart({ title: 'B' }));
        await svc.addRelation(a.id, { type: 'blocks', targetIssueId: b.id });
        await svc.removeRelation(a.id, b.id);
        assert.strictEqual(db.getIssue(a.id)!.relations.length, 0);
    });

    test('removeRelation() throws for unknown issue', async () => {
        await assert.rejects(() => svc.removeRelation('no-issue', 'x'));
    });

    test('removeTimeEntry() removes the entry by id', async () => {
        const issue = await db.createIssue(mkPart());
        await svc.logTime(issue.id, 1, 'work');
        const entryId = db.getIssue(issue.id)!.timeEntries[0].id;
        await svc.removeTimeEntry(issue.id, entryId);
        assert.strictEqual(db.getIssue(issue.id)!.timeEntries.length, 0);
    });

    test('removeTimeEntry() throws for unknown issue', async () => {
        await assert.rejects(() => svc.removeTimeEntry('no-issue', 'eid'));
    });

    test('logTime() throws for unknown issue', async () => {
        await assert.rejects(() => svc.logTime('no-issue', 1, 'desc'));
    });
});

describe('IssueService — forwarded accessors (milestones / sprints / templates / counts)', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('getMilestones() / getMilestone() roundtrip', async () => {
        const m = await svc.createMilestone({ name: 'M1', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        assert.strictEqual(svc.getMilestones().length, 1);
        assert.strictEqual(svc.getMilestone(m.id)?.name, 'M1');
    });

    test('updateMilestone() persists changes', async () => {
        const m = await svc.createMilestone({ name: 'Old', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        await svc.updateMilestone(m.id, { name: 'New' });
        assert.strictEqual(svc.getMilestone(m.id)?.name, 'New');
    });

    test('deleteMilestone() removes it', async () => {
        const m = await svc.createMilestone({ name: 'Temp', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        await svc.deleteMilestone(m.id);
        assert.strictEqual(svc.getMilestones().length, 0);
    });

    test('getSprints() / getSprint() roundtrip', async () => {
        const s = await svc.createSprint({ name: 'S1', description: '', startDate: null, endDate: null, status: 'planned', workspaceFolder: null });
        assert.strictEqual(svc.getSprints().length, 1);
        assert.strictEqual(svc.getSprint(s.id)?.name, 'S1');
    });

    test('updateSprint() persists changes', async () => {
        const s = await svc.createSprint({ name: 'S1', description: '', startDate: null, endDate: null, status: 'planned', workspaceFolder: null });
        await svc.updateSprint(s.id, { status: 'active' });
        assert.strictEqual(svc.getSprint(s.id)?.status, 'active');
    });

    test('deleteSprint() removes it', async () => {
        const s = await svc.createSprint({ name: 'S1', description: '', startDate: null, endDate: null, status: 'planned', workspaceFolder: null });
        await svc.deleteSprint(s.id);
        assert.strictEqual(svc.getSprints().length, 0);
    });

    test('getOpenCount() counts open issues', async () => {
        await db.createIssue(mkPart({ status: 'open' }));
        await db.createIssue(mkPart({ status: 'closed' }));
        assert.strictEqual(svc.getOpenCount(), 1);
    });

    test('getCriticalCount() counts critical open issues', async () => {
        await db.createIssue(mkPart({ severity: 'critical' }));
        await db.createIssue(mkPart({ severity: 'low' }));
        assert.ok(svc.getCriticalCount() >= 1);
    });

    test('getAllTags() returns unique tags across issues', async () => {
        await db.createIssue(mkPart({ tags: ['a', 'b'] }));
        await db.createIssue(mkPart({ tags: ['b', 'c'] }));
        const tags = svc.getAllTags();
        assert.ok(tags.includes('a'));
        assert.ok(tags.includes('b'));
        assert.ok(tags.includes('c'));
        assert.strictEqual(tags.filter((t) => t === 'b').length, 1);
    });

    test('getAllAssignees() returns unique assignees', async () => {
        await db.createIssue(mkPart({ assignedTo: 'alice' }));
        await db.createIssue(mkPart({ assignedTo: 'alice' }));
        await db.createIssue(mkPart({ assignedTo: 'bob' }));
        const assignees = svc.getAllAssignees();
        assert.ok(assignees.includes('alice'));
        assert.ok(assignees.includes('bob'));
        assert.strictEqual(assignees.filter((a) => a === 'alice').length, 1);
    });
});

describe('IssueService — applyFilter branches', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('filters by reportedBy', async () => {
        await db.createIssue(mkPart({ reportedBy: 'alice' }));
        await db.createIssue(mkPart({ reportedBy: 'bob' }));
        const filter: IssueFilter = { reportedBy: 'alice' };
        const results = svc.getIssues(filter);
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].reportedBy, 'alice');
    });

    test('filters by milestoneId', async () => {
        await db.createIssue(mkPart({ milestoneId: 'ms-1' }));
        await db.createIssue(mkPart({ milestoneId: 'ms-2' }));
        const filter: IssueFilter = { milestoneId: 'ms-1' };
        const results = svc.getIssues(filter);
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].milestoneId, 'ms-1');
    });

    test('filters by sprintId', async () => {
        await db.createIssue(mkPart({ sprintId: 'sp-1' }));
        await db.createIssue(mkPart({ sprintId: 'sp-2' }));
        const filter: IssueFilter = { sprintId: 'sp-1' };
        const results = svc.getIssues(filter);
        assert.strictEqual(results.length, 1);
        assert.strictEqual(results[0].sprintId, 'sp-1');
    });

    test('filters by version (reportedIn, fixedIn, targetVersion)', async () => {
        await db.createIssue(mkPart({ reportedInVersion: 'v1.0' }));
        await db.createIssue(mkPart({ fixedInVersion: 'v1.0' }));
        await db.createIssue(mkPart({ targetVersion: 'v1.0' }));
        await db.createIssue(mkPart({ reportedInVersion: 'v2.0' }));
        const filter: IssueFilter = { version: 'v1.0' };
        const results = svc.getIssues(filter);
        assert.strictEqual(results.length, 3);
    });

    test('searchText matches description and tags', async () => {
        await db.createIssue(mkPart({ description: 'authentication failure' }));
        await db.createIssue(mkPart({ tags: ['oauth'] }));
        await db.createIssue(mkPart({ title: 'unrelated' }));
        const byDesc = svc.getIssues({ searchText: 'authentication' });
        assert.strictEqual(byDesc.length, 1);
        const byTag = svc.getIssues({ searchText: 'oauth' });
        assert.strictEqual(byTag.length, 1);
    });

    test('staleOnly excludes resolved/closed issues', async () => {
        const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
        // Stale open issue
        const openIssue = await db.createIssue(mkPart({ status: 'open' }));
        const cached = (db as any).issueCache.get(openIssue.id);
        (db as any).issueCache.set(openIssue.id, { ...cached, updatedAt: oldDate });
        // Stale but closed — should NOT appear
        const closedIssue = await db.createIssue(mkPart({ status: 'closed' }));
        const cachedClosed = (db as any).issueCache.get(closedIssue.id);
        (db as any).issueCache.set(closedIssue.id, { ...cachedClosed, updatedAt: oldDate });

        const results = svc.getIssues({ staleOnly: true });
        assert.ok(results.some((i) => i.id === openIssue.id));
        assert.ok(!results.some((i) => i.id === closedIssue.id));
    });

    test('addComment() throws for unknown issue', async () => {
        await assert.rejects(() => svc.addComment('no-issue', 'body'));
    });
});

// ---------------------------------------------------------------------------
// IssueService — known tags and known persons
// ---------------------------------------------------------------------------

describe('IssueService — known tags', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('getKnownTags() returns empty on fresh db', () => {
        assert.deepStrictEqual(svc.getKnownTags(), []);
    });

    test('addKnownTag() makes the tag available via getKnownTags()', async () => {
        await svc.addKnownTag('ui');
        await svc.addKnownTag('backend');
        const tags = svc.getKnownTags();
        assert.ok(tags.includes('ui'));
        assert.ok(tags.includes('backend'));
    });

    test('addKnownTag() is idempotent', async () => {
        await svc.addKnownTag('dup');
        await svc.addKnownTag('dup');
        assert.strictEqual(svc.getKnownTags().filter((t) => t === 'dup').length, 1);
    });

    test('addKnownTag() ignores empty string', async () => {
        await svc.addKnownTag('');
        assert.strictEqual(svc.getKnownTags().length, 0);
    });
});

describe('IssueService — known persons', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('getKnownPersons() returns empty on fresh db', () => {
        assert.deepStrictEqual(svc.getKnownPersons(), []);
    });

    test('addKnownPerson() makes the person available via getKnownPersons()', async () => {
        await svc.addKnownPerson('Alice');
        await svc.addKnownPerson('Bob');
        const persons = svc.getKnownPersons();
        assert.ok(persons.includes('Alice'));
        assert.ok(persons.includes('Bob'));
    });

    test('addKnownPerson() is idempotent', async () => {
        await svc.addKnownPerson('Alice');
        await svc.addKnownPerson('Alice');
        assert.strictEqual(svc.getKnownPersons().filter((p) => p === 'Alice').length, 1);
    });

    test('addKnownPerson() ignores empty string', async () => {
        await svc.addKnownPerson('');
        assert.strictEqual(svc.getKnownPersons().length, 0);
    });
});

describe('IssueService — template accessors', () => {
    let db: IssueDatabase;
    let svc: IssueService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new IssueService(db);
    });
    afterEach(() => db.dispose());

    test('getTemplates() returns empty list on fresh db', () => {
        assert.deepStrictEqual(svc.getTemplates(), []);
    });

    test('saveTemplates() then getTemplates() round-trips', async () => {
        const now = new Date().toISOString();
        const tpl = {
            id: 'tpl-1', name: 'Bug', description: 'Bug template', type: 'bug' as const,
            defaultSeverity: 'medium' as const, defaultUrgency: 'normal' as const,
            titleTemplate: '', bodyTemplate: '## Steps', defaultTags: [],
            createdAt: now, updatedAt: now,
        };
        await svc.saveTemplates([tpl]);
        const all = svc.getTemplates();
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].name, 'Bug');
    });

    test('getTemplate() returns the template by id', async () => {
        const now = new Date().toISOString();
        const tpl = {
            id: 'tpl-2', name: 'Feature', description: '', type: 'feature' as const,
            defaultSeverity: 'low' as const, defaultUrgency: 'low' as const,
            titleTemplate: '', bodyTemplate: '', defaultTags: [],
            createdAt: now, updatedAt: now,
        };
        await svc.saveTemplates([tpl]);
        const found = svc.getTemplate('tpl-2');
        assert.ok(found);
        assert.strictEqual(found.name, 'Feature');
    });

    test('getTemplate() returns null for unknown id', async () => {
        assert.strictEqual(svc.getTemplate('no-such-id'), null);
    });
});
