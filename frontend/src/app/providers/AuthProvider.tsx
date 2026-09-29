// src/app/providers/AuthProvider.tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    authTelegram,
    getMe,
    logout as apiLogout
} from '@/entities/user/user';
import { getToken, setToken, clearToken } from '@/shared/api/client';
import { useTelegram } from '@/app/hooks/useTelegram';
import { AuthContext, type AuthContextValue, type AuthStatus } from '@/app/contexts/AuthContext';
import type { User } from '@/entities/user/user.types';

interface AuthProviderProps {
    children: ReactNode;
}

const localPreviewUser: User = {
    id: 0,
    telegram_id: 'local-preview',
    username: 'preview',
    first_name: 'Гость',
    last_name: null,
    photo_url: null,
    onboarding_completed: true
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
    const { initData, isReady: telegramReady } = useTelegram();

    const [user, setUser] = useState<User | null>(null);
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!telegramReady) return;

        if (import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_AUTH_BYPASS === 'true') {
            setUser(localPreviewUser);
            setStatus('authenticated');
            setIsReady(true);
            return;
        }

        const init = async () => {
            const token = getToken();

            // 1. Есть токен — пробуем получить юзера
            if (token) {
                try {
                    const me = await getMe();
                    setUser(me);
                    setStatus('authenticated');
                    setIsReady(true);
                    return;
                } catch {
                    clearToken();
                }
            }

            // 2. Токена нет, но есть initData — логинимся автоматически
            if (initData) {
                try {
                    const { token: newToken, user: newUser } = await authTelegram(initData);
                    setToken(newToken);
                    setUser(newUser);
                    setStatus('authenticated');
                    setIsReady(true);
                    return;
                } catch (err) {
                    console.error('Auto-login failed:', err);
                }
            }

            // 3. Гость
            setUser(null);
            setStatus('guest');
            setIsReady(true);
        };

        init();
    }, [telegramReady, initData]);

    const login = useCallback(async (init: string) => {
        const { token, user: u } = await authTelegram(init);
        setToken(token);
        setUser(u);
        setStatus('authenticated');
    }, []);

    const logout = useCallback(async () => {
        try {
            await apiLogout();
        } catch {
            /* токен мог уже истечь */
        }
        clearToken();
        setUser(null);
        setStatus('guest');
    }, []);

    const refresh = useCallback(async () => {
        try {
            const me = await getMe();
            setUser(me);
            setStatus('authenticated');
        } catch {
            clearToken();
            setUser(null);
            setStatus('guest');
        }
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({ user, status, isReady, login, logout, refresh }),
        [user, status, isReady, login, logout, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
