// src/entities/user/user.ts
import { apiClient } from '@/shared/api/client';
import type { User, AuthResponse } from './user.types';

// =========================
// AUTH
// =========================

/**
 * Авторизация через Telegram WebApp.
 * @param initData — строка window.Telegram.WebApp.initData
 */
export const authTelegram = async (initData: string): Promise<AuthResponse> => {
    const { data } = await apiClient.post<{
        success: true;
        token: string;
        user: User;
    }>('/auth/telegram', { initData });

    return {
        token: data.token,
        user: data.user
    };
};

/**
 * Текущий пользователь (по JWT).
 */
export const getMe = async (): Promise<User> => {
    const { data } = await apiClient.get<{
        success: true;
        user: User;
    }>('/auth/me');
    return data.user;
};

/**
 * Проверка валидности токена.
 */
export const checkAuth = async (): Promise<{
    id: number;
    onboarding_completed: boolean;
}> => {
    const { data } = await apiClient.get<{
        success: true;
        user: { id: number; onboarding_completed: boolean };
    }>('/auth/check');
    return data.user;
};

/**
 * Выход (blacklist токена на бэке).
 */
export const logout = async (): Promise<void> => {
    await apiClient.post('/auth/logout');
};

// =========================
// ONBOARDING
// =========================

export interface OnboardingStepPayload {
    role_type?: string;
    employment_status?: string;
    strengths?: string[];
    weaknesses?: string[];
    goals?: string[];
    agreed_to_terms?: boolean;
}

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

/**
 * Сохранить один шаг онбординга (частичное обновление).
 */
export const saveOnboardingStep = async (
    payload: OnboardingStepPayload
): Promise<OnboardingProfile> => {
    const { data } = await apiClient.post<{
        success: true;
        profile: OnboardingProfile;
    }>('/onboarding/step', payload);
    return data.profile;
};

/**
 * Завершить онбординг. На бэке проверит agreed_to_terms и проставит completed_at.
 */
export const completeOnboarding = async (): Promise<void> => {
    await apiClient.post('/onboarding/complete');
};

/**
 * Получить текущее состояние онбординга пользователя.
 */
export const getOnboarding = async (): Promise<{
    profile: OnboardingProfile | null;
    onboarding_completed: boolean;
}> => {
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

// =========================
// USERS (список)
// =========================

/**
 * Список пользователей (для админки / юз-профиля).
 */
export const getUsers = async (): Promise<User[]> => {
    const { data } = await apiClient.get<{
        success: true;
        users: User[];
    }>('/users');
    return data.users;
};

/**
 * Удалить пользователя.
 */
export const deleteUser = async (userId: number): Promise<void> => {
    await apiClient.delete(`/users/${userId}`);
};