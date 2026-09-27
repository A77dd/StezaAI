// src/pages/onboarding/steps/RoleStep.tsx
import { ChipGroup } from '../components/ChipGroup';
import './StepCommon.css';

const ROLE_OPTIONS = [
    'Разработчик',
    'QA-инженер',
    'Аналитик',
    'Продакт-менеджер',
    'Дизайнер',
    'DevOps',
    'Тимлид',
    'Студент'
];

interface RoleStepProps {
    value: string;
    onChange: (v: string) => void;
}

export const RoleStep = ({ value, onChange }: RoleStepProps) => {
    const options = value && !ROLE_OPTIONS.includes(value)
        ? [...ROLE_OPTIONS, value]
        : ROLE_OPTIONS;

    return (
        <div className="step">
            <h2 className="step__title">Чем ты сейчас занимаешься?</h2>
            <p className="step__subtitle">
                Чтобы я лучше понимал твой контекст
            </p>

            <ChipGroup
                options={options}
                value={value ? [value] : []}
                onChange={(v) => onChange(v[0] || '')}
                single
            />

            <input
                className="step__input"
                type="text"
                placeholder="Свой вариант..."
                value={ROLE_OPTIONS.includes(value) ? '' : value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
};