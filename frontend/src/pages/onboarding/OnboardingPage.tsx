import { TimezoneSelect } from '@/components/TimezoneSelect';
import { deviceTimezone } from '@/shared/library/timezone';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/hooks/useAuth';
import { PATHS } from '@/app/routes/paths';
import { completeOnboarding, type OnboardingPayload } from '@/entities/onboarding';
import { apiError, errorCode } from '@/shared/api/client';
import { getMe } from '@/entities/user/user';
import { StepProgress } from './components/StepProgress';
import { StepFooter } from './components/StepFooter';
import { RoleStep } from './steps/RoleStep';
import { TakeOnStep } from './steps/TakeOnStep';
import { FinishStep } from './steps/FinishStep';
import './OnboardingPage.css';
export const OnboardingPage = () => {
    const navigate = useNavigate();
    const { user, refresh } = useAuth();
    const [step, setStep] = useState(0);
    const [role, setRole] = useState('');
    const [takeOn, setTakeOn] = useState<string[]>([]);
    const [timezone, setTimezone] = useState(deviceTimezone);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const next = async () => {
        if (saving) return;
        if (step < 2) {
            setStep(step + 1);
            return;
        }
        setSaving(true);
        setError('');
        const mapping: Record<string, OnboardingPayload['takeOn'][number]> = {
            'Задачи и дедлайны': 'tasks',
            'Встречи и созвоны': 'tasks',
            'Договорённости из переписок': 'agreements',
            'Личные цели': 'growth',
            Напоминания: 'tasks',
            'Планирование дня': 'tasks',
        };
        try {
            try {
                await completeOnboarding({
                    role: role.trim(),
                    takeOn: [...new Set(takeOn.map((value) => mapping[value]))],
                    timezone,
                });
            } catch (e) {
                if (errorCode(e) !== 'conflict' || !(await getMe()).onboardingCompleted) throw e;
            }
            await refresh();
            navigate(PATHS.HOME, { replace: true });
        } catch (e) {
            setError(apiError(e));
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="onboarding">
            {step < 2 && <StepProgress current={step} total={2} />}
            <div className="onboarding__content">
                {step === 0 && <RoleStep value={role} onChange={setRole} />}
                {step === 1 && <TakeOnStep value={takeOn} onChange={setTakeOn} />}
                {step === 2 && (
                    <>
                        <FinishStep user={user} />
                        <TimezoneSelect
                            title="Часовой пояс для планирования"
                            value={timezone}
                            onChange={setTimezone}
                            disabled={saving}
                        />
                        <p>Нажимая «Начать», вы подтверждаете этот часовой пояс.</p>
                    </>
                )}
                {error && <p role="alert">{error}</p>}
            </div>
            <StepFooter
                onBack={step > 0 ? () => setStep(step - 1) : undefined}
                onSkip={step === 1 ? () => setStep(2) : undefined}
                onNext={() => void next()}
                canContinue={
                    step === 0 ? !!role.trim() && role.trim().length <= 200 : !!timezone.trim()
                }
                nextLabel={step === 2 ? 'Начать' : 'Продолжить'}
                saving={saving}
                showSkip={step === 1}
            />
        </div>
    );
};
