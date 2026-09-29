import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { hapticImpact, hapticNotification } from '@/shared/library/telegram';
import { BlackBoxSphere } from './BlackBoxSphere';
import './ChatPage.css';

type PreviewPhase = 'idle' | 'processing' | 'result';

const IconSend = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const IconPlus = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
    </svg>
);

export const ChatPage = () => {
    const [phase, setPhase] = useState<PreviewPhase>('idle');
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const processingTimer = useRef<number | null>(null);

    const startProcessing = () => {
        if (processingTimer.current !== null) window.clearTimeout(processingTimer.current);
        setInput('');
        setPhase('processing');
        processingTimer.current = window.setTimeout(() => {
            setPhase('result');
            hapticNotification('success');
            processingTimer.current = null;
        }, 4400);
    };

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!input.trim() || phase === 'processing') return;
        hapticImpact('light');
        startProcessing();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
        }
    };

    useEffect(() => () => {
        if (processingTimer.current !== null) window.clearTimeout(processingTimer.current);
    }, []);

    const resetPreview = () => {
        if (processingTimer.current !== null) {
            window.clearTimeout(processingTimer.current);
            processingTimer.current = null;
        }
        setPhase('idle');
        window.requestAnimationFrame(() => textareaRef.current?.focus());
    };

    const isProcessing = phase === 'processing';
    const canSubmit = Boolean(input.trim()) && !isProcessing;

    return (
        <div className={`chat-page chat-page--${phase}`}>
            <section className="blackbox-stage" aria-label="Черный ящик Steza">
                <div className="blackbox-stage__prompt" aria-live="polite">
                    <h1>Над чем сейчас работаешь?</h1>
                </div>

                <BlackBoxSphere phase={phase} onPlusClick={resetPreview} />

                <div className="blackbox-stage__status" aria-live="polite">
                    {phase === 'processing' && <span>Собираю мысли в ясный план…</span>}
                </div>

                <button
                    type="button"
                    className="blackbox-stage__plus"
                    onClick={resetPreview}
                    aria-label="Начать новый запрос"
                    title="Новый запрос"
                >
                    <IconPlus />
                </button>
            </section>

            <form className="chat-page__input" onSubmit={handleSubmit}>
                <div className="chat-page__input-wrap">
                    <textarea
                        ref={textareaRef}
                        className="chat-page__textarea"
                        placeholder="Написать сообщение..."
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        aria-label="Ваш запрос"
                        disabled={isProcessing}
                    />
                </div>

                <button
                    type="submit"
                    className="chat-page__send"
                    aria-label="Отправить запрос"
                    disabled={!canSubmit}
                >
                    <IconSend />
                </button>
            </form>
        </div>
    );
};
