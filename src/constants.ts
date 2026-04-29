/**
 * Extension-wide constants.
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

/** Unique identifier prefix used for all extension commands and views. */
export const EXTENSION_ID = 'vetspresso-issues';

/** Human-readable name displayed in VS Code UI. */
export const EXTENSION_DISPLAY_NAME = 'Vetspresso Issues Tracker';

/** Semantic version of the extension data schema. Bump on breaking changes. */
export const SCHEMA_VERSION = '1.0.0';

/** Relative path within a workspace folder where issue data is stored. */
export const WORKSPACE_ISSUES_DIR = '.vscode/issues';

/** Filename for the per-store index (counter, metadata). */
export const INDEX_FILENAME = 'index.json';

/** Subdirectory holding individual issue JSON files. */
export const ISSUES_SUBDIR = 'issues';

/** Filename for milestone data. */
export const MILESTONES_FILENAME = 'milestones.json';

/** Filename for sprint data. */
export const SPRINTS_FILENAME = 'sprints.json';

/** Filename for issue-template data. */
export const TEMPLATES_FILENAME = 'templates.json';

/** Filename for the list of known/previously-used tags. */
export const KNOWN_TAGS_FILENAME = 'known-tags.json';

/** Filename for the list of known/previously-used person names. */
export const KNOWN_PERSONS_FILENAME = 'known-persons.json';

/** View container IDs */
export const VIEW_CONTAINER_ID = `${EXTENSION_ID}-container`;

/** Tree view ID for the main issue explorer. */
export const VIEW_ISSUE_EXPLORER = `${EXTENSION_ID}.issueExplorer`;
/** Tree view ID for milestones. */
export const VIEW_MILESTONE = `${EXTENSION_ID}.milestoneView`;
/** Tree view ID for sprints. */
export const VIEW_SPRINT = `${EXTENSION_ID}.sprintView`;
/** Tree view ID for time tracking. */
export const VIEW_TIME = `${EXTENSION_ID}.timeView`;

/** Configuration section key */
export const CONFIG_SECTION = EXTENSION_ID;

/** Config key: where to persist data (`'workspace'` or `'global'`). */
export const CFG_STORAGE_LOCATION = 'storageLocation';
/** Config key: multi-root workspace storage strategy. */
export const CFG_MULTI_ROOT_STORAGE = 'multiRootStorage';
/** Config key: whether to show the status bar item. */
export const CFG_SHOW_STATUS_BAR = 'showStatusBar';
/** Config key: whether CodeLens is enabled. */
export const CFG_CODE_LENS_ENABLED = 'codeLensEnabled';
/** Config key: whether git integration is enabled. */
export const CFG_GIT_INTEGRATION = 'gitIntegration';
/** Config key: default author name for new issues. */
export const CFG_AUTHOR = 'author';
/** Config key: default assignee for new issues. */
export const CFG_DEFAULT_ASSIGNEE = 'defaultAssignee';
/** Config key: number of days before an issue is considered stale. */
export const CFG_STALE_DAYS = 'staleIssueDays';
/** Config key: default issue type for new issues. */
export const CFG_DEFAULT_TYPE = 'defaultIssueType';
/** Config key: tree view grouping strategy. */
export const CFG_TREE_GROUP_BY = 'treeGroupBy';
/** Config key: whether resolved issues appear in the tree. */
export const CFG_SHOW_RESOLVED = 'showResolvedIssues';
/** Config key: whether gutter decorations are enabled. */
export const CFG_DECORATIONS_ENABLED = 'decorationsEnabled';
/** Config key: whether changelog groups entries by issue type. */
export const CFG_CHANGELOG_GROUP_BY_TYPE = 'changelogGroupByType';
/** Config key: date format used in exports. */
export const CFG_EXPORT_DATE_FORMAT = 'exportDateFormat';
/** Config key: default sprint length in days. */
export const CFG_SPRINT_LENGTH_DAYS = 'sprintLengthDays';

/** Status bar priority (higher = further left) */
export const STATUS_BAR_PRIORITY = 100;

/** Context value for issue tree items. */
export const CTX_ISSUE = 'issue';
/** Context value for group header tree items. */
export const CTX_GROUP = 'group';
/** Context value for milestone tree items. */
export const CTX_MILESTONE = 'milestone';
/** Context value for sprint tree items. */
export const CTX_SPRINT = 'sprint';
/** Context value for time entry tree items. */
export const CTX_TIME_ENTRY = 'timeEntry';

/** Maximum characters of a code snippet stored in a CodeLink */
export const CODE_LINK_SNIPPET_MAX = 200;

/** Debounce delay (ms) for decoration updates */
export const DECORATION_DEBOUNCE_MS = 300;

/** Refresh debounce (ms) for tree view updates */
export const TREE_REFRESH_DEBOUNCE_MS = 150;
