import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockProfileLookup } from "../profile-sources/mockProfileLookup";
import OnboardingFlow from "./OnboardingFlow";

async function openProfileSources() {
  fireEvent.click(
    screen.getByRole("button", { name: "Начать знакомство со Стезей" }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(1_100));
}

describe("OnboardingFlow", () => {
  it("opens the profile sources after the existing intro and supports skip", async () => {
    vi.useFakeTimers();
    render(<OnboardingFlow lookup={createMockProfileLookup({ delayMs: 650 })} />);

    expect(
      screen.getByRole("main", { name: "Первый экран онбординга Стези" }),
    ).toBeInTheDocument();

    await openProfileSources();

    expect(
      screen.getByRole("heading", { name: "Начнем с того, что уже есть" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Заполню позже" }));

    expect(
      screen.getByRole("heading", { name: "Следующий шаг" }),
    ).toBeInTheDocument();
  });

  it("advances after a profile is found and confirmed", async () => {
    vi.useFakeTimers();
    render(<OnboardingFlow lookup={createMockProfileLookup({ delayMs: 650 })} />);
    await openProfileSources();

    fireEvent.change(screen.getByRole("textbox", { name: "Профиль GitHub" }), {
      target: { value: "@demo" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Найти профиль GitHub" }),
    );
    expect(screen.getByText("Ищем профиль...")).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(650));
    fireEvent.click(screen.getByRole("button", { name: "Да, это я" }));
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));

    expect(
      screen.getByRole("heading", { name: "Следующий шаг" }),
    ).toBeInTheDocument();
  });
});
