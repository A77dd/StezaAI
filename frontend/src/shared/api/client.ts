import axios from 'axios';
export const TOKEN_KEY = 'steza_v1_token';
export const AUTH_EXPIRED = 'steza:auth-expired';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export function apiBase(value?: string): string {
    const base = (value?.trim() || '/v1').replace(/\/+$/, '');
    if (/\/v1$/.test(base)) return base;
    if (/\/api$/.test(base)) return base.replace(/\/api$/, '/v1');
    return `${base}/v1`;
}
export const apiClient = axios.create({ baseURL: apiBase(import.meta.env.VITE_API_URL), timeout: 120000 });
apiClient.interceptors.request.use(config => {
    const token = getToken();
    if (token && !config.url?.startsWith('/auth/')) config.headers.Authorization = `Bearer ${token}`;
    return config;
});
apiClient.interceptors.response.use(response => response, error => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.startsWith('/auth/')) {
        clearToken(); window.dispatchEvent(new Event(AUTH_EXPIRED));
    }
    if (['consent_required', 'timezone_not_confirmed'].includes(errorCode(error) ?? '')) window.dispatchEvent(new Event('steza:model-access'));
    return Promise.reject(error);
});
export function errorCode(error: unknown): string | undefined {
    if (!axios.isAxiosError(error)) return undefined;
    return error.response?.data?.error?.code ?? error.response?.data?.code;
}
export function apiError(error: unknown): string {
    const messages: Record<string, string> = {
        consent_required: 'Нужно согласие на обработку текста. Обновите согласие и повторите действие.',
        timezone_not_confirmed: 'Подтвердите часовой пояс в профиле.',
        invalid_timezone: 'Укажите действительный часовой пояс, например Europe/Moscow.',
        llm_budget_exhausted: 'Лимит помощника исчерпан. Попробуйте позже.',
        llm_timeout: 'Помощник не успел ответить. Попробуйте ещё раз.',
        llm_unavailable: 'Помощник временно недоступен.',
        llm_refused: 'Помощник не смог обработать запрос. Попробуйте переформулировать.',
        conflict: 'Данные изменились. Обновите страницу и повторите действие.',
        not_found: 'Запись больше не доступна. Обновите страницу.'
    };
    const code = errorCode(error);
    if (code && messages[code]) return messages[code];
    if (axios.isAxiosError(error)) {
        if (!error.response) return 'Нет связи с сервером. Проверьте подключение и повторите.';
        if (error.response.status === 401) return 'Сессия истекла. Войдите снова.';
        if (error.response.status === 429) return 'Слишком много запросов. Попробуйте чуть позже.';
        if (error.response.status === 400) return 'Проверьте введённые данные.';
    }
    return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}
