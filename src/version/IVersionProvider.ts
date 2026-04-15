/**
 * Version provider abstraction.
 * Implementations resolve the "current version" of a project using whatever
 * version-control or build-system mechanism is appropriate.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

/**
 * A resolved version with metadata.
 */
export interface ResolvedVersion {
    /** The version string (e.g. "v1.4.2", "2.0.0-rc1"). */
    version: string;
    /**
     * The human-readable source label (e.g. "git tag", "package.json",
     * "AssemblyInfo.cs").
     */
    source: string;
    /** Optional ISO 8601 date when this version was tagged / published. */
    tagDate?: string;
}

/**
 * Contract that every version provider must satisfy.
 * Add new implementations (SVN, Mercurial, Gradle, etc.) without touching
 * the rest of the extension.
 */
export interface IVersionProvider {
    /**
     * Unique identifier for this provider (lowercase, hyphen-separated).
     * e.g. "git", "mercurial", "package-json"
     */
    readonly id: string;

    /**
     * Human-readable name displayed in the UI.
     * e.g. "Git Tags"
     */
    readonly displayName: string;

    /**
     * Returns `true` if this provider can supply version information for the
     * given workspace folder URI.  Used to auto-select the best provider.
     */
    isAvailable(workspaceFolderUri: import('vscode').Uri): Promise<boolean>;

    /**
     * Returns the current/latest version for the given workspace folder.
     * Returns `null` if no version information could be determined.
     */
    getCurrentVersion(workspaceFolderUri: import('vscode').Uri): Promise<ResolvedVersion | null>;

    /**
     * Returns all known version tags/releases for the given workspace folder,
     * sorted descending (newest first).
     */
    getAllVersions(workspaceFolderUri: import('vscode').Uri): Promise<ResolvedVersion[]>;
}
