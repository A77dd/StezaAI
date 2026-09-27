import {
    init as initSdk,
    isTMA,
    viewport,
    backButton
} from '@telegram-apps/sdk';

// ============================
// Типы Telegram WebApp
// ============================

export interface TelegramRawUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    photo_url?: string;
    is_premium?: boolean;
}

export interface TelegramInitDataUnsafe {
    user?: TelegramRawUser;
    start_param?: string;
    query_id?: string;
    auth_date?: string;
    hash?: string;
}

export interface TelegramThemeParams {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
}

export interface TelegramWebApp {
    initData?: string;
    initDataUnsafe?: TelegramInitDataUnsafe;

    ready: () => void;
    expand: () => void;
    close: () => void;

    isExpanded: boolean;
    isFullscreen: boolean;
    platform: string;
    viewportHeight: number;
    viewportStableHeight: number;

    disableVerticalSwipes?: () => void;
    enableVerticalSwipes?: () => void;

    openTelegramLink?: (url: string) => void;

    MainButton: {
        text: string;
        color: string;
        textColor: string;
        isVisible: boolean;
        isActive: boolean;
        show: () => void;
        hide: () => void;
        onClick: (cb: () => void) => void;
        offClick: (cb: () => void) => void;
    };

    BackButton: {
        isVisible: boolean;
        show: () => void;
        hide: () => void;
        onClick: (cb: () => void) => void;
        offClick: (cb: () => void) => void;
    };

    HapticFeedback: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
    };

    themeParams: TelegramThemeParams;
    colorScheme: 'light' | 'dark';

    onEvent: (eventType: string, cb: () => void) => void;
    offEvent: (eventType: string, cb: () => void) => void;
}

declare global {
    interface Window {
        Telegram?: {
            WebApp?: TelegramWebApp;
        };
    }
}

// ============================
// Низкоуровневый доступ
// ============================

const getWebApp = (): TelegramWebApp | null => {
    return window.Telegram?.WebApp ?? null;
};

// ============================
// Проверки / получение данных
// ============================

export const isTelegramWebApp = (): boolean => {
    const initData = getWebApp()?.initData;
    return !!initData && initData.length > 0;
};

export const getTelegramInitData = (): string | null => {
    const initData = getWebApp()?.initData;
    return initData && initData.length > 0 ? initData : null;
};

export const getTelegramUser = (): TelegramRawUser | null => {
    return getWebApp()?.initDataUnsafe?.user ?? null;
};

// ============================
// Инициализация SDK
// ============================

/**
 * Инициализирует Telegram SDK: viewport, fullscreen, back button, отключение свайпов.
 * Fullscreen запрашивается сразу — не ждём логина.
 * Возвращает true, если мы внутри Telegram.
 */
export const initTelegramSdk = async (): Promise<boolean> => {
    try {
        const tma = await isTMA();
        if (!tma) return false;

        // 1. Инициализация SDK
        initSdk();

        // 2. Монтируем viewport
        if (viewport.mount.isAvailable()) {
            await viewport.mount();
        }
        if (viewport.expand.isAvailable()) {
            viewport.expand();
        }

        // 3. Fullscreen — сразу, до логина и любых запросов
        if (viewport.requestFullscreen.isAvailable()) {
            try {
                await viewport.requestFullscreen();
                console.log('✅ Fullscreen requested');
            } catch (err) {
                console.warn('requestFullscreen failed:', err);
            }
        } else {
            console.log('⚠️ requestFullscreen not available (Bot API < 8.0)');
        }

        // 4. BackButton
        if (backButton.mount.isAvailable()) {
            backButton.mount();
        }

        // 5. Отключаем системный свайп вниз (Bot API 7.7+)
        const webApp = window.Telegram?.WebApp;
        if (webApp?.disableVerticalSwipes) {
            webApp.disableVerticalSwipes();
            console.log('✅ Vertical swipes disabled');
        } else {
            console.log('⚠️ disableVerticalSwipes not available (Bot API < 7.7)');
        }

        return true;
    } catch (err) {
        console.error('Telegram SDK init error:', err);
        return false;
    }
};

// ============================
// Тема
// ============================

export const getTelegramTheme = (): 'light' | 'dark' => {
    return getWebApp()?.colorScheme ?? 'light';
};

// ============================
// Хаптика
// ============================

export const hapticImpact = (
    style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'
) => {
    getWebApp()?.HapticFeedback?.impactOccurred(style);
};

export const hapticNotification = (type: 'error' | 'success' | 'warning') => {
    getWebApp()?.HapticFeedback?.notificationOccurred(type);
};

export const hapticSelection = () => {
    getWebApp()?.HapticFeedback?.selectionChanged();
};

// ============================
// BackButton (сырой WebApp)
// ============================

let currentBackHandler: (() => void) | null = null;

export const showBackButton = (onClick: () => void) => {
    const webApp = getWebApp();
    if (!webApp?.BackButton) return;

    if (currentBackHandler) {
        webApp.BackButton.offClick(currentBackHandler);
    }
    currentBackHandler = onClick;
    webApp.BackButton.onClick(onClick);
    webApp.BackButton.show();
};

export const hideBackButton = () => {
    const webApp = getWebApp();
    if (!webApp?.BackButton) return;

    if (currentBackHandler) {
        webApp.BackButton.offClick(currentBackHandler);
        currentBackHandler = null;
    }
    webApp.BackButton.hide();
};

// ============================
// Ссылки
// ============================

export const openTelegramLink = (url: string) => {
    getWebApp()?.openTelegramLink?.(url);
};