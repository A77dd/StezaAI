import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProfileLookup } from "../profile-sources/profileLookup";
import type {
  ProfileResult,
  ProfileSourceId,
} from "../profile-sources/profileSources.types";
import ProfileSourcesScreen from "./ProfileSourcesScreen";

function profile(sourceId: ProfileSourceId): ProfileResult {
  return {
    sourceId,
    name: `Демо-профиль ${sourceId}`,
    role: "Профессиональная роль",
    avatarPath: "/onboarding/avatars/profile-blue.svg",
  };
}

function createControlledLookup() {
  const requests = new Map<
    ProfileSourceId,
    {
      resolve: (value: ProfileResult) => void;
      reject: (reason: Error) => void;
    }
  >();
  const lookup: ProfileLookup = {
    lookup: vi.fn(
      (sourceId: ProfileSourceId) =>
        new Promise<ProfileResult>((resolve, reject) => {
          requests.set(sourceId, { resolve, reject });
        }),
    ),
  };

  return { lookup, requests };
}

function submitSource(sourceName: string, query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: `Профиль ${sourceName}` }), {
    target: { value: query },
  });
  fireEvent.click(
    screen.getByRole("button", { name: `Найти профиль ${sourceName}` }),
  );
}

describe("ProfileSourcesScreen", () => {
  it("renders the five configured cards in order with a disabled next action", () => {
    const { lookup } = createControlledLookup();
    render(<ProfileSourcesScreen lookup={lookup} onComplete={vi.fn()} />);

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(5);
    expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual([
      "LinkedIn",
      "hh.ru",
      "GitHub",
      "Telegram",
      "Сетка",
    ]);
    expect(screen.queryByText("Шаг 1 · контекст")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeDisabled();
  });

  it("keeps parallel lookups independent and enables next after confirmation", async () => {
    const { lookup, requests } = createControlledLookup();
    const onComplete = vi.fn();
    render(<ProfileSourcesScreen lookup={lookup} onComplete={onComplete} />);

    submitSource("LinkedIn", "linkedin.example/demo");
    submitSource("GitHub", "@demo");

    expect(screen.getAllByText("Ищем профиль...")).toHaveLength(2);

    await act(async () => {
      requests.get("github")?.resolve(profile("github"));
    });

    expect(screen.getByText("Демо-профиль github")).toBeInTheDocument();
    expect(screen.getByText("Ищем профиль...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Да, это я" }));

    expect(screen.getByLabelText("Профиль GitHub подтвержден")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Далее" })).toBeEnabled();

    await act(async () => {
      requests.get("linkedin")?.resolve(profile("linkedin"));
    });
    fireEvent.click(screen.getByRole("button", { name: "Да, это я" }));

    expect(screen.getAllByLabelText(/подтвержден$/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Далее" }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("shows an isolated lookup error and allows retry", async () => {
    const { lookup, requests } = createControlledLookup();
    render(<ProfileSourcesScreen lookup={lookup} onComplete={vi.fn()} />);

    submitSource("GitHub", "error");
    await act(async () => {
      requests.get("github")?.reject(new Error("Lookup unavailable"));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не удалось найти профиль. Попробуйте еще раз.",
    );
    expect(screen.getByRole("textbox", { name: "Профиль GitHub" })).toHaveValue(
      "error",
    );

    submitSource("GitHub", "@corrected");
    expect(screen.getByText("Ищем профиль...")).toBeInTheDocument();
  });

  it("skips immediately without requiring a confirmation", () => {
    const { lookup } = createControlledLookup();
    const onComplete = vi.fn();
    render(<ProfileSourcesScreen lookup={lookup} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole("button", { name: "Заполню позже" }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("scrolls the focused card toward the visible viewport", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const { lookup } = createControlledLookup();
    render(<ProfileSourcesScreen lookup={lookup} onComplete={vi.fn()} />);

    fireEvent.focus(screen.getByRole("textbox", { name: "Профиль Сетка" }));
    act(() => vi.runAllTimers());

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });
});
