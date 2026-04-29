# Vetspresso Issues Tracker

> **Track bugs, enhancements, features and tasks — all linked to your code, commits, and version tags.**

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=vetspresso.vetspresso-issues)
[![Version](https://img.shields.io/visual-studio-marketplace/v/vetspresso.vetspresso-issues?label=version)](https://marketplace.visualstudio.com/items?itemName=vetspresso.vetspresso-issues)
[![CI](https://github.com/vetspresso/vetspresso-issues/actions/workflows/ci.yml/badge.svg)](https://github.com/vetspresso/vetspresso-issues/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/vetspresso/vetspresso-issues/branch/main/graph/badge.svg)](https://codecov.io/gh/vetspresso/vetspresso-issues)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

Vetspresso Issues Tracker is a fully self-contained, project-local issue tracker for VS Code. No external services, no accounts, no cloud dependency — your data lives where your code lives.

---

## Features

### Core Issue Tracking

- **Seven issue types**: Bug, Enhancement, Feature, Task, Question, Documentation, Other
- **Five severity levels**: Critical, High, Medium, Low, Trivial
- **Five urgency levels**: Immediate, High, Normal, Low, Whenever
- **Seven status values**: Open, In Progress, In Review, On Hold, Closed, Resolved, Wont Fix
- **Version linking**: Attach issues to git tags for "reported in" and "fixed in" version
- **Code linking**: Link issues directly to file lines with CodeLens and gutter decorations

### Organization

- **Milestones** — Group issues by release milestone with progress tracking
- **Sprints** — Agile sprint workflow with start/end dates and status (planned/active/completed/cancelled)
- **Tags** — Free-form labels for cross-cutting concerns
- **Relations** — Link issues as: blocks / blocked-by / duplicates / related-to / parent-of / child-of / clones

### Developer Workflow

- **Time Tracking** — Log hours per issue with comments; view totals in the sidebar
- **Templates** — Define issue templates with pre-filled fields (ships with Bug, Feature, Task templates)
- **Changelog Generator** — Render Markdown or plain-text changelogs from resolved issues grouped by version
- **Export / Import** — JSON (full re-import), CSV, Markdown, or GitHub Issues JSON format
- **Full-text Search** — Search across title, description, tags, comments, and assignee

### VS Code Integration

- **Primary sidebar** — Four views: Issues, Milestones, Sprints, Time Tracking
- **Grouping** — Group issues by status, type, severity, urgency, milestone, sprint, or assignee
- **CodeLens** — Inline `[🔗 Issue #N: <title>]` lens above linked lines — click to view
- **Gutter decorations** — Visual marker on every line linked to an issue
- **Status bar** — Live count of open / critical issues; red background when critical exist
- **Keyboard shortcuts** — Four built-in keybindings (configurable)
- **Stale detection** — Issues open > 30 days without activity are automatically flagged

---

## Installation

1. Open VS Code
2. Open the **Extensions** panel (`Ctrl+Shift+X`)
3. Search for **Vetspresso Issues Tracker**
4. Click **Install**

Or install from the command line:

```sh
code --install-extension vetspresso.vetspresso-issues
```

---

## Quick Start

1. Open any project folder in VS Code
2. Run **"Issues: Create New Issue"** (`Ctrl+Alt+I`) or click the **+** icon in the Issues sidebar
3. Fill in the type, title, severity, and urgency — the current git tag auto-fills as "Reported In"
4. Click submit — the issue appears in the sidebar immediately

---

## Configuration

All settings are under `vetspresso-issues.*`:

| Setting | Default | Description |
| --- | --- | --- |
| `storageLocation` | `workspace` | Where issues are stored: `workspace` (`.vscode/issues/`) or `global` (VS Code global storage) |
| `multiRootStorage` | `shared` | For multi-root workspaces: `shared` (one store) or `perFolder` (one store per folder) |
| `author` | `""` | Your name or username — used as the reporter on new issues (falls back to git user) |
| `defaultAssignee` | `""` | Default assignee username for new issues |
| `defaultIssueType` | `bug` | Default issue type pre-selected when creating a new issue |
| `staleIssueDays` | `30` | Days without activity before an open issue is flagged as stale |
| `treeGroupBy` | `status` | How to group issues in the tree view (`status`, `type`, `severity`, `milestone`, `sprint`, `assignee`, `none`) |
| `showResolvedIssues` | `false` | Include resolved and closed issues in the main tree view |
| `showStatusBar` | `true` | Show an issue summary (open/critical counts) in the status bar |
| `codeLensEnabled` | `true` | Show CodeLens entries above lines of code linked to issues |
| `decorationsEnabled` | `true` | Show gutter icons on lines of code linked to issues |
| `gitIntegration` | `true` | Enable Git integration for automatic version/tag detection |
| `changelogGroupByType` | `true` | Group changelog entries by issue type (Bugs, Features, etc.) |
| `exportDateFormat` | `iso` | Date format used in exports: `iso`, `locale`, `short` |
| `sprintLengthDays` | `14` | Default sprint duration in days (used as the end-date offset when creating sprints) |

### Storage Locations

**Workspace storage** (`.vscode/issues/`) — default

- Can be committed to git and shared with your team
- One directory per project, automatically scoped
- Best for team projects

**Global storage** (VS Code `globalStorageUri`)

- Machine-local, never shared via git
- Useful for personal tracking on projects you don't control
- Siloed per workspace folder using a namespace hash

---

## Keyboard Shortcuts

| Action | Default Shortcut |
| --- | --- |
| Create new issue | `Ctrl+Alt+I` |
| Search issues | `Ctrl+Alt+Shift+F` |
| Link selection to issue | `Ctrl+Alt+L` |
| Open dashboard | `Ctrl+Alt+D` |

---

## Views

### Issues

The main tree view. Shows all issues grouped by your chosen strategy (default: by status).

**Toolbar actions:**

- `+` — Create issue
- Filter icon — Filter issues
- Group-by icon — Change grouping
- Refresh icon — Force reload

**Right-click on an issue:**

- View, Edit, Close, Resolve, Reopen, Delete
- Link code selection to issue
- Copy issue ID
- Log time
- Add relation

### Milestones

Lists all milestones with open/total issue counts. Expand to see issues within the milestone.

### Sprints

Lists all sprints sorted by status (active first). Expand to see issues in each sprint.

### Time Tracking

Per-issue time summary. Expand a row to see individual log entries with dates and notes.

---

## Commands

All commands are accessible from the Command Palette (`Ctrl+Shift+P`) under `Issues:`:

| Command | Description |
| --- | --- |
| `Issues: Create New Issue` | Multi-step QuickPick issue creation wizard |
| `Issues: Create from Template` | Create using a saved template |
| `Issues: View Issue` | Open the issue detail panel |
| `Issues: Edit Issue` | Quick-edit title, status, or assignee |
| `Issues: Close Issue` | Set status to Closed |
| `Issues: Resolve Issue` | Set status to Resolved + choose fixed-in version |
| `Issues: Reopen Issue` | Set status back to Open |
| `Issues: Delete Issue` | Permanently delete (with confirmation) |
| `Issues: Search` | Full-text search with ranked results |
| `Issues: Filter` | Filter the tree by status, type, severity, etc. |
| `Issues: Clear Filter` | Remove active filter |
| `Issues: Link Code to Issue` | Link the current editor selection to an issue |
| `Issues: Log Time` | Log hours against an issue |
| `Issues: Add Relation` | Link two issues together |
| `Issues: Copy Issue ID` | Copy `#N` to clipboard |
| `Issues: Open Dashboard` | Open the aggregate statistics dashboard |
| `Issues: Generate Changelog` | Render a changelog from resolved issues |
| `Issues: Export Issues` | Export to JSON, CSV, Markdown, or GitHub Issues |
| `Issues: Import Issues` | Import from a previously exported JSON file |
| `Issues: Create Milestone` | Create a new milestone |
| `Issues: Edit Milestone` | Rename or update a milestone |
| `Issues: Delete Milestone` | Delete a milestone |
| `Issues: Create Sprint` | Create a new sprint |
| `Issues: Start Sprint` | Advance sprint to Active status |
| `Issues: Complete Sprint` | Complete a sprint |
| `Issues: Group By` | Change the tree grouping strategy |
| `Issues: Open Current Version Issues` | Filter to issues for the current git tag |

---

## Issue Detail Panel

Click any issue in the sidebar (or run `Issues: View Issue`) to open the detail panel.

The panel shows all issue fields and allows inline:

- Status changes via dropdown
- Assignee edit (click to edit in-place)
- Comments with full Markdown body
- Time log entries
- Code link navigation (click to jump to linked file/line)
- Relation navigation (click to view related issue)

---

## Code Linking

1. Select one or more lines in any file
2. Run `Issues: Link Code to Issue` (`Ctrl+Alt+L`)
3. Pick the issue to link
4. A 🔗 gutter icon and CodeLens appear at the linked lines

A single issue can be linked to multiple code locations. Remove links from the issue detail panel.

---

## Git Version Integration

When you create an issue, the extension reads your current git tag (if any) and pre-fills the "Reported In" field. When you resolve an issue, you choose from your existing tags for the "Fixed In" field.

Use `Issues: Open Current Version Issues` to quickly see all issues reported in or targeting the current tag.

---

## Changelog Generation

Run `Issues: Generate Changelog` from the Command Palette:

1. Optionally filter to a specific version
2. Choose format (Markdown or plain text)
3. The changelog opens in an editor tab, grouped by version and type
4. Optionally Save as `CHANGELOG.md` in the workspace root

Only resolved or closed issues with a "Fixed In" version are included.

---

## Export & Import

**Export** (`Issues: Export Issues`):

- **JSON** — Full export, re-importable (schema-versioned)
- **CSV** — Spreadsheet-compatible (title, status, type, severity, etc.)
- **Markdown** — Formatted table with details block per issue
- **GitHub Issues JSON** — Compatible with GitHub's bulk issue import format

**Import** (`Issues: Import Issues`):

- Accepts the JSON export format
- Deduplicates by UUID — existing issues with the same ID are skipped (not overwritten)
- Returns a count of imported vs. skipped issues

---

## Dashboard

Run `Issues: Open Dashboard` (`Ctrl+Alt+D`) to open the metrics dashboard:

- KPI cards: total, open, in-progress, resolved, critical, stale
- Bar charts: issues by status, severity, type
- Milestone progress table (open/total issues per milestone)
- Sprint burn table (open/total issues per sprint)

The dashboard refreshes automatically when issue data changes.

---

## Screenshots

Screenshots coming soon

---

## Multi-root Workspace Support

For workspaces with multiple folders, set `vetspresso-issues.multiRootStorage`:

- `shared` — All folders use a single issue store (the store root is the first workspace folder)
- `perFolder` — Each folder has its own independent issue store

---

## License

**GNU Affero General Public License v3.0 or later** — see [LICENSE](LICENSE).

This extension is free and open source. You can use, modify, and distribute it for any purpose. If you distribute a modified version (including over a network), you must release your modifications under the same license.

---

## Contributing

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for architecture overview, development setup, and contribution guidelines.

---

## Author

**Alberto L. Bonfiglio** — [vetspresso](https://github.com/vetspresso)

Issues and pull requests welcome on [GitHub](https://github.com/vetspresso/vetspresso-issues).
