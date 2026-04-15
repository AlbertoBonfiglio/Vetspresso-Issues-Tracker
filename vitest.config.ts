import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            // Redirect all `import ... from 'vscode'` to our lightweight mock
            // so tests run in Node without an Extension Host.
            vscode: path.resolve(__dirname, 'test/mocks/vscode.ts'),
        },
    },
    test: {
        globals: true,
        environment: 'node',
        include: ['test/suite/**/*.test.ts'],
        typecheck: {
            tsconfig: './tsconfig.test.json',
        },
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/extension.ts', 'src/panels/**', 'src/commands/**'],
            reporter: ['text', 'lcov'],
        },
    },
});
