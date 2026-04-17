/**
 * Storage provider abstraction. All persistence goes through this interface
 * so that workspace-based and global-storage backends are interchangeable.
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import { IssueStoreIndex, Issue, Milestone, Sprint, IssueTemplate } from '../types';

/**
 * Abstraction layer over where and how issue data is written to disk.
 *
 * Implementations must be safe to call concurrently; callers serialise
 * write operations as needed.
 */
export interface IStorageProvider {
    /**
     * Human-readable identifier for displaying in status / error messages.
     * e.g. "workspace (.vscode/issues)" or "global storage"
     */
    readonly label: string;

    /**
     * Initialises the storage backend (creates directories/files as needed).
     * Must be called before any other method.
     */
    initialise(): Promise<void>;

    // ------- Index -------

    /** Reads the store index, or `null` if it does not yet exist. */
    readIndex(): Promise<IssueStoreIndex | null>;

    /** Persists the store index. */
    writeIndex(index: IssueStoreIndex): Promise<void>;

    // ------- Issues -------

    /**
     * Returns all issues in this store.
     * Individual reads are batched internally for performance.
     */
    readAllIssues(): Promise<Issue[]>;

    /** Reads a single issue by ID.  Returns `null` if not found. */
    readIssue(id: string): Promise<Issue | null>;

    /** Writes (creates or overwrites) a single issue. */
    writeIssue(issue: Issue): Promise<void>;

    /** Deletes the persisted file for the given issue ID. */
    deleteIssue(id: string): Promise<void>;

    // ------- Milestones -------

    /** Reads the milestones collection. */
    readMilestones(): Promise<Milestone[]>;

    /** Persists the entire milestones collection. */
    writeMilestones(milestones: Milestone[]): Promise<void>;

    // ------- Sprints -------

    /** Reads the sprints collection. */
    readSprints(): Promise<Sprint[]>;

    /** Persists the entire sprints collection. */
    writeSprints(sprints: Sprint[]): Promise<void>;

    // ------- Templates -------

    /** Reads the issue templates collection. */
    readTemplates(): Promise<IssueTemplate[]>;

    /** Persists the entire templates collection. */
    writeTemplates(templates: IssueTemplate[]): Promise<void>;

    // ------- Known Tags -------

    /** Reads the list of known/previously-used tags. */
    readKnownTags(): Promise<string[]>;

    /** Persists the known-tags list. */
    writeKnownTags(tags: string[]): Promise<void>;

    // ------- Known Persons -------

    /** Reads the list of known/previously-used person names (reporters & assignees). */
    readKnownPersons(): Promise<string[]>;

    /** Persists the known-persons list. */
    writeKnownPersons(persons: string[]): Promise<void>;

    /**
     * Returns a URI to the root storage directory, useful for "reveal in explorer"
     * or diagnostic display.  May return `null` for in-memory / opaque backends.
     */
    getRootUri(): import('vscode').Uri | null;
}
