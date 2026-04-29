/**
 * General-purpose helpers and pure utility functions.
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import type {
    Issue,
    IssueStatus,
    IssueType,
    Severity,
    Urgency,
    GroupBy,
    ExportDateFormat,
} from '../types';
import { CONFIG_SECTION, CFG_AUTHOR } from '../constants';

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

/**
 * Returns a debounced version of `fn` that delays invocation until `delayMs`
 * milliseconds have passed since the last call.
 */
export function debounce<T extends (...args: unknown[]) => void>(
    fn: T,
    delayMs: number
): (...args: Parameters<T>) => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (...args: Parameters<T>) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delayMs);
    };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Formats an ISO 8601 datetime string into a human-readable relative time,
 * e.g. "3 days ago", "just now", "in 2 hours".
 */
export function relativeTime(isoString: string): string {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const absMs = Math.abs(diffMs);
    const future = diffMs < 0;

    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const week = 7 * day;
    const month = 30 * day;
    const year = 365 * day;

    let label: string;
    if (absMs < minute) {
        label = 'just now';
    } else if (absMs < hour) {
        const n = Math.floor(absMs / minute);
        label = `${n} minute${n !== 1 ? 's' : ''}`;
    } else if (absMs < day) {
        const n = Math.floor(absMs / hour);
        label = `${n} hour${n !== 1 ? 's' : ''}`;
    } else if (absMs < week) {
        const n = Math.floor(absMs / day);
        label = `${n} day${n !== 1 ? 's' : ''}`;
    } else if (absMs < month) {
        const n = Math.floor(absMs / week);
        label = `${n} week${n !== 1 ? 's' : ''}`;
    } else if (absMs < year) {
        const n = Math.floor(absMs / month);
        label = `${n} month${n !== 1 ? 's' : ''}`;
    } else {
        const n = Math.floor(absMs / year);
        label = `${n} year${n !== 1 ? 's' : ''}`;
    }

    if (label === 'just now') {
        return label;
    }
    return future ? `in ${label}` : `${label} ago`;
}

/**
 * Returns `true` if `isoString` refers to a date older than `days` days ago.
 */
export function isOlderThan(isoString: string, days: number): boolean {
    const then = new Date(isoString).getTime();
    return Date.now() - then > days * 24 * 60 * 60_000;
}

/**
 * Formats an ISO 8601 date string as a short locale date (e.g. "Mar 25, 2026").
 */
