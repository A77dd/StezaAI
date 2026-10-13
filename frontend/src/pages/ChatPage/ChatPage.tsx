import { clearChat } from '@/shared/api/manage';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { askSteza, chatHistory } from '@/shared/api/steza';
import { apiError } from '@/shared/api/client';
import type { ChatHistory, ChatReply } from '@/shared/api/contracts';
import { ModelAccess } from '@/components/ModelAccess';
import { TaskPlanner } from '@/components/TaskPlanner';
import { RichMessage, ThinkingMessage } from './components/ChatMessage';
import { ChatToolbar } from './components/ChatToolbar';
import { BlackBoxSphere } from './BlackBoxSphere';
import './ChatPage.css';

type Message = ChatHistory['items'][number] & {
    basis?: ChatReply['basis'];
    suggestedTasks?: string[];
};
export const ChatPage = () => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [busy, setBusy] = useState(false);
    const [pendingText, setPendingText] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [cursor, setCursor] = useState<string | null>(null);
    const [suggestion, setSuggestion] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    const live = useRef(true);
    const bottom = useRef<HTMLDivElement>(null);
    useEffect(() => {
        live.current = true;
        return () => {
            live.current = false;
        };
    }, []);
    useEffect(() => {
        let mounted = true;
        setLoading(true);
        setError('');
        chatHistory()
            .then((data) => {
                if (mounted) {
                    setMessages(data.items);
                    setCursor(data.nextCursor);
                }
            })
            .catch((e) => {
                if (mounted) setError(apiError(e));
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });
        return () => {
            mounted = false;
        };
    }, [retry]);
    useEffect(() => {
        if (pendingText) bottom.current?.scrollIntoView({ block: 'nearest' });
    }, [pendingText]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy || loading || !input.trim()) return;
        const text = input.trim();
        setPendingText(text);
        setBusy(true);
        setError('');
        try {
            const reply = await askSteza(text);
            if (!live.current) return;
            const createdAt = new Date().toISOString();
            setMessages((current) => [
                ...current,
                { role: 'user', text, createdAt, usedFactIds: [] },
                {
                    role: 'assistant',
                    text: reply.reply,
                    createdAt,
                    usedFactIds: reply.basis.map((f) => f.factId),
                    basis: reply.basis,
                    suggestedTasks: reply.suggestedTasks,
                },
            ]);
            setInput('');
            requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'nearest' }));
        } catch (e) {
            if (live.current) setError(apiError(e));
        } finally {
            if (live.current) {
                setBusy(false);
                setPendingText(null);
            }
        }
    };
    const earlier = async () => {
        if (!cursor || busy) return;
        setBusy(true);
        setError('');
        try {
            const data = await chatHistory(cursor);
            if (live.current) {
                setMessages((current) => [...data.items, ...current]);
                setCursor(data.nextCursor);
            }
        } catch (e) {
            if (live.current) setError(apiError(e));
        } finally {
            if (live.current) setBusy(false);
        }
    };
    return (
        <div className="chat-page chat-page--connected">
            {messages.length === 0 && !loading && !pendingText && (
                <section className="blackbox-stage">
                    <h1 className="blackbox-stage__prompt">Над чем сейчас работаешь?</h1>
                    <BlackBoxSphere
                        phase={busy ? 'processing' : 'idle'}
                        onPlusClick={() => document.getElementById('chat-input')?.focus()}
                    />
                </section>
            )}
            {!!messages.length && (
                <ChatToolbar
                    disabled={busy || loading}
                    onClear={async () => {
                        if (busy || loading) return false;
                        setBusy(true);
                        setError('');
                        try {
                            await clearChat();
                            setMessages([]);
                            setCursor(null);
                            setSuggestion(null);
                            return true;
                        } catch (e) {
                            setError(apiError(e));
                            return false;
                        } finally {
                            setBusy(false);
                        }
                    }}
                />
            )}
            <div className="chat-history" aria-label="Переписка">
                {loading && <p role="status">Загружаем переписку…</p>}
                {cursor && (
                    <button disabled={busy} onClick={() => void earlier()}>
                        Ранние сообщения
                    </button>
                )}
                {messages.map((message, index) => (
                    <article
                        key={`${message.createdAt}-${index}`}
                        className={`chat-message chat-message--${message.role}`}
                    >
                        <strong>{message.role === 'user' ? 'Вы' : 'Steza'}</strong>
                        {message.role === 'assistant' ? (
                            <RichMessage text={message.text} />
                        ) : (
                            <p className="ui-preserve">{message.text}</p>
                        )}
                        {!!message.basis?.length && (
                            <details>
                                <summary>Основание</summary>
                                {message.basis.map((fact) => (
                                    <p key={fact.factId}>{fact.statement}</p>
                                ))}
                            </details>
                        )}
                        {message.suggestedTasks?.map((text, i) => (
                            <button key={i} onClick={() => setSuggestion(text)}>
                                Запланировать: {text}
                            </button>
                        ))}
                    </article>
                ))}
                {pendingText && (
                    <>
                        <article className="chat-message chat-message--user">
                            <strong>Вы</strong>
                            <p className="ui-preserve">{pendingText}</p>
                        </article>
                        <ThinkingMessage />
                    </>
                )}
                <div ref={bottom} className="chat-history__end" />
            </div>
            {error && (
                <div className="ui-panel" role="alert">
                    <p>{error}</p>
                    <button onClick={() => setRetry((v) => v + 1)} disabled={busy}>
                        Обновить историю
                    </button>
                </div>
            )}
            {suggestion && (
                <>
                    <button onClick={() => setSuggestion(null)}>Закрыть планирование</button>
                    <TaskPlanner key={suggestion} initialText={suggestion} />
                </>
            )}
            <ModelAccess>
                <form className="chat-page__input" onSubmit={submit}>
                    <div className="chat-page__input-wrap">
                        <textarea
                            id="chat-input"
                            className="chat-page__textarea"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            maxLength={2000}
                            placeholder="Написать сообщение…"
                            aria-label="Сообщение Steza"
                            rows={2}
                            disabled={busy}
                        />
                    </div>
                    <button
                        className="chat-page__send"
                        type="submit"
                        disabled={busy || loading || !input.trim()}
                        aria-label="Отправить сообщение"
                    >
                        {busy ? '…' : '↑'}
                    </button>
                </form>
            </ModelAccess>
        </div>
    );
};
