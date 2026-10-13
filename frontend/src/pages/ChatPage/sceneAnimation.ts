export interface SceneAnimationActivity {
    documentVisible: boolean;
    elementVisible: boolean;
    reducedMotion: boolean;
}

export const shouldAnimateScene = ({
    documentVisible,
    elementVisible,
    reducedMotion,
}: SceneAnimationActivity): boolean => documentVisible && elementVisible && !reducedMotion;
