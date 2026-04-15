/**
 * Unit tests for the logger module.
 *
 * © 2024 Vetspresso — Alberto L. Bonfiglio
 * AGPL-3.0-only
 */

import * as assert from 'assert';
import * as logger from '../../src/utils/logger';

// ---------------------------------------------------------------------------
// Minimal output channel stub
// ---------------------------------------------------------------------------

class MockChannel {
    readonly lines: string[] = [];
    appendLine(msg: string): void { this.lines.push(msg); }
    append(_msg: string): void { /* no-op */ }
    show(): void { /* no-op */ }
    dispose(): void { /* no-op */ }
}

describe('logger', () => {

    // -----------------------------------------------------------------------
    // initLogger / setLogLevel / disposeLogger
    // -----------------------------------------------------------------------

    test('initLogger and disposeLogger do not throw', () => {
        const ch = new MockChannel();
        assert.doesNotThrow(() => logger.initLogger(ch as never, 'debug'));
        assert.doesNotThrow(() => logger.disposeLogger());
    });

    test('debug message is written when level=debug', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'debug');
        logger.debug('debug message');
        assert.ok(ch.lines.some((l) => l.includes('debug message')));
        logger.disposeLogger();
    });

    test('debug message is suppressed when level=info (default)', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'info');
        logger.debug('should be hidden');
        assert.strictEqual(ch.lines.filter((l) => l.includes('should be hidden')).length, 0);
        logger.disposeLogger();
    });

    test('info message is written at level=info', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'info');
        logger.info('info message');
        assert.ok(ch.lines.some((l) => l.includes('info message')));
        logger.disposeLogger();
    });

    test('info message is suppressed when level=warn', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'warn');
        logger.info('hidden info');
        assert.strictEqual(ch.lines.filter((l) => l.includes('hidden info')).length, 0);
        logger.disposeLogger();
    });

    test('warn message is written at level=warn', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'warn');
        logger.warn('warn message');
        assert.ok(ch.lines.some((l) => l.includes('warn message')));
        logger.disposeLogger();
    });

    test('error message is written at any level', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'error');
        logger.error('error message');
        assert.ok(ch.lines.some((l) => l.includes('error message')));
        logger.disposeLogger();
    });

    test('warn with Error object includes error detail', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'debug');
        const err = new Error('boom');
        logger.warn('something failed', err);
        assert.ok(ch.lines.some((l) => l.includes('boom') || l.includes('something failed')));
        logger.disposeLogger();
    });

    test('error with non-Error value uses JSON.stringify', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'debug');
        logger.error('bad thing', { code: 42 });
        assert.ok(ch.lines.some((l) => l.includes('bad thing')));
        logger.disposeLogger();
    });

    test('setLogLevel changes active level at runtime', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'warn');
        logger.debug('before'); // suppressed
        logger.setLogLevel('debug');
        logger.debug('after');
        assert.ok(ch.lines.some((l) => l.includes('after')));
        assert.strictEqual(ch.lines.filter((l) => l.includes('before')).length, 0);
        logger.disposeLogger();
    });

    test('messages include level label in output', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'debug');
        logger.info('check level label');
        assert.ok(ch.lines.some((l) => l.includes('INFO') || l.includes('info')));
        logger.disposeLogger();
    });

    test('logger writes nothing when channel is disposed', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'debug');
        logger.disposeLogger();
        // Should not throw even after dispose
        assert.doesNotThrow(() => logger.info('after dispose'));
    });

    test('showError calls window.showErrorMessage without throwing', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'debug');
        assert.doesNotThrow(() => logger.showError('test error'));
        logger.disposeLogger();
    });

    test('showError with Error object includes message in channel output', () => {
        const ch = new MockChannel();
        logger.initLogger(ch as never, 'debug');
        logger.showError('show error test', new Error('test err'));
        assert.ok(ch.lines.some((l) => l.includes('show error test') || l.includes('test err')));
        logger.disposeLogger();
    });
});
