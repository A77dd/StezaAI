"use client";

import { useState } from "react";

import CareerTagSphere from "./CareerTagSphere";
import styles from "./OnboardingIntro.module.css";

type OnboardingIntroProps = {
  onComplete?: () => void;
};

export default function OnboardingIntro({ onComplete }: OnboardingIntroProps) {
  const [transitioning, setTransitioning] = useState(false);

  const handleComplete = () => {
    setTransitioning(false);
    onComplete?.();
  };

  return (
    <main
      className={`${styles.intro} ${transitioning ? styles.isTransitioning : ""}`}
      aria-label="Первый экран онбординга Стези"
    >
      <h1 className={styles.visuallyHidden}>Стезя</h1>
      <div className={styles.transitionGlow} aria-hidden="true" />
      <div className={styles.sphereSlot}>
        <CareerTagSphere
          size="min(82vw, 360px)"
          speed={0.68}
          onStart={() => setTransitioning(true)}
          onComplete={handleComplete}
        />
      </div>
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {transitioning ? "Переходим к знакомству" : ""}
      </p>
    </main>
  );
}

