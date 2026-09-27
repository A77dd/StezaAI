// src/components/LoadingScreen/LoadingScreen.tsx
import './LoadingScreen.css';

interface LoadingScreenProps {
    text?: string;
}

export const LoadingScreen = ({ text }: LoadingScreenProps) => {
    return (
        <div className="loading-screen">
            <div className="loading-screen__glow" />

            <div className="loading-screen__content">
                <div className="loading-screen__orb">
                    <div className="loading-screen__orb-inner" />
                </div>

                <h1 className="loading-screen__brand">StezaAI</h1>

                <div className="loading-screen__dots">
                    <span className="loading-screen__dot" />
                    <span className="loading-screen__dot" />
                    <span className="loading-screen__dot" />
                </div>

                {text && <p className="loading-screen__text">{text}</p>}
            </div>
        </div>
    );
};