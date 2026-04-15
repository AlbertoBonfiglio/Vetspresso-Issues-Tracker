/**
 * Core data types for the Vetspresso Issues Tracker.
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

// ---------------------------------------------------------------------------
// Enumerations (as string literal union types for lean JSON serialisation)
// ---------------------------------------------------------------------------

/** The category of an issue. */
export type IssueType =
    | 'bug'
    | 'enhancement'
    | 'feature'
    | 'task'
    | 'question'
    | 'documentation'
    | 'other';

/** Lifecycle state of an issue. */
export type IssueStatus =
    | 'open'
    | 'in-progress'
    | 'in-review'
    | 'resolved'
    | 'closed'
    | 'wontfix'
    | 'duplicate';

/** How serious the issue is (impact if not fixed). */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'trivial';

/** How quickly the issue should be addressed. */
export type Urgency = 'immediate' | 'high' | 'normal' | 'low' | 'whenever';

/** Direction of a relationship between two issues. */
export type RelationType =
    | 'blocks'
    | 'blocked-by'
    | 'relates-to'
    | 'duplicates'
    | 'duplicated-by'
    | 'parent-of'
    | 'child-of';

/** Sprint lifecycle state. */
export type SprintStatus = 'planned' | 'active' | 'completed';

/** Supported export formats. */
export type ExportFormat = 'json' | 'csv' | 'markdown' | 'github-json';

/** Tree view grouping strategy. */
export type GroupBy =
    | 'type'
    | 'status'
    | 'severity'
    | 'milestone'
    | 'sprint'
    | 'assignee'
    | 'none';

/** Where issue data is persisted. */
export type StorageLocation = 'workspace' | 'global';

/** Multi-root workspace storage strategy. */
export type MultiRootStorage = 'shared' | 'perFolder';

// ---------------------------------------------------------------------------
// Sub-entities
// ---------------------------------------------------------------------------

/**
 * A single logged work-time entry against an issue.
 */
export interface TimeEntry {
    /** Unique identifier (UUID v4). */
    id: string;
    /** ISO 8601 date the work was done (date portion only, e.g. "2024-03-25"). */
    date: string;
    /** Hours spent (supports fractional hours, e.g. 1.5). */
    hours: number;
    /** Brief description of work performed. */
    description: string;
    /** Author / user who logged the time. */
    author: string;
    /** When this record was created (full ISO 8601 datetime). */
    createdAt: string;
}

/**
 * A link from an issue to a specific range of code in a file.
 */
export interface CodeLink {
    /** Unique identifier (UUID v4). */
    id: string;
    /** Workspace folder name this file belongs to (null = root / single-root). */
    workspaceFolder: string | null;
    /** File path relative to the workspace folder root. */
    filePath: string;
    /** First linked line number (1-based). */
    startLine: number;
    /** Last linked line number (1-based, inclusive). */
    endLine: number;
    /** Short text preview of the linked code (up to CODE_LINK_SNIPPET_MAX chars). */
    snippet: string;
    /** When this link was created (ISO 8601 datetime). */
    createdAt: string;
}

/**
 * A directed relationship between two issues.
 */
export interface IssueRelation {
    /** The type of relationship viewed from the source issue. */
    type: RelationType;
    /** ID (UUID) of the target issue. */
    targetIssueId: string;
}

/**
 * A comment left on an issue.
 */
export interface IssueComment {
    /** Unique identifier (UUID v4). */
    id: string;
    /** Author name / username. */
    author: string;
    /** Markdown body of the comment. */
    body: string;
    /** When this comment was first posted (ISO 8601 datetime). */
    createdAt: string;
    /** When this comment was last edited (ISO 8601 datetime). */
    updatedAt: string;
}

// ---------------------------------------------------------------------------
// Primary entities
// ---------------------------------------------------------------------------

/**
 * The central data model representing a single tracked issue.
 */
export interface Issue {
    // Identity
    /** Unique identifier (UUID v4). */
    id: string;
    /** Human-readable sequential number within this store (e.g. #1, #42). */
    sequentialId: number;

    // Classification
    /** Short summary title. */
    title: string;
    /** Full Markdown description. */
    description: string;
    /** Category of the issue. */
    type: IssueType;
    /** Current lifecycle status. */
    status: IssueStatus;
    /** How severe the issue is. */
    severity: Severity;
    /** How urgent the issue is. */
    urgency: Urgency;

    // Version linkage
    /** Version tag at the time the issue was reported (null = unknown). */
    reportedInVersion: string | null;
    /** Version tag in which the issue was or will be fixed (null = not set). */
    fixedInVersion: string | null;
    /** Version tag the fix is targeted for (null = not planned). */
    targetVersion: string | null;

    // Organisation
    /** ID of the associated Milestone (null = none). */
    milestoneId: string | null;
    /** ID of the associated Sprint (null = none). */
    sprintId: string | null;
    /** Free-form tags for ad-hoc filtering. */
    tags: string[];

    // Time tracking
    /** Estimated effort in hours (null = not estimated). */
    estimatedHours: number | null;
    /** Logged time entries. */
    timeEntries: TimeEntry[];

