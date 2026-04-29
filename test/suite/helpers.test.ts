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
    debounce,
    iconForType,
    iconForStatus,
    colorForSeverity,
    labelForGroupBy,
    statusLabel,
    generateNonce,
    compareUrgency,
    compareByDate,
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

describe('helpers — debounce', () => {
    test('debounce delays execution', async () => {
        let calls = 0;
        const debounced = debounce(() => { calls++; }, 20);
        debounced();
        debounced();
        debounced();
        assert.strictEqual(calls, 0);
        await new Promise((r) => setTimeout(r, 40));
        assert.strictEqual(calls, 1);
    });

    test('debounce resets timer on each call', async () => {
        let calls = 0;
        const debounced = debounce(() => { calls++; }, 30);
        debounced();
        await new Promise((r) => setTimeout(r, 10));
        debounced(); // resets timer
        await new Promise((r) => setTimeout(r, 10));
        assert.strictEqual(calls, 0); // still not fired
        await new Promise((r) => setTimeout(r, 40));
        assert.strictEqual(calls, 1);
    });
});

describe('helpers — relativeTime all branches', () => {
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

    test('minutes singular', () => {
        assert.ok(relativeTime(ago(65_000)).includes('minute'));
        assert.ok(!relativeTime(ago(65_000)).includes('minutes'));
    });

    test('minutes plural', () => {
        assert.ok(relativeTime(ago(3 * 60_000)).includes('minutes'));
    });

    test('hours singular', () => {
        assert.ok(relativeTime(ago(65 * 60_000)).includes('hour'));
        assert.ok(!relativeTime(ago(65 * 60_000)).includes('hours'));
    });

    test('hours plural', () => {
        assert.ok(relativeTime(ago(3 * 3_600_000)).includes('hours'));
    });

    test('weeks', () => {
        assert.ok(relativeTime(ago(8 * 24 * 3_600_000)).includes('week'));
    });

    test('months', () => {
        assert.ok(relativeTime(ago(35 * 24 * 3_600_000)).includes('month'));
    });

    test('years', () => {
        assert.ok(relativeTime(ago(400 * 24 * 3_600_000)).includes('year'));
    });

    test('future date uses "in X" prefix', () => {
        const label = relativeTime(inFuture(3 * 3_600_000));
        assert.ok(label.startsWith('in '), `Expected "in ...", got "${label}"`);
    });
});

describe('helpers — icon / colour / label helpers', () => {
    const issueTypes = ['bug', 'enhancement', 'feature', 'task', 'question', 'documentation', 'other'] as const;
    const statuses = ['open', 'in-progress', 'in-review', 'on-hold', 'resolved', 'closed', 'wontfix', 'duplicate'] as const;
    const severities = ['critical', 'high', 'medium', 'low', 'trivial'] as const;
    const groupBys = ['type', 'status', 'severity', 'milestone', 'sprint', 'assignee', 'none'] as const;

    test('iconForType returns a non-empty string for every issue type', () => {
        for (const t of issueTypes) {
            const icon = iconForType(t);
            assert.ok(icon.length > 0, `iconForType("${t}") returned empty`);
        }
    });

    test('iconForStatus returns a non-empty string for every status', () => {
        for (const s of statuses) {
            const icon = iconForStatus(s);
            assert.ok(icon.length > 0, `iconForStatus("${s}") returned empty`);
        }
    });

    test('colorForSeverity returns a non-empty string for every severity', () => {
        for (const s of severities) {
            const color = colorForSeverity(s);
            assert.ok(color.length > 0, `colorForSeverity("${s}") returned empty`);
        }
    });

    test('labelForGroupBy returns a non-empty string for every GroupBy value', () => {
        for (const g of groupBys) {
            const label = labelForGroupBy(g);
            assert.ok(label.length > 0, `labelForGroupBy("${g}") returned empty`);
        }
    });

    test('statusLabel returns a non-empty string for every status', () => {
        for (const s of statuses) {
            const label = statusLabel(s);
            assert.ok(label.length > 0, `statusLabel("${s}") returned empty`);
        }
    });

    test('statusLabel specific values', () => {
        assert.strictEqual(statusLabel('open'), 'Open');
        assert.strictEqual(statusLabel('in-progress'), 'In Progress');
        assert.strictEqual(statusLabel('wontfix'), "Won't Fix");
    });
});

