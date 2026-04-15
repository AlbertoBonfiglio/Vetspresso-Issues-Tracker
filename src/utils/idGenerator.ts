/**
 * Lightweight UUID v4 generator that works in all Node.js / VS Code environments
 * without requiring the `uuid` package.
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as crypto from 'crypto';

/**
 * Generates a cryptographically random UUID v4 string
 * in the canonical xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx format.
 */
export function generateId(): string {
    const bytes = crypto.randomBytes(16);

    // Set version bits (4) — high nibble of 7th byte = 0100
    bytes[6] = (bytes[6] & 0x0f) | 0x40;

    // Set variant bits (RFC 4122) — high 2 bits of 9th byte = 10
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = bytes.toString('hex');

    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32),
    ].join('-');
}

/**
 * Returns the current UTC timestamp as an ISO 8601 string.
 */
export function nowIso(): string {
    return new Date().toISOString();
}

/**
 * Returns today's date as an ISO 8601 date-only string (YYYY-MM-DD).
 */
export function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}
