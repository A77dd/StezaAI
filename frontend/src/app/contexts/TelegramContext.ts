// src/app/contexts/TelegramContext.ts
import { createContext } from 'react';
import type { TelegramWebApp } from '@/shared/library/telegram';

export interface TelegramContextValue {
    isRealTelegram: boolean;
    isReady: boolean;
    theme: 'light' | 'dark';
    initData: string | null;
    webApp: TelegramWebApp | null;
}

export const TelegramContext = createContext<TelegramContextValue | null>(null);