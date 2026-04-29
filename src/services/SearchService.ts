/**
 * SearchService — full-text and structured search across issues.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import { IssueDatabase } from '../database/IssueDatabase';
import type { Issue, SearchResult } from '../types';
import { truncate } from '../utils/helpers';

const EXCERPT_LENGTH = 120;

/** Full-text and structured search across all issues. */
export class SearchService {
    constructor(private readonly db: IssueDatabase) { }

    /**
     * Performs a full-text search across issue title, description, tags,
     * comments, and code-link snippets.
     *
     * Results are ranked by number of matching fields (highest first).
     *
     * @param query - Plain-text search string (case-insensitive).
     * @param maxResults - Maximum number of results to return (default: 50).
     */
    search(query: string, maxResults = 50): SearchResult[] {
        if (!query.trim()) {
            return [];
        }

        const needle = query.toLowerCase().trim();
        const results: SearchResult[] = [];

        for (const issue of this.db.getAllIssues()) {
            const result = matchIssue(issue, needle);
            if (result) {
                results.push(result);
            }
        }

        // Sort by number of matched fields (more matches = higher rank)
        results.sort((a, b) => b.matchedFields.length - a.matchedFields.length);
        return results.slice(0, maxResults);
    }

    /**
     * Quick reference lookup: returns all issues whose title or sequential ID
     * matches `query`.  Used for issue-relation pickers.
     */
    quickFind(query: string): Issue[] {
        const lower = query.toLowerCase().trim();
        if (!lower) {
            return this.db.getAllIssues().slice(0, 20);
        }

        const seqMatch = /^#?(\d+)$/.exec(lower);
        if (seqMatch) {
            const seq = parseInt(seqMatch[1]);
            const found = this.db.getIssueBySequentialId(seq);
            return found ? [found] : [];
        }

        return this.db
            .getAllIssues()
            .filter((i) => i.title.toLowerCase().includes(lower))
            .slice(0, 20);
    }

    /**
     * Returns all issues tagged with `tag` (exact match, case-sensitive).
     */
    findByTag(tag: string): Issue[] {
        return this.db.getAllIssues().filter((i) => i.tags.includes(tag));
    }
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function matchIssue(issue: Issue, needle: string): SearchResult | null {
    const matchedFields: SearchResult['matchedFields'] = [];
    let excerpt = '';

    if (issue.title.toLowerCase().includes(needle)) {
        matchedFields.push('title');
        excerpt = highlight(issue.title, needle, EXCERPT_LENGTH);
    }

    if (issue.description.toLowerCase().includes(needle)) {
        matchedFields.push('description');
        if (!excerpt) {
            excerpt = highlight(issue.description, needle, EXCERPT_LENGTH);
        }
    }

    if (issue.tags.some((t) => t.toLowerCase().includes(needle))) {
        matchedFields.push('tags');
    }

    for (const comment of issue.comments) {
        if (comment.body.toLowerCase().includes(needle)) {
            matchedFields.push('commentBody');
            if (!excerpt) {
                excerpt = highlight(comment.body, needle, EXCERPT_LENGTH);
            }
            break;
        }
    }

    if (
        issue.reportedBy.toLowerCase().includes(needle) ||
        (issue.assignedTo && issue.assignedTo.toLowerCase().includes(needle))
    ) {
        matchedFields.push('reportedBy');
    }

    if (matchedFields.length === 0) {
        return null;
    }

    return { issue, matchedFields, excerpt: excerpt || truncate(issue.title, EXCERPT_LENGTH) };
}

/**
 * Extracts a context window around the first occurrence of `needle` in `text`.
 */
function highlight(text: string, needle: string, maxLen: number): string {
    const lower = text.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx === -1) {
        return truncate(text, maxLen);
    }
    const half = Math.floor(maxLen / 2);
    const start = Math.max(0, idx - half);
    const end = Math.min(text.length, start + maxLen);
    const snippet = text.slice(start, end).replace(/\s+/g, ' ');
    return (start > 0 ? '…' : '') + snippet + (end < text.length ? '…' : '');
}
