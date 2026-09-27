// src/shared/api/client.ts
import axios from 'axios';

export const TOKEN_KEY = 'steza_token';

export const getToken = (): string | null => {
    return localStorage.getItem(TOKEN_KEY);
};

export const setToken = (token: string): void => {
    localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = (): void => {
    localStorage.removeItem(TOKEN_KEY);
};

// Если VITE_API_URL задан — используем его, иначе fallback на /api (для Vite-прокси)
const baseURL = import.meta.env.VITE_API_URL || '/api';

console.log('🌐 API baseURL:', baseURL);

export const apiClient = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 15000
});

// === Request: цепляем JWT ===
apiClient.interceptors.request.use(
    (config) => {
        const token = getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// === Response: ловим 401 ===
apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;

        if (status === 401) {
            clearToken();
        }

        return Promise.reject(error);
    }
);