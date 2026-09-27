// src/components/Header/Header.tsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/hooks/useAuth';
import { hapticImpact } from '@/shared/library/telegram';
import './Header.css';

// ============================
// Иконки
// ============================

const IconBack = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
    </svg>
);

const IconBell = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
);

// ============================
// Компонент
// ============================

interface HeaderProps {
    /** Заголовок (если не задан — берётся имя пользователя) */
    title?: string;
    /** Показывать кнопку «Назад» */
    showBack?: boolean;
    /** Кастомный обработчик «Назад» (иначе history.back) */
    onBack?: () => void;
    /** Показывать кнопку уведомлений */
    showNotifications?: boolean;
    /** Обработчик уведомлений */
    onNotificationClick?: () => void;
    /** Показывать аватарку пользователя (для главной) */
    showAvatar?: boolean;
}

export const Header = ({
    title,
    showBack = false,
    onBack,
    showNotifications = false,
    onNotificationClick,
    showAvatar = true
}: HeaderProps) => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const handleBack = () => {
        hapticImpact('light');
        if (onBack) onBack();
        else navigate(-1);
    };

    const handleNotifications = () => {
        hapticImpact('light');
        onNotificationClick?.();
    };

    // Имя пользователя — обрезаем до 15 символов
    const rawName = title ?? user?.first_name ?? 'Гость';
    const displayName = rawName.length > 15 ? rawName.slice(0, 15) + '…' : rawName;

    const formattedDate = new Date().toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long'
    });

    return (
        <header className="header">
            <div className="header__content">
                <div className="header__left">
                    {showAvatar && user && (
                        <div className="header__avatar">
                            {user.photo_url ? (
                                <img
                                    src={user.photo_url}
                                    alt={user.first_name ?? ''}
                                    className="header__avatar-img"
                                />
                            ) : (
                                <span className="header__avatar-letter">
                                    {(user.first_name ?? '?')[0].toUpperCase()}
                                </span>
                            )}
                        </div>
                    )}

                    <div className="header__text">
                        <h1 className="header__title">{displayName}</h1>
                        <p className="header__date">{formattedDate}</p>
                    </div>
                </div>

                <div className="header__right">
                    {showBack && (
                        <button
                            type="button"
                            className="header__icon-button"
                            onClick={handleBack}
                            aria-label="Назад"
                        >
                            <IconBack />
                        </button>
                    )}

                    {showNotifications && (
                        <button
                            type="button"
                            className="header__icon-button"
                            onClick={handleNotifications}
                            aria-label="Уведомления"
                        >
                            <IconBell />
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};