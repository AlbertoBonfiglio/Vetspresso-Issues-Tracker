/**
 * DashboardPanel — WebviewPanel that shows aggregate metrics and charts.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import { Issue } from '../types';
import { escapeHtml, generateNonce } from '../utils/helpers';
import { EXTENSION_DISPLAY_NAME } from '../constants';

const PANEL_TYPE = 'vetspresso-issues.dashboard';

export class DashboardPanel {
    private static instance: DashboardPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];

    static show(extensionUri: vscode.Uri, service: IssueService): void {
        if (DashboardPanel.instance) {
            DashboardPanel.instance.panel.reveal();
            DashboardPanel.instance.refresh();
            return;
        }
        DashboardPanel.instance = new DashboardPanel(extensionUri, service);
    }

    private constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly service: IssueService
    ) {
        this.panel = vscode.window.createWebviewPanel(
            PANEL_TYPE,
            `${EXTENSION_DISPLAY_NAME} — Dashboard`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
                retainContextWhenHidden: true,
            }
        );

        this.panel.webview.html = this.buildHtml();

        this.panel.webview.onDidReceiveMessage(
            (msg: { command: string; query?: string }) => this.handleMessage(msg),
            null,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.service.onIssueChanged(() => this.refresh());
        this.service.onMetaChanged(() => this.refresh());
    }

    refresh(): void {
        this.panel.webview.html = this.buildHtml();
    }

    private async handleMessage(msg: { command: string; query?: string }): Promise<void> {
        switch (msg.command) {
            case 'openIssue':
                await vscode.commands.executeCommand('vetspresso-issues.searchIssues');
                break;
            case 'createIssue':
                await vscode.commands.executeCommand('vetspresso-issues.createIssue');
                break;
            case 'exportIssues':
                await vscode.commands.executeCommand('vetspresso-issues.exportIssues');
                break;
            case 'generateChangelog':
                await vscode.commands.executeCommand('vetspresso-issues.generateChangelog');
                break;
        }
    }

    private dispose(): void {
        DashboardPanel.instance = undefined;
        this.disposables.forEach((d) => { d.dispose(); });
        this.panel.dispose();
    }

    private buildHtml(): string {
        const nonce = generateNonce();
        const csp = `default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;

        const allIssues = this.service.getIssues();
        const stats = computeStats(allIssues);
        const milestones = this.service.getMilestones();
        const sprints = this.service.getSprints();

        const statusRows = Object.entries(stats.byStatus)
            .map(([s, n]) => `<tr><td>${escapeHtml(s)}</td><td>${n}</td><td>${bar(n, stats.total)}</td></tr>`)
            .join('');

        const severityRows = Object.entries(stats.bySeverity)
            .map(([s, n]) => `<tr><td>${escapeHtml(s)}</td><td>${n}</td><td>${bar(n, stats.total)}</td></tr>`)
            .join('');

        const typeRows = Object.entries(stats.byType)
            .map(([t, n]) => `<tr><td>${escapeHtml(t)}</td><td>${n}</td><td>${bar(n, stats.total)}</td></tr>`)
            .join('');

        const staleRow = stats.stale > 0
            ? `<tr class="warn"><td>Stale issues</td><td>${stats.stale}</td><td>${bar(stats.stale, stats.total)}</td></tr>`
            : '';

        const milestoneTable = milestones.length
            ? `<table>${milestones.map((m) => {
                const msTotal = allIssues.filter((i) => i.milestoneId === m.id).length;
                const msOpen = allIssues.filter((i) => i.milestoneId === m.id && ['open', 'in-progress', 'in-review'].includes(i.status)).length;
                return `<tr><td>${escapeHtml(m.name)}</td><td>${msOpen} open / ${msTotal} total</td><td>${bar(msTotal - msOpen, msTotal)}</td></tr>`;
            }).join('')}</table>`
            : '<p class="muted">No milestones defined.</p>';

        const sprintTable = sprints.length
            ? `<table>${sprints.filter((s) => s.status === 'active').map((s) => {
                const spTotal = allIssues.filter((i) => i.sprintId === s.id).length;
                const spOpen = allIssues.filter((i) => i.sprintId === s.id && ['open', 'in-progress', 'in-review'].includes(i.status)).length;
                return `<tr><td>${escapeHtml(s.name)}</td><td>${spOpen} open / ${spTotal} total</td><td>${bar(spTotal - spOpen, spTotal)}</td></tr>`;
            }).join('')}</table>`
            : '<p class="muted">No active sprints.</p>';

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Dashboard</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      padding: 16px 20px;
      margin: 0;
    }
    h1 { font-size: 1.4em; margin: 0 0 16px; }
    h2 { font-size: 1em; text-transform: uppercase; letter-spacing: .06em; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border, #333); padding-bottom: 4px; margin: 24px 0 10px; }
    .kpi-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
    .kpi {
      background: var(--vscode-input-background);
      border-radius: 6px;
      padding: 14px 20px;
      min-width: 100px;
      text-align: center;
    }
    .kpi-value { font-size: 2em; font-weight: 700; line-height: 1; }
    .kpi-label { font-size: .8em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
    .kpi.critical .kpi-value { color: var(--vscode-errorForeground); }
    table { border-collapse: collapse; width: 100%; }
    td { padding: 4px 8px; }
    tr:nth-child(even) { background: var(--vscode-list-hoverBackground); }
    .bar-wrap { background: var(--vscode-input-border, #444); border-radius: 3px; height: 8px; min-width: 80px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--vscode-progressBar-background); border-radius: 3px; }
    .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
    .warn td { color: var(--vscode-editorWarning-foreground); }
    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 3px;
      padding: 5px 14px; cursor: pointer;
      font-family: inherit; font-size: inherit;
      margin-right: 8px; margin-bottom: 8px;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <h1>📊 ${EXTENSION_DISPLAY_NAME} — Dashboard</h1>

  <div class="kpi-row">
    <div class="kpi">
      <div class="kpi-value">${stats.total}</div>
      <div class="kpi-label">Total Issues</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${stats.open}</div>
      <div class="kpi-label">Open</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${stats.inProgress}</div>
      <div class="kpi-label">In Progress</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${stats.resolved}</div>
      <div class="kpi-label">Resolved</div>
    </div>
    <div class="kpi critical">
      <div class="kpi-value">${stats.critical}</div>
      <div class="kpi-label">Critical</div>
    </div>
    <div class="kpi">
      <div class="kpi-value">${stats.stale}</div>
      <div class="kpi-label">Stale</div>
    </div>
  </div>

  <div>
    <button class="btn" onclick="postMsg('createIssue')">+ New Issue</button>
    <button class="btn" onclick="postMsg('exportIssues')">Export</button>
    <button class="btn" onclick="postMsg('generateChangelog')">Changelog</button>
  </div>

  <h2>By Status</h2>
  <table>${statusRows}</table>

  <h2>By Severity</h2>
  <table>${severityRows}${staleRow}</table>

  <h2>By Type</h2>
  <table>${typeRows}</table>

  <h2>Milestones</h2>
  ${milestoneTable}

  <h2>Active Sprints</h2>
  ${sprintTable}

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function postMsg(cmd) { vscode.postMessage({ command: cmd }); }
  </script>
</body>
</html>`;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Stats {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    critical: number;
    stale: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
}

function computeStats(issues: Issue[]): Stats {
    const byStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};

    let open = 0, inProgress = 0, resolved = 0, critical = 0, stale = 0;

    for (const i of issues) {
        byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
        bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
        byType[i.type] = (byType[i.type] ?? 0) + 1;

        if (i.status === 'open') { open++; }
        if (i.status === 'in-progress') { inProgress++; }
        if (i.status === 'resolved' || i.status === 'closed') { resolved++; }
        if (i.severity === 'critical') { critical++; }
        if (i.isStale) { stale++; }
    }

    return { total: issues.length, open, inProgress, resolved, critical, stale, byStatus, bySeverity, byType };
}

function bar(value: number, total: number): string {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return `<div class="bar-wrap"><div class="bar-fill" style="width:${pct.toFixed(0)}%"></div></div>`;
}
