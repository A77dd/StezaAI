import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import OnboardingIntro from "./OnboardingIntro";

describe("OnboardingIntro", () => {
  it("presents a focused onboarding entry point", () => {
    render(<OnboardingIntro />);

    expect(
      screen.getByRole("main", { name: "Первый экран онбординга Стези" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Стезя" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Начать знакомство со Стезей" }),
    ).toBeEnabled();
  });

  it("announces the transition after the CTA is activated", () => {
    render(<OnboardingIntro />);

    fireEvent.click(
      screen.getByRole("button", { name: "Начать знакомство со Стезей" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Переходим к знакомству",
    );
  });
});
