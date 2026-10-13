import {
    deviceTimezone,
    getTimezoneOptions,
    formatTimezoneLabel as label,
} from '@/shared/library/timezone';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './TimezoneSelect.css';

export const TimezoneSelect = ({
    value,
    onChange,
    disabled = false,
    title = 'Часовой пояс',
}: {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    title?: string;
}) => {
    const id = useId();
    const [detected] = useState(deviceTimezone);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const search = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!open) return;
        search.current?.focus();
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);
    useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);
    useEffect(() => {
        if (open)
            document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, open, id]);
    const options = useMemo(() => getTimezoneOptions(detected, value), [detected, value]);
    const filtered = [{ zone: detected, text: label(detected, new Date()) }, ...options].filter(
        (option) =>
            `${option.text} ${option.zone}`
                .toLocaleLowerCase('ru')
                .includes(query.trim().toLocaleLowerCase('ru')),
    );
    const choose = (zone: string) => {
        onChange(zone);
        setOpen(false);
        trigger.current?.focus();
    };
    const [selectedName, selectedOffset] = value
        ? label(value, new Date()).split(' · ')
        : ['Выберите часовой пояс', ''];
    return (
        <div
            className="timezone-select"
            ref={root}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(false);
                    trigger.current?.focus();
                }
            }}
        >
            <span id={`${id}-label`} className="timezone-select__label">
                {title}
            </span>
            <button
                ref={trigger}
                type="button"
                className="timezone-select__trigger"
                disabled={disabled}
                aria-labelledby={`${id}-label ${id}-value`}
                aria-expanded={open}
                aria-controls={`${id}-panel`}
                onClick={() => {
                    setQuery('');
                    setActive(0);
                    setOpen(!open);
                }}
            >
                <span className="timezone-select__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                    </svg>
                </span>
                <span id={`${id}-value`} className="timezone-select__value">
                    <strong>{selectedName}</strong>
                    <small>
                        {value === detected ? 'По вашему устройству' : 'Для планирования задач'}
                    </small>
                </span>
                {selectedOffset && (
                    <span className="timezone-select__offset">{selectedOffset}</span>
                )}
                <svg
                    className={`timezone-select__chevron ${open ? 'is-open' : ''}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                >
                    <path d="m5 7 5 5 5-5" />
                </svg>
            </button>
            {open && (
                <div id={`${id}-panel`} className="timezone-select__panel">
                    <div className="timezone-select__search">
                        <svg
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            aria-hidden="true"
                        >
                            <circle cx="8.5" cy="8.5" r="5.5" />
                            <path d="m13 13 4 4" />
                        </svg>
                        <input
                            ref={search}
                            role="combobox"
                            aria-label="Поиск часового пояса"
                            placeholder="Город или часовой пояс"
                            autoComplete="off"
                            aria-expanded="true"
                            aria-autocomplete="list"
                            aria-controls={`${id}-list`}
                            aria-activedescendant={
                                filtered[active] ? `${id}-option-${active}` : undefined
                            }
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setActive(0);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    setActive((index) =>
                                        Math.max(
                                            0,
                                            Math.min(
                                                filtered.length - 1,
                                                index + (event.key === 'ArrowDown' ? 1 : -1),
                                            ),
                                        ),
                                    );
                                }
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    if (filtered[active]) choose(filtered[active].zone);
                                }
                            }}
                        />
                    </div>
                    <div
                        className="timezone-select__list"
                        id={`${id}-list`}
                        role="listbox"
                        aria-label={title}
                    >
                        {filtered.map((option, index) => {
                            const [name, offset] = option.text.split(' · ');
                            return (
                                <div
                                    key={option.zone}
                                    id={`${id}-option-${index}`}
                                    role="option"
                                    aria-selected={option.zone === value}
                                    className={`timezone-select__option ${index === active ? 'is-active' : ''}`}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => choose(option.zone)}
                                >
                                    <span className="timezone-select__option-text">
                                        <strong>{name}</strong>
                                        <small>
                                            {option.zone === detected
                                                ? 'Ваш часовой пояс · рекомендуется'
                                                : option.zone}
                                        </small>
                                    </span>
                                    <span className="timezone-select__offset">{offset}</span>
                                    <span className="timezone-select__check" aria-hidden="true">
                                        {option.zone === value ? '✓' : ''}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {!filtered.length && (
                        <p className="timezone-select__empty" role="status">
                            Ничего не найдено. Попробуйте другой город.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