export function shortDate(isoString: string): string {
    return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

// ---------------------------------------------------------------------------
// Issue display helpers
// ---------------------------------------------------------------------------

/** Returns a VS Code `ThemeIcon` codicon name for the given issue type. */
export function iconForType(type: IssueType): string {
    const icons: Record<IssueType, string> = {
        bug: 'bug',
        enhancement: 'star-empty',
        feature: 'light-bulb',
        task: 'checklist',
        question: 'question',
        documentation: 'book',
        other: 'circle-outline',
    };
    return icons[type];
}

/** Returns a VS Code `ThemeIcon` codicon name for the given status. */
export function iconForStatus(status: IssueStatus): string {
    const icons: Record<IssueStatus, string> = {
        'open': 'issues',
        'in-progress': 'sync',
        'in-review': 'eye',
        'on-hold': 'debug-pause',
        'resolved': 'check',
        'closed': 'circle-slash',
        'wontfix': 'x',
        'duplicate': 'copy',
    };
    return icons[status];
}

/** Returns a colour ID (VS Code theme colour) for the given severity. */
export function colorForSeverity(severity: Severity): string {
    const colors: Record<Severity, string> = {
        critical: 'errorForeground',
        high: 'editorWarning.foreground',
        medium: 'editorInfo.foreground',
        low: 'editorHint.foreground',
        trivial: 'descriptionForeground',
    };
    return colors[severity];
}

/** Human-readable label for GroupBy values. */
export function labelForGroupBy(groupBy: GroupBy): string {
    const labels: Record<GroupBy, string> = {
        type: 'Type',
        status: 'Status',
        severity: 'Severity',
        milestone: 'Milestone',
        sprint: 'Sprint',
        assignee: 'Assignee',
        none: 'None (flat list)',
    };
    return labels[groupBy];
}

/**
 * Returns the human-readable title for an issue's status.
 */
export function statusLabel(status: IssueStatus): string {
    const labels: Record<IssueStatus, string> = {
        'open': 'Open',
        'in-progress': 'In Progress',
        'in-review': 'In Review',
        'on-hold': 'On Hold',
        'resolved': 'Resolved',
        'closed': 'Closed',
        'wontfix': 'Won\'t Fix',
        'duplicate': 'Duplicate',
    };
    return labels[status];
}

/**
 * Returns `true` if the issue is considered "done" (resolved, closed, wontfix,
 * or duplicate).
 */
export function isDone(issue: Issue): boolean {
    return ['resolved', 'closed', 'wontfix', 'duplicate'].includes(issue.status);
}

/**
 * Returns `true` if the issue is considered "open" (active work may be happening).
 */
export function isActive(issue: Issue): boolean {
    return ['open', 'in-progress', 'in-review', 'on-hold'].includes(issue.status);
}

/**
 * Calculates total logged hours for an issue.
 */
export function totalLoggedHours(issue: Issue): number {
    return issue.timeEntries.reduce((sum, e) => sum + e.hours, 0);
}

// ---------------------------------------------------------------------------
// Export date formatting
// ---------------------------------------------------------------------------

/**
 * Formats an ISO 8601 date/datetime string according to the chosen export style.
 */
export function formatExportDate(isoString: string, format: ExportDateFormat): string {
    if (!isoString) { return ''; }
    switch (format) {
        case 'iso':
            return isoString;
        case 'locale':
            return new Date(isoString).toLocaleString();
        case 'short':
            return isoString.slice(0, 10);
    }
}

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

/**
 * Reads the configured author name, falling back to git user.name via the
 * VS Code git extension's config if available.
 */
export async function resolveAuthor(): Promise<string> {
    const configured = vscode.workspace
        .getConfiguration(CONFIG_SECTION)
        .get<string>(CFG_AUTHOR, '')
        .trim();

    if (configured) {
        return configured;
    }

    // Try to retrieve git user.name from the git extension API
    try {
        const gitExt = vscode.extensions.getExtension<{ getAPI: (v: number) => { repositories: Array<{ getConfig: (k: string) => Promise<string> }> } }>(
            'vscode.git'
        );
        if (gitExt) {
            const api = gitExt.isActive ? gitExt.exports.getAPI(1) : (await gitExt.activate()).getAPI(1);
            const repos = api.repositories;
            if (repos.length > 0) {
                const name = await repos[0].getConfig('user.name');
                if (name) {
                    return name;
                }
            }
        }
    } catch {
        // If git extension is unavailable, fallback gracefully
    }

    return 'Unknown';
}

// ---------------------------------------------------------------------------
// String utilities
// ---------------------------------------------------------------------------

/**
 * Escapes HTML special characters to prevent XSS in webview content.
 */
export function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Truncates `str` to `maxLen` characters, appending "…" if truncated.
 */
export function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) {
        return str;
    }
    return str.slice(0, maxLen - 1) + '…';
}

/**
 * Generates a webview nonce (cryptographically random base-64 string).
 */
export function generateNonce(): string {
    const buf = Buffer.allocUnsafe(16);
    for (let i = 0; i < 16; i++) {
        buf[i] = Math.floor(Math.random() * 256);
    }
    return buf.toString('base64');
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    trivial: 4,
};

const URGENCY_ORDER: Record<Urgency, number> = {
    immediate: 0,
    high: 1,
    normal: 2,
    low: 3,
    whenever: 4,
};

/** Compares two issues by severity (critical first). */
export function compareSeverity(a: Issue, b: Issue): number {
    return (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
}

/** Compares two issues by urgency (immediate first). */
export function compareUrgency(a: Issue, b: Issue): number {
    return (URGENCY_ORDER[a.urgency] ?? 99) - (URGENCY_ORDER[b.urgency] ?? 99);
}

/** Compares two issues by sequential ID (ascending). */
export function compareById(a: Issue, b: Issue): number {
    return a.sequentialId - b.sequentialId;
}

/** Compares two issues by creation date (newest first). */
export function compareByDate(a: Issue, b: Issue): number {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
