// src/pages/onboarding/WelcomeCarousel/WelcomeCarousel.tsx
import { useEffect, useRef, useState, type TouchEvent, type MouseEvent } from 'react';
import { hapticSelection } from '@/shared/library/telegram';
import { StepFooter } from '../components/StepFooter';
import './WelcomeCarousel.css';

// ============================
// SVG-иконки (fallback)
// ============================

const IconTasks = () => (
    <svg viewBox="0 0 200 120" fill="none" className="welcome-card__svg">
        <rect x="40" y="20" width="120" height="80" rx="12"
            stroke="var(--primary)" strokeWidth="2.5" fill="none" />
        <path d="M60 45h60M60 60h40M60 75h50"
            stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
);

const IconMeetings = () => (
    <svg viewBox="0 0 200 120" fill="none" className="welcome-card__svg">
        <circle cx="100" cy="60" r="40"
            stroke="var(--primary)" strokeWidth="2.5" fill="none" />
        <path d="M100 40v20l14 10"
            stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
);

const IconChat = () => (
    <svg viewBox="0 0 200 120" fill="none" className="welcome-card__svg">
        <path d="M40 60a20 20 0 0 1 20-20h40a20 20 0 0 1 20 20v0a20 20 0 0 1-20 20H70l-20 16V80h-10z"
            stroke="var(--primary)" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
        <circle cx="70" cy="60" r="2.5" fill="var(--primary)" />
        <circle cx="85" cy="60" r="2.5" fill="var(--primary)" />
        <circle cx="100" cy="60" r="2.5" fill="var(--primary)" />
    </svg>
);

const IconFocus = () => (
    <svg viewBox="0 0 200 120" fill="none" className="welcome-card__svg">
        <circle cx="100" cy="60" r="40"
            stroke="var(--primary)" strokeWidth="2.5" fill="none" opacity="0.3" />
        <circle cx="100" cy="60" r="24"
            stroke="var(--primary)" strokeWidth="2.5" fill="none" opacity="0.6" />
        <circle cx="100" cy="60" r="8" fill="var(--primary)" />
    </svg>
);

// ============================
// Стрелки
// ============================

const ChevronLeft = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
    </svg>
);

const ChevronRight = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

// ============================
// Иконки звука
// ============================

const IconMuted = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
);

const IconSound = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
);

// ============================
// Данные
// ============================

interface Feature {
    id: string;
    title: string;
    description: string;
    videoSrc: string | null;
    /** true — видео всегда немое, без кнопки */
    muted: boolean;
    Fallback: () => JSX.Element;
}

const FEATURES: Feature[] = [
    {
        id: 'tasks',
        title: 'Задачи и дедлайны',
        description: 'Помогу не забыть про важное и предложу удобное время.',
        videoSrc: 'https://storage.yandexcloud.net/lineup-cs2/other/sobachka.MP4',
        muted: true,
        Fallback: IconTasks
    },
    {
        id: 'meetings',
        title: 'Встречи и созвоны',
        description: 'Слежу за календарём и напоминаю за 15 минут до начала.',
        videoSrc: 'https://storage.yandexcloud.net/lineup-cs2/other/sobachka.MP4',
        muted: true,
        Fallback: IconMeetings
    },
    {
        id: 'chat',
        title: 'Договорённости',
        description: 'Запоминаю обещания из переписок и напоминаю о них.',
        videoSrc: 'https://storage.yandexcloud.net/lineup-cs2/other/sobachka.MP4',
        muted: true,
        Fallback: IconChat
    },
    {
        id: 'focus',
        title: 'Фокус и цели',
        description: 'Помогу не отвлекаться и держать фокус на важном.',
        videoSrc: 'https://storage.yandexcloud.net/lineup-cs2/other/sobachka.MP4',
        muted: true,
        Fallback: IconFocus
    }
];

// ============================
// CardMedia
// ============================

interface CardMediaProps {
    videoSrc: string | null;
    Fallback: () => JSX.Element;
    active: boolean;
    forceMuted: boolean;
}

