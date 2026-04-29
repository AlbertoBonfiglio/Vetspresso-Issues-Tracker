# Contributing to Vetspresso Issues Tracker

Welcome, and thank you for your interest in contributing!

This document covers:

- [Contributing to Vetspresso Issues Tracker](#contributing-to-vetspresso-issues-tracker)
  - [Project Architecture](#project-architecture)
    - [Key Design Principles](#key-design-principles)
  - [Development Setup](#development-setup)
    - [Prerequisites](#prerequisites)
    - [Steps](#steps)
    - [Recommended VS Code Extensions](#recommended-vs-code-extensions)
  - [Running and Debugging](#running-and-debugging)
    - [Reload After Changes](#reload-after-changes)
    - [Logging](#logging)
  - [Running Tests](#running-tests)
    - [Test strategy](#test-strategy)
    - [Adding Tests](#adding-tests)
  - [Code Style](#code-style)
  - [Making Changes](#making-changes)
    - [Adding a New Issue Field](#adding-a-new-issue-field)
    - [Adding a New Command](#adding-a-new-command)
    - [Adding a New Storage Backend](#adding-a-new-storage-backend)
    - [Adding a New VCS Provider](#adding-a-new-vcs-provider)
  - [Submitting a Pull Request](#submitting-a-pull-request)
    - [PR Checklist](#pr-checklist)
  - [License](#license)

---

## Project Architecture

```text
vetspresso-issues/
├── src/
│   ├── constants.ts              ← All command IDs, config keys, view IDs
│   ├── extension.ts              ← activate() / deactivate() entry point
│   ├── types/
│   │   ├── issue.ts              ← All shared interfaces + enums
│   │   └── index.ts
│   ├── utils/
│   │   ├── idGenerator.ts        ← UUID v4 generator, nowIso(), todayIso()
│   │   ├── logger.ts             ← Structured output-channel logger
│   │   └── helpers.ts            ← Pure helper functions (no VS Code deps)
│   ├── storage/
│   │   ├── IStorageProvider.ts   ← Storage abstraction interface
│   │   ├── WorkspaceStorageProvider.ts  ← .vscode/issues/ implementation
│   │   ├── GlobalStorageProvider.ts     ← globalStorageUri implementation
│   │   └── StorageProviderFactory.ts    ← Provider builder (reads config)
│   ├── version/
│   │   ├── IVersionProvider.ts   ← VCS version abstraction interface
│   │   ├── GitVersionProvider.ts ← git extension API implementation
│   │   └── VersionProviderFactory.ts   ← Lazy caching factory
│   ├── database/
│   │   └── IssueDatabase.ts      ← In-memory cache + storage I/O + events
│   ├── services/
│   │   ├── IssueService.ts       ← Business logic: filter, stale, linking
│   │   ├── ChangelogService.ts   ← Changelog build + render
│   │   ├── ExportService.ts      ← JSON/CSV/MD/GitHub export + import
│   │   ├── SearchService.ts      ← Full-text search + ranked results
│   │   └── TemplateService.ts    ← Template CRUD + defaults mapping
│   ├── providers/
│   │   ├── IssueTreeProvider.ts         ← Main sidebar tree
│   │   ├── MilestoneTreeProvider.ts     ← Milestones view
│   │   ├── SprintTreeProvider.ts        ← Sprints view
│   │   ├── TimeTrackingProvider.ts      ← Time Tracking view
│   │   ├── IssueCodeLensProvider.ts     ← CodeLens above linked lines
│   │   ├── IssueDecorationProvider.ts   ← Gutter icon decorations
│   │   └── StatusBarProvider.ts         ← Status bar item
│   ├── panels/
│   │   ├── IssueDetailPanel.ts   ← Issue detail webview (singleton per issue)
│   │   └── DashboardPanel.ts     ← Aggregate stats webview (singleton)
│   └── commands/
│       ├── issueCommands.ts      ← All issue-related commands
│       ├── milestoneCommands.ts  ← Milestone + sprint commands
│       └── exportCommands.ts     ← Export, import, changelog commands
├── test/
│   └── suite/
│       ├── helpers.test.ts              ← Utils / helpers unit tests
│       ├── issueDatabase.test.ts        ← Database layer tests (memory stub)
│       ├── issueService.test.ts         ← Service layer tests
│       ├── searchService.test.ts        ← Search unit tests
│       ├── changelogService.test.ts     ← Changelog unit tests
│       ├── exportService.test.ts        ← Export/import unit tests
│       ├── templateService.test.ts      ← Template CRUD tests
│       ├── versionProvider.test.ts      ← Git version provider tests
│       ├── storageProvider.test.ts      ← Storage provider I/O tests
│       ├── storageProviderFactory.test.ts ← Provider factory tests
│       ├── providers.test.ts            ← Tree/CodeLens/StatusBar provider tests
│       ├── issueCommands.test.ts        ← Issue command tests
│       ├── milestoneCommands.test.ts    ← Milestone/sprint command tests
│       └── logger.test.ts               ← Logger unit tests
├── docs/
│   ├── HOW_TO_USE.md
│   └── CONTRIBUTING.md  ← This file
├── media/
│   └── icons/
│       └── sidebar.svg           ← Activity bar icon
├── package.json                  ← Extension manifest
├── tsconfig.json
├── esbuild.js                    ← Build script
└── .vscode/
    ├── launch.json               ← F5 debug configuration
    └── tasks.json                ← build task
```

### Key Design Principles

1. **No runtime npm dependencies** — only VS Code APIs and Node built-ins. This keeps the extension bundle tiny and avoids supply-chain risk.

2. **Layered architecture** — `extension.ts` wires together the layers but the layers don't know about each other except through stable interfaces:

   ```text
   commands / panels
        ↓
     services
        ↓
     database
        ↓
     storage providers   version providers
   ```

3. **`vscode.workspace.fs` throughout** — never use Node's `fs` module directly. This ensures the extension works in remote SSH, Codespaces, and WSL environments where the filesystem is not local.

4. **Testability by design** — `IStorageProvider` and `IVersionProvider` are interfaces with in-memory implementations used in tests. Services take the database as a constructor argument (constructor injection), making them trivially testable.

5. **Event-driven UI** — `IssueDatabase` emits `onIssueChanged` and `onMetaChanged` events. All tree providers and the status bar subscribe to these and refresh automatically. No polling.

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [VS Code](https://code.visualstudio.com/) ≥ 1.85.0
- Git

### Steps

```sh
# Clone the repo
git clone https://github.com/vetspresso/vetspresso-issues.git
cd vetspresso-issues

# Install dev dependencies
npm install

# Compile TypeScript
npm run compile
```

### Recommended VS Code Extensions

Install from `.vscode/extensions.json` (VS Code will prompt you):

- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)
- **TypeScript + Webpack Problem Matchers** (esbuild problem matcher)

---

## Running and Debugging

Press **F5** in VS Code to launch the **Extension Development Host** — a second VS Code window where the extension is active.

The launch configuration (`launch.json`) runs the esbuild watch task first, so TypeScript changes compile incrementally.

### Reload After Changes

In the Extension Development Host window, press `Ctrl+Shift+P` → **Developer: Reload Window** to pick up compiled changes.

### Logging

The extension writes to the **Vetspresso Issues** output channel. Open it via `View → Output` and select the channel.

Log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`. Set `vetspresso-issues.logLevel` in settings (not shipped in production builds) to change verbosity.

---

## Running Tests

```sh
# Run all tests
npm test

# Run tests in watch mode
npx vitest

# Run a specific test file
npx vitest run test/suite/helpers.test.ts
```

Tests run via **Vitest** — no VS Code binary or Extension Host is needed. The `vscode` module is mocked so all tests execute in a plain Node.js process, keeping the feedback loop fast.

### Test strategy

| Test file | What it covers | VS Code API needed? |
| --- | --- | --- |
| `helpers.test.ts` | Pure utility functions | No |
| `issueDatabase.test.ts` | Database CRUD + events | No (memory stub) |
| `issueService.test.ts` | Service business logic | No (memory stub) |
| `searchService.test.ts` | Full-text search + ranking | No (memory stub) |
| `changelogService.test.ts` | Changelog build + render | No (memory stub) |
| `exportService.test.ts` | All export formats + import | No (memory stub) |
| `templateService.test.ts` | Template CRUD + defaults | No (memory stub) |
| `versionProvider.test.ts` | Git API parsing + sorting | No (git ext stub) |
| `storageProvider.test.ts` | File I/O round-trips | Node fs shim (tmp dirs) |
| `storageProviderFactory.test.ts` | Provider builder + config | No (mocked config) |
| `providers.test.ts` | Tree/CodeLens/StatusBar providers | No (mocked vscode) |
| `issueCommands.test.ts` | Issue command handlers | No (mocked vscode) |
| `milestoneCommands.test.ts` | Milestone/sprint commands | No (mocked vscode) |
| `logger.test.ts` | Logger output + levels | No (mocked channel) |

All tests use in-memory or temporary-directory stubs. The `vscode` module is mocked via Vitest's module-mocking facility, so no real VS Code installation or Extension Host is needed.

### Adding Tests

1. Create a new file in `test/suite/` matching the `*.test.ts` glob
2. Use Vitest's `describe()` / `it()` / `beforeEach()` / `afterEach()` APIs
3. Import from `../../src/...` as needed
4. Mock the `vscode` module if the code under test imports it

---

## Code Style

- **TypeScript strict mode** — all settings in `tsconfig.json`, never use `any` unless absolutely necessary (and document why)
- **No barrel re-exports** in source modules (to help tree-shaking); only `src/types/index.ts` exports everything
- **Error messages in plain English**, lowercase, no trailing period, logged via `logger.error()`
- **Async/await** throughout — no raw promises or callbacks
- **Disposable registration** — every `register*` call returns a `Disposable` that is pushed to `context.subscriptions` in `extension.ts`
- **No `console.log`** in shipped code — use the `logger` utility

ESLint will catch most style issues. Run `npm run lint` before committing.

---

## Making Changes

### Adding a New Issue Field

1. Add the field to `Issue` in `src/types/issue.ts`
2. If optional, default it to `null` / `[]` in `IssueDatabase.createIssue()`
3. Update the webview HTML in `IssueDetailPanel.ts` to display/edit it
4. Update the CSV/Markdown export in `ExportService.ts` if it should be exported
5. Update the create wizard in `issueCommands.ts` if it should be collectable on creation
6. Add tests covering the new field

### Adding a New Command

1. Add the command ID to `src/constants.ts` under `COMMANDS`
2. Add the command contribution to `package.json` (`contributes.commands`)
3. Implement the command function in the appropriate `src/commands/*.ts` file
4. Register it in `extension.ts` via `vscode.commands.registerCommand` and push to `context.subscriptions`
5. Optionally add a keybinding, menu entry, or toolbar action in `package.json`

### Adding a New Storage Backend

1. Implement `IStorageProvider` in `src/storage/`
2. Register it in `StorageProviderFactory` based on a new config value
3. Add a test file with round-trip tests (following `storageProvider.test.ts`)

### Adding a New VCS Provider

1. Implement `IVersionProvider` in `src/version/`
2. Add it to the `ALL_PROVIDERS` array in `VersionProviderFactory`
3. The factory selects the first provider for which `isAvailable(folder)` returns `true`, so order the array by preference

---

## Submitting a Pull Request

1. **Fork** the repository and create a branch: `git checkout -b feature/my-change`
2. **Make your changes** following the code style guidelines above
3. **Write tests** for new functionality
4. **Run the test suite**: `npm test` must pass
5. **Run linting**: `npm run lint` must produce no errors
6. **Update documentation** if you added a feature (`docs/HOW_TO_USE.md`, `README.md`)
7. **Update `CHANGELOG.md`** under `[Unreleased]`
8. **Submit a PR** to the `main` branch with a clear description of what was changed and why

### PR Checklist

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] New functionality has tests
- [ ] `CHANGELOG.md` updated
- [ ] Documentation updated (if applicable)
- [ ] No runtime dependencies added

---

## License

By contributing, you agree that your contributions will be licensed under the same **AGPL-3.0-only** license as the rest of the project, as defined in the [LICENSE](../LICENSE) file.
