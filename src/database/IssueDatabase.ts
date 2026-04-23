/**
 * IssueDatabase — the single source of truth for all persisted data.
 *
 * Maintains an in-memory cache for fast reads and search while delegating
 * all disk I/O to an IStorageProvider.  Emits VS Code EventEmitter events
 * so the rest of the extension can react to data changes.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IStorageProvider } from '../storage/IStorageProvider';
import {
    Issue,
    IssueStatus,
    Milestone,
    Sprint,
    IssueTemplate,
    IssueStoreIndex,
    Attachment,
} from '../types';
import { generateId, nowIso } from '../utils/idGenerator';
import { SCHEMA_VERSION } from '../constants';
import * as logger from '../utils/logger';

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface IssueChangedEvent {
    type: 'created' | 'updated' | 'deleted';
    issue: Issue;
}

export interface MetaChangedEvent {
    type: 'milestone' | 'sprint' | 'template';
}

// ---------------------------------------------------------------------------
// IssueDatabase
// ---------------------------------------------------------------------------

/**
 * Manages CRUD operations for issues, milestones, sprints, and templates.
 *
 * Lifecycle:
 *   1. Construct with a storage provider.
 *   2. Await `load()` to populate the in-memory cache.
 *   3. Use read/write methods.
 *   4. Dispose when done (e.g. on workspace folder removal).
 */
export class IssueDatabase {
    // In-memory caches
    private issueCache = new Map<string, Issue>();
    private milestones: Milestone[] = [];
    private sprints: Sprint[] = [];
    private templates: IssueTemplate[] = [];
    private index: IssueStoreIndex | null = null;
    private knownTags: string[] = [];
    private knownPersons: string[] = [];

    // VS Code event emitters
    private readonly _onIssueChanged = new vscode.EventEmitter<IssueChangedEvent>();
    private readonly _onMetaChanged = new vscode.EventEmitter<MetaChangedEvent>();

    /** Fires whenever an issue is created, updated, or deleted. */
    readonly onIssueChanged: vscode.Event<IssueChangedEvent> = this._onIssueChanged.event;

    /** Fires when milestones, sprints, or templates change. */
    readonly onMetaChanged: vscode.Event<MetaChangedEvent> = this._onMetaChanged.event;

    private loaded = false;

    constructor(private readonly storage: IStorageProvider) { }

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    /**
     * Initialises storage and loads all data into memory.
     * Safe to call multiple times (subsequent calls are no-ops).
     */
    async load(): Promise<void> {
        if (this.loaded) {
            return;
        }
        await this.storage.initialise();
        await this.loadIndex();
        await this.loadIssues();
        await Promise.all([
            this.loadMilestones(),
            this.loadSprints(),
            this.loadTemplates(),
            this.loadKnownTags(),
            this.loadKnownPersons(),
        ]);
        this.loaded = true;
        logger.info(
            `IssueDatabase loaded: ${this.issueCache.size} issues, ` +
            `${this.milestones.length} milestones, ${this.sprints.length} sprints ` +
            `(${this.storage.label})`
        );
    }

    /** Reloads all data from disk, replacing the in-memory cache. */
    async reload(): Promise<void> {
        this.loaded = false;
        this.issueCache.clear();
        await this.load();
        const first = this.issueCache.values().next().value;
        if (first) {
            this._onIssueChanged.fire({ type: 'updated', issue: first });
        }
    }

    /** Releases event emitters. Call when the database is no longer needed. */
    dispose(): void {
        this._onIssueChanged.dispose();
        this._onMetaChanged.dispose();
    }

    // -------------------------------------------------------------------------
    // Issues — read operations
    // -------------------------------------------------------------------------

    /** Returns all issues in memory (unsorted). */
    getAllIssues(): Issue[] {
        return Array.from(this.issueCache.values());
    }

    /** Returns a single issue by UUID, or `null` if not found. */
    getIssue(id: string): Issue | null {
        return this.issueCache.get(id) ?? null;
    }

    /** Returns a single issue by sequential number, or `null` if not found. */
    getIssueBySequentialId(n: number): Issue | null {
        for (const issue of this.issueCache.values()) {
            if (issue.sequentialId === n) {
                return issue;
            }
        }
        return null;
    }

