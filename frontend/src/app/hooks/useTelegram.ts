import { useContext } from 'react';
import { TelegramContext } from '@/app/contexts/TelegramContext';

export const useTelegram = () => {
    const ctx = useContext(TelegramContext);
    if (!ctx) {
        throw new Error('useTelegram must be used inside <TelegramProvider>');
    }
    return ctx;
};