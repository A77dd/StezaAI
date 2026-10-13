import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import { authTelegram, authDev, getMe } from '@/entities/user/user';
import { getToken, setToken, clearToken, AUTH_EXPIRED, apiError } from '@/shared/api/client';
import { useTelegram } from '@/app/hooks/useTelegram';
import { AuthContext, type AuthContextValue, type AuthStatus } from '@/app/contexts/AuthContext';
import type { User } from '@/entities/user/user.types';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const { initData, isReady: telegramReady } = useTelegram();
    const [user, setUser] = useState<User | null>(null);
    const [status, setStatus] = useState<AuthStatus>('loading');
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const expired = () => { setUser(null); setStatus('guest'); setError('Сессия истекла. Войдите снова.'); };
        window.addEventListener(AUTH_EXPIRED, expired);
        return () => window.removeEventListener(AUTH_EXPIRED, expired);
    }, []);
    useEffect(() => {
        if (!telegramReady) return;
        let live = true;
        setIsReady(false); setError('');
        const init = async () => {
            try {
                if (getToken()) {
                    try {
                        const me = await getMe();
                        if (live) { setUser(me); setStatus('authenticated'); }
                        return;
                    } catch (e) {
                        if (!axios.isAxiosError(e) || e.response?.status !== 401) throw e;
                        clearToken();
                    }
                }
                if (initData) {
                    const result = await authTelegram(initData);
                    if (live) { setToken(result.token); setUser(result.user); setStatus('authenticated'); }
                } else if (live) { setUser(null); setStatus('guest'); }
            } catch (e) { if (live) { setError(apiError(e)); setUser(null); setStatus('guest'); } }
            finally { if (live) setIsReady(true); }
        };
        void init(); return () => { live = false; };
    }, [telegramReady, initData, attempt]);
    const login = useCallback(async (init: string) => {
        const result = await authTelegram(init); setToken(result.token); setUser(result.user); setStatus('authenticated'); setError('');
    }, []);
    const loginDev = useCallback(async (handle: string) => {
        const result = await authDev(handle); setToken(result.token); setUser(result.user); setStatus('authenticated'); setError('');
    }, []);
    const logout = useCallback(async () => { clearToken(); setUser(null); setStatus('guest'); }, []);
    const refresh = useCallback(async () => { const me = await getMe(); setUser(me); setStatus('authenticated'); }, []);
    const retry = useCallback(() => setAttempt(value => value + 1), []);
    const value = useMemo<AuthContextValue>(() => ({ user, status, isReady, login, loginDev, logout, refresh, error, retry }), [user, status, isReady, login, loginDev, logout, refresh, error, retry]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
