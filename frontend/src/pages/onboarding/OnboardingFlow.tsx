import { useState } from 'react';
import { saveOnboardingStep } from '@/entities/onboarding';
import { WelcomeCarousel } from './WelcomeCarousel';
import { OnboardingPage } from './OnboardingPage';

export const OnboardingFlow = () => {
    const [stage, setStage] = useState<'carousel' | 'steps'>('carousel');

    const handleCarouselContinue = async () => {
        try {
            await saveOnboardingStep({ agreed_to_terms: true });
        } catch (err) {
            console.error('Failed to save terms agreement:', err);
        }
        setStage('steps');
    };

    if (stage === 'carousel') {
        return <WelcomeCarousel onContinue={handleCarouselContinue} />;
    }

    return <OnboardingPage />;
};