    /**
     * Returns issues filtered by status; if `statuses` is empty, returns all.
     */
    getIssuesByStatus(...statuses: IssueStatus[]): Issue[] {
        if (statuses.length === 0) {
            return this.getAllIssues();
        }
        const set = new Set(statuses);
        return this.getAllIssues().filter((i) => set.has(i.status));
    }

    // -------------------------------------------------------------------------
    // Issues — write operations
    // -------------------------------------------------------------------------

    /**
     * Creates a new issue, persists it, and fires `onIssueChanged`.
     * The caller provides a partial issue; this method fills `id`,
     * `sequentialId`, `createdAt`, and `updatedAt`.
     */
    async createIssue(partial: Omit<Issue, 'id' | 'sequentialId' | 'createdAt' | 'updatedAt'>): Promise<Issue> {
        this.ensureLoaded();

        const now = nowIso();
        const id = generateId();
        const sequentialId = await this.nextSequentialId();

        const issue: Issue = {
            ...partial,
            id,
            sequentialId,
            createdAt: now,
            updatedAt: now,
        };

        if (!issue.attachments) {
            issue.attachments = [];
        }

        this.issueCache.set(id, issue);
        await this.storage.writeIssue(issue);
        this._onIssueChanged.fire({ type: 'created', issue });

        logger.info(`Issue #${sequentialId} created: "${issue.title}" (${id})`);
        return issue;
    }

    /**
     * Updates fields on an existing issue.
     * Supply only the fields that changed; `updatedAt` is always refreshed.
     */
    async updateIssue(id: string, changes: Partial<Omit<Issue, 'id' | 'sequentialId' | 'createdAt'>>): Promise<Issue> {
        this.ensureLoaded();

        const existing = this.issueCache.get(id);
        if (!existing) {
            throw new Error(`Issue not found: ${id}`);
        }

        const updated: Issue = {
            ...existing,
            ...changes,
            id: existing.id,
            sequentialId: existing.sequentialId,
            createdAt: existing.createdAt,
            updatedAt: nowIso(),
        };

        this.issueCache.set(id, updated);
        await this.storage.writeIssue(updated);
        this._onIssueChanged.fire({ type: 'updated', issue: updated });

        logger.debug(`Issue #${updated.sequentialId} updated (${id})`);
        return updated;
    }

    /**
     * Deletes an issue by UUID. Fires `onIssueChanged` if the issue existed.
     * Returns `true` if deleted, `false` if not found.
     */
    async deleteIssue(id: string): Promise<boolean> {
        this.ensureLoaded();

        const issue = this.issueCache.get(id);
        if (!issue) {
            return false;
        }

        this.issueCache.delete(id);
        await this.storage.deleteIssue(id);
        this._onIssueChanged.fire({ type: 'deleted', issue });

        logger.info(`Issue #${issue.sequentialId} deleted (${id})`);
        return true;
    }

    // -------------------------------------------------------------------------
    // Milestones
    // -------------------------------------------------------------------------

    getMilestones(): Milestone[] {
        return [...this.milestones];
    }

    getMilestone(id: string): Milestone | null {
        return this.milestones.find((m) => m.id === id) ?? null;
    }

    async createMilestone(partial: Omit<Milestone, 'id' | 'createdAt' | 'updatedAt'>): Promise<Milestone> {
        this.ensureLoaded();
        const now = nowIso();
        const milestone: Milestone = { ...partial, id: generateId(), createdAt: now, updatedAt: now };
        this.milestones.push(milestone);
        await this.storage.writeMilestones(this.milestones);
        this._onMetaChanged.fire({ type: 'milestone' });
        return milestone;
    }

    async updateMilestone(id: string, changes: Partial<Omit<Milestone, 'id' | 'createdAt'>>): Promise<Milestone> {
        this.ensureLoaded();
        const idx = this.milestones.findIndex((m) => m.id === id);
        if (idx === -1) {
            throw new Error(`Milestone not found: ${id}`);
        }
        const updated: Milestone = {
            ...this.milestones[idx],
            ...changes,
            id,
            createdAt: this.milestones[idx].createdAt,
            updatedAt: nowIso(),
        };
        this.milestones[idx] = updated;
        await this.storage.writeMilestones(this.milestones);
        this._onMetaChanged.fire({ type: 'milestone' });
        return updated;
    }

