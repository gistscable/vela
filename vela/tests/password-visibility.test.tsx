// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loginAction: vi.fn(async () => null),
  signupAction: vi.fn(async () => null),
  changePasswordAction: vi.fn(async () => null),
  updateProfileAction: vi.fn(async () => null),
  setUsernameAction: vi.fn(async () => null),
}));
vi.mock("@/lib/actions", () => actions);

import { LoginForm, SignupForm } from "@/components/AuthForms";
import { PasswordForm } from "@/components/SettingsForms";
import { PasswordInput } from "@/components/ui";

describe("PasswordInput", () => {
  it("is hidden by default with an accessible Show password button", () => {
    render(<PasswordInput label="Passcode" name="password" />);
    const input = screen.getByLabelText("Passcode");
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-controls", input.id);
  });

  it("toggles visibility and the accessible name without clearing what was typed", async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="Passcode" name="password" />);
    const input = screen.getByLabelText("Passcode") as HTMLInputElement;
    await user.type(input, "S3cret!pass");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input.value).toBe("S3cret!pass");
    expect(screen.queryByRole("button", { name: "Show password" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input.value).toBe("S3cret!pass");
  });

  it("does not submit the form, by mouse or keyboard", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordInput label="Passcode" name="password" />
        <button type="submit">Go</button>
      </form>,
    );
    await user.type(screen.getByLabelText("Passcode"), "abc12345");
    const toggle = screen.getByRole("button", { name: "Show password" });
    await user.click(toggle);
    toggle.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSubmit).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Passcode") as HTMLInputElement).value).toBe("abc12345");
    // The real submit button still submits, with the password intact.
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("is keyboard reachable right after the field and has a visible focus style", async () => {
    const user = userEvent.setup();
    render(<PasswordInput label="Passcode" name="password" />);
    await user.click(screen.getByLabelText("Passcode"));
    await user.tab();
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveFocus();
    expect(toggle.className).toMatch(/focus-visible:ring-2/);
  });

  it("keeps the password value submitted in the form data while visible", async () => {
    const user = userEvent.setup();
    let submitted: string | null = null;
    render(
      <form onSubmit={(e) => { e.preventDefault(); submitted = String(new FormData(e.currentTarget).get("password")); }}>
        <PasswordInput label="Passcode" name="password" />
        <button type="submit">Go</button>
      </form>,
    );
    await user.type(screen.getByLabelText("Passcode"), "visible-pass-1");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(submitted).toBe("visible-pass-1");
  });
});

describe("password fields on each form", () => {
  it("login: Username / User ID is the primary field and the passcode is hidden with a toggle", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    const username = screen.getByLabelText("Username / User ID");
    expect(username).toHaveAttribute("name", "username");
    expect(username).toHaveAttribute("type", "text");
    expect(username).toHaveAttribute("autocomplete", "username");
    expect(screen.getByText(/existing members can still sign in with their email/i)).toBeInTheDocument();

    const password = screen.getByLabelText("Passcode");
    expect(password).toHaveAttribute("type", "password");
    await user.type(password, "pw-12345678");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    expect((password as HTMLInputElement).value).toBe("pw-12345678");
    expect(actions.loginAction).not.toHaveBeenCalled();
  });

  it("enrollment: public self-enrollment is disabled — shows contact-bank card and no PII fields", async () => {
    render(<SignupForm />);
    expect(screen.getByRole("heading", { name: /Enrollment is handled by your bank/i })).toBeInTheDocument();
    expect(screen.getByText(/To open an account, contact FMB/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Username / User ID")).toBeNull();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByLabelText(/Create passcode/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Show password/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Contact Support/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Sign in/i }).length).toBeGreaterThanOrEqual(1);
    expect(actions.signupAction).not.toHaveBeenCalled();
  });

  it("password change: both fields are hidden with independently labelled toggles", async () => {
    const user = userEvent.setup();
    render(<PasswordForm />);
    const current = screen.getByLabelText("Current passcode");
    const next = screen.getByLabelText("New passcode");
    expect(current).toHaveAttribute("type", "password");
    expect(next).toHaveAttribute("type", "password");

    await user.type(current, "old-pass-123");
    await user.type(next, "new-pass-456");
    await user.click(screen.getByRole("button", { name: "Show new password" }));
    expect(next).toHaveAttribute("type", "text");
    expect(current).toHaveAttribute("type", "password");
    expect((current as HTMLInputElement).value).toBe("old-pass-123");
    expect((next as HTMLInputElement).value).toBe("new-pass-456");
    expect(screen.getByRole("button", { name: "Show current password" })).toBeInTheDocument();
    expect(actions.changePasswordAction).not.toHaveBeenCalled();
  });
});
