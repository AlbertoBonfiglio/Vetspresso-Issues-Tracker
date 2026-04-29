/**
 * IssueCodeLensProvider — renders "🔗 Issue #N: title" CodeLens items above
 * lines linked to issues.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import type { Issue } from '../types';
import { CONFIG_SECTION, CFG_CODE_LENS_ENABLED } from '../constants';

/** CodeLensProvider that renders issue-link annotations above linked code lines. */
export class IssueCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    constructor(private readonly service: IssueService) {
        this.service.onIssueChanged(() => this._onDidChangeCodeLenses.fire());
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${CONFIG_SECTION}.${CFG_CODE_LENS_ENABLED}`)) {
                this._onDidChangeCodeLenses.fire();
            }
        });
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.CodeLens[] {
        const enabled = vscode.workspace
            .getConfiguration(CONFIG_SECTION)
            .get<boolean>(CFG_CODE_LENS_ENABLED, true);

        if (!enabled) {
            return [];
        }

        const folderUri = vscode.workspace.getWorkspaceFolder(document.uri);
        const relPath = folderUri
            ? document.uri.fsPath.replace(folderUri.uri.fsPath + '/', '')
            : document.uri.fsPath;

        const issues = this.service.getIssuesForFile(relPath);
        if (issues.length === 0) {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];

        // Build map: startLine → issues linked to that line range
        const lineMap = new Map<number, Issue[]>();
        for (const issue of issues) {
            for (const link of issue.codeLinks) {
                if (link.filePath !== relPath) { continue; }
                const line = link.startLine - 1; // VS Code uses 0-based lines
                const existing = lineMap.get(line) ?? [];
                existing.push(issue);
                lineMap.set(line, existing);
            }
        }

        for (const [line, linkedIssues] of lineMap) {
            const range = new vscode.Range(line, 0, line, 0);
            for (const issue of linkedIssues) {
                lenses.push(
                    new vscode.CodeLens(range, {
                        title: `🔗 Issue #${issue.sequentialId}: ${issue.title}`,
                        command: 'vetspresso-issues.viewIssue',
                        arguments: [issue],
                    })
                );
            }
        }

        return lenses;
    }
}
