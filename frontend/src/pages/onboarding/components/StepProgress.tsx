// src/pages/onboarding/components/StepProgress/StepProgress.tsx
import './StepProgress.css';

interface StepProgressProps {
    current: number;
    total: number;
}

export const StepProgress = ({ current, total }: StepProgressProps) => {
    const percent = ((current + 1) / total) * 100;

    return (
        <div className="step-progress">
            <div className="step-progress__bar">
                <div
                    className="step-progress__fill"
                    style={{ width: `${percent}%` }}
                />
            </div>
            <span className="step-progress__label">
                {current + 1} / {total}
            </span>
        </div>
    );
};