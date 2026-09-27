// src/entities/onboarding/onboarding.types.ts

export interface OnboardingProfile {
    id?: number;
    user_id?: number;
    role_type?: string | null;
    employment_status?: string | null;
    strengths?: string[] | null;
    weaknesses?: string[] | null;
    goals?: string[] | null;
    agreed_to_terms?: boolean;
    completed_at?: string | null;
}

export interface OnboardingStepPayload {
    role_type?: string;
    employment_status?: string;
    strengths?: string[];
    weaknesses?: string[];
    goals?: string[];
    agreed_to_terms?: boolean;
}

export interface OnboardingState {
    profile: OnboardingProfile | null;
    onboarding_completed: boolean;
}