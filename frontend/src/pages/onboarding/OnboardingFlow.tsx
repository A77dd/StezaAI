import { useState } from 'react';
import { WelcomeCarousel } from './WelcomeCarousel';
import { OnboardingPage } from './OnboardingPage';
export const OnboardingFlow = () => {
    const [stage, setStage] = useState<'carousel' | 'steps'>('carousel');
    return stage === 'carousel' ? <WelcomeCarousel onContinue={() => setStage('steps')} /> : <OnboardingPage />;
};
