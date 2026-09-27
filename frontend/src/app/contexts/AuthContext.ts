import { createContext } from 'react';
import type { User } from '@/entities/user/user.types';

export type AuthStatus = 'loading' | 'authenticated' | 'guest';

export interface AuthContextValue {
    user: User | null;
    status: AuthStatus;
    isReady: boolean;
    login: (initData: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);