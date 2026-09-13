import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import OnboardingIntro from "./OnboardingIntro";

describe("OnboardingIntro", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("keeps the completed visual state after the transition finishes", () => {
    vi.useFakeTimers();
    const { container } = render(<OnboardingIntro />);

    fireEvent.click(
      screen.getByRole("button", { name: "Начать знакомство со Стезей" }),
    );
    act(() => vi.advanceTimersByTime(1_100));

    expect(container.querySelector("main")?.className).toContain("hasStarted");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
