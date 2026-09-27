// src/pages/onboarding/steps/FinishStep.tsx
import type { User } from '@/entities/user/user.types';
import './StepCommon.css';

interface FinishStepProps {
    user: User | null;
}

export const FinishStep = ({ user }: FinishStepProps) => {
    return (
        <div className="step step--center">
            <div className="step__emoji">🎉</div>
            <h2 className="step__title">
                Спасибо, {user?.first_name || 'друг'}!
            </h2>
            <p className="step__subtitle">
                Теперь я знаю, чем ты занимаешься и что взять на себя.
                Давай начнём!
            </p>
        </div>
    );
};