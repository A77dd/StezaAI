// src/app/routes/index.tsx
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PATHS } from './paths';
import { AuthGuard, OnboardingGuard, GuestGuard } from './guards';
import { LoadingScreen } from '@/components/LoadingScreen';
import { MainLayout } from '@/components/Layout';

// === Lazy pages ===
// Именованный экспорт → оборачиваем в { default: m.X }
const AuthPage = lazy(() =>
    import('@/pages/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const HomePage = lazy(() =>
    import('@/pages/HomePage').then((m) => ({ default: m.HomePage }))
);
const TasksPage = lazy(() =>
    import('@/pages/TasksPage').then((m) => ({ default: m.TasksPage }))
);
const ChatPage = lazy(() =>
    import('@/pages/ChatPage').then((m) => ({ default: m.ChatPage }))
);
const ProfilePage = lazy(() =>
    import('@/pages/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const OnboardingPage = lazy(() =>
    import('@/pages/onboarding').then((m) => ({ default: m.OnboardingPage }))
);

export const AppRouter = () => {
    return (
        <Suspense fallback={<LoadingScreen />}>
            <Routes>
                {/* Публичные — только для неавторизованных */}
                <Route element={<GuestGuard />}>
                    <Route path={PATHS.AUTH} element={<AuthPage />} />
                </Route>

                {/* Онбординг — авторизован, но не прошёл онбординг */}
                <Route element={<OnboardingGuard />}>
                    <Route path={PATHS.ONBOARDING} element={<OnboardingPage />} />
                </Route>

                {/* Основное приложение — авторизован + онбординг пройден */}
                <Route element={<AuthGuard />}>
                    <Route element={<MainLayout />}>
                        <Route path={PATHS.HOME} element={<HomePage />} />
                        <Route path={PATHS.TASKS} element={<TasksPage />} />
                        <Route path={PATHS.CHAT} element={<ChatPage />} />
                        <Route path={PATHS.PROFILE} element={<ProfilePage />} />
                    </Route>
                </Route>

                {/* Всё остальное → на главную */}
                <Route path="*" element={<Navigate to={PATHS.HOME} replace />} />
            </Routes>
        </Suspense>
    );
};