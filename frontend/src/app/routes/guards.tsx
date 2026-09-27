// src/app/routes/guards.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/app/hooks/useAuth';
import { PATHS } from './paths';
import { LoadingScreen } from '@/components/LoadingScreen';

/**
 * Пропускает только авторизованных с пройденным онбордингом.
 * Всё остальное → /auth или /onboarding.
 */
export const AuthGuard = () => {
    const { user, isReady } = useAuth();

    if (!isReady) return <LoadingScreen />;
    if (!user) return <Navigate to={PATHS.AUTH} replace />;
    if (!user.onboarding_completed) return <Navigate to={PATHS.ONBOARDING} replace />;

    return <Outlet />;
};

/**
 * Пропускает только авторизованных БЕЗ онбординга.
 * Если онбординг уже пройден → на главную.
 * Если не авторизован → на /auth.
 */
export const OnboardingGuard = () => {
    const { user, isReady } = useAuth();

    if (!isReady) return <LoadingScreen />;
    if (!user) return <Navigate to={PATHS.AUTH} replace />;
    if (user.onboarding_completed) return <Navigate to={PATHS.HOME} replace />;

    return <Outlet />;
};

/**
 * Пропускает только НЕавторизованных.
 * Если уже залогинен → сразу на /onboarding или /.
 */
export const GuestGuard = () => {
    const { user, isReady } = useAuth();

    if (!isReady) return <LoadingScreen />;
    if (user && user.onboarding_completed) return <Navigate to={PATHS.HOME} replace />;
    if (user && !user.onboarding_completed) return <Navigate to={PATHS.ONBOARDING} replace />;

    return <Outlet />;
};