const CardMedia = ({ videoSrc, Fallback, active, forceMuted }: CardMediaProps) => {
    const [videoFailed, setVideoFailed] = useState(false);
    const [muted, setMuted] = useState(forceMuted);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        setMuted(forceMuted);
    }, [forceMuted]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !videoSrc || videoFailed) return;

        if (active) {
            video.currentTime = 0;
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    }, [active, videoSrc, videoFailed]);

    if (!videoSrc || videoFailed) {
        return <Fallback />;
    }

    const toggleMute = (e: MouseEvent) => {
        e.stopPropagation();
        hapticSelection();
        setMuted((m) => !m);
    };

    return (
        <div className="welcome-card__video-wrap">
            <video
                ref={videoRef}
                className="welcome-card__video"
                src={videoSrc}
                loop
                muted={muted}
                playsInline
                preload="metadata"
                onError={() => setVideoFailed(true)}
            />

            {!forceMuted && (
                <button
                    type="button"
                    className="welcome-card__sound"
                    onClick={toggleMute}
                    aria-label={muted ? 'Включить звук' : 'Выключить звук'}
                >
                    {muted ? <IconMuted /> : <IconSound />}
                </button>
            )}
        </div>
    );
};

// ============================
// Компонент
// ============================

interface WelcomeCarouselProps {
    onContinue: () => void;
}

export const WelcomeCarousel = ({ onContinue }: WelcomeCarouselProps) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const touchStartX = useRef<number | null>(null);
    const touchDeltaX = useRef(0);
    const total = FEATURES.length;

    const goTo = (index: number) => {
        const normalized = ((index % total) + total) % total;
        if (normalized !== activeIndex) {
            hapticSelection();
            setActiveIndex(normalized);
        }
    };

    const goNext = () => goTo(activeIndex + 1);
    const goPrev = () => goTo(activeIndex - 1);

    const handleTouchStart = (e: TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchDeltaX.current = 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (touchStartX.current === null) return;
        touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    };

    const handleTouchEnd = () => {
        if (touchStartX.current === null) return;
        const SWIPE_THRESHOLD = 50;
        if (touchDeltaX.current > SWIPE_THRESHOLD) goPrev();
        else if (touchDeltaX.current < -SWIPE_THRESHOLD) goNext();
        touchStartX.current = null;
        touchDeltaX.current = 0;
    };

    return (
        <section className="welcome-carousel">
            <div className="welcome-carousel__header">
                <h1 className="welcome-carousel__title">Привет, я Steza</h1>
                <p className="welcome-carousel__subtitle">Твой ИИ-помощник.</p>
            </div>

            <p className="welcome-carousel__lead">Вот что я умею!</p>

            <div className="welcome-carousel__carousel">
                <button
                    type="button"
                    className="welcome-arrow welcome-arrow--prev"
                    aria-label="Предыдущая"
                    onClick={goPrev}
                >
                    <ChevronLeft />
                </button>

                <div
                    className="welcome-carousel__stage"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    {FEATURES.map((feature, index) => {
                        let offset = index - activeIndex;
                        if (offset > total / 2) offset -= total;
                        if (offset < -total / 2) offset += total;
                        if (Math.abs(offset) > 1) return null;

                        const isActive = offset === 0;
                        const { title, description, videoSrc, muted, Fallback } = feature;

                        return (
                            <article
                                key={feature.id}
                                className={
                                    'welcome-card' +
                                    (isActive ? ' welcome-card--active' : '')
                                }
                                data-offset={offset}
                                onClick={() => {
                                    if (!isActive) goTo(index);
                                }}
                            >
                                <div className="welcome-card__media">
                                    <CardMedia
                                        videoSrc={videoSrc}
                                        Fallback={Fallback}
                                        active={isActive}
                                        forceMuted={muted}
                                    />
                                </div>
                                <h3 className="welcome-card__title">{title}</h3>
                                <p className="welcome-card__description">{description}</p>
                            </article>
                        );
                    })}
                </div>

                <button
                    type="button"
                    className="welcome-arrow welcome-arrow--next"
                    aria-label="Следующая"
                    onClick={goNext}
                >
                    <ChevronRight />
                </button>
            </div>

            <div className="welcome-carousel__dots">
                {FEATURES.map((_, idx) => (
                    <button
                        key={idx}
                        type="button"
                        className={
                            'welcome-carousel__dot' +
                            (idx === activeIndex ? ' welcome-carousel__dot--active' : '')
                        }
                        aria-label={`Карточка ${idx + 1}`}
                        onClick={() => goTo(idx)}
                    />
                ))}
            </div>

            <StepFooter
                onNext={onContinue}
                canContinue={true}
                nextLabel="Продолжить"
                saving={false}
                hint={
                    <>
                        Нажимая «Продолжить», вы соглашаетесь с{' '}
                        <a
                            href="/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            политикой конфиденциальности
                        </a>
                    </>
                }
            />
        </section>
    );
};