    // People
    /** Name / username of the person who reported the issue. */
    reportedBy: string;
    /** Name / username of the current assignee (null = unassigned). */
    assignedTo: string | null;

    // Timestamps
    /** When the issue was created (ISO 8601 datetime). */
    createdAt: string;
    /** When the issue was last modified (ISO 8601 datetime). */
    updatedAt: string;
    /** When the issue moved to resolved/closed (ISO 8601 datetime, null = open). */
    resolvedAt: string | null;

    // Rich content
    /** Links to specific code locations. */
    codeLinks: CodeLink[];
    /** Relationships to other issues. */
    relations: IssueRelation[];
    /** Comments and discussion. */
    comments: IssueComment[];

    // Metadata
    /** Workspace folder name (null = store-level or single-root). */
    workspaceFolder: string | null;
    /** Template ID used to create this issue (null = created from scratch). */
    templateId: string | null;
    /**
     * Whether this issue is considered stale (no activity for N configured days).
     * Computed at read-time; not persisted.
     */
    isStale?: boolean;
}

/**
 * A milestone representing a planned release or project phase.
 */
export interface Milestone {
    /** Unique identifier (UUID v4). */
    id: string;
    /** Display name. */
    name: string;
    /** Markdown description. */
    description: string;
    /** Target completion date (ISO 8601 date string, null = open-ended). */
    targetDate: string | null;
    /** Actual completion date (ISO 8601 date string, null = not completed). */
    completedDate: string | null;
    /** When the milestone was created (ISO 8601 datetime). */
    createdAt: string;
    /** When the milestone was last modified (ISO 8601 datetime). */
    updatedAt: string;
    /** Workspace folder (null = shared/root). */
    workspaceFolder: string | null;
}

/**
 * An agile sprint (time-boxed iteration).
 */
export interface Sprint {
    /** Unique identifier (UUID v4). */
    id: string;
    /** Display name (e.g. "Sprint 3"). */
    name: string;
    /** Markdown description or sprint goal. */
    description: string;
    /** Sprint start date (ISO 8601 date string, null = not started). */
    startDate: string | null;
    /** Sprint end date (ISO 8601 date string, null = open). */
    endDate: string | null;
    /** Current lifecycle state. */
    status: SprintStatus;
    /** When the sprint was created (ISO 8601 datetime). */
    createdAt: string;
    /** When the sprint was last modified (ISO 8601 datetime). */
    updatedAt: string;
    /** Workspace folder (null = shared/root). */
    workspaceFolder: string | null;
}

/**
 * A reusable issue template that pre-fills fields when creating new issues.
 */
export interface IssueTemplate {
    /** Unique identifier (UUID v4). */
    id: string;
    /** Display name of the template. */
    name: string;
    /** Short description of when to use this template. */
    description: string;
    /** Pre-selected issue type. */
    type: IssueType;
    /** Pre-selected severity. */
    defaultSeverity: Severity;
    /** Pre-selected urgency. */
    defaultUrgency: Urgency;
    /** Title template (supports {{variable}} placeholders — future use). */
    titleTemplate: string;
    /** Body/description template (Markdown, supports {{variable}} placeholders). */
    bodyTemplate: string;
    /** Tags automatically added to issues created with this template. */
    defaultTags: string[];
    /** When the template was created (ISO 8601 datetime). */
    createdAt: string;
    /** When the template was last modified (ISO 8601 datetime). */
    updatedAt: string;
}

/**
 * The persistent index file written alongside issue files.
 * Tracks schema version and sequential ID counter.
 */
export interface IssueStoreIndex {
    /** Data schema version for forward-compatibility checks. */
    schemaVersion: string;
    /** Next value to assign as sequentialId for a new issue. */
    nextSequentialId: number;
    /** When this store was first initialised (ISO 8601 datetime). */
    createdAt: string;
    /** When this index was last written (ISO 8601 datetime). */
    updatedAt: string;
}

// ---------------------------------------------------------------------------
// Filter / search types
// ---------------------------------------------------------------------------

/**
 * Criteria used to filter the issue list.
 * All fields are optional; only set fields participate in filtering.
 */
export interface IssueFilter {
    /** Show only issues with these statuses. */
    status?: IssueStatus[];
    /** Show only issues with these types. */
    type?: IssueType[];
    /** Show only issues with these severities. */
    severity?: Severity[];
    /** Show only issues assigned to this user. */
    assignedTo?: string;
    /** Show only issues reported by this user. */
    reportedBy?: string;
    /** Show only issues belonging to this milestone ID. */
    milestoneId?: string;
    /** Show only issues belonging to this sprint ID. */
    sprintId?: string;
    /** Show only issues having all of these tags. */
    tags?: string[];
    /** Show only stale issues when true. */
    staleOnly?: boolean;
    /** Free-text search string (matched against title and description). */
    searchText?: string;
    /** Show only issues in the given version. */
    version?: string;
}

/**
 * A single search result with relevance metadata.
 */
export interface SearchResult {
    /** The matched issue. */
    issue: Issue;
    /** Fields that matched the search query. */
    matchedFields: (keyof Issue | 'commentBody')[];
    /** A short excerpt highlighting the match context (plaintext). */
    excerpt: string;
}
