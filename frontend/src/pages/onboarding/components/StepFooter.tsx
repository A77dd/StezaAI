// src/pages/onboarding/components/StepFooter/StepFooter.tsx
import type { ReactNode } from 'react';
import { hapticImpact } from '@/shared/library/telegram';
import './StepFooter.css';

interface StepFooterProps {
    onBack?: () => void;
    onSkip?: () => void;
    onNext: () => void;
    canContinue: boolean;
    nextLabel?: string;
    saving?: boolean;
    showSkip?: boolean;
    /** Текст или JSX под кнопками */
    hint?: ReactNode;
}

export const StepFooter = ({
    onBack,
    onSkip,
    onNext,
    canContinue,
    nextLabel = 'Продолжить',
    saving = false,
    showSkip = false,
    hint
}: StepFooterProps) => {
    const handleNext = () => {
        if (!canContinue || saving) return;
        hapticImpact('light');
        onNext();
    };

    const handleSkip = () => {
        if (!onSkip || saving) return;
        hapticImpact('light');
        onSkip();
    };

    const handleBack = () => {
        if (!onBack) return;
        hapticImpact('light');
        onBack();
    };

    return (
        <div className="step-footer">
            <div className="step-footer__actions">
                {showSkip && onSkip && (
                    <button
                        type="button"
                        className="step-footer__skip"
                        onClick={handleSkip}
                        disabled={saving}
                    >
                        Пропустить
                    </button>
                )}

                <button
                    type="button"
                    className="step-footer__next"
                    onClick={handleNext}
                    disabled={!canContinue || saving}
                >
                    {saving ? 'Сохраняем...' : nextLabel}
                </button>

                {onBack && (
                    <button
                        type="button"
                        className="step-footer__back-icon"
                        onClick={handleBack}
                        disabled={saving}
                        aria-label="Назад"
                    >
                        ←
                    </button>
                )}
            </div>

            {hint && <div className="step-footer__hint">{hint}</div>}
        </div>
    );
};