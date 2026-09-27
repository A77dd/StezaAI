import { useEffect, useState, type ReactNode } from 'react';
import {
    initTelegramSdk,
    getTelegramTheme,
    getTelegramInitData,
    isTelegramWebApp,
    type TelegramWebApp
} from '@/shared/library/telegram';
import { TelegramContext, type TelegramContextValue } from '@/app/contexts/TelegramContext';

interface TelegramProviderProps {
    children: ReactNode;
}

export const TelegramProvider = ({ children }: TelegramProviderProps) => {
    const [isReady, setIsReady] = useState(false);
    const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [isRealTelegram, setIsRealTelegram] = useState(false);
    const [initData, setInitData] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        const setup = async () => {
            const real = isTelegramWebApp();

            // 1. СНАЧАЛА — данные в контекст, чтобы AuthProvider сразу получил initData
            if (mounted) {
                setIsRealTelegram(real);
                setWebApp(window.Telegram?.WebApp ?? null);
                setTheme(getTelegramTheme());
                setInitData(getTelegramInitData());
                setIsReady(true);
            }

            if (real) {
                console.log('✅ Telegram WebApp initialized');
            } else {
                console.log('⚠️ Not inside Telegram — running in browser mode');
            }

            // 2. SDK + Fullscreen — сразу, без задержки
            if (real) {
                initTelegramSdk().catch((err) => {
                    console.error('Telegram SDK init error:', err);
                });
            }
        };

        setup();

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;
    }, [theme]);

    const value: TelegramContextValue = {
        isRealTelegram,
        isReady,
        theme,
        initData,
        webApp
    };

    return (
        <TelegramContext.Provider value={value}>
            {children}
        </TelegramContext.Provider>
    );
};