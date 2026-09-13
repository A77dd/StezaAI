"use client";

import { useState } from "react";

import CareerTagSphere from "./CareerTagSphere";
import styles from "./OnboardingIntro.module.css";

type OnboardingIntroProps = {
  onComplete?: () => void;
};

export default function OnboardingIntro({ onComplete }: OnboardingIntroProps) {
  const [phase, setPhase] = useState<"idle" | "transitioning" | "complete">(
    "idle",
  );

  const handleComplete = () => {
    setPhase("complete");
    onComplete?.();
  };

  const hasStarted = phase !== "idle";

  return (
    <main
      className={`${styles.intro} ${hasStarted ? styles.hasStarted : ""}`}
      aria-label="Первый экран онбординга Стези"
    >
      <h1 className={styles.visuallyHidden}>Стезя</h1>
      <div className={styles.transitionGlow} aria-hidden="true" />
      <div className={styles.sphereSlot}>
        <CareerTagSphere
          size="min(82vw, 360px)"
          speed={0.68}
          onStart={() => setPhase("transitioning")}
          onComplete={handleComplete}
        />
      </div>
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {phase === "transitioning" ? "Переходим к знакомству" : ""}
      </p>
    </main>
  );
}
