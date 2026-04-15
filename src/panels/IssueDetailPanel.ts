/**
 * IssueDetailPanel — WebviewPanel that shows full issue details and allows
 * inline editing via form submission.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import { Issue, IssueStatus } from '../types';
import { escapeHtml, generateNonce, relativeTime, totalLoggedHours } from '../utils/helpers';

const PANEL_TYPE = 'vetspresso-issues.issueDetail';

interface WebviewMsg {
  command: string;
  [key: string]: unknown;
}

export class IssueDetailPanel {
  private static panels = new Map<string, IssueDetailPanel>();
  private readonly panel: vscode.WebviewPanel;
  private issue: Issue;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    extensionUri: vscode.Uri,
    service: IssueService,
    issue: Issue
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    const existing = IssueDetailPanel.panels.get(issue.id);
    if (existing) {
      existing.panel.reveal(column);
      existing.update(issue);
      return;
    }

    const panel = new IssueDetailPanel(extensionUri, service, issue, column ?? vscode.ViewColumn.One);
    IssueDetailPanel.panels.set(issue.id, panel);
  }

  private constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly service: IssueService,
    initialIssue: Issue,
    column: vscode.ViewColumn
  ) {
    this.issue = initialIssue;

    this.panel = vscode.window.createWebviewPanel(
      PANEL_TYPE,
      `Issue #${initialIssue.sequentialId}`,
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    this.panel.webview.html = this.buildHtml();

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMsg) => this.handleMessage(msg),
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Keep the panel in sync with data changes
    this.service.onIssueChanged((event) => {
      if (event.issue.id === this.issue.id) {
        this.update(event.issue);
      }
    });
  }

  update(issue: Issue): void {
    this.issue = issue;
    this.panel.title = `Issue #${issue.sequentialId}`;
    this.panel.webview.html = this.buildHtml();
  }

  private async handleMessage(msg: WebviewMsg): Promise<void> {
    try {
      switch (msg.command) {
        case 'updateStatus':
          await this.service.updateIssue(this.issue.id, { status: msg.value as IssueStatus });
          break;
        case 'updateAssignee':
          await this.service.updateIssue(this.issue.id, { assignedTo: (msg.value as string) || null });
          break;
        case 'addComment':
          if (typeof msg.body === 'string' && msg.body.trim()) {
            await this.service.addComment(this.issue.id, msg.body.trim());
          }
          break;
        case 'logTime': {
          const hours = parseFloat(String(msg.hours));
          const desc = typeof msg.description === 'string' ? msg.description : '';
          if (!isNaN(hours) && hours > 0) {
            await this.service.logTime(this.issue.id, hours, desc, typeof msg.date === 'string' ? msg.date : undefined);
          }
          break;
        }
        case 'openEditor':
          await vscode.commands.executeCommand('vetspresso-issues.editIssue', this.issue);
          break;
        case 'copyId':
          await vscode.env.clipboard.writeText(`#${this.issue.sequentialId}`);
          break;
      }
    } catch (err) {
      void this.panel.webview.postMessage({ command: 'error', message: String(err) });
    }
  }

  private dispose(): void {
    IssueDetailPanel.panels.delete(this.issue.id);
    this.disposables.forEach((d) => { d.dispose(); });
    this.panel.dispose();
  }

  private buildHtml(): string {
    const nonce = generateNonce();
    const csp = `default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    const i = this.issue;
    const logged = totalLoggedHours(i);

    const statusOptions = (
      ['open', 'in-progress', 'in-review', 'resolved', 'closed', 'wontfix', 'duplicate'] as IssueStatus[]
    ).map((s) => `<option value="${s}"${i.status === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');

    const commentsHtml = i.comments.length
      ? i.comments.map((c) =>
        `<div class="comment">
            <span class="comment-author">${escapeHtml(c.author)}</span>
            <span class="comment-date">${relativeTime(c.createdAt)}</span>
            <div class="comment-body">${escapeHtml(c.body).replace(/\n/g, '<br>')}</div>
          </div>`
      ).join('')
      : '<p class="muted">No comments yet.</p>';

    const codeLinksHtml = i.codeLinks.length
      ? `<ul>${i.codeLinks.map((l) =>
        `<li>${escapeHtml(l.filePath)}:${l.startLine}–${l.endLine}${l.snippet ? ` — <code>${escapeHtml(l.snippet.slice(0, 80))}</code>` : ''}</li>`
      ).join('')}</ul>`
      : '<p class="muted">No linked code.</p>';

    const relationsHtml = i.relations.length
      ? `<ul>${i.relations.map((r) => `<li>${escapeHtml(r.type)}: <a href="#" onclick="postMsg('openIssue', '${escapeHtml(r.targetIssueId)}')">${escapeHtml(r.targetIssueId)}</a></li>`).join('')}</ul>`
      : '<p class="muted">No relations.</p>';

    const tagsHtml = i.tags.length
      ? i.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')
      : '<span class="muted">None</span>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Issue #${i.sequentialId}</title>
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
    h1 { font-size: 1.3em; margin: 0 0 4px; }
    h2 { font-size: 1em; text-transform: uppercase; letter-spacing: .05em; color: var(--vscode-descriptionForeground); margin: 20px 0 6px; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 8px 0 16px; font-size: .9em; }
    .meta-pair { display: flex; gap: 6px; align-items: center; }
    .meta-label { color: var(--vscode-descriptionForeground); white-space: nowrap; }
    .badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 10px;
      font-size: .8em;
      font-weight: 600;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .badge.critical { background: var(--vscode-errorForeground); color: #fff; }
    .badge.high { background: var(--vscode-editorWarning-foreground); color: #000; }
    .description {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 4px;
      padding: 10px 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .tag {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 8px;
      font-size: .8em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      margin-right: 4px;
    }
    .muted { color: var(--vscode-descriptionForeground); font-style: italic; }
    .comment { border-left: 2px solid var(--vscode-panel-border, #444); padding: 6px 12px; margin: 6px 0; }
    .comment-author { font-weight: 600; margin-right: 8px; }
    .comment-date { color: var(--vscode-descriptionForeground); font-size: .85em; }
    .comment-body { margin-top: 4px; white-space: pre-wrap; word-break: break-word; }
    input, select, textarea {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 3px;
      padding: 4px 8px;
      font-family: inherit;
      font-size: inherit;
    }
    textarea { width: 100%; min-height: 80px; resize: vertical; }
    .btn {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 3px;
      padding: 5px 14px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .btn-sm { padding: 2px 8px; font-size: .85em; }
    .btn-secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .form-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; margin-top: 8px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
    hr { border: none; border-top: 1px solid var(--vscode-panel-border, #333); margin: 20px 0; }
    code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; font-size: .9em; }
    .time-summary { background: var(--vscode-input-background); border-radius: 4px; padding: 8px 12px; margin-bottom: 8px; }
    .progress-bar-wrap { background: var(--vscode-input-border, #555); border-radius: 4px; height: 6px; width: 200px; overflow: hidden; display: inline-block; vertical-align: middle; }
    .progress-bar-fill { height: 100%; background: var(--vscode-progressBar-background); border-radius: 4px; }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="btn btn-sm btn-secondary" onclick="postMsg('openEditor')">✏ Edit</button>
    <button class="btn btn-sm btn-secondary" onclick="postMsg('copyId')">⎘ Copy #${i.sequentialId}</button>
  </div>

  <h1>#${i.sequentialId} ${escapeHtml(i.title)}</h1>

  <div class="meta-row">
    <div class="meta-pair">
      <span class="meta-label">Type:</span>
      <span class="badge">${escapeHtml(i.type)}</span>
    </div>
    <div class="meta-pair">
      <span class="meta-label">Status:</span>
      <select onchange="postMsg2('updateStatus', this.value)">${statusOptions}</select>
    </div>
    <div class="meta-pair">
      <span class="meta-label">Severity:</span>
      <span class="badge ${i.severity}">${escapeHtml(i.severity)}</span>
    </div>
    <div class="meta-pair">
      <span class="meta-label">Urgency:</span>
      <span>${escapeHtml(i.urgency)}</span>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-pair">
      <span class="meta-label">Reported by:</span>
      <span>${escapeHtml(i.reportedBy)}</span>
    </div>
    <div class="meta-pair">
      <span class="meta-label">Assigned to:</span>
      <input type="text" value="${escapeHtml(i.assignedTo ?? '')}" placeholder="unassigned"
        onblur="postMsg2('updateAssignee', this.value)" style="width:140px">
    </div>
    ${i.reportedInVersion ? `<div class="meta-pair"><span class="meta-label">Reported in:</span><span>${escapeHtml(i.reportedInVersion)}</span></div>` : ''}
    ${i.targetVersion ? `<div class="meta-pair"><span class="meta-label">Target version:</span><span>${escapeHtml(i.targetVersion)}</span></div>` : ''}
    ${i.fixedInVersion ? `<div class="meta-pair"><span class="meta-label">Fixed in:</span><span>${escapeHtml(i.fixedInVersion)}</span></div>` : ''}
    <div class="meta-pair">
      <span class="meta-label">Created:</span>
      <span>${relativeTime(i.createdAt)}</span>
    </div>
    <div class="meta-pair">
      <span class="meta-label">Updated:</span>
      <span>${relativeTime(i.updatedAt)}</span>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-pair">
      <span class="meta-label">Tags:</span>
      ${tagsHtml}
    </div>
  </div>

  <h2>Description</h2>
  <div class="description">${i.description ? escapeHtml(i.description) : '<em>No description.</em>'}</div>

  <h2>Time Tracking</h2>
  <div class="time-summary">
    Logged: <strong>${logged.toFixed(1)}h</strong>
    ${i.estimatedHours !== null ? ` / ${i.estimatedHours.toFixed(1)}h estimated
    <span class="progress-bar-wrap"><span class="progress-bar-fill" style="width:${Math.min(100, (logged / i.estimatedHours) * 100).toFixed(0)}%"></span></span>` : ''}
  </div>
  <div class="form-row">
    <input type="number" id="logHours" min="0.1" step="0.5" placeholder="Hours" style="width:90px">
    <input type="date" id="logDate" value="${new Date().toISOString().slice(0, 10)}" style="width:140px">
    <input type="text" id="logDesc" placeholder="Description" style="flex:1;min-width:120px">
    <button class="btn btn-sm" onclick="submitLogTime()">Log Time</button>
  </div>

  <h2>Code Links</h2>
  ${codeLinksHtml}

  <h2>Relations</h2>
  ${relationsHtml}

  <h2>Comments</h2>
  ${commentsHtml}
  <div style="margin-top:12px">
    <textarea id="commentBody" placeholder="Write a comment…"></textarea>
    <div class="form-row">
      <button class="btn btn-sm" onclick="submitComment()">Add Comment</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function postMsg(command, value) {
      vscode.postMessage({ command, value });
    }
    function postMsg2(command, value) {
      vscode.postMessage({ command, value });
    }
    function submitComment() {
      const body = document.getElementById('commentBody').value.trim();
      if (!body) return;
      vscode.postMessage({ command: 'addComment', body });
      document.getElementById('commentBody').value = '';
    }
    function submitLogTime() {
      const hours = document.getElementById('logHours').value;
      const date = document.getElementById('logDate').value;
      const description = document.getElementById('logDesc').value;
      vscode.postMessage({ command: 'logTime', hours, date, description });
      document.getElementById('logHours').value = '';
      document.getElementById('logDesc').value = '';
    }
    window.addEventListener('message', (event) => {
      if (event.data && event.data.command === 'error') {
        console.error('Extension error:', event.data.message);
      }
    });
  </script>
</body>
</html>`;
  }
}
