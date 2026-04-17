/**
 * Unit tests for issue command functions.
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
import { cmdEditIssue } from '../../src/commands/issueCommands';

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
// cmdEditIssue — version fields
// ---------------------------------------------------------------------------

describe('cmdEditIssue — version fields', () => {
    let db: IssueDatabase;
    let svc: IssueService;
    const fakeUri = { fsPath: '/fake', toString: () => 'file:///fake', scheme: 'file' } as unknown as vscode.Uri;

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

    test('saves reportedInVersion, targetVersion and fixedInVersion via free-text fallback', async () => {
        const issue = await db.createIssue(mkPart());

        // No workspace folders → no git versions → falls back to showInputBox for each version field
        vi.spyOn(vscode.window, 'showInputBox')
            .mockResolvedValueOnce('Test Issue')   // title
            .mockResolvedValueOnce('')             // assignee
            .mockResolvedValueOnce('My description') // description
            .mockResolvedValueOnce('v1.0')         // reportedInVersion
            .mockResolvedValueOnce('v2.0')         // targetVersion
            .mockResolvedValueOnce('v1.1');        // fixedInVersion

        vi.spyOn(vscode.window, 'showQuickPick')
            .mockResolvedValueOnce({ label: 'open' } as vscode.QuickPickItem)  // status
            .mockResolvedValueOnce([] as unknown as vscode.QuickPickItem);     // tags

        await cmdEditIssue(svc, fakeUri, issue);

        const updated = db.getIssue(issue.id)!;
        assert.strictEqual(updated.reportedInVersion, 'v1.0');
        assert.strictEqual(updated.targetVersion, 'v2.0');
        assert.strictEqual(updated.fixedInVersion, 'v1.1');
    });

    test('clears version fields when blank is entered', async () => {
        const issue = await db.createIssue(mkPart({
            reportedInVersion: 'v1.0',
            targetVersion: 'v2.0',
            fixedInVersion: 'v1.1',
        }));

        vi.spyOn(vscode.window, 'showInputBox')
            .mockResolvedValueOnce('Test Issue')   // title
            .mockResolvedValueOnce('')             // assignee
            .mockResolvedValueOnce('')             // description
            .mockResolvedValueOnce('')             // reportedInVersion — cleared
            .mockResolvedValueOnce('')             // targetVersion — cleared
            .mockResolvedValueOnce('');            // fixedInVersion — cleared

        vi.spyOn(vscode.window, 'showQuickPick')
            .mockResolvedValueOnce({ label: 'open' } as vscode.QuickPickItem)  // status
            .mockResolvedValueOnce([] as unknown as vscode.QuickPickItem);     // tags

        await cmdEditIssue(svc, fakeUri, issue);

        const updated = db.getIssue(issue.id)!;
        assert.strictEqual(updated.reportedInVersion, null);
        assert.strictEqual(updated.targetVersion, null);
        assert.strictEqual(updated.fixedInVersion, null);
    });

    test('aborts without saving when user cancels at a version prompt', async () => {
        const issue = await db.createIssue(mkPart({ reportedInVersion: 'v1.0' }));

        vi.spyOn(vscode.window, 'showInputBox')
            .mockResolvedValueOnce('Test Issue')   // title
            .mockResolvedValueOnce('')             // assignee
            .mockResolvedValueOnce('')             // description
            .mockResolvedValueOnce(undefined);     // reportedInVersion — cancelled

        vi.spyOn(vscode.window, 'showQuickPick').mockResolvedValueOnce(
            { label: 'open' } as vscode.QuickPickItem  // status — tags step never reached
        );

        await cmdEditIssue(svc, fakeUri, issue);

        // reportedInVersion should be unchanged since command aborted
        assert.strictEqual(db.getIssue(issue.id)?.reportedInVersion, 'v1.0');
    });
});
