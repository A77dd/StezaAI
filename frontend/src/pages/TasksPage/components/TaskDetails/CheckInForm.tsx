import { useState } from 'react';
import type { CheckInInput } from '@/shared/api/contracts';

interface CheckInFormProps {
    busy: boolean;
    onSubmit: (input: CheckInInput) => Promise<boolean>;
}

export const CheckInForm = ({ busy, onSubmit }: CheckInFormProps) => {
    const [outcome, setOutcome] = useState<CheckInInput['outcome']>('done');
    const [reason, setReason] = useState<NonNullable<CheckInInput['reason']> | ''>('');
    const [result, setResult] = useState('');
    return (
        <form
            onSubmit={async (event) => {
                event.preventDefault();
                if (
                    await onSubmit({
                        outcome,
                        reason: outcome === 'done' ? null : reason || null,
                        result: result.trim() || null,
                    })
                )
                    setResult('');
            }}
        >
            <h3>Как прошло?</h3>
            <fieldset className="ui-fields" disabled={busy}>
                <label>
                    Результат
                    <select
                        value={outcome}
                        onChange={(e) => setOutcome(e.target.value as CheckInInput['outcome'])}
                    >
                        <option value="done">Готово</option>
                        <option value="needs_time">Нужно ещё время</option>
                        <option value="not_started">Не начал</option>
                        <option value="blocked">Не могу продолжить</option>
                    </select>
                </label>
                {outcome !== 'done' && (
                    <label>
                        Что помешало
                        <select
                            value={reason}
                            onChange={(e) => setReason(e.target.value as typeof reason)}
                        >
                            <option value="">Не указывать</option>
                            <option value="not_enough_time">Не хватило времени</option>
                            <option value="task_too_big">Задача слишком большая</option>
                            <option value="unclear_start">Непонятно, с чего начать</option>
                            <option value="more_important">Появилось более важное</option>
                            <option value="postponed">Отложил</option>
                        </select>
                    </label>
                )}
                <label>
                    Что получилось — необязательно
                    <textarea
                        value={result}
                        onChange={(e) => setResult(e.target.value)}
                        maxLength={2000}
                        rows={3}
                    />
                </label>
                <button className="ui-primary">Сохранить ответ</button>
            </fieldset>
        </form>
    );
};
