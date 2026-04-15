# How to Use Vetspresso Issues Tracker

This guide walks you through every feature of the extension, from first install to advanced workflows.

---

## Table of Contents

1. [First-Time Setup](#1-first-time-setup)
2. [Creating Issues](#2-creating-issues)
3. [Viewing and Editing Issues](#3-viewing-and-editing-issues)
4. [Issue Linking to Code](#4-issue-linking-to-code)
5. [Organizing with Milestones](#5-organizing-with-milestones)
6. [Sprint Workflow](#6-sprint-workflow)
7. [Time Tracking](#7-time-tracking)
8. [Searching and Filtering](#8-searching-and-filtering)
9. [Changelog Generation](#9-changelog-generation)
10. [Export and Import](#10-export-and-import)
11. [Dashboard](#11-dashboard)
12. [Templates](#12-templates)
13. [Multi-Root Workspaces](#13-multi-root-workspaces)
14. [Storage Configuration](#14-storage-configuration)
15. [Keyboard Shortcuts Reference](#15-keyboard-shortcuts-reference)

---

## 1. First-Time Setup

### Install

Install **Vetspresso Issues Tracker** from the VS Code Marketplace.

### Configure Your Name

Open your VS Code settings (`Ctrl+,`) and set:

```json
"vetspresso-issues.author": "Your Name"
```

This name is used as the default reporter when you create issues.

### Choose Storage Location

By default issues are stored in `.vscode/issues/` inside your workspace — they can be committed to git and shared with your team.

To keep issues private (not tracked in git), switch to global storage:

```json
"vetspresso-issues.storageLocation": "global"
```

See [Storage Configuration](#14-storage-configuration) for details.

### First Issue

Press `Ctrl+Alt+I` to create your first issue. The extension initialises its storage automatically on first use.

---

## 2. Creating Issues

### Basic Creation (`Ctrl+Alt+I`)

Pressing `Ctrl+Alt+I` (or running `Issues: Create New Issue` from the Command Palette) opens a five-step quick-pick wizard:

1. **Type** — Bug, Enhancement, Feature, Task, Question, Documentation, Other
2. **Title** — Free-text, keep it short and descriptive
3. **Severity** — Critical, High, Medium, Low, Trivial
4. **Urgency** — Immediate, High, Normal, Low, Whenever
5. **Description** *(optional)* — Multi-line description

The current git tag is automatically filled into the **Reported In** field.

### Create from Template

Run `Issues: Create from Template`:

1. Choose a template (Bug Report, Feature Request, Task, or any custom templates)
2. Fill in the title (all other fields are pre-filled from the template)

Templates pre-fill type, severity, urgency, tags, description, and estimated hours.

---

## 3. Viewing and Editing Issues

### Issue Detail Panel

Click any issue in the sidebar to open its detail panel. The panel shows:

- **Header**: Sequential ID, type icon, status
- **Fields**: All metadata (severity, urgency, versions, milestone, sprint, tags, assignee, reporter, dates)
- **Description**: Full markdown-rendered description
- **Code Links**: Clickable links to jump to linked code locations
- **Relations**: Linked issues with type and navigation
- **Time Entries**: All logged work with totals
- **Comments**: Threaded comments with author and timestamp

#### Inline Editing in the Detail Panel

| What | How |
| --- | --- |
| Change status | Dropdown in the header |
| Edit assignee | Click the assignee field, type new name |
| Add comment | Scroll to Comments section, type and submit |
| Log time | Scroll to Time section, enter hours and note |
| Copy issue ID | Click the `#N` badge in the panel header |
| Navigate to code | Click a code link in the Code Links section |
| Navigate to related issue | Click a relation entry |

### Quick Status Changes (Right-Click)

Right-click any issue in the tree to:

- **Close** — sets status to `closed` immediately
- **Resolve** — prompts for a "Fixed In" version, sets status to `resolved`
- **Reopen** — sets status back to `open`, clears `resolvedAt`

---

## 4. Issue Linking to Code

Connect issues directly to the lines in your source code where the problem lives.

### Link Selection to Issue

1. Select one or more lines in any editor
2. Press `Ctrl+Alt+L` or run `Issues: Link Code to Issue`
3. Search for or select the issue to link
4. An entry is added to the issue's **Code Links** list

### Visual Indicators

After linking:

- A **🔗 gutter decoration** appears in the line margin
- A **CodeLens** appears above the line: `[🔗 Issue #N: <title>]`
- Click the CodeLens to open the issue detail panel

### Removing Links

Open the issue detail panel, find the code link, and click the **×** remove button.

---

## 5. Organizing with Milestones

A milestone groups issues towards a specific delivery goal (e.g., `v1.0 Release`).

### Create a Milestone

Run `Issues: Create Milestone`:

1. Enter the milestone name
2. Optionally set a target date

### Assign Issues to a Milestone

Open an issue detail panel and set the **Milestone** field, or use `Issues: Edit Issue` from the context menu.

### Milestone View

In the **Milestones** sidebar view:

- Each milestone shows `(open / total)` issue counts
- Expand a milestone to see its issues
- Progress bar concept: visually see how close to completion

### Complete / Delete a Milestone

Right-click the milestone in the sidebar and choose **Edit** or **Delete**. Deleting a milestone clears the `milestoneId` from all its issues.

---

## 6. Sprint Workflow

Sprints support time-boxed agile iterations.

### Create a Sprint

Run `Issues: Create Sprint`:

1. Enter the sprint name (e.g., `Sprint 12`)
2. Enter start and end dates
3. Optionally set a sprint goal

The sprint is created with status **Planned**.

### Assign Issues to a Sprint

Edit any issue and set its **Sprint** field to the sprint name.

### Starting a Sprint

Right-click the sprint in the Sprints view and select **Start Sprint**. Status changes to **Active**.

### Completing a Sprint

Right-click an active sprint and select **Complete Sprint**. Status changes to **Completed**.

### Sprint View

In the **Sprints** sidebar:

- Active sprints appear first
- Each sprint shows open/total issue counts
- Expand to see issues within the sprint

---

## 7. Time Tracking

Track time spent on each issue directly in the extension.

### Log Time

**From the context menu:**

1. Right-click an issue → **Log Time**
2. Enter hours (e.g., `1.5`)
3. Optionally add a note

**From the detail panel:**

1. Open the issue detail panel
2. Scroll to the **Time** section
3. Click **Log Time**, fill in hours and note

### View Time Summary

The **Time Tracking** sidebar view shows:

- Each issue with a total hours badge
- Expand an issue to see individual log entries with date and note
- Entries are sorted by date, newest first

### Estimate vs. Actual

Set `estimatedHours` on an issue (via the create wizard or edit). The detail panel shows estimated vs. actual hours logged.

---

## 8. Searching and Filtering

### Full-Text Search (`Ctrl+Alt+Shift+F`)

Run `Issues: Search` to open the search quick-pick. Type to search across:

- Title
- Description
- Tags
- Comment bodies
- Assignee name
- Reporter name

Results are ranked by the number of fields matched – issues matching title + description + comments rank higher than title-only matches.

**Shortcut for sequential ID:** type `#42` to jump directly to issue 42.

### Filtering the Tree

Run `Issues: Filter` or click the funnel icon in the Issues view toolbar:

| Filter | Options |
| --- | --- |
| Status | Any combination of status values |
| Type | Any combination of issue types |
| Severity | Any combination of severity levels |
| Tags | One or more tag names |
| Assignee | A specific assignee name |
| Stale Only | Show only issues open > 30 days |
| Search Text | Free text (same as full-text search, but persistent) |

Active filters are indicated by a badge on the funnel icon. Run `Issues: Clear Filter` to remove.

### Grouping the Tree

Click the group-by icon in the Issues view or run `Issues: Group By`:

| Group By | Description |
| --- | --- |
| Status | Default — Open / In Progress / In Review / On Hold / Resolved / Closed / Won't Fix |
| Type | Bug / Feature / Enhancement / … |
| Severity | Critical / High / Medium / Low / Trivial |
| Urgency | Immediate / High / Normal / Low / Whenever |
| Milestone | One group per milestone, ungrouped at bottom |
| Sprint | One group per sprint, ungrouped at bottom |
| Assignee | One group per assignee, unassigned at bottom |

---

## 9. Changelog Generation

Run `Issues: Generate Changelog`:

1. **Version filter** *(optional)* — enter a version tag to restrict output, or leave blank for all versions
2. **Format** — Markdown or Plain Text
3. The changelog opens in an untitled editor
4. An offer to **Save as CHANGELOG.md** in the workspace root appears as a notification

A changelog only includes issues that:

- Have status `resolved` or `closed`
- Have a non-empty `fixedInVersion` field

Entries are grouped by version, then by issue type (Bugs, Features, Enhancements, etc.).

Each entry includes the sequential ID, title, and a short description.

---

## 10. Export and Import

### Export

Run `Issues: Export Issues`:

1. Choose format: **JSON**, **CSV**, **Markdown**, or **GitHub Issues JSON**
2. A save-file dialog opens
3. The file is written to the chosen location

| Format | Best For |
| --- | --- |
| JSON | Backups, migration between workspaces |
| CSV | Spreadsheet analysis (Excel, Google Sheets) |
| Markdown | Sharing in a README or Wiki |
| GitHub Issues JSON | Bulk-importing into a GitHub repository |

### Import

Run `Issues: Import Issues`:

1. A file-open dialog opens — select a `.json` export file
2. Issues are imported; duplicates (matching UUID) are skipped
3. A notification shows `Imported N issues, skipped M duplicates`

**Note:** Import only accepts the JSON format produced by the extension's JSON export. GitHub Issues JSON is export-only.

---

## 11. Dashboard

Press `Ctrl+Alt+D` or run `Issues: Open Dashboard` to open the metrics panel.

The dashboard shows:

**KPI Cards:**

- Total issues
- Open issues
- In Progress
- Resolved (all time)
- Critical (open)
- Stale (open, no activity > 30 days)

**Charts:**

- Issues by status (bar chart)
- Issues by severity (bar chart)
- Issues by type (bar chart)

**Tables:**

- Milestone progress (milestone name, open issues, total, % complete)
- Sprint progress (sprint name, status, open, total)

The dashboard auto-refreshes when issue data changes.

---

## 12. Templates

Templates let you standardize issue creation with pre-filled fields.

### Built-in Templates

Three templates are created automatically on first use:

| Template | Description |
| --- | --- |
| Bug Report | Type=Bug, Severity=High, includes reproduction-steps description outline |
| Feature Request | Type=Feature, Urgency=Normal, includes user-story description outline |
| Task | Type=Task, Severity=Low, blank description |

### Create Custom Templates

Run `Issues: Create Template` (or manage via `Issues: Manage Templates`):

1. Enter the template name
2. Set default type, severity, urgency, tags, estimated hours, and description scaffold

### Use a Template

Run `Issues: Create from Template`, pick your template, enter the title — all other fields are pre-filled and editable in the resulting issue.

---

## 13. Multi-Root Workspaces

For workspaces with multiple folders (VS Code multi-root), configure `vetspresso-issues.multiRootStorage`:

### `shared` (default)

All folders share one issue store. The store is placed in the first workspace folder (or global storage if configured). Good when all folders are part of one project.

### `perFolder`

Each workspace folder gets its own independent issue store. Issues are only visible when the relevant folder is active. Good for monorepos with truly independent sub-projects.

To change the setting:

```json
"vetspresso-issues.multiRootStorage": "perFolder"
```

A reload prompt appears after changing storage configuration.

---

## 14. Storage Configuration

### Workspace Storage (default)

Issues stored in `.vscode/issues/` within the workspace:

```text
your-project/
└── .vscode/
    └── issues/
        ├── index.json          ← sequential ID counter + metadata
        ├── milestones.json
        ├── sprints.json
        ├── templates.json
        └── issues/
            ├── <uuid>.json     ← one file per issue
            └── ...
```

**Advantages:**

- Committed to git alongside your code (if desired)
- Shareable with teammates
- Survives across VS Code reinstalls

**To exclude from git**, add to your `.gitignore`:

```text
.vscode/issues/
```

### Global Storage

Issues stored in VS Code's `globalStorageUri` (a machine-local path under your VS Code data directory), namespaced by workspace folder:

```text
<globalStorageUri>/
└── stores/
    └── <project-name>_<hash8>/   ← namespace per folder
        ├── index.json
        └── issues/
            └── <uuid>.json
```

**Advantages:**

- Never accidentally committed to git
- Multiple workspaces tracked independently
- Private by default

---

## 15. Keyboard Shortcuts Reference

| Action | Default | Configurable |
| --- | --- | --- |
| Create new issue | `Ctrl+Alt+I` | Yes (VS Code keybindings) |
| Search issues | `Ctrl+Alt+Shift+F` | Yes |
| Link code selection to issue | `Ctrl+Alt+L` | Yes |
| Open dashboard | `Ctrl+Alt+D` | Yes |

To customize shortcuts: `Ctrl+Shift+P` → `Preferences: Open Keyboard Shortcuts` → search `vetspresso-issues`.

---

## Tips & Tricks

- **Quick navigate by ID**: Run search and type `#42` to jump directly to issue 42
- **Batch status update**: Select multiple issues in the tree with multi-select, then right-click for bulk actions
- **Current version filter**: Run `Issues: Open Current Version Issues` to instantly see all issues tied to your current git tag
- **Stale filter**: Use `Issues: Filter → Stale Only` to do a weekly debt review
- **Code review workflow**: Before raising a PR, run `Issues: Link Code to Issue` on each changed section to trace changes back to issues
- **Sprint board**: Use the Sprint view grouped by status for a lightweight Kanban feel
