// src/components/MainLayout/MainLayout.tsx
import { Outlet } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Navigation } from '@/components/Navigation';
import './MainLayout.css';

export const MainLayout = () => {
    return (
        <div className="main-layout">
            <Header title="Профиль" showNotifications onNotificationClick={() => {}} />
            <main className="main-layout__content">
                <Outlet />
            </main>
            <Navigation />
        </div>
    );
};