describe('helpers — isDone edge cases', () => {
    const makeIssue = (status: import('../../src/types').IssueStatus): import('../../src/types').Issue => ({
        id: 'x', sequentialId: 1, title: 't', description: '', type: 'bug',
        status, severity: 'medium', urgency: 'normal',
        reportedInVersion: null, fixedInVersion: null, targetVersion: null,
        milestoneId: null, sprintId: null, tags: [], estimatedHours: null,
        timeEntries: [], reportedBy: 'a', assignedTo: null, createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), resolvedAt: null, codeLinks: [], relations: [],
        comments: [], workspaceFolder: null, templateId: null,
    });

    test('isDone returns true for wontfix', () => {
        assert.strictEqual(isDone(makeIssue('wontfix')), true);
    });

    test('isDone returns true for duplicate', () => {
        assert.strictEqual(isDone(makeIssue('duplicate')), true);
    });

    test('isActive returns true for in-review', () => {
        assert.strictEqual(isActive(makeIssue('in-review')), true);
    });

    test('isActive returns false for wontfix', () => {
        assert.strictEqual(isActive(makeIssue('wontfix')), false);
    });
});

describe('helpers — sorting (compareUrgency, compareByDate, compareSeverity full)', () => {
    const makeIssue = (overrides: Partial<import('../../src/types').Issue>): import('../../src/types').Issue => ({
        id: 'x', sequentialId: 1, title: 't', description: '', type: 'bug',
        status: 'open', severity: 'medium', urgency: 'normal',
        reportedInVersion: null, fixedInVersion: null, targetVersion: null,
        milestoneId: null, sprintId: null, tags: [], estimatedHours: null,
        timeEntries: [], reportedBy: 'a', assignedTo: null, createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), resolvedAt: null, codeLinks: [], relations: [],
        comments: [], workspaceFolder: null, templateId: null,
        ...overrides,
    });

    test('compareUrgency sorts immediate before normal', () => {
        const a = makeIssue({ urgency: 'immediate' });
        const b = makeIssue({ urgency: 'normal' });
        assert.ok(compareUrgency(a, b) < 0);
    });

    test('compareUrgency equal urgency returns 0', () => {
        const a = makeIssue({ urgency: 'high' });
        const b = makeIssue({ urgency: 'high' });
        assert.strictEqual(compareUrgency(a, b), 0);
    });

    test('compareByDate sorts newest first', () => {
        const older = makeIssue({ createdAt: new Date(Date.now() - 1_000_000).toISOString() });
        const newer = makeIssue({ createdAt: new Date().toISOString() });
        assert.ok(compareByDate(newer, older) < 0, 'Newer should come first (negative result)');
    });

    test('compareSeverity equal severity returns 0', () => {
        const a = makeIssue({ severity: 'medium' });
        const b = makeIssue({ severity: 'medium' });
        assert.strictEqual(compareSeverity(a, b), 0);
    });

    test('compareSeverity low after high', () => {
        const h = makeIssue({ severity: 'high' });
        const l = makeIssue({ severity: 'low' });
        assert.ok(compareSeverity(h, l) < 0);
    });
});

describe('helpers — generateNonce', () => {
    test('generateNonce returns a non-empty base64 string', () => {
        const nonce = generateNonce();
        assert.ok(nonce.length > 0);
        assert.match(nonce, /^[A-Za-z0-9+/=]+$/);
    });

    test('generateNonce returns unique values', () => {
        const nonces = new Set(Array.from({ length: 100 }, generateNonce));
        assert.strictEqual(nonces.size, 100);
    });
});
