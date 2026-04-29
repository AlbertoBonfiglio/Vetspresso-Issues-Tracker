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
    async readKnownTags() { return []; }
    async writeKnownTags() { }
    async readKnownPersons() { return []; }
    async writeKnownPersons() { }
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

    test("importFromJson() throws for non-array JSON", async () => {
        await assert.rejects(() => svc.importFromJson('{"foo":1}'), /Expected a JSON array/i);
    });

    test("importFromJson() skips malformed entries and still imports valid ones", async () => {
        const good = await db.createIssue(mkPart({ title: "Good" }));
        const exported = JSON.parse(svc.export("json")) as unknown[];
        // Delete so we can re-import
        await db.deleteIssue(good.id);
        // Add a malformed entry (missing sequentialId)
        exported.push({ id: "bad-entry", title: "Bad" });
        const imported = await svc.importFromJson(JSON.stringify(exported));
        assert.strictEqual(imported, 1);
    });

    test("export github-json returns valid JSON array", async () => {
        await db.createIssue(mkPart({ title: "GH Issue", status: "open", severity: "high", tags: ["ui"] }));
        const result = svc.export("github-json");
        const parsed = JSON.parse(result) as unknown[];
        assert.ok(Array.isArray(parsed));
        assert.strictEqual(parsed.length, 1);
    });

    test("export github-json maps resolved status to closed", async () => {
        await db.createIssue(mkPart({ title: "Resolved GH", status: "resolved" }));
        const parsed = JSON.parse(svc.export("github-json")) as { state: string }[];
        assert.strictEqual(parsed[0].state, "closed");
    });

    test("export github-json maps open status to open", async () => {
        await db.createIssue(mkPart({ title: "Open GH", status: "open" }));
        const parsed = JSON.parse(svc.export("github-json")) as { state: string }[];
        assert.strictEqual(parsed[0].state, "open");
    });

    test("export github-json includes labels from type, severity, and tags", async () => {
        await db.createIssue(mkPart({ type: "feature", severity: "critical", tags: ["ui", "perf"] }));
        const parsed = JSON.parse(svc.export("github-json")) as { labels: string[] }[];
        assert.ok(parsed[0].labels.includes("feature"));
        assert.ok(parsed[0].labels.includes("critical"));
        assert.ok(parsed[0].labels.includes("ui"));
        assert.ok(parsed[0].labels.includes("perf"));
    });

    test("export markdown includes detail section with description", async () => {
        await db.createIssue(mkPart({ title: "Detail Issue", description: "My detailed description" }));
        const md = svc.export("markdown");
        assert.ok(md.includes("My detailed description"));
    });

    test("export markdown shows 'No description' for empty description", async () => {
        await db.createIssue(mkPart({ title: "No Desc", description: "" }));
        const md = svc.export("markdown");
        assert.ok(md.includes("No description"));
    });

    test("export markdown escapes pipe characters in title", async () => {
        await db.createIssue(mkPart({ title: "Title | With Pipe" }));
        const md = svc.export("markdown");
        assert.ok(md.includes("Title \\| With Pipe"));
    });

    test("export csv with multiple issues has correct row count", async () => {
        await db.createIssue(mkPart({ title: "A" }));
        await db.createIssue(mkPart({ title: "B" }));
        await db.createIssue(mkPart({ title: "C" }));
        const lines = svc.export("csv").split("\r\n").filter(Boolean);
        // 1 header + 3 data rows
        assert.strictEqual(lines.length, 4);
    });

    test("export csv includes time entry totals", async () => {
        await db.createIssue(mkPart({
            title: "Timed",
            timeEntries: [
                { id: "te1", date: "2024-01-01", hours: 1.5, description: "", author: "a", createdAt: new Date().toISOString() },
                { id: "te2", date: "2024-01-02", hours: 2.5, description: "", author: "b", createdAt: new Date().toISOString() },
            ],
        }));
        const csv = svc.export("csv");
        assert.ok(csv.includes("4"));
    });

    test("export csv handles newlines in description", async () => {
        await db.createIssue(mkPart({ title: "Newline", description: "line1\nline2" }));
        const csv = svc.export("csv");
        // Description with newline should be quoted
        assert.ok(csv.includes('"line1\nline2"'));
    });

    test("export with explicit issues subset", async () => {
        const a = await db.createIssue(mkPart({ title: "A" }));
        await db.createIssue(mkPart({ title: "B" }));
        const result = JSON.parse(svc.export("json", [a])) as Issue[];
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].title, "A");
    });
});
