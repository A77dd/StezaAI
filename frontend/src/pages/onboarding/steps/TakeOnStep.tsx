// src/pages/onboarding/steps/TakeOnStep.tsx
import { ChipGroup } from '../components/ChipGroup';
import './StepCommon.css';

const TAKE_ON_OPTIONS = [
    'Задачи и дедлайны',
    'Встречи и созвоны',
    'Договорённости из переписок',
    'Личные цели',
    'Напоминания',
    'Планирование дня'
];

interface TakeOnStepProps {
    value: string[];
    onChange: (v: string[]) => void;
}

export const TakeOnStep = ({ value, onChange }: TakeOnStepProps) => {
    return (
        <div className="step">
            <h2 className="step__title">Что мне взять на себя?</h2>
            <p className="step__subtitle">
                Выбери всё, с чем я могу помочь
            </p>

            <ChipGroup
                options={TAKE_ON_OPTIONS}
                value={value}
                onChange={onChange}
            />
        </div>
    );
};