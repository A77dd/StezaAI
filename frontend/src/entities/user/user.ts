import { apiClient, clearToken } from '@/shared/api/client';
import type { Auth, Me } from '@/shared/api/contracts';
import type { User, AuthResponse } from './user.types';
const present = (me: Me): User => {
    // Telegram data is display-only; the authenticated identity comes from /me.
    const display = window.Telegram?.WebApp?.initDataUnsafe?.user;
    return { ...me, onboarding_completed: me.onboardingCompleted,
        first_name: display?.first_name ?? null, last_name: display?.last_name ?? null,
        username: display?.username ?? null, photo_url: display?.photo_url ?? null };
};
export const authTelegram = async (initData: string): Promise<AuthResponse> => {
    const { data } = await apiClient.post<Auth>('/auth/telegram', { initData });
    return { token: data.accessToken, user: present(data.user) };
};
export const authDev = async (handle: string): Promise<AuthResponse> => {
    if (!import.meta.env.DEV) throw new Error('Development login is disabled');
    const { data } = await apiClient.post<Auth>('/auth/dev', { handle });
    return { token: data.accessToken, user: present(data.user) };
};
export const getMe = async () => present((await apiClient.get<Me>('/me')).data);
export const logout = async () => { clearToken(); };
