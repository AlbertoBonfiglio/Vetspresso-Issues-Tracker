/**
 * Unit tests for TemplateService.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { TemplateService } from '../../src/services/TemplateService';
import { IStorageProvider } from '../../src/storage/IStorageProvider';
import { Issue, Milestone, Sprint, IssueTemplate, IssueStoreIndex } from '../../src/types';

// ---------------------------------------------------------------------------
// In-memory stub (same pattern as issueService.test.ts)
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
    async writeTemplates(ts: IssueTemplate[]) { this.templates = ts; }
    getRootUri() { return this.uri; }
}

function makePartialTemplate(): Omit<IssueTemplate, 'id' | 'createdAt' | 'updatedAt'> {
    return {
        name: 'Bug Report',
        description: 'Standard bug report template',
        type: 'bug',
        defaultSeverity: 'high',
        defaultUrgency: 'normal',
        titleTemplate: '{{title}}',
        bodyTemplate: '## Steps to Reproduce\n\n## Expected Behavior\n\n## Actual Behavior',
        defaultTags: ['bug', 'needs-triage'],
    };
}

describe('TemplateService', () => {
    let db: IssueDatabase;
    let svc: TemplateService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new TemplateService(db);
    });

    afterEach(() => {
        db.dispose();
    });

    // -----------------------------------------------------------------------
    // getAll / get
    // -----------------------------------------------------------------------

    test('getAll() returns empty array when no templates exist', () => {
        assert.deepStrictEqual(svc.getAll(), []);
    });

    test('get() returns null for nonexistent id', () => {
        assert.strictEqual(svc.get('nonexistent'), null);
    });

    // -----------------------------------------------------------------------
    // create
    // -----------------------------------------------------------------------

    test('create() returns a template with generated id and timestamps', async () => {
        const tmpl = await svc.create(makePartialTemplate());
        assert.ok(tmpl.id.length > 0);
        assert.ok(tmpl.createdAt.length > 0);
        assert.ok(tmpl.updatedAt.length > 0);
        assert.strictEqual(tmpl.name, 'Bug Report');
        assert.strictEqual(tmpl.type, 'bug');
    });

    test('create() persists template so getAll() finds it', async () => {
        const tmpl = await svc.create(makePartialTemplate());
        const all = svc.getAll();
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].id, tmpl.id);
    });

    test('get() returns template by id after creation', async () => {
        const created = await svc.create(makePartialTemplate());
        const fetched = svc.get(created.id);
        assert.ok(fetched !== null);
        assert.strictEqual(fetched!.name, 'Bug Report');
    });

    test('create() preserves all partial fields', async () => {
        const partial = makePartialTemplate();
        const tmpl = await svc.create(partial);
        assert.strictEqual(tmpl.description, partial.description);
        assert.strictEqual(tmpl.defaultSeverity, 'high');
        assert.strictEqual(tmpl.defaultUrgency, 'normal');
        assert.deepStrictEqual(tmpl.defaultTags, ['bug', 'needs-triage']);
        assert.strictEqual(tmpl.bodyTemplate, partial.bodyTemplate);
    });

    // -----------------------------------------------------------------------
    // update
    // -----------------------------------------------------------------------

    test('update() modifies name and updates updatedAt', async () => {
        const created = await svc.create(makePartialTemplate());
        const originalUpdatedAt = created.updatedAt;

        // Ensure at least 1 ms has passed so updatedAt changes
        await new Promise((r) => setTimeout(r, 5));

        const updated = await svc.update(created.id, { name: 'Updated Name' });
        assert.strictEqual(updated.name, 'Updated Name');
        assert.strictEqual(updated.createdAt, created.createdAt);
        assert.ok(updated.updatedAt >= originalUpdatedAt);
    });

    test('update() preserves unchanged fields', async () => {
        const created = await svc.create(makePartialTemplate());
        const updated = await svc.update(created.id, { defaultSeverity: 'critical' });
        assert.strictEqual(updated.type, 'bug'); // unchanged
        assert.strictEqual(updated.defaultSeverity, 'critical'); // changed
    });

    test('update() throws when template id not found', async () => {
        await assert.rejects(
            () => svc.update('nonexistent', { name: 'X' }),
            /Template not found/
        );
    });

    test('update() persists changes', async () => {
        const created = await svc.create(makePartialTemplate());
        await svc.update(created.id, { name: 'Changed' });
        const fetched = svc.get(created.id);
        assert.strictEqual(fetched!.name, 'Changed');
    });

    // -----------------------------------------------------------------------
    // delete
    // -----------------------------------------------------------------------

    test('delete() returns true when template is found and removed', async () => {
        const tmpl = await svc.create(makePartialTemplate());
        const result = await svc.delete(tmpl.id);
        assert.strictEqual(result, true);
        assert.strictEqual(svc.getAll().length, 0);
    });

    test('delete() returns false when template does not exist', async () => {
        const result = await svc.delete('nonexistent');
        assert.strictEqual(result, false);
    });

    test('delete() only removes the targeted template', async () => {
        const t1 = await svc.create(makePartialTemplate());
        const t2 = await svc.create({ ...makePartialTemplate(), name: 'Feature Request' });
        await svc.delete(t1.id);
        const all = svc.getAll();
        assert.strictEqual(all.length, 1);
        assert.strictEqual(all[0].id, t2.id);
    });

    // -----------------------------------------------------------------------
    // getDefaults
    // -----------------------------------------------------------------------

    test('getDefaults() returns null for nonexistent template', () => {
        const defaults = svc.getDefaults('nonexistent');
        assert.strictEqual(defaults, null);
    });

    test('getDefaults() returns correct defaults from template', async () => {
        const tmpl = await svc.create(makePartialTemplate());
        const defaults = svc.getDefaults(tmpl.id);
        assert.ok(defaults !== null);
        assert.strictEqual(defaults!.type, 'bug');
        assert.strictEqual(defaults!.severity, 'high');
        assert.strictEqual(defaults!.urgency, 'normal');
        assert.deepStrictEqual(defaults!.tags, ['bug', 'needs-triage']);
        assert.strictEqual(defaults!.templateId, tmpl.id);
        assert.strictEqual(defaults!.description, tmpl.bodyTemplate);
    });

    test('getDefaults() returns a copy of defaultTags (not the original array)', async () => {
        const tmpl = await svc.create(makePartialTemplate());
        const defaults = svc.getDefaults(tmpl.id);
        defaults!.tags!.push('extra');
        const defaults2 = svc.getDefaults(tmpl.id);
        assert.deepStrictEqual(defaults2!.tags, ['bug', 'needs-triage']);
    });

    // -----------------------------------------------------------------------
    // multiple templates
    // -----------------------------------------------------------------------

    test('getAll() returns all created templates', async () => {
        await svc.create(makePartialTemplate());
        await svc.create({ ...makePartialTemplate(), name: 'Enhancement' });
        await svc.create({ ...makePartialTemplate(), name: 'Task' });
        assert.strictEqual(svc.getAll().length, 3);
    });
});
