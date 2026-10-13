import type { Me } from '@/shared/api/contracts';
export interface User extends Me {
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    photo_url: string | null;
    onboarding_completed: boolean;
}
export interface AuthResponse { token: string; user: User }
