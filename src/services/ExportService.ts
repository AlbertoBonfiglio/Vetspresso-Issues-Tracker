/**
 * ExportService — exports issues in various formats and can import
 * from a JSON dump.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueDatabase } from '../database/IssueDatabase';
import { Issue, ExportFormat } from '../types';
import * as logger from '../utils/logger';

/** Header row for the CSV export. */
const CSV_HEADERS = [
    'id', 'sequentialId', 'title', 'type', 'status', 'severity', 'urgency',
    'reportedBy', 'assignedTo', 'reportedInVersion', 'fixedInVersion',
    'targetVersion', 'milestoneId', 'sprintId', 'tags', 'estimatedHours',
    'loggedHours', 'createdAt', 'updatedAt', 'resolvedAt', 'description',
];

export class ExportService {
    constructor(private readonly db: IssueDatabase) { }

    // -------------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------------

    /**
     * Exports all issues (or a given list) to the target format.
     *
     * @returns The rendered string content.
     */
    export(format: ExportFormat, issues?: Issue[]): string {
        const data = issues ?? this.db.getAllIssues();
        switch (format) {
            case 'json': return this.toJson(data);
            case 'csv': return this.toCsv(data);
            case 'markdown': return this.toMarkdown(data);
            case 'github-json': return this.toGitHubJson(data);
        }
    }

    /**
     * Prompts the user to choose a save location and writes the export file.
     */
    async exportToFile(format: ExportFormat, issues?: Issue[]): Promise<vscode.Uri | undefined> {
        const ext = format === 'csv' ? 'csv' : format === 'markdown' ? 'md' : 'json';
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`issues-export.${ext}`),
            filters: {
                'Export file': [ext],
                'All files': ['*'],
            },
            saveLabel: 'Export Issues',
        });
        if (!uri) {
            return undefined;
        }
        const content = this.export(format, issues);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        logger.info(`Issues exported to ${uri.fsPath} (format: ${format})`);
        return uri;
    }

    // -------------------------------------------------------------------------
    // Import
    // -------------------------------------------------------------------------

    /**
     * Imports issues from our own JSON export format.
     * Existing issues with the same UUID are skipped (no overwrite).
     *
     * @returns Number of issues imported.
     */
    async importFromJson(jsonContent: string): Promise<number> {
        let parsed: unknown;
        try {
            parsed = JSON.parse(jsonContent);
        } catch (err) {
            throw new Error(`Invalid JSON: ${String(err)}`);
        }

        if (!Array.isArray(parsed)) {
            throw new Error('Expected a JSON array of issues.');
        }

        let imported = 0;
        for (const raw of parsed) {
            if (!isIssueShape(raw)) {
                logger.warn('Skipping malformed issue entry during import.');
                continue;
            }
            const existing = this.db.getIssue(raw.id);
            if (existing) {
                logger.debug(`Skipping duplicate issue ${raw.id} during import.`);
                continue;
            }
            // Write directly via storage to preserve IDs and timestamps
            await this.db.getStorage().writeIssue(raw as Issue);
            imported++;
        }

        if (imported > 0) {
            await this.db.reload();
        }
        logger.info(`Import complete: ${imported} issues imported.`);
        return imported;
    }

    /**
     * Opens a file picker and imports from the selected JSON file.
     */
    async importFromFile(): Promise<number> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON files': ['json'], 'All files': ['*'] },
            openLabel: 'Import Issues',
        });
        if (!uris || uris.length === 0) {
            return 0;
        }
        const bytes = await vscode.workspace.fs.readFile(uris[0]);
        const content = Buffer.from(bytes).toString('utf8');
        return this.importFromJson(content);
    }

    // -------------------------------------------------------------------------
    // Format renderers
    // -------------------------------------------------------------------------

    private toJson(issues: Issue[]): string {
        return JSON.stringify(issues, null, 2);
    }

    private toCsv(issues: Issue[]): string {
        const rows: string[] = [CSV_HEADERS.map(csvCell).join(',')];
        for (const issue of issues) {
            const totalLogged = issue.timeEntries.reduce((s, e) => s + e.hours, 0);
            rows.push([
                issue.id,
                String(issue.sequentialId),
                issue.title,
                issue.type,
                issue.status,
                issue.severity,
                issue.urgency,
                issue.reportedBy,
                issue.assignedTo ?? '',
                issue.reportedInVersion ?? '',
                issue.fixedInVersion ?? '',
                issue.targetVersion ?? '',
                issue.milestoneId ?? '',
                issue.sprintId ?? '',
                issue.tags.join(';'),
                String(issue.estimatedHours ?? ''),
                String(totalLogged),
                issue.createdAt,
                issue.updatedAt,
                issue.resolvedAt ?? '',
                issue.description,
            ].map(csvCell).join(','));
        }
        return rows.join('\r\n');
    }

    private toMarkdown(issues: Issue[]): string {
        const sortedIssues = [...issues].sort((a, b) => a.sequentialId - b.sequentialId);

        const lines: string[] = [
            '# Issues Export',
            '',
            `> Exported ${new Date().toISOString()}  `,
            `> Total: ${issues.length} issues`,
            '',
            '| # | Title | Type | Status | Severity | Assignee | Version |',
            '|---|-------|------|--------|----------|----------|---------|',
        ];

        for (const i of sortedIssues) {
            lines.push(
                `| #${i.sequentialId} | ${escapeMarkdown(i.title)} | ${i.type} | ${i.status} | ${i.severity} | ${i.assignedTo ?? '—'} | ${i.targetVersion ?? '—'} |`
            );
        }

        lines.push('', '---', '');

        for (const issue of sortedIssues) {
            lines.push(
                `## #${issue.sequentialId} — ${issue.title}`,
                '',
                `**Type:** ${issue.type} | **Status:** ${issue.status} | **Severity:** ${issue.severity} | **Urgency:** ${issue.urgency}`,
                '',
                issue.description || '_No description._',
                '',
                '---',
                ''
            );
        }

        return lines.join('\n');
    }

    /** GitHub Issues-compatible JSON (fields mapped to the GH Issues API shape). */
    private toGitHubJson(issues: Issue[]): string {
        const mapped = issues.map((i) => ({
            title: `#${i.sequentialId} ${i.title}`,
            body: i.description,
            state: ['resolved', 'closed', 'wontfix', 'duplicate'].includes(i.status)
                ? 'closed'
                : 'open',
            labels: [i.type, i.severity, ...i.tags],
            assignee: i.assignedTo ?? null,
            milestone: i.milestoneId ?? null,
        }));
        return JSON.stringify(mapped, null, 2);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function csvCell(value: string): string {
    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function escapeMarkdown(str: string): string {
    return str.replace(/[|[\]]/g, '\\$&');
}

function isIssueShape(value: unknown): value is { id: string; title: string; sequentialId: number } {
    if (typeof value !== 'object' || value === null) { return false; }
    const obj = value as Record<string, unknown>;
    return (
        typeof obj['id'] === 'string' &&
        typeof obj['title'] === 'string' &&
        typeof obj['sequentialId'] === 'number'
    );
}
