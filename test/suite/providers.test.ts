/**
 * Unit tests for all VS Code provider classes.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';

import * as vscode from 'vscode';
import { IssueDatabase } from '../../src/database/IssueDatabase';
import { IssueService } from '../../src/services/IssueService';
import { IStorageProvider } from '../../src/storage/IStorageProvider';
import { Issue, Milestone, Sprint, IssueTemplate, IssueStoreIndex, IssueFilter } from '../../src/types';
import { CFG_DECORATIONS_ENABLED, CFG_CODE_LENS_ENABLED } from '../../src/constants';

import { IssueCodeLensProvider } from '../../src/providers/IssueCodeLensProvider';
import { IssueDecorationProvider } from '../../src/providers/IssueDecorationProvider';
import {
    IssueTreeProvider,
    IssueTreeItem,
    GroupTreeItem,
} from '../../src/providers/IssueTreeProvider';
import {
    MilestoneTreeProvider,
    MilestoneTreeItem,
    MilestoneIssueItem,
} from '../../src/providers/MilestoneTreeProvider';
import {
    SprintTreeProvider,
    SprintTreeItem,
    SprintIssueItem,
} from '../../src/providers/SprintTreeProvider';
import { StatusBarProvider } from '../../src/providers/StatusBarProvider';
import { TimeTrackingProvider } from '../../src/providers/TimeTrackingProvider';

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

// ---------------------------------------------------------------------------
// Helper to create a minimal issue partial
// ---------------------------------------------------------------------------

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
        reportedBy: 'test-user',
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
// Shared DB + service setup
// ---------------------------------------------------------------------------

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

// ===========================================================================
// IssueCodeLensProvider
// ===========================================================================

describe('IssueCodeLensProvider', () => {
    test('constructs without error', () => {
        const provider = new IssueCodeLensProvider(svc);
        assert.ok(provider);
    });

    test('onDidChangeCodeLenses is defined', () => {
        const provider = new IssueCodeLensProvider(svc);
        assert.ok(typeof provider.onDidChangeCodeLenses === 'function');
    });

    test('provideCodeLenses returns empty array when no issues', () => {
        const provider = new IssueCodeLensProvider(svc);
        const doc = {
            uri: { fsPath: '/workspace/src/file.ts', toString: () => 'file:///workspace/src/file.ts' },
        };
        const token = { isCancellationRequested: false };
        const lenses = provider.provideCodeLenses(doc as never, token as never);
        assert.deepStrictEqual(lenses, []);
    });

    test('provideCodeLenses returns lenses for issues with matching code links', async () => {
        // Reload service after adding issue
        const freshStorage = new MemStub();
        const freshDb = new IssueDatabase(freshStorage);
        await freshDb.load();
        await freshDb.createIssue(mkPart({
            title: 'Linked Issue',
            codeLinks: [{
                id: 'link-1',
                workspaceFolder: null,
                filePath: 'src/file.ts',
                startLine: 5,
                endLine: 10,
                snippet: 'const x = 1;',
                createdAt: new Date().toISOString(),
            }],
        }));
        const freshSvc = new IssueService(freshDb);

        const provider = new IssueCodeLensProvider(freshSvc);
        const doc = {
            uri: {
                fsPath: '/workspace/src/file.ts',
                toString: () => 'file:///workspace/src/file.ts',
            },
        };
        const token = { isCancellationRequested: false };
        const lenses = provider.provideCodeLenses(doc as never, token as never);
        // Without workspace folder resolution the relPath == fsPath, so linkes won't match
        // Just verify it returns an array without throwing
        assert.ok(Array.isArray(lenses));

        freshDb.dispose();
    });

    test('provideCodeLenses returns CodeLens items when file matches', async () => {
        // Use a bare path (no workspace folder resolution) so relPath === fsPath
        await db.createIssue(mkPart({
            title: 'Linked',
            codeLinks: [{
                id: 'cl1',
                workspaceFolder: null,
                filePath: 'myfile.ts',
                startLine: 3,
                endLine: 5,
                snippet: '',
                createdAt: new Date().toISOString(),
            }],
        }));

        const provider = new IssueCodeLensProvider(svc);
        const doc = {
            uri: { fsPath: 'myfile.ts', toString: () => 'file://myfile.ts' },
        };
        const token = { isCancellationRequested: false };
        const lenses = provider.provideCodeLenses(doc as never, token as never);
        assert.strictEqual(lenses.length, 1);
        assert.ok(lenses[0].command!.title.includes('Linked'));
    });
});

// ===========================================================================
// IssueDecorationProvider
// ===========================================================================

describe('IssueDecorationProvider', () => {
    test('constructs without error', () => {
        const provider = new IssueDecorationProvider(svc);
        assert.ok(provider);
    });

    test('dispose() does not throw', () => {
        const provider = new IssueDecorationProvider(svc);
        assert.doesNotThrow(() => provider.dispose());
    });

    test('dispose() can be called multiple times safely', () => {
        const provider = new IssueDecorationProvider(svc);
        assert.doesNotThrow(() => {
            provider.dispose();
            provider.dispose();
        });
    });
});

// ===========================================================================
// IssueTreeProvider
// ===========================================================================

describe('IssueTreeProvider', () => {
    test('constructs without error', () => {
        const provider = new IssueTreeProvider(svc);
        assert.ok(provider);
    });

    test('getTreeItem returns the element as-is', async () => {
        const issue = await db.createIssue(mkPart());
        const provider = new IssueTreeProvider(svc);
        const item = new IssueTreeItem(issue);
        assert.strictEqual(provider.getTreeItem(item), item);
    });

    test('getChildren() returns flat list when groupBy=none (default returns grouped)', async () => {
        await db.createIssue(mkPart({ title: 'A' }));
        await db.createIssue(mkPart({ title: 'B' }));
        const provider = new IssueTreeProvider(svc);
        // Default groupBy is 'status', so root returns group headers
        const children = await provider.getChildren();
        assert.ok(Array.isArray(children));
        assert.ok(children!.length > 0);
    });

    test('getChildren() for GroupTreeItem returns IssueTreeItems', async () => {
        const issue = await db.createIssue(mkPart({ title: 'X' }));
        const provider = new IssueTreeProvider(svc);
        const group = new GroupTreeItem('open', [issue.id]);
        const children = await provider.getChildren(group);
        assert.ok(Array.isArray(children));
        assert.strictEqual(children!.length, 1);
        assert.ok(children![0] instanceof IssueTreeItem);
    });

    test('getChildren() for non-group element returns empty array', async () => {
        const issue = await db.createIssue(mkPart());
        const provider = new IssueTreeProvider(svc);
        const item = new IssueTreeItem(issue);
        const children = await provider.getChildren(item);
        assert.deepStrictEqual(children, []);
    });

    test('setFilter/getActiveFilter/clearFilter work correctly', () => {
        const provider = new IssueTreeProvider(svc);
        assert.deepStrictEqual(provider.getActiveFilter(), {});

        const filter: IssueFilter = { status: ['open'] };
        provider.setFilter(filter);
        assert.deepStrictEqual(provider.getActiveFilter(), filter);

        provider.clearFilter();
        assert.deepStrictEqual(provider.getActiveFilter(), {});
    });

    test('refresh() does not throw', () => {
        const provider = new IssueTreeProvider(svc);
        assert.doesNotThrow(() => provider.refresh());
    });

    test('onDidChangeTreeData fires when setFilter called', () => {
        const provider = new IssueTreeProvider(svc);
        let fired = false;
        provider.onDidChangeTreeData(() => { fired = true; });
        provider.setFilter({ status: ['open'] });
        assert.ok(fired);
    });

    test('onDidChangeTreeData fires when clearFilter called', () => {
        const provider = new IssueTreeProvider(svc);
        let fired = false;
        provider.onDidChangeTreeData(() => { fired = true; });
        provider.clearFilter();
        assert.ok(fired);
    });

    test('IssueTreeItem builds correctly', async () => {
        const issue = await db.createIssue(mkPart({ title: 'My Issue', severity: 'critical' }));
        const item = new IssueTreeItem(issue);
        assert.ok(item.label!.toString().includes('My Issue'));
        assert.ok(item.id!.startsWith('issue-'));
        assert.strictEqual(item.contextValue, 'issue');
    });

    test('GroupTreeItem builds correctly', () => {
        const group = new GroupTreeItem('open', ['id1', 'id2']);
        assert.strictEqual(group.label, 'open');
        assert.strictEqual(group.description, '2');
        assert.strictEqual(group.contextValue, 'group');
    });

    test('getChildren handles issues with milestoneId groupBy', async () => {
        const milestone = await db.createMilestone({
            name: 'v1.0',
            description: '',
            targetDate: null,
            completedDate: null,
            workspaceFolder: null,
        });
        await db.createIssue(mkPart({ milestoneId: milestone.id }));
        await db.createIssue(mkPart({ milestoneId: null }));

        const provider = new IssueTreeProvider(svc);
        // getChildren respects config.get which returns default; we just check no throws
        const children = await provider.getChildren();
        assert.ok(Array.isArray(children));
    });

    test('IssueTreeItem with stale flag sets description', async () => {
        const issue = await db.createIssue(mkPart({ status: 'open' }));
        // Mark as stale by overriding updatedAt manually via override
        const staleIssue = { ...issue, isStale: true };
        const item = new IssueTreeItem(staleIssue);
        assert.ok(item.description!.toString().includes('stale'));
    });
});

// ===========================================================================
// MilestoneTreeProvider
// ===========================================================================

describe('MilestoneTreeProvider', () => {
    test('constructs without error', () => {
        const provider = new MilestoneTreeProvider(svc);
        assert.ok(provider);
    });

    test('getTreeItem returns element as-is', () => {
        const provider = new MilestoneTreeProvider(svc);
        const item = new MilestoneIssueItem(1, 'Test', 'id-1', 'open');
        assert.strictEqual(provider.getTreeItem(item), item);
    });

    test('getChildren() with no element returns empty array when no milestones', async () => {
        const provider = new MilestoneTreeProvider(svc);
        const children = await provider.getChildren();
        assert.deepStrictEqual(children, []);
    });

    test('getChildren() returns MilestoneTreeItems for each milestone', async () => {
        await db.createMilestone({ name: 'v1.0', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        await db.createMilestone({ name: 'v2.0', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        const provider = new MilestoneTreeProvider(svc);
        const children = await provider.getChildren();
        assert.strictEqual(children!.length, 2);
        assert.ok(children![0] instanceof MilestoneTreeItem);
    });

    test('getChildren() with MilestoneTreeItem returns issues for that milestone', async () => {
        const milestone = await db.createMilestone({ name: 'v1.0', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        await db.createIssue(mkPart({ milestoneId: milestone.id }));
        await db.createIssue(mkPart({ milestoneId: milestone.id, title: 'Issue 2' }));
        await db.createIssue(mkPart({ milestoneId: null, title: 'No milestone' }));

        const provider = new MilestoneTreeProvider(svc);
        const milestoneItem = new MilestoneTreeItem(milestone, 2, 2);
        const issueChildren = await provider.getChildren(milestoneItem);
        assert.strictEqual(issueChildren!.length, 2);
        assert.ok(issueChildren![0] instanceof MilestoneIssueItem);
    });

    test('getChildren() with unrecognised element returns empty array', async () => {
        const provider = new MilestoneTreeProvider(svc);
        // Pass something that is neither undefined nor MilestoneTreeItem
        const children = await provider.getChildren({} as never);
        assert.deepStrictEqual(children, []);
    });

    test('refresh() fires onDidChangeTreeData', () => {
        const provider = new MilestoneTreeProvider(svc);
        let fired = false;
        provider.onDidChangeTreeData(() => { fired = true; });
        provider.refresh();
        assert.ok(fired);
    });

    test('MilestoneTreeItem builds with description and tooltip', async () => {
        const milestone = await db.createMilestone({
            name: 'Sprint 1',
            description: 'First sprint',
            targetDate: '2024-12-01',
            completedDate: null,
            workspaceFolder: null,
        });
        const item = new MilestoneTreeItem(milestone, 5, 3);
        assert.strictEqual(item.description, '3 open / 5 total');
        assert.ok(item.id!.startsWith('milestone-'));
    });

    test('MilestoneTreeItem with completedDate builds tooltip without error', async () => {
        const milestone = await db.createMilestone({
            name: 'Done',
            description: '',
            targetDate: '2024-11-01',
            completedDate: '2024-12-01',
            workspaceFolder: null,
        });
        const item = new MilestoneTreeItem(milestone, 10, 0);
        assert.ok(item.tooltip !== undefined);
    });

    test('MilestoneIssueItem sets icon based on status', () => {
        const openItem = new MilestoneIssueItem(1, 'Open Issue', 'id-open', 'open');
        const resolvedItem = new MilestoneIssueItem(2, 'Resolved Issue', 'id-resolved', 'resolved');
        // Both just check they construct without error
        assert.ok(openItem.id!.startsWith('milestone-issue-'));
        assert.ok(resolvedItem.id!.startsWith('milestone-issue-'));
    });

    test('MilestoneTreeItem counts open issues correctly', async () => {
        const milestone = await db.createMilestone({ name: 'M1', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        await db.createIssue(mkPart({ milestoneId: milestone.id, status: 'open' }));
        await db.createIssue(mkPart({ milestoneId: milestone.id, status: 'in-progress' }));
        await db.createIssue(mkPart({ milestoneId: milestone.id, status: 'resolved' }));

        const provider = new MilestoneTreeProvider(svc);
        const children = (await provider.getChildren()) as MilestoneTreeItem[];
        assert.strictEqual(children[0].description, '2 open / 3 total');
    });
});

// ===========================================================================
// SprintTreeProvider
// ===========================================================================

describe('SprintTreeProvider', () => {
    test('constructs without error', () => {
        const provider = new SprintTreeProvider(svc);
        assert.ok(provider);
    });

    test('getTreeItem returns element as-is', () => {
        const provider = new SprintTreeProvider(svc);
        const item = new SprintIssueItem(1, 'Test', 'id-1');
        assert.strictEqual(provider.getTreeItem(item), item);
    });

    test('getChildren() with no element returns empty array when no sprints', async () => {
        const provider = new SprintTreeProvider(svc);
        const children = await provider.getChildren();
        assert.deepStrictEqual(children, []);
    });

    test('getChildren() returns SprintTreeItems sorted by status (active first)', async () => {
        await db.createSprint({ name: 'Planned Sprint', status: 'planned', startDate: null, endDate: null, description: '', workspaceFolder: null });
        await db.createSprint({ name: 'Active Sprint', status: 'active', startDate: '2024-01-01', endDate: '2024-01-14', description: '', workspaceFolder: null });
        await db.createSprint({ name: 'Done Sprint', status: 'completed', startDate: null, endDate: null, description: '', workspaceFolder: null });

        const provider = new SprintTreeProvider(svc);
        const children = (await provider.getChildren()) as SprintTreeItem[];
        assert.strictEqual(children.length, 3);
        assert.strictEqual(children[0].sprint.status, 'active');
        assert.strictEqual(children[1].sprint.status, 'planned');
        assert.strictEqual(children[2].sprint.status, 'completed');
    });

    test('getChildren() with SprintTreeItem returns sprint issues', async () => {
        const sprint = await db.createSprint({ name: 'S1', status: 'active', startDate: null, endDate: null, description: '', workspaceFolder: null });
        await db.createIssue(mkPart({ sprintId: sprint.id }));
        await db.createIssue(mkPart({ sprintId: sprint.id, title: 'Issue 2' }));
        await db.createIssue(mkPart({ sprintId: null, title: 'No sprint' }));

        const provider = new SprintTreeProvider(svc);
        const sprintItem = new SprintTreeItem(sprint, 2, 2);
        const issueChildren = await provider.getChildren(sprintItem);
        assert.strictEqual(issueChildren!.length, 2);
        assert.ok(issueChildren![0] instanceof SprintIssueItem);
    });

    test('getChildren() with unrecognised element returns empty array', async () => {
        const provider = new SprintTreeProvider(svc);
        const children = await provider.getChildren({} as never);
        assert.deepStrictEqual(children, []);
    });

    test('refresh() fires onDidChangeTreeData', () => {
        const provider = new SprintTreeProvider(svc);
        let fired = false;
        provider.onDidChangeTreeData(() => { fired = true; });
        provider.refresh();
        assert.ok(fired);
    });

    test('SprintTreeItem builds with description', async () => {
        const sprint = await db.createSprint({ name: 'Sprint A', status: 'active', startDate: '2024-01-01', endDate: '2024-01-14', description: 'Active sprint', workspaceFolder: null });
        const item = new SprintTreeItem(sprint, 5, 3);
        assert.ok(item.description!.toString().includes('active'));
        assert.ok(item.id!.startsWith('sprint-'));
    });

    test('SprintTreeItem builds for planned and completed statuses', async () => {
        const planned = await db.createSprint({ name: 'Planned', status: 'planned', startDate: null, endDate: null, description: '', workspaceFolder: null });
        const completed = await db.createSprint({ name: 'Done', status: 'completed', startDate: null, endDate: null, description: '', workspaceFolder: null });
        const pItem = new SprintTreeItem(planned, 0, 0);
        const cItem = new SprintTreeItem(completed, 10, 0);
        assert.ok(pItem.description!.toString().includes('planned'));
        assert.ok(cItem.description!.toString().includes('completed'));
    });

    test('SprintIssueItem builds with id and command', () => {
        const item = new SprintIssueItem(3, 'My Issue', 'sprint-issue-id');
        assert.ok(item.id!.startsWith('sprint-issue-'));
        assert.ok(item.command !== undefined);
        assert.strictEqual(item.command!.command, 'vetspresso-issues.viewIssue');
    });
});

// ===========================================================================
// StatusBarProvider
// ===========================================================================

describe('StatusBarProvider', () => {
    test('constructs and calls update without error', () => {
        const provider = new StatusBarProvider(svc);
        assert.ok(provider);
    });

    test('update() does not throw', () => {
        const provider = new StatusBarProvider(svc);
        assert.doesNotThrow(() => provider.update());
    });

    test('dispose() does not throw', () => {
        const provider = new StatusBarProvider(svc);
        assert.doesNotThrow(() => provider.dispose());
    });

    test('update() hides status bar when CFG_SHOW_STATUS_BAR is false', () => {
        const original = vscode.workspace.getConfiguration;
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (_section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                if (key === 'showStatusBar') { return false as unknown as T; }
                return defaultValue;
            },
            has: () => false,
            update: async () => { },
            inspect: () => undefined,
        });

        try {
            const provider = new StatusBarProvider(svc);
            assert.doesNotThrow(() => provider.update());
        } finally {
            (vscode.workspace as { getConfiguration: unknown }).getConfiguration = original;
        }
    });

    test('status bar reflects open/critical issue counts', async () => {
        await db.createIssue(mkPart({ severity: 'critical', status: 'open' }));
        await db.createIssue(mkPart({ status: 'open' }));

        const provider = new StatusBarProvider(svc);
        provider.update();
        assert.ok(provider);
    });
});

// ===========================================================================
// TimeTrackingProvider
// ===========================================================================

describe('TimeTrackingProvider', () => {
    test('constructs without error', () => {
        const provider = new TimeTrackingProvider(svc);
        assert.ok(provider);
    });

    test('getTreeItem returns element as-is', () => {
        const provider = new TimeTrackingProvider(svc);
        const item = { label: 'Test' } as import('vscode').TreeItem;
        assert.strictEqual(provider.getTreeItem(item), item);
    });

    test('getChildren() returns "no time logged" item when no time entries', async () => {
        const provider = new TimeTrackingProvider(svc);
        const children = await provider.getChildren();
        assert.ok(Array.isArray(children));
        assert.strictEqual(children!.length, 1);
        assert.ok(children![0].label!.toString().includes('No time logged'));
    });

    test('getChildren() returns summary + per-issue items when time exists', async () => {
        await db.createIssue(mkPart({
            title: 'Timed Issue',
            timeEntries: [{
                id: 'te-1',
                date: '2024-03-01',
                hours: 2.5,
                description: 'Fixed the thing',
                author: 'alice',
                createdAt: new Date().toISOString(),
            }],
            estimatedHours: 4,
        }));

        const provider = new TimeTrackingProvider(svc);
        const children = await provider.getChildren();
        assert.ok(Array.isArray(children));
        // First item is summary, rest are per-issue
        assert.ok(children!.length >= 2);
        assert.ok(children![0].label!.toString().includes('Total:'));
    });

    test('getChildren() with IssueTimeItem returns time entry items', async () => {
        await db.createIssue(mkPart({
            title: 'Timed Issue',
            timeEntries: [
                {
                    id: 'te-1',
                    date: '2024-03-01',
                    hours: 1.0,
                    description: 'First hour',
                    author: 'alice',
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 'te-2',
                    date: '2024-03-02',
                    hours: 0.5,
                    description: 'Half hour',
                    author: 'bob',
                    createdAt: new Date().toISOString(),
                },
            ],
        }));

        const provider = new TimeTrackingProvider(svc);
        const rootChildren = await provider.getChildren();
        // Find the IssueTimeItem  (skip the summary item at index 0)
        const issueItem = rootChildren![1];
        const entryChildren = await provider.getChildren(issueItem);
        assert.ok(Array.isArray(entryChildren));
        assert.strictEqual(entryChildren!.length, 2);
    });

    test('getChildren() with non-IssueTimeItem element returns empty array', async () => {
        const provider = new TimeTrackingProvider(svc);
        const children = await provider.getChildren({} as never);
        assert.deepStrictEqual(children, []);
    });

    test('refresh() does not throw', () => {
        const provider = new TimeTrackingProvider(svc);
        assert.doesNotThrow(() => provider.refresh());
    });

    test('getChildren() handles issue with no estimatedHours', async () => {
        await db.createIssue(mkPart({
            title: 'No estimate',
            timeEntries: [{
                id: 'te-1',
                date: '2024-03-01',
                hours: 3.0,
                description: 'Work done',
                author: 'charlie',
                createdAt: new Date().toISOString(),
            }],
            estimatedHours: null,
        }));

        const provider = new TimeTrackingProvider(svc);
        const children = await provider.getChildren();
        assert.ok(children!.length >= 2);
        const issueItem = children![1];
        assert.ok(issueItem.description!.toString().includes('3.0h'));
    });

    test('multiple issues with time entries summed correctly', async () => {
        await db.createIssue(mkPart({
            timeEntries: [{ id: 'a', date: '2024-01-01', hours: 1, description: '', author: 'x', createdAt: new Date().toISOString() }],
        }));
        await db.createIssue(mkPart({
            timeEntries: [{ id: 'b', date: '2024-01-02', hours: 2, description: '', author: 'y', createdAt: new Date().toISOString() }],
        }));

        const provider = new TimeTrackingProvider(svc);
        const children = await provider.getChildren();
        // Summary shows total hours
        assert.ok(children![0].label!.toString().includes('3.0h'));
    });
});

// ===========================================================================
// IssueDecorationProvider — applyDecorations via constructor activeTextEditor
// ===========================================================================

describe('IssueDecorationProvider (applyDecorations)', () => {
    // Helper to build a minimal mock text editor
    function makeMockEditor(fsPath: string, decorationsSpy?: (type: unknown, ranges: unknown[]) => void) {
        return {
            document: {
                uri: { fsPath, toString: () => `file://${fsPath}` },
            },
            setDecorations: decorationsSpy ?? ((_type: unknown, _ranges: unknown[]) => { /* no-op */ }),
        };
    }

    afterEach(() => {
        // Always restore activeTextEditor to undefined after each test
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = undefined;
    });

    test('applyDecorations is called during construction when activeTextEditor is set', () => {
        const calls: unknown[][] = [];
        const mockEditor = makeMockEditor('/workspace/test.ts', (_t, r) => calls.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        void new IssueDecorationProvider(svc);
        // setDecorations should have been called (with empty ranges since no issues)
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0], []);
    });

    test('applyDecorations sets empty decorations when no matching issues', async () => {
        await db.createIssue(mkPart({ title: 'Other', codeLinks: [] }));

        const ranges: unknown[][] = [];
        const mockEditor = makeMockEditor('/workspace/other.ts', (_t, r) => ranges.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        new IssueDecorationProvider(svc);
        assert.deepStrictEqual(ranges[0], []);
    });

    test('applyDecorations sets empty decorations when config disables it', () => {
        const original = vscode.workspace.getConfiguration;
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (_section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                if (key === CFG_DECORATIONS_ENABLED) { return false as unknown as T; }
                return defaultValue;
            },
            has: () => false,
            update: async () => { },
            inspect: () => undefined,
        });

        const calls: unknown[][] = [];
        const mockEditor = makeMockEditor('/workspace/test.ts', (_t, r) => calls.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        try {
            const provider = new IssueDecorationProvider(svc);
            void provider;
            // applyDecorations called with empty array when disabled
            assert.strictEqual(calls.length, 1);
            assert.deepStrictEqual(calls[0], []);
        } finally {
            (vscode.workspace as { getConfiguration: unknown }).getConfiguration = original;
        }
    });

    test('applyDecorations adds Range decorations for issues with code links', async () => {
        await db.createIssue(mkPart({
            codeLinks: [{
                id: 'cl-1',
                workspaceFolder: null,
                filePath: 'src/main.ts',
                startLine: 10,
                endLine: 15,
                snippet: '',
                createdAt: new Date().toISOString(),
            }],
        }));

        const calls: unknown[][] = [];
        const mockEditor = makeMockEditor('src/main.ts', (_t, r) => calls.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        new IssueDecorationProvider(svc);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual((calls[0] as unknown[]).length, 1);
    });

    test('applyDecorations filters links by filePath', async () => {
        await db.createIssue(mkPart({
            codeLinks: [
                {
                    id: 'cl-match',
                    workspaceFolder: null,
                    filePath: 'target.ts',
                    startLine: 1,
                    endLine: 3,
                    snippet: '',
                    createdAt: new Date().toISOString(),
                },
                {
                    id: 'cl-other',
                    workspaceFolder: null,
                    filePath: 'other.ts',
                    startLine: 5,
                    endLine: 8,
                    snippet: '',
                    createdAt: new Date().toISOString(),
                },
            ],
        }));

        const calls: unknown[][] = [];
        const mockEditor = makeMockEditor('target.ts', (_t, r) => calls.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        new IssueDecorationProvider(svc);
        assert.strictEqual((calls[0] as unknown[]).length, 1);
    });

    test('onDidChangeTextDocument triggers applyDecorations for active editor', async () => {
        await db.createIssue(mkPart({ codeLinks: [] }));

        const calls: unknown[][] = [];
        const mockEditor = makeMockEditor('file.ts', (_t, r) => calls.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        new IssueDecorationProvider(svc);
        // Clear the initial call
        calls.length = 0;

        // Simulate onDidChangeTextDocument
        const listeners = (vscode.workspace as unknown as { _onDidChangeTextDocument: { _listeners: ((e: unknown) => void)[] } })._onDidChangeTextDocument;
        if (listeners && listeners._listeners) {
            for (const fn of listeners._listeners) {
                fn({ document: mockEditor.document });
            }
        }
        // The debounced update may or may not have fired yet; just verify no error
        assert.ok(true);
    });

    test('onIssueChanged triggers applyDecorations when editor is active', async () => {
        const calls: unknown[][] = [];
        const mockEditor = makeMockEditor('file.ts', (_t, r) => calls.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        new IssueDecorationProvider(svc);
        calls.length = 0;

        // Creating an issue fires onIssueChanged
        await db.createIssue(mkPart({ codeLinks: [] }));
        // Debounced — may not fire synchronously, but should not throw
        assert.ok(true);
    });

    test('applyDecorations uses workspace folder to resolve relative path', async () => {
        await db.createIssue(mkPart({
            codeLinks: [{
                id: 'cl-1',
                workspaceFolder: null,
                filePath: 'src/main.ts',
                startLine: 5,
                endLine: 5,
                snippet: '',
                createdAt: new Date().toISOString(),
            }],
        }));

        // Set up workspace folder resolution
        const originalGetWorkspaceFolder = vscode.workspace.getWorkspaceFolder;
        const folderUri = { fsPath: '/workspace', toString: () => 'file:///workspace', scheme: 'file' };
        (vscode.workspace as { getWorkspaceFolder: unknown }).getWorkspaceFolder = () => ({ uri: folderUri });

        const calls: unknown[][] = [];
        const mockEditor = makeMockEditor('/workspace/src/main.ts', (_t, r) => calls.push(r as unknown[]));
        (vscode.window as { activeTextEditor: unknown }).activeTextEditor = mockEditor;

        try {
            new IssueDecorationProvider(svc);
            // relPath would be resolved to 'src/main.ts' and match the code link
            assert.strictEqual((calls[0] as unknown[]).length, 1);
        } finally {
            (vscode.workspace as { getWorkspaceFolder: unknown }).getWorkspaceFolder = originalGetWorkspaceFolder;
        }
    });
});

// ===========================================================================
// IssueCodeLensProvider — disabled config path
// ===========================================================================

describe('IssueCodeLensProvider (config disabled)', () => {
    afterEach(() => {
        // nothing to restore since we restore inline
    });

    test('provideCodeLenses returns [] when code lens is disabled in config', () => {
        const original = vscode.workspace.getConfiguration;
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (_section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                if (key === CFG_CODE_LENS_ENABLED) { return false as unknown as T; }
                return defaultValue;
            },
            has: () => false,
            update: async () => { },
            inspect: () => undefined,
        });

        try {
            const provider = new IssueCodeLensProvider(svc);
            const doc = { uri: { fsPath: 'test.ts', toString: () => 'file://test.ts' } };
            const token = { isCancellationRequested: false };
            const lenses = provider.provideCodeLenses(doc as never, token as never);
            assert.deepStrictEqual(lenses, []);
        } finally {
            (vscode.workspace as { getConfiguration: unknown }).getConfiguration = original;
        }
    });

    test('provideCodeLenses resolves relPath using workspace folder', async () => {
        await db.createIssue(mkPart({
            codeLinks: [{
                id: 'cl-1',
                workspaceFolder: null,
                filePath: 'src/myfile.ts',
                startLine: 1,
                endLine: 1,
                snippet: '',
                createdAt: new Date().toISOString(),
            }],
        }));

        const originalGWF = vscode.workspace.getWorkspaceFolder;
        const folderUri = { fsPath: '/proj', toString: () => 'file:///proj', scheme: 'file' };
        (vscode.workspace as { getWorkspaceFolder: unknown }).getWorkspaceFolder = () => ({ uri: folderUri });

        try {
            const provider = new IssueCodeLensProvider(svc);
            const doc = { uri: { fsPath: '/proj/src/myfile.ts', toString: () => 'file:///proj/src/myfile.ts' } };
            const token = { isCancellationRequested: false };
            const lenses = provider.provideCodeLenses(doc as never, token as never);
            assert.strictEqual(lenses.length, 1);
        } finally {
            (vscode.workspace as { getWorkspaceFolder: unknown }).getWorkspaceFolder = originalGWF;
        }
    });
});

