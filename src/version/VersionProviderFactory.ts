/**
 * Selects and caches the best IVersionProvider for a given workspace folder.
 * New providers (Mercurial, SVN, …) need only be registered here.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { IVersionProvider, ResolvedVersion } from './IVersionProvider';
import { GitVersionProvider } from './GitVersionProvider';
import * as logger from '../utils/logger';

/** All providers in priority order (highest priority first). */
const ALL_PROVIDERS: IVersionProvider[] = [
    new GitVersionProvider(),
    // Future: new MercurialVersionProvider(),
    // Future: new PackageJsonVersionProvider(),
];

/** Cache: workspace folder path → provider (or null if none available). */
const providerCache = new Map<string, IVersionProvider | null>();

/**
 * Returns the most appropriate version provider for the given workspace folder,
 * or `null` if no provider is available.
 *
 * Result is cached per folder for the lifetime of the extension session.
 */
export async function getVersionProvider(
    workspaceFolderUri: vscode.Uri
): Promise<IVersionProvider | null> {
    const key = workspaceFolderUri.toString();
    if (providerCache.has(key)) {
        return providerCache.get(key) ?? null;
    }

    for (const provider of ALL_PROVIDERS) {
        try {
            if (await provider.isAvailable(workspaceFolderUri)) {
                logger.debug(`Version provider '${provider.id}' selected for ${workspaceFolderUri.fsPath}`);
                providerCache.set(key, provider);
                return provider;
            }
        } catch (err) {
            logger.warn(`Version provider '${provider.id}' threw during isAvailable()`, err);
        }
    }

    logger.debug(`No version provider available for ${workspaceFolderUri.fsPath}`);
    providerCache.set(key, null);
    return null;
}

/**
 * Invalidates the provider cache entry for the given folder (e.g. when a
 * workspace folder is added or removed).
 */
export function invalidateCache(workspaceFolderUri?: vscode.Uri): void {
    if (workspaceFolderUri) {
        providerCache.delete(workspaceFolderUri.toString());
    } else {
        providerCache.clear();
    }
}

/**
 * Convenience wrapper: returns the current version string for a workspace
 * folder, or `null` if unavailable.
 */
export async function getCurrentVersion(
    workspaceFolderUri: vscode.Uri
): Promise<ResolvedVersion | null> {
    const provider = await getVersionProvider(workspaceFolderUri);
    if (!provider) {
        return null;
    }
    try {
        return await provider.getCurrentVersion(workspaceFolderUri);
    } catch (err) {
        logger.warn(`getCurrentVersion() failed for provider '${provider.id}'`, err);
        return null;
    }
}

/**
 * Convenience wrapper: returns all versions for a workspace folder.
 */
export async function getAllVersions(
    workspaceFolderUri: vscode.Uri
): Promise<ResolvedVersion[]> {
    const provider = await getVersionProvider(workspaceFolderUri);
    if (!provider) {
        return [];
    }
    try {
        return await provider.getAllVersions(workspaceFolderUri);
    } catch (err) {
        logger.warn(`getAllVersions() failed for provider '${provider.id}'`, err);
        return [];
    }
}

/**
 * Returns all registered provider IDs (for diagnostics / settings UI).
 */
export function getRegisteredProviders(): string[] {
    return ALL_PROVIDERS.map((p) => p.id);
}