    async deleteMilestone(id: string): Promise<boolean> {
        this.ensureLoaded();
        const before = this.milestones.length;
        this.milestones = this.milestones.filter((m) => m.id !== id);
        if (this.milestones.length === before) {
            return false;
        }
        // Detach milestone from issues
        for (const [issueId, issue] of this.issueCache) {
            if (issue.milestoneId === id) {
                await this.updateIssue(issueId, { milestoneId: null });
            }
        }
        await this.storage.writeMilestones(this.milestones);
        this._onMetaChanged.fire({ type: 'milestone' });
        return true;
    }

    // -------------------------------------------------------------------------
    // Sprints
    // -------------------------------------------------------------------------

    getSprints(): Sprint[] {
        return [...this.sprints];
    }

    getSprint(id: string): Sprint | null {
        return this.sprints.find((s) => s.id === id) ?? null;
    }

    async createSprint(partial: Omit<Sprint, 'id' | 'createdAt' | 'updatedAt'>): Promise<Sprint> {
        this.ensureLoaded();
        const now = nowIso();
        const sprint: Sprint = { ...partial, id: generateId(), createdAt: now, updatedAt: now };
        this.sprints.push(sprint);
        await this.storage.writeSprints(this.sprints);
        this._onMetaChanged.fire({ type: 'sprint' });
        return sprint;
    }

    async updateSprint(id: string, changes: Partial<Omit<Sprint, 'id' | 'createdAt'>>): Promise<Sprint> {
        this.ensureLoaded();
        const idx = this.sprints.findIndex((s) => s.id === id);
        if (idx === -1) {
            throw new Error(`Sprint not found: ${id}`);
        }
        const updated: Sprint = {
            ...this.sprints[idx],
            ...changes,
            id,
            createdAt: this.sprints[idx].createdAt,
            updatedAt: nowIso(),
        };
        this.sprints[idx] = updated;
        await this.storage.writeSprints(this.sprints);
        this._onMetaChanged.fire({ type: 'sprint' });
        return updated;
    }

    async deleteSprint(id: string): Promise<boolean> {
        this.ensureLoaded();
        const before = this.sprints.length;
        this.sprints = this.sprints.filter((s) => s.id !== id);
        if (this.sprints.length === before) {
            return false;
        }
        for (const [issueId, issue] of this.issueCache) {
            if (issue.sprintId === id) {
                await this.updateIssue(issueId, { sprintId: null });
            }
        }
        await this.storage.writeSprints(this.sprints);
        this._onMetaChanged.fire({ type: 'sprint' });
        return true;
    }

    // -------------------------------------------------------------------------
    // Templates
    // -------------------------------------------------------------------------

    getTemplates(): IssueTemplate[] {
        return [...this.templates];
    }

    getTemplate(id: string): IssueTemplate | null {
        return this.templates.find((t) => t.id === id) ?? null;
    }

    async saveTemplates(templates: IssueTemplate[]): Promise<void> {
        this.templates = templates;
        await this.storage.writeTemplates(templates);
        this._onMetaChanged.fire({ type: 'template' });
    }

    // -------------------------------------------------------------------------
    // Statistics helpers
    // -------------------------------------------------------------------------

    /** Returns counts of open/active issues grouped by status. */
    getOpenCount(): number {
        let count = 0;
        for (const issue of this.issueCache.values()) {
            if (['open', 'in-progress', 'in-review'].includes(issue.status)) {
                count++;
            }
        }
        return count;
    }

    /** Returns the count of critical severity open issues. */
    getCriticalCount(): number {
        let count = 0;
        for (const issue of this.issueCache.values()) {
            if (
                issue.severity === 'critical' &&
                ['open', 'in-progress', 'in-review'].includes(issue.status)
            ) {
                count++;
            }
        }
        return count;
    }

