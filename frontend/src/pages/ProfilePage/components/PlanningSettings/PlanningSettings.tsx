import './PlanningSettings.css';
import { useEffect, useState } from 'react';
import type { Settings } from '@/shared/api/contracts';
import { getSettings } from '@/shared/api/steza';
import { updateSettings } from '@/shared/api/manage';
import { apiError } from '@/shared/api/client';
import { TimezoneSelect } from '@/components/TimezoneSelect';
import { deviceTimezone } from '@/shared/library/timezone';

export const PlanningSettings = () => {
    const [settings, setSettings] = useState<Settings | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let live = true;
        setError('');
        getSettings()
            .then((data) => {
                if (live)
                    setSettings({
                        ...data,
                        timezone: data.timezoneConfirmed ? data.timezone : deviceTimezone(),
                    });
            })
            .catch((e) => {
                if (live) setError(apiError(e));
            });
        return () => {
            live = false;
        };
    }, [retry]);
    const patch = (value: Partial<Settings>) => {
        setSettings((current) => current && { ...current, ...value });
        setNotice('');
    };
    return (
        <section className="ui-panel planning-settings">
            <h2>Мой ритм</h2>
            <p className="ui-muted">Когда планировать дела и как часто напоминать о них.</p>
            {!settings && !error && <p role="status">Загружаем настройки…</p>}
            {settings && (
                <form
                    onSubmit={async (event) => {
                        event.preventDefault();
                        if (busy) return;
                        if (
                            !settings.workingHours.isoDays.length ||
                            settings.workingHours.start >= settings.workingHours.end
                        ) {
                            setError('Выберите хотя бы один день и время окончания позже начала.');
                            return;
                        }
                        setBusy(true);
                        setError('');
                        setNotice('');
                        try {
                            setSettings(
                                await updateSettings({
                                    timezone: settings.timezone,
                                    workingHours: settings.workingHours,
                                    defaultBlockMinutes: settings.defaultBlockMinutes,
                                    notificationIntensity: settings.notificationIntensity,
                                }),
                            );
                            setNotice('Настройки планирования сохранены.');
                        } catch (e) {
                            setError(apiError(e));
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <fieldset disabled={busy} className="ui-fields">
                        <TimezoneSelect
                            value={settings.timezone}
                            onChange={(timezone) => patch({ timezone })}
                            disabled={busy}
                        />
                        <fieldset className="ui-fields">
                            <legend>Дни для задач</legend>
                            <div className="ui-days">
                                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => (
                                    <button
                                        key={day}
                                        type="button"
                                        aria-pressed={settings.workingHours.isoDays.includes(
                                            index + 1,
                                        )}
                                        onClick={() =>
                                            patch({
                                                workingHours: {
                                                    ...settings.workingHours,
                                                    isoDays: settings.workingHours.isoDays.includes(
                                                        index + 1,
                                                    )
                                                        ? settings.workingHours.isoDays.filter(
                                                              (d) => d !== index + 1,
                                                          )
                                                        : [
                                                              ...settings.workingHours.isoDays,
                                                              index + 1,
                                                          ].sort(),
                                                },
                                            })
                                        }
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <div className="ui-columns planning-settings__hours">
                            <label>
                                Начало дня
                                <input
                                    type="time"
                                    required
                                    value={settings.workingHours.start}
                                    onChange={(e) =>
                                        patch({
                                            workingHours: {
                                                ...settings.workingHours,
                                                start: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </label>
                            <label>
                                Конец дня
                                <input
                                    type="time"
                                    required
                                    value={settings.workingHours.end}
                                    onChange={(e) =>
                                        patch({
                                            workingHours: {
                                                ...settings.workingHours,
                                                end: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </label>
                        </div>
                        <label>
                            Обычная длительность задачи, минут
                            <input
                                type="number"
                                min={1}
                                max={1440}
                                required
                                value={settings.defaultBlockMinutes}
                                onChange={(e) =>
                                    patch({ defaultBlockMinutes: Number(e.target.value) })
                                }
                            />
                        </label>
                        <label>
                            Напоминания
                            <select
                                value={settings.notificationIntensity}
                                onChange={(e) =>
                                    patch({
                                        notificationIntensity: e.target
                                            .value as Settings['notificationIntensity'],
                                    })
                                }
                            >
                                <option value="low">Реже</option>
                                <option value="normal">Обычно</option>
                                <option value="high">Чаще</option>
                            </select>
                        </label>
                        <button className="ui-primary" type="submit">
                            {busy ? 'Сохраняем…' : 'Сохранить мой ритм'}
                        </button>
                    </fieldset>
                </form>
            )}
            {notice && <p role="status">{notice}</p>}
            {error && (
                <div role="alert">
                    <p>{error}</p>
                    <button disabled={busy} onClick={() => setRetry((v) => v + 1)}>
                        Загрузить настройки заново
                    </button>
                </div>
            )}
        </section>
    );
};
