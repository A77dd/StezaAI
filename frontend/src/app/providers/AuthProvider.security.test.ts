import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('AuthProvider privacy guard', () => {
    it('does not log Telegram initData', () => {
        const source = readFileSync(
            fileURLToPath(new URL('./AuthProvider.tsx', import.meta.url)),
            'utf8',
        );

        expect(source).not.toMatch(/console\.(?:log|info|debug)\([^\n]*initData/);
        expect(source).not.toContain('initData.substring');
    });
});
