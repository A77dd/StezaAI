import { MemoryManager } from '../MemoryManager';
import { useEffect, useState, type FormEvent } from 'react';
import { apiClient, apiError } from '@/shared/api/client';
import { capture, decideCandidate, getProfile } from '@/shared/api/steza';
import type { Profile, Candidate } from '@/shared/api/contracts';
import { ModelAccess } from '@/components/ModelAccess';
export const ProfileMemory = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let live = true;
        setError('');
        Promise.all([getProfile(), apiClient.get<{ items: Candidate[] }>('/memory/candidates')])
            .then(([p, c]) => {
                if (live) {
                    setProfile(p);
                    setCandidates(c.data.items);
                }
            })
            .catch((e) => {
                if (live) setError(apiError(e));
            });
        return () => {
            live = false;
        };
    }, [retry]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const result = await capture(text.trim());
            setCandidates((current) => [
                ...new Map([...current, ...result.candidates].map((c) => [c.id, c])).values(),
            ]);
            setText('');
            setNotice(
                result.candidates.length
                    ? 'Проверьте, что Steza предлагает запомнить.'
                    : 'Запись сохранена. Новых фактов для подтверждения нет.',
            );
        } catch (e) {
            setError(apiError(e));
        } finally {
            setBusy(false);
        }
    };
    const decide = async (id: string, decision: 'confirm' | 'reject') => {
        setBusy(true);
        setError('');
        try {
            await decideCandidate(id, decision);
            setCandidates((current) => current.filter((c) => c.id !== id));
            setRetry((v) => v + 1);
        } catch (e) {
            setError(apiError(e));
        } finally {
            setBusy(false);
        }
    };
    const labels: Record<string, string> = {
        role: 'Роль',
        focus: 'Фокус',
        projects: 'Проекты',
        skills: 'Навыки',
        goals: 'Цели',
        strengths: 'Сильные стороны',
        growth_areas: 'Развитие',
        preferences: 'Предпочтения',
    };
    return (
        <section className="ui-panel">
            <h2>Что Steza знает обо мне</h2>
            {!profile && !error && <p role="status">Загружаем профиль…</p>}
            {profile?.slots
                .filter((slot) => slot.items.length)
                .map((slot) => (
                    <div key={slot.slot}>
                        <h3>{labels[slot.slot]}</h3>
                        {slot.items.map((item) => (
                            <p key={item.factId}>
                                {item.statement}
                                {item.past ? ' · Ранее' : ''}
                            </p>
                        ))}
                    </div>
                ))}
            {profile && !profile.slots.some((slot) => slot.items.length) && (
                <p>Подтверждённых фактов пока нет.</p>
            )}
            {profile?.truncated && <p>Показана часть профиля.</p>}
            <ModelAccess>
                <form onSubmit={submit}>
                    <label>
                        Расскажите о работе, целях или опыте
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            maxLength={8000}
                            required
                        />
                    </label>
                    <button disabled={busy || !text.trim()}>Отправить Steza</button>
                </form>
            </ModelAccess>
            {candidates.map((candidate) => (
                <div key={candidate.id}>
                    <p>{candidate.statement}</p>
                    {candidate.resolution === 'contradicts' && (
                        <p>Заменит противоречащий факт в памяти.</p>
                    )}
                    <div className="ui-actions">
                        <button
                            disabled={busy}
                            onClick={() => void decide(candidate.id, 'confirm')}
                        >
                            Запомнить
                        </button>
                        <button disabled={busy} onClick={() => void decide(candidate.id, 'reject')}>
                            Не надо
                        </button>
                    </div>
                </div>
            ))}
            <MemoryManager onChanged={() => setRetry((v) => v + 1)} />
            {notice && <p role="status">{notice}</p>}
            {error && (
                <>
                    <p role="alert">{error}</p>
                    <button onClick={() => setRetry((v) => v + 1)}>Обновить профиль</button>
                </>
            )}
        </section>
    );
};
