// src/pages/onboarding/OnboardingPage.tsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/hooks/useAuth';
import { PATHS } from '@/app/routes/paths';
import { saveOnboardingStep, completeOnboarding } from '@/entities/onboarding';
import { StepProgress } from './components/StepProgress';
import { StepFooter } from './components/StepFooter';
import { RoleStep } from './steps/RoleStep';
import { TakeOnStep } from './steps/TakeOnStep';
import { FinishStep } from './steps/FinishStep';
import './OnboardingPage.css';

export interface OnboardingData {
    role_type: string;
    take_on: string[];
}

const INITIAL_DATA: OnboardingData = {
    role_type: '',
    take_on: []
};

const TOTAL_STEPS = 3;

export const OnboardingPage = () => {
    const navigate = useNavigate();
    const { user, refresh } = useAuth();
    const [step, setStep] = useState(0);
    const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
    const [saving, setSaving] = useState(false);

    const updateData = (patch: Partial<OnboardingData>) => {
        setData((prev) => ({ ...prev, ...patch }));
    };

    const stepConfig = useMemo(
        () => [
            {
                key: 'role',
                canContinue: true,
                onNext: async () => {
                    if (data.role_type) {
                        await saveOnboardingStep({ role_type: data.role_type });
                    }
                }
            },
            {
                key: 'take_on',
                canContinue: true,
                onNext: async () => {
                    if (data.take_on.length) {
                        await saveOnboardingStep({ goals: data.take_on });
                    }
                }
            },
            {
                key: 'finish',
                canContinue: true,
                onNext: async () => {
                    await completeOnboarding();
                    await refresh();
                    navigate(PATHS.HOME, { replace: true });
                }
            }
        ],
        [data, refresh, navigate]
    );

    const handleNext = async () => {
        if (saving) return;
        setSaving(true);
        try {
            await stepConfig[step].onNext();
            if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
        } catch (err) {
            console.error('Onboarding step error:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleSkip = async () => {
        if (saving) return;
        setSaving(true);
        try {
            if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
        } finally {
            setSaving(false);
        }
    };

    const handleBack = () => {
        if (step > 0) setStep((s) => s - 1);
    };

    const renderStep = () => {
        switch (step) {
            case 0:
                return (
                    <RoleStep
                        value={data.role_type}
                        onChange={(v) => updateData({ role_type: v })}
                    />
                );
            case 1:
                return (
                    <TakeOnStep
                        value={data.take_on}
                        onChange={(v) => updateData({ take_on: v })}
                    />
                );
            case 2:
                return <FinishStep user={user} />;
            default:
                return null;
        }
    };

    const isFirst = step === 0;
    const isFinish = step === TOTAL_STEPS - 1;
    const canContinue = stepConfig[step].canContinue;

    return (
        <div className="onboarding">
            {!isFinish && (
                <StepProgress current={step} total={TOTAL_STEPS - 1} />
            )}

            <div className="onboarding__content">{renderStep()}</div>

            <StepFooter
                onBack={isFirst || isFinish ? undefined : handleBack}
                onSkip={!isFinish ? handleSkip : undefined}
                onNext={handleNext}
                canContinue={canContinue}
                nextLabel={isFinish ? 'Начать' : 'Продолжить'}
                saving={saving}
                showSkip={!isFinish}
            />
        </div>
    );
};