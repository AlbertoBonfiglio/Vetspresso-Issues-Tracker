# Changelog

All notable changes to **Vetspresso Issues Tracker** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

*No unreleased changes yet.*

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
