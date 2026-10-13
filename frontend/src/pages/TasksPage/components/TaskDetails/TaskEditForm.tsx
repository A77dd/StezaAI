import { useState } from 'react';
import type { Task, TaskPatch } from '@/shared/api/contracts';
const localDate = (value: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const TaskEditForm = ({
    task,
    busy,
    onSave,
}: {
    task: Task;
    busy: boolean;
    onSave: (patch: TaskPatch) => void;
}) => {
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description || '');
    const [deadline, setDeadline] = useState(localDate(task.deadline));
    const [duration, setDuration] = useState(task.durationMinutes?.toString() || '');
    const [priority, setPriority] = useState(task.priority);
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                const patch: TaskPatch = {};
                if (title.trim() !== task.title) patch.title = title.trim();
                if ((description.trim() || null) !== task.description)
                    patch.description = description.trim() || null;
                if (deadline !== localDate(task.deadline))
                    patch.deadline = deadline ? new Date(deadline).toISOString() : null;
                if ((duration ? Number(duration) : null) !== task.durationMinutes)
                    patch.durationMinutes = duration ? Number(duration) : null;
                if (priority !== task.priority) patch.priority = priority;
                onSave(patch);
            }}
        >
            <fieldset className="ui-fields" disabled={busy}>
                <label>
                    Название
                    <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={200}
                        required
                    />
                </label>
                <label>
                    Описание
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={2000}
                        rows={3}
                    />
                </label>
                <label>
                    Приоритет
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as Task['priority'])}
                    >
                        <option value="low">Низкий</option>
                        <option value="normal">Обычный</option>
                        <option value="high">Высокий</option>
                    </select>
                </label>
                <label>
                    Срок — время устройства ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                    <input
                        type="datetime-local"
                        value={deadline}
                        onChange={(e) => setDeadline(e.target.value)}
                        disabled={task.kind === 'meeting' && !!task.bookingId}
                    />
                </label>
                <label>
                    Длительность, минут
                    <input
                        type="number"
                        min={5}
                        max={720}
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        placeholder="По настройкам"
                        disabled={task.kind === 'meeting' && !!task.bookingId}
                    />
                </label>
                <p className="ui-muted">
                    Изменение срока или длительности может снять прежнюю бронь. Новое время нужно
                    будет подтвердить.
                </p>
                <button className="ui-primary" disabled={!title.trim()}>
                    Сохранить изменения
                </button>
            </fieldset>
        </form>
    );
};
