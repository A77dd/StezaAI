// src/pages/onboarding/components/ChipGroup/ChipGroup.tsx
import { hapticSelection } from '@/shared/library/telegram';
import './ChipGroup.css';

interface ChipGroupProps {
    options: string[];
    value: string[];
    onChange: (value: string[]) => void;
    /** true — можно выбрать только один */
    single?: boolean;
}

export const ChipGroup = ({
    options,
    value,
    onChange,
    single = false
}: ChipGroupProps) => {
    const toggle = (option: string) => {
        hapticSelection();

        if (single) {
            onChange([option]);
            return;
        }

        if (value.includes(option)) {
            onChange(value.filter((v) => v !== option));
        } else {
            onChange([...value, option]);
        }
    };

    return (
        <div className="chip-group">
            {options.map((option) => {
                const selected = value.includes(option);
                return (
                    <button
                        key={option}
                        type="button"
                        className={`chip ${selected ? 'chip--selected' : ''}`}
                        onClick={() => toggle(option)}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
};