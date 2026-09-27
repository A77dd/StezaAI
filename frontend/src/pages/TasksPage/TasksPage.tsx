// src/pages/TasksPage/TasksPage.tsx
import './TasksPage.css';

const EmptyIllustration = () => (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
        <circle cx="60" cy="60" r="56" fill="var(--primary-glass)" />
        <rect
            x="36" y="40" width="48" height="56" rx="8"
            stroke="var(--primary)" strokeWidth="2.5" fill="none"
        />
        <path
            d="M46 56h28M46 68h20M46 80h14"
            stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round"
        />
    </svg>
);

export const TasksPage = () => {
    return (
        <div className="tasks-page">
            <div className="tasks-page__empty">
                <EmptyIllustration />
                <h2 className="tasks-page__title">Пока пусто</h2>
                <p className="tasks-page__text">
                    Здесь будут твои задачи. Добавь первую через кнопку <b>+</b> или расскажи Steza, что нужно сделать.
                </p>
            </div>
        </div>
    );
};