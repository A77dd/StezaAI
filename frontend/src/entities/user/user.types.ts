export interface User {
    id: number;
    telegram_id: string;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    photo_url: string | null;
    onboarding_completed: boolean;
}

export interface AuthResponse {
    token: string;
    user: User;
}