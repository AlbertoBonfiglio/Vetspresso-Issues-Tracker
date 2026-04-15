/**
 * Factory that builds the correct IStorageProvider instances based on user
 * configuration and workspace structure.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { IStorageProvider } from './IStorageProvider';
import { WorkspaceStorageProvider } from './WorkspaceStorageProvider';
import { GlobalStorageProvider } from './GlobalStorageProvider';
import {
    CONFIG_SECTION,
    CFG_STORAGE_LOCATION,
    CFG_MULTI_ROOT_STORAGE,
} from '../constants';
import { StorageLocation, MultiRootStorage } from '../types';

/**
 * Builds one or more `IStorageProvider` instances based on the extension
 * configuration and the open workspace folders.
 *
 * Returns an array whose length equals the number of logical stores:
 * - Single-root, any location → one store.
 * - Multi-root, `shared` mode → one store (first folder for workspace mode).
 * - Multi-root, `perFolder` mode → one store per workspace folder.
 *
 * @param globalStorageUri - `ExtensionContext.globalStorageUri` from VS Code.
 */
export function buildStorageProviders(
    globalStorageUri: vscode.Uri
): IStorageProvider[] {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const location = config.get<StorageLocation>(CFG_STORAGE_LOCATION, 'workspace');
    const multiRoot = config.get<MultiRootStorage>(CFG_MULTI_ROOT_STORAGE, 'shared');

    const folders = vscode.workspace.workspaceFolders ?? [];

    if (location === 'global') {
        return buildGlobalProviders(globalStorageUri, folders, multiRoot);
    }

    return buildWorkspaceProviders(globalStorageUri, folders, multiRoot);
}

function buildWorkspaceProviders(
    globalStorageUri: vscode.Uri,
    folders: readonly vscode.WorkspaceFolder[],
    multiRoot: MultiRootStorage
): IStorageProvider[] {
    if (folders.length === 0) {
        // No workspace folder open; fall back to global storage
        return [new GlobalStorageProvider(globalStorageUri, 'no-workspace')];
    }

    if (multiRoot === 'shared' || folders.length === 1) {
        // Use the first (or only) workspace folder as the primary store
        return [new WorkspaceStorageProvider(folders[0].uri)];
    }

    // perFolder: one workspace provider per folder
    return folders.map((f) => new WorkspaceStorageProvider(f.uri));
}

function buildGlobalProviders(
    globalStorageUri: vscode.Uri,
    folders: readonly vscode.WorkspaceFolder[],
    multiRoot: MultiRootStorage
): IStorageProvider[] {
    if (folders.length === 0) {
        return [new GlobalStorageProvider(globalStorageUri, 'no-workspace')];
    }

    if (multiRoot === 'shared' || folders.length === 1) {
        const key = workspaceKey(folders[0]);
        return [new GlobalStorageProvider(globalStorageUri, key)];
    }

    return folders.map(
        (f) => new GlobalStorageProvider(globalStorageUri, workspaceKey(f))
    );
}

/**
 * Derives a stable 16-char namespace key from the workspace folder URI.
 * Uses the folder name when it is unique enough; falls back to a short hash
 * of the full URI path to avoid collisions.
 */
function workspaceKey(folder: vscode.WorkspaceFolder): string {
    const hash = crypto
        .createHash('sha256')
        .update(folder.uri.toString())
        .digest('hex')
        .slice(0, 8);
    const safeName = folder.name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24);
    return `${safeName}_${hash}`;
}
