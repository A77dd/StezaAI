// src/components/OnboardingLayout/OnboardingLayout.tsx
import { Outlet } from 'react-router-dom';
import './OnboardingLayout.css';

export const OnboardingLayout = () => {
    return (
        <div className="onboarding-layout">
            <div className="onboarding-layout__content">
                <Outlet />
            </div>
        </div>
    );
};