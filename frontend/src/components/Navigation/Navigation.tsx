// src/components/Navigation/Navigation.tsx
import { NavLink, useLocation } from 'react-router-dom';
import { PATHS } from '@/app/routes/paths';
import { hapticSelection } from '@/shared/library/telegram';
import './Navigation.css';

// ============================
// Иконки
// ============================

const IconHome = ({ active }: { active: boolean }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
);

const IconTasks = ({ active }: { active: boolean }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
);

const IconProfile = ({ active }: { active: boolean }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const IconChat = ({ active }: { active: boolean }) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
);

const IconPlus = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

// ============================
// Компонент
// ============================

export const Navigation = () => {
    const location = useLocation();

    // Основные табы (в левой панели)
    const mainItems = [
        { to: PATHS.PROFILE, icon: IconProfile, label: 'Профиль' },
        { to: PATHS.TASKS, icon: IconTasks, label: 'Задачи' },
        { to: PATHS.HOME, icon: IconHome, label: 'Главная' }
    ];

    const isMainRoute =
        mainItems.some(
            (item) =>
                location.pathname === item.to ||
                location.pathname.startsWith(item.to + '/')
        ) || location.pathname === PATHS.CHAT;

    if (!isMainRoute) return null;

    const handleClick = () => {
        hapticSelection();
    };

    return (
        <nav className="navigation">
            {/* Левая панель — табы + кнопка + */}
            <div className="navigation__panel navigation__panel--main">
                {mainItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        onClick={handleClick}
                        className={({ isActive }) =>
                            `navigation__item ${isActive ? 'navigation__item--active' : ''}`
                        }
                        aria-label={label}
                    >
                        {({ isActive }) => <Icon active={isActive} />}
                    </NavLink>
                ))}

                <button
                    type="button"
                    className="navigation__item navigation__item--plus"
                    onClick={() => {
                        hapticSelection();
                        // TODO: открыть быстрое создание задачи / чат
                    }}
                    aria-label="Создать"
                >
                    <IconPlus />
                </button>
            </div>

            {/* Правая панель — чат */}
            <NavLink
                to={PATHS.CHAT}
                onClick={handleClick}
                className={({ isActive }) =>
                    `navigation__panel navigation__panel--chat ${
                        isActive ? 'navigation__panel--active' : ''
                    }`
                }
                aria-label="Чат со Steza"
            >
                {({ isActive }) => <IconChat active={isActive} />}
            </NavLink>
        </nav>
    );
};