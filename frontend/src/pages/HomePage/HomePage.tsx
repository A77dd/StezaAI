// src/pages/HomePage/HomePage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/hooks/useAuth';
import { PATHS } from '@/app/routes/paths';
import { hapticImpact } from '@/shared/library/telegram';
import './HomePage.css';

interface Insight {
    id: string;
    icon: string;
    title: string;
    description: string;
}

const INSIGHTS: Insight[] = [
    {
        id: 'peak-focus',
        icon: '⚡',
        title: 'Ты продуктивнее до обеда',
        description: '70% выполненных задач — до 14:00'
    },
    {
        id: 'procrastination',
        icon: '⏳',
        title: 'Склонность откладывать',
        description: '3 задачи переносились больше 2 раз'
    }
];

export const HomePage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // TODO: получать с бэка GET /api/calendars
    const [hasCalendar] = useState(false);

    const greeting = (() => {
        const h = new Date().getHours();
        if (h < 6) return 'Доброй ночи';
        if (h < 12) return 'Доброе утро';
        if (h < 18) return 'Добрый день';
        return 'Добрый вечер';
    })();

    const handleConnectCalendar = () => {
        hapticImpact('medium');
        navigate(PATHS.PROFILE); // временно ведём на профиль, потом сделаем отдельный экран
    };

    return (
        <div className="home-page">
            {/* Приветствие */}
            <div className="home-page__hero">
                <p className="home-page__greeting">{greeting},</p>
                <h1 className="home-page__name">
                    {user?.first_name ?? 'друг'} 👋
                </h1>
            </div>

            {/* Баннер календаря */}
            {!hasCalendar && (
                <button
                    type="button"
                    className="home-page__calendar-banner"
                    onClick={handleConnectCalendar}
                >
                    <div className="home-page__calendar-banner-icon">📅</div>
                    <div className="home-page__calendar-banner-content">
                        <span className="home-page__calendar-banner-title">
                            Подключи календарь
                        </span>
                        <span className="home-page__calendar-banner-text">
                            Помогу находить время и не терять важное
                        </span>
                    </div>
                    <span className="home-page__calendar-banner-arrow">→</span>
                </button>
            )}

            {/* Инсайты */}
            <section className="home-page__section">
                <h2 className="home-page__section-title">Инсайты</h2>

                <div className="home-page__insights">
                    {INSIGHTS.map((insight) => (
                        <div key={insight.id} className="insight-card">
                            <span className="insight-card__icon">{insight.icon}</span>
                            <div className="insight-card__content">
                                <h3 className="insight-card__title">
                                    {insight.title}
                                </h3>
                                <p className="insight-card__description">
                                    {insight.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};