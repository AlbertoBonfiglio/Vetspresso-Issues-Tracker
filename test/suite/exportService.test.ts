/**
 * Unit tests for ExportService.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from "assert";
import { IssueDatabase } from "../../src/database/IssueDatabase";
import { ExportService } from "../../src/services/ExportService";
import { Issue, IssueStoreIndex, Milestone, Sprint, IssueTemplate } from "../../src/types";
import { IStorageProvider } from "../../src/storage/IStorageProvider";

class MemStub implements IStorageProvider {
    label = "mem";
    private issues = new Map<string, Issue>();
    private milestones: Milestone[] = [];
    private sprints: Sprint[] = [];
    private templates: IssueTemplate[] = [];
    private index: IssueStoreIndex | null = null;
    private readonly uri = { fsPath: "/mem", toString: () => "mem:", scheme: "mem" } as unknown as import("vscode").Uri;
    async initialise() { }
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

type PartialIssue = Omit<Issue, "id" | "sequentialId" | "createdAt" | "updatedAt">;
function mkPart(overrides: Partial<PartialIssue> = {}): PartialIssue {
    return { title: "Test Issue", description: "A test description", type: "bug", status: "open", severity: "medium", urgency: "normal", reportedInVersion: null, fixedInVersion: null, targetVersion: null, milestoneId: null, sprintId: null, tags: ["test"], estimatedHours: null, timeEntries: [], reportedBy: "alice", assignedTo: null, resolvedAt: null, codeLinks: [], relations: [], comments: [], workspaceFolder: null, templateId: null, ...overrides };
}

describe("ExportService", () => {
    let db: IssueDatabase;
    let svc: ExportService;

    beforeEach(async () => {
        const storage = new MemStub();
        db = new IssueDatabase(storage);
        await db.load();
        svc = new ExportService(db);
    });

    afterEach(() => { db.dispose(); });

    test("export json returns valid JSON", async () => {
        await db.createIssue(mkPart());
        assert.doesNotThrow(() => JSON.parse(svc.export("json")));
    });

    test("export json contains all issues", async () => {
        await db.createIssue(mkPart({ title: "Alpha" }));
        await db.createIssue(mkPart({ title: "Beta" }));
        const parsed = JSON.parse(svc.export("json")) as Issue[];
        assert.ok(Array.isArray(parsed));
        assert.strictEqual(parsed.length, 2);
    });

    test("export json round-trips issue fields", async () => {
        const issue = await db.createIssue(mkPart({ title: "Round-trip", description: "Keep me" }));
        const parsed = JSON.parse(svc.export("json")) as Issue[];
        const found = parsed.find((i) => i.id === issue.id);
        assert.ok(found);
        assert.strictEqual(found.title, "Round-trip");
        assert.strictEqual(found.description, "Keep me");
    });

    test("export csv returns non-empty string", async () => {
        await db.createIssue(mkPart());
        assert.ok(svc.export("csv").length > 0);
    });

    test("export csv has a header row", async () => {
        const firstLine = svc.export("csv").split("\n")[0];
        assert.ok(firstLine && (firstLine.toLowerCase().includes("id") || firstLine.toLowerCase().includes("title")));
    });

    test("export csv contains issue title", async () => {
        await db.createIssue(mkPart({ title: "CSV Export Test" }));
        assert.ok(svc.export("csv").includes("CSV Export Test"));
    });

    test("export csv handles commas in title by quoting", async () => {
        await db.createIssue(mkPart({ title: "Issue, with comma" }));
        assert.ok(svc.export("csv").includes('"Issue, with comma"'));
    });

    test("export csv handles quotes in title by escaping", async () => {
        await db.createIssue(mkPart({ title: 'Issue "with quotes"' }));
        const csv = svc.export("csv");
        assert.ok(csv.includes('"Issue ""with quotes"""'));
    });

    test("export markdown contains issue title", async () => {
        await db.createIssue(mkPart({ title: "Markdown Export" }));
        assert.ok(svc.export("markdown").includes("Markdown Export"));
    });

    test("export markdown has a header", async () => {
        assert.ok(svc.export("markdown").trimStart().startsWith("#"));
    });

    test("export markdown includes issue type", async () => {
        await db.createIssue(mkPart({ type: "feature", status: "open" }));
        const md = svc.export("markdown").toLowerCase();
        assert.ok(md.includes("feature"));
    });

    test("importFromJson() adds new issues", async () => {
        const issue = await db.createIssue(mkPart({ title: "Existing" }));
        const exported = svc.export("json");
        await db.deleteIssue(issue.id);
        assert.strictEqual(db.getAllIssues().length, 0);
        const imported = await svc.importFromJson(exported);
        assert.strictEqual(imported, 1);
    });

    test("importFromJson() skips duplicate UUIDs", async () => {
        await db.createIssue(mkPart({ title: "Original" }));
        const exported = svc.export("json");
        const imported = await svc.importFromJson(exported);
        assert.strictEqual(imported, 0);
    });

    test("importFromJson() returns count of imported issues", async () => {
        await db.createIssue(mkPart({ title: "A" }));
        await db.createIssue(mkPart({ title: "B" }));
        const exported = svc.export("json");
        for (const issue of db.getAllIssues()) { await db.deleteIssue(issue.id); }
        const imported = await svc.importFromJson(exported);
        assert.strictEqual(imported, 2);
    });

    test("importFromJson() throws for malformed JSON", async () => {
        await assert.rejects(() => svc.importFromJson("not json at all"), /Invalid JSON|SyntaxError/i);
    });
});
