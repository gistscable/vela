// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_ACTIVITY_STORAGE_KEY, SESSION_IDLE_EXPIRED_VALUE, SESSION_IDLE_NOTICE } from "@/lib/session";

const actions = vi.hoisted(() => ({
  expireIdleSessionAction: vi.fn(async () => ({ ok: true as const })),
  touchSessionAction: vi.fn(async () => ({ ok: true })),
  loginAction: vi.fn(async () => null),
}));
vi.mock("@/lib/actions", () => actions);

import { IdleSession } from "@/components/IdleSession";
import { LoginForm } from "@/components/AuthForms";

beforeEach(() => {
  actions.expireIdleSessionAction.mockClear().mockResolvedValue({ ok: true });
  actions.touchSessionAction.mockClear().mockResolvedValue({ ok: true });
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("IdleSession", () => {
  it("warns before the limit, then signs the member out", async () => {
    const onExpire = vi.fn();
    render(
      <IdleSession enabled idleMs={400} warningMs={250} checkMs={50} touchEveryMs={10_000} onExpire={onExpire} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(actions.touchSessionAction).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(screen.getByRole("dialog", { name: /are you still there/i })).toBeInTheDocument();
    expect(screen.getByText(/sign you out after 10 minutes of inactivity/i)).toBeInTheDocument();
    expect(onExpire).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(onExpire).toHaveBeenCalledWith(`/login?notice=${SESSION_IDLE_NOTICE}`);
    expect(actions.expireIdleSessionAction).toHaveBeenCalled();
    expect(localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY)).toBe(SESSION_IDLE_EXPIRED_VALUE);
  });

  it("lets Stay signed in reset the idle window", async () => {
    const onExpire = vi.fn();
    render(
      <IdleSession enabled idleMs={400} warningMs={250} checkMs={50} touchEveryMs={10_000} onExpire={onExpire} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const touched = actions.touchSessionAction.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stay signed in/i }));
    });
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(actions.touchSessionAction.mock.calls.length).toBeGreaterThan(touched);

    await act(async () => {
      vi.advanceTimersByTime(320);
    });
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("treats pointer activity as use, but not after the warning is showing", async () => {
    const onExpire = vi.fn();
    render(
      <IdleSession enabled idleMs={400} warningMs={250} checkMs={50} touchEveryMs={10_000} onExpire={onExpire} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    await act(async () => {
      vi.advanceTimersByTime(160);
    });
    expect(onExpire).toHaveBeenCalledWith(`/login?notice=${SESSION_IDLE_NOTICE}`);
  });

  it("does not watch a shared preview session", async () => {
    const onExpire = vi.fn();
    render(
      <IdleSession enabled={false} idleMs={100} warningMs={50} checkMs={20} onExpire={onExpire} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(onExpire).not.toHaveBeenCalled();
    expect(actions.touchSessionAction).not.toHaveBeenCalled();
    expect(actions.expireIdleSessionAction).not.toHaveBeenCalled();
  });
});

describe("idle sign-in notice", () => {
  it("explains that the previous session ended from inactivity", () => {
    vi.useRealTimers();
    render(<LoginForm notice={SESSION_IDLE_NOTICE} />);
    expect(screen.getByText("Signed out for security")).toBeInTheDocument();
    expect(screen.getByText(/signed out after 10 minutes of inactivity/i)).toBeInTheDocument();
  });
});
