"use client";

import { useState } from "react";

import type { ProfileLookup } from "../profile-sources/profileLookup";
import { mockProfileLookup } from "../profile-sources/mockProfileLookup";
import styles from "./OnboardingFlow.module.css";
import OnboardingIntro from "./OnboardingIntro";
import OnboardingNextPlaceholder from "./OnboardingNextPlaceholder";
import ProfileSourcesScreen from "./ProfileSourcesScreen";

type OnboardingStep = "intro" | "profile-sources" | "next";

type OnboardingFlowProps = {
  lookup?: ProfileLookup;
};

export default function OnboardingFlow({
  lookup = mockProfileLookup,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<OnboardingStep>("intro");

  return (
    <div className={styles.flow} data-step={step}>
      {step === "intro" ? (
        <OnboardingIntro onComplete={() => setStep("profile-sources")} />
      ) : null}
      {step === "profile-sources" ? (
        <ProfileSourcesScreen lookup={lookup} onComplete={() => setStep("next")} />
      ) : null}
      {step === "next" ? <OnboardingNextPlaceholder /> : null}
    </div>
  );
}