    /** Returns all unique tags across all issues. */
    getAllTags(): string[] {
        const tagSet = new Set<string>();
        for (const issue of this.issueCache.values()) {
            issue.tags.forEach((t) => tagSet.add(t));
        }
        return Array.from(tagSet).sort();
    }

    /** Returns all unique assignee names across all issues. */
    getAllAssignees(): string[] {
        const names = new Set<string>();
        for (const issue of this.issueCache.values()) {
            if (issue.assignedTo) {
                names.add(issue.assignedTo);
            }
        }
        return Array.from(names).sort();
    }

    /** Returns the persisted list of known tags (all ever confirmed, including deleted issues). */
    getKnownTags(): string[] {
        return [...this.knownTags];
    }

    /** Returns the persisted list of known person names (reporters & assignees). */
    getKnownPersons(): string[] {
        return [...this.knownPersons];
    }

    /**
     * Adds a tag to the known-tags list if it is not already present.
     * Persists the updated list.
     */
    async addKnownTag(tag: string): Promise<void> {
        const t = tag.trim();
        if (!t || this.knownTags.includes(t)) { return; }
        this.knownTags = [...this.knownTags, t].sort();
        await this.storage.writeKnownTags(this.knownTags);
    }

    /**
     * Adds a person name to the known-persons list if it is not already present.
     * Persists the updated list.
     */
    async addKnownPerson(person: string): Promise<void> {
        const p = person.trim();
        if (!p || this.knownPersons.includes(p)) { return; }
        this.knownPersons = [...this.knownPersons, p].sort();
        await this.storage.writeKnownPersons(this.knownPersons);
    }

    /** Returns the underlying storage provider reference. */
    getStorage(): IStorageProvider {
        return this.storage;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private async loadIndex(): Promise<void> {
        this.index = await this.storage.readIndex();
        if (!this.index) {
            this.index = {
                schemaVersion: SCHEMA_VERSION,
                nextSequentialId: 1,
                createdAt: nowIso(),
                updatedAt: nowIso(),
            };
            await this.storage.writeIndex(this.index);
        }
    }

    private async loadIssues(): Promise<void> {
        const issues = await this.storage.readAllIssues();
        this.issueCache.clear();
        for (const issue of issues) {
            if (!issue.attachments) {
                issue.attachments = [];
            }
            this.issueCache.set(issue.id, issue);
        }
    }

    private async loadMilestones(): Promise<void> {
        this.milestones = await this.storage.readMilestones();
    }

    private async loadSprints(): Promise<void> {
        this.sprints = await this.storage.readSprints();
    }

    private async loadTemplates(): Promise<void> {
        this.templates = await this.storage.readTemplates();
    }

    private async loadKnownTags(): Promise<void> {
        const stored = await this.storage.readKnownTags();
        // Seed from issue data for backwards-compatibility with existing stores
        const fromIssues = this.getAllTags();
        const merged = [...new Set([...stored, ...fromIssues])].sort();
        this.knownTags = merged;
        if (merged.length !== stored.length) {
            await this.storage.writeKnownTags(merged);
        }
    }

    private async loadKnownPersons(): Promise<void> {
        const stored = await this.storage.readKnownPersons();
        const fromIssues = new Set<string>();
        for (const issue of this.issueCache.values()) {
            if (issue.reportedBy) { fromIssues.add(issue.reportedBy); }
            if (issue.assignedTo) { fromIssues.add(issue.assignedTo); }
        }
        const merged = [...new Set([...stored, ...fromIssues])].sort();
        this.knownPersons = merged;
        if (merged.length !== stored.length) {
            await this.storage.writeKnownPersons(merged);
        }
    }

    private async nextSequentialId(): Promise<number> {
        if (!this.index) {
            await this.loadIndex();
        }
        if (!this.index) {
            throw new Error('IssueDatabase: index failed to load');
        }
        const id = this.index.nextSequentialId;
        this.index.nextSequentialId = id + 1;
        this.index.updatedAt = nowIso();
        await this.storage.writeIndex(this.index);
        return id;
    }

    private ensureLoaded(): void {
        if (!this.loaded) {
            throw new Error('IssueDatabase.load() must be awaited before use.');
        }
    }
}
