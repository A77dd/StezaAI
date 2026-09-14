import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PROFILE_SOURCES } from "../profile-sources/profileSources.config";
import type {
  ProfileResult,
  SourceCardState,
} from "../profile-sources/profileSources.types";
import SourceProfileCard from "./SourceProfileCard";

const source = PROFILE_SOURCES.find(({ id }) => id === "github")!;
const profile: ProfileResult = {
  sourceId: "github",
  name: "Профиль разработчика",
  role: "Software Engineer · open source",
  avatarPath: "/onboarding/avatars/profile-violet.svg",
};

function renderCard(state: SourceCardState) {
  const handlers = {
    onQueryChange: vi.fn(),
    onSubmit: vi.fn(),
    onReject: vi.fn(),
    onConfirm: vi.fn(),
    onInputFocus: vi.fn(),
  };

  render(
    <SourceProfileCard source={source} state={state} {...handlers} index={0} />,
  );

  return handlers;
}

describe("SourceProfileCard", () => {
  it("submits a non-empty profile query from the idle state", () => {
    const handlers = renderCard({ status: "idle", query: "@demo" });
    const input = screen.getByRole("textbox", { name: "Профиль GitHub" });

    expect(screen.getByText(source.description)).toBeInTheDocument();
    expect(screen.getByText("GH")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button", { name: "Найти профиль GitHub" })).toBeEnabled();

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "@updated" } });
    fireEvent.submit(
      screen.getByRole("form", { name: "Поиск профиля GitHub" }),
    );

    expect(handlers.onInputFocus).toHaveBeenCalledTimes(1);
    expect(handlers.onQueryChange).toHaveBeenCalledWith("@updated");
    expect(handlers.onSubmit).toHaveBeenCalledWith("@demo");
  });

  it("shows a compact polite loading state", () => {
    renderCard({
      status: "searching",
      query: "@demo",
      requestId: "request-1",
    });

    expect(screen.getByRole("status")).toHaveTextContent("Ищем профиль...");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows a found profile and exposes both decisions", () => {
    const handlers = renderCard({ status: "found", query: "@demo", profile });

    expect(
      screen.getByRole("img", { name: `Аватар: ${profile.name}` }),
    ).toHaveAttribute("src", profile.avatarPath);
    expect(screen.getByText(profile.name)).toBeInTheDocument();
    expect(screen.getByText(profile.role)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Это не я" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, это я" }));

    expect(handlers.onReject).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
  });

  it("collapses into a confirmed summary", () => {
    renderCard({ status: "confirmed", query: "@demo", profile });

    expect(screen.getByLabelText("Профиль GitHub подтвержден")).toBeInTheDocument();
    expect(screen.getByText(profile.name)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("associates an error with its retry input", () => {
    renderCard({
      status: "error",
      query: "error",
      message: "Не удалось найти профиль.",
    });

    const input = screen.getByRole("textbox", { name: "Профиль GitHub" });
    expect(input).toHaveAccessibleDescription("Не удалось найти профиль.");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не удалось найти профиль.",
    );
  });
});
