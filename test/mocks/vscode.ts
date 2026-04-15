/**
 * Minimal VS Code API mock for Vitest unit tests.
 *
 * Only the APIs actually used by the source modules under test are
 * implemented.  Everything else is a no-op stub so that module-level
 * `import * as vscode from 'vscode'` statements resolve without errors
 * when running outside the Extension Host.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as fsp from 'fs/promises';
import * as nodePath from 'path';

// ---------------------------------------------------------------------------
// FileSystemError
// ---------------------------------------------------------------------------

export class FileSystemError extends Error {
    readonly code: string;

    constructor(messageOrCode?: string) {
        super(messageOrCode ?? '');
        this.code = messageOrCode ?? '';
    }

    static FileNotFound(_messageOrUri?: string): FileSystemError {
        return new FileSystemError('FileNotFound');
    }

    static NoPermissions(_messageOrUri?: string): FileSystemError {
        return new FileSystemError('NoPermissions');
    }

    static Unavailable(_messageOrUri?: string): FileSystemError {
        return new FileSystemError('Unavailable');
    }
}

// ---------------------------------------------------------------------------
// FileType
// ---------------------------------------------------------------------------

export enum FileType { Unknown = 0, File = 1, Directory = 2, SymbolicLink = 64 }

// ---------------------------------------------------------------------------
// EventEmitter
// ---------------------------------------------------------------------------

type Listener<T> = (e: T) => void;
interface Disposable { dispose(): void; }

export class EventEmitter<T> {
    private listeners: Listener<T>[] = [];

    readonly event = (listener: Listener<T>): Disposable => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                this.listeners = this.listeners.filter((l) => l !== listener);
            },
        };
    };

    fire(e: T): void {
        for (const l of this.listeners) {
            l(e);
        }
    }

    dispose(): void {
        this.listeners = [];
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Event<T> = (listener: (e: T) => any, thisArgs?: any, disposables?: Disposable[]) => Disposable;

// ---------------------------------------------------------------------------
// Uri
// ---------------------------------------------------------------------------

export class Uri {
    readonly scheme = 'file';

    constructor(readonly fsPath: string) { }

    static file(p: string): Uri {
        return new Uri(p);
    }

    static joinPath(base: Uri, ...parts: string[]): Uri {
        const joined = [base.fsPath, ...parts].join('/').replace(/\/+/g, '/');
        return new Uri(joined);
    }

    toString(): string {
        return `file://${this.fsPath}`;
    }

    with(change: { scheme?: string; path?: string }): Uri {
        return new Uri(change.path ?? this.fsPath);
    }
}

// ---------------------------------------------------------------------------
// workspace
// ---------------------------------------------------------------------------

export const workspace = {
    fs: {
        async readFile(uri: Uri): Promise<Uint8Array> {
            try {
                const buf = await fsp.readFile(uri.fsPath);
                return new Uint8Array(buf);
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                    throw new FileSystemError('FileNotFound');
                }
                throw err;
            }
        },
        async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
            await fsp.mkdir(nodePath.dirname(uri.fsPath), { recursive: true });
            await fsp.writeFile(uri.fsPath, content);
        },
        async readDirectory(uri: Uri): Promise<[string, number][]> {
            try {
                const entries = await fsp.readdir(uri.fsPath, { withFileTypes: true });
                return entries.map((e) => [e.name, e.isDirectory() ? 2 : 1] as [string, number]);
            } catch {
                return [];
            }
        },
        async createDirectory(uri: Uri): Promise<void> {
            await fsp.mkdir(uri.fsPath, { recursive: true });
        },
        async delete(uri: Uri, _opts?: { recursive?: boolean; useTrash?: boolean }): Promise<void> {
            try {
                await fsp.rm(uri.fsPath, { recursive: true, force: true });
            } catch {
                // ignore
            }
        },
        async stat(uri: Uri): Promise<{ type: number; size: number; ctime: number; mtime: number }> {
            try {
                const stat = await fsp.stat(uri.fsPath);
                return { type: stat.isDirectory() ? 2 : 1, size: stat.size, ctime: stat.ctimeMs, mtime: stat.mtimeMs };
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                    throw new FileSystemError('FileNotFound');
                }
                throw err;
            }
        },
    },
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
        has: (_key: string): boolean => false,
        update: async (): Promise<void> => { },
        inspect: () => undefined,
    }),
    getWorkspaceFolder: (_uri: Uri): undefined => undefined,
    workspaceFolders: undefined as { uri: Uri; name: string; index: number }[] | undefined,
    onDidChangeWorkspaceFolders: new EventEmitter<unknown>().event,
    onDidChangeConfiguration: new EventEmitter<{ affectsConfiguration(section: string): boolean }>().event,
    onDidChangeTextDocument: new EventEmitter<{ document: unknown }>().event,
};

// ---------------------------------------------------------------------------
// window
// ---------------------------------------------------------------------------

export const window = {
    showErrorMessage: async (..._args: unknown[]): Promise<undefined> => undefined,
    showWarningMessage: async (..._args: unknown[]): Promise<undefined> => undefined,
    showInformationMessage: async (..._args: unknown[]): Promise<undefined> => undefined,
    showInputBox: async (): Promise<undefined> => undefined,
    showQuickPick: async (): Promise<undefined> => undefined,
    activeTextEditor: undefined as unknown,
    onDidChangeActiveTextEditor: new EventEmitter<unknown>().event,
    createStatusBarItem: (..._args: unknown[]) => ({
        command: undefined as string | undefined,
        name: undefined as string | undefined,
        text: '',
        tooltip: undefined as unknown,
        backgroundColor: undefined as unknown,
        show: (): void => { },
        hide: (): void => { },
        dispose: (): void => { },
    }),
    createTextEditorDecorationType: (_options: unknown) => ({
        key: 'mock-decoration',
        dispose: (): void => { },
    }),
    createOutputChannel: (_name: string) => ({
        appendLine: (_msg: string): void => { },
        append: (_msg: string): void => { },
        show: (): void => { },
        dispose: (): void => { },
    }),
};

// ---------------------------------------------------------------------------
// extensions
// ---------------------------------------------------------------------------

export const extensions = {
    getExtension: (_id: string): undefined => undefined,
};

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

export const commands = {
    registerCommand: (_id: string, _handler: unknown): Disposable => ({ dispose: () => { } }),
    executeCommand: async (_id: string, ..._args: unknown[]): Promise<undefined> => undefined,
};

// ---------------------------------------------------------------------------
// Enums / constants
// ---------------------------------------------------------------------------

export enum StatusBarAlignment { Left = 1, Right = 2 }

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;

export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }

export class TreeItem {
    constructor(
        public label: string,
        public collapsibleState?: TreeItemCollapsibleState,
    ) { }
}

export class ThemeIcon {
    constructor(public id: string) { }
}

export class ThemeColor {
    constructor(public readonly id: string) { }
}

export class MarkdownString {
    value = '';
    supportHtml = false;
    constructor(value = '') { this.value = value; }
    appendMarkdown(s: string) { this.value += s; return this; }
}

export enum OverviewRulerLane { Left = 1, Center = 2, Right = 4, Full = 7 }

export class Position {
    constructor(public readonly line: number, public readonly character: number) { }
}

export class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(startLineOrPosition: number | Position, startCharOrPosition: number | Position, endLine?: number, endChar?: number) {
        if (typeof startLineOrPosition === 'number') {
            this.start = new Position(startLineOrPosition, startCharOrPosition as number);
            this.end = new Position(endLine ?? startLineOrPosition, endChar ?? 0);
        } else {
            this.start = startLineOrPosition;
            this.end = startCharOrPosition as Position;
        }
    }
}

export class CodeLens {
    constructor(
        public range: Range,
        public command?: { title: string; command: string; arguments?: unknown[] }
    ) { }
}
