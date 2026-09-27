// src/pages/ChatPage/ChatPage.tsx
import { useEffect, useRef, useState } from 'react';
import { hapticImpact, hapticNotification } from '@/shared/library/telegram';
import './ChatPage.css';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    time: string;
}

const MOCK_MESSAGES: Message[] = [
    {
        id: '1',
        role: 'assistant',
        text: 'Привет! Я Steza. Расскажи, что у тебя на уме — помогу разобраться.',
        time: 'сейчас'
    }
];

const IconSend = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
);

const IconMic = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
    </svg>
);

export const ChatPage = () => {
    const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
    const [input, setInput] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const recordingTimer = useRef<number | null>(null);

    // ============================
    // Отправка текста
    // ============================

    const handleSend = () => {
        const text = input.trim();
        if (!text) return;

        hapticImpact('light');

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text,
            time: 'сейчас'
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput('');

        // TODO: POST /api/chat/message
        setTimeout(() => {
            const reply: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: 'Понял тебя. Дай подумать...',
                time: 'сейчас'
            };
            setMessages((prev) => [...prev, reply]);
            hapticNotification('success');
        }, 600);
    };

    // ============================
    // Запись голоса
    // ============================

    const startRecording = () => {
        if (isRecording) return;
        hapticImpact('medium');
        setIsRecording(true);

        recordingTimer.current = window.setTimeout(() => {
            stopRecording();
        }, 30000);
    };

    const stopRecording = () => {
        if (!isRecording) return;
        hapticNotification('success');
        setIsRecording(false);

        if (recordingTimer.current) {
            clearTimeout(recordingTimer.current);
            recordingTimer.current = null;
        }

        // TODO: отправить голосовое на бэк
        const voiceMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            text: '🎤 Голосовое сообщение',
            time: 'сейчас'
        };
        setMessages((prev) => [...prev, voiceMsg]);
    };

    // Глобальный pointerup — закрывает запись, даже если палец ушёл с кнопки
    useEffect(() => {
        if (!isRecording) return;

        const handleGlobalPointerUp = () => {
            stopRecording();
        };

        document.addEventListener('pointerup', handleGlobalPointerUp);
        document.addEventListener('pointercancel', handleGlobalPointerUp);

        return () => {
            document.removeEventListener('pointerup', handleGlobalPointerUp);
            document.removeEventListener('pointercancel', handleGlobalPointerUp);
        };
    }, [isRecording]);

    // Очистка таймера при размонтировании
    useEffect(() => {
        return () => {
            if (recordingTimer.current) clearTimeout(recordingTimer.current);
        };
    }, []);

    // ============================
    // Скролл вниз
    // ============================

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="chat-page">
            {/* Сообщения */}
            <div className="chat-page__messages">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`chat-bubble chat-bubble--${msg.role}`}
                    >
                        <p className="chat-bubble__text">{msg.text}</p>
                        <span className="chat-bubble__time">{msg.time}</span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Ввод */}
            <div className="chat-page__input">
                <div className="chat-page__input-wrap">
                    <textarea
                        className="chat-page__textarea"
                        placeholder="Написать сообщение..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        rows={1}
                    />
                </div>

                {input.trim() ? (
                    <button
                        type="button"
                        className="chat-page__send"
                        onClick={handleSend}
                        aria-label="Отправить"
                    >
                        <IconSend />
                    </button>
                ) : (
                    <button
                        type="button"
                        className={`chat-page__mic ${
                            isRecording ? 'chat-page__mic--recording' : ''
                        }`}
                        onPointerDown={startRecording}
                        onContextMenu={(e) => e.preventDefault()}
                        aria-label="Голосовое сообщение"
                    >
                        <IconMic />
                    </button>
                )}
            </div>

            {/* Оверлей записи */}
            {isRecording && (
                <div className="chat-page__recording-overlay">
                    <div className="chat-page__recording-orb">
                        <span className="chat-page__recording-ring" />
                        <span className="chat-page__recording-ring chat-page__recording-ring--delay" />
                        <span className="chat-page__recording-ring chat-page__recording-ring--delay-2" />
                        <IconMic />
                    </div>

                    <div className="chat-page__recording-eq">
                        <span className="chat-page__recording-bar" />
                        <span className="chat-page__recording-bar" />
                        <span className="chat-page__recording-bar" />
                        <span className="chat-page__recording-bar" />
                        <span className="chat-page__recording-bar" />
                    </div>

                    <p className="chat-page__recording-text">Слушаю...</p>
                    <p className="chat-page__recording-hint">
                        Отпусти, чтобы отправить
                    </p>
                </div>
            )}
        </div>
    );
};