import { describe, expect, it } from 'vitest';
import { shouldAnimateScene } from './sceneAnimation';

describe('shouldAnimateScene', () => {
    it('animates while the scene is visible and motion is allowed', () => {
        expect(shouldAnimateScene({
            documentVisible: true,
            elementVisible: true,
            reducedMotion: false,
        })).toBe(true);
    });

    it.each([
        { documentVisible: false, elementVisible: true, reducedMotion: false },
        { documentVisible: true, elementVisible: false, reducedMotion: false },
        { documentVisible: true, elementVisible: true, reducedMotion: true },
    ])('pauses continuous animation for %o', (activity) => {
        expect(shouldAnimateScene(activity)).toBe(false);
    });
});
