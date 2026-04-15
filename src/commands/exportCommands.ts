/**
 * Export / Import / Changelog commands.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { ExportService } from '../services/ExportService';
import { ChangelogService } from '../services/ChangelogService';
import { ExportFormat } from '../types';
import * as logger from '../utils/logger';

export async function cmdExportIssues(
    exportService: ExportService
): Promise<void> {
    const formatChoice = await vscode.window.showQuickPick(
        [
            { label: 'json', description: 'Full JSON export (re-importable)' },
            { label: 'csv', description: 'CSV spreadsheet' },
            { label: 'markdown', description: 'Markdown table + detail report' },
            { label: 'github-json', description: 'GitHub Issues API-compatible JSON' },
        ] as const,
        { title: 'Export Issues', placeHolder: 'Select export format' }
    );
    if (!formatChoice) { return; }

    try {
        const uri = await exportService.exportToFile(formatChoice.label as ExportFormat);
        if (uri) {
            const action = await vscode.window.showInformationMessage(
                `Issues exported to ${uri.fsPath}`,
                'Open File'
            );
            if (action === 'Open File') {
                await vscode.window.showTextDocument(uri);
            }
        }
    } catch (err) {
        logger.showError('Export failed', err);
    }
}

export async function cmdImportIssues(exportService: ExportService): Promise<void> {
    try {
        const count = await exportService.importFromFile();
        if (count > 0) {
            void vscode.window.showInformationMessage(`${count} issue(s) imported successfully.`);
        } else {
            void vscode.window.showInformationMessage('No new issues imported (file was empty or all issues already exist).');
        }
    } catch (err) {
        logger.showError('Import failed', err);
    }
}

export async function cmdGenerateChangelog(
    changelogService: ChangelogService
): Promise<void> {
    const formatChoice = await vscode.window.showQuickPick(
        [
            { label: 'markdown', description: 'CHANGELOG.md (GitHub Flavored Markdown)' },
            { label: 'plain', description: 'Plain text release notes' },
        ],
        { title: 'Generate Changelog', placeHolder: 'Select format' }
    );
    if (!formatChoice) { return; }

    const versionFilter = await vscode.window.showInputBox({
        title: 'Generate Changelog — Version Filter (optional)',
        prompt: 'Generate changelog for a specific version tag, or leave blank for all.',
        placeHolder: 'e.g. v1.4.0',
    });

    const content =
        formatChoice.label === 'markdown'
            ? changelogService.renderMarkdown({ version: versionFilter || undefined })
            : changelogService.renderPlainText({ version: versionFilter || undefined });

    // Open in a new untitled document
    const doc = await vscode.workspace.openTextDocument({
        language: formatChoice.label === 'markdown' ? 'markdown' : 'plaintext',
        content,
    });
    await vscode.window.showTextDocument(doc);

    const saveAction = await vscode.window.showInformationMessage(
        'Changelog generated. Save to file?',
        'Save as CHANGELOG.md',
        'Keep Unsaved'
    );

    if (saveAction === 'Save as CHANGELOG.md') {
        const folders = vscode.workspace.workspaceFolders;
        if (folders && folders.length > 0) {
            const uri = vscode.Uri.joinPath(folders[0].uri, 'CHANGELOG.md');
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            await vscode.window.showTextDocument(uri);
            void vscode.window.showInformationMessage('Saved to CHANGELOG.md in workspace root.');
        } else {
            await vscode.commands.executeCommand('workbench.action.files.save');
        }
    }
}
