import { nextActionPath } from '@/shared/api/navigation';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { nextAction } from '@/shared/api/steza';
import { apiClient, apiError } from '@/shared/api/client';
import type { NextAction as Response } from '@/shared/api/contracts';
export const NextAction = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<Response['step']>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        const c = new AbortController();
        setLoading(true);
        setError('');
        nextAction(c.signal)
            .then((data) => {
                if (!c.signal.aborted) setStep(data.step);
            })
            .catch((e) => {
                if (!c.signal.aborted) setError(apiError(e));
            })
            .finally(() => {
                if (!c.signal.aborted) setLoading(false);
            });
        return () => c.abort();
    }, [retry]);
    const react = async (reaction: 'accept' | 'done' | 'snooze' | 'dismiss') => {
        if (!step) return;
        setBusy(true);
        setError('');
        try {
            await apiClient.post(`/next-action/${step.id}/feedback`, { reaction });
            if (reaction === 'accept') navigate(nextActionPath(step));
            else setRetry((v) => v + 1);
        } catch (e) {
            setError(apiError(e));
        } finally {
            setBusy(false);
        }
    };
    return (
        <section className="home-glass home-suggestion">
            <span className="home-suggestion__spark" aria-hidden="true">
                ✦
            </span>
            <p className="home-eyebrow">ПРЕДЛОЖЕНИЕ STEZA</p>
            <h2>{loading ? 'Ищем следующий шаг…' : step?.title || 'Время для планов'}</h2>
            <p>
                {step?.body ||
                    'Добавьте задачи и расскажите о своих целях — здесь появится следующий полезный шаг.'}
            </p>
            {step && (
                <div className="ui-actions">
                    {step.reactions.map((reaction) => (
                        <button
                            className="home-pill"
                            key={reaction}
                            disabled={busy}
                            onClick={() => void react(reaction)}
                        >
                            {
                                {
                                    accept: 'Сделать',
                                    done: 'Готово',
                                    snooze: 'Позже',
                                    dismiss: 'Скрыть',
                                }[reaction]
                            }
                        </button>
                    ))}
                </div>
            )}
            {error && (
                <>
                    <p role="alert">{error}</p>
                    <button onClick={() => setRetry((v) => v + 1)}>Повторить</button>
                </>
            )}
        </section>
    );
};
