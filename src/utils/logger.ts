/**
 * Structured logger that routes to the VS Code output channel.
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as vscode from 'vscode';
import { EXTENSION_DISPLAY_NAME } from '../constants';

/** Supported log severity levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Singleton output channel used by the logger. */
let outputChannel: vscode.OutputChannel | undefined;

/** Active log level; messages below this level are suppressed. */
let activeLevel: LogLevel = 'info';

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

/**
 * Initialises the logger.  Call once from `activate()`.
 */
export function initLogger(channel: vscode.OutputChannel, level: LogLevel = 'info'): void {
    outputChannel = channel;
    activeLevel = level;
}

/**
 * Sets the minimum log level at runtime.
 */
export function setLogLevel(level: LogLevel): void {
    activeLevel = level;
}

/**
 * Disposes the output channel.  Call from `deactivate()`.
 */
export function disposeLogger(): void {
    outputChannel?.dispose();
    outputChannel = undefined;
}

function write(level: LogLevel, message: string, error?: unknown): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel]) {
        return;
    }

    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${EXTENSION_DISPLAY_NAME}:`;
    const errDetail = error instanceof Error
        ? (error.stack ?? error.message)
        : JSON.stringify(error);
    const line = error
        ? `${prefix} ${message} — ${errDetail}`
        : `${prefix} ${message}`;

    // Always write to the output channel when available
    outputChannel?.appendLine(line);

    // Mirror errors to the developer console in development builds
    if (level === 'error') {
        console.error(line);
    } else if (level === 'warn') {
        console.warn(line);
    }
}

/** Logs a debug message (suppressed by default). */
export function debug(message: string): void {
    write('debug', message);
}

/** Logs an informational message. */
export function info(message: string): void {
    write('info', message);
}

/** Logs a warning message. */
export function warn(message: string, error?: unknown): void {
    write('warn', message, error);
}

/** Logs an error message and optionally the associated Error object. */
export function error(message: string, err?: unknown): void {
    write('error', message, err);
}

/**
 * Shows a VS Code error notification and logs the error simultaneously.
 */
export function showError(message: string, err?: unknown): void {
    error(message, err);
    void vscode.window.showErrorMessage(`${EXTENSION_DISPLAY_NAME}: ${message}`);
}

/**
 * Shows a VS Code warning notification and logs it simultaneously.
 */
export function showWarning(message: string): void {
    warn(message);
    void vscode.window.showWarningMessage(`${EXTENSION_DISPLAY_NAME}: ${message}`);
}

/**
 * Shows a VS Code info notification and logs it simultaneously.
 */
export function showInfo(message: string): void {
    info(message);
    void vscode.window.showInformationMessage(`${EXTENSION_DISPLAY_NAME}: ${message}`);
}
