import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CareerTagSphere from "./CareerTagSphere";

const APPROVED_TAGS = [
  "Опыт",
  "Результаты",
  "Навыки",
  "Цели",
  "Траектория",
  "Достижения",
  "Контекст",
  "Память",
  "Сигналы",
  "Возможности",
];

describe("CareerTagSphere", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders the approved professional-context vocabulary around an accessible CTA", () => {
    render(<CareerTagSphere />);

    for (const tag of APPROVED_TAGS) {
      expect(screen.getByText(tag)).toBeInTheDocument();
    }

    expect(
      screen.getByRole("button", { name: "Начать знакомство со Стезей" }),
    ).toBeEnabled();
  });

  it("starts once and completes after the transition", () => {
    const onStart = vi.fn();
    const onComplete = vi.fn();
    render(<CareerTagSphere onStart={onStart} onComplete={onComplete} />);

    const start = screen.getByRole("button", {
      name: "Начать знакомство со Стезей",
    });
    fireEvent.click(start);
    fireEvent.click(start);

    expect(start).toBeDisabled();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1_100));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("completes immediately when reduced motion is requested", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const onComplete = vi.fn();
    render(<CareerTagSphere onComplete={onComplete} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Начать знакомство со Стезей" }),
    );
    act(() => vi.advanceTimersByTime(1));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("cancels animation work while outside the viewport and resumes on return", () => {
    let intersectionCallback: IntersectionObserverCallback | undefined;

    class ControlledIntersectionObserver implements IntersectionObserver {
      readonly root = null;
      readonly rootMargin = "100px";
      readonly thresholds = [0];

      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = vi.fn(() => []);

      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
    }

    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    const requestFrame = vi.spyOn(window, "requestAnimationFrame");
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    render(<CareerTagSphere />);
    const requestsAfterRender = requestFrame.mock.calls.length;

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(cancelFrame).toHaveBeenCalledTimes(1);

    act(() => {
      intersectionCallback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
    expect(requestFrame.mock.calls.length).toBeGreaterThan(requestsAfterRender);
  });
});
