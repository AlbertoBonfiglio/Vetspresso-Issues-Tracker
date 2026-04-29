/**
 * IssueDecorationProvider — adds a gutter icon to lines linked to issues.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import {
    CONFIG_SECTION,
    CFG_DECORATIONS_ENABLED,
    DECORATION_DEBOUNCE_MS,
} from '../constants';
import { debounce } from '../utils/helpers';

/** Decorations are keyed by severity so we can colour the gutter icon. */
const decorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: new vscode.ThemeIcon('link').id as unknown as vscode.Uri,
    overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    before: {
        contentText: '🔗',
        margin: '0 4px 0 0',
        color: new vscode.ThemeColor('editorInfo.foreground'),
    },
});

/** Manages gutter decorations that highlight code lines linked to issues. */
export class IssueDecorationProvider {
    private readonly debouncedUpdate: (editor: vscode.TextEditor) => void;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(private readonly service: IssueService) {
        this.debouncedUpdate = debounce(
            (...args: unknown[]) => this.applyDecorations(args[0] as vscode.TextEditor),
            DECORATION_DEBOUNCE_MS
        ) as (editor: vscode.TextEditor) => void;

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) { this.debouncedUpdate(editor); }
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                const active = vscode.window.activeTextEditor;
                if (active && active.document === event.document) {
                    this.debouncedUpdate(active);
                }
            })
        );

        this.service.onIssueChanged(() => {
            const active = vscode.window.activeTextEditor;
            if (active) { this.debouncedUpdate(active); }
        });

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${CONFIG_SECTION}.${CFG_DECORATIONS_ENABLED}`)) {
                const active = vscode.window.activeTextEditor;
                if (active) { this.applyDecorations(active); }
            }
        });

        // Apply to the currently open editor on startup
        if (vscode.window.activeTextEditor) {
            this.applyDecorations(vscode.window.activeTextEditor);
        }
    }

    private applyDecorations(editor: vscode.TextEditor): void {
        const enabled = vscode.workspace
            .getConfiguration(CONFIG_SECTION)
            .get<boolean>(CFG_DECORATIONS_ENABLED, true);

        if (!enabled) {
            editor.setDecorations(decorationType, []);
            return;
        }

        const document = editor.document;
        const folderUri = vscode.workspace.getWorkspaceFolder(document.uri);
        const relPath = folderUri
            ? document.uri.fsPath.replace(folderUri.uri.fsPath + '/', '')
            : document.uri.fsPath;

        const issues = this.service.getIssuesForFile(relPath);
        if (issues.length === 0) {
            editor.setDecorations(decorationType, []);
            return;
        }

        const ranges: vscode.Range[] = [];
        for (const issue of issues) {
            for (const link of issue.codeLinks) {
                if (link.filePath !== relPath) { continue; }
                const startLine = Math.max(0, link.startLine - 1);
                const endLine = Math.max(startLine, link.endLine - 1);
                ranges.push(
                    new vscode.Range(
                        startLine, 0,
                        endLine, Number.MAX_SAFE_INTEGER
                    )
                );
            }
        }

        editor.setDecorations(decorationType, ranges);
    }

    dispose(): void {
        decorationType.dispose();
        this.disposables.forEach((d) => { d.dispose(); });
    }
}
