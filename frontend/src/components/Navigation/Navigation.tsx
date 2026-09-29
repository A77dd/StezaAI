// src/components/Navigation/Navigation.tsx
import { useEffect, useState, type CSSProperties } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ThinkingOrb } from 'thinking-orbs';
import { PATHS } from '@/app/routes/paths';
import { hapticSelection } from '@/shared/library/telegram';
import displacementMap from './displacement-map.txt?raw';
import './Navigation.css';

// ============================
// Liquid glass фильтр (референс: Den Dionigi)
// ============================

const GlassFilters = () => (
    <div className="navigation__filter" aria-hidden="true">
        <svg width="0" height="0" focusable="false">
            <filter id="nav-switcher" primitiveUnits="objectBoundingBox">
                <feImage result="map" width="100%" height="100%" x="0" y="0" href={displacementMap} />
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.04" result="blur" />
                <feDisplacementMap in="blur" in2="map" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id="nav-toggle" primitiveUnits="objectBoundingBox">
                <feImage result="map" width="100%" height="100%" x="0" y="0" href={displacementMap} />
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.01" result="blur" />
                <feDisplacementMap in="blur" in2="map" scale="0.5" xChannelSelector="R" yChannelSelector="G" />
            </filter>
        </svg>
    </div>
);

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

// ============================
// Компонент
// ============================

export const Navigation = () => {
    const location = useLocation();
    const mainItems = [
        { to: PATHS.PROFILE, icon: IconProfile, label: 'Профиль' },
        { to: PATHS.TASKS, icon: IconTasks, label: 'Задачи' },
        { to: PATHS.HOME, icon: IconHome, label: 'Главная' }
    ];

    const activeIndex = mainItems.findIndex(
        (item) => location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    );
    const isMainRoute = activeIndex >= 0 || location.pathname === PATHS.CHAT;

    // Скользящий «пальчик»: позиция, счётчик перемещений (перезапуск пружины)
    // и сторона-якорь (origin) по направлению движения — как в референсе
    const [thumb, setThumb] = useState(() => ({
        index: Math.max(activeIndex, 0),
        move: 0,
        origin: 'center'
    }));

    useEffect(() => {
        if (activeIndex < 0 || activeIndex === thumb.index) return;
        const origin = activeIndex > thumb.index ? 'left' : 'right';
        setThumb((current) => ({ index: activeIndex, move: current.move + 1, origin }));
    }, [activeIndex, thumb.index]);

    if (!isMainRoute) return null;

    const handleClick = () => {
        hapticSelection();
    };

    const thumbStyle = {
        translate: `${thumb.index * 100}% 0`,
        transformOrigin: thumb.origin,
        animationName: thumb.move % 2 === 0 ? 'navigation-scale-a' : 'navigation-scale-b',
        opacity: activeIndex >= 0 ? 1 : 0
    } as CSSProperties;

    return (
        <nav className="navigation">
            <GlassFilters />

            {/* Панель — три таба, «пальчик» под активным */}
            <div className="navigation__panel navigation__panel--main">
                <span className="navigation__thumb" style={thumbStyle} aria-hidden="true" />

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
            </div>

            {/* Правая панель — чат: орб «composing» по центру стекла */}
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
                <ThinkingOrb state="composing" size={32} aria-hidden="true" />
            </NavLink>
        </nav>
    );
};
