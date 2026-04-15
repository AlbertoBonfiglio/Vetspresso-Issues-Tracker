/**
 * Unit tests for StorageProviderFactory.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { buildStorageProviders } from '../../src/storage/StorageProviderFactory';
import { WorkspaceStorageProvider } from '../../src/storage/WorkspaceStorageProvider';
import { GlobalStorageProvider } from '../../src/storage/GlobalStorageProvider';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUri(fsPath: string): vscode.Uri {
    return { fsPath, toString: () => `file://${fsPath}`, scheme: 'file' } as unknown as vscode.Uri;
}

function makeFolder(name: string, fsPath: string, index = 0): vscode.WorkspaceFolder {
    return { uri: makeUri(fsPath), name, index } as vscode.WorkspaceFolder;
}

const globalStorageUri = makeUri('/global-storage');

// Helper to set workspaceFolders on the mock (it's read-only in the real type)
function setFolders(folders: vscode.WorkspaceFolder[] | undefined): void {
    (vscode.workspace as { workspaceFolders: vscode.WorkspaceFolder[] | undefined }).workspaceFolders = folders;
}

// Helper to temporarily override workspace configuration
function withConfig(overrides: Record<string, unknown>, cb: () => void) {
    const original = vscode.workspace.getConfiguration;
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (_section?: string) => ({
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            if (key in overrides) { return overrides[key] as unknown as T; }
            return defaultValue;
        },
        has: () => false,
        update: async () => { },
        inspect: () => undefined,
    });
    try {
        cb();
    } finally {
        (vscode.workspace as { getConfiguration: unknown }).getConfiguration = original;
    }
}

// ---------------------------------------------------------------------------
// Helpers to set workspace state
// ---------------------------------------------------------------------------

beforeEach(() => {
    setFolders(undefined);
});

afterEach(() => {
    setFolders(undefined);
});

// ===========================================================================
// buildStorageProviders — workspace location (default)
// ===========================================================================

describe('buildStorageProviders (workspace location)', () => {

    test('returns GlobalStorageProvider when no workspace folders and location=global (default)', () => {
        setFolders([]);
        const providers = buildStorageProviders(globalStorageUri);
        assert.strictEqual(providers.length, 1);
        assert.ok(providers[0] instanceof GlobalStorageProvider);
    });

    test('returns GlobalStorageProvider when workspaceFolders is undefined', () => {
        setFolders(undefined);
        const providers = buildStorageProviders(globalStorageUri);
        assert.strictEqual(providers.length, 1);
        assert.ok(providers[0] instanceof GlobalStorageProvider);
    });

    test('returns WorkspaceStorageProvider for single folder with default location', () => {
        setFolders([makeFolder('my-project', '/home/user/my-project')]);
        const providers = buildStorageProviders(globalStorageUri);
        assert.strictEqual(providers.length, 1);
        assert.ok(providers[0] instanceof WorkspaceStorageProvider);
    });

    test('returns single WorkspaceStorageProvider for multi-root with shared mode (default)', () => {
        setFolders([
            makeFolder('project-a', '/home/user/project-a', 0),
            makeFolder('project-b', '/home/user/project-b', 1),
        ]);
        const providers = buildStorageProviders(globalStorageUri);
        assert.strictEqual(providers.length, 1);
        assert.ok(providers[0] instanceof WorkspaceStorageProvider);
    });

    test('returns one provider per folder for multi-root with perFolder mode', () => {
        setFolders([
            makeFolder('proj-a', '/home/user/proj-a', 0),
            makeFolder('proj-b', '/home/user/proj-b', 1),
        ]);
        withConfig({ storageLocation: 'workspace', multiRootStorage: 'perFolder' }, () => {
            const providers = buildStorageProviders(globalStorageUri);
            assert.strictEqual(providers.length, 2);
            assert.ok(providers[0] instanceof WorkspaceStorageProvider);
            assert.ok(providers[1] instanceof WorkspaceStorageProvider);
        });
    });
});

// ===========================================================================
// buildStorageProviders — global location
// ===========================================================================

describe('buildStorageProviders (global location)', () => {

    test('returns GlobalStorageProvider when location=global and no folders', () => {
        setFolders([]);
        withConfig({ storageLocation: 'global' }, () => {
            const providers = buildStorageProviders(globalStorageUri);
            assert.strictEqual(providers.length, 1);
            assert.ok(providers[0] instanceof GlobalStorageProvider);
        });
    });

    test('returns GlobalStorageProvider for single folder with global location', () => {
        setFolders([makeFolder('my-proj', '/home/user/my-proj')]);
        withConfig({ storageLocation: 'global' }, () => {
            const providers = buildStorageProviders(globalStorageUri);
            assert.strictEqual(providers.length, 1);
            assert.ok(providers[0] instanceof GlobalStorageProvider);
        });
    });

    test('returns single GlobalStorageProvider for multi-root global shared', () => {
        setFolders([
            makeFolder('proj-a', '/home/user/proj-a', 0),
            makeFolder('proj-b', '/home/user/proj-b', 1),
        ]);
        withConfig({ storageLocation: 'global', multiRootStorage: 'shared' }, () => {
            const providers = buildStorageProviders(globalStorageUri);
            assert.strictEqual(providers.length, 1);
            assert.ok(providers[0] instanceof GlobalStorageProvider);
        });
    });

    test('returns one GlobalStorageProvider per folder for multi-root global perFolder', () => {
        setFolders([
            makeFolder('proj-a', '/home/user/proj-a', 0),
            makeFolder('proj-b', '/home/user/proj-b', 1),
        ]);
        withConfig({ storageLocation: 'global', multiRootStorage: 'perFolder' }, () => {
            const providers = buildStorageProviders(globalStorageUri);
            assert.strictEqual(providers.length, 2);
            assert.ok(providers[0] instanceof GlobalStorageProvider);
            assert.ok(providers[1] instanceof GlobalStorageProvider);
        });
    });

    test('providers from different folders have different labels', () => {
        setFolders([
            makeFolder('proj-a', '/home/user/proj-a', 0),
            makeFolder('proj-b', '/home/user/proj-b', 1),
        ]);
        withConfig({ storageLocation: 'global', multiRootStorage: 'perFolder' }, () => {
            const providers = buildStorageProviders(globalStorageUri);
            assert.notStrictEqual(providers[0].label, providers[1].label);
        });
    });
});

// ===========================================================================
// WorkspaceStorageProvider
// ===========================================================================

describe('WorkspaceStorageProvider', () => {
    test('has a non-empty label', () => {
        const uri = makeUri('/home/user/project');
        const provider = new WorkspaceStorageProvider(uri);
        assert.ok(typeof provider.label === 'string');
        assert.ok(provider.label.length > 0);
    });

    test('getRootUri returns a uri containing the workspace path', () => {
        const uri = makeUri('/home/user/project');
        const provider = new WorkspaceStorageProvider(uri);
        const rootUri = provider.getRootUri();
        assert.ok(rootUri.fsPath.startsWith('/home/user/project'));
    });
});

// ===========================================================================
// GlobalStorageProvider
// ===========================================================================

describe('GlobalStorageProvider', () => {
    test('has a non-empty label', () => {
        const provider = new GlobalStorageProvider(globalStorageUri, 'test-namespace');
        assert.ok(typeof provider.label === 'string');
        assert.ok(provider.label.length > 0);
    });

    test('getRootUri returns a uri derived from globalStorageUri and namespace', () => {
        const provider = new GlobalStorageProvider(globalStorageUri, 'my-ns');
        const root = provider.getRootUri();
        assert.ok(root.fsPath.includes('my-ns') || root.fsPath.includes('/global-storage'));
    });

    test('two providers with different namespaces have different root URIs', () => {
        const p1 = new GlobalStorageProvider(globalStorageUri, 'ns-1');
        const p2 = new GlobalStorageProvider(globalStorageUri, 'ns-2');
        assert.notStrictEqual(p1.getRootUri().fsPath, p2.getRootUri().fsPath);
    });
});
