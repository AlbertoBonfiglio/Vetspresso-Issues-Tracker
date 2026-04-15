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

/** View container IDs */
export const VIEW_CONTAINER_ID = `${EXTENSION_ID}-container`;

/** Individual view IDs */
export const VIEW_ISSUE_EXPLORER = `${EXTENSION_ID}.issueExplorer`;
export const VIEW_MILESTONE = `${EXTENSION_ID}.milestoneView`;
export const VIEW_SPRINT = `${EXTENSION_ID}.sprintView`;
export const VIEW_TIME = `${EXTENSION_ID}.timeView`;

/** Configuration section key */
export const CONFIG_SECTION = EXTENSION_ID;

/** Configuration key names */
export const CFG_STORAGE_LOCATION = 'storageLocation';
export const CFG_MULTI_ROOT_STORAGE = 'multiRootStorage';
export const CFG_SHOW_STATUS_BAR = 'showStatusBar';
export const CFG_CODE_LENS_ENABLED = 'codeLensEnabled';
export const CFG_GIT_INTEGRATION = 'gitIntegration';
export const CFG_AUTHOR = 'author';
export const CFG_DEFAULT_ASSIGNEE = 'defaultAssignee';
export const CFG_STALE_DAYS = 'staleIssueDays';
export const CFG_DEFAULT_TYPE = 'defaultIssueType';
export const CFG_TREE_GROUP_BY = 'treeGroupBy';
export const CFG_SHOW_RESOLVED = 'showResolvedIssues';
export const CFG_DECORATIONS_ENABLED = 'decorationsEnabled';

/** Status bar priority (higher = further left) */
export const STATUS_BAR_PRIORITY = 100;

/** Tree item context values */
export const CTX_ISSUE = 'issue';
export const CTX_GROUP = 'group';
export const CTX_MILESTONE = 'milestone';
export const CTX_SPRINT = 'sprint';
export const CTX_TIME_ENTRY = 'timeEntry';

/** Maximum characters of a code snippet stored in a CodeLink */
export const CODE_LINK_SNIPPET_MAX = 200;

/** Debounce delay (ms) for decoration updates */
export const DECORATION_DEBOUNCE_MS = 300;

/** Refresh debounce (ms) for tree view updates */
export const TREE_REFRESH_DEBOUNCE_MS = 150;
