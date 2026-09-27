// src/entities/onboarding/onboarding.ts
import { apiClient } from '@/shared/api/client';
import type {
    OnboardingProfile,
    OnboardingStepPayload,
    OnboardingState
} from './onboarding.types';

export const saveOnboardingStep = async (
    payload: OnboardingStepPayload
): Promise<OnboardingProfile> => {
    const { data } = await apiClient.post<{
        success: true;
        profile: OnboardingProfile;
    }>('/onboarding/step', payload);
    return data.profile;
};

export const completeOnboarding = async (): Promise<void> => {
    await apiClient.post('/onboarding/complete');
};

export const getOnboarding = async (): Promise<OnboardingState> => {
    const { data } = await apiClient.get<{
        success: true;
        profile: OnboardingProfile | null;
        onboarding_completed: boolean;
    }>('/onboarding');
    return {
        profile: data.profile,
        onboarding_completed: data.onboarding_completed
    };
};