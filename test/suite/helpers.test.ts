/**
 * Unit tests for utility helpers.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import {
    relativeTime,
    isOlderThan,
    shortDate,
    truncate,
    escapeHtml,
    isDone,
    isActive,
    totalLoggedHours,
    compareSeverity,
    compareById,
} from '../../src/utils/helpers';
import { generateId, nowIso, todayIso } from '../../src/utils/idGenerator';
import { Issue } from '../../src/types';

describe('idGenerator', () => {
    test('generateId returns a valid UUID v4 string', () => {
        const id = generateId();
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        assert.match(id, UUID_RE, `Expected UUID v4, got ${id}`);
    });

    test('generateId produces unique values', () => {
        const ids = new Set(Array.from({ length: 1000 }, generateId));
        assert.strictEqual(ids.size, 1000, 'Expected all IDs to be unique');
    });

    test('nowIso returns a valid ISO 8601 string', () => {
        const iso = nowIso();
        assert.ok(!isNaN(new Date(iso).getTime()), `Not a valid date: ${iso}`);
    });

    test('todayIso returns YYYY-MM-DD format', () => {
        const today = todayIso();
        assert.match(today, /^\d{4}-\d{2}-\d{2}$/, `Expected YYYY-MM-DD, got ${today}`);
    });
});

describe('helpers — string utils', () => {
    test('truncate does not truncate short strings', () => {
        assert.strictEqual(truncate('hello', 10), 'hello');
    });

    test('truncate appends ellipsis on long strings', () => {
        const result = truncate('hello world', 7);
        assert.strictEqual(result.length, 7);
        assert.ok(result.endsWith('…'));
    });

    test('escapeHtml escapes HTML special characters', () => {
        const input = '<script>alert("XSS")&amp;</script>';
        const out = escapeHtml(input);
        assert.ok(!out.includes('<script>'));
        assert.ok(out.includes('&lt;script&gt;'));
        assert.ok(out.includes('&quot;'));
    });
});

describe('helpers — date utils', () => {
    test('isOlderThan returns false for a recent date', () => {
        const recent = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
        assert.strictEqual(isOlderThan(recent, 30), false);
    });

    test('isOlderThan returns true for an old date', () => {
        const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(); // 60 days ago
        assert.strictEqual(isOlderThan(old, 30), true);
    });

    test('relativeTime handles "just now"', () => {
        const label = relativeTime(nowIso());
        assert.strictEqual(label, 'just now');
    });

    test('relativeTime returns a non-empty string', () => {
        const past = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString();
        const label = relativeTime(past);
        assert.ok(label.length > 0);
        assert.ok(label.includes('day'));
    });

    test('shortDate returns a non-empty string', () => {
        const result = shortDate(nowIso());
        assert.ok(result.length > 0);
    });
});

describe('helpers — issue logic', () => {
    const makeIssue = (overrides: Partial<Issue>): Issue => ({
        id: generateId(),
        sequentialId: 1,
        title: 'Test issue',
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
        createdAt: nowIso(),
        updatedAt: nowIso(),
        resolvedAt: null,
        codeLinks: [],
        relations: [],
        comments: [],
        workspaceFolder: null,
        templateId: null,
        ...overrides,
    });

    test('isDone returns true for resolved status', () => {
        assert.strictEqual(isDone(makeIssue({ status: 'resolved' })), true);
    });

    test('isDone returns true for closed status', () => {
        assert.strictEqual(isDone(makeIssue({ status: 'closed' })), true);
    });

    test('isDone returns false for open status', () => {
        assert.strictEqual(isDone(makeIssue({ status: 'open' })), false);
    });

    test('isActive returns true for in-progress', () => {
        assert.strictEqual(isActive(makeIssue({ status: 'in-progress' })), true);
    });

    test('isActive returns false for resolved', () => {
        assert.strictEqual(isActive(makeIssue({ status: 'resolved' })), false);
    });

    test('totalLoggedHours sums all entries', () => {
        const issue = makeIssue({
            timeEntries: [
                { id: 'e1', date: '2024-01-01', hours: 1.5, description: '', author: 'a', createdAt: nowIso() },
                { id: 'e2', date: '2024-01-02', hours: 2.0, description: '', author: 'a', createdAt: nowIso() },
            ],
        });
        assert.strictEqual(totalLoggedHours(issue), 3.5);
    });

    test('totalLoggedHours returns 0 for no entries', () => {
        assert.strictEqual(totalLoggedHours(makeIssue({})), 0);
    });

    test('compareSeverity sorts critical before high', () => {
        const critical = makeIssue({ severity: 'critical' });
        const high = makeIssue({ severity: 'high' });
        assert.ok(compareSeverity(critical, high) < 0);
    });

    test('compareById sorts by sequential ID ascending', () => {
        const first = makeIssue({ sequentialId: 1 });
        const second = makeIssue({ sequentialId: 2 });
        assert.ok(compareById(first, second) < 0);
    });
});