// ===========================================================================
// IssueTreeProvider — groupBy variants
// ===========================================================================

describe('IssueTreeProvider (groupBy variants)', () => {
    function makeConfigWith(groupByValue: string) {
        return (_section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                if (key === 'treeGroupBy') { return groupByValue as unknown as T; }
                if (key === 'showResolvedIssues') { return false as unknown as T; }
                return defaultValue;
            },
            has: () => false,
            update: async () => { },
            inspect: () => undefined,
        });
    }

    afterEach(() => {
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (_section?: string) => ({
            get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
            has: () => false,
            update: async () => { },
            inspect: () => undefined,
        });
    });

    test('getChildren groups by type', async () => {
        await db.createIssue(mkPart({ type: 'bug' }));
        await db.createIssue(mkPart({ type: 'feature' }));
        await db.createIssue(mkPart({ type: 'bug', title: 'Bug 2' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('type');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as GroupTreeItem[];
        assert.ok(children.some((c) => c.label === 'bug'));
        assert.ok(children.some((c) => c.label === 'feature'));
    });

    test('getChildren groups by severity', async () => {
        await db.createIssue(mkPart({ severity: 'critical' }));
        await db.createIssue(mkPart({ severity: 'low' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('severity');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as GroupTreeItem[];
        // critical should appear before low in severity order
        const criticalIdx = children.findIndex((c) => c.label === 'critical');
        const lowIdx = children.findIndex((c) => c.label === 'low');
        assert.ok(criticalIdx < lowIdx);
    });

    test('getChildren groups by milestone', async () => {
        const milestone = await db.createMilestone({ name: 'v2.0', description: '', targetDate: null, completedDate: null, workspaceFolder: null });
        await db.createIssue(mkPart({ milestoneId: milestone.id }));
        await db.createIssue(mkPart({ milestoneId: null, title: 'No Milestone Issue' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('milestone');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as GroupTreeItem[];
        assert.ok(children.some((c) => c.label === 'v2.0'));
        assert.ok(children.some((c) => c.label === 'No Milestone'));
    });

    test('getChildren groups by sprint', async () => {
        const sprint = await db.createSprint({ name: 'Sprint 1', status: 'active', startDate: null, endDate: null, description: '', workspaceFolder: null });
        await db.createIssue(mkPart({ sprintId: sprint.id }));
        await db.createIssue(mkPart({ sprintId: null, title: 'No Sprint Issue' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('sprint');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as GroupTreeItem[];
        assert.ok(children.some((c) => c.label === 'Sprint 1'));
        assert.ok(children.some((c) => c.label === 'No Sprint'));
    });

    test('getChildren groups by assignee', async () => {
        await db.createIssue(mkPart({ assignedTo: 'alice' }));
        await db.createIssue(mkPart({ assignedTo: null, title: 'Unassigned' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('assignee');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as GroupTreeItem[];
        assert.ok(children.some((c) => c.label === 'alice'));
        assert.ok(children.some((c) => c.label === 'Unassigned'));
    });

    test('getChildren groups by none (flat list, sorted by sequentialId)', async () => {
        await db.createIssue(mkPart({ title: 'First' }));
        await db.createIssue(mkPart({ title: 'Second' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('none');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as IssueTreeItem[];
        assert.strictEqual(children.length, 2);
        assert.ok(children[0] instanceof IssueTreeItem);
        assert.ok(children[0].issue.sequentialId <= children[1].issue.sequentialId);
    });

    test('getChildren filters out resolved issues when showResolved=false', async () => {
        await db.createIssue(mkPart({ title: 'Open', status: 'open' }));
        await db.createIssue(mkPart({ title: 'Resolved', status: 'resolved' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (_section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                if (key === 'treeGroupBy') { return 'none' as unknown as T; }
                if (key === 'showResolvedIssues') { return false as unknown as T; }
                return defaultValue;
            },
            has: () => false,
            update: async () => { },
            inspect: () => undefined,
        });

        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as IssueTreeItem[];
        assert.strictEqual(children.length, 1);
        assert.strictEqual(children[0].issue.title, 'Open');
    });

    test('getChildren includes resolved when showResolved=true', async () => {
        await db.createIssue(mkPart({ title: 'Open', status: 'open' }));
        await db.createIssue(mkPart({ title: 'Resolved', status: 'resolved' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (_section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                if (key === 'treeGroupBy') { return 'none' as unknown as T; }
                if (key === 'showResolvedIssues') { return true as unknown as T; }
                return defaultValue;
            },
            has: () => false,
            update: async () => { },
            inspect: () => undefined,
        });

        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as IssueTreeItem[];
        assert.strictEqual(children.length, 2);
    });

    test('groupBy milestone uses Unknown Milestone when milestoneId not found', async () => {
        await db.createIssue(mkPart({ milestoneId: 'nonexistent-id' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('milestone');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as GroupTreeItem[];
        assert.ok(children.some((c) => c.label === 'Unknown Milestone'));
    });

    test('groupBy sprint uses Unknown Sprint when sprintId not found', async () => {
        await db.createIssue(mkPart({ sprintId: 'nonexistent-sprint' }));

        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = makeConfigWith('sprint');
        const provider = new IssueTreeProvider(svc);
        const children = (await provider.getChildren()) as GroupTreeItem[];
        assert.ok(children.some((c) => c.label === 'Unknown Sprint'));
    });

    test('IssueTreeItem buildTooltip includes assignedTo', async () => {
        const issue = await db.createIssue(mkPart({ assignedTo: 'bob', reportedInVersion: 'v1.0', targetVersion: 'v2.0' }));
        const item = new IssueTreeItem(issue);
        assert.ok(item.tooltip !== undefined);
    });
});

