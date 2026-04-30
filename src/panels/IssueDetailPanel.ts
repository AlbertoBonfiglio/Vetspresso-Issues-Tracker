/**
 * IssueDetailPanel — WebviewPanel that shows full issue details and allows
 * inline editing via form submission.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IssueService } from '../services/IssueService';
import type { Issue, IssueStatus } from '../types';
import { escapeHtml, generateNonce, relativeTime, totalLoggedHours } from '../utils/helpers';

const PANEL_TYPE = 'vetspresso-issues.issueDetail';

interface WebviewMsg {
  command: string;
  [key: string]: unknown;
}

/** WebviewPanel showing full issue details with inline editing. */
export class IssueDetailPanel {
  private static panels = new Map<string, IssueDetailPanel>();
  private readonly panel: vscode.WebviewPanel;
  private issue: Issue;
  private readonly disposables: vscode.Disposable[] = [];

  // Track pending updates to avoid race conditions with onIssueChanged
  private pendingUpdate: Promise<void> | null = null;
  private lastUpdateTime = 0;
  private readonly UPDATE_WINDOW_MS = 500; // Window to consider an update "ours"

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
    extensionUri: vscode.Uri,
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

    // Keep the panel in sync with external data changes.
    // Skip full HTML rebuild when this panel itself triggered the update —
    // that would wipe any unsaved field values the user is editing.
    this.service.onIssueChanged((event) => {
      if (event.issue.id === this.issue.id) {
        this.issue = event.issue;
        // Check if this change was triggered by our own pending update
        const isOurUpdate = this.pendingUpdate !== null &&
          (Date.now() - this.lastUpdateTime) < this.UPDATE_WINDOW_MS;
        if (!isOurUpdate) {
          this.panel.title = `Issue #${event.issue.sequentialId}`;
          // Notify webview of external change - let it decide whether to refresh
          void this.panel.webview.postMessage({ command: 'externalChange', issue: event.issue });
        }
      }
    });
  }

  update(issue: Issue): void {
    this.issue = issue;
    this.panel.title = `Issue #${issue.sequentialId}`;
    // Send patch update instead of full HTML rebuild to preserve form state
    void this.panel.webview.postMessage({ command: 'patchIssue', issue });
  }

  private async handleMessage(msg: WebviewMsg): Promise<void> {
    // Track this update to prevent race condition with onIssueChanged
    const updatePromise = this.executeUpdate(msg);
    this.pendingUpdate = updatePromise;
    this.lastUpdateTime = Date.now();
    try {
      await updatePromise;
    } finally {
      // Clear pending update after a short delay to allow onIssueChanged to fire
      setTimeout(() => {
        if (this.pendingUpdate === updatePromise) {
          this.pendingUpdate = null;
        }
      }, this.UPDATE_WINDOW_MS);
    }
  }

  private async executeUpdate(msg: WebviewMsg): Promise<void> {
    try {
      switch (msg.command) {
        case 'updateStatus':
          await this.service.updateIssue(this.issue.id, { status: msg.value as IssueStatus });
          break;
        case 'updateAssignee':
          await this.service.updateIssue(this.issue.id, { assignedTo: (msg.value as string) || null });
          if (msg.value) { await this.service.addKnownPerson(msg.value as string); }
          break;
        case 'updateReportedBy':
          await this.service.updateIssue(this.issue.id, { reportedBy: (msg.value as string) || this.issue.reportedBy });
          if (msg.value) { await this.service.addKnownPerson(msg.value as string); }
          break;
        case 'saveKnownPerson':
          if (msg.value) { await this.service.addKnownPerson(msg.value as string); }
          break;
        case 'saveIssueFields': {
          const reportedBy = (msg.reportedBy as string).trim();
          const assignedTo = (msg.assignedTo as string).trim();
          await this.service.updateIssue(this.issue.id, {
            reportedBy: reportedBy || this.issue.reportedBy,
            assignedTo: assignedTo || null,
            reportedInVersion: (msg.reportedInVersion as string).trim() || null,
            targetVersion: (msg.targetVersion as string).trim() || null,
            fixedInVersion: (msg.fixedInVersion as string).trim() || null,
          });
          if (reportedBy) { await this.service.addKnownPerson(reportedBy); }
          if (assignedTo) { await this.service.addKnownPerson(assignedTo); }
          break;
        }
        case 'updateReportedInVersion':
          await this.service.updateIssue(this.issue.id, { reportedInVersion: (msg.value as string).trim() || null });
          break;
        case 'updateTargetVersion':
          await this.service.updateIssue(this.issue.id, { targetVersion: (msg.value as string).trim() || null });
          break;
        case 'updateFixedInVersion':
          await this.service.updateIssue(this.issue.id, { fixedInVersion: (msg.value as string).trim() || null });
          break;
        case 'updateSprint':
          await this.service.updateIssue(this.issue.id, { sprintId: (msg.value as string) || null });
          break;
        case 'updateMilestone':
          await this.service.updateIssue(this.issue.id, { milestoneId: (msg.value as string) || null });
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
        case 'updateDescription':
          await this.service.updateIssue(this.issue.id, { description: (msg.value as string) ?? '' });
          break;
        case 'addTag': {
          const tag = (msg.value as string).trim();
          if (tag && !this.issue.tags.includes(tag)) {
            await this.service.updateIssue(this.issue.id, { tags: [...this.issue.tags, tag] });
            await this.service.addKnownTag(tag);
          }
          break;
        }
        case 'removeTag': {
          const tag = msg.value as string;
          await this.service.updateIssue(this.issue.id, { tags: this.issue.tags.filter((t) => t !== tag) });
          break;
        }
        case 'saveKnownTag':
          if (msg.value) { await this.service.addKnownTag(msg.value as string); }
          break;
        case 'openEditor':
          await vscode.commands.executeCommand('vetspresso-issues.editIssue', this.issue);
          break;
        case 'copyId':
          await vscode.env.clipboard.writeText(`#${this.issue.sequentialId}`);
          break;
      }
    } catch (err) {
      void this.panel.webview.postMessage({ command: 'error', message: String(err) });
      // Re-sync issue state after error
      void this.panel.webview.postMessage({ command: 'patchIssue', issue: this.issue });
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

    // Helper to safely embed JSON in script tag context
    const safeJson = (obj: unknown): string =>
      JSON.stringify(obj).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c');

    const knownTagsJson = safeJson(this.service.getKnownTags());
    const knownPersonsJson = safeJson(this.service.getKnownPersons());
    const currentTagsJson = safeJson(i.tags);
    const currentIssueJson = safeJson(i);

    const statusOptions = (
      ['open', 'in-progress', 'in-review', 'on-hold', 'resolved', 'closed', 'wontfix', 'duplicate'] as IssueStatus[]
    ).map((s) => `<option value="${s}"${i.status === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');

    const sprints = this.service.getSprints();
    const sprintOptions = [
      `<option value=""${!i.sprintId ? ' selected' : ''}>— None —</option>`,
      ...sprints.map((s) => `<option value="${escapeHtml(s.id)}"${i.sprintId === s.id ? ' selected' : ''}>${escapeHtml(s.name)}</option>`),
    ].join('');

    const milestones = this.service.getMilestones();
    const milestoneOptions = [
      `<option value=""${!i.milestoneId ? ' selected' : ''}>— None —</option>`,
      ...milestones.map((m) => `<option value="${escapeHtml(m.id)}"${i.milestoneId === m.id ? ' selected' : ''}>${escapeHtml(m.name)}</option>`),
    ].join('');

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
    body.has-conflict-banner { padding-top: 50px; }
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
    #toast {
      position: fixed; bottom: 16px; right: 16px;
      background: var(--vscode-notificationToast-background, var(--vscode-editor-background));
      color: var(--vscode-notificationToast-foreground, var(--vscode-foreground));
      border: 1px solid var(--vscode-panel-border, #555);
      border-radius: 4px; padding: 6px 14px; font-size: .85em;
      opacity: 0; transition: opacity .2s; pointer-events: none;
    }
    #toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div id="toast"></div>
  <div id="conflictBanner" style="display:none;position:fixed;top:0;left:0;right:0;background:var(--vscode-editorWarning-background,#5a4a20);color:var(--vscode-editorWarning-foreground,#f0f0f0);padding:8px 16px;font-size:.9em;z-index:100;align-items:center;justify-content:space-between">
    <span>⚠ You have unsaved changes</span>
    <button id="btnDiscardChanges" class="btn btn-sm" style="background:var(--vscode-button-secondaryBackground)">Discard Changes</button>
  </div>
  <div class="toolbar">
    <button id="btnEdit" class="btn btn-sm btn-secondary">✏ Edit</button>
    <button id="btnCopyId" class="btn btn-sm btn-secondary">⎘ Copy #${i.sequentialId}</button>
  </div>

  <h1>#${i.sequentialId} ${escapeHtml(i.title)}</h1>

  <div class="meta-row">
    <div class="meta-pair">
      <span class="meta-label">Type:</span>
      <span class="badge">${escapeHtml(i.type)}</span>
    </div>
    <div class="meta-pair">
      <span class="meta-label">Status:</span>
      <select id="statusSelect">${statusOptions}</select>
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
      <input id="reportedByInput" type="text" list="knownPersonsList" value="${escapeHtml(i.reportedBy)}" style="width:140px">
    </div>
    <div class="meta-pair">
      <span class="meta-label">Assigned to:</span>
      <input id="assigneeInput" type="text" list="knownPersonsList" value="${escapeHtml(i.assignedTo ?? '')}" placeholder="unassigned" style="width:140px">
    </div>
    <datalist id="knownPersonsList"></datalist>
    <div class="meta-pair"><span class="meta-label">Reported in:</span><input id="reportedInInput" type="text" value="${escapeHtml(i.reportedInVersion ?? '')}" placeholder="e.g. v1.0" style="width:100px"></div>
    <div class="meta-pair"><span class="meta-label">Target version:</span><input id="targetVersionInput" type="text" value="${escapeHtml(i.targetVersion ?? '')}" placeholder="e.g. v1.1" style="width:100px"></div>
    <div class="meta-pair"><span class="meta-label">Fixed in:</span><input id="fixedInInput" type="text" value="${escapeHtml(i.fixedInVersion ?? '')}" placeholder="e.g. v1.0.1" style="width:100px"></div>
    <div class="meta-pair" style="margin-left:auto">
      <button id="btnSaveFields" class="btn btn-sm">💾 Save</button>
    </div>
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
      <span class="meta-label">Sprint:</span>
      <select id="sprintSelect">${sprintOptions}</select>
    </div>
    <div class="meta-pair">
      <span class="meta-label">Milestone:</span>
      <select id="milestoneSelect">${milestoneOptions}</select>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-pair" style="flex-direction:column;align-items:flex-start;gap:6px">
      <span class="meta-label">Tags:</span>
      <div id="tagsChips" style="display:flex;flex-wrap:wrap;gap:4px;min-height:22px"></div>
      <div class="form-row" style="margin:0;gap:4px">
        <input id="tagInput" type="text" list="knownTagsList" placeholder="Add a tag…" style="width:150px">
        <datalist id="knownTagsList"></datalist>
        <button id="btnAddTag" class="btn btn-sm">+</button>
      </div>
      <div id="tagConfirmRow" style="display:none;align-items:center;gap:6px;font-size:.9em;padding:4px 8px;background:var(--vscode-inputValidation-infoBackground,#1a3a4a);border:1px solid var(--vscode-inputValidation-infoBorder,#4fc3f7);border-radius:4px;flex-wrap:wrap">
        <span id="tagConfirmText"></span>
        <button id="btnConfirmNewTag" class="btn btn-sm">Add</button>
        <button id="btnCancelNewTag" class="btn btn-sm btn-secondary">Cancel</button>
      </div>
    </div>
  </div>

  <h2>Description</h2>
  <textarea id="descriptionEdit" rows="6" style="width:100%;margin-bottom:6px">${escapeHtml(i.description ?? '')}</textarea>
  <div class="form-row">
    <button id="btnSaveDesc" class="btn btn-sm">Save Description</button>
  </div>

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
    <button id="btnLogTime" class="btn btn-sm">Log Time</button>
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
      <button id="btnAddComment" class="btn btn-sm">Add Comment</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Data embedded from extension - safely parsed from JSON strings
    let knownTags = JSON.parse('${knownTagsJson}');
    let knownPersons = JSON.parse('${knownPersonsJson}');
    let currentTags = JSON.parse('${currentTagsJson}');
    let currentIssue = JSON.parse('${currentIssueJson}');

    // ---- Dirty State Tracking ----
    const DIRTY_KEY = 'dirtyFields';
    const FIELD_SELECTORS = {
      description: '#descriptionEdit',
      reportedBy: '#reportedByInput',
      assignedTo: '#assigneeInput',
      reportedInVersion: '#reportedInInput',
      targetVersion: '#targetVersionInput',
      fixedInVersion: '#fixedInInput',
      tagInput: '#tagInput',
      commentBody: '#commentBody',
      logHours: '#logHours',
      logDesc: '#logDesc'
    };

    function getState() {
      return vscode.getState() || {};
    }

    function setState(state) {
      vscode.setState(state);
    }

    function markDirty(field, value) {
      const state = getState();
      if (!state[DIRTY_KEY]) state[DIRTY_KEY] = {};
      state[DIRTY_KEY][field] = value;
      setState(state);
      updateConflictBanner();
    }

    function clearDirty(field) {
      const state = getState();
      if (state[DIRTY_KEY]) {
        delete state[DIRTY_KEY][field];
        setState(state);
      }
      updateConflictBanner();
    }

    function hasDirtyFields() {
      const state = getState();
      return state[DIRTY_KEY] && Object.keys(state[DIRTY_KEY]).length > 0;
    }

    function getDirtyFields() {
      const state = getState();
      return state[DIRTY_KEY] || {};
    }

    function clearAllDirty() {
      const state = getState();
      delete state[DIRTY_KEY];
      setState(state);
      updateConflictBanner();
    }

    // Restore dirty values after HTML rebuild
    function restoreDirtyValues() {
      const dirty = getDirtyFields();
      for (const [field, value] of Object.entries(dirty)) {
        const selector = FIELD_SELECTORS[field];
        if (selector) {
          const el = document.querySelector(selector);
          if (el) el.value = value;
        }
      }
    }

    function updateConflictBanner() {
      const banner = document.getElementById('conflictBanner');
      const hasDirty = hasDirtyFields();
      if (banner) {
        banner.style.display = hasDirty ? 'flex' : 'none';
      }
      document.body.classList.toggle('has-conflict-banner', hasDirty);
    }

    // Discard all unsaved changes
    document.getElementById('btnDiscardChanges').addEventListener('click', () => {
      clearAllDirty();
      // Reload from server data
      if (currentIssue) {
        patchIssue(currentIssue);
      }
      showToast('Changes discarded');
    });

    function escH(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function showToast(msg, duration = 2000) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), duration);
    }

    // Patch issue data from server without full page refresh
    function patchIssue(issue) {
      currentIssue = issue;
      currentTags = issue.tags;
      knownTags = [...new Set([...knownTags, ...issue.tags])].sort();

      // Update read-only fields
      const titleEl = document.querySelector('h1');
      if (titleEl) titleEl.textContent = '#' + issue.sequentialId + ' ' + issue.title;

      // Update status dropdown
      const statusSelect = document.getElementById('statusSelect');
      if (statusSelect) statusSelect.value = issue.status;

      // Update sprint/milestone dropdowns
      const sprintSelect = document.getElementById('sprintSelect');
      if (sprintSelect && !getDirtyFields().sprintId) sprintSelect.value = issue.sprintId || '';
      const milestoneSelect = document.getElementById('milestoneSelect');
      if (milestoneSelect && !getDirtyFields().milestoneId) milestoneSelect.value = issue.milestoneId || '';

      // Update version fields only if not dirty
      const dirty = getDirtyFields();
      const versionFields = [
        ['reportedInInput', 'reportedInVersion'],
        ['targetVersionInput', 'targetVersion'],
        ['fixedInInput', 'fixedInVersion']
      ];
      for (const [id, field] of versionFields) {
        if (!dirty[field]) {
          const el = document.getElementById(id);
          if (el) {
            el.value = issue[field] || '';
            el.dataset.prevValue = el.value;
          }
        }
      }

      // Update person fields only if not dirty
      if (!dirty.reportedBy) {
        const el = document.getElementById('reportedByInput');
        if (el) { el.value = issue.reportedBy; el.dataset.prevValue = el.value; }
      }
      if (!dirty.assignedTo) {
        const el = document.getElementById('assigneeInput');
        if (el) { el.value = issue.assignedTo || ''; el.dataset.prevValue = el.value; }
      }

      // Re-render tags
      renderTagChips();
      refreshTagDatalist();
    }

    // Show external change warning
    function showExternalChangeWarning() {
      if (hasDirtyFields()) {
        showToast('Warning: Issue was modified externally. Your unsaved changes are preserved.', 4000);
      } else {
        showToast('Issue updated externally');
      }
    }

    // ---- Tags ----
    function renderTagChips() {
      const container = document.getElementById('tagsChips');
      container.innerHTML = '';
      currentTags.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'tag';
        chip.style.cssText = 'display:inline-flex;align-items:center;gap:3px;padding:1px 4px 1px 6px';
        chip.innerHTML = escH(tag) + '<button class="chip-remove" data-tag="' + escH(tag) + '" style="background:none;border:none;cursor:pointer;color:inherit;padding:0;font-size:.9em;line-height:1">×</button>';
        container.appendChild(chip);
      });
      container.querySelectorAll('.chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const tag = btn.getAttribute('data-tag');
          vscode.postMessage({ command: 'removeTag', value: tag });
          currentTags = currentTags.filter(t => t !== tag);
          renderTagChips();
          refreshTagDatalist();
          showToast('Tag removed');
        });
      });
    }

    function refreshTagDatalist() {
      const dl = document.getElementById('knownTagsList');
      dl.innerHTML = '';
      knownTags.filter(t => !currentTags.includes(t)).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        dl.appendChild(opt);
      });
    }

    function refreshPersonDatalist() {
      const dl = document.getElementById('knownPersonsList');
      dl.innerHTML = '';
      knownPersons.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        dl.appendChild(opt);
      });
    }

    renderTagChips();
    refreshTagDatalist();
    refreshPersonDatalist();

    // Add tag
    function tryAddTag(value) {
      const tag = value.trim();
      if (!tag) { return; }
      if (currentTags.includes(tag)) {
        showToast('Tag already added');
        document.getElementById('tagInput').value = '';
        clearDirty('tagInput');
        return;
      }
      if (knownTags.includes(tag)) {
        // Known tag — add directly
        vscode.postMessage({ command: 'addTag', value: tag });
        currentTags = [...currentTags, tag];
        renderTagChips();
        refreshTagDatalist();
        document.getElementById('tagInput').value = '';
        clearDirty('tagInput');
        showToast('Tag added');
      } else {
        // New tag — ask for confirmation
        const row = document.getElementById('tagConfirmRow');
        document.getElementById('tagConfirmText').textContent = 'Save \'' + tag + '\' as a new known tag?';
        row.style.display = 'flex';
        row.dataset.pendingTag = tag;
      }
    }

    document.getElementById('btnAddTag').addEventListener('click', () => {
      tryAddTag(document.getElementById('tagInput').value);
    });
    document.getElementById('tagInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); tryAddTag(document.getElementById('tagInput').value); }
    });
    document.getElementById('btnConfirmNewTag').addEventListener('click', () => {
      const row = document.getElementById('tagConfirmRow');
      const tag = row.dataset.pendingTag;
      vscode.postMessage({ command: 'addTag', value: tag });
      vscode.postMessage({ command: 'saveKnownTag', value: tag });
      knownTags = [...knownTags, tag].sort();
      currentTags = [...currentTags, tag];
      renderTagChips();
      refreshTagDatalist();
      document.getElementById('tagInput').value = '';
      clearDirty('tagInput');
      row.style.display = 'none';
      showToast('Tag added and saved');
    });
    document.getElementById('btnCancelNewTag').addEventListener('click', () => {
      document.getElementById('tagInput').value = '';
      document.getElementById('tagConfirmRow').style.display = 'none';
    });

    // ---- Persons (reportedBy + assignee) ----
    function onPersonSave(fieldId, command, dirtyKey) {
      const input = document.getElementById(fieldId);
      const value = input.value.trim();
      const prev = input.dataset.prevValue || '';
      if (value === prev) { return; }
      vscode.postMessage({ command: command, value });
      if (value) { knownPersons = [...new Set([...knownPersons, value])].sort(); refreshPersonDatalist(); }
      input.dataset.prevValue = value;
      clearDirty(dirtyKey);
      showToast('Saved');
    }

    document.getElementById('reportedByInput').dataset.prevValue = document.getElementById('reportedByInput').value;
    document.getElementById('assigneeInput').dataset.prevValue = document.getElementById('assigneeInput').value;

    // Track input changes for dirty state
    document.getElementById('reportedByInput').addEventListener('input', (e) => markDirty('reportedBy', e.target.value));
    document.getElementById('assigneeInput').addEventListener('input', (e) => markDirty('assignedTo', e.target.value));
    document.getElementById('descriptionEdit').addEventListener('input', (e) => markDirty('description', e.target.value));
    document.getElementById('reportedInInput').addEventListener('input', (e) => markDirty('reportedInVersion', e.target.value));
    document.getElementById('targetVersionInput').addEventListener('input', (e) => markDirty('targetVersion', e.target.value));
    document.getElementById('fixedInInput').addEventListener('input', (e) => markDirty('fixedInVersion', e.target.value));
    document.getElementById('tagInput').addEventListener('input', (e) => markDirty('tagInput', e.target.value));
    document.getElementById('commentBody').addEventListener('input', (e) => markDirty('commentBody', e.target.value));
    document.getElementById('logHours').addEventListener('input', (e) => markDirty('logHours', e.target.value));
    document.getElementById('logDesc').addEventListener('input', (e) => markDirty('logDesc', e.target.value));

    document.getElementById('reportedByInput').addEventListener('blur', () => onPersonSave('reportedByInput', 'updateReportedBy', 'reportedBy'));
    document.getElementById('assigneeInput').addEventListener('blur', () => onPersonSave('assigneeInput', 'updateAssignee', 'assignedTo'));
    document.getElementById('reportedByInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onPersonSave('reportedByInput', 'updateReportedBy', 'reportedBy'); } });
    document.getElementById('assigneeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); onPersonSave('assigneeInput', 'updateAssignee', 'assignedTo'); } });

    document.getElementById('btnEdit').addEventListener('click', () => {
      vscode.postMessage({ command: 'openEditor' });
    });
    document.getElementById('btnCopyId').addEventListener('click', () => {
      vscode.postMessage({ command: 'copyId' });
      showToast('ID copied');
    });
    document.getElementById('statusSelect').addEventListener('change', (e) => {
      vscode.postMessage({ command: 'updateStatus', value: e.target.value });
      showToast('Status saved');
    });
    function saveVersionField(id, command, dirtyKey) {
      const el = document.getElementById(id);
      vscode.postMessage({ command: command, value: el.value });
      el.dataset.prevValue = el.value;
      clearDirty(dirtyKey);
      showToast('Saved');
    }
    [['reportedInInput','updateReportedInVersion','reportedInVersion'],['targetVersionInput','updateTargetVersion','targetVersion'],['fixedInInput','updateFixedInVersion','fixedInVersion']].forEach(([id, cmd, dirtyKey]) => {
      const el = document.getElementById(id);
      el.dataset.prevValue = el.value;
      el.addEventListener('blur', () => { if (el.value !== el.dataset.prevValue) { saveVersionField(id, cmd, dirtyKey); } });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveVersionField(id, cmd, dirtyKey); } });
    });
    document.getElementById('btnSaveFields').addEventListener('click', () => {
      vscode.postMessage({
        command: 'saveIssueFields',
        reportedBy: document.getElementById('reportedByInput').value,
        assignedTo: document.getElementById('assigneeInput').value,
        reportedInVersion: document.getElementById('reportedInInput').value,
        targetVersion: document.getElementById('targetVersionInput').value,
        fixedInVersion: document.getElementById('fixedInInput').value,
      });
      document.getElementById('reportedByInput').dataset.prevValue = document.getElementById('reportedByInput').value;
      document.getElementById('assigneeInput').dataset.prevValue = document.getElementById('assigneeInput').value;
      ['reportedInInput','targetVersionInput','fixedInInput'].forEach(id => { document.getElementById(id).dataset.prevValue = document.getElementById(id).value; });
      clearDirty('reportedBy');
      clearDirty('assignedTo');
      clearDirty('reportedInVersion');
      clearDirty('targetVersion');
      clearDirty('fixedInVersion');
      showToast('Saved');
    });
    document.getElementById('sprintSelect').addEventListener('change', (e) => {
      vscode.postMessage({ command: 'updateSprint', value: e.target.value });
      clearDirty('sprintId');
      showToast('Sprint saved');
    });
    document.getElementById('milestoneSelect').addEventListener('change', (e) => {
      vscode.postMessage({ command: 'updateMilestone', value: e.target.value });
      clearDirty('milestoneId');
      showToast('Milestone saved');
    });
    document.getElementById('btnSaveDesc').addEventListener('click', () => {
      const value = document.getElementById('descriptionEdit').value;
      vscode.postMessage({ command: 'updateDescription', value });
      clearDirty('description');
      showToast('Description saved');
    });
    document.getElementById('btnAddComment').addEventListener('click', () => {
      const body = document.getElementById('commentBody').value.trim();
      if (!body) return;
      vscode.postMessage({ command: 'addComment', body });
      document.getElementById('commentBody').value = '';
      clearDirty('commentBody');
      showToast('Comment added');
    });
    document.getElementById('btnLogTime').addEventListener('click', () => {
      const hours = document.getElementById('logHours').value;
      const date = document.getElementById('logDate').value;
      const description = document.getElementById('logDesc').value;
      if (!hours || parseFloat(hours) <= 0) return;
      vscode.postMessage({ command: 'logTime', hours, date, description });
      document.getElementById('logHours').value = '';
      document.getElementById('logDesc').value = '';
      clearDirty('logHours');
      clearDirty('logDesc');
      showToast('Time logged');
    });
    // Handle messages from extension
    window.addEventListener('message', (event) => {
      if (!event.data) return;
      switch (event.data.command) {
        case 'error':
          showToast('Error: ' + event.data.message, 4000);
          console.error('Extension error:', event.data.message);
          break;
        case 'patchIssue':
          patchIssue(event.data.issue);
          break;
        case 'externalChange':
          showExternalChangeWarning();
          patchIssue(event.data.issue);
          break;
        case 'saveConfirmed':
          clearDirty(event.data.field);
          break;
      }
    });

    // Restore any dirty values and setup conflict banner on load
    restoreDirtyValues();
    updateConflictBanner();
  </script>
</body>
</html>`;
  }
}
