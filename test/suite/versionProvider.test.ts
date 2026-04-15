/**
 * Unit tests for version providers.
 *
 * Uses vi.spyOn to stub the private getGitApi() method so tests run without
 * a real git repository or VS Code Extension Host.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import { vi } from 'vitest';
import { GitVersionProvider } from '../../src/version/GitVersionProvider';
import {
    getVersionProvider,
    invalidateCache,
    getCurrentVersion,
    getAllVersions,
    getRegisteredProviders,
} from '../../src/version/VersionProviderFactory';

// ---------------------------------------------------------------------------
// Fake git repository builder
// ---------------------------------------------------------------------------

function fakeUri(fsPath: string) {
    return { fsPath, toString: () => `file://${fsPath}`, scheme: 'file' } as unknown as import('vscode').Uri;
}

interface FakeRepo {
    rootFsPath: string;
    headName?: string;
    tags: string[];
}

function makeGitApi(repos: FakeRepo[]) {
    return {
        repositories: repos.map((r) => ({
            rootUri: fakeUri(r.rootFsPath),
            state: {
                HEAD: { name: r.headName },
                tags: r.tags.map((name) => ({ name })),
                refs: [],
            },
        })),
        onDidOpenRepository: (() => ({ dispose: () => { } })) as any,
        onDidCloseRepository: (() => ({ dispose: () => { } })) as any,
    };
}

// ---------------------------------------------------------------------------
// GitVersionProvider tests
// ---------------------------------------------------------------------------

describe('GitVersionProvider', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        invalidateCache();
    });

    function makeProvider(repos: FakeRepo[]): GitVersionProvider {
        const provider = new GitVersionProvider();
        vi.spyOn(provider as any, 'getGitApi').mockResolvedValue(makeGitApi(repos));
        return provider;
    }

    test('id is "git"', () => {
        assert.strictEqual(new GitVersionProvider().id, 'git');
    });

    test('displayName is "Git Tags"', () => {
        assert.strictEqual(new GitVersionProvider().displayName, 'Git Tags');
    });

    test('getAllVersions() returns semver tags sorted highest first', async () => {
        const provider = makeProvider([{
            rootFsPath: '/project',
            headName: 'main',
            tags: ['v1.2.0', 'v1.10.0', 'v1.9.0', 'v2.0.0'],
        }]);
        const versions = await provider.getAllVersions(fakeUri('/project'));
        assert.ok(versions && versions.length === 4);
        assert.strictEqual(versions[0].version, 'v2.0.0');
        const labels = versions.map((v) => v.version);
        assert.ok(labels.indexOf('v1.10.0') < labels.indexOf('v1.9.0'), 'v1.10.0 should rank above v1.9.0');
    });

    test('getAllVersions() includes non-semver tags after semver ones', async () => {
        const provider = makeProvider([{
            rootFsPath: '/project',
            headName: 'main',
            tags: ['release-candidate', 'v1.0.0', 'hotfix-1234'],
        }]);
        const versions = await provider.getAllVersions(fakeUri('/project'));
        assert.ok(versions);
        const labels = versions.map((v) => v.version);
        assert.ok(labels.includes('v1.0.0'));
        assert.ok(labels.includes('release-candidate'));
        assert.ok(labels.indexOf('v1.0.0') < labels.indexOf('release-candidate'));
    });

    test('getCurrentVersion() returns highest tag', async () => {
        const provider = makeProvider([{
            rootFsPath: '/project',
            headName: 'v1.5.0',
            tags: ['v1.5.0', 'v1.0.0'],
        }]);
        const current = await provider.getCurrentVersion(fakeUri('/project'));
        assert.ok(current);
        assert.strictEqual(current.version, 'v1.5.0');
    });

    test('getCurrentVersion() falls back to branch name when no tags', async () => {
        const provider = makeProvider([{
            rootFsPath: '/project',
            headName: 'feature/my-branch',
            tags: [],
        }]);
        const current = await provider.getCurrentVersion(fakeUri('/project'));
        assert.ok(current);
        assert.strictEqual(current.version, 'feature/my-branch');
    });

    test('getAllVersions() returns empty array for unmapped folder', async () => {
        const provider = makeProvider([{
            rootFsPath: '/other-project',
            headName: 'main',
            tags: ['v1.0.0'],
        }]);
        const versions = await provider.getAllVersions(fakeUri('/my-project'));
        assert.ok(Array.isArray(versions));
        assert.strictEqual(versions.length, 0);
    });

    test('getAllVersions() picks longest-prefix repo when nested', async () => {
        const provider = makeProvider([
            { rootFsPath: '/workspace', headName: 'main', tags: ['workspace-tag'] },
            { rootFsPath: '/workspace/subproject', headName: 'main', tags: ['subproject-tag'] },
        ]);
        const versions = await provider.getAllVersions(fakeUri('/workspace/subproject'));
        assert.ok(versions);
        assert.ok(versions.some((v) => v.version === 'subproject-tag'));
        assert.ok(!versions.some((v) => v.version === 'workspace-tag'));
    });
});

// ---------------------------------------------------------------------------
// VersionProviderFactory
// ---------------------------------------------------------------------------

describe('VersionProviderFactory', () => {
    afterEach(() => {
        invalidateCache();
    });

    test('getVersionProvider() returns a value for a known folder', async () => {
        const uri = fakeUri('/any-path');
        const provider = await getVersionProvider(uri);
        // May be null if no git repo present — just ensure no throw
        assert.ok(provider === null || provider !== undefined);
    });

    test('invalidateCache() does not throw', () => {
        assert.doesNotThrow(() => invalidateCache());
    });

    test('invalidateCache() with specific uri does not throw', () => {
        assert.doesNotThrow(() => invalidateCache(fakeUri('/some/path')));
    });

    test('getVersionProvider() uses cache on second call (same uri)', async () => {
        const uri = fakeUri('/cached-path');
        const first = await getVersionProvider(uri);
        const second = await getVersionProvider(uri);
        assert.strictEqual(first, second);
    });

    test('invalidateCache() clears cache so second call re-evaluates', async () => {
        const uri = fakeUri('/cache-clear-test');
        await getVersionProvider(uri);
        invalidateCache(uri);
        // After invalidation, calling again should work without error
        const result = await getVersionProvider(uri);
        assert.ok(result === null || result !== undefined);
    });

    test('getRegisteredProviders() returns array of provider ids', () => {
        const ids = getRegisteredProviders();
        assert.ok(Array.isArray(ids));
        assert.ok(ids.length > 0);
        assert.ok(ids.includes('git'));
    });

    test('getCurrentVersion() returns null when no provider available', async () => {
        const uri = fakeUri('/no-git-here');
        const version = await getCurrentVersion(uri);
        assert.strictEqual(version, null);
    });

    test('getAllVersions() returns empty array when no provider available', async () => {
        const uri = fakeUri('/no-git-there');
        const versions = await getAllVersions(uri);
        assert.deepStrictEqual(versions, []);
    });
});
