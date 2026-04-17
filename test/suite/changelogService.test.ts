/**
 * Unit tests for ChangelogService.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { ChangelogService } from '../../src/services/ChangelogService';
import { Issue, IssueStoreIndex, Milestone, Sprint, IssueTemplate } from '../../src/types';
import { IStorageProvider } from '../../src/storage/IStorageProvider';
import { nowIso } from '../../src/utils/idGenerator';

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
function mkResolved(overrides: Partial<PartialIssue> = {}): PartialIssue {
    return {
        title: 'Fixed issue',
        description: '',
        type: 'bug',
        status: 'resolved',
        severity: 'medium',
        urgency: 'normal',
        reportedInVersion: 'v1.0',
        fixedInVersion: 'v1.1',
        targetVersion: null,
        milestoneId: null,
        sprintId: null,
        tags: [],
        estimatedHours: null,
        timeEntries: [],
        reportedBy: 'alice',
        assignedTo: null,
        resolvedAt: nowIso(),
        codeLinks: [],
        relations: [],
        comments: [],
        workspaceFolder: null,
        templateId: null,
        ...overrides,
    };
}

describe('ChangelogService', () => {
    let db: IssueDatabase;
    let svc: ChangelogService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new ChangelogService(db);
    });

    afterEach(() => {
        db.dispose();
    });

    // -------------------------------------------------------------------------
    // buildSections
    // -------------------------------------------------------------------------

    test('buildSections() returns empty for no resolved issues', () => {
        const sections = svc.buildSections();
        assert.strictEqual(sections.length, 0);
    });

    test('buildSections() groups by fixedInVersion', async () => {
        await db.createIssue(mkResolved({ title: 'Bug fix', fixedInVersion: 'v1.1' }));
        await db.createIssue(mkResolved({ title: 'Feature A', fixedInVersion: 'v1.2', type: 'feature' }));
        await db.createIssue(mkResolved({ title: 'Another bug', fixedInVersion: 'v1.1' }));

        const sections = svc.buildSections();
        assert.strictEqual(sections.length, 2);
        const v11 = sections.find((s) => s.version === 'v1.1');
        assert.ok(v11);
        assert.strictEqual(v11.issues.length, 2);
    });

    test('buildSections() excludes non-resolved/closed issues', async () => {
        await db.createIssue(mkResolved({ status: 'open', fixedInVersion: 'v1.0' }));
        await db.createIssue(mkResolved({ status: 'resolved', fixedInVersion: 'v1.0' }));

        const sections = svc.buildSections();
        const v10 = sections.find((s) => s.version === 'v1.0');
        assert.ok(v10);
        assert.strictEqual(v10.issues.length, 1);
        assert.strictEqual(v10.issues[0].status, 'resolved');
    });

    test('buildSections() groups null fixedInVersion under Unreleased', async () => {
        await db.createIssue(mkResolved({ fixedInVersion: null }));
        await db.createIssue(mkResolved({ title: 'Versioned', fixedInVersion: 'v2.0' }));

        const sections = svc.buildSections();
        assert.strictEqual(sections.length, 2);
        assert.ok(sections.some((s) => s.version === 'Unreleased'));
        assert.ok(sections.some((s) => s.version === 'v2.0'));
    });

    test('buildSections() accepts version filter', async () => {
        await db.createIssue(mkResolved({ fixedInVersion: 'v1.0' }));
        await db.createIssue(mkResolved({ fixedInVersion: 'v2.0' }));

        const sections = svc.buildSections({ version: 'v1.0' });
        assert.strictEqual(sections.length, 1);
        assert.strictEqual(sections[0].version, 'v1.0');
    });

    // -------------------------------------------------------------------------
    // renderMarkdown
    // -------------------------------------------------------------------------

    test('renderMarkdown() contains version heading', async () => {
        await db.createIssue(mkResolved({ title: 'My fix', fixedInVersion: 'v3.0' }));
        const md = svc.renderMarkdown();
        assert.ok(md.includes('v3.0'));
    });

    test('renderMarkdown() contains issue title', async () => {
        await db.createIssue(mkResolved({ title: 'Memorable bug fix', fixedInVersion: 'v1.0' }));
        const md = svc.renderMarkdown();
        assert.ok(md.includes('Memorable bug fix'));
    });

    test('renderMarkdown() groups by type with subheadings', async () => {
        await db.createIssue(mkResolved({ title: 'Bug 1', type: 'bug', fixedInVersion: 'v1.0' }));
        await db.createIssue(mkResolved({ title: 'Feature 1', type: 'feature', fixedInVersion: 'v1.0' }));

        const md = svc.renderMarkdown();
        // Should contain both type group headers
        const lower = md.toLowerCase();
        assert.ok(lower.includes('bug') || lower.includes('fix'));
        assert.ok(lower.includes('feature'));
    });

    test('renderMarkdown() includes sequential issue ID', async () => {
        const issue = await db.createIssue(mkResolved({ fixedInVersion: 'v1.0' }));
        const md = svc.renderMarkdown();
        assert.ok(md.includes(`#${issue.sequentialId}`));
    });

    // -------------------------------------------------------------------------
    // renderPlainText
    // -------------------------------------------------------------------------

    test('renderPlainText() contains version line', async () => {
        await db.createIssue(mkResolved({ fixedInVersion: 'v5.0' }));
        const text = svc.renderPlainText();
        assert.ok(text.includes('v5.0'));
    });

    test('renderPlainText() contains issue title', async () => {
        await db.createIssue(mkResolved({ title: 'Important fix', fixedInVersion: 'v1.0' }));
        const text = svc.renderPlainText();
        assert.ok(text.includes('Important fix'));
    });

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    test('buildSections() treats closed issues as changelog-worthy', async () => {
        await db.createIssue(mkResolved({ status: 'closed', fixedInVersion: 'v1.0' }));
        const sections = svc.buildSections();
        assert.strictEqual(sections.length, 1);
    });
});
