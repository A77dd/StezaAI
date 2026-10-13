import { useState } from 'react';
import './ChatToolbar.css';

interface ChatToolbarProps {
    disabled: boolean;
    onClear: () => Promise<boolean>;
}

export const ChatToolbar = ({ disabled, onClear }: ChatToolbarProps) => {
    const [confirming, setConfirming] = useState(false);
    return (
        <section className="chat-toolbar" aria-label="Управление перепиской">
            <div className="chat-toolbar__row">
                <h1>Чат со Steza</h1>
                <button
                    className="chat-toolbar__clear"
                    disabled={disabled}
                    aria-expanded={confirming}
                    aria-controls="chat-clear-confirm"
                    onClick={() => setConfirming((value) => !value)}
                >
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                    </svg>
                    Очистить
                </button>
            </div>
            {confirming && (
                <div id="chat-clear-confirm" className="chat-toolbar__confirm">
                    <h2>Очистить переписку?</h2>
                    <p>
                        Сообщения будут удалены без возможности восстановления. Факты, которые Steza
                        запомнила о вас, сохранятся.
                    </p>
                    <div className="chat-toolbar__actions">
                        <button autoFocus disabled={disabled} onClick={() => setConfirming(false)}>
                            Оставить
                        </button>
                        <button
                            className="chat-toolbar__delete"
                            disabled={disabled}
                            onClick={async () => {
                                if (await onClear()) setConfirming(false);
                            }}
                        >
                            Удалить переписку
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
};
