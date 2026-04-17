# Changelog

All notable changes to **Vetspresso Issues Tracker** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Fixed

- **Issue detail panel — buttons and inputs were silently no-ops.** Inline event handlers (`onclick`, `onchange`, `onblur`) are blocked by VS Code's Content Security Policy when a nonce is present. All event bindings have been moved into the nonce-protected `<script>` block using `addEventListener`. Affected controls: status dropdown, assignee input, Save Description button, Add Comment button, Log Time button, Edit button, Copy ID button.

### Added

- **Inline description editing** in the issue detail panel: description is now an editable textarea with a "Save Description" button.
- **Sprint and Milestone dropdowns** in the issue detail panel: both fields can now be changed directly from the panel without going through the Edit command.
- **"Assign to Sprint" command** (`vetspresso-issues.assignSprint`): right-click any issue in the Issues tree to assign or remove its sprint via a quick-pick list.
- **"Assign to Milestone" command** (`vetspresso-issues.assignMilestone`): right-click any issue in the Issues tree to assign or remove its milestone via a quick-pick list.
- **Sprint edit now includes description**: `cmdEditSprint` prompts for the sprint goal/description in addition to name and status.
- **Issue edit now includes description**: `cmdEditIssue` prompts for the description in addition to title, status, and assignee.
- Toast notifications in the issue detail panel for all save actions.
- **Editable version fields in the issue detail panel**: "Reported in", "Target version", and "Fixed in" are now text inputs that save on blur, instead of read-only labels.
- **Version fields in `cmdEditIssue`**: editing an issue via the Edit command now prompts for "Reported In", "Target Version", and "Fixed In". When git tags are available they are offered as a quick-pick; otherwise a free-text input is shown. Leaving blank clears the field.
- **Known tags system**: a persistent list of previously-used tags is now maintained in `known-tags.json` alongside issue data. Tags are automatically seeded from existing issues on first load for backward-compatibility. Subsequent creates and edits register new tags.
- **Known persons system**: a persistent list of previously-used person names (reporters and assignees) is now maintained in `known-persons.json`. Names are seeded from existing issues on first load and auto-registered on every create/update.
- **Inline tag editor in the issue detail panel**: tags are shown as removable chips (×). A text input with datalist autocomplete lets you pick from known tags or type a new one. Typing an unknown tag prompts inline *"Save as a new known tag?"* — confirm to persist it, cancel to discard.
- **Inline Reported by / Assigned to editing in the issue detail panel**: both fields are now text inputs with datalist autocomplete from the known-persons list. Editing to an unknown name prompts inline *"Save as a known person for future use?"* before persisting.
- **Assignee and tag prompts in `cmdCreateIssue`**: new issue wizard now includes an Assignee step (quick-pick from known persons + "Enter name…" option) and a Tags step (multi-select from known tags + "Add custom tag…" option).
- **Tag editing in `cmdEditIssue`**: the Edit Issue command now includes a Tags step with multi-select from known tags and a custom-tag entry option. Custom tags entered here are immediately registered in the known-tags list.

---

## [0.1.0] — 2024-01-01

### Added

#### Core Issue Tracking
- Seven issue types: Bug, Enhancement, Feature, Task, Question, Documentation, Other
- Five severity levels: Critical, High, Medium, Low, Trivial
- Five urgency levels: Immediate, High, Normal, Low, Whenever
- Seven status values: Open, In Progress, In Review, On Hold, Closed, Resolved, Wont Fix
- Per-issue comments with author and timestamps
- Sequential human-readable IDs (`#1`, `#2`, …) alongside opaque UUIDs

#### Version Integration
- Automatic current-version detection via VS Code's built-in Git extension API (reads tags)
- "Reported In" and "Fixed In" version fields on every issue
- Semver-aware tag sorting (v1.10.0 ranks above v1.9.0)
- Extensible `IVersionProvider` interface for future VCS support

#### Storage
- Configurable storage location: workspace-local (`.vscode/issues/`) or VS Code global storage
- Configurable multi-root workspace support: shared or per-folder stores
- One JSON file per issue for clean git diffs
- In-memory cache for fast reads without repeated I/O
- `vscode.workspace.fs` API throughout (remote/codespace compatible)
- Three default issue templates seeded on first workspace initialisation

#### Organization
- Milestones with target dates and progress tracking
- Sprints with planned/active/completed/cancelled lifecycle
- Free-form tags with aggregate tag cloud
- Issue relations: blocks, blocked-by, duplicates, related-to, parent-of, child-of, clones (bidirectional)

#### VS Code Integration
- Primary sidebar with four views: Issues, Milestones, Sprints, Time Tracking
- Seven tree grouping strategies: status, type, severity, urgency, milestone, sprint, assignee
- Filter panel (status, type, severity, tags, assignee, stale-only, search text)
- CodeLens above linked code lines (`Ctrl+Alt+L` to link)
- Gutter icon decorations (🔗) on linked lines with overview ruler
- Status bar item with open + critical counts; red background when criticals present
- Keyboard shortcuts: `Ctrl+Alt+I` (create), `Ctrl+Alt+Shift+F` (search), `Ctrl+Alt+L` (link), `Ctrl+Alt+D` (dashboard)
- 35 registered commands in the Command Palette

#### Panels
- Issue Detail webview with inline status changes, assignee editing, comments, time log, code-link navigation
- Statistics Dashboard with KPI cards, bar charts, milestone/sprint progress tables

#### Developer Experience
- Time tracking: log hours per issue with date and note
- Templates (Bug Report, Feature Request, Task) with full field pre-fills
- Changelog generator: Markdown or plain-text, grouped by version and type
- Export: JSON (re-importable), CSV, Markdown, GitHub Issues JSON
- Import with UUID deduplication
- Full-text search across title, description, tags, comments, assignee
- Stale detection: issues open > 30 days flagged automatically

#### Quality
- AGPL-3.0-only license
- esbuild-based build (fast, no webpack)
- Full unit test suite: 80+ test cases across 7 test files
- TypeScript strict mode throughout
- No runtime npm dependencies (only VS Code API and Node built-ins)
- Nonce-based CSP on all webview panels

[Unreleased]: https://github.com/vetspresso/vetspresso-issues/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vetspresso/vetspresso-issues/releases/tag/v0.1.0
