/**
 * Unit tests for milestone and sprint command functions.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { vi } from 'vitest';
import * as vscode from 'vscode';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { IssueService } from '../../src/services/IssueService';
import { IStorageProvider } from '../../src/storage/IStorageProvider';
import { Issue, Milestone, Sprint, IssueTemplate, IssueStoreIndex } from '../../src/types';
import {
    cmdAssignSprint,
    cmdAssignMilestone,
    cmdEditSprint,
} from '../../src/commands/milestoneCommands';

// ---------------------------------------------------------------------------
// In-memory storage stub
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
        reportedBy: 'tester',
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


// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cmdAssignSprint', () => {
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
        vi.restoreAllMocks();
    });

    test('assigns a sprint to an issue when user selects one', async () => {
        const sprint = await db.createSprint({
            name: 'Sprint 1', description: 'Goal', startDate: null, endDate: null,
            status: 'active', workspaceFolder: null,
        });
        const issue = await db.createIssue(mkPart());

        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(
            { label: 'Sprint 1', description: 'active' } as vscode.QuickPickItem
        );

        await cmdAssignSprint(svc, issue);

        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.sprintId, sprint.id);
    });

    test('clears sprint assignment when user selects None', async () => {
        const sprint = await db.createSprint({
            name: 'Sprint 1', description: '', startDate: null, endDate: null,
            status: 'active', workspaceFolder: null,
        });
        const issue = await db.createIssue(mkPart({ sprintId: sprint.id }));

        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(
            { label: '$(circle-slash) None', description: 'Remove sprint assignment' } as vscode.QuickPickItem
        );

        await cmdAssignSprint(svc, issue);

        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.sprintId, null);
    });

    test('does nothing when user cancels the quick-pick', async () => {
        const issue = await db.createIssue(mkPart({ sprintId: 'some-sprint' }));
        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(undefined);

        await cmdAssignSprint(svc, issue);

        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.sprintId, 'some-sprint');
    });
});

describe('cmdAssignMilestone', () => {
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
        vi.restoreAllMocks();
    });

    test('assigns a milestone to an issue when user selects one', async () => {
        const milestone = await db.createMilestone({
            name: 'v1.0', description: 'First release', targetDate: null,
            completedDate: null, workspaceFolder: null,
        });
        const issue = await db.createIssue(mkPart());

        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(
            { label: 'v1.0', description: undefined } as unknown as vscode.QuickPickItem
        );

        await cmdAssignMilestone(svc, issue);

        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.milestoneId, milestone.id);
    });

    test('clears milestone assignment when user selects None', async () => {
        const milestone = await db.createMilestone({
            name: 'v1.0', description: '', targetDate: null,
            completedDate: null, workspaceFolder: null,
        });
        const issue = await db.createIssue(mkPart({ milestoneId: milestone.id }));

        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(
            { label: '$(circle-slash) None', description: 'Remove milestone assignment' } as vscode.QuickPickItem
        );

        await cmdAssignMilestone(svc, issue);

        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.milestoneId, null);
    });

    test('does nothing when user cancels the quick-pick', async () => {
        const issue = await db.createIssue(mkPart({ milestoneId: 'some-milestone' }));
        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(undefined);

        await cmdAssignMilestone(svc, issue);

        const updated = db.getIssue(issue.id);
        assert.strictEqual(updated?.milestoneId, 'some-milestone');
    });
});

describe('cmdEditSprint — description', () => {
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
        vi.restoreAllMocks();
    });

    test('saves updated description when editing a sprint', async () => {
        const sprint = await db.createSprint({
            name: 'Sprint 1', description: 'Old goal', startDate: null, endDate: null,
            status: 'planned', workspaceFolder: null,
        });

        vi.spyOn(vscode.window, 'showInputBox')
            .mockResolvedValueOnce('Sprint 1')       // name (unchanged)
            .mockResolvedValueOnce('New goal');       // description

        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(
            { label: 'active' } as vscode.QuickPickItem
        );

        await cmdEditSprint(svc, sprint);

        const updated = db.getSprint(sprint.id);
        assert.strictEqual(updated?.description, 'New goal');
        assert.strictEqual(updated?.status, 'active');
    });

    test('preserves existing description if input box returns undefined (cancelled)', async () => {
        const sprint = await db.createSprint({
            name: 'Sprint 2', description: 'Keep this', startDate: null, endDate: null,
            status: 'planned', workspaceFolder: null,
        });

        // Cancel at the name prompt → command should abort entirely
        vi.spyOn(vscode.window, 'showInputBox').mockResolvedValueOnce(undefined);

        await cmdEditSprint(svc, sprint);

        const updated = db.getSprint(sprint.id);
        assert.strictEqual(updated?.description, 'Keep this');
    